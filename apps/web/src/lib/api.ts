import type {
  ApiErrorBody,
  BilibiliSettingsInput,
  BilibiliSettingsResult,
  BootstrapInput,
  BootstrapResult,
  BootstrapStatus,
  ChatChannelConnectInput,
  ChatChannelSummary,
  ChatConversationKind,
  ChatConversationSummary,
  ChatDirectConversationInput,
  ChatDirectMessageInput,
  ChatForwardDetail,
  ChatMessagePage,
  ChatMessageSummary,
  ChatSendMessageInput,
  AgentActionRecord,
  AgentIntentionRecord,
  AgentRunDetail,
  AgentRunSummary,
  AgentTodoRecord,
  AgentTodoUpdateInput,
  LlmPromptLogRecord,
  LoginInput,
  MindBannedWordsInput,
  MindBannedWordsResult,
  MindFocusOverview,
  MindHeartbeatLogRecord,
  MindInsightAskInput,
  MindInsightAskResult,
  MindInsightFeed,
  MindLearningOverview,
  MindSettingsRecord,
  MindTurnResult,
  MindSettingsUpdateInput,
  ModelProviderInput,
  PersonaChangeRecord,
  PersonaGroupStanceRecord,
  PersonaGroupStanceUpdateInput,
  PersonaJournalRecord,
  PersonaLongEventRecord,
  PersonaMemoryCreateInput,
  PersonaMemoryQueryInput,
  PersonaMemoryRecord,
  PersonaRelationshipRecord,
  PersonaRelationshipUpdateInput,
  PersonaStateRecord,
  PersonaStateUpdateInput,
  PersonaStyleNoteRecord,
  PersonaStyleNoteUpdateInput,
  PhoneConnectInput,
  PhoneDeviceList,
  PhoneDisconnectInput,
  PhonePairInput,
  PhoneSettingsResult,
  StickerRecord,
  ModelProviderSaveResult,
  OverviewSnapshot,
  PersonaAiGenerateInput,
  PersonaAiGeneration,
  PersonaAiProviderOption,
  PersonaRecord,
  PersonaSummary,
  RedisConnectionInput,
  RedisProbeResult,
  RedisSettingsInput,
  RedisSettingsResult,
  SaveChannelPersonaInput,
  SavePersonaInput,
  SettingsOverview,
  TtsSettingsInput,
  TtsSettingsResult,
  TtsTestInput,
  TtsTestResult,
  WebAllowedHostsInput,
  WebAllowedHostsResult,
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

/** Performs a credentialed JSON request and turns API error bodies into ApiError. */
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
  overview: () => request<OverviewSnapshot>('/overview'),
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
  updateBilibiliSettings: (input: BilibiliSettingsInput) =>
    request<BilibiliSettingsResult>('/settings/bilibili', {
      method: 'PUT',
      body: JSON.stringify(input),
    }),
  updateTtsSettings: (input: TtsSettingsInput) =>
    request<TtsSettingsResult>('/settings/tts', {
      method: 'PUT',
      body: JSON.stringify(input),
    }),
  testTts: (input: TtsTestInput) =>
    request<TtsTestResult>('/settings/tts/test', {
      method: 'POST',
      body: JSON.stringify(input),
    }),
  updateMindBannedWords: (input: MindBannedWordsInput) =>
    request<MindBannedWordsResult>('/settings/mind-banned-words', {
      method: 'PUT',
      body: JSON.stringify(input),
    }),
  updateWebAllowedHosts: (input: WebAllowedHostsInput) =>
    request<WebAllowedHostsResult>('/settings/web-allowed-hosts', {
      method: 'PUT',
      body: JSON.stringify(input),
    }),
  connectPhone: (input: PhoneConnectInput) =>
    request<PhoneSettingsResult>('/settings/phone/connect', {
      method: 'POST',
      body: JSON.stringify(input),
    }),
  pairPhone: (input: PhonePairInput) =>
    request<PhoneSettingsResult>('/settings/phone/pair', {
      method: 'POST',
      body: JSON.stringify(input),
    }),
  disconnectPhone: (input: PhoneDisconnectInput) =>
    request<PhoneSettingsResult>('/settings/phone/disconnect', {
      method: 'POST',
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
  deletePersona: (id: string) =>
    request<void>(`/personas/${encodeURIComponent(id)}`, { method: 'DELETE' }),
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
  saveChannelPersona: (channelId: string, input: SaveChannelPersonaInput) =>
    request<ChatChannelSummary>(`/chat/channels/${encodeURIComponent(channelId)}/persona`, {
      method: 'PUT',
      body: JSON.stringify(input),
    }),
  mindPhoneDevices: () => request<PhoneDeviceList>('/mind/phone-devices'),
  mindFocus: (personaId: string) =>
    request<MindFocusOverview>(`/mind/focus/${encodeURIComponent(personaId)}`),
  startMindPhoneFocus: (personaId: string, goal?: string) =>
    request<unknown>(`/mind/focus/${encodeURIComponent(personaId)}/phone`, {
      method: 'POST',
      body: JSON.stringify({ goal }),
    }),
  mindSettings: (channelId: string) =>
    request<MindSettingsRecord>(`/mind/settings/${encodeURIComponent(channelId)}`),
  updateMindSettings: (channelId: string, input: MindSettingsUpdateInput) =>
    request<MindSettingsRecord>(`/mind/settings/${encodeURIComponent(channelId)}`, {
      method: 'PATCH',
      body: JSON.stringify(input),
    }),
  mindState: (personaId: string) =>
    request<PersonaStateRecord>(`/mind/state/${encodeURIComponent(personaId)}`),
  updateMindState: (personaId: string, input: PersonaStateUpdateInput) =>
    request<PersonaStateRecord>(`/mind/state/${encodeURIComponent(personaId)}`, {
      method: 'PATCH',
      body: JSON.stringify(input),
    }),
  mindRelationships: (personaId: string) =>
    request<PersonaRelationshipRecord[]>(`/mind/relationships/${encodeURIComponent(personaId)}`),
  mindRelationshipByExternalId: (personaId: string, externalId: string) =>
    request<PersonaRelationshipRecord>(
      `/mind/relationships/${encodeURIComponent(personaId)}/contact/${encodeURIComponent(externalId)}`,
    ),
  updateMindRelationship: (personaId: string, input: PersonaRelationshipUpdateInput) =>
    request<PersonaRelationshipRecord>(`/mind/relationships/${encodeURIComponent(personaId)}`, {
      method: 'PATCH',
      body: JSON.stringify(input),
    }),
  mindGroupStances: (personaId: string) =>
    request<PersonaGroupStanceRecord[]>(`/mind/group-stances/${encodeURIComponent(personaId)}`),
  updateMindGroupStance: (personaId: string, input: PersonaGroupStanceUpdateInput) =>
    request<PersonaGroupStanceRecord>(`/mind/group-stances/${encodeURIComponent(personaId)}`, {
      method: 'PATCH',
      body: JSON.stringify(input),
    }),
  mindMemories: (query: PersonaMemoryQueryInput) => {
    const params = memoryQueryParams(query);
    return request<PersonaMemoryRecord[]>(`/mind/memories?${params.toString()}`);
  },
  mindMemoryCount: (query: PersonaMemoryQueryInput) => {
    const params = memoryQueryParams(query);
    return request<{ total: number }>(`/mind/memories/count?${params.toString()}`);
  },
  createMindMemory: (input: PersonaMemoryCreateInput) =>
    request<PersonaMemoryRecord>('/mind/memories', {
      method: 'POST',
      body: JSON.stringify(input),
    }),
  deleteMindMemory: (id: string) =>
    request<void>(`/mind/memories/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  mindTodos: (personaId: string) =>
    request<AgentTodoRecord[]>(`/mind/todos/${encodeURIComponent(personaId)}`),
  updateMindTodo: (id: string, input: AgentTodoUpdateInput) =>
    request<AgentTodoRecord>(`/mind/todos/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify(input),
    }),
  mindIntentions: (personaId: string) =>
    request<AgentIntentionRecord[]>(`/mind/intentions/${encodeURIComponent(personaId)}`),
  mindChanges: (
    personaId: string,
    input: { scope?: string; targetId?: string; limit?: number; offset?: number } = {},
  ) => {
    const params = new URLSearchParams({
      limit: String(input.limit ?? 50),
      offset: String(input.offset ?? 0),
    });
    if (input.scope) params.set('scope', input.scope);
    if (input.targetId) params.set('targetId', input.targetId);
    return request<PersonaChangeRecord[]>(
      `/mind/changes/${encodeURIComponent(personaId)}?${params.toString()}`,
    );
  },
  mindLongEvents: (personaId: string, limit = 20) => {
    const params = new URLSearchParams({ limit: String(limit) });
    return request<PersonaLongEventRecord[]>(
      `/mind/long-events/${encodeURIComponent(personaId)}?${params.toString()}`,
    );
  },
  mindRuns: (personaId: string, conversationId?: string, limit = 30, offset = 0) => {
    const params = new URLSearchParams({
      personaId,
      limit: String(limit),
      offset: String(offset),
    });
    if (conversationId) params.set('conversationId', conversationId);
    return request<AgentRunSummary[]>(`/mind/runs?${params.toString()}`);
  },
  mindHeartbeats: (personaId: string, limit = 60, offset = 0) => {
    const params = new URLSearchParams({ limit: String(limit), offset: String(offset) });
    return request<MindHeartbeatLogRecord[]>(
      `/mind/heartbeats/${encodeURIComponent(personaId)}?${params.toString()}`,
    );
  },
  endMindLongEvent: (personaId: string) =>
    request<unknown>(`/mind/long-events/${encodeURIComponent(personaId)}/end`, {
      method: 'POST',
    }),
  mindRun: (id: string) => request<AgentRunDetail>(`/mind/runs/${encodeURIComponent(id)}`),
  mindJournal: (personaId: string, limit = 30) => {
    const params = new URLSearchParams({ personaId, limit: String(limit) });
    return request<PersonaJournalRecord[]>(`/mind/journal?${params.toString()}`);
  },
  deleteMindJournal: (id: string) =>
    request<void>(`/mind/journal/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  mindPromptLogs: (input: { source?: string; runId?: string; limit?: number } = {}) => {
    const params = new URLSearchParams({ limit: String(input.limit ?? 100) });
    if (input.source) params.set('source', input.source);
    if (input.runId) params.set('runId', input.runId);
    return request<LlmPromptLogRecord[]>(`/mind/prompts?${params.toString()}`);
  },
  mindPendingActions: (personaId: string) =>
    request<AgentActionRecord[]>(`/mind/actions/${encodeURIComponent(personaId)}/pending`),
  approveMindAction: (id: string) =>
    request<AgentActionRecord>(`/mind/actions/${encodeURIComponent(id)}/approve`, {
      method: 'POST',
    }),
  mindHeartbeat: (personaId: string) =>
    request<boolean>(`/mind/heartbeat/${encodeURIComponent(personaId)}`, { method: 'POST' }),
  mindLearning: (personaId: string, channelId?: string, limit = 12) => {
    const params = new URLSearchParams({ limit: String(limit) });
    if (channelId) params.set('channelId', channelId);
    return request<MindLearningOverview>(
      `/mind/learning/${encodeURIComponent(personaId)}?${params.toString()}`,
    );
  },
  startMindLearning: (personaId: string) =>
    request<MindTurnResult | null>(`/mind/learning/${encodeURIComponent(personaId)}/start`, {
      method: 'POST',
    }),
  updateMindStyleNote: (id: string, input: PersonaStyleNoteUpdateInput) =>
    request<PersonaStyleNoteRecord>(`/mind/style-notes/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify(input),
    }),
  deleteMindStyleNote: (id: string) =>
    request<void>(`/mind/style-notes/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  mindInsights: (channelId: string, days: number) => {
    const params = new URLSearchParams({ channelId, days: String(days) });
    return request<MindInsightFeed>(`/insights?${params.toString()}`);
  },
  askMindInsight: (input: MindInsightAskInput) =>
    request<MindInsightAskResult>('/insights/ask', {
      method: 'POST',
      body: JSON.stringify(input),
    }),
  ensureDirectConversation: (input: ChatDirectConversationInput) =>
    request<ChatConversationSummary>('/chat/direct/conversations', {
      method: 'POST',
      body: JSON.stringify(input),
    }),
  sendDirectMessage: (conversationId: string, input: ChatDirectMessageInput) =>
    request<ChatMessageSummary>(
      `/chat/direct/conversations/${encodeURIComponent(conversationId)}/messages`,
      {
        method: 'POST',
        body: JSON.stringify(input),
      },
    ),
  mindStickers: (channelId: string) => request<StickerRecord[]>(`/mind/stickers/${channelId}`),
  mindDeleteSticker: (channelId: string, id: string) =>
    request<void>(`/mind/stickers/${encodeURIComponent(channelId)}/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    }),
};

/** Builds the memory list query string, omitting inactive filters and defaulting the page size. */
function memoryQueryParams(query: PersonaMemoryQueryInput): URLSearchParams {
  const params = new URLSearchParams({
    personaId: query.personaId,
    limit: String(query.limit ?? 40),
  });
  if (query.query) params.set('query', query.query);
  if (query.scope) params.set('scope', query.scope);
  if (query.kind) params.set('kind', query.kind);
  if (query.sourceType) params.set('sourceType', query.sourceType);
  if (query.subjectType) params.set('subjectType', query.subjectType);
  if (query.includeDeleted) params.set('includeDeleted', 'true');
  if (query.offset) params.set('offset', String(query.offset));
  return params;
}
