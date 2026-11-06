import { z } from 'zod';

export const personaMindModes = ['OFF', 'SHADOW', 'APPROVAL', 'LIVE'] as const;
export const personaMemoryScopes = [
  'SELF',
  'RELATION',
  'GROUP',
  'SCENE',
  'WORLD',
  'PROCEDURE',
] as const;
export const personaMemoryKinds = [
  'EPISODE',
  'FACT',
  'PREFERENCE',
  'PROMISE',
  'BOUNDARY',
  'REFLECTION',
  'PROCEDURE',
] as const;
export const personaMemorySubjectTypes = ['PERSON', 'GROUP', 'SELF', 'WORLD', 'TOPIC'] as const;
export const personaMemoryVisibilities = ['PRIVATE', 'SCENE', 'CHANNEL', 'PUBLIC'] as const;
export const personaMemoryStatuses = ['ACTIVE', 'SUPERSEDED', 'DISPUTED', 'DELETED'] as const;
export const personaMemorySourceTypes = [
  'MESSAGE',
  'HEARTBEAT',
  'WEB',
  'ADMIN',
  'INFERENCE',
] as const;
export const agentTodoStatuses = ['PENDING', 'ACTIVE', 'DONE', 'CANCELLED'] as const;
export const agentIntentionStatuses = [
  'PENDING',
  'SENT',
  'DEFERRED',
  'EXPIRED',
  'CANCELLED',
] as const;
export const agentRunTriggers = ['MESSAGE', 'HEARTBEAT', 'PROACTIVE', 'MANUAL'] as const;
export const agentRunStatuses = ['RUNNING', 'SUCCEEDED', 'FAILED', 'SKIPPED'] as const;
export const agentStepTypes = [
  'ATTENTION',
  'RETRIEVAL',
  'APPRAISAL',
  'SOCIAL',
  'TOOL',
  'PLAN',
  'EXPRESSION',
  'WRITEBACK',
  'CONSOLIDATION',
] as const;
export const agentActionKinds = ['MESSAGE', 'STICKER', 'FACE', 'TYPING', 'MEMORY', 'TODO'] as const;
export const agentActionStatuses = ['PENDING', 'APPROVED', 'SENT', 'FAILED', 'SKIPPED'] as const;

export type PersonaMindMode = (typeof personaMindModes)[number];
export type PersonaMemoryScope = (typeof personaMemoryScopes)[number];
export type PersonaMemoryKind = (typeof personaMemoryKinds)[number];
export type PersonaMemorySubjectType = (typeof personaMemorySubjectTypes)[number];
export type PersonaMemoryVisibility = (typeof personaMemoryVisibilities)[number];
export type PersonaMemoryStatus = (typeof personaMemoryStatuses)[number];
export type PersonaMemorySourceType = (typeof personaMemorySourceTypes)[number];
export type AgentTodoStatus = (typeof agentTodoStatuses)[number];
export type AgentIntentionStatus = (typeof agentIntentionStatuses)[number];
export type AgentRunTrigger = (typeof agentRunTriggers)[number];
export type AgentRunStatus = (typeof agentRunStatuses)[number];
export type AgentStepType = (typeof agentStepTypes)[number];
export type AgentActionKind = (typeof agentActionKinds)[number];
export type AgentActionStatus = (typeof agentActionStatuses)[number];

export interface MindSettingsRecord {
  channelId: string;
  mode: PersonaMindMode;
  heartbeatEnabled: boolean;
  proactiveEnabled: boolean;
  selfScheduleEnabled: boolean;
  wakeIntervalMinutes: number;
  wakeMinMinutes: number;
  wakeMaxMinutes: number;
  quietIntervalMinutes: number;
  dailyMessageBudget: number;
  /** Model turns spent on proactive/heartbeat wakes per day; 0 = unlimited. */
  proactiveWakeDailyLimit: number;
  /** Minimum seconds between proactive/heartbeat wakes; 0 = off. */
  proactiveWakeMinGapSeconds: number;
  maxBeats: number;
  minBeatDelayMs: number;
  maxBeatDelayMs: number;
  replyAvoidSeconds: number;
  privateBurstSeconds: number;
  /** Percent chance per idle heartbeat; 0 disables everyday events. */
  lifeEventChancePercent: number;
  /** Per persona-local day cap. */
  lifeEventDailyLimit: number;
  /** Percent chance per idle heartbeat; 0 disables curiosity exploration. */
  curiosityChancePercent: number;
  /** Per persona-local day cap; 0 means unlimited. */
  curiosityDailyLimit: number;
  /** Minimum hours between self-reflection passes; 0 disables reflection. */
  reflectionIntervalHours: number;
  imageDescriptionPrompt: string;
  quietHours: unknown;
  providerId: string | null;
  model: string | null;
  updatedAt: string;
}

