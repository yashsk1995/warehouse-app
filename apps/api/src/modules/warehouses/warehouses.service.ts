import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class WarehousesService {
  constructor(private readonly prisma: PrismaService) {}

  async listActive() {
    const rows = await this.prisma.warehouse.findMany({
      where: { isActive: true },
      orderBy: [{ isPrimary: 'desc' }, { name: 'asc' }],
      select: {
        id: true,
        zohoWarehouseId: true,
        name: true,
        address: true,
        isPrimary: true,
      },
    });
    return rows;
  }

  findById(id: string) {
    return this.prisma.warehouse.findUnique({ where: { id } });
  }
}
