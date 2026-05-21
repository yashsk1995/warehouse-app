# Architecture

```
                 ┌────────────────────────┐
   ┌──── Camera ─►│  Expo Mobile (RN)     │── JWT ──┐
   └──── Gallery ─►│  Zustand + RQ + Paper│         │
                  └────────────┬───────────┘         │
                               │ multipart           │
                               ▼                     │
                ┌─────────────────────────────┐      │
                │  NestJS API   /api/v1        │◄─────┘
                │                              │
                │  AuthModule  (JWT + refresh) │
                │  UploadModule (multer)       │──► StorageService ──► Local | S3
                │     │                        │
                │     ▼                        │
                │  OcrService  (OpenAI Vision) │
                │  AiParserService (JSON mode) │
                │     │                        │
                │     ▼                        │
                │  TransactionsService         │── creates PENDING ──► Prisma/MySQL
                │     │                        │
                │     ▼ (admin approves)       │
                │  Atomic $transaction         │── updates InventoryItem ──► MySQL
                │     │                        │
                │     ▼                        │
                │  QueuesService.enqueueZohoSync
                └─────────────┬────────────────┘
                              │
                              ▼
                ┌──────────── BullMQ / Redis ─────────────┐
                │ ZohoSyncProcessor (5 attempts, exp BO)  │
                │   → ZohoInventoryService                │
                │       → /oauth/v2/token (refresh)       │
                │       → /items?sku=                     │
                │       → /inventoryadjustments           │
                │   → ZohoSyncLog row (req/res/err)       │
                └────────────────────────────────────────┘
```

## Why a strategy-pattern StorageService?

The mobile app needs to render the uploaded image both during admin review and
later in the history view. In dev, fetching S3 URLs is friction (signed URLs,
credentials on dev laptops). The interface lets us swap based on a single env
flag and keeps the rest of the codebase identical:

```ts
constructor(@Inject(STORAGE_SERVICE) private storage: StorageService) {}
```

The DI container wires `LocalStorageService` (writes to `./uploads`, served via
`/uploads/<key>`) or `S3StorageService` (`PutObject` + public URL) based on
`ENV_DEV`. Adding a third backend (e.g. GCS) is a new class + one factory branch.

## Why approval gating?

Inventory is the source of truth for downstream Zoho. We never let a single OCR
or AI mistake corrupt it. The transaction sits in `PENDING`, the admin can edit
each per-SKU quantity, and only then does inventory move — atomically, with a
negative-stock guard. The before/approved/after snapshot is preserved on the
transaction items forever, which is how we get auditability for free.

## Why BullMQ for Zoho?

Zoho's API has rate limits, transient 5xx, and OAuth tokens that need refresh.
Doing the sync inline would either slow approvals or silently lose updates on
failure. BullMQ gives us: durable retries with exponential backoff, observability
via `zoho_sync_logs`, and a clean place to add more async work (notifications,
image post-processing) without bloating request handlers.
