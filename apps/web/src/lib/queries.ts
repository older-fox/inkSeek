import { queryOptions } from '@tanstack/react-query';
import { api } from './api';

export const bootstrapStatusQuery = queryOptions({
  queryKey: ['bootstrap', 'status'],
  queryFn: api.bootstrapStatus,
  staleTime: 5 * 60_000,
});

export const meQuery = queryOptions({
  queryKey: ['auth', 'me'],
  queryFn: async () => (await api.me()).user,
  retry: false,
  staleTime: 60_000,
});

export const settingsQuery = queryOptions({
  queryKey: ['settings'],
  queryFn: api.settings,
  staleTime: 30_000,
});
