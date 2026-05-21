import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ActionType, TransactionStatus, ZohoSyncStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { TransactionsRepository } from './repositories/transactions.repository';
import { InventoryRepository } from '../inventory/repositories/inventory.repository';
import { QueuesService } from '../queues/queues.service';
import type { AuthUser } from '../../common/decorators/current-user.decorator';
import type { ApproveTransactionDto } from './dto/approve.dto';
import type { ParsedItem } from '@warehouse/types';

/**
 * Shape accepted by toDto — list() returns rows without `comments`,
 * findById() returns rows with `comments`. Both extend the base transaction.
 */
type FullTransaction = NonNullable<Awaited<ReturnType<TransactionsRepository['findById']>>>;
type TransactionDtoSource = Omit<FullTransaction, 'comments'> & {
  comments?: FullTransaction['comments'];
};

@Injectable()
export class TransactionsService {
  private readonly logger = new Logger(TransactionsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly repo: TransactionsRepository,
    private readonly inventoryRepo: InventoryRepository,
    private readonly queues: QueuesService,
  ) {}

  /**
   * Create a PENDING transaction with parsed items snapshotted.
   * Inventory is NOT mutated yet — only after admin approval.
   */
  async createPending(params: {
    userId: string;
    actionType: ActionType;
    imageUrl: string;
    imageKey: string;
    rawOcrText: string;
    parsedItems: ParsedItem[];
  }) {
    const tx = await this.prisma.$transaction(async (db) => {
      const created = await db.inventoryTransaction.create({
        data: {
          userId: params.userId,
          actionType: params.actionType,
          status: TransactionStatus.PENDING,
          imageUrl: params.imageUrl,
          imageKey: params.imageKey,
          rawOcrText: params.rawOcrText,
          parsedJson: params.parsedItems as unknown as Prisma.InputJsonValue,
        },
      });

      for (const item of params.parsedItems) {
        const inv = await db.inventoryItem.upsert({
          where: { sku: item.sku },
          update: {},
          create: { sku: item.sku, productName: item.productName ?? item.sku, quantity: 0 },
        });
        await db.inventoryTransactionItem.create({
          data: {
            transactionId: created.id,
            inventoryItemId: inv.id,
            sku: item.sku,
            productName: item.productName ?? inv.productName,
            quantityBefore: inv.quantity,
            quantityApproved: item.quantity,
            quantityAfter: inv.quantity,
          },
        });
      }
      return created;
    });

    return this.getById(tx.id);
  }

  async getById(id: string) {
    const t = await this.repo.findById(id);
    if (!t) throw new NotFoundException('Transaction not found');
    return this.toDto(t);
  }

  async list(params: {
    page: number;
    pageSize: number;
    status?: TransactionStatus;
    actionType?: ActionType;
    user: AuthUser;
  }) {
    const [rows, total] = await this.repo.list({
      page: params.page,
      pageSize: params.pageSize,
      status: params.status,
      actionType: params.actionType,
      userId: params.user.role === 'ADMIN' ? undefined : params.user.id,
    });
    return {
      data: rows.map((r) => this.toDto(r)),
      page: params.page,
      pageSize: params.pageSize,
      total,
    };
  }

