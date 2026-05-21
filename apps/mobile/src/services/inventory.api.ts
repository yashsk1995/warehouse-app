import { api } from './api';
import type {
  InventoryItemDto,
  InventoryTransactionDto,
  PaginatedDto,
  ActionType,
  TransactionStatus,
} from '@warehouse/types';

export async function uploadSheet(params: {
  uri: string;
  actionType: ActionType;
  filename?: string;
}): Promise<InventoryTransactionDto> {
  const form = new FormData();
  form.append('actionType', params.actionType);
  form.append('image', {
    uri: params.uri,
    name: params.filename ?? 'sheet.jpg',
    type: 'image/jpeg',
  } as unknown as Blob);
  const { data } = await api.post<InventoryTransactionDto>('/inventory/upload', form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return data;
}

export async function getCurrentInventory(
  search?: string,
  page = 1,
  pageSize = 20,
): Promise<PaginatedDto<InventoryItemDto>> {
  const { data } = await api.get('/inventory/current', { params: { search, page, pageSize } });
  return data;
}

export async function getHistory(filters: {
  status?: TransactionStatus;
  actionType?: ActionType;
  page?: number;
  pageSize?: number;
}): Promise<PaginatedDto<InventoryTransactionDto>> {
  const { data } = await api.get('/inventory/history', { params: filters });
  return data;
}

export async function getTransaction(id: string): Promise<InventoryTransactionDto> {
  const { data } = await api.get(`/inventory/history/${id}`);
  return data;
}

export async function approveTransaction(
  id: string,
  items: { sku: string; quantityApproved: number }[],
  note?: string,
): Promise<InventoryTransactionDto> {
  const { data } = await api.post(`/inventory/${id}/approve`, { items, note });
  return data;
}

export async function rejectTransaction(id: string, reason: string): Promise<InventoryTransactionDto> {
  const { data } = await api.post(`/inventory/${id}/reject`, { reason });
  return data;
}
