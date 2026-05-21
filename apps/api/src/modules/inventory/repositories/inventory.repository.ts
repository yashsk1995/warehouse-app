import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';

@Injectable()
export class InventoryRepository {
  constructor(private readonly prisma: PrismaService) {}

  findBySku(sku: string) {
    return this.prisma.inventoryItem.findUnique({ where: { sku } });
  }

  findAll(params: { search?: string; page: number; pageSize: number }) {
    const where: Prisma.InventoryItemWhereInput = params.search
      ? {
          OR: [
            { sku: { contains: params.search } },
            { productName: { contains: params.search } },
          ],
        }
      : {};
    return this.prisma.$transaction([
      this.prisma.inventoryItem.findMany({
        where,
        orderBy: { updatedAt: 'desc' },
        skip: (params.page - 1) * params.pageSize,
        take: params.pageSize,
      }),
      this.prisma.inventoryItem.count({ where }),
    ]);
  }

  upsertBySku(sku: string, productName: string | null) {
    return this.prisma.inventoryItem.upsert({
      where: { sku },
      update: productName ? { productName } : {},
      create: { sku, productName: productName ?? sku, quantity: 0 },
    });
  }

  adjustQuantity(id: string, delta: number, tx?: Prisma.TransactionClient) {
    const client = tx ?? this.prisma;
    return client.inventoryItem.update({
      where: { id },
      data: { quantity: { increment: delta } },
    });
  }
}