  /**
   * Approve: applies inventory delta atomically (with negative-stock guard for REMOVE),
   * writes the audit comment, then enqueues Zoho sync.
   */
  async approve(id: string, admin: AuthUser, dto: ApproveTransactionDto) {
    if (admin.role !== 'ADMIN') throw new ForbiddenException('Admin only');

    const existing = await this.prisma.inventoryTransaction.findUnique({
      where: { id },
      include: { items: true },
    });
    if (!existing) throw new NotFoundException('Transaction not found');
    if (existing.status !== TransactionStatus.PENDING) {
      throw new BadRequestException(`Cannot approve a ${existing.status} transaction`);
    }

    // Map admin-supplied approved quantities back to the original items by SKU.
    const approvedBySku = new Map(dto.items.map((i) => [i.sku, i.quantityApproved]));

    await this.prisma.$transaction(async (db) => {
      for (const item of existing.items) {
        const approvedQty = approvedBySku.get(item.sku) ?? item.quantityApproved;
        const delta = existing.actionType === ActionType.ADD ? approvedQty : -approvedQty;

        if (!item.inventoryItemId) continue;
        const inv = await db.inventoryItem.findUnique({ where: { id: item.inventoryItemId } });
        if (!inv) continue;

        const nextQty = inv.quantity + delta;
        if (nextQty < 0) {
          throw new BadRequestException(
            `Approving would drive ${item.sku} negative (current ${inv.quantity}, removing ${approvedQty})`,
          );
        }

        await db.inventoryItem.update({
          where: { id: inv.id },
          data: { quantity: nextQty },
        });
        await db.inventoryTransactionItem.update({
          where: { id: item.id },
          data: { quantityApproved: approvedQty, quantityAfter: nextQty, quantityBefore: inv.quantity },
        });
      }

      await db.inventoryTransaction.update({
        where: { id },
        data: {
          status: TransactionStatus.APPROVED,
          approvedByUserId: admin.id,
          approvedAt: new Date(),
          zohoSyncStatus: ZohoSyncStatus.PENDING,
          notes: dto.note ?? existing.notes,
        },
      });

      if (dto.note) {
        await db.approvalComment.create({
          data: { transactionId: id, userId: admin.id, comment: dto.note },
        });
      }
    });

    // Fire-and-forget Zoho sync via queue (retries handled by BullMQ).
    await this.queues.enqueueZohoSync(id);

    return this.getById(id);
  }

  async reject(id: string, admin: AuthUser, reason: string) {
    if (admin.role !== 'ADMIN') throw new ForbiddenException('Admin only');
    const existing = await this.prisma.inventoryTransaction.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Transaction not found');
    if (existing.status !== TransactionStatus.PENDING) {
      throw new BadRequestException(`Cannot reject a ${existing.status} transaction`);
    }
    await this.prisma.inventoryTransaction.update({
      where: { id },
      data: {
        status: TransactionStatus.REJECTED,
        approvedByUserId: admin.id,
        approvedAt: new Date(),
        rejectionReason: reason,
      },
    });
    await this.prisma.approvalComment.create({
      data: { transactionId: id, userId: admin.id, comment: `Rejected: ${reason}` },
    });
    return this.getById(id);
  }

  private toDto(t: TransactionDtoSource | null) {
    if (!t) throw new NotFoundException();
    const parsed = (t.parsedJson as unknown as ParsedItem[]) ?? [];
    return {
      id: t.id,
      userId: t.userId,
      username: t.user.username,
      actionType: t.actionType,
      status: t.status,
      imageUrl: t.imageUrl,
      rawOcrText: t.rawOcrText,
      parsedItems: parsed,
      approvedByUserId: t.approvedByUserId,
      approvedByUsername: t.approvedBy?.username ?? null,
      approvedAt: t.approvedAt?.toISOString() ?? null,
      rejectionReason: t.rejectionReason,
      notes: t.notes,
      zohoSyncStatus: t.zohoSyncStatus,
      zohoSyncError: t.zohoSyncError,
      items: t.items.map((it) => ({
        id: it.id,
        sku: it.sku,
        productName: it.productName,
        quantityBefore: it.quantityBefore,
        quantityApproved: it.quantityApproved,
        quantityAfter: it.quantityAfter,
      })),
      comments: (t.comments ?? []).map((c) => ({
        id: c.id,
        userId: c.userId,
        username: c.user.username,
        comment: c.comment,
        createdAt: c.createdAt.toISOString(),
      })),
      createdAt: t.createdAt.toISOString(),
      updatedAt: t.updatedAt.toISOString(),
    };
  }
}