export interface PersonaStateRecord {
  personaId: string;
  moodValence: number;
  moodArousal: number;
  moodDominance: number;
  energy: number;
  stress: number;
  socialBattery: number;
  attention: number;
  currentActivity: string;
  activitySince: string | null;
  activityCheckedAt: string | null;
  location: string;
  sleepDebt: number;
  health: number;
  grooming: number;
  lastWakeAt: string | null;
  nextWakeAt: string | null;
  lastHeartbeatAt: string | null;
  updatedAt: string;
}

export interface PersonaRelationshipRecord {
  id: string;
  personaId: string;
  channelId: string;
  contactId: string;
  externalId: string;
  nickname: string;
  avatarUrl: string | null;
  affinity: number;
  trust: number;
  intimacy: number;
  attraction: number;
  hostility: number;
  fear: number;
  respect: number;
  obligation: number;
  dependency: number;
  possessiveness: number;
  friction: number;
  unresolvedConflict: number;
  familiarity: number;
  relationTags: unknown;
  addressHere: unknown;
  publicMask: unknown;
  boundaries: unknown;
  openPromises: unknown;
  sharedEvents: unknown;
  /** Per-person fields without a first-class column. */
  extras: unknown;
  disclosureScope: string;
  blocked: boolean;
  mutedUntil: string | null;
  lastInteractionAt: string | null;
  updatedAt: string;
}

export interface PersonaGroupStanceRecord {
  id: string;
  personaId: string;
  channelId: string;
  conversationId: string;
  externalId: string;
  name: string;
  avatarUrl: string | null;
  memberCount: number | null;
  comfort: number;
  belonging: number;
  attention: number;
  formality: number;
  speakRate: number;
  audienceRisk: number;
  role: string;
  narrative: string;
  boundaries: unknown;
  tabooTopics: unknown;
  sceneRules: string;
  mentionOnly: boolean;
  topic: string;
  phase: string;
  /** Per-group fields without a first-class column. */
  extras: unknown;
  lastReadAt: string | null;
  updatedAt: string;
}

export interface PersonaMemoryRecord {
  id: string;
  personaId: string;
  channelId: string;
  conversationId: string | null;
  scope: PersonaMemoryScope;
  kind: PersonaMemoryKind;
  subjectType: PersonaMemorySubjectType;
  subjectId: string;
  subjectName: string;
  title: string;
  content: string;
  structured: unknown;
  importance: number;
  confidence: number;
  emotionalValence: number;
  emotionalArousal: number;
  visibility: PersonaMemoryVisibility;
  status: PersonaMemoryStatus;
  occurredAt: string;
  validFrom: string | null;
  validTo: string | null;
  lastRecalledAt: string | null;
  recallCount: number;
  sourceType: PersonaMemorySourceType;
  sourceIds: string[];
  consolidatedAt: string | null;
  createdAt: string;
  updatedAt: string;
  score?: number;
}

