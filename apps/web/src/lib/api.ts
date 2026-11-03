import type {
  ApiErrorBody,
  BootstrapInput,
  BootstrapResult,
  BootstrapStatus,
  ChatChannelConnectInput,
  ChatChannelSummary,
  ChatConversationKind,
  ChatConversationPersonaRecord,
  ChatConversationSummary,
  ChatForwardDetail,
  ChatMessagePage,
  ChatMessageSummary,
  ChatPipelineGraphSnapshot,
  ChatPipelineRunDetail,
  ChatPipelineRunSummary,
  ChatPipelineScope,
  ChatSendMessageInput,
  DebugChatPipelineRunInput,
  LoginInput,
  ModelProviderInput,
  ModelProviderSaveResult,
  PersonaAiGenerateInput,
  PersonaAiGeneration,
  PersonaAiProviderOption,
  PersonaRecord,
  PersonaSummary,
  PersonaVersionDetail,
  PipelineScopeRef,
  RedisConnectionInput,
  RedisProbeResult,
  RedisSettingsInput,
  RedisSettingsResult,
  SaveConversationPersonaInput,
  SaveChatPipelineGraphInput,
  SavePersonaInput,
  SettingsOverview,
} from '@inkseek/shared';

const API_BASE = '/api/v1';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly fieldErrors?: Record<string, string[]>,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);

  if (init.body !== undefined && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  const response = await fetch(`${API_BASE}${path}`, {
    credentials: 'include',
    ...init,
    headers,
  });

  if (response.status === 204) {
    return undefined as T;
  }

  const body = (await response.json().catch(() => null)) as (T & Partial<ApiErrorBody>) | null;

  if (!response.ok) {
    const error = body?.error;

    throw new ApiError(
      response.status,
      error?.code ?? 'UNKNOWN_ERROR',
      error?.message ?? '请求失败，请稍后重试',
      error?.fieldErrors,
    );
  }

  return body as T;
}

