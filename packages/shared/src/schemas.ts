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

export const saveConversationPersonaSchema = z.object({
  values: z.record(z.string().min(1).max(80), chatPersonaValueSchema),
  history: z.array(chatPersonaHistoryEntrySchema).max(200, '人格历史最多保留 200 条').default([]),
});

export type RedisConnectionInput = z.infer<typeof redisConnectionSchema>;
export type RedisSettingsInput = z.infer<typeof redisSettingsSchema>;
export type AdminAccountInput = z.infer<typeof adminAccountSchema>;
export type BootstrapInput = z.infer<typeof bootstrapSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type ModelProviderProtocol = z.infer<typeof modelProviderProtocolSchema>;
export type ModelProviderInput = z.infer<typeof modelProviderSchema>;
export type ChatChannelConnectInput = z.infer<typeof connectChatChannelSchema>;
export type ChatSendMessageInput = z.infer<typeof sendChatMessageSchema>;
export type SaveConversationPersonaInput = z.infer<typeof saveConversationPersonaSchema>;
