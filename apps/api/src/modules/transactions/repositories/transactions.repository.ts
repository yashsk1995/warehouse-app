import { Injectable } from '@nestjs/common';
import { Prisma, TransactionStatus, ActionType } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';

@Injectable()
export class TransactionsRepository {
  constructor(private readonly prisma: PrismaService) {}

  create(data: Prisma.InventoryTransactionUncheckedCreateInput) {
    return this.prisma.inventoryTransaction.create({ data });
  }

  findById(id: string) {
    return this.prisma.inventoryTransaction.findUnique({
      where: { id },
      include: {
        user: { select: { id: true, username: true } },
        approvedBy: { select: { id: true, username: true } },
        warehouse: { select: { id: true, name: true, zohoWarehouseId: true } },
        items: true,
        comments: { include: { user: { select: { id: true, username: true } } }, orderBy: { createdAt: 'asc' } },
      },
    });
  }

  list(params: {
    page: number;
    pageSize: number;
    status?: TransactionStatus;
    actionType?: ActionType;
    userId?: string;
  }) {
    const where: Prisma.InventoryTransactionWhereInput = {
      ...(params.status && { status: params.status }),
      ...(params.actionType && { actionType: params.actionType }),
      ...(params.userId && { userId: params.userId }),
    };
    return this.prisma.$transaction([
      this.prisma.inventoryTransaction.findMany({
        where,
        include: {
          user: { select: { id: true, username: true } },
          approvedBy: { select: { id: true, username: true } },
          warehouse: { select: { id: true, name: true, zohoWarehouseId: true } },
          items: true,
        },
        orderBy: { createdAt: 'desc' },
        skip: (params.page - 1) * params.pageSize,
        take: params.pageSize,
      }),
      this.prisma.inventoryTransaction.count({ where }),
    ]);
  }
}
