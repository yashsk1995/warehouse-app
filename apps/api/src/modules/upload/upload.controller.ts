import {
  BadRequestException,
  Body,
  Controller,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiTags } from '@nestjs/swagger';
import { ActionType } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser, AuthUser } from '../../common/decorators/current-user.decorator';
import { UploadService } from './upload.service';

@ApiTags('Inventory')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller({ path: 'inventory', version: '1' })
export class UploadController {
  constructor(private readonly upload: UploadService) {}

  @Post('upload')
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        actionType: { type: 'string', enum: ['ADD', 'REMOVE'] },
        image: { type: 'string', format: 'binary' },
      },
    },
  })
  @UseInterceptors(FileInterceptor('image'))
  uploadSheet(
    @CurrentUser() user: AuthUser,
    @UploadedFile() file: Express.Multer.File,
    @Body('actionType') actionType: string,
  ) {
    const normalized = String(actionType ?? '').toUpperCase();
    if (normalized !== ActionType.ADD && normalized !== ActionType.REMOVE) {
      throw new BadRequestException(`actionType must be ADD or REMOVE`);
    }
    return this.upload.uploadAndProcess({
      userId: user.id,
      actionType: normalized as ActionType,
      file,
    });
  }
}
