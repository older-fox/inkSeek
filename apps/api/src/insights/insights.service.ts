import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import {
  RELATIONSHIP_ATTRIBUTES,
  type MindInsightAskInput,
  type MindInsightAskResult,
  type MindInsightCard,
  type MindInsightEvidence,
  type MindInsightFeed,
  type MindInsightMetric,
  type MindInsightQueryInput,
  type MindInsightSeverity,
} from '@inkseek/shared';
import { LlmService } from '../ai/llm.service.js';
import { PrismaService } from '../database/prisma.service.js';
import type { ChatChannel, ChatChannelPersona } from '../generated/prisma/client.js';

const DAY_MS = 86_400_000;
const MAX_CARDS = 6;
const MAX_PER_KIND = 3;

const DAY_FORMAT = new Intl.DateTimeFormat('zh-CN', { month: '2-digit', day: '2-digit' });

const RELATION_LABELS = new Map<string, string>();
for (const attribute of RELATIONSHIP_ATTRIBUTES) {
  if (attribute.storage.type === 'numeric') {
    RELATION_LABELS.set(attribute.storage.field, attribute.label);
  }
}

const STYLE_DIMENSION_LABELS: Record<string, string> = {
  length: '句子长度',
  punctuation: '标点',
  particles: '语气词',
  openings: '开场',
  humor: '幽默',
  rhythm: '节奏',
  vocabulary: '用词',
  tone: '语气',
};

const TRIGGER_LABELS: Record<string, string> = {
  MESSAGE: '聊天',
  HEARTBEAT: '心跳',
  PROACTIVE: '主动',
  MANUAL: '手动',
  PHONE: '手机',
};

const SEVERITY_RANK: Record<MindInsightSeverity, number> = {
  high: 0,
  medium: 1,
  low: 2,
};

type RelationLog = {
  targetId: string;
  field: string;
  delta: number | null;
  beforeValue: unknown;
  afterValue: unknown;
  reason: string;
  source: string;
  createdAt: Date;
  runId: string | null;
};

interface RelationshipCandidate {
  card: MindInsightCard;
  score: number;
}

interface CoolingCandidate {
  card: MindInsightCard;
  score: number;
}

interface StyleCandidate {
  card: MindInsightCard;
  score: number;
}

/**
 * Longitudinal insights: detectors compute facts from the database, and the
 * model only narrates a follow-up question over those facts. There is no
 * free-form SQL and no synthetic metric the operator cannot trace.
 */
