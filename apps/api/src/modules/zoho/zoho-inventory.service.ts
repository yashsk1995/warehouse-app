import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosInstance } from 'axios';
import { ActionType, ZohoSyncStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

interface ZohoItem {
  item_id: string;
  sku: string;
  name: string;
  stock_on_hand: number;
}

/**
 * ZohoInventoryService — handles OAuth, item lookup, and stock adjustments
 * for the Zoho Inventory API. Token refresh is automatic and cached in-process.
 */
@Injectable()
export class ZohoInventoryService {
  private readonly logger = new Logger(ZohoInventoryService.name);
  private readonly http: AxiosInstance;
  private accessToken: string | null = null;
  private accessTokenExpiresAt = 0;

  constructor(
    private readonly cfg: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    this.http = axios.create({
      baseURL: this.cfg.get<string>('ZOHO_API_BASE') ?? 'https://www.zohoapis.in/inventory/v1',
      timeout: 15000,
    });
  }

  /** Exchanges the long-lived refresh token for a short-lived access token. */
  async authenticate(): Promise<string> {
    const refresh = this.cfg.get<string>('ZOHO_REFRESH_TOKEN');
    const clientId = this.cfg.get<string>('ZOHO_CLIENT_ID');
    const clientSecret = this.cfg.get<string>('ZOHO_CLIENT_SECRET');
    const accountsBase = this.cfg.get<string>('ZOHO_ACCOUNTS_BASE') ?? 'https://accounts.zoho.in';
    if (!refresh || !clientId || !clientSecret) {
      throw new Error('Zoho credentials are not configured');
    }
    const { data } = await axios.post(`${accountsBase}/oauth/v2/token`, null, {
      params: {
        refresh_token: refresh,
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: 'refresh_token',
      },
    });
    this.accessToken = data.access_token as string;
    // Subtract 60s to avoid using a token right at expiry.
    this.accessTokenExpiresAt = Date.now() + (Number(data.expires_in) - 60) * 1000;
    return this.accessToken;
  }

  async refreshToken(): Promise<string> {
    return this.authenticate();
  }

  private async getToken(): Promise<string> {
    if (!this.accessToken || Date.now() >= this.accessTokenExpiresAt) {
      await this.authenticate();
    }
    return this.accessToken!;
  }

  private async authHeaders() {
    const token = await this.getToken();
    return {
      Authorization: `Zoho-oauthtoken ${token}`,
    };
  }

  private orgParams() {
    return { organization_id: this.cfg.get<string>('ZOHO_ORGANIZATION_ID') };
  }

  async getItemBySKU(sku: string): Promise<ZohoItem | null> {
    const { data } = await this.http.get('/items', {
      headers: await this.authHeaders(),
      params: { ...this.orgParams(), sku },
    });
    const items: ZohoItem[] = data.items ?? [];
    return items.find((i) => i.sku === sku) ?? items[0] ?? null;
  }

  /**
   * Update stock-on-hand by absolute value via an inventory adjustment.
   * Zoho's "inventoryadjustments" endpoint takes a delta per item.
   */
  async updateInventory(itemId: string, delta: number, reason: string): Promise<unknown> {
    const { data } = await this.http.post(
      '/inventoryadjustments',
      {
        date: new Date().toISOString().slice(0, 10),
        reason,
        adjustment_type: 'quantity',
        line_items: [{ item_id: itemId, quantity_adjusted: delta }],
      },
      { headers: await this.authHeaders(), params: this.orgParams() },
    );
    return data;
  }

  /**
   * Sync a fully approved transaction to Zoho:
   * - look up each item by SKU
   * - apply the signed delta per line
   * - log request/response in zoho_sync_logs
   * - mark transaction sync status
   */
  async syncTransaction(transactionId: string): Promise<void> {
    const tx = await this.prisma.inventoryTransaction.findUnique({
      where: { id: transactionId },
      include: { items: true },
    });
    if (!tx) throw new Error(`Transaction ${transactionId} not found`);
    if (tx.status !== 'APPROVED') {
      throw new Error(`Cannot sync ${tx.status} transaction`);
    }

    const requestPayload: unknown[] = [];
    const responsePayload: unknown[] = [];

    try {
      for (const item of tx.items) {
        const zohoItem = await this.getItemBySKU(item.sku);
        if (!zohoItem) {
          this.logger.warn(`Zoho item not found for SKU ${item.sku} — skipping`);
          continue;
        }
        const delta = tx.actionType === ActionType.ADD ? item.quantityApproved : -item.quantityApproved;
        const req = { sku: item.sku, item_id: zohoItem.item_id, delta };
        requestPayload.push(req);
        // Zoho enforces a 50-char limit on adjustment reason.
        const shortId = tx.id.slice(-12);
        const res = await this.updateInventory(
          zohoItem.item_id,
          delta,
          `WH ${tx.actionType} #${shortId}`,
        );
        responsePayload.push(res);
      }

      await this.prisma.$transaction([
        this.prisma.inventoryTransaction.update({
          where: { id: tx.id },
          data: {
            zohoSyncStatus: ZohoSyncStatus.SUCCESS,
            zohoSyncError: null,
            zohoSyncedAt: new Date(),
          },
        }),
        this.prisma.zohoSyncLog.create({
          data: {
            transactionId: tx.id,
            requestPayload: requestPayload as Prisma.InputJsonValue,
            responsePayload: responsePayload as Prisma.InputJsonValue,
            status: ZohoSyncStatus.SUCCESS,
          },
        }),
      ]);
    } catch (err) {
      // Capture axios response body (Zoho returns details like
      // {"code":36004,"message":"..."}) so failures are diagnosable.
      const axiosErr = err as { response?: { data?: unknown; status?: number }; message?: string };
      const responseBody = axiosErr?.response?.data;
      if (responseBody) responsePayload.push(responseBody);
      const detail =
        responseBody && typeof responseBody === 'object'
          ? JSON.stringify(responseBody)
          : axiosErr?.message ?? String(err);
      const message = `[${axiosErr?.response?.status ?? '?'}] ${detail}`;
      this.logger.error(`Zoho sync failed for ${tx.id}: ${message}`);
      await this.prisma.$transaction([
        this.prisma.inventoryTransaction.update({
          where: { id: tx.id },
          data: { zohoSyncStatus: ZohoSyncStatus.FAILED, zohoSyncError: message.slice(0, 2000) },
        }),
        this.prisma.zohoSyncLog.create({
          data: {
            transactionId: tx.id,
            requestPayload: requestPayload as Prisma.InputJsonValue,
            responsePayload: responsePayload as Prisma.InputJsonValue,
            status: ZohoSyncStatus.FAILED,
            error: message.slice(0, 2000),
          },
        }),
      ]);
      throw err; // let BullMQ retry
    }
  }
}