export const api = {
  bootstrapStatus: () => request<BootstrapStatus>('/bootstrap/status'),
  testRedis: (input: RedisConnectionInput) =>
    request<RedisProbeResult>('/bootstrap/test-redis', {
      method: 'POST',
      body: JSON.stringify(input),
    }),
  bootstrap: (input: BootstrapInput) =>
    request<BootstrapResult>('/bootstrap', {
      method: 'POST',
      body: JSON.stringify(input),
    }),
  login: (input: LoginInput) =>
    request<BootstrapResult>('/auth/login', {
      method: 'POST',
      body: JSON.stringify(input),
    }),
  me: () => request<BootstrapResult>('/auth/me'),
  logout: () => request<void>('/auth/logout', { method: 'POST' }),
  settings: () => request<SettingsOverview>('/settings'),
  updateRedisSettings: (input: RedisSettingsInput) =>
    request<RedisSettingsResult>('/settings/redis', {
      method: 'PUT',
      body: JSON.stringify(input),
    }),
  createModelProvider: (input: ModelProviderInput) =>
    request<ModelProviderSaveResult>('/settings/providers', {
      method: 'POST',
      body: JSON.stringify(input),
    }),
  retestModelProvider: (id: string) =>
    request<ModelProviderSaveResult>(`/settings/providers/${encodeURIComponent(id)}/test`, {
      method: 'POST',
    }),
  deleteModelProvider: (id: string) =>
    request<void>(`/settings/providers/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  chatChannels: () => request<ChatChannelSummary[]>('/chat/channels'),
  connectChatChannel: (input: ChatChannelConnectInput) =>
    request<ChatChannelSummary>('/chat/channels', {
      method: 'POST',
      body: JSON.stringify(input),
    }),
  deleteChatChannel: (id: string) =>
    request<void>(`/chat/channels/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  personas: () => request<PersonaSummary[]>('/personas'),
  persona: (id: string) => request<PersonaRecord>(`/personas/${encodeURIComponent(id)}`),
  personaVersion: (id: string, version: number) =>
    request<PersonaVersionDetail>(
      `/personas/${encodeURIComponent(id)}/versions/${encodeURIComponent(String(version))}`,
    ),
  createPersona: (input: SavePersonaInput) =>
    request<PersonaRecord>('/personas', {
      method: 'POST',
      body: JSON.stringify(input),
    }),
  updatePersona: (id: string, input: SavePersonaInput) =>
    request<PersonaRecord>(`/personas/${encodeURIComponent(id)}`, {
      method: 'PUT',
      body: JSON.stringify(input),
    }),
  personaAiProviders: () => request<PersonaAiProviderOption[]>('/ai/persona-providers'),
  generatePersonaDraft: (input: PersonaAiGenerateInput) =>
    request<PersonaAiGeneration>('/ai/persona-draft', {
      method: 'POST',
      body: JSON.stringify(input),
    }),
  chatConversations: (kind: ChatConversationKind) =>
    request<ChatConversationSummary[]>(`/chat/conversations?kind=${kind}`),
  chatMessages: (conversationId: string, cursor?: string, limit = 100) => {
    const params = new URLSearchParams({ limit: String(limit) });
    if (cursor) {
      params.set('cursor', cursor);
    }
    return request<ChatMessagePage>(
      `/chat/conversations/${encodeURIComponent(conversationId)}/messages?${params.toString()}`,
    );
  },
  chatForwardDetail: (messageId: string) =>
    request<ChatForwardDetail>(`/chat/messages/${encodeURIComponent(messageId)}/forward`),
  sendChatMessage: (conversationId: string, input: ChatSendMessageInput) =>
    request<ChatMessageSummary>(
      `/chat/conversations/${encodeURIComponent(conversationId)}/messages`,
      {
        method: 'POST',
        body: JSON.stringify(input),
      },
    ),
  chatConversationPersona: (conversationId: string) =>
    request<ChatConversationPersonaRecord>(
      `/chat/conversations/${encodeURIComponent(conversationId)}/persona`,
    ),
  saveChatConversationPersona: (conversationId: string, input: SaveConversationPersonaInput) =>
    request<ChatConversationPersonaRecord>(
      `/chat/conversations/${encodeURIComponent(conversationId)}/persona`,
      {
        method: 'PUT',
        body: JSON.stringify(input),
      },
    ),
  pipelineRuns: (limit = 30, filter?: PipelineRunFilter) => {
    const params = new URLSearchParams({ limit: String(limit) });
    if (filter?.graphId) {
      params.set('graphId', filter.graphId);
    }
    if (filter?.scope) {
      params.set('scope', filter.scope);
      if (filter.scopeId) {
        params.set('scopeId', filter.scopeId);
      }
    }
    return request<ChatPipelineRunSummary[]>(`/pipeline/runs?${params.toString()}`);
  },
  pipelineRun: (id: string) =>
    request<ChatPipelineRunDetail>(`/pipeline/runs/${encodeURIComponent(id)}`),
  pipelineGraph: (ref: PipelineScopeRef) => {
    const params = new URLSearchParams({ scope: ref.scope });
    if (ref.scopeId) {
      params.set('scopeId', ref.scopeId);
    }
    return request<ChatPipelineGraphSnapshot>(`/pipeline/graph?${params.toString()}`);
  },
  savePipelineGraph: (input: SaveChatPipelineGraphInput) =>
    request<ChatPipelineGraphSnapshot>('/pipeline/graph', {
      method: 'PUT',
      body: JSON.stringify(input),
    }),
  followPipelineGraph: (ref: PipelineScopeRef) =>
    request<ChatPipelineGraphSnapshot>('/pipeline/graph/follow', {
      method: 'POST',
      body: JSON.stringify(ref),
    }),
  debugPipelineRun: (input: DebugChatPipelineRunInput) =>
    request<ChatPipelineRunDetail>('/pipeline/debug-runs', {
      method: 'POST',
      body: JSON.stringify(input),
    }),
};

export interface PipelineRunFilter {
  scope?: ChatPipelineScope;
  scopeId?: string | null;
  /** Watch every namespace running this graph; used by debug mode. */
  graphId?: string | null;
}
