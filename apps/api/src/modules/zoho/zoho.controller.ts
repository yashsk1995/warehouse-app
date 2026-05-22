import { Controller, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { ZohoInventoryService } from './zoho-inventory.service';

@ApiTags('Zoho')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
@Controller({ path: 'zoho', version: '1' })
export class ZohoController {
  constructor(private readonly zoho: ZohoInventoryService) {}

  @Post('sync/:id')
  async sync(@Param('id') id: string) {
    await this.zoho.syncTransaction(id);
    return { ok: true };
  }

  /**
   * Pull all Zoho items into the local catalog. Useful once at setup and
   * any time SKUs are added directly in Zoho. Safe to re-run — upsert by SKU.
   */
  @Post('sync-catalog')
  async syncCatalog() {
    const result = await this.zoho.syncCatalog();
    return { ok: true, ...result };
  }
}
