import { z } from 'zod';
import { ActionType, TransactionStatus, UserRole } from './enums';

export const LoginSchema = z.object({
  username: z.string().min(3).max(64),
  password: z.string().min(6).max(128),
});
export type LoginInput = z.infer<typeof LoginSchema>;

export const RefreshTokenSchema = z.object({
  refreshToken: z.string().min(10),
});
export type RefreshTokenInput = z.infer<typeof RefreshTokenSchema>;

export const ParsedItemSchema = z.object({
  sku: z.string().min(1),
  productName: z.string().optional().nullable(),
  quantity: z.number().int().nonnegative(),
  confidence: z.number().min(0).max(1).optional(),
  raw: z.string().optional(),
});
export type ParsedItem = z.infer<typeof ParsedItemSchema>;

export const ParsedSheetSchema = z.object({
  items: z.array(ParsedItemSchema),
  notes: z.string().optional(),
});
export type ParsedSheet = z.infer<typeof ParsedSheetSchema>;

export const ApproveTransactionSchema = z.object({
  items: z.array(
    z.object({
      sku: z.string().min(1),
      quantityApproved: z.number().int().nonnegative(),
    }),
  ),
  note: z.string().max(1000).optional(),
});
export type ApproveTransactionInput = z.infer<typeof ApproveTransactionSchema>;

export const RejectTransactionSchema = z.object({
  reason: z.string().min(1).max(1000),
});
export type RejectTransactionInput = z.infer<typeof RejectTransactionSchema>;

export const UploadInventorySchema = z.object({
  actionType: z.enum([ActionType.ADD, ActionType.REMOVE]),
});

export const HistoryFilterSchema = z.object({
  status: z.enum([TransactionStatus.PENDING, TransactionStatus.APPROVED, TransactionStatus.REJECTED]).optional(),
  actionType: z.enum([ActionType.ADD, ActionType.REMOVE]).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});
export type HistoryFilter = z.infer<typeof HistoryFilterSchema>;

export { UserRole };
