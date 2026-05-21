import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

export class ApproveItemDto {
  @ApiProperty()
  @IsString()
  sku!: string;

  @ApiProperty({ minimum: 0 })
  @IsInt()
  @Min(0)
  quantityApproved!: number;
}

export class ApproveTransactionDto {
  @ApiProperty({ type: [ApproveItemDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => ApproveItemDto)
  items!: ApproveItemDto[];

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string;
}

export class RejectTransactionDto {
  @ApiProperty()
  @IsString()
  @MaxLength(1000)
  reason!: string;
}