@Injectable()
export class InsightsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly llm: LlmService,
  ) {}

  async getFeed(input: MindInsightQueryInput): Promise<MindInsightFeed> {
    const channel = await this.prisma.chatChannel.findUnique({
      where: { id: input.channelId },
      include: { persona: true },
    });
    if (!channel) {
      throw new NotFoundException({ code: 'CHANNEL_NOT_FOUND', message: '渠道不存在或已被删除' });
    }
    const persona = channel.persona;
    if (!persona) {
      throw new BadRequestException({
        code: 'PERSONA_NOT_BOUND',
        message: '这个渠道还没有绑定人格，暂时无法生成洞察',
      });
    }

    const now = new Date();
    const days = input.days;
    const currentStart = new Date(now.getTime() - days * DAY_MS);
    const previousStart = new Date(now.getTime() - 2 * days * DAY_MS);

    const [
      incoming,
      outgoing,
      conversations,
      currentUsage,
      previousUsage,
      relationshipCards,
      coolingCards,
      styleCards,
    ] = await Promise.all([
      this.prisma.chatMessageRecord.count({
        where: { channelId: channel.id, isSelf: false, sentAt: { gte: currentStart } },
      }),
      this.prisma.chatMessageRecord.count({
        where: { channelId: channel.id, isSelf: true, sentAt: { gte: currentStart } },
      }),
      this.prisma.chatConversation.count({
        where: { channelId: channel.id, lastMessageAt: { gte: currentStart } },
      }),
      this.tokenUsage(channel.id, persona.id, currentStart, now),
      this.tokenUsage(channel.id, persona.id, previousStart, currentStart),
      this.relationshipShifts(channel, persona, currentStart, now, days),
      this.conversationCooling(channel, persona, currentStart, previousStart, now, days),
      this.styleDrifts(persona, currentStart, days),
    ]);

    const cards = [
      ...relationshipCards.map((item) => item.card),
      ...coolingCards.map((item) => item.card),
      ...styleCards.map((item) => item.card),
    ]
      .sort(
        (left, right) =>
          SEVERITY_RANK[left.severity] - SEVERITY_RANK[right.severity] ||
          right.confidence - left.confidence,
      )
      .slice(0, MAX_CARDS);

    return {
      generatedAt: now.toISOString(),
      windowDays: days,
      channelId: channel.id,
      personaId: persona.id,
      personaName: persona.name,
      stats: {
        messages: incoming + outgoing,
        incoming,
        outgoing,
        conversations,
      },
      usage: {
        promptTokens: currentUsage.promptTokens,
        completionTokens: currentUsage.completionTokens,
        totalTokens: currentUsage.totalTokens,
        runs: currentUsage.runs,
        averageTokens:
          currentUsage.runs > 0 ? Math.round(currentUsage.totalTokens / currentUsage.runs) : 0,
        previousTotalTokens: previousUsage.totalTokens > 0 ? previousUsage.totalTokens : null,
        byTrigger: currentUsage.byTrigger,
      },
      cards,
    };
  }

  private async tokenUsage(
    channelId: string,
    personaId: string,
    from: Date,
    to: Date,
  ): Promise<{
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
    runs: number;
    byTrigger: { trigger: string; runs: number; tokens: number }[];
  }> {
    const [rows, vision] = await Promise.all([
      this.prisma.agentRun.groupBy({
        by: ['trigger'],
        where: {
          channelId,
          personaId,
          startedAt: { gte: from, lt: to },
          OR: [{ promptTokens: { not: null } }, { completionTokens: { not: null } }],
        },
        _count: { _all: true },
        _sum: { promptTokens: true, completionTokens: true },
      }),
      // Vision calls outside a run (image descriptions, video frames,
      // screenshots) are not on AgentRun; they land in the call log. Run-scoped
      // calls already count toward their AgentRun, so exclude them here.
      this.prisma.llmCallLog.aggregate({
        where: {
          createdAt: { gte: from, lt: to },
          imageCount: { gt: 0 },
          runId: null,
          OR: [{ channelId }, { personaId }],
        },
        _count: { _all: true },
        _sum: { promptTokens: true, completionTokens: true },
      }),
    ]);
    const promptTokens =
      rows.reduce((sum, row) => sum + (row._sum.promptTokens ?? 0), 0) +
      (vision._sum.promptTokens ?? 0);
    const completionTokens =
      rows.reduce((sum, row) => sum + (row._sum.completionTokens ?? 0), 0) +
      (vision._sum.completionTokens ?? 0);
    const byTrigger = rows
      .map((row) => ({
        trigger: String(row.trigger),
        runs: row._count._all,
        tokens: (row._sum.promptTokens ?? 0) + (row._sum.completionTokens ?? 0),
      }))
      .filter((row) => row.runs > 0);
    const visionTokens = (vision._sum.promptTokens ?? 0) + (vision._sum.completionTokens ?? 0);
    if (vision._count._all > 0 && visionTokens > 0) {
      byTrigger.push({ trigger: 'VISION', runs: vision._count._all, tokens: visionTokens });
    }
    return {
      promptTokens,
      completionTokens,
      totalTokens: promptTokens + completionTokens,
      runs: rows.reduce((sum, row) => sum + row._count._all, 0),
      byTrigger: byTrigger.sort((left, right) => right.tokens - left.tokens),
    };
  }

  async ask(input: MindInsightAskInput): Promise<MindInsightAskResult> {
    const feed = await this.getFeed({ channelId: input.channelId, days: input.days });
    const card = feed.cards.find((item) => item.id === input.cardId);
    if (!card) {
      throw new NotFoundException({
        code: 'INSIGHT_NOT_FOUND',
        message: '这条洞察已经变化，刷新后再追问',
      });
    }

    const system = [
      `你是 ${feed.personaName} 的数据洞察助手，面向平台运营者。`,
      '只能根据下面列出的事实回答，不得编造数字、时间或未出现的人和事。',
      '用 2-4 句中文回答，先给结论，再给一条具体依据；如果事实不足，直接说这条数据看不出来。',
      '不要提模型、提示词、系统或推理过程，不要复述问题。',
    ].join('\n');

    const history = input.history
      .slice(-6)
      .map((message) => `${message.role === 'user' ? '运营者' : '助手'}：${message.text}`)
      .join('\n');
    const prompt = [
      `【洞察卡】${card.title}`,
      card.summary,
      `【触发原因】${card.why}`,
      `【指标】\n${formatMetrics(card.metrics)}`,
      `【证据】\n${formatEvidence(card.evidence)}`,
      `【本期 Token 用量】${formatUsage(feed.usage)}`,
      history ? `【此前的追问】\n${history}` : '',
      `【这次的问题】${input.question}`,
    ]
      .filter(Boolean)
      .join('\n\n');

    try {
      const completion = await this.llm.complete({
        prompt,
        system,
        temperature: 0.35,
        maxTokens: 800,
        source: 'insights.ask',
      });
      const answer = completion.text.trim();
      if (answer) {
        return { answer, model: completion.model, citations: card.evidence };
      }
    } catch {
      // Fall through to the deterministic answer below.
    }

    return {
      answer: fallbackAnswer(card),
      model: null,
      citations: card.evidence,
    };
  }

  private async relationshipShifts(
    channel: ChatChannel,
    persona: ChatChannelPersona,
    currentStart: Date,
    now: Date,
    days: number,
  ): Promise<RelationshipCandidate[]> {
    const logs = (await this.prisma.personaChangeLog.findMany({
      where: {
        personaId: persona.id,
        scope: 'RELATION',
        delta: { not: null },
        createdAt: { gte: currentStart, lte: now },
      },
      orderBy: { createdAt: 'desc' },
      take: 400,
      select: {
        targetId: true,
        field: true,
        delta: true,
        beforeValue: true,
        afterValue: true,
        reason: true,
        source: true,
        createdAt: true,
        runId: true,
      },
    })) as RelationLog[];

    const grouped = new Map<string, RelationLog[]>();
    for (const log of logs) {
      if (!log.targetId || !RELATION_LABELS.has(log.field)) {
        continue;
      }
      const list = grouped.get(log.targetId) ?? [];
      list.push(log);
      grouped.set(log.targetId, list);
    }
    if (grouped.size === 0) {
      return [];
    }

    const contactIds = [...grouped.keys()];
    const [contacts, relationships] = await Promise.all([
      this.prisma.chatContact.findMany({
        where: { id: { in: contactIds }, channelId: channel.id },
        select: { id: true, nickname: true },
      }),
      this.prisma.personaRelationship.findMany({
        where: { personaId: persona.id, contactId: { in: contactIds } },
      }),
    ]);
    const contactNames = new Map(contacts.map((contact) => [contact.id, contact.nickname]));
    const relationshipByContact = new Map(
      relationships.map((relationship) => [relationship.contactId, relationship]),
    );

    const candidates: RelationshipCandidate[] = [];
    for (const [contactId, entries] of grouped) {
      const name = contactNames.get(contactId);
      if (!name || entries.length < 2) {
        continue;
      }

      const fieldTotals = new Map<string, number>();
      const fieldCounts = new Map<string, number>();
      /** Values at the window start; deltas may be clamped at ±100. */
      const fieldStarts = new Map<string, number>();
      for (const entry of entries) {
        const delta = entry.delta ?? 0;
        fieldTotals.set(entry.field, (fieldTotals.get(entry.field) ?? 0) + delta);
        fieldCounts.set(entry.field, (fieldCounts.get(entry.field) ?? 0) + 1);
        if (typeof entry.beforeValue === 'number') {
          // Entries are newest-first, so the last write is the oldest change.
          fieldStarts.set(entry.field, entry.beforeValue);
        }
      }
      const relationship = relationshipByContact.get(contactId) as
        Record<string, unknown> | undefined;
      const currentOf = (field: string): number => {
        const value = relationship?.[field];
        if (typeof value === 'number') {
          return value;
        }
        const latest = entries.find((entry) => entry.field === field)?.afterValue;
        return typeof latest === 'number' ? latest : 0;
      };
      const previousOf = (field: string): number =>
        fieldStarts.get(field) ?? currentOf(field) - (fieldTotals.get(field) ?? 0);
      // Use the actual value change, not the sum of logged deltas: capped
      // updates and rows written outside the logger can make them diverge.
      const changes = [...fieldTotals.keys()]
        .map((field) => [field, currentOf(field) - previousOf(field)] as const)
        .filter(([, change]) => Math.abs(change) >= 2)
        .sort((left, right) => Math.abs(right[1]) - Math.abs(left[1]))
        .slice(0, 3);
      if (changes.length === 0) {
        continue;
      }
      const score = changes.reduce((sum, [, change]) => sum + Math.abs(change), 0);
      if (score < 6) {
        continue;
      }

      const positives = changes.filter(([, change]) => change > 0).length;
      const negatives = changes.filter(([, change]) => change < 0).length;
      const direction = negatives === 0 ? 'up' : positives === 0 ? 'down' : 'mixed';
      const deltaText = changes
        .map(([field, change]) => `${RELATION_LABELS.get(field) ?? field} ${signed(change)}`)
        .join('、');
      const currentText = changes
        .map(([field]) => `${RELATION_LABELS.get(field) ?? field} ${currentOf(field)}`)
        .join(' · ');

      const summary =
        direction === 'up'
          ? `近 ${days} 天，她对 ${name} 的${deltaText}，整体在往上走。当前${currentText}。`
          : direction === 'down'
            ? `近 ${days} 天，她对 ${name} 的${deltaText}，整体在往下掉。当前${currentText}。`
            : `近 ${days} 天，她对 ${name} 的几项关系数值同时变化：${deltaText}。当前${currentText}。`;
      const reason = entries.find((entry) => entry.reason.trim())?.reason.trim() ?? '';
      const cumulative = changes
        .map(
          ([field, change]) =>
            `${RELATION_LABELS.get(field) ?? field} ${signed(change)}（${fieldCounts.get(field) ?? 0} 次）`,
        )
        .join(' · ');
      const totalsText = changes
        .map(([field, change]) => `${RELATION_LABELS.get(field) ?? field} ${signed(change)}`)
        .join('、');
      const why = `近 ${days} 天记录到 ${entries.length} 次关系变化，累计 ${totalsText}${
        reason ? `。最近一次：${truncate(reason, 80)}` : ''
      }`;
      const topFields = new Set(changes.map(([field]) => field));
      const oldest = [...entries].reverse().find((entry) => topFields.has(entry.field));
      const evidence: MindInsightEvidence[] = [
        { label: '窗口内累计', value: cumulative },
        ...(entries.length > 4 && oldest
          ? [
              {
                label: `最早一次 · ${RELATION_LABELS.get(oldest.field) ?? oldest.field}`,
                value: `${signed(oldest.delta ?? 0)}${oldest.reason ? `｜${truncate(oldest.reason, 90)}` : ''}`,
                at: oldest.createdAt.toISOString(),
              },
            ]
          : []),
        ...entries.slice(0, 4).map((entry) => ({
          label: `${formatDay(entry.createdAt)} · ${RELATION_LABELS.get(entry.field) ?? entry.field}`,
          value: `${signed(entry.delta ?? 0)}${entry.reason ? `｜${truncate(entry.reason, 90)}` : ''}`,
          at: entry.createdAt.toISOString(),
        })),
      ];
      evidence.push({
        label: '当前关系',
        value: currentText,
      });

      const severity: MindInsightSeverity = score >= 16 ? 'high' : score >= 8 ? 'medium' : 'low';
      candidates.push({
        score,
        card: {
          id: `RELATIONSHIP_SHIFT:${persona.id}:${contactId}`,
          kind: 'RELATIONSHIP_SHIFT',
          severity,
          title:
            direction === 'down'
              ? `对「${name}」的关系在降温`
              : direction === 'up'
                ? `对「${name}」的关系在升温`
                : `对「${name}」的关系出现双向变化`,
          summary,
          why,
          confidence: clamp(45 + entries.length * 4 + Math.round(score * 2), 45, 95),
          metrics: changes.map(([field]) => ({
            label: RELATION_LABELS.get(field) ?? field,
            value: String(currentOf(field)),
            previous: String(previousOf(field)),
          })),
          evidence,
        },
      });
    }

    return candidates.sort((left, right) => right.score - left.score).slice(0, MAX_PER_KIND);
  }

  private async conversationCooling(
    channel: ChatChannel,
    persona: ChatChannelPersona,
    currentStart: Date,
    previousStart: Date,
    now: Date,
    days: number,
  ): Promise<CoolingCandidate[]> {
    const conversations = await this.prisma.chatConversation.findMany({
      where: { channelId: channel.id, lastMessageAt: { not: null } },
      orderBy: { lastMessageAt: 'desc' },
      take: 80,
      select: {
        id: true,
        name: true,
        kind: true,
        isDirect: true,
        lastMessageAt: true,
        lastMessagePreview: true,
        lastMessageSender: true,
        closureClosedAt: true,
        closureReason: true,
        closureSummary: true,
      },
    });
    if (conversations.length === 0) {
      return [];
    }

    const [currentRows, previousRows] = await Promise.all([
      this.prisma.chatMessageRecord.groupBy({
        by: ['conversationId'],
        where: { channelId: channel.id, sentAt: { gte: currentStart } },
        _count: { _all: true },
      }),
      this.prisma.chatMessageRecord.groupBy({
        by: ['conversationId'],
        where: { channelId: channel.id, sentAt: { gte: previousStart, lt: currentStart } },
        _count: { _all: true },
      }),
    ]);
    const currentByConversation = new Map(
      currentRows.map((row) => [row.conversationId, row._count._all]),
    );
    const previousByConversation = new Map(
      previousRows.map((row) => [row.conversationId, row._count._all]),
    );

    const candidates: CoolingCandidate[] = [];
    for (const conversation of conversations) {
      const current = currentByConversation.get(conversation.id) ?? 0;
      const previous = previousByConversation.get(conversation.id) ?? 0;
      if (previous < 10 || current > previous * 0.5) {
        continue;
      }
      const lastMessageAt = conversation.lastMessageAt;
      if (!lastMessageAt) {
        continue;
      }
      const silenceDays = Math.floor((now.getTime() - lastMessageAt.getTime()) / DAY_MS);
      if (silenceDays < 3) {
        continue;
      }

      const dropPercent = Math.round((1 - current / previous) * 100);
      const score = dropPercent + Math.min(24, silenceDays * 3);
      const kindLabel = conversation.kind === 'GROUP' ? '群聊' : '私聊';
      const preview = truncate(conversation.lastMessagePreview?.trim() ?? '', 80) || '（无文本）';
      const closure = conversation.closureSummary?.trim() || conversation.closureReason?.trim();
      const evidence: MindInsightEvidence[] = [
        {
          label: '最后一条',
          value: `${conversation.lastMessageSender ?? '未知'}：${preview}`,
          at: lastMessageAt.toISOString(),
        },
        {
          label: '消息量',
          value: `近 ${days} 天 ${current} 条，前 ${days} 天 ${previous} 条`,
        },
      ];
      if (closure) {
        evidence.push({
          label: '她主动收过尾',
          value: truncate(closure, 120),
          at: conversation.closureClosedAt?.toISOString(),
        });
      }

      candidates.push({
        score,
        card: {
          id: `CONVERSATION_COOLING:${persona.id}:${conversation.id}`,
          kind: 'CONVERSATION_COOLING',
          severity: dropPercent >= 70 && silenceDays >= 7 ? 'high' : 'medium',
          title: `和「${conversation.name}」的对话冷了下来`,
          summary: `近 ${days} 天「${conversation.name}」只有 ${current} 条消息，前 ${days} 天是 ${previous} 条，少了 ${dropPercent}%。最后一条停在 ${silenceDays} 天前：${preview}。`,
          why: closure
            ? `她在这段对话里主动收过尾：${truncate(closure, 80)}`
            : `消息量从 ${previous} 条降到 ${current} 条，超过 ${days} 天没有新的往来`,
          confidence: clamp(50 + Math.round(dropPercent * 0.3) + silenceDays, 50, 95),
          metrics: [
            { label: '本周期消息', value: String(current), previous: String(previous) },
            { label: '沉默天数', value: `${silenceDays} 天` },
            { label: '会话', value: kindLabel },
          ],
          evidence,
        },
      });
    }

    return candidates.sort((left, right) => right.score - left.score).slice(0, MAX_PER_KIND);
  }

  private async styleDrifts(
    persona: ChatChannelPersona,
    currentStart: Date,
    days: number,
  ): Promise<StyleCandidate[]> {
    const notes = await this.prisma.personaStyleNote.findMany({
      where: {
        personaId: persona.id,
        status: 'ACTIVE',
        confidence: { gte: 45 },
        OR: [{ lastSeenAt: { gte: currentStart } }, { promotedAt: { gte: currentStart } }],
      },
      orderBy: [{ confidence: 'desc' }, { lastSeenAt: 'desc' }],
      take: 80,
    });
    if (notes.length === 0) {
      return [];
    }

    const grouped = new Map<string, typeof notes>();
    for (const note of notes) {
      const list = grouped.get(note.dimension) ?? [];
      list.push(note);
      grouped.set(note.dimension, list);
    }

    const candidates: StyleCandidate[] = [];
    for (const [dimension, items] of grouped) {
      const label = STYLE_DIMENSION_LABELS[dimension] ?? dimension;
      const applied = items.reduce((sum, note) => sum + note.appliedCount, 0);
      const avgConfidence = Math.round(
        items.reduce((sum, note) => sum + note.confidence, 0) / items.length,
      );
      const top = items[0];
      if (!top) {
        continue;
      }
      const lead = items
        .slice(0, 2)
        .map((note) => `「${truncate(note.content, 70)}」`)
        .join('、');
      const evidence: MindInsightEvidence[] = items.slice(0, 3).map((note) => ({
        label: `${label}笔记`,
        value: truncate(note.content, 160),
        at: note.lastSeenAt.toISOString(),
      }));
      const sample = items
        .flatMap((note) =>
          Array.isArray(note.samples)
            ? note.samples.filter(
                (item): item is string => typeof item === 'string' && item.trim().length > 0,
              )
            : [],
        )
        .slice(0, 3);
      if (sample.length > 0) {
        evidence.push({
          label: '近期例句',
          value: sample.map((item) => `「${truncate(item, 60)}」`).join(' · '),
        });
      }

      candidates.push({
        score: applied + avgConfidence,
        card: {
          id: `STYLE_DRIFT:${persona.id}:${dimension}`,
          kind: 'STYLE_DRIFT',
          severity: applied >= 10 && avgConfidence >= 65 ? 'medium' : 'low',
          title: `她说话的方式在「${label}」上有了新习惯`,
          summary: `近 ${days} 天沉淀了 ${items.length} 条关于${label}的表达笔记：${lead}。这些习惯已经出现在 ${applied} 次回复里，平均置信度 ${avgConfidence}。`,
          why: truncate(top.content, 100),
          confidence: avgConfidence,
          metrics: [
            { label: '新笔记', value: String(items.length) },
            { label: '已应用', value: String(applied) },
            { label: '平均置信', value: String(avgConfidence) },
          ],
          evidence,
        },
      });
    }

    return candidates.sort((left, right) => right.score - left.score).slice(0, MAX_PER_KIND);
  }
}

