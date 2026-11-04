import { Injectable } from '@nestjs/common';
import type { MindEmotion, PersonaMemoryRecord, SocialRead } from '@inkseek/shared';
import type { PersonaState } from '../generated/prisma/client.js';
import {
  clamp,
  isQuietHour,
  localHour,
  readString,
  readStringArray,
  type MindScene,
  type SceneCastMember,
} from './mind.types.js';

export interface SocialDecision {
  read: SocialRead;
  engage: boolean;
  reason: string;
  target: SceneCastMember | null;
  mentioned: boolean;
  sleeping: boolean;
  secretCount: number;
}

const CONFLICT_PATTERN = /滚|闭嘴|讨厌|恶心|烦|吵|骂|挑衅|废物|傻|蠢|去死|别来|拉黑|决裂/u;
const AFFECTION_PATTERN = /喜欢|想你|抱抱|可爱|心动|爱你|贴贴|晚安|早安|辛苦了|谢谢/u;
const QUESTION_PATTERN = /[?？]|吗|呢|怎么|为什么|要不要|能不能|有没有/u;

@Injectable()
export class MindSocialService {
  buildDecision(input: {
    scene: MindScene;
    state: PersonaState;
    memories: readonly PersonaMemoryRecord[];
  }): SocialDecision {
    const { scene, state } = input;
    const lastInbound = [...scene.messages].reverse().find((message) => !message.isSelf) ?? null;
    const target = lastInbound
      ? (scene.cast.find((member) => member.contactId === lastInbound.senderId) ?? null)
      : null;
    const targetRelationship = target?.relationship ?? null;
    const personas = scene.persona.values as Record<string, unknown> | null;
    const timeZone = readString(personas?.['time_zone']) || null;
    const hour = localHour(new Date(), timeZone);
    const quiet = isQuietHour(hour, null);
    const mentioned = isMentioned(scene, personas);
    const sleeping = quiet || (state.energy < 20 && state.currentActivity.includes('睡'));
    const text = lastInbound?.text ?? '';

    const affinity = targetRelationship?.affinity ?? 0;
    const trust = targetRelationship?.trust ?? 0;
    const hostility = targetRelationship?.hostility ?? 0;
    const attraction = targetRelationship?.attraction ?? 0;
    const obligation = targetRelationship?.obligation ?? 0;
    const familiarity = targetRelationship?.familiarity ?? 0;
    const isGroup = scene.conversation.kind === 'GROUP';
    const comfort = isGroup ? (scene.stance?.comfort ?? 0) : 0;
    const audienceRisk = isGroup ? (scene.stance?.audienceRisk ?? 0) : 0;
    const groupAttention = isGroup ? (scene.stance?.attention ?? 0) : 0;
    const speakRate = isGroup ? (scene.stance?.speakRate ?? 0) : 0;
    const mentionBonus = mentioned ? 22 : 0;
    const questionBonus = QUESTION_PATTERN.test(text) ? 10 : 0;
    const conflict = CONFLICT_PATTERN.test(text);
    const affection = AFFECTION_PATTERN.test(text);
    const secretCount = input.memories.filter((memory) => memory.visibility === 'PRIVATE').length;

    const desire = clamp(
      30 +
        affinity * 0.32 +
        obligation * 0.2 +
        state.moodValence * 0.15 +
        mentionBonus +
        questionBonus +
        (conflict ? 12 : 0) +
        (affection ? 6 : 0) -
        hostility * 0.25,
      -100,
      100,
    );
    const risk = clamp(
      (isGroup ? audienceRisk * 0.4 + (50 - comfort) * 0.3 + 8 : 0) +
        hostility * 0.2 +
        secretCount * 7 +
        (sleeping ? 18 : 0),
      0,
      100,
    );
    const obligationScore = clamp(
      obligation * 0.55 + trust * 0.1 + familiarity * 0.1 + (conflict ? 10 : 0),
      0,
      100,
    );
    const attention = clamp(
      (isGroup ? groupAttention * 0.25 : 0) +
        affinity * 0.18 +
        state.attention * 0.35 +
        mentionBonus +
        questionBonus +
        (conflict ? 15 : 0),
      0,
      100,
    );

    const broadcast = moodLabel(state);
    const felt = inferFelt({
      text,
      affinity,
      hostility,
      attraction,
      moodValence: state.moodValence,
      targetName: target?.nickname ?? lastInbound?.senderName ?? '',
      conflict,
      affection,
    });

    const hardConstraints: string[] = [];
    const reasons: string[] = [`我的全局底色是「${broadcast}」，它对所有人都生效`];
    if (targetRelationship && scene.cast.length > 0) {
      reasons.push(
        `对 ${target?.nickname ?? '对方'} 的好感 ${affinity}、敌意 ${hostility}、亏欠 ${obligation}`,
      );
    }
    if (mentioned) reasons.push('消息点名或@了我');
    if (conflict) reasons.push('消息里有冲突信号');
    if (affection) reasons.push('消息里有亲近信号');
    if (secretCount > 0) {
      hardConstraints.push(`有 ${secretCount} 条私密记忆不可在场景中说出`);
    }
    if (quiet) hardConstraints.push('当前是安静时段');
    if (targetRelationship && targetRelationship.hostility > 60) {
      hardConstraints.push('对目标有较强敌意，避免失控');
    }

    const blocked =
      targetRelationship?.blocked ||
      (targetRelationship?.mutedUntil &&
        new Date(targetRelationship.mutedUntil).getTime() > Date.now());
    if (blocked) {
      hardConstraints.push('已将对方拉黑或静音');
    }
    if (isGroup && scene.stance?.mentionOnly && !mentioned) {
      hardConstraints.push('本群仅被@才回');
    }

    const nonNegotiable = readStringArray(personas?.['non_negotiable']);
    if (nonNegotiable.length > 0) {
      hardConstraints.push(`底线：${nonNegotiable.join('、')}`);
    }

    const suggestedStance = pickStance({
      blocked: Boolean(blocked),
      mentionOnly: Boolean(scene.stance?.mentionOnly && !mentioned),
      risk,
      hostility,
      attraction,
      affinity,
      obligation: obligationScore,
      conflict,
      affection,
      sleeping,
      broadcast,
    });

    const read: SocialRead = {
      attention,
      desire,
      risk,
      obligation: obligationScore,
      felt,
      suggestedStance,
      reasons,
      hardConstraints,
    };

    const engage = decideEngage({
      scene,
      read,
      mentioned,
      blocked: Boolean(blocked),
      sleeping,
      speakRate,
      affinity,
      messageCount: scene.messages.length,
    });

    return {
      read,
      engage,
      reason: engage
        ? (reasons[0] ?? '自然注意到这条消息')
        : explainSilence(read, mentioned, sleeping),
      target,
      mentioned,
      sleeping,
      secretCount,
    };
  }
}

