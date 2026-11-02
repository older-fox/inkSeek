import type {
  ApiErrorBody,
  BootstrapInput,
  BootstrapResult,
  BootstrapStatus,
  LoginInput,
  ModelProviderInput,
  ModelProviderSaveResult,
  RedisConnectionInput,
  RedisProbeResult,
  RedisSettingsInput,
  RedisSettingsResult,
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

  const body = (await response.json().catch(() => null)) as
    | (T & Partial<ApiErrorBody>)
    | null;

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
};
