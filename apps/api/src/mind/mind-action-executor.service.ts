import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import type {
  ActionPlan,
  AgentActionRecord,
  MindSettingsRecord,
  OutgoingBeat,
} from '@inkseek/shared';
import { PrismaService } from '../database/prisma.service.js';
import type { AgentAction } from '../generated/prisma/client.js';
import type { MindScene } from './mind.types.js';
import { sleep } from './mind.types.js';
import { StickerService } from './sticker.service.js';

export interface ExecutePlanInput {
  plan: ActionPlan;
  scene: MindScene;
  settings: MindSettingsRecord;
  mode: string;
  runId: string;
}

@Injectable()
export class MindActionExecutor {
  private readonly logger = new Logger(MindActionExecutor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly moduleRef: ModuleRef,
    private readonly stickers: StickerService,
  ) {}

  async execute(input: ExecutePlanInput): Promise<AgentAction[]> {
    if (!input.plan.engage || input.plan.beats.length === 0) {
      return [];
    }
    const actions: AgentAction[] = [];
    const mode = input.mode.toUpperCase();
    let budgetUsed = await this.todaySentCount(input.scene.persona.id);
    let stopped = false;

    for (let index = 0; index < input.plan.beats.length; index += 1) {
      const beat = input.plan.beats[index];
      if (!beat) continue;
      const idempotencyKey = `${input.runId}:${index}`;
      const kind = beat.kind === 'sticker' ? 'STICKER' : beat.kind === 'face' ? 'FACE' : 'MESSAGE';
      let action: AgentAction;
      try {
        action = await this.prisma.agentAction.create({
          data: {
            runId: input.runId,
            personaId: input.scene.persona.id,
            channelId: input.scene.persona.channelId,
            conversationId: input.scene.conversation.id,
            kind,
            payload: beat as unknown as object,
            status: 'PENDING',
            idempotencyKey,
          },
        });
      } catch {
        // Unique key means a retry already created this beat.
        const existing = await this.prisma.agentAction.findUnique({ where: { idempotencyKey } });
        if (existing) actions.push(existing);
        continue;
      }
      actions.push(action);

      if (mode === 'SHADOW') {
        await this.prisma.agentAction.update({
          where: { id: action.id },
          data: { status: 'SKIPPED', error: '影子模式，不发送' },
        });
        continue;
      }
      if (mode === 'APPROVAL') {
        continue;
      }
      if (stopped) {
        await this.prisma.agentAction.update({
          where: { id: action.id },
          data: { status: 'SKIPPED', error: '前一条消息发送失败，停止剩余气泡' },
        });
        continue;
      }
      if (budgetUsed >= input.settings.dailyMessageBudget) {
        await this.prisma.agentAction.update({
          where: { id: action.id },
          data: { status: 'SKIPPED', error: '今日消息额度已用完' },
        });
        continue;
      }

      try {
        await sleep(Math.min(beat.delayMs, input.settings.maxBeatDelayMs));
        const sent = await this.sendBeat(input.scene, beat, action.id);
        budgetUsed += 1;
        await this.prisma.agentAction.update({
          where: { id: action.id },
          data: {
            status: 'SENT',
            sentAt: new Date(),
            sentMessageId: sent ?? null,
            error: null,
          },
        });
      } catch (error) {
        stopped = true;
        const message = error instanceof Error ? error.message : String(error);
        this.logger.warn(`心智动作发送失败：${message}`);
        await this.prisma.agentAction.update({
          where: { id: action.id },
          data: { status: 'FAILED', error: message.slice(0, 1000) },
        });
      }
    }

    return this.prisma.agentAction.findMany({
      where: { runId: input.runId },
      orderBy: { createdAt: 'asc' },
    });
  }