function isMentioned(scene: MindScene, personas: Record<string, unknown> | null): boolean {
  const names = [
    scene.persona.name,
    readString(personas?.['name']),
    ...readStringArray(personas?.['aliases']),
  ].filter(Boolean);
  const recent = scene.messages.slice(-4).filter((message) => !message.isSelf);
  return recent.some(
    (message) => message.mentionedSelf || names.some((name) => message.text.includes(name)),
  );
}

function inferFelt(input: {
  text: string;
  affinity: number;
  hostility: number;
  attraction: number;
  moodValence: number;
  targetName: string;
  conflict: boolean;
  affection: boolean;
}): MindEmotion {
  if (input.conflict) {
    const label = input.affinity > 40 ? '委屈' : input.hostility > 40 ? '生气' : '不悦';
    return {
      label,
      intensity: clamp(45 + input.hostility * 0.3, 0, 100),
      target: input.targetName,
    };
  }
  if (input.moodValence < -25 && input.affinity <= 65) {
    return { label: '低落', intensity: 45, target: input.targetName };
  }
  if (input.affection || (input.affinity > 55 && input.attraction > 40)) {
    return {
      label: input.attraction > 50 ? '心动' : '开心',
      intensity: clamp(40 + input.affinity * 0.3, 0, 100),
      target: input.targetName,
    };
  }
  return { label: '平静', intensity: 30, target: input.targetName };
}

function pickStance(input: {
  blocked: boolean;
  mentionOnly: boolean;
  risk: number;
  hostility: number;
  attraction: number;
  affinity: number;
  obligation: number;
  conflict: boolean;
  affection: boolean;
  sleeping: boolean;
  broadcast: string;
}): string {
  if (input.blocked || input.mentionOnly) return '沉默';
  if (input.sleeping) return '困倦而简短';
  if (input.conflict && input.risk > 60) return '克制但带刺';
  if (input.conflict) return '防御';
  const gloomy = /低落|烦闷|倦怠|阴沉/u.test(input.broadcast);
  if (gloomy && input.affinity <= 65 && !input.affection) return '沉闷而简短';
  if (input.attraction > 55 && input.affinity > 55) return '温柔而克制';
  if (input.affinity > 60) return '温和';
  if (input.obligation > 50) return '认真';
  if (input.affection) return '自然回应';
  return '自然';
}

function moodLabel(state: PersonaState): string {
  const base =
    state.moodValence > 30
      ? '愉快'
      : state.moodValence > 10
        ? '轻松'
        : state.moodValence < -30
          ? '低落'
          : state.moodValence < -10
            ? '烦闷'
            : '平静';
  if (state.moodArousal > 70) return `亢奋·${base}`;
  if (state.moodArousal < 30) return `倦怠·${base}`;
  return base;
}

function decideEngage(input: {
  scene: MindScene;
  read: SocialRead;
  mentioned: boolean;
  blocked: boolean;
  sleeping: boolean;
  speakRate: number;
  affinity: number;
  messageCount: number;
}): boolean {
  if (input.blocked) return false;
  if (input.scene.stance?.mentionOnly && !input.mentioned) return false;
  if (input.mentioned) return true;
  if (input.scene.conversation.kind === 'PRIVATE') return input.read.attention >= 18;
  if (input.sleeping && input.affinity < 50) return false;
  if (input.read.attention < 30) return false;
  if (input.read.desire - input.read.risk * 0.6 < 5) return false;
  if (input.speakRate < 25 && input.messageCount > 6) return false;
  return true;
}

function explainSilence(read: SocialRead, mentioned: boolean, sleeping: boolean): string {
  if (sleeping) return '不在活跃状态，先不打断';
  if (!mentioned && read.attention < 30) return '没有足够引起注意';
  if (read.risk > 60) return '场合风险太高，选择不说';
  if (read.desire < 10) return '没有想介入的冲动';
  return '让话题自然过去';
}
