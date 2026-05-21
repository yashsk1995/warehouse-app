# Warehouse Inventory

Production-ready mobile inventory system for warehouses.

- Workers photograph **handwritten** stock sheets from their phone
- OCR (OpenAI Vision) extracts the text, an AI parser normalises it into SKUs + quantities
- Each upload becomes a **PENDING transaction** — inventory is **never** updated automatically
- An admin reviews, optionally edits quantities, then **Approves** or **Rejects**
- On approval: local Prisma/MySQL inventory is updated **atomically** with a negative-stock guard, then a BullMQ job syncs the delta to **Zoho Inventory**
- Every step is fully audit-logged (who, when, what, raw OCR, parsed JSON, deltas, Zoho payloads)

## Stack

| Layer       | Tech                                                                       |
| ----------- | -------------------------------------------------------------------------- |
| Mobile      | React Native + Expo + Expo Router + TanStack Query + Zustand + RN Paper    |
| Backend     | NestJS + TypeScript + Prisma + MySQL (AWS RDS) + BullMQ + Pino             |
| OCR / AI    | OpenAI Vision (`gpt-4o`) for OCR, `gpt-4o-mini` for parsing (JSON mode)    |
| Storage     | **Strategy pattern**: LocalStorage in dev (`ENV_DEV=true`), S3 in prod     |
| Queues      | BullMQ (Redis) — Zoho sync retries, image post-processing                  |
| Auth        | JWT access (15m) + opaque rotating refresh token (sha256 hashed in DB)     |
| Deploy      | Docker / Docker Compose / PM2 cluster mode                                 |

## Monorepo layout

```
warehouse-app/
├── apps/
│   ├── api/           # NestJS API (Prisma, OCR, AI, Zoho, BullMQ)
│   └── mobile/        # Expo / React Native app
├── packages/
│   ├── types/         # Shared Zod schemas + DTO types
│   └── config/        # Shared route constants
├── docker-compose.yml
└── .env.example
```

## Local development

```bash
# 1. Install (pnpm workspace)
pnpm install

# 2. Boot MySQL + Redis
docker compose up -d mysql redis

# 3. Configure
cp .env.example .env
# fill OPENAI_API_KEY (and ZOHO_* if you want real sync)

# 4. Generate Prisma client, run migrations, seed admin/worker
pnpm --filter @warehouse/api prisma:generate
pnpm --filter @warehouse/api prisma:migrate --name init
pnpm --filter @warehouse/api prisma:seed

# 5. Start API
pnpm dev:api          # http://localhost:3000   docs: /docs

# 6. Start Expo
pnpm dev:mobile       # press 'a' for Android, 'i' for iOS

# Seed credentials:
#   admin / admin123  (role ADMIN)
#   worker / user123  (role USER)
```

> **Android emulator** reaches the host at `10.0.2.2`. To run on a physical device,
> set `apiBaseUrl` in `apps/mobile/app.json → expo.extra` to your machine's LAN IP.

## Storage strategy

Switch is automatic via `ENV_DEV`. Code only depends on the `StorageService`
interface and `STORAGE_SERVICE` injection token — never on a concrete class.

```ts
// apps/api/src/modules/storage/storage.module.ts
useFactory: (cfg, local, s3) =>
  cfg.get('ENV_DEV') === 'true' ? local : s3
```

`ENV_DEV=true` → `LocalStorageService` writes to `apps/api/uploads/` and the API
serves them at `/uploads/<key>` so the mobile app can render thumbnails.
`ENV_DEV=false` → `S3StorageService` uploads to `AWS_S3_BUCKET` and stores the
public S3 URL (swap to a signed-URL flow via `getSignedUrl` for private buckets).

## OCR + AI parsing

- **OCR** (`OcrService`): sends the image to OpenAI Vision with a strict
  "transcribe verbatim, preserve line breaks" prompt. Easy to swap for
  Google Vision / AWS Textract — implement the same return shape.
- **Parser** (`AiParserService`): structured JSON mode, temperature 0, with a
  few-shot example baked in to enforce the **"use the final total, never the
  addends"** rule:

  ```
  4FT A+B frosted - 64 pcs + 12 pcs = 76 pcs   →   { sku: "4FT A+B frosted", quantity: 76 }
  ```

  Output is validated through the shared Zod schema (`ParsedSheetSchema`),
  then de-duped by normalised SKU.

## Approval & inventory flow

1. `POST /api/v1/inventory/upload` (multipart) — worker uploads sheet
2. API compresses → stores → OCR → AI parse → creates `PENDING` transaction with
   snapshot rows in `inventory_transaction_items` (`quantityBefore` captured **now**)
