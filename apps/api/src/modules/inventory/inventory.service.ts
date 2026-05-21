import { Injectable } from '@nestjs/common';
import { InventoryRepository } from './repositories/inventory.repository';

@Injectable()
export class InventoryService {
  constructor(private readonly repo: InventoryRepository) {}

  async list(search: string | undefined, page: number, pageSize: number) {
    const [data, total] = await this.repo.findAll({ search, page, pageSize });
    return {
      data: data.map((i) => ({
        id: i.id,
        sku: i.sku,
        productName: i.productName,
        quantity: i.quantity,
        updatedAt: i.updatedAt.toISOString(),
      })),
      page,
      pageSize,
      total,
    };
  }
}
