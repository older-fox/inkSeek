import { Injectable, NotFoundException } from '@nestjs/common';
import type { MindSettingsRecord, MindSettingsUpdateInput } from '@inkseek/shared';
import { PrismaService } from '../database/prisma.service.js';
import { Prisma } from '../generated/prisma/client.js';
import type { ChatMindSettings } from '../generated/prisma/client.js';

const SETTINGS_DEFAULTS = {
  mode: 'OFF',
  heartbeatEnabled: true,
  proactiveEnabled: false,
  selfScheduleEnabled: true,
  wakeIntervalMinutes: 45,
  wakeMinMinutes: 10,
  wakeMaxMinutes: 240,
  quietIntervalMinutes: 90,
  dailyMessageBudget: 30,
  proactiveWakeDailyLimit: 0,
  proactiveWakeMinGapSeconds: 0,
  maxBeats: 3,
  sceneDetail: 'OFF',
  minBeatDelayMs: 800,
  maxBeatDelayMs: 4000,
  replyAvoidSeconds: 180,
  privateBurstSeconds: 0,
  lifeEventChancePercent: 1,
  lifeEventDailyLimit: 1,
  curiosityChancePercent: 15,
  curiosityDailyLimit: 0,
  reflectionIntervalHours: 6,
  imageDescriptionPrompt: '',
  providerId: null,
  model: null,
  phoneDevice: null,
  phonePlayChancePercent: 0,
  phonePlayDailyLimit: 0,
  learningEnabled: true,
  learningIntervalHours: 12,
  learningDailySourceLimit: 6,
  browserEnabled: true,
  styleLearningEnabled: true,
  stylePromotionEnabled: true,
  quietHours: null,
} as const;

@Injectable()
export class MindSettingsService {
  constructor(private readonly prisma: PrismaService) {}

  async get(channelId: string): Promise<MindSettingsRecord> {
    await this.assertChannel(channelId);
    const row = await this.prisma.chatMindSettings.upsert({
      where: { channelId },
      create: { channelId },
      update: {},
    });
    return toRecord(row);
  }

  /** Read-only variant for simulation: never creates the settings row. */
  async peek(channelId: string): Promise<MindSettingsRecord> {
    const row = await this.prisma.chatMindSettings.findUnique({ where: { channelId } });
    if (row) {
      return toRecord(row);
    }
    return {
      channelId,
      ...SETTINGS_DEFAULTS,
      updatedAt: new Date().toISOString(),
    };
  }