export interface AgentTodoRecord {
  id: string;
  personaId: string;
  channelId: string;
  title: string;
  detail: string;
  kind: string;
  priority: number;
  dueAt: string | null;
  wakeCondition: unknown;
  recurrence: string | null;
  status: AgentTodoStatus;
  source: string;
  relatedContactId: string | null;
  relatedConversationId: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AgentIntentionRecord {
  id: string;
  personaId: string;
  channelId: string;
  targetType: string;
  targetId: string;
  reason: string;
  seed: string;
  need: string;
  urgency: number;
  confidence: number;
  risk: number;
  feedback: string;
  feedbackAt: string | null;
  earliestAt: string;
  expiresAt: string | null;
  status: AgentIntentionStatus;
  attempts: number;
  lastAttemptAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AgentStepRecord {
  id: string;
  type: AgentStepType;
  title: string;
  input: unknown;
  output: unknown;
  durationMs: number | null;
  error: string | null;
  createdAt: string;
}

export interface AgentActionRecord {
  id: string;
  kind: AgentActionKind;
  payload: unknown;
  status: AgentActionStatus;
  idempotencyKey: string;
  sentMessageId: string | null;
  error: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AgentRunSummary {
  id: string;
  personaId: string;
  channelId: string;
  conversationId: string | null;
  conversationName: string | null;
  /** The inbound message that triggered this run, when there was one. */
  messageId: string | null;
  /** Last inbound message text captured in the run scene, for list previews. */
  messagePreview: string | null;
  messageSender: string | null;
  trigger: AgentRunTrigger;
  mode: PersonaMindMode;
  status: AgentRunStatus;
  providerId: string | null;
  model: string | null;
  promptTokens: number | null;
  completionTokens: number | null;
  cost: number | null;
  latencyMs: number | null;
  engage: boolean | null;
  reason: string | null;
  startedAt: string;
  finishedAt: string | null;
}

export interface AgentRunSceneMessage {
  id: string;
  sender: string;
  isSelf: boolean;
  text: string;
  sentAt: string;
  /** Image descriptions that reached the planner; skipped runs may only know the count. */
  images?: string[];
  imageCount?: number;
}

export interface AgentRunScene {
  conversationId: string;
  conversationName: string | null;
  kind: string;
  messages: AgentRunSceneMessage[];
  cast?: unknown[];
}

export interface AgentRunDetail extends AgentRunSummary {
  decision: unknown;
  socialRead: unknown;
  plan: unknown;
  scene: AgentRunScene | null;
  error: string | null;
  steps: AgentStepRecord[];
  actions: AgentActionRecord[];
}

export const mindHeartbeatStatuses = [
  'RUN',
  'IDLE',
  'GATED',
  'LONG_EVENT',
  'NO_CONVERSATION',
  'REPLY_LOCK',
  'DISABLED',
  'FAILED',
] as const;

export type MindHeartbeatStatus = (typeof mindHeartbeatStatuses)[number];

export interface MindHeartbeatLogRecord {
  id: string;
  personaId: string;
  channelId: string;
  status: MindHeartbeatStatus;
  reason: string;
  mode: PersonaMindMode;
  quiet: boolean;
  dueTodos: number;
  dueIntentions: number;
  unconsolidated: number;
  lifeEvent: boolean;
  curiosity: boolean;
  reflection: boolean;
  runId: string | null;
  detail: unknown;
  createdAt: string;
}

/** One real model call made by a read-only conversation simulation. */
export interface MindSimulationPrompt {
  system: string;
  prompt: string;
  response: string;
  providerId: string | null;
  model: string | null;
  promptTokens: number;
  completionTokens: number;
  latencyMs: number;
}

export interface MindSimulationResult {
  personaId: string;
  channelId: string;
  conversationId: string;
  conversationName: string;
  mode: PersonaMindMode;
  scene: AgentRunScene;
  state: Record<string, unknown>;
  decision: { engage: boolean; reason: string; read: SocialRead };
  conversationRead: unknown;
  memories: {
    core: PersonaMemoryRecord[];
    relevant: PersonaMemoryRecord[];
    stats: { total: number; recent7d: number; lastAt: string | null };
  };
  plan: ActionPlan;
  toolCalls: {
    name: string;
    input: unknown;
    output: unknown;
    error?: string;
    durationMs: number;
  }[];
  prompts: MindSimulationPrompt[];
  providerId: string | null;
  model: string | null;
  latencyMs: number;
  promptTokens: number;
  completionTokens: number;
  /** Warnings such as "mode was OFF, ran as SHADOW". */
  notes: string[];
}

export interface PersonaJournalRecord {
  id: string;
  personaId: string;
  channelId: string;
  date: string;
  content: string;
  mood: string;
  consolidatedMemoryIds: string[];
  createdAt: string;
}

export interface StickerRecord {
  id: string;
  channelId: string;
  sha256: string;
  filePath: string;
  mimeType: string | null;
  byteSize: number;
  width: number | null;
  height: number | null;
  tags: string[];
  description: string;
  enabled: boolean;
  usageCount: number;
  lastUsedAt: string | null;
  createdAt: string;
  score?: number;
}

export interface LlmPromptLogRecord {
  id: string;
  /** Present for logs produced by a mind run, so the run trace can group them. */
  runId: string | null;
  source: string;
  providerId: string | null;
  providerName: string | null;
  model: string | null;
  system: string;
  prompt: string;
  response: string;
  imageCount: number;
  promptTokens: number | null;
  completionTokens: number | null;
  latencyMs: number | null;
  error: string | null;
  createdAt: string;
}

export interface MindPersonaSummary {
  id: string;
  channelId: string;
  cardId: string;
  name: string;
  identity: string;
  quote: string;
  accent: string;
  /** Operator-authored numeric baseline stored on the channel persona. */
  base: Record<string, number>;
}

export interface PersonaChangeRecord {
  id: string;
  personaId: string;
  /** STATE | SELF | RELATION | GROUP */
  scope: string;
  /** Contact id / conversation id; empty for STATE and SELF. */
  targetId: string;
  field: string;
  beforeValue: unknown;
  afterValue: unknown;
  delta: number | null;
  reason: string;
  source: string;
  runId: string | null;
  createdAt: string;
}

export interface PersonaLongEventRecord {
  id: string;
  personaId: string;
  kind: string;
  title: string;
  status: 'ACTIVE' | 'COMPLETED' | 'CANCELLED';
  reason: string;
  startedAt: string;
  plannedEndAt: string | null;
  endedAt: string | null;
  wakeMentions: number;
  wakeWindowMinutes: number;
  wakeKeywords: string[];
  triggerCount: number;
  lastStimulusAt: string | null;
  wakeReason: string | null;
  effects: unknown;
  createdAt: string;
  updatedAt: string;
}

export interface MindEmotion {
  label: string;
  intensity: number;
  target?: string;
}

export interface SocialRead {
  attention: number;
  desire: number;
  risk: number;
  obligation: number;
  felt: MindEmotion;
  suggestedStance: string;
  reasons: string[];
  hardConstraints: string[];
  /** A follow-up from the sender the persona just replied to, within the window. */
  activeExchange: boolean;
}

export type OutgoingBeat =
  | {
      kind: 'text';
      text: string;
      delayMs: number;
      replyTo?: string | null;
      mentions?: string[];
    }
  | { kind: 'sticker'; stickerId: string; delayMs: number }
  | { kind: 'face'; faceId: string; delayMs: number };

export interface MemoryDraft {
  kind: PersonaMemoryKind;
  scope: PersonaMemoryScope;
  subjectType: PersonaMemorySubjectType;
  subjectId?: string;
  subjectName?: string;
  title?: string;
  content: string;
  importance?: number;
  confidence?: number;
  visibility?: PersonaMemoryVisibility;
  occurredAt?: string;
  sourceIds?: string[];
  structured?: unknown;
}

export interface RelationshipSignal {
  contactId: string;
  kind: string;
  affinity?: number;
  trust?: number;
  intimacy?: number;
  attraction?: number;
  hostility?: number;
  fear?: number;
  respect?: number;
  obligation?: number;
  dependency?: number;
  possessiveness?: number;
  friction?: number;
  unresolvedConflict?: number;
  familiarity?: number;
  reason?: string;
}

export interface TodoConsent {
  /** Message that contains the invitation or proposal. */
  inviteMessageId: string;
  /** Message that contains the other side's explicit acceptance. */
  acceptMessageId: string;
  withContactId?: string;
}

export interface TodoDraft {
  title: string;
  detail?: string;
  kind?: string;
  priority?: number;
  dueAt?: string;
  wakeCondition?: unknown;
  relatedContactId?: string;
  relatedConversationId?: string;
  /** Required for persona-authored plans; omitted plans are dropped. */
  consent?: TodoConsent;
}

/** Post-turn drift of the persona's own activity and base traits. */
export interface SelfDriftSignal {
  activity?: string;
  /** Trait key -> proposed delta; the drift service enforces bounds. */
  traits?: Record<string, number>;
  reason?: string;
}

/** Post-turn drift of the persona's stance toward the current group. */
export interface GroupStanceSignal {
  comfort?: number;
  belonging?: number;
  attention?: number;
  formality?: number;
  speakRate?: number;
  audienceRisk?: number;
  topic?: string;
  reason?: string;
}

/** Agent-authored long event: sleep, focus, away, or a custom block. */
export interface LongEventDraft {
  action: 'START' | 'END';
  kind?: string;
  title?: string;
  plannedEndAt?: string;
  /** Directed mentions needed inside the window before force-waking. */
  wakeMentions?: number;
  wakeWindowMinutes?: number;
  wakeKeywords?: string[];
  reason?: string;
}

export interface IntentionDraft {
  need?: string;
  targetContactId?: string;
  reason?: string;
  seed: string;
  urgency?: number;
  confidence?: number;
  risk?: number;
  earliestAt?: string;
  expiresAt?: string;
}

export interface DialogueDecision {
  close: boolean;
  summary?: string;
  nextOpening?: string;
}

export interface ActionPlan {
  engage: boolean;
  reason: string;
  stance: string;
  beats: OutgoingBeat[];
  memoryWrites: MemoryDraft[];
  relationshipSignals: RelationshipSignal[];
  todos: TodoDraft[];
  intentions?: IntentionDraft[];
  /** Due intentions this turn actually used; only these become SENT. */
  handledIntentionIds?: string[];
  dialogue?: DialogueDecision;
  self?: SelfDriftSignal;
  groupStance?: GroupStanceSignal;
  nextWakeAt?: string;
  longEvent?: LongEventDraft;
  felt?: MindEmotion;
  shown?: string;
}

export interface MindTurnResult {
  runId: string;
  engage: boolean;
  reason: string;
  plan: ActionPlan | null;
  socialRead: SocialRead | null;
  felt: MindEmotion | null;
  shown: string | null;
  memories: PersonaMemoryRecord[];
  skipped?: boolean;
  /** True when another reply already owns the conversation window. */
  suppressed?: boolean;
  error?: string;
}

const mindScore = z.number().int().min(-100).max(100);
const mindPercent = z.number().int().min(0).max(100);

export const mindSettingsUpdateSchema = z.object({
  mode: z.enum(personaMindModes).optional(),
  heartbeatEnabled: z.boolean().optional(),
  proactiveEnabled: z.boolean().optional(),
  selfScheduleEnabled: z.boolean().optional(),
  wakeIntervalMinutes: z.number().int().min(1).max(1440).optional(),
  wakeMinMinutes: z.number().int().min(1).max(1440).optional(),
  wakeMaxMinutes: z.number().int().min(1).max(10080).optional(),
  quietIntervalMinutes: z.number().int().min(1).max(1440).optional(),
  dailyMessageBudget: z.number().int().min(0).max(500).optional(),
  proactiveWakeDailyLimit: z.number().int().min(0).max(500).optional(),
  proactiveWakeMinGapSeconds: z.number().int().min(0).max(86400).optional(),
  maxBeats: z.number().int().min(1).max(8).optional(),
  minBeatDelayMs: z.number().int().min(0).max(30_000).optional(),
  maxBeatDelayMs: z.number().int().min(0).max(60_000).optional(),
  replyAvoidSeconds: z.number().int().min(0).max(7200).optional(),
  privateBurstSeconds: z.number().int().min(0).max(30).optional(),
  lifeEventChancePercent: z.number().int().min(0).max(20).optional(),
  lifeEventDailyLimit: z.number().int().min(0).max(5).optional(),
  curiosityChancePercent: z.number().int().min(0).max(100).optional(),
  curiosityDailyLimit: z.number().int().min(0).max(500).optional(),
  reflectionIntervalHours: z.number().int().min(0).max(168).optional(),
  imageDescriptionPrompt: z.string().max(4000).optional(),
  quietHours: z.unknown().optional(),
  providerId: z.string().max(64).nullable().optional(),
  model: z.string().max(200).nullable().optional(),
});

export type MindSettingsUpdateInput = z.infer<typeof mindSettingsUpdateSchema>;

export const personaStateUpdateSchema = z.object({
  moodValence: mindScore.optional(),
  moodArousal: mindPercent.optional(),
  moodDominance: mindScore.optional(),
  energy: mindPercent.optional(),
  stress: mindPercent.optional(),
  socialBattery: mindPercent.optional(),
  attention: mindPercent.optional(),
  currentActivity: z.string().max(200).optional(),
  location: z.string().max(100).optional(),
  sleepDebt: mindPercent.optional(),
  health: mindPercent.optional(),
  grooming: mindPercent.optional(),
  nextWakeAt: z.string().datetime().nullable().optional(),
});

export type PersonaStateUpdateInput = z.infer<typeof personaStateUpdateSchema>;

export const personaRelationshipUpdateSchema = z.object({
  contactId: z.string().min(1).max(64),
  affinity: mindScore.optional(),
  trust: mindScore.optional(),
  intimacy: mindScore.optional(),
  attraction: mindScore.optional(),
  hostility: mindScore.optional(),
  fear: mindScore.optional(),
  respect: mindScore.optional(),
  obligation: mindScore.optional(),
  dependency: mindScore.optional(),
  possessiveness: mindScore.optional(),
  friction: mindScore.optional(),
  unresolvedConflict: mindScore.optional(),
  familiarity: mindScore.optional(),
  relationTags: z.unknown().optional(),
  addressHere: z.unknown().optional(),
  publicMask: z.unknown().optional(),
  boundaries: z.unknown().optional(),
  openPromises: z.unknown().optional(),
  sharedEvents: z.unknown().optional(),
  extras: z.unknown().optional(),
  disclosureScope: z.string().max(32).optional(),
  blocked: z.boolean().optional(),
  mutedUntil: z.string().datetime().nullable().optional(),
});

export type PersonaRelationshipUpdateInput = z.infer<typeof personaRelationshipUpdateSchema>;

export const personaGroupStanceUpdateSchema = z.object({
  conversationId: z.string().min(1).max(64),
  comfort: mindPercent.optional(),
  belonging: mindPercent.optional(),
  attention: mindPercent.optional(),
  formality: mindPercent.optional(),
  speakRate: mindPercent.optional(),
  audienceRisk: mindPercent.optional(),
  role: z.string().max(200).optional(),
  narrative: z.string().max(1000).optional(),
  boundaries: z.unknown().optional(),
  tabooTopics: z.unknown().optional(),
  sceneRules: z.string().max(1000).optional(),
  mentionOnly: z.boolean().optional(),
  topic: z.string().max(300).optional(),
  phase: z.string().max(100).optional(),
  extras: z.unknown().optional(),
});

export type PersonaGroupStanceUpdateInput = z.infer<typeof personaGroupStanceUpdateSchema>;

export const personaMemoryCreateSchema = z.object({
  personaId: z.string().min(1).max(64),
  conversationId: z.string().max(64).nullable().optional(),
  scope: z.enum(personaMemoryScopes).default('SCENE'),
  kind: z.enum(personaMemoryKinds).default('FACT'),
  subjectType: z.enum(personaMemorySubjectTypes).default('SELF'),
  subjectId: z.string().max(64).optional(),
  subjectName: z.string().max(120).optional(),
  title: z.string().max(200).optional(),
  content: z.string().min(1).max(8000),
  structured: z.unknown().optional(),
  importance: mindPercent.optional(),
  confidence: mindPercent.optional(),
  emotionalValence: mindScore.optional(),
  emotionalArousal: mindPercent.optional(),
  visibility: z.enum(personaMemoryVisibilities).default('SCENE'),
  occurredAt: z.string().datetime().optional(),
  sourceType: z.enum(personaMemorySourceTypes).default('ADMIN'),
  sourceIds: z.array(z.string().max(64)).max(50).optional(),
});

export type PersonaMemoryCreateInput = z.infer<typeof personaMemoryCreateSchema>;

export const personaMemoryUpdateSchema = z.object({
  conversationId: z.string().max(64).nullable().optional(),
  scope: z.enum(personaMemoryScopes).optional(),
  kind: z.enum(personaMemoryKinds).optional(),
  subjectType: z.enum(personaMemorySubjectTypes).optional(),
  subjectId: z.string().max(64).optional(),
  subjectName: z.string().max(120).optional(),
  title: z.string().max(200).optional(),
  content: z.string().min(1).max(8000).optional(),
  structured: z.unknown().optional(),
  importance: mindPercent.optional(),
  confidence: mindPercent.optional(),
  emotionalValence: mindScore.optional(),
  emotionalArousal: mindPercent.optional(),
  visibility: z.enum(personaMemoryVisibilities).optional(),
  status: z.enum(personaMemoryStatuses).optional(),
  occurredAt: z.string().datetime().optional(),
  validFrom: z.string().datetime().nullable().optional(),
  validTo: z.string().datetime().nullable().optional(),
});

export type PersonaMemoryUpdateInput = z.infer<typeof personaMemoryUpdateSchema>;

export const personaMemoryQuerySchema = z.object({
  personaId: z.string().min(1).max(64),
  query: z.string().max(2000).optional(),
  scope: z.enum(personaMemoryScopes).optional(),
  kind: z.enum(personaMemoryKinds).optional(),
  sourceType: z.enum(personaMemorySourceTypes).optional(),
  subjectType: z.enum(personaMemorySubjectTypes).optional(),
  subjectId: z.string().max(64).optional(),
  includeDeleted: z.coerce.boolean().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(40),
  offset: z.coerce.number().int().min(0).default(0),
});

export type PersonaMemoryQueryInput = z.infer<typeof personaMemoryQuerySchema>;

export const agentTodoCreateSchema = z.object({
  personaId: z.string().min(1).max(64),
  title: z.string().min(1).max(300),
  detail: z.string().max(4000).optional(),
  kind: z.string().max(40).optional(),
  priority: z.number().int().min(0).max(100).optional(),
  dueAt: z.string().datetime().nullable().optional(),
  wakeCondition: z.unknown().optional(),
  relatedContactId: z.string().max(64).optional(),
  relatedConversationId: z.string().max(64).optional(),
});

export type AgentTodoCreateInput = z.infer<typeof agentTodoCreateSchema>;

export const agentTodoUpdateSchema = z.object({
  title: z.string().min(1).max(300).optional(),
  detail: z.string().max(4000).optional(),
  kind: z.string().max(40).optional(),
  priority: z.number().int().min(0).max(100).optional(),
  dueAt: z.string().datetime().nullable().optional(),
  wakeCondition: z.unknown().optional(),
  status: z.enum(agentTodoStatuses).optional(),
});

export type AgentTodoUpdateInput = z.infer<typeof agentTodoUpdateSchema>;

export const agentIntentionCreateSchema = z.object({
  personaId: z.string().min(1).max(64),
  targetType: z.string().max(20).optional(),
  targetId: z.string().max(64).optional(),
  reason: z.string().max(2000).optional(),
  seed: z.string().max(4000).optional(),
  need: z.string().max(40).optional(),
  urgency: z.number().int().min(0).max(100).optional(),
  confidence: z.number().int().min(0).max(100).optional(),
  risk: z.number().int().min(0).max(100).optional(),
  feedback: z.string().max(2000).optional(),
  feedbackAt: z.string().datetime().nullable().optional(),
  earliestAt: z.string().datetime().optional(),
  expiresAt: z.string().datetime().nullable().optional(),
});

export type AgentIntentionCreateInput = z.infer<typeof agentIntentionCreateSchema>;

export const mindRunQuerySchema = z.object({
  personaId: z.string().min(1).max(64),
  conversationId: z.string().max(64).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(30),
  offset: z.coerce.number().int().min(0).default(0),
});

export type MindRunQueryInput = z.infer<typeof mindRunQuerySchema>;

export const mindChangeQuerySchema = z.object({
  scope: z.enum(['STATE', 'SELF', 'RELATION', 'GROUP']).optional(),
  targetId: z.string().max(64).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

export type MindChangeQueryInput = z.infer<typeof mindChangeQuerySchema>;

export const mindLongEventQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

export type MindLongEventQueryInput = z.infer<typeof mindLongEventQuerySchema>;

export const mindJournalQuerySchema = z.object({
  personaId: z.string().min(1).max(64),
  limit: z.coerce.number().int().min(1).max(100).default(30),
});

export type MindJournalQueryInput = z.infer<typeof mindJournalQuerySchema>;

export const mindHeartbeatQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(60),
  offset: z.coerce.number().int().min(0).default(0),
});

export type MindHeartbeatQueryInput = z.infer<typeof mindHeartbeatQuerySchema>;

export const mindPromptLogQuerySchema = z.object({
  source: z.string().max(80).optional(),
  runId: z.string().max(64).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

export type MindPromptLogQueryInput = z.infer<typeof mindPromptLogQuerySchema>;