3. Admin sees it in `/approvals`, can edit per-SKU `quantityApproved`, then either:
   - `POST /api/v1/inventory/:id/approve` → atomic Prisma `$transaction` applies
     `+qty` (ADD) or `-qty` (REMOVE), **rejects negative stock**, sets `quantityAfter`,
     marks `APPROVED`, marks `zohoSyncStatus = PENDING`, enqueues BullMQ Zoho job
   - `POST /api/v1/inventory/:id/reject` → marks `REJECTED` with reason
4. `ZohoSyncProcessor` runs `ZohoInventoryService.syncTransaction(id)`:
   - OAuth refresh-token exchange (cached in-process, 60s safety margin)
   - per-SKU lookup → inventory adjustment with signed delta
   - logs request/response into `zoho_sync_logs`
   - on failure, BullMQ retries (5 attempts, exponential backoff)

## Database

Prisma schema is in [apps/api/prisma/schema.prisma](apps/api/prisma/schema.prisma).
Key models:

- **User** (role: USER | ADMIN) + **RefreshToken** (sha256-hashed, rotated)
- **InventoryItem** (sku unique, current quantity, optional zoho_item_id)
- **InventoryTransaction** (status, action, image, raw OCR, parsed JSON, audit fields, zoho status)
- **InventoryTransactionItem** (quantityBefore / quantityApproved / quantityAfter)
- **ApprovalComment** (full timeline)
- **ZohoSyncLog** (full request/response/error history per attempt)

## API

OpenAPI / Swagger UI: **`http://localhost:3000/docs`**

| Method | Path                                  | Auth         |
| ------ | ------------------------------------- | ------------ |
| POST   | `/api/v1/auth/login`                  | public       |
| POST   | `/api/v1/auth/refresh`                | public       |
| POST   | `/api/v1/auth/logout`                 | public       |
| GET    | `/api/v1/auth/me`                     | bearer       |
| POST   | `/api/v1/inventory/upload`            | bearer       |
| GET    | `/api/v1/inventory/current`           | bearer       |
| GET    | `/api/v1/inventory/history`           | bearer       |
| GET    | `/api/v1/inventory/history/:id`       | bearer       |
| POST   | `/api/v1/inventory/:id/approve`       | bearer ADMIN |
| POST   | `/api/v1/inventory/:id/reject`        | bearer ADMIN |
| POST   | `/api/v1/zoho/sync/:id`               | bearer ADMIN |
| GET    | `/health`                             | public       |

## Production deployment

### Docker (single host)

```bash
docker compose up -d --build
```

Spins up `mysql`, `redis`, `api` (multi-stage Alpine build, runs
`prisma migrate deploy` on start). Mount `api_uploads` volume only if you keep
`ENV_DEV=true`; for production set `ENV_DEV=false` and configure S3.

### PM2 (bare metal / EC2)

```bash
pnpm --filter @warehouse/api build
cd apps/api
pm2 start ecosystem.config.js          # cluster mode, max instances
pm2 save && pm2 startup
```

### AWS RDS (MySQL)

Provision RDS MySQL 8.0, allow inbound from the API SG only, then set:

```
DATABASE_URL="mysql://<user>:<pass>@<rds-host>:3306/warehouse"
ENV_DEV=false
AWS_S3_BUCKET=...
```

## Security

- bcryptjs hashing (12 rounds by default), tunable via `BCRYPT_ROUNDS`
- JWT access tokens (`HS256`, 15m) + opaque refresh tokens (sha256 in DB, rotated on use)
- `RolesGuard` enforces `ADMIN`-only endpoints; `JwtAuthGuard` everywhere else
- `@nestjs/throttler` rate limit (120 req / 60s by default)
- `helmet`, CORS, request size limits, Zod + class-validator request validation
- Pino structured logs with `Authorization` / `Cookie` redaction

## Tests

```bash
pnpm --filter @warehouse/api test
```

See [apps/api/test/inventory.spec.ts](apps/api/test/inventory.spec.ts) for the
parser invariant test (always use the final total, never the addends).

## Future-ready hooks

- **Barcode / bluetooth scanners**: replace `expo-image-picker` flow on the upload
  screen with a scanner event handler — server contract unchanged.
- **Multi-warehouse**: add a `warehouseId` to `InventoryItem` + `InventoryTransaction`
  and scope the InventoryRepository queries.
- **Push**: BullMQ already runs out-of-band; add an `expo-notifications` token to `User`
  and a `notify-admin` queue triggered after `createPending`.
- **Web admin dashboard**: the same `/api/v1` endpoints + `@warehouse/types` package
  power a future Next.js admin without contract drift.
- **Offline-first upload**: queue payloads in `AsyncStorage` and drain via a focus
  effect; the API is idempotent per request and reports failures explicitly.
