import { z } from 'zod';

export const redisConnectionSchema = z.object({
  host: z.string().trim().min(1, '请填写 Redis 主机地址'),
  port: z.coerce
    .number()
    .int('端口必须是整数')
    .min(1, '端口范围为 1-65535')
    .max(65535, '端口范围为 1-65535')
    .default(6379),
  db: z.coerce.number().int('数据库编号必须是整数').min(0, '数据库编号不能小于 0').default(0),
  password: z.string().max(256, '密码过长').optional().or(z.literal('')),
  tls: z.boolean().default(false),
});

export const adminAccountSchema = z.object({
  username: z
    .string()
    .trim()
    .min(3, '用户名至少 3 个字符')
    .max(32, '用户名最多 32 个字符')
    .regex(/^[a-zA-Z0-9_-]+$/, '用户名仅支持字母、数字、下划线和连字符'),
  displayName: z.string().trim().max(64, '显示名称最多 64 个字符').optional().or(z.literal('')),
  password: z
    .string()
    .min(8, '密码至少 8 个字符')
    .max(72, '密码最多 72 个字符')
    .regex(/[A-Za-z]/, '密码需包含字母')
    .regex(/\d/, '密码需包含数字'),
});

export const bootstrapSchema = z.object({
  redis: redisConnectionSchema,
  admin: adminAccountSchema,
});

export const loginSchema = z.object({
  username: z.string().trim().min(1, '请输入用户名'),
  password: z.string().min(1, '请输入密码'),
});

export const redisSettingsSchema = redisConnectionSchema.extend({
  clearPassword: z.boolean().optional().default(false),
});

export const bilibiliSettingsSchema = z.object({
  sessdata: z.string().trim().max(2048, 'SESSDATA 过长').optional().or(z.literal('')),
  clearCookie: z.boolean().optional().default(false),
});

export const mindBannedWordsSchema = z.object({
  words: z
    .array(z.string().trim().min(1, '禁用词不能为空').max(60, '单条禁用词最多 60 个字符'))
    .max(500, '最多 500 条禁用词'),
});

export const toolMaxTokensSchema = z.object({
  maxTokens: z.number().int('请填写整数').min(256, '至少 256').max(200_000, '最多 200000'),
});

export const visionModelSchema = z.object({
  providerId: z.string().trim().max(64, '提供商标识过长').optional().default(''),
  model: z.string().trim().max(120, '模型名称过长').optional().default(''),
});

export const webAllowedHostsSchema = z.object({
  hosts: z
    .array(z.string().trim().min(1, '域名不能为空').max(253, '单个域名最多 253 个字符'))
    .max(100, '最多 100 个域名'),
});

export const phoneConnectSchema = z.object({
  address: z.string().trim().min(1, '请填写 IP:端口').max(120, '地址过长'),
});

export const phonePairSchema = z.object({
  address: z.string().trim().min(1, '请填写配对地址').max(120, '地址过长'),
  code: z
    .string()
    .trim()
    .regex(/^\d{6}$/, '配对码是 6 位数字'),
});

export const phoneDisconnectSchema = z.object({
  address: z.string().trim().max(120, '地址过长').optional(),
});

export const modelProviderProtocols = ['openai', 'anthropic', 'gemini'] as const;

export const modelProviderProtocolSchema = z.enum(modelProviderProtocols);

const httpUrlSchema = z
  .string()
  .trim()
  .min(1, '请填写 Base URL')
  .max(300, 'Base URL 过长')
  .refine((value) => {
    try {
      const url = new URL(value);
      return url.protocol === 'http:' || url.protocol === 'https:';
    } catch {
      return false;
    }
  }, '请输入有效的 http(s) 地址');

export const modelProviderSchema = z.object({
  name: z.string().trim().min(1, '请填写提供商名称').max(48, '名称最多 48 个字符'),
  protocol: modelProviderProtocolSchema,
  baseUrl: httpUrlSchema,
  apiKey: z.string().trim().min(1, '请填写 API Key').max(512, 'API Key 过长'),
});

export const ttsAudioFormats = ['mp3', 'wav', 'opus', 'aac', 'flac'] as const;

export const ttsSettingsSchema = z.object({
  endpoint: httpUrlSchema,
  apiKey: z.string().trim().max(512, 'API Key 过长').optional().or(z.literal('')),
  clearKey: z.boolean().optional().default(false),
  model: z.string().trim().min(1, '请填写模型名称').max(120, '模型名称过长'),
  voice: z.string().trim().min(1, '请填写音色').max(120, '音色过长'),
  format: z.enum(ttsAudioFormats).default('mp3'),
  speed: z.coerce.number().min(0.5, '速度范围为 0.5-2').max(2, '速度范围为 0.5-2').default(1),
});

export const ttsTestSchema = z.object({
  text: z.string().trim().min(1, '请填写试听文本').max(500, '试听文本最多 500 个字符'),
});

