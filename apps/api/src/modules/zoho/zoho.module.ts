import { Module } from '@nestjs/common';
import { ZohoInventoryService } from './zoho-inventory.service';
import { ZohoController } from './zoho.controller';

@Module({
  controllers: [ZohoController],
  providers: [ZohoInventoryService],
  exports: [ZohoInventoryService],
})
export class ZohoModule {}
