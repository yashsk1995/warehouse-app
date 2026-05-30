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

interface ZohoWarehouse {
  warehouse_id: string;
  warehouse_name: string;
  address?: string;
  city?: string;
  state?: string;
  country?: string;
  is_primary?: boolean;
  status?: string; // "active" or "inactive"
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
   * Pull the entire Zoho item catalog into the local inventory_items table.
   * Upserts by SKU — preserves local-only items, updates productName +
   * quantity + zohoItemId ONLY when something actually differs. This keeps
   * `updatedAt` meaningful (= "Zoho-side change last seen at") and avoids
   * pointless writes on every cron tick (~636 rows × 48 ticks/day otherwise).
   * Returns counts so the caller can show "X created, Y updated, Z unchanged".
   */
  async syncCatalog(): Promise<{
    created: number;
    updated: number;
    unchanged: number;
    skipped: number;
    total: number;
  }> {
    let page = 1;
    const perPage = 200;
    let created = 0;
    let updated = 0;
    let unchanged = 0;
    let skipped = 0;
    let total = 0;

    for (;;) {
      const { data } = await this.http.get('/items', {
        headers: await this.authHeaders(),
        params: { ...this.orgParams(), page, per_page: perPage },
      });
      const items: ZohoItem[] = data.items ?? [];
      const pageContext = data.page_context ?? {};
      if (items.length === 0) break;

      for (const it of items) {
        total++;
        if (!it.sku || !it.sku.trim()) {
          skipped++;
          continue;
        }
        const sku = it.sku.trim();
        const stock = typeof it.stock_on_hand === 'number' ? it.stock_on_hand : 0;
        const existing = await this.prisma.inventoryItem.findUnique({ where: { sku } });
        if (existing) {
          const drifted =
            existing.productName !== it.name ||
            existing.quantity !== stock ||
            existing.zohoItemId !== it.item_id;
          if (drifted) {
            await this.prisma.inventoryItem.update({
              where: { sku },
              data: { productName: it.name, quantity: stock, zohoItemId: it.item_id },
            });
            updated++;
          } else {
            unchanged++;
          }
        } else {
          await this.prisma.inventoryItem.create({
            data: { sku, productName: it.name, quantity: stock, zohoItemId: it.item_id },
          });
          created++;
        }
      }

      // Zoho paginates with page_context.has_more_page
      if (!pageContext.has_more_page) break;
      page++;
    }

    this.logger.log(
      `Catalog sync: ${total} items from Zoho — created ${created}, updated ${updated}, unchanged ${unchanged}, skipped ${skipped}`,
    );
    return { created, updated, unchanged, skipped, total };
  }

  /**
   * Refresh just the given SKUs from Zoho (single-item lookups, in parallel).
   * Used by the upload flow so quantityBefore on a new PENDING transaction is
   * never stale — even if the 30-min catalog cron hasn't fired since the last
   * Zoho-side change. Best-effort: per-SKU failures are logged, not thrown.
   */
  async refreshSkusFromZoho(
    skus: string[],
  ): Promise<{ refreshed: number; missing: string[]; failed: string[] }> {
    const unique = Array.from(new Set(skus.map((s) => s.trim()).filter(Boolean)));
    const missing: string[] = [];
    const failed: string[] = [];
    let refreshed = 0;

    await Promise.all(
      unique.map(async (sku) => {
        try {
          const zohoItem = await this.getItemBySKU(sku);
          if (!zohoItem) {
            missing.push(sku);
            return;
          }
          await this.prisma.inventoryItem.upsert({
            where: { sku },
            update: {
              productName: zohoItem.name,
              quantity: typeof zohoItem.stock_on_hand === 'number' ? zohoItem.stock_on_hand : 0,
              zohoItemId: zohoItem.item_id,
            },
            create: {
              sku,
              productName: zohoItem.name,
              quantity: typeof zohoItem.stock_on_hand === 'number' ? zohoItem.stock_on_hand : 0,
              zohoItemId: zohoItem.item_id,
            },
          });
          refreshed++;
        } catch (e) {
          this.logger.warn(`refreshSkusFromZoho failed for ${sku}: ${(e as Error).message}`);
          failed.push(sku);
        }
      }),
    );

    return { refreshed, missing, failed };
  }