const webSocketUrlSchema = z
  .string()
  .trim()
  .min(1, '请填写 WebSocket 地址')
  .max(300, 'WebSocket 地址过长')
  .refine((value) => {
    try {
      const url = new URL(value);
      return url.protocol === 'ws:' || url.protocol === 'wss:';
    } catch {
      return false;
    }
  }, '请输入以 ws:// 或 wss:// 开头的有效地址');

const chatPersonaValueSchema = z.union([
  z.string().max(4000, '人格字段过长'),
  z.number(),
  z.boolean(),
  z.array(z.string().max(400)).max(100, '人格列表过长'),
]);

export const connectChatChannelSchema = z.object({
  serverUrl: webSocketUrlSchema,
  accessToken: z.string().trim().max(512, '授权密钥过长').optional().default(''),
  personaId: z.string().trim().min(1, '请选择角色卡').max(64),
});

const chatImageDataUrlSchema = z
  .string()
  .max(12_000_000, '单张图片过大')
  .regex(/^data:image\/[a-zA-Z0-9.+-]+;base64,/, '图片格式不受支持');

export const sendChatMessageSchema = z
  .object({
    text: z.string().max(4000, '消息最多 4000 个字符').default(''),
    images: z.array(chatImageDataUrlSchema).max(4, '一次最多发送 4 张图片').optional().default([]),
  })
  .refine((value) => value.text.trim().length > 0 || value.images.length > 0, {
    message: '请输入消息内容',
    path: ['text'],
  });

export const chatConversationQuerySchema = z.object({
  kind: z.enum(['PRIVATE', 'GROUP']),
});

export const chatDirectConversationSchema = z.object({
  channelId: z.string().trim().min(1).max(64),
  /** Private conversation whose participant should speak on the direct line. */
  privateConversationId: z.string().trim().min(1).max(64).optional(),
});

export const chatDirectMessageSchema = z.object({
  text: z.string().trim().min(1, '请输入消息内容').max(4000, '消息最多 4000 个字符'),
});

export const chatMessageQuerySchema = z.object({
  cursor: z.string().trim().min(1).optional(),
  limit: z.coerce.number().int('数量必须是整数').min(1).max(200).default(50),
});

export const chatPersonaHistoryEntrySchema = z.object({
  id: z.string().trim().min(1).max(80),
  time: z.string().trim().min(1).max(40),
  field: z.string().trim().min(1).max(80),
  from: z.string().max(2000),
  to: z.string().max(2000),
  reason: z.string().trim().min(1).max(80),
});

export const saveChannelPersonaSchema = z.object({
  values: z.record(z.string().min(1).max(80), chatPersonaValueSchema),
  history: z.array(chatPersonaHistoryEntrySchema).max(200, '人格历史最多保留 200 条').default([]),
});

export const personaAiGenerateSchema = z.object({
  prompt: z.string().trim().min(20, '请至少写下 20 个字').max(10000, '提示词最多 10000 个字符'),
  providerId: z.string().trim().min(1).max(64).optional(),
  model: z.string().trim().min(1).max(160).optional(),
});

export interface PersonaAiProviderOption {
  id: string;
  name: string;
  protocol: ModelProviderProtocol;
  models: string[];
}

export type RedisConnectionInput = z.infer<typeof redisConnectionSchema>;
export type RedisSettingsInput = z.infer<typeof redisSettingsSchema>;
export type BilibiliSettingsInput = z.infer<typeof bilibiliSettingsSchema>;
export type MindBannedWordsInput = z.infer<typeof mindBannedWordsSchema>;
export type WebAllowedHostsInput = z.infer<typeof webAllowedHostsSchema>;
export type ToolMaxTokensInput = z.infer<typeof toolMaxTokensSchema>;
export type VisionModelInput = z.infer<typeof visionModelSchema>;
export type PhoneConnectInput = z.infer<typeof phoneConnectSchema>;
export type PhonePairInput = z.infer<typeof phonePairSchema>;
export type PhoneDisconnectInput = z.infer<typeof phoneDisconnectSchema>;
export type AdminAccountInput = z.infer<typeof adminAccountSchema>;
export type BootstrapInput = z.infer<typeof bootstrapSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type ModelProviderProtocol = z.infer<typeof modelProviderProtocolSchema>;
export type ModelProviderInput = z.infer<typeof modelProviderSchema>;
export type TtsAudioFormat = (typeof ttsAudioFormats)[number];
export type TtsSettingsInput = z.infer<typeof ttsSettingsSchema>;
export type TtsTestInput = z.infer<typeof ttsTestSchema>;
export type ChatChannelConnectInput = z.infer<typeof connectChatChannelSchema>;
export type ChatSendMessageInput = z.infer<typeof sendChatMessageSchema>;
export type ChatDirectConversationInput = z.infer<typeof chatDirectConversationSchema>;
export type ChatDirectMessageInput = z.infer<typeof chatDirectMessageSchema>;
export type SaveChannelPersonaInput = z.infer<typeof saveChannelPersonaSchema>;
export type PersonaAiGenerateInput = z.infer<typeof personaAiGenerateSchema>;
