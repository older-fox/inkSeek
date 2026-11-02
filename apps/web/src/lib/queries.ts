import { queryOptions } from '@tanstack/react-query';
import type { ChatConversationKind } from '@inkseek/shared';
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

export const chatChannelsQuery = queryOptions({
  queryKey: ['chat', 'channels'],
  queryFn: api.chatChannels,
  staleTime: 10_000,
});

export const chatConversationsQuery = (kind: ChatConversationKind) =>
  queryOptions({
    queryKey: ['chat', 'conversations', kind],
    queryFn: () => api.chatConversations(kind),
    staleTime: 5_000,
  });

export const chatMessagesQuery = (conversationId: string) =>
  queryOptions({
    queryKey: ['chat', 'messages', conversationId],
    queryFn: () => api.chatMessages(conversationId),
    staleTime: 5_000,
  });

export const chatConversationPersonaQuery = (conversationId: string) =>
  queryOptions({
    queryKey: ['chat', 'persona', conversationId],
    queryFn: () => api.chatConversationPersona(conversationId),
    staleTime: 30_000,
  });
