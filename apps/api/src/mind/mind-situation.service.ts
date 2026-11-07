import { Injectable } from '@nestjs/common';
import type { PersonaFocusRecord } from '@inkseek/shared';
import { PrismaService } from '../database/prisma.service.js';
import { MindFocusService } from './mind-focus.service.js';
import {
  PHONE_FOCUS_MAX_STEPS,
  elapsedLabel,
  type MindPhoneBattery,
} from './mind.types.js';

const RECENT_WINDOW_MS = 30 * 60_000;

/**
 * Builds the small "what am I doing right now" paragraph that both the chat
 * planner and the phone runner read. The model has no memory between calls, so
 * this persisted snapshot is the whole of its self-awareness.
 */
@Injectable()
export class MindSituationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly focus: MindFocusService,
  ) {}

  async describe(personaId: string): Promise<string> {
    const [phone, chat, state, lastPhone] = await Promise.all([
      this.focus.active(personaId, 'PHONE'),
      this.focus.active(personaId, 'CHAT'),
      this.prisma.personaState.findUnique({ where: { personaId } }),
      this.prisma.personaFocus.findFirst({
        where: { personaId, kind: 'PHONE', status: 'DONE' },
        orderBy: { endedAt: 'desc' },
      }),
    ]);

    // Keep the "刚才" recap short, but remember the last phone session for
    // longer: self.activity can still claim the phone is in use after the
    // focus ended, and the model otherwise believes it is already playing.
    const recent =
      lastPhone?.endedAt && Date.now() - lastPhone.endedAt.getTime() <= RECENT_WINDOW_MS
        ? lastPhone
        : null;

    const lines: string[] = [];
    const phoneState = readState(phone);
    const lastState = readState(lastPhone ? toFocusRecord(lastPhone) : null);
    const recentState = readState(recent ? toFocusRecord(recent) : null);
    // Focus rows written before the error field existed (or reclaimed by an
    // older build) still have their reason on the run, so read it as fallback.
    const lastRun =
      !phone && lastPhone
        ? await this.prisma.agentRun.findFirst({
            where: { focusId: lastPhone.id },
            orderBy: { startedAt: 'desc' },
            select: { status: true, error: true },
          })
        : null;
    const lastError =
      trim(lastState.error) ||
      (lastRun?.status === 'FAILED' ? trim(lastRun.error) || '异常结束' : '');

    if (chat) {
      lines.push('现场：正在回消息，手机那边先停着。');
    }
    if (phone) {
      const activity = trim(phoneState.activity) || phone.goal || '玩手机';
      const paused = phone.status === 'PAUSED';
      const failures = readNumber(phoneState.failures, 0);
      lines.push(
        `现场：正在用手机——${activity}（第 ${Math.min(
          phone.step + 1,
          PHONE_FOCUS_MAX_STEPS,
        )}/${PHONE_FOCUS_MAX_STEPS} 步；已玩 ${elapsedLabel(phone.startedAt)}${
          paused ? '；刚被消息打断，停在当前界面' : ''
        }${failures > 0 ? `；连续失败 ${failures} 次` : ''}）`,
      );
      const lastAction = trim(phoneState.lastAction);
      const lastReason = trim(phoneState.lastReason);
      const battery = readBattery(phoneState);
      const details = [
        trim(phone.goal) ? `目标：${trim(phone.goal)}` : '',
        trim(phoneState.screenPackage) ? `界面：${trim(phoneState.screenPackage)}` : '',
        lastAction
          ? `上一步：${lastAction}${lastReason ? `（${lastReason}）` : ''}`
          : '',
        trim(phoneState.notable) ? `刚注意到：${trim(phoneState.notable)}` : '',
        battery ? `电量：${battery.level}%${battery.charging ? '（在充电）' : ''}` : '',
      ].filter(Boolean);
      if (details.length > 0) {
        lines.push(`手机：${details.join('｜')}`);
      }
    } else if (recent) {
      const summary = trim(recentState.summary);
      const error = lastError;
      const problem = trim(recentState.problem);
      const problemLine = problem ? `；遇到${problem}` : '';
      const outcome = error
        ? `异常结束：${error}`
        : summary
          ? `结果：${summary}${problemLine}`
          : `已结束${problemLine}`;
      lines.push(
        `刚才：用手机${trim(recent.goal) ? `——${trim(recent.goal)}` : ''}，${outcome}（${minutesAgo(
          (recent.endedAt ?? recent.updatedAt).toISOString(),
        )} 分钟前）`,
      );
      const notable = trim(recentState.notable);
      if (notable) {
        lines.push(`刚才注意到：${notable}`);
      }
    }

    if (state?.currentActivity && !phone && !chat) {
      const since = state.activitySince
        ? `（${minutesAgo(state.activitySince.toISOString())} 分钟前开始）`
        : '';
      lines.push(`正在做：${state.currentActivity}${since}`);
    }

    // Last line wins: self.activity may still describe a phone session that
    // already ended, so state the actual phone status after it.
    if (!phone && lastPhone?.endedAt) {
      const endedAt = lastPhone.endedAt.toISOString();
      const error = lastError;
      const summary = trim(lastState.summary);
      const outcome = error ? `异常结束：${error}` : summary ? `结果：${summary}` : '';
      lines.push(
        `手机：现在没在玩（上一次手机焦点 ${elapsedLabel(endedAt)}前结束${
          outcome ? `，${outcome}` : ''
        }；只有手机焦点在跑才算在玩）。`,
      );
    }

    return lines.join('\n');
  }

  async brief(personaId: string): Promise<{ active: PersonaFocusRecord | null; line: string }> {
    const active = await this.focus.active(personaId);
    return { active, line: await this.describe(personaId) };
  }
}

function readState(focus: PersonaFocusRecord | null): Record<string, unknown> {
  const value = focus?.state;
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function trim(value: unknown): string {
  return typeof value === 'string' ? value.trim().slice(0, 120) : '';
}

function minutesAgo(iso: string): number {
  return Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60_000));
}

function readNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function readBattery(state: Record<string, unknown>): MindPhoneBattery | null {
  const value = state['battery'];
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  const record = value as Record<string, unknown>;
  const level = readNumber(record['level'], -1);
  return level >= 0 && level <= 100
    ? { level: Math.round(level), charging: record['charging'] === true }
    : null;
}


function toFocusRecord(row: {
  id: string;
  personaId: string;
  channelId: string;
  kind: 'CHAT' | 'PHONE';
  status: 'ACTIVE' | 'PAUSED' | 'DONE';
  parentId: string | null;
  goal: string;
  step: number;
  state: unknown;
  pausedAt: Date | null;
  startedAt: Date;
  endedAt: Date | null;
  updatedAt: Date;
}): PersonaFocusRecord {
  return {
    id: row.id,
    personaId: row.personaId,
    channelId: row.channelId,
    kind: row.kind,
    status: row.status,
    parentId: row.parentId,
    goal: row.goal,
    step: row.step,
    state: row.state,
    pausedAt: row.pausedAt?.toISOString() ?? null,
    startedAt: row.startedAt.toISOString(),
    endedAt: row.endedAt?.toISOString() ?? null,
    updatedAt: row.updatedAt.toISOString(),
  };
}