  async update(channelId: string, input: MindSettingsUpdateInput): Promise<MindSettingsRecord> {
    await this.assertChannel(channelId);
    const data: Prisma.ChatMindSettingsUpdateInput = {};

    if (input.mode !== undefined) data.mode = input.mode;
    if (input.heartbeatEnabled !== undefined) data.heartbeatEnabled = input.heartbeatEnabled;
    if (input.proactiveEnabled !== undefined) data.proactiveEnabled = input.proactiveEnabled;
    if (input.selfScheduleEnabled !== undefined) {
      data.selfScheduleEnabled = input.selfScheduleEnabled;
    }
    if (input.wakeIntervalMinutes !== undefined) {
      data.wakeIntervalMinutes = input.wakeIntervalMinutes;
    }
    if (input.wakeMinMinutes !== undefined) data.wakeMinMinutes = input.wakeMinMinutes;
    if (input.wakeMaxMinutes !== undefined) data.wakeMaxMinutes = input.wakeMaxMinutes;
    if (input.quietIntervalMinutes !== undefined) {
      data.quietIntervalMinutes = input.quietIntervalMinutes;
    }
    if (input.dailyMessageBudget !== undefined) data.dailyMessageBudget = input.dailyMessageBudget;
    if (input.proactiveWakeDailyLimit !== undefined) {
      data.proactiveWakeDailyLimit = input.proactiveWakeDailyLimit;
    }
    if (input.proactiveWakeMinGapSeconds !== undefined) {
      data.proactiveWakeMinGapSeconds = input.proactiveWakeMinGapSeconds;
    }
    if (input.maxBeats !== undefined) data.maxBeats = input.maxBeats;
    // Per-channel so normal chat keeps the chat-only rule; only intimate scenes expand.
    if (input.sceneDetail !== undefined) data.sceneDetail = input.sceneDetail;
    if (input.minBeatDelayMs !== undefined) data.minBeatDelayMs = input.minBeatDelayMs;
    if (input.maxBeatDelayMs !== undefined) data.maxBeatDelayMs = input.maxBeatDelayMs;
    if (input.replyAvoidSeconds !== undefined) {
      data.replyAvoidSeconds = input.replyAvoidSeconds;
    }
    if (input.privateBurstSeconds !== undefined) {
      data.privateBurstSeconds = input.privateBurstSeconds;
    }
    if (input.lifeEventChancePercent !== undefined) {
      data.lifeEventChancePercent = input.lifeEventChancePercent;
    }
    if (input.lifeEventDailyLimit !== undefined) {
      data.lifeEventDailyLimit = input.lifeEventDailyLimit;
    }
    if (input.curiosityChancePercent !== undefined) {
      data.curiosityChancePercent = input.curiosityChancePercent;
    }
    if (input.curiosityDailyLimit !== undefined) {
      data.curiosityDailyLimit = input.curiosityDailyLimit;
    }
    if (input.reflectionIntervalHours !== undefined) {
      data.reflectionIntervalHours = input.reflectionIntervalHours;
    }
    if (input.imageDescriptionPrompt !== undefined) {
      data.imageDescriptionPrompt = input.imageDescriptionPrompt.trim();
    }
    if (input.providerId !== undefined) data.providerId = input.providerId;
    if (input.model !== undefined) data.model = input.model;
    if (input.phoneDevice !== undefined) {
      data.phoneDevice = input.phoneDevice?.trim() || null;
    }
    if (input.phonePlayChancePercent !== undefined) {
      data.phonePlayChancePercent = input.phonePlayChancePercent;
    }
    if (input.phonePlayDailyLimit !== undefined) {
      data.phonePlayDailyLimit = input.phonePlayDailyLimit;
    }
    if (input.learningEnabled !== undefined) data.learningEnabled = input.learningEnabled;
    if (input.learningIntervalHours !== undefined) {
      data.learningIntervalHours = input.learningIntervalHours;
    }
    if (input.learningDailySourceLimit !== undefined) {
      data.learningDailySourceLimit = input.learningDailySourceLimit;
    }
    if (input.browserEnabled !== undefined) data.browserEnabled = input.browserEnabled;
    if (input.styleLearningEnabled !== undefined) {
      data.styleLearningEnabled = input.styleLearningEnabled;
    }
    if (input.stylePromotionEnabled !== undefined) {
      data.stylePromotionEnabled = input.stylePromotionEnabled;
    }
    if (input.quietHours !== undefined) {
      data.quietHours =
        input.quietHours === null ? Prisma.JsonNull : (input.quietHours as Prisma.InputJsonValue);
    }

    const row = await this.prisma.chatMindSettings.upsert({
      where: { channelId },
      create: {
        channelId,
        mode: input.mode ?? 'OFF',
        heartbeatEnabled: input.heartbeatEnabled ?? true,
        proactiveEnabled: input.proactiveEnabled ?? false,
        selfScheduleEnabled: input.selfScheduleEnabled ?? true,
        wakeIntervalMinutes: input.wakeIntervalMinutes ?? 45,
        wakeMinMinutes: input.wakeMinMinutes ?? 10,
        wakeMaxMinutes: input.wakeMaxMinutes ?? 240,
        quietIntervalMinutes: input.quietIntervalMinutes ?? 90,
        dailyMessageBudget: input.dailyMessageBudget ?? 30,
        proactiveWakeDailyLimit: input.proactiveWakeDailyLimit ?? 0,
        proactiveWakeMinGapSeconds: input.proactiveWakeMinGapSeconds ?? 0,
        maxBeats: input.maxBeats ?? 3,
        sceneDetail: input.sceneDetail ?? 'OFF',
        minBeatDelayMs: input.minBeatDelayMs ?? 800,
        maxBeatDelayMs: input.maxBeatDelayMs ?? 4000,
        replyAvoidSeconds: input.replyAvoidSeconds ?? 180,
        privateBurstSeconds: input.privateBurstSeconds ?? 0,
        lifeEventChancePercent: input.lifeEventChancePercent ?? 1,
        lifeEventDailyLimit: input.lifeEventDailyLimit ?? 1,
        curiosityChancePercent: input.curiosityChancePercent ?? 15,
        curiosityDailyLimit: input.curiosityDailyLimit ?? 0,
        reflectionIntervalHours: input.reflectionIntervalHours ?? 6,
        imageDescriptionPrompt: input.imageDescriptionPrompt?.trim() ?? '',
        providerId: input.providerId ?? null,
        model: input.model ?? null,
        phoneDevice: input.phoneDevice?.trim() || null,
        phonePlayChancePercent: input.phonePlayChancePercent ?? 0,
        phonePlayDailyLimit: input.phonePlayDailyLimit ?? 0,
        learningEnabled: input.learningEnabled ?? true,
        learningIntervalHours: input.learningIntervalHours ?? 12,
        learningDailySourceLimit: input.learningDailySourceLimit ?? 6,
        browserEnabled: input.browserEnabled ?? true,
        styleLearningEnabled: input.styleLearningEnabled ?? true,
        stylePromotionEnabled: input.stylePromotionEnabled ?? true,
        quietHours:
          input.quietHours === undefined
            ? undefined
            : input.quietHours === null
              ? Prisma.JsonNull
              : (input.quietHours as Prisma.InputJsonValue),
      },
      update: data,
    });
    return toRecord(row);
  }

