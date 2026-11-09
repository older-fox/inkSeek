import { z } from 'zod';

export const mindInsightKinds = [
  'RELATIONSHIP_SHIFT',
  'CONVERSATION_COOLING',
  'STYLE_DRIFT',
] as const;
export type MindInsightKind = (typeof mindInsightKinds)[number];

export const mindInsightSeverities = ['low', 'medium', 'high'] as const;
export type MindInsightSeverity = (typeof mindInsightSeverities)[number];

export const mindInsightEvidenceSchema = z.object({
  label: z.string(),
  value: z.string(),
  at: z.string().optional(),
});
export type MindInsightEvidence = z.infer<typeof mindInsightEvidenceSchema>;

export const mindInsightMetricSchema = z.object({
  label: z.string(),
  value: z.string(),
  previous: z.string().optional(),
});
export type MindInsightMetric = z.infer<typeof mindInsightMetricSchema>;

export const mindInsightCardSchema = z.object({
  id: z.string(),
  kind: z.enum(mindInsightKinds),
  severity: z.enum(mindInsightSeverities),
  title: z.string(),
  /** Two or three operator-facing sentences built from confirmed facts. */
  summary: z.string(),
  /** One line on why the detector fired. */
  why: z.string(),
  confidence: z.number().int().min(0).max(100),
  metrics: z.array(mindInsightMetricSchema),
  evidence: z.array(mindInsightEvidenceSchema),
});
export type MindInsightCard = z.infer<typeof mindInsightCardSchema>;

export const mindInsightStatsSchema = z.object({
  messages: z.number().int(),
  incoming: z.number().int(),
  outgoing: z.number().int(),
  conversations: z.number().int(),
});
export type MindInsightStats = z.infer<typeof mindInsightStatsSchema>;

export const mindInsightUsageTriggerSchema = z.object({
  trigger: z.string(),
  runs: z.number().int(),
  tokens: z.number().int(),
});
export type MindInsightUsageTrigger = z.infer<typeof mindInsightUsageTriggerSchema>;

export const mindInsightUsageSchema = z.object({
  promptTokens: z.number().int(),
  completionTokens: z.number().int(),
  totalTokens: z.number().int(),
  runs: z.number().int(),
  averageTokens: z.number().int(),
  /** Null when the previous window had no recorded runs. */
  previousTotalTokens: z.number().int().nullable(),
  byTrigger: z.array(mindInsightUsageTriggerSchema),
});
export type MindInsightUsage = z.infer<typeof mindInsightUsageSchema>;

export const mindInsightFeedSchema = z.object({
  generatedAt: z.string(),
  windowDays: z.number().int().min(1).max(365),
  channelId: z.string(),
  personaId: z.string(),
  personaName: z.string(),
  stats: mindInsightStatsSchema,
  usage: mindInsightUsageSchema,
  cards: z.array(mindInsightCardSchema),
});
export type MindInsightFeed = z.infer<typeof mindInsightFeedSchema>;

export const mindInsightQuerySchema = z.object({
  channelId: z.string().min(1).max(64),
  days: z.coerce.number().int().min(7).max(90).default(30),
});
export type MindInsightQueryInput = z.infer<typeof mindInsightQuerySchema>;

export const mindInsightAskMessageSchema = z.object({
  role: z.enum(['user', 'assistant']),
  text: z.string().min(1).max(1200),
});

export const mindInsightAskSchema = z.object({
  channelId: z.string().min(1).max(64),
  days: z.coerce.number().int().min(7).max(90).default(30),
  cardId: z.string().min(1).max(240),
  question: z.string().trim().min(1).max(500),
  history: z.array(mindInsightAskMessageSchema).max(8).default([]),
});
export type MindInsightAskInput = z.infer<typeof mindInsightAskSchema>;

export const mindInsightAskResultSchema = z.object({
  answer: z.string(),
  model: z.string().nullable(),
  citations: z.array(mindInsightEvidenceSchema),
});
export type MindInsightAskResult = z.infer<typeof mindInsightAskResultSchema>;
