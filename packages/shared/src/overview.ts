import type { PersonaMindMode } from './mind.js';
import type { ChatChannelStatus } from './types.js';

export type OverviewEventKind =
  | 'RELATION'
  | 'GROUP'
  | 'SELF'
  | 'MOOD'
  | 'LONG_EVENT'
  | 'INTENTION'
  | 'LEARNING'
  | 'CLOSURE'
  | 'JOURNAL';

export type OverviewEventTone = 'brass' | 'jade' | 'signal' | 'mist';

export type OverviewAttentionKind =
  'CHANNEL_ERROR' | 'NO_PERSONA' | 'NO_PROVIDER' | 'PENDING_ACTIONS' | 'RUN_FAILED';

export type OverviewSeverity = 'high' | 'medium' | 'low';

/** Client-side route target for an overview card or event. */
export interface OverviewLink {
  page: '/mind' | '/direct' | '/insights' | '/connections' | '/settings';
  channelId?: string;
  tab?: string;
  days?: number;
}

export interface OverviewPersona {
  id: string;
  name: string;
  accent: 'brass' | 'jade';
}

export interface OverviewChannelMind {
  mode: PersonaMindMode;
  heartbeatEnabled: boolean;
  proactiveEnabled: boolean;
}

export interface OverviewChannelState {
  activity: string;
  activitySince: string | null;
  location: string;
  energy: number;
  moodValence: number;
  socialBattery: number;
  stress: number;
  nextWakeAt: string | null;
  lastHeartbeatAt: string | null;
}

export interface OverviewChannelFocus {
  kind: 'CHAT' | 'PHONE';
  goal: string;
  startedAt: string;
}

export interface OverviewChannelStats {
  incoming: number;
  outgoing: number;
  conversations: number;
  pendingActions: number;
}

export interface OverviewChannel {
  id: string;
  displayName: string;
  accountId: string;
  avatarUrl: string | null;
  status: ChatChannelStatus;
  lastError: string | null;
  persona: OverviewPersona | null;
  mind: OverviewChannelMind | null;
  state: OverviewChannelState | null;
  focus: OverviewChannelFocus | null;
  /** Rolling 24-hour counts. */
  stats: OverviewChannelStats;
}

export interface OverviewEvent {
  id: string;
  kind: OverviewEventKind;
  tone: OverviewEventTone;
  occurredAt: string;
  title: string;
  detail: string;
  channelId: string;
  channelName: string;
  personaName: string | null;
  link: OverviewLink | null;
}

export interface OverviewAttention {
  id: string;
  kind: OverviewAttentionKind;
  severity: OverviewSeverity;
  title: string;
  detail: string;
  link: OverviewLink | null;
}

export interface OverviewHealth {
  channelsOnline: number;
  channelsTotal: number;
  /** LIVE mode only. */
  mindsLive: number;
  /** Any mode other than OFF. */
  mindsActive: number;
  pendingActions: number;
  providerCount: number;
  lastHeartbeatAt: string | null;
}

/** One screen of current state plus the last 24 hours of meaningful events. */
export interface OverviewSnapshot {
  generatedAt: string;
  health: OverviewHealth;
  channels: OverviewChannel[];
  events: OverviewEvent[];
  attention: OverviewAttention[];
}
