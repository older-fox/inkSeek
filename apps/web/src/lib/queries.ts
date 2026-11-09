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

export const overviewQuery = queryOptions({
  queryKey: ['overview'],
  queryFn: api.overview,
  staleTime: 15_000,
  refetchInterval: 30_000,
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

export const personasQuery = queryOptions({
  queryKey: ['personas'],
  queryFn: api.personas,
  staleTime: 10_000,
});

export const personaRecordQuery = (id: string) =>
  queryOptions({
    queryKey: ['personas', id],
    queryFn: () => api.persona(id),
    enabled: Boolean(id),
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

export const mindRelationshipsQuery = (personaId: string) =>
  queryOptions({
    queryKey: ['mind', 'relationships', personaId],
    queryFn: () => api.mindRelationships(personaId),
    enabled: Boolean(personaId),
    staleTime: 5_000,
  });

export const mindGroupStancesQuery = (personaId: string) =>
  queryOptions({
    queryKey: ['mind', 'group-stances', personaId],
    queryFn: () => api.mindGroupStances(personaId),
    enabled: Boolean(personaId),
    staleTime: 5_000,
  });

export const mindInsightsQuery = (channelId: string, days: number) =>
  queryOptions({
    queryKey: ['insights', channelId, days],
    queryFn: () => api.mindInsights(channelId, days),
    enabled: Boolean(channelId),
    staleTime: 30_000,
  });