function formatMetrics(metrics: readonly MindInsightMetric[]): string {
  if (metrics.length === 0) {
    return '没有额外指标';
  }
  return metrics
    .map(
      (metric) =>
        `${metric.label} ${metric.value}${metric.previous ? `（前一期 ${metric.previous}）` : ''}`,
    )
    .join('；');
}

function formatEvidence(evidence: readonly MindInsightEvidence[]): string {
  if (evidence.length === 0) {
    return '没有证据条目';
  }
  return evidence
    .map((item) => `- ${item.label}：${item.value}${item.at ? `（${item.at}）` : ''}`)
    .join('\n');
}

function formatUsage(usage: MindInsightFeed['usage']): string {
  if (usage.runs === 0) {
    return '窗口内没有心智运行记录';
  }
  const triggers = usage.byTrigger
    .map((item) => `${TRIGGER_LABELS[item.trigger] ?? item.trigger} ${item.tokens}`)
    .join('、');
  return `共 ${usage.totalTokens} tokens（输入 ${usage.promptTokens} / 输出 ${usage.completionTokens}），${usage.runs} 次运行，平均 ${usage.averageTokens}/次${
    triggers ? `；按用途：${triggers}` : ''
  }`;
}

function fallbackAnswer(card: MindInsightCard): string {
  const basis = card.evidence
    .slice(0, 2)
    .map((item) => `${item.label}：${item.value}`)
    .join('；');
  return `现有数据里能确认的是：${card.summary}${basis ? ` 依据：${basis}。` : ''}`;
}

function formatDay(value: Date): string {
  return DAY_FORMAT.format(value);
}

function signed(value: number): string {
  return value >= 0 ? `+${value}` : String(value);
}

function truncate(value: string, max: number): string {
  const text = value.trim();
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Math.round(value)));
}
