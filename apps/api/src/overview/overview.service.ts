import { Injectable } from '@nestjs/common';
import {
  RELATIONSHIP_ATTRIBUTES,
  type OverviewAttention,
  type OverviewChannel,
  type OverviewEvent,
  type OverviewLink,
  type OverviewSeverity,
  type OverviewSnapshot,
} from '@inkseek/shared';
import { PrismaService } from '../database/prisma.service.js';

const DAY_MS = 86_400_000;
const EVENT_LIMIT = 14;
const CHANGE_SCAN_LIMIT = 600;

const RELATION_LABELS = new Map<string, string>();
for (const attribute of RELATIONSHIP_ATTRIBUTES) {
  if (attribute.storage.type === 'numeric') {
    RELATION_LABELS.set(attribute.storage.field, attribute.label);
  }
}

const GROUP_FIELD_LABELS: Record<string, string> = {
  comfort: '舒适度',
  belonging: '归属感',
  attention: '被关注',
  formality: '拘谨',
  speakRate: '发言频率',
  audienceRisk: '群体风险',
};

const SELF_FIELD_LABELS: Record<string, string> = {
  confidence: '自信',
  self_control: '自控',
  shame: '羞耻',
  trust_bias: '信任倾向',
  attachment_style: '亲和',
  possessiveness_base: '占有欲',
  agreeableness: '随和',
  proactivity: '主动性',
  curiosity: '好奇',
  stamina_max: '耐力',
  strength: '力量',
  agility: '敏捷',
  pain_tolerance: '忍痛',
  recovery_rate: '恢复',
  sensitivity: '敏感',
  emoji_level: '表情使用',
  typing_level: '打字习惯',
  split_level: '分段',
  typo_level: '错字',
};

const NEED_LABELS: Record<string, string> = {
  care: '关心一下',
  connect: '靠近一点',
  share: '分享点什么',
  followup: '问问后续',
  play: '一起玩',
  learn: '聊点新东西',
};

const CLOSURE_LABELS: Record<string, string> = {
  'explicit-end': '明确道别',
  'topic-done': '话题聊完',
  tired: '累了',
  busy: '忙',
  natural: '自然收尾',
};

const SEVERITY_RANK: Record<OverviewSeverity, number> = { high: 0, medium: 1, low: 2 };

interface ChangeRow {
  id: string;
  personaId: string;
  scope: string;
  targetId: string;
  field: string;
  beforeValue: unknown;
  afterValue: unknown;
  delta: number | null;
  reason: string;
  createdAt: Date;
}

interface FieldSum {
  field: string;
  sum: number;
  reason: string;
  occurredAt: Date;
}

interface ChannelContext {
  channel: {
    id: string;
    displayName: string;
    status: string;
  };
  personaName: string | null;
}

