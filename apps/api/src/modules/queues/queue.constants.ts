export const QUEUE_NAMES = {
  ZOHO_SYNC: 'zoho-sync',
  IMAGE_OPTIMIZE: 'image-optimize',
  ZOHO_CATALOG_SYNC: 'zoho-catalog-sync',
} as const;

export const JOB_NAMES = {
  ZOHO_SYNC_TRANSACTION: 'zoho-sync-transaction',
  IMAGE_OPTIMIZE: 'image-optimize',
  ZOHO_CATALOG_SYNC: 'zoho-catalog-sync',
} as const;

// Every 30 minutes — minute 0 and 30 of every hour.
export const ZOHO_CATALOG_CRON = '0,30 * * * *';
