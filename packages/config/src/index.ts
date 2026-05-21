export const APP_NAME = 'Warehouse Inventory';

export const ROUTES = {
  auth: {
    login: '/auth/login',
    refresh: '/auth/refresh',
    logout: '/auth/logout',
    me: '/auth/me',
  },
  inventory: {
    upload: '/inventory/upload',
    current: '/inventory/current',
    history: '/inventory/history',
    detail: (id: string) => `/inventory/history/${id}`,
    approve: (id: string) => `/inventory/${id}/approve`,
    reject: (id: string) => `/inventory/${id}/reject`,
  },
  zoho: {
    sync: (id: string) => `/zoho/sync/${id}`,
  },
} as const;

export const PAGINATION = {
  defaultPageSize: 20,
  maxPageSize: 100,
} as const;