  async approve(actionId: string): Promise<AgentActionRecord> {
    const action = await this.prisma.agentAction.findUnique({ where: { id: actionId } });
    if (!action) {
      throw new NotFoundException({ code: 'ACTION_NOT_FOUND', message: '动作不存在' });
    }
    if (action.status === 'SENT') {
      return toRecord(action);
    }
    if (action.status !== 'PENDING' && action.status !== 'APPROVED') {
      throw new NotFoundException({ code: 'ACTION_NOT_PENDING', message: '动作不在待审状态' });
    }
    const scene = await this.sceneForAction(action);
    const beat = action.payload as unknown as OutgoingBeat;
    try {
      const sent = await this.sendBeat(scene, beat, action.id);
      const updated = await this.prisma.agentAction.update({
        where: { id: action.id },
        data: {
          status: 'SENT',
          approvedAt: new Date(),
          sentAt: new Date(),
          sentMessageId: sent ?? null,
          error: null,
        },
      });
      return toRecord(updated);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const updated = await this.prisma.agentAction.update({
        where: { id: action.id },
        data: { status: 'FAILED', approvedAt: new Date(), error: message.slice(0, 1000) },
      });
      return toRecord(updated);
    }
  }

  async pending(personaId: string): Promise<AgentActionRecord[]> {
    const rows = await this.prisma.agentAction.findMany({
      where: { personaId, status: { in: ['PENDING', 'APPROVED'] } },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    return rows.map(toRecord);
  }

  private async sendBeat(
    scene: MindScene,
    beat: OutgoingBeat,
    actionId: string,
  ): Promise<string | null> {
    // Dynamic import keeps ChatService -> processor -> mind -> executor from
    // becoming a top-level ESM cycle.
    const { ChatService } = await import('../chat/chat.service.js');
    const chat = this.moduleRef.get(ChatService, { strict: false });
    if (beat.kind === 'text') {
      const summary = await chat.sendMessage(scene.conversation.id, {
        text: beat.text,
        images: [],
      });
      return summary.id;
    }
    if (beat.kind === 'sticker') {
      const dataUrl = await this.stickers.toDataUrl(beat.stickerId);
      const summary = await chat.sendMessage(scene.conversation.id, {
        text: '',
        images: [dataUrl],
      });
      await this.stickers.recordUsage(beat.stickerId);
      return summary.id;
    }
    throw new Error(`暂不支持发送 ${beat.kind} 类型的消息段（动作 ${actionId}）`);
  }

  private async sceneForAction(action: AgentAction): Promise<MindScene> {
    const scene = await this.prisma.chatConversation.findUnique({
      where: { id: action.conversationId ?? '' },
    });
    const persona = await this.prisma.chatChannelPersona.findUnique({
      where: { id: action.personaId },
    });
    if (!scene || !persona) {
      throw new NotFoundException({ code: 'ACTION_CONTEXT_MISSING', message: '动作缺少会话上下文' });
    }
    return {
      persona,
      conversation: scene,
      anchor: {
        messageId: '',
        channelId: action.channelId,
        conversationId: scene.id,
        conversationKind: scene.kind,
        conversationExternalId: scene.externalId,
        externalId: null,
        isSelf: true,
        senderId: '',
        senderName: persona.name,
        text: '',
        kind: 'TEXT',
        quote: null,
        images: [],
        imageCount: 0,
        voices: [],
        voiceCount: 0,
        sentAt: new Date(),
      },
      messages: [],
      cast: [],
      stance: null,
      startedAt: new Date(),
    };
  }

  private async todaySentCount(personaId: string): Promise<number> {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    return this.prisma.agentAction.count({
      where: {
        personaId,
        status: 'SENT',
        kind: { in: ['MESSAGE', 'STICKER', 'FACE'] },
        createdAt: { gte: start },
      },
    });
  }
}

function toRecord(row: AgentAction): AgentActionRecord {
  return {
    id: row.id,
    kind: row.kind,
    payload: row.payload,
    status: row.status,
    idempotencyKey: row.idempotencyKey,
    sentMessageId: row.sentMessageId,
    error: row.error,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
