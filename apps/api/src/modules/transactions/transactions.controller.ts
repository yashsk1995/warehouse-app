import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ActionType, TransactionStatus } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser, AuthUser } from '../../common/decorators/current-user.decorator';
import { TransactionsService } from './transactions.service';
import { ApproveTransactionDto, RejectTransactionDto } from './dto/approve.dto';

@ApiTags('Inventory History')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller({ path: 'inventory', version: '1' })
export class TransactionsController {
  constructor(private readonly txs: TransactionsService) {}

  @Get('history')
  history(
    @CurrentUser() user: AuthUser,
    @Query('status') status?: TransactionStatus,
    @Query('actionType') actionType?: ActionType,
    @Query('page') page = 1,
    @Query('pageSize') pageSize = 20,
  ) {
    return this.txs.list({
      page: Number(page) || 1,
      pageSize: Math.min(Number(pageSize) || 20, 100),
      status,
      actionType,
      user,
    });
  }

  @Get('history/:id')
  detail(@Param('id') id: string) {
    return this.txs.getById(id);
  }

  @Roles('ADMIN')
  @Post(':id/approve')
  approve(@Param('id') id: string, @CurrentUser() user: AuthUser, @Body() dto: ApproveTransactionDto) {
    return this.txs.approve(id, user, dto);
  }

  @Roles('ADMIN')
  @Post(':id/reject')
  reject(@Param('id') id: string, @CurrentUser() user: AuthUser, @Body() dto: RejectTransactionDto) {
    return this.txs.reject(id, user, dto.reason);
  }
}
