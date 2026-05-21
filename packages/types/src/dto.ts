import type { ActionType, TransactionStatus, UserRole, ZohoSyncStatus } from './enums';
import type { ParsedItem } from './schemas';

export interface UserDto {
  id: string;
  username: string;
  role: UserRole;
  createdAt: string;
}

export interface AuthTokensDto {
  accessToken: string;
  refreshToken: string;
  user: UserDto;
}

export interface InventoryItemDto {
  id: string;
  sku: string;
  productName: string;
  quantity: number;
  updatedAt: string;
}

export interface TransactionItemDto {
  id: string;
  sku: string;
  productName: string | null;
  quantityBefore: number;
  quantityApproved: number;
  quantityAfter: number;
}

export interface ApprovalCommentDto {
  id: string;
  userId: string;
  username: string;
  comment: string;
  createdAt: string;
}

export interface InventoryTransactionDto {
  id: string;
  userId: string;
  username: string;
  actionType: ActionType;
  status: TransactionStatus;
  imageUrl: string;
  rawOcrText: string | null;
  parsedItems: ParsedItem[];
  approvedByUserId: string | null;
  approvedByUsername: string | null;
  approvedAt: string | null;
  rejectionReason: string | null;
  notes: string | null;
  zohoSyncStatus: ZohoSyncStatus;
  zohoSyncError: string | null;
  items: TransactionItemDto[];
  comments: ApprovalCommentDto[];
  createdAt: string;
  updatedAt: string;
}

export interface PaginatedDto<T> {
  data: T[];
  page: number;
  pageSize: number;
  total: number;
}
