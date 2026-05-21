export const UserRole = {
  USER: 'USER',
  ADMIN: 'ADMIN',
} as const;
export type UserRole = (typeof UserRole)[keyof typeof UserRole];

export const ActionType = {
  ADD: 'ADD',
  REMOVE: 'REMOVE',
} as const;
export type ActionType = (typeof ActionType)[keyof typeof ActionType];

export const TransactionStatus = {
  PENDING: 'PENDING',
  APPROVED: 'APPROVED',
  REJECTED: 'REJECTED',
} as const;
export type TransactionStatus = (typeof TransactionStatus)[keyof typeof TransactionStatus];

export const ZohoSyncStatus = {
  NOT_SYNCED: 'NOT_SYNCED',
  PENDING: 'PENDING',
  SUCCESS: 'SUCCESS',
  FAILED: 'FAILED',
} as const;
export type ZohoSyncStatus = (typeof ZohoSyncStatus)[keyof typeof ZohoSyncStatus];