  /**
   * Pull all warehouses from Zoho and upsert into local table.
   * Diff-aware: only writes when name/address/isPrimary/isActive actually changed.
   */
  async syncWarehouses(): Promise<{
    created: number;
    updated: number;
    unchanged: number;
    total: number;
  }> {
    const { data } = await this.http.get('/warehouses', {
      headers: await this.authHeaders(),
      params: this.orgParams(),
    });
    const warehouses: ZohoWarehouse[] = data.warehouses ?? [];

    let created = 0;
    let updated = 0;
    let unchanged = 0;

    for (const w of warehouses) {
      const address = [w.address, w.city, w.state, w.country].filter(Boolean).join(', ') || null;
      const isPrimary = !!w.is_primary;
      const isActive = (w.status ?? 'active').toLowerCase() === 'active';

      const existing = await this.prisma.warehouse.findUnique({
        where: { zohoWarehouseId: w.warehouse_id },
      });

      if (existing) {
        const drifted =
          existing.name !== w.warehouse_name ||
          existing.address !== address ||
          existing.isPrimary !== isPrimary ||
          existing.isActive !== isActive;
        if (drifted) {
          await this.prisma.warehouse.update({
            where: { zohoWarehouseId: w.warehouse_id },
            data: { name: w.warehouse_name, address, isPrimary, isActive },
          });
          updated++;
        } else {
          unchanged++;
        }
      } else {
        await this.prisma.warehouse.create({
          data: {
            zohoWarehouseId: w.warehouse_id,
            name: w.warehouse_name,
            address,
            isPrimary,
            isActive,
          },
        });
        created++;
      }
    }

    this.logger.log(
      `Warehouse sync: ${warehouses.length} from Zoho — created ${created}, updated ${updated}, unchanged ${unchanged}`,
    );
    return { created, updated, unchanged, total: warehouses.length };
  }

  /**
   * Update stock-on-hand by absolute value via an inventory adjustment.
   * Zoho's "inventoryadjustments" endpoint takes a delta per item.
   * Pass `warehouseId` (Zoho's internal id) to target a specific warehouse;
   * omit for the org-default warehouse.
   */
  async updateInventory(
    itemId: string,
    delta: number,
    reason: string,
    warehouseId?: string,
  ): Promise<unknown> {
    const lineItem: Record<string, unknown> = { item_id: itemId, quantity_adjusted: delta };
    if (warehouseId) lineItem.warehouse_id = warehouseId;
    const { data } = await this.http.post(
      '/inventoryadjustments',
      {
        date: new Date().toISOString().slice(0, 10),
        reason,
        adjustment_type: 'quantity',
        line_items: [lineItem],
      },
      {
        headers: await this.authHeaders(),
        params: { ...this.orgParams(), status: 'adjusted' },
      },
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
      include: { items: true, warehouse: true },
    });
    if (!tx) throw new Error(`Transaction ${transactionId} not found`);
    if (tx.status !== 'APPROVED') {
      throw new Error(`Cannot sync ${tx.status} transaction`);
    }

    const requestPayload: unknown[] = [];
    const responsePayload: unknown[] = [];
    const zohoWarehouseId = tx.warehouse?.zohoWarehouseId;

    try {
      for (const item of tx.items) {
        const zohoItem = await this.getItemBySKU(item.sku);
        if (!zohoItem) {
          this.logger.warn(`Zoho item not found for SKU ${item.sku} — skipping`);
          continue;
        }
        const delta = tx.actionType === ActionType.ADD ? item.quantityApproved : -item.quantityApproved;
        const req = {
          sku: item.sku,
          item_id: zohoItem.item_id,
          delta,
          warehouse_id: zohoWarehouseId,
        };
        requestPayload.push(req);
        // Zoho enforces a 50-char limit on adjustment reason.
        const shortId = tx.id.slice(-12);
        const res = await this.updateInventory(
          zohoItem.item_id,
          delta,
          `WH ${tx.actionType} #${shortId}`,
          zohoWarehouseId,
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