  private async assertChannel(channelId: string): Promise<void> {
    const channel = await this.prisma.chatChannel.findUnique({
      where: { id: channelId },
      select: { id: true },
    });
    if (!channel) {
      throw new NotFoundException({ code: 'CHANNEL_NOT_FOUND', message: '渠道不存在或已被删除' });
    }
  }
}

function toRecord(row: ChatMindSettings): MindSettingsRecord {
  return {
    channelId: row.channelId,
    mode: row.mode,
    heartbeatEnabled: row.heartbeatEnabled,
    proactiveEnabled: row.proactiveEnabled,
    selfScheduleEnabled: row.selfScheduleEnabled,
    wakeIntervalMinutes: row.wakeIntervalMinutes,
    wakeMinMinutes: row.wakeMinMinutes,
    wakeMaxMinutes: row.wakeMaxMinutes,
    quietIntervalMinutes: row.quietIntervalMinutes,
    dailyMessageBudget: row.dailyMessageBudget,
    proactiveWakeDailyLimit: row.proactiveWakeDailyLimit,
    proactiveWakeMinGapSeconds: row.proactiveWakeMinGapSeconds,
    maxBeats: row.maxBeats,
    sceneDetail: row.sceneDetail,
    minBeatDelayMs: row.minBeatDelayMs,
    maxBeatDelayMs: row.maxBeatDelayMs,
    replyAvoidSeconds: row.replyAvoidSeconds,
    privateBurstSeconds: row.privateBurstSeconds,
    lifeEventChancePercent: row.lifeEventChancePercent,
    lifeEventDailyLimit: row.lifeEventDailyLimit,
    curiosityChancePercent: row.curiosityChancePercent,
    curiosityDailyLimit: row.curiosityDailyLimit,
    reflectionIntervalHours: row.reflectionIntervalHours,
    imageDescriptionPrompt: row.imageDescriptionPrompt,
    quietHours: row.quietHours,
    providerId: row.providerId,
    model: row.model,
    phoneDevice: row.phoneDevice,
    phonePlayChancePercent: row.phonePlayChancePercent,
    phonePlayDailyLimit: row.phonePlayDailyLimit,
    learningEnabled: row.learningEnabled,
    learningIntervalHours: row.learningIntervalHours,
    learningDailySourceLimit: row.learningDailySourceLimit,
    browserEnabled: row.browserEnabled,
    styleLearningEnabled: row.styleLearningEnabled,
    stylePromotionEnabled: row.stylePromotionEnabled,
    updatedAt: row.updatedAt.toISOString(),
  };
}
