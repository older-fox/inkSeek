import { Injectable, NotFoundException } from '@nestjs/common';
import type { MindSettingsRecord, MindSettingsUpdateInput } from '@inkseek/shared';
import { PrismaService } from '../database/prisma.service.js';
import { Prisma } from '../generated/prisma/client.js';
import type { ChatMindSettings } from '../generated/prisma/client.js';

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
    if (input.dailyProactiveBudget !== undefined) {
      data.dailyProactiveBudget = input.dailyProactiveBudget;
    }
    if (input.maxBeats !== undefined) data.maxBeats = input.maxBeats;
    if (input.minBeatDelayMs !== undefined) data.minBeatDelayMs = input.minBeatDelayMs;
    if (input.maxBeatDelayMs !== undefined) data.maxBeatDelayMs = input.maxBeatDelayMs;
    if (input.replyAvoidSeconds !== undefined) {
      data.replyAvoidSeconds = input.replyAvoidSeconds;
    }
    if (input.privateBurstSeconds !== undefined) {
      data.privateBurstSeconds = input.privateBurstSeconds;
    }
    if (input.imageDescriptionPrompt !== undefined) {
      data.imageDescriptionPrompt = input.imageDescriptionPrompt.trim();
    }
    if (input.providerId !== undefined) data.providerId = input.providerId;
    if (input.model !== undefined) data.model = input.model;
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
        dailyProactiveBudget: input.dailyProactiveBudget ?? 3,
        maxBeats: input.maxBeats ?? 3,
        minBeatDelayMs: input.minBeatDelayMs ?? 800,
        maxBeatDelayMs: input.maxBeatDelayMs ?? 4000,
        replyAvoidSeconds: input.replyAvoidSeconds ?? 180,
        privateBurstSeconds: input.privateBurstSeconds ?? 0,
        imageDescriptionPrompt: input.imageDescriptionPrompt?.trim() ?? '',
        providerId: input.providerId ?? null,
        model: input.model ?? null,
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
    dailyProactiveBudget: row.dailyProactiveBudget,
    maxBeats: row.maxBeats,
    minBeatDelayMs: row.minBeatDelayMs,
    maxBeatDelayMs: row.maxBeatDelayMs,
    replyAvoidSeconds: row.replyAvoidSeconds,
    privateBurstSeconds: row.privateBurstSeconds,
    imageDescriptionPrompt: row.imageDescriptionPrompt,
    quietHours: row.quietHours,
    providerId: row.providerId,
    model: row.model,
    updatedAt: row.updatedAt.toISOString(),
  };
}
