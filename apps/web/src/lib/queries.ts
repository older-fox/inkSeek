import { queryOptions } from '@tanstack/react-query';
import type { ChatConversationKind, PipelineScopeRef } from '@inkseek/shared';
import { api, type PipelineRunFilter } from './api';

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

export const chatConversationPersonaQuery = (conversationId: string) =>
  queryOptions({
    queryKey: ['chat', 'persona', conversationId],
    queryFn: () => api.chatConversationPersona(conversationId),
    staleTime: 30_000,
  });

export const pipelineGraphQuery = (ref: PipelineScopeRef) =>
  queryOptions({
    queryKey: ['pipeline', 'graph', ref.scope, ref.scopeId ?? null],
    queryFn: () => api.pipelineGraph(ref),
    staleTime: 30_000,
  });

export const pipelineRunsQuery = (filter: PipelineRunFilter) =>
  queryOptions({
    queryKey: ['pipeline', 'runs', filter.scope ?? 'all', filter.scopeId ?? null],
    queryFn: () => api.pipelineRuns(30, filter),
    staleTime: 3_000,
  });

export const pipelineRunQuery = (id: string) =>
  queryOptions({
    queryKey: ['pipeline', 'run', id],
    queryFn: () => api.pipelineRun(id),
    enabled: Boolean(id),
    staleTime: 10_000,
  });