function clip(value: string | null | undefined, max: number): string {
  const text = (value ?? '').replace(/\s+/g, ' ').trim();
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

function signed(value: number): string {
  return value > 0 ? `+${value}` : String(value);
}

function moodLabel(value: number): string {
  if (value >= 60) return '愉快';
  if (value >= 20) return '轻松';
  if (value > -20) return '平静';
  if (value > -60) return '低落';
  return '沉重';
}

function formatMinutes(minutes: number): string {
  if (!Number.isFinite(minutes) || minutes <= 0) return '不到 1 分钟';
  const rounded = Math.round(minutes);
  if (rounded < 60) return `${rounded} 分钟`;
  const hours = Math.floor(rounded / 60);
  const rest = rounded % 60;
  return rest > 0 ? `${hours} 小时 ${rest} 分` : `${hours} 小时`;
}

function minutesBetween(start: Date, end: Date): number {
  return Math.max(0, Math.round((end.getTime() - start.getTime()) / 60_000));
}

function jsonRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function effectNumber(effects: unknown, key: string): number | null {
  const record = jsonRecord(effects);
  const value = record?.[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function effectText(effects: unknown, key: string): string {
  const record = jsonRecord(effects);
  const value = record?.[key];
  return typeof value === 'string' ? value : '';
}

const BILIBILI_VIDEO_URL = /\/video\/(BV[0-9A-Za-z]+)/;
const GENERIC_SOURCE_TITLE = /热门|首页|推荐|排行榜|频道/;
const INVISIBLE_NAME = /^[\s\u115f\u1160\u2800\u3164\u200b-\u200f\ufeff]+$/;

function readableName(value: string | null | undefined, fallback: string): string {
  return value && !INVISIBLE_NAME.test(value) ? value : fallback;
}

function videoIdOf(source: Record<string, unknown>): string | null {
  const url = typeof source['url'] === 'string' ? source['url'] : '';
  return BILIBILI_VIDEO_URL.exec(url)?.[1] ?? null;
}

function sourceTitle(source: Record<string, unknown> | null | undefined): string {
  const title = source?.['title'];
  return typeof title === 'string' ? title.trim() : '';
}

@Injectable()
export class OverviewService {
  constructor(private readonly prisma: PrismaService) {}

  async getOverview(): Promise<OverviewSnapshot> {
    const now = new Date();
    const from = new Date(now.getTime() - DAY_MS);

    const channels = await this.prisma.chatChannel.findMany({
      orderBy: { createdAt: 'asc' },
      include: {
        persona: { select: { id: true, name: true, accent: true } },
        mindSettings: {
          select: { mode: true, heartbeatEnabled: true, proactiveEnabled: true },
        },
      },
    });
    const channelIds = channels.map((channel) => channel.id);
    const personaIds = channels.flatMap((channel) => (channel.persona ? [channel.persona.id] : []));

    const [
      providerCount,
      states,
      focuses,
      messageStats,
      conversationStats,
      pendingStats,
      changeRows,
      longEvents,
      intentions,
      learning,
      closures,
      journals,
      failedStats,
      failedRuns,
    ] = await Promise.all([
      this.prisma.modelProvider.count(),
      this.prisma.personaState.findMany({
        where: { personaId: { in: personaIds } },
        select: {
          personaId: true,
          currentActivity: true,
          activitySince: true,
          location: true,
          energy: true,
          moodValence: true,
          socialBattery: true,
          stress: true,
          nextWakeAt: true,
          lastHeartbeatAt: true,
        },
      }),
      this.prisma.personaFocus.findMany({
        where: { personaId: { in: personaIds }, status: 'ACTIVE' },
        orderBy: { updatedAt: 'desc' },
        select: { personaId: true, kind: true, goal: true, startedAt: true },
      }),
      this.prisma.chatMessageRecord.groupBy({
        by: ['channelId', 'isSelf'],
        where: { channelId: { in: channelIds }, sentAt: { gte: from } },
        _count: { _all: true },
      }),
      this.prisma.chatConversation.groupBy({
        by: ['channelId'],
        where: { channelId: { in: channelIds }, lastMessageAt: { gte: from } },
        _count: { _all: true },
      }),
      this.prisma.agentAction.groupBy({
        by: ['channelId'],
        where: { channelId: { in: channelIds }, status: 'PENDING' },
        _count: { _all: true },
      }),
      this.prisma.personaChangeLog.findMany({
        where: {
          personaId: { in: personaIds },
          createdAt: { gte: from },
          OR: [
            { scope: 'RELATION' },
            { scope: 'GROUP' },
            { scope: 'SELF' },
            { scope: 'STATE', field: 'moodValence' },
          ],
        },
        orderBy: { createdAt: 'desc' },
        take: CHANGE_SCAN_LIMIT,
        select: {
          id: true,
          personaId: true,
          scope: true,
          targetId: true,
          field: true,
          beforeValue: true,
          afterValue: true,
          delta: true,
          reason: true,
          createdAt: true,
        },
      }),
      this.prisma.personaLongEvent.findMany({
        where: {
          personaId: { in: personaIds },
          OR: [{ startedAt: { gte: from } }, { endedAt: { gte: from } }],
        },
        orderBy: { updatedAt: 'desc' },
        take: 12,
        select: {
          id: true,
          personaId: true,
          kind: true,
          title: true,
          status: true,
          startedAt: true,
          endedAt: true,
          effects: true,
        },
      }),
      this.prisma.agentIntention.findMany({
        where: {
          personaId: { in: personaIds },
          createdAt: { gte: from },
          status: 'PENDING',
        },
        orderBy: { createdAt: 'desc' },
        take: 8,
        select: {
          id: true,
          personaId: true,
          channelId: true,
          targetType: true,
          targetId: true,
          need: true,
          seed: true,
          reason: true,
          createdAt: true,
        },
      }),
      this.prisma.mindLearningLog.findMany({
        where: { personaId: { in: personaIds }, finishedAt: { gte: from }, status: 'SUCCEEDED' },
        orderBy: { finishedAt: 'desc' },
        take: 6,
        select: {
          id: true,
          personaId: true,
          channelId: true,
          summary: true,
          sources: true,
          finishedAt: true,
        },
      }),
      this.prisma.chatConversation.findMany({
        where: { channelId: { in: channelIds }, closureClosedAt: { gte: from } },
        orderBy: { closureClosedAt: 'desc' },
        take: 6,
        select: {
          id: true,
          channelId: true,
          kind: true,
          name: true,
          closureReason: true,
          closureSummary: true,
          closureClosedAt: true,
        },
      }),
      this.prisma.personaJournal.findMany({
        where: { personaId: { in: personaIds }, createdAt: { gte: from } },
        orderBy: { createdAt: 'desc' },
        take: 3,
        select: {
          id: true,
          personaId: true,
          channelId: true,
          date: true,
          content: true,
          createdAt: true,
        },
      }),
      this.prisma.agentRun.groupBy({
        by: ['channelId'],
        where: {
          channelId: { in: channelIds },
          personaId: { in: personaIds },
          status: 'FAILED',
          startedAt: { gte: from },
        },
        _count: { _all: true },
      }),
      this.prisma.agentRun.findMany({
        where: {
          channelId: { in: channelIds },
          personaId: { in: personaIds },
          status: 'FAILED',
          startedAt: { gte: from },
        },
        orderBy: { startedAt: 'desc' },
        take: 6,
        select: { id: true, channelId: true, personaId: true, error: true, startedAt: true },
      }),
    ]);

    const personaChannel = new Map<string, ChannelContext>();
    for (const channel of channels) {
      if (!channel.persona) continue;
      personaChannel.set(channel.persona.id, {
        channel: { id: channel.id, displayName: channel.displayName, status: channel.status },
        personaName: channel.persona.name,
      });
    }

    const stateByPersona = new Map(states.map((state) => [state.personaId, state]));
    const focusByPersona = new Map<string, (typeof focuses)[number]>();
    for (const focus of focuses) {
      if (!focusByPersona.has(focus.personaId)) {
        focusByPersona.set(focus.personaId, focus);
      }
    }

    const incoming = new Map<string, number>();
    const outgoing = new Map<string, number>();
    for (const row of messageStats) {
      const target = row.isSelf ? outgoing : incoming;
      target.set(row.channelId, (target.get(row.channelId) ?? 0) + row._count._all);
    }
    const conversationCounts = new Map(
      conversationStats.map((row) => [row.channelId, row._count._all]),
    );
    const pendingCounts = new Map(pendingStats.map((row) => [row.channelId, row._count._all]));
    const failedCounts = new Map(failedStats.map((row) => [row.channelId, row._count._all]));

    const overviewChannels: OverviewChannel[] = channels.map((channel) => {
      const persona = channel.persona
        ? {
            id: channel.persona.id,
            name: channel.persona.name,
            accent: channel.persona.accent === 'jade' ? ('jade' as const) : ('brass' as const),
          }
        : null;
      const state = persona ? stateByPersona.get(persona.id) : null;
      const focus = persona ? focusByPersona.get(persona.id) : null;
      return {
        id: channel.id,
        displayName: channel.displayName,
        accountId: channel.accountId,
        avatarUrl: channel.avatarUrl,
        status: channel.status,
        lastError: channel.lastError,
        persona,
        mind: channel.mindSettings
          ? {
              mode: channel.mindSettings.mode,
              heartbeatEnabled: channel.mindSettings.heartbeatEnabled,
              proactiveEnabled: channel.mindSettings.proactiveEnabled,
            }
          : null,
        state: state
          ? {
              activity: state.currentActivity,
              activitySince: state.activitySince?.toISOString() ?? null,
              location: state.location,
              energy: state.energy,
              moodValence: state.moodValence,
              socialBattery: state.socialBattery,
              stress: state.stress,
              nextWakeAt: state.nextWakeAt?.toISOString() ?? null,
              lastHeartbeatAt: state.lastHeartbeatAt?.toISOString() ?? null,
            }
          : null,
        focus: focus
          ? {
              kind: focus.kind as 'CHAT' | 'PHONE',
              goal: focus.goal,
              startedAt: focus.startedAt.toISOString(),
            }
          : null,
        stats: {
          incoming: incoming.get(channel.id) ?? 0,
          outgoing: outgoing.get(channel.id) ?? 0,
          conversations: conversationCounts.get(channel.id) ?? 0,
          pendingActions: pendingCounts.get(channel.id) ?? 0,
        },
      };
    });

    const health = {
      channelsOnline: channels.filter((channel) => channel.status === 'ONLINE').length,
      channelsTotal: channels.length,
      mindsLive: channels.filter((channel) => channel.mindSettings?.mode === 'LIVE').length,
      mindsActive: channels.filter(
        (channel) => channel.mindSettings && channel.mindSettings.mode !== 'OFF',
      ).length,
      pendingActions: pendingStats.reduce((sum, row) => sum + row._count._all, 0),
      providerCount,
      lastHeartbeatAt:
        states
          .map((state) => state.lastHeartbeatAt)
          .filter((value): value is Date => value !== null)
          .sort((left, right) => right.getTime() - left.getTime())[0]
          ?.toISOString() ?? null,
    };

    const events = await this.buildEvents({
      changeRows,
      longEvents,
      intentions,
      learning,
      closures,
      journals,
      personaChannel,
    });

    const attention = this.buildAttention({
      channels: overviewChannels,
      providerCount,
      failedCounts,
      failedRuns,
    });

    return {
      generatedAt: now.toISOString(),
      health,
      channels: overviewChannels,
      events: events
        .sort((left, right) => right.occurredAt.localeCompare(left.occurredAt))
        .slice(0, EVENT_LIMIT),
      attention: attention.sort(
        (left, right) =>
          SEVERITY_RANK[left.severity] - SEVERITY_RANK[right.severity] ||
          left.title.localeCompare(right.title),
      ),
    };
  }

  private async buildEvents(input: {
    changeRows: ChangeRow[];
    longEvents: Array<{
      id: string;
      personaId: string;
      kind: string;
      title: string;
      status: string;
      startedAt: Date;
      endedAt: Date | null;
      effects: unknown;
    }>;
    intentions: Array<{
      id: string;
      personaId: string;
      channelId: string;
      targetType: string;
      targetId: string;
      need: string;
      seed: string;
      reason: string;
      createdAt: Date;
    }>;
    learning: Array<{
      id: string;
      personaId: string;
      channelId: string;
      summary: string;
      sources: unknown;
      finishedAt: Date | null;
    }>;
    closures: Array<{
      id: string;
      channelId: string;
      kind: string;
      name: string;
      closureReason: string | null;
      closureSummary: string | null;
      closureClosedAt: Date | null;
    }>;
    journals: Array<{
      id: string;
      personaId: string;
      channelId: string;
      date: string;
      content: string;
      createdAt: Date;
    }>;
    personaChannel: Map<string, ChannelContext>;
  }): Promise<OverviewEvent[]> {
    const events: OverviewEvent[] = [];
    const contextOf = (personaId: string): ChannelContext | null =>
      input.personaChannel.get(personaId) ?? null;

    const linkOf = (
      context: ChannelContext,
      page: OverviewLink['page'],
      tab?: string,
    ): OverviewLink => ({ page, channelId: context.channel.id, ...(tab ? { tab } : {}) });

    const push = (event: OverviewEvent | null): void => {
      if (event) events.push(event);
    };

    const relationFields = new Map<string, Map<string, FieldSum>>();
    const groupFields = new Map<string, Map<string, FieldSum>>();
    const selfFields = new Map<string, Map<string, FieldSum>>();
    const moodByPersona = new Map<
      string,
      { first: number; last: number; reason: string; occurredAt: Date }
    >();

    for (const row of input.changeRows) {
      if (row.scope === 'STATE') {
        if (row.field !== 'moodValence' || typeof row.afterValue !== 'number') continue;
        const current = moodByPersona.get(row.personaId);
        if (!current) {
          moodByPersona.set(row.personaId, {
            first: typeof row.beforeValue === 'number' ? row.beforeValue : row.afterValue,
            last: row.afterValue,
            reason: row.reason,
            occurredAt: row.createdAt,
          });
        } else if (typeof row.beforeValue === 'number') {
          current.first = row.beforeValue;
        }
        continue;
      }
      if (row.delta === null || typeof row.delta !== 'number') continue;
      const target =
        row.scope === 'RELATION'
          ? relationFields
          : row.scope === 'GROUP'
            ? groupFields
            : selfFields;
      const targetKey = row.scope === 'SELF' ? row.personaId : `${row.personaId}:${row.targetId}`;
      let fields = target.get(targetKey);
      if (!fields) {
        fields = new Map();
        target.set(targetKey, fields);
      }
      const existing = fields.get(row.field);
      if (existing) {
        existing.sum += row.delta;
      } else {
        fields.set(row.field, {
          field: row.field,
          sum: row.delta,
          reason: row.reason,
          occurredAt: row.createdAt,
        });
      }
    }

    const personTargets = new Set<string>();
    const conversationTargets = new Set<string>();
    for (const key of relationFields.keys()) {
      const [, targetId] = key.split(':');
      if (targetId) personTargets.add(targetId);
    }
    for (const [key] of groupFields) {
      const [, targetId] = key.split(':');
      if (targetId) conversationTargets.add(targetId);
    }
    for (const intention of input.intentions) {
      if (intention.targetType === 'GROUP') {
        conversationTargets.add(intention.targetId);
      } else {
        personTargets.add(intention.targetId);
      }
    }

    const [contacts, conversations] = await Promise.all([
      personTargets.size > 0
        ? this.prisma.chatContact.findMany({
            where: {
              OR: [{ id: { in: [...personTargets] } }, { externalId: { in: [...personTargets] } }],
            },
            select: { id: true, channelId: true, externalId: true, nickname: true },
          })
        : Promise.resolve([]),
      conversationTargets.size > 0
        ? this.prisma.chatConversation.findMany({
            where: { id: { in: [...conversationTargets] } },
            select: { id: true, name: true },
          })
        : Promise.resolve([]),
    ]);
    const contactById = new Map(contacts.map((contact) => [contact.id, contact]));
    const contactByExternal = new Map(
      contacts.map((contact) => [`${contact.channelId}:${contact.externalId}`, contact]),
    );
    const conversationById = new Map(
      conversations.map((conversation) => [conversation.id, conversation]),
    );
    const contactName = (personaId: string, targetId: string): string => {
      const context = contextOf(personaId);
      const contact =
        contactById.get(targetId) ??
        (context ? contactByExternal.get(`${context.channel.id}:${targetId}`) : undefined);
      return readableName(contact?.nickname, '一个联系人');
    };

    const topFields = (fields: Map<string, FieldSum>, limit = 2): FieldSum[] =>
      [...fields.values()]
        .sort((left, right) => Math.abs(right.sum) - Math.abs(left.sum))
        .slice(0, limit);

    const relationCandidates = [...relationFields.entries()]
      .map(([key, fields]) => ({
        key,
        top: topFields(fields),
      }))
      .filter((entry) => entry.top[0] && Math.abs(entry.top[0].sum) >= 2)
      .sort((left, right) => Math.abs(right.top[0]!.sum) - Math.abs(left.top[0]!.sum))
      .slice(0, 3);

    for (const candidate of relationCandidates) {
      const [personaId, targetId] = candidate.key.split(':');
      if (!personaId || !targetId) continue;
      const context = contextOf(personaId);
      if (!context) continue;
      const top = candidate.top;
      const dominant = top[0]!;
      const name = contactName(personaId, targetId);
      const detail = top
        .map((field) => `${RELATION_LABELS.get(field.field) ?? field.field} ${signed(field.sum)}`)
        .join(' · ');
      push({
        id: `relation:${personaId}:${targetId}`,
        kind: 'RELATION',
        tone: dominant.sum > 0 ? 'jade' : 'signal',
        occurredAt: dominant.occurredAt.toISOString(),
        title: dominant.sum > 0 ? `和「${name}」更亲近了` : `和「${name}」之间有些降温`,
        detail: `${detail}${dominant.reason ? ` · ${clip(dominant.reason, 60)}` : ''}`,
        channelId: context.channel.id,
        channelName: context.channel.displayName,
        personaName: context.personaName,
        link: linkOf(context, '/mind', 'relations'),
      });
    }

    const groupCandidates = [...groupFields.entries()]
      .map(([key, fields]) => ({ key, top: topFields(fields) }))
      .filter((entry) => entry.top[0] && Math.abs(entry.top[0].sum) >= 2)
      .sort((left, right) => Math.abs(right.top[0]!.sum) - Math.abs(left.top[0]!.sum))
      .slice(0, 2);

    for (const candidate of groupCandidates) {
      const [personaId, targetId] = candidate.key.split(':');
      if (!personaId || !targetId) continue;
      const context = contextOf(personaId);
      if (!context) continue;
      const top = candidate.top;
      const dominant = top[0]!;
      const name = conversationById.get(targetId)?.name ?? '群里';
      const detail = top
        .map((field) => `${GROUP_FIELD_LABELS[field.field] ?? field.field} ${signed(field.sum)}`)
        .join(' · ');
      push({
        id: `group:${personaId}:${targetId}`,
        kind: 'GROUP',
        tone: dominant.sum > 0 ? 'jade' : 'signal',
        occurredAt: dominant.occurredAt.toISOString(),
        title: dominant.sum > 0 ? `在「${name}」里更放松了` : `在「${name}」里有些绷着`,
        detail: `${detail}${dominant.reason ? ` · ${clip(dominant.reason, 60)}` : ''}`,
        channelId: context.channel.id,
        channelName: context.channel.displayName,
        personaName: context.personaName,
        link: linkOf(context, '/mind', 'groups'),
      });
    }

    const selfCandidates = [...selfFields.entries()]
      .map(([personaId, fields]) => ({ personaId, field: topFields(fields, 1)[0] }))
      .filter(
        (entry): entry is { personaId: string; field: FieldSum } =>
          Boolean(entry.field) && Math.abs(entry.field!.sum) >= 2,
      )
      .sort((left, right) => Math.abs(right.field.sum) - Math.abs(left.field.sum))
      .slice(0, 2);

    for (const candidate of selfCandidates) {
      const context = contextOf(candidate.personaId);
      if (!context) continue;
      const { field: top } = candidate;
      const label = SELF_FIELD_LABELS[top.field] ?? top.field;
      push({
        id: `self:${candidate.personaId}:${top.field}`,
        kind: 'SELF',
        tone: 'brass',
        occurredAt: top.occurredAt.toISOString(),
        title: `「${label}」${top.sum > 0 ? '上升' : '下降'} ${Math.abs(top.sum)}`,
        detail: top.reason ? clip(top.reason, 80) : '在一段相处里慢慢发生变化。',
        channelId: context.channel.id,
        channelName: context.channel.displayName,
        personaName: context.personaName,
        link: linkOf(context, '/mind', 'changes'),
      });
    }

    const longCandidates = [...input.longEvents]
      .sort(
        (left, right) =>
          (right.endedAt ?? right.startedAt).getTime() - (left.endedAt ?? left.startedAt).getTime(),
      )
      .slice(0, 3);

    for (const [personaId, mood] of moodByPersona) {
      const context = contextOf(personaId);
      if (!context) continue;
      const difference = mood.last - mood.first;
      if (Math.abs(difference) < 10) continue;
      push({
        id: `mood:${personaId}:${mood.occurredAt.toISOString()}`,
        kind: 'MOOD',
        tone: difference > 0 ? 'jade' : 'signal',
        occurredAt: mood.occurredAt.toISOString(),
        title:
          difference > 0
            ? `心情好转，从「${moodLabel(mood.first)}」到「${moodLabel(mood.last)}」`
            : `心情走低，从「${moodLabel(mood.first)}」到「${moodLabel(mood.last)}」`,
        detail: mood.reason ? clip(mood.reason, 80) : `24 小时内变化 ${signed(difference)}。`,
        channelId: context.channel.id,
        channelName: context.channel.displayName,
        personaName: context.personaName,
        link: linkOf(context, '/mind', 'focus'),
      });
    }

    for (const event of longCandidates) {
      const context = contextOf(event.personaId);
      if (!context) continue;
      const label = event.title || event.kind;
      const ended = event.endedAt !== null;
      const occurredAt = event.endedAt ?? event.startedAt;
      const actualMinutes = effectNumber(event.effects, 'actualMinutes');
      const duration = ended
        ? formatMinutes(actualMinutes ?? minutesBetween(event.startedAt, occurredAt))
        : null;
      const effectReason = effectText(event.effects, 'reason');
      const activity = effectText(event.effects, 'activity');
      push({
        id: `long:${event.id}`,
        kind: 'LONG_EVENT',
        tone: 'mist',
        occurredAt: occurredAt.toISOString(),
        title: ended ? `结束了「${label}」` : `还在「${label}」`,
        detail: ended
          ? `持续 ${duration}${effectReason ? ` · ${clip(effectReason, 70)}` : ''}`
          : `${activity ? `${clip(activity, 50)} · ` : ''}还没有计划结束时间。`,
        channelId: context.channel.id,
        channelName: context.channel.displayName,
        personaName: context.personaName,
        link: linkOf(context, '/mind', 'focus'),
      });
    }

    for (const intention of input.intentions.slice(0, 2)) {
      const context = contextOf(intention.personaId);
      if (!context) continue;
      const name =
        intention.targetType === 'GROUP'
          ? readableName(conversationById.get(intention.targetId)?.name, '群里')
          : contactName(intention.personaId, intention.targetId);
      const need = NEED_LABELS[intention.need] ?? '说句话';
      push({
        id: `intention:${intention.id}`,
        kind: 'INTENTION',
        tone: 'brass',
        occurredAt: intention.createdAt.toISOString(),
        title: `想找「${name}」${need}`,
        detail: clip(intention.seed || intention.reason, 90) || '还没想好怎么开口。',
        channelId: context.channel.id,
        channelName: context.channel.displayName,
        personaName: context.personaName,
        link: linkOf(context, '/mind', 'plans'),
      });
    }

    const learningSessions = input.learning.slice(0, 2);
    const learningVideoIds = new Set<string>();
    for (const session of learningSessions) {
      const sources = Array.isArray(session.sources) ? session.sources : [];
      for (const source of sources) {
        const record = jsonRecord(source);
        const videoId = record ? videoIdOf(record) : null;
        if (videoId) learningVideoIds.add(videoId);
      }
    }
    const learningVideoTitles = new Map<string, string>();
    if (learningVideoIds.size > 0) {
      const rows = await this.prisma.videoInsight.findMany({
        where: { videoId: { in: [...learningVideoIds] } },
        select: { videoId: true, title: true },
      });
      for (const row of rows) {
        if (row.title) learningVideoTitles.set(row.videoId, row.title);
      }
    }

    for (const session of learningSessions) {
      const context = contextOf(session.personaId);
      if (!context) continue;
      const sources = Array.isArray(session.sources) ? session.sources : [];
      const records = sources
        .map((source) => jsonRecord(source))
        .filter((source): source is Record<string, unknown> => source !== null);
      const video = records.find((source) => videoIdOf(source) !== null);
      const titled = records.map(sourceTitle).filter((title) => title.length > 0);
      const ordinary = titled.find((title) => !GENERIC_SOURCE_TITLE.test(title));
      const title =
        (video ? learningVideoTitles.get(videoIdOf(video) ?? '') : '') ||
        sourceTitle(video) ||
        ordinary ||
        titled[0] ||
        (video ? 'B 站视频' : '看了一会儿东西');
      push({
        id: `learning:${session.id}`,
        kind: 'LEARNING',
        tone: 'mist',
        occurredAt: (session.finishedAt ?? new Date()).toISOString(),
        title: `看了「${clip(title, 36)}」`,
        detail: session.summary ? clip(session.summary, 100) : `读完了 ${sources.length} 个来源。`,
        channelId: context.channel.id,
        channelName: context.channel.displayName,
        personaName: context.personaName,
        link: linkOf(context, '/mind', 'learning'),
      });
    }

    for (const closure of input.closures.slice(0, 2)) {
      if (!closure.closureClosedAt) continue;
      const context =
        [...input.personaChannel.values()].find((item) => item.channel.id === closure.channelId) ??
        null;
      if (!context) continue;
      const reason = closure.closureReason
        ? (CLOSURE_LABELS[closure.closureReason] ?? closure.closureReason)
        : '自然收尾';
      push({
        id: `closure:${closure.id}:${closure.closureClosedAt.toISOString()}`,
        kind: 'CLOSURE',
        tone: 'mist',
        occurredAt: closure.closureClosedAt.toISOString(),
        title: `和「${readableName(closure.name, '一个会话')}」聊到一个段落`,
        detail: clip(closure.closureSummary, 90) || `这次是${reason}。`,
        channelId: context.channel.id,
        channelName: context.channel.displayName,
        personaName: context.personaName,
        link: linkOf(context, '/connections'),
      });
    }

    for (const journal of input.journals.slice(0, 1)) {
      const context = contextOf(journal.personaId);
      if (!context) continue;
      push({
        id: `journal:${journal.id}`,
        kind: 'JOURNAL',
        tone: 'brass',
        occurredAt: journal.createdAt.toISOString(),
        title: `写下了 ${journal.date} 的日记`,
        detail: clip(journal.content.split('\n')[0], 100),
        channelId: context.channel.id,
        channelName: context.channel.displayName,
        personaName: context.personaName,
        link: linkOf(context, '/mind', 'journal'),
      });
    }

    return events;
  }

  private buildAttention(input: {
    channels: OverviewChannel[];
    providerCount: number;
    failedCounts: Map<string, number>;
    failedRuns: Array<{
      id: string;
      channelId: string;
      personaId: string;
      error: string | null;
      startedAt: Date;
    }>;
  }): OverviewAttention[] {
    const attention: OverviewAttention[] = [];

    if (input.providerCount === 0) {
      attention.push({
        id: 'provider:none',
        kind: 'NO_PROVIDER',
        severity: 'high',
        title: '还没有可用的模型渠道',
        detail: '心智对话、图片识别和人格写作都需要先配置一个模型渠道。',
        link: { page: '/settings' },
      });
    }

    for (const channel of input.channels) {
      if (channel.status === 'ERROR' || channel.status === 'OFFLINE') {
        attention.push({
          id: `channel-error:${channel.id}`,
          kind: 'CHANNEL_ERROR',
          severity: channel.status === 'ERROR' ? 'high' : 'medium',
          title:
            channel.status === 'ERROR'
              ? `「${channel.displayName}」连接异常`
              : `「${channel.displayName}」当前离线`,
          detail:
            clip(channel.lastError, 100) ||
            (channel.status === 'ERROR'
              ? 'NapCat 返回了错误，需要重新检查连接。'
              : 'NapCat 连接已断开，重新连上后消息才会继续进来。'),
          link: { page: '/connections' },
        });
      }
      if (!channel.persona) {
        attention.push({
          id: `no-persona:${channel.id}`,
          kind: 'NO_PERSONA',
          severity: 'low',
          title: `「${channel.displayName}」还没绑定人格`,
          detail: '接入渠道后需要绑定一份人格快照，心智才会开始工作。',
          link: { page: '/connections' },
        });
      }
      if (channel.stats.pendingActions > 0) {
        attention.push({
          id: `pending:${channel.id}`,
          kind: 'PENDING_ACTIONS',
          severity: 'medium',
          title: `有 ${channel.stats.pendingActions} 个动作等你确认`,
          detail: channel.persona
            ? `「${channel.persona.name}」的动作停在这里，确认后才会执行。`
            : '这些动作停在这里，等你确认后才会执行。',
          link: { page: '/mind', channelId: channel.id, tab: 'runs' },
        });
      }
      const failed = input.failedCounts.get(channel.id) ?? 0;
      if (failed > 0) {
        const latest = input.failedRuns.find((run) => run.channelId === channel.id);
        attention.push({
          id: `failed:${channel.id}`,
          kind: 'RUN_FAILED',
          severity: 'medium',
          title: `过去 24 小时有 ${failed} 次运行失败`,
          detail: clip(latest?.error, 90) || '可以到运行轨迹里看看失败在哪一步。',
          link: { page: '/mind', channelId: channel.id, tab: 'runs' },
        });
      }
    }

    return attention;
  }
}
