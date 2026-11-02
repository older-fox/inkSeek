import type { ModelProviderProtocol } from './schemas.js';

export type UserRole = 'ADMIN' | 'MEMBER';

export interface AuthUser {
  id: string;
  username: string;
  displayName: string;
  role: UserRole;
  createdAt: string;
}

export interface BootstrapStatus {
  initialized: boolean;
}

export interface BootstrapResult {
  user: AuthUser;
}

export interface RedisProbeResult {
  ok: true;
  latencyMs: number;
}

export interface RedisSettings {
  host: string;
  port: number;
  db: number;
  tls: boolean;
  hasPassword: boolean;
  updatedAt: string;
}

export interface ModelProviderSummary {
  id: string;
  name: string;
  protocol: ModelProviderProtocol;
  baseUrl: string;
  keyHint: string;
  modelCount: number;
  models: string[];
  lastTestedAt: string;
  createdAt: string;
}

export interface SettingsOverview {
  redis: RedisSettings | null;
  providers: ModelProviderSummary[];
}

export interface RedisSettingsResult {
  redis: RedisSettings;
  latencyMs: number;
}

export interface ModelProviderSaveResult {
  provider: ModelProviderSummary;
  latencyMs: number;
  modelCount: number;
  models: string[];
}

export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
    fieldErrors?: Record<string, string[]>;
  };
}

export interface HealthStatus {
  status: 'ok';
  service: string;
  time: string;
}
