import type { PersonaMemoryRecord } from '@inkseek/shared';
import { cosineSimilarity, embedText } from './mind-vector.js';
import { clamp, personaValueText, type MindScene, type SceneMessage } from './mind.types.js';

export type MessageKind = 'ending' | 'question' | 'request' | 'ack' | 'substantive' | 'silence';

export type ConversationVerdict = 'continue' | 'linger' | 'close';

export interface InterestRead {
  /** 0-100: how much the incoming message touches what this persona cares about. */
  score: number;
  reason: string;
  topics: string[];
}

export interface ConversationRead {
  verdict: ConversationVerdict;
  /** 0-100: how naturally this exchange can end. */
  score: number;
  interest: InterestRead;
  signals: {
    lastOtherKind: MessageKind | null;
    lastSelfKind: MessageKind | null;
    ownIntent: number;
    theirIntent: number;
    topicClosure: number;
    fatigue: number;
    awaitingTheirAnswer: boolean;
    explicitEnd: boolean;
    directAddress: boolean;
    turns: number;
    sinceLastOtherMinutes: number | null;
  };
  reasons: string[];
  advice: string;
}

const WINDOW_MS = 45 * 60 * 1000;
const GROUP_QUIET_CLOSE_MS = 30 * 60 * 1000;

const END_ANY_RE =
  /(晚安|拜拜|再见|886|先这样|先这么着|先撤|溜了|去忙|下了|睡了|不聊了|回头聊|改天聊|明天聊|下次聊|到此为止)/u;
const END_STRONG_RE =
  /^(晚安|拜拜|再见|886|先这样|先这么着|先撤|溜了|去忙了?|下了|睡了|不聊了|回头聊|改天聊|明天聊|下次聊)[呀啦哦喔~～。！!？?…，,、\s]*$/u;
const QUESTION_TAIL_RE = /[?？]\s*$/u;
const QUESTION_WORD_RE =
  /(吗|嘛|么|咋|怎么|为什么|为啥|什么|哪个|哪里|哪儿|谁|多少|几点|是不是|有没有|能不能|可不可以|要不要|好不好|对不对|行不行|在不在|忙不忙|睡了吗|吃了吗)\s*[。！!…～~]*$/u;
const QUESTION_CONTAINS_RE =
  /(什么|怎么|为什么|为啥|哪个|哪里|哪儿|谁|多少|几点|是不是|有没有|能不能|可不可以|要不要)/u;
const REQUEST_RE =
  /(帮我|帮忙|麻烦你|请你|能不能帮我|可以帮我|教我|告诉我|说说|讲讲|发我|给我|推荐|查一下|搜一下|找一下|看一下|写一个|弄一个|来个|整一个)/u;
const ACK_RE =
  /^(?:嗯+|哦+|噢+|喔+|好+|行+|可以|收到|了解|明白|懂了|知道了|ok|okay|没问题|谢谢|多谢|感谢|辛苦了|哈哈+|hhh+|嘻嘻|草|艹|笑死|绝了|666|？+|\?+|在|嗯哼|确实|对的|是啊|是的|成)[呀啦哦喔呢吧啊嘛的滴嘞~～。！!？?…，,、\s]*$/iu;
const SETTLED_RE =
  /(说好了|就这么定|扯平|一言为定|成交|定了|好啦|行啦|算啦|先这样|以后再说|下次再说|不说了|不提了|到此为止|翻篇)/u;

/** Self-repetition read: which everyday topics the persona keeps bringing up. */
export interface RepetitionRead {
  topics: { text: string; count: number }[];
  /** Words from the persona's own identity that keep coming up unprompted. */
  identity: { text: string; count: number }[];
  /** Recurring sentence openings, the clearest tell of template speech. */
  openings: { text: string; count: number }[];
}

export interface BoundaryEscalation {
  phrase: string;
  count: number;
  /** The other side kept pushing after the most recent refusal. */
  continued: boolean;
}

const BOUNDARY_PATTERNS: readonly { label: string; re: RegExp }[] = [
  { label: '松开', re: /松开|放开|松手/u },
  { label: '别碰', re: /别碰|不许碰|不许乱碰|不要碰|手放好|拿开/u },
  { label: '说停', re: /说停|喊停/u },
  { label: '别这样', re: /别这样|不要这样|不行不行|真不行/u },
  { label: '别贴太近', re: /别贴|贴太近|别凑/u },
];

/**
 * Repeated-refusal read. It only reports that the other side kept pushing
 * after a refusal; how to respond stays with the planner.
 */
export function readBoundaryEscalation(scene: MindScene): BoundaryEscalation | null {
  const selfMessages = scene.messages.filter((message) => message.isSelf).slice(-16);
  if (selfMessages.length < 2) {
    return null;
  }
  const counts = new Map<string, number>();
  const lastAt = new Map<string, string>();
  for (const message of selfMessages) {
    for (const pattern of BOUNDARY_PATTERNS) {
      if (!pattern.re.test(message.text)) {
        continue;
      }
      counts.set(pattern.label, (counts.get(pattern.label) ?? 0) + 1);
      lastAt.set(pattern.label, message.sentAt);
    }
  }
  const top = [...counts.entries()].sort((left, right) => right[1] - left[1])[0];
  if (!top || top[1] < 2) {
    return null;
  }
  const [phrase, count] = top;
  const at = lastAt.get(phrase);
  const continued = Boolean(
    at && scene.messages.some((message) => !message.isSelf && message.sentAt > at),
  );
  return { phrase, count, continued };
}

const REPETITION_STOP_CHARS = new Set([
  ...'的了呢吗吧啊呀哦嗯我你他她它们这那什么怎样个一有是在不没和与或而且但因为所以如果时候现在已经还是就是不要会能要想说看给对很太又再才只来去上下里外到得地着过',
]);
const REPETITION_STOP_BIGRAMS = new Set([
  '今天',
  '明天',
  '昨天',
  '现在',
  '刚刚',
  '刚才',
  '然后',
  '就是',
  '不是',
  '这个',
  '那个',
  '什么',
  '怎么',
  '可以',
  '觉得',
  '知道',
  '没有',
  '我们',
  '你们',
  '他们',
  '自己',
  '时候',
  '东西',
  '地方',
  '感觉',
  '可能',
  '应该',
  '一下',
  '一直',
  '有点',
  '很多',
  '这些',
  '那些',
  '起来',
  '出来',
  '过去',
  '回来',
  '真的',
  '其实',
  '因为',
  '所以',
  '如果',
  '还是',
  '但是',
  '已经',
  '一个',
  '不会',
  '不要',
  '没事',
  '有些',
  '这样',
  '那样',
  '哈哈',
  '嘿嘿',
  '好的',
  '好吧',
  '行了',
  '算了',
  '对了',
  '还有',
  '只是',
  '这么',
  '那么',
  '我觉',
  '你觉',
  '女孩',
  '男孩',
  '女生',
  '男生',
]);

export function readRepetition(scene: MindScene): RepetitionRead | null {
  const selfMessages = scene.messages.filter((message) => message.isSelf).slice(-12);
  if (selfMessages.length < 3) {
    return null;
  }
  const ignored = new Set<string>();
  for (const name of [scene.persona.name, ...scene.cast.map((member) => member.nickname)]) {
    for (const bigram of chineseBigrams(name)) {
      ignored.add(bigram);
    }
  }
  const counts = new Map<string, number>();
  const openingCounts = new Map<string, number>();
  for (const message of selfMessages) {
    const seen = new Set<string>();
    // Split at punctuation so "刷锅，炒饭" does not produce the fake "锅炒".
    for (const clause of normalizeText(message.text).split(/[^\u3400-\u9fff]+/u)) {
      for (const bigram of chineseBigrams(clause)) {
        if (seen.has(bigram)) {
          continue;
        }
        if ([...bigram].some((char) => REPETITION_STOP_CHARS.has(char))) {
          continue;
        }
        if (REPETITION_STOP_BIGRAMS.has(bigram) || ignored.has(bigram)) {
          continue;
        }
        seen.add(bigram);
        counts.set(bigram, (counts.get(bigram) ?? 0) + 1);
      }
    }
    const opening = normalizeText(message.text).replace(/[^\u3400-\u9fff]/gu, '').slice(0, 3);
    if (opening.length === 3) {
      openingCounts.set(opening, (openingCounts.get(opening) ?? 0) + 1);
    }
  }
  // Identity words are allowed to come up once; twice in twelve messages reads
  // as repeating a self-introduction.
  const identityWords = new Set(chineseBigrams(scene.persona.identity));
  const topics = [...counts.entries()]
    .filter(([text, count]) => count >= 3 && !identityWords.has(text))
    .sort((left, right) => right[1] - left[1])
    .slice(0, 3)
    .map(([text, count]) => ({ text, count }));
  const identity = [...counts.entries()]
    .filter(
      ([text, count]) =>
        count >= 2 &&
        identityWords.has(text) &&
        !REPETITION_STOP_BIGRAMS.has(text) &&
        ![...text].some((char) => REPETITION_STOP_CHARS.has(char)),
    )
    .sort((left, right) => right[1] - left[1])
    .slice(0, 2)
    .map(([text, count]) => ({ text, count }));
  const openings = [...openingCounts.entries()]
    .filter(([, count]) => count >= 3)
    .sort((left, right) => right[1] - left[1])
    .slice(0, 2)
    .map(([text, count]) => ({ text, count }));
  return topics.length > 0 || identity.length > 0 || openings.length > 0
    ? { topics, identity, openings }
    : null;
}

function chineseBigrams(text: string): string[] {
  const chars = [...text.replace(/[^\u3400-\u9fff]/gu, '')];
  const bigrams: string[] = [];
  for (let index = 0; index < chars.length - 1; index += 1) {
    bigrams.push(`${chars[index]}${chars[index + 1]}`);
  }
  return bigrams;
}

const KIND_LABEL: Record<MessageKind, string> = {
  ending: '道别/结束语',
  question: '在问你',
  request: '在请你帮忙',
  ack: '纯附和/应答',
  substantive: '有实际内容',
  silence: '没有文字',
};

/** Function words that carry no topical meaning for interest matching. */
const STOP_CHARS = new Set([
  ...'的了呢吗吧啊呀哦嗯我你他她它是在有和就不都也还这那什么怎样个一上下来去说想会能要可对给被把让没很太又再才只和与或而且但因为所以如果时候现在已经还是就是不是没有知道觉得应该可以自己我们他们你们一个这个那个',
]);
const SELF_SOURCE_KEYS = ['core_values', 'long_term_motivation', 'current_goal'] as const;
const INTEREST_MEMORY_KINDS = new Set(['PREFERENCE', 'REFLECTION']);

export function classifyMessage(message: SceneMessage): MessageKind {
  return classifyText(message.text, message.images.length > 0);
}

export function classifyText(raw: string, hasMedia = false): MessageKind {
  const text = normalizeText(raw);
  if (!text) {
    return hasMedia ? 'substantive' : 'silence';
  }
  const length = [...text].length;
  if (END_STRONG_RE.test(text) || (END_ANY_RE.test(text) && length <= 14)) {
    return 'ending';
  }
  if (
    QUESTION_TAIL_RE.test(text) ||
    QUESTION_WORD_RE.test(text) ||
    (QUESTION_CONTAINS_RE.test(text) && length <= 16 && !/[。！!…]$/u.test(text))
  ) {
    return 'question';
  }
  if (REQUEST_RE.test(text)) {
    return 'request';
  }
  if (ACK_RE.test(text) || hasMedia) {
    return 'ack';
  }
  return 'substantive';
}

/**
 * Advisory read of the current exchange. It never decides to stay silent for
 * the model: it only makes "this stretch can end" visible, with reasons. The
 * planner still owns engage/beats.
 */
export function readConversation(input: {
  scene: MindScene;
  memories: readonly PersonaMemoryRecord[];
  now?: Date;
}): ConversationRead {
  const { scene } = input;
  const now = input.now ?? new Date();
  const interest = readInterest(input);
  const recent = scene.messages
    .filter((message) => {
      const at = Date.parse(message.sentAt);
      return Number.isFinite(at) && now.getTime() - at <= WINDOW_MS;
    })
    .sort((left, right) => Date.parse(left.sentAt) - Date.parse(right.sentAt));

  const others = recent.filter((message) => !message.isSelf);
  const selves = recent.filter((message) => message.isSelf);
  const lastOther = others.at(-1) ?? null;
  const lastSelf = selves.at(-1) ?? null;

  if (!lastOther && !lastSelf) {
    return {
      verdict: 'continue',
      score: 0,
      interest,
      signals: {
        lastOtherKind: null,
        lastSelfKind: null,
        ownIntent: 0,
        theirIntent: 0,
        topicClosure: 0,
        fatigue: 0,
        awaitingTheirAnswer: false,
        explicitEnd: false,
        directAddress: scene.conversation.kind === 'PRIVATE',
        turns: 0,
        sinceLastOtherMinutes: null,
      },
      reasons: ['没有可判断的近期对话'],
      advice: '没有正在进行的对话，不用做收尾判断。',
    };
  }

  const lastOtherKind = lastOther ? classifyMessage(lastOther) : null;
  const lastSelfKind = lastSelf ? classifyMessage(lastSelf) : null;
  const settle = lastOther ? SETTLED_RE.test(normalizeText(lastOther.text)) : false;
  const lastOtherAt = lastOther ? Date.parse(lastOther.sentAt) : null;
  const lastSelfAt = lastSelf ? Date.parse(lastSelf.sentAt) : null;
  const sinceLastOtherMs = lastOtherAt === null ? null : Math.max(0, now.getTime() - lastOtherAt);
  const turns = others.filter(
    (message) => now.getTime() - Date.parse(message.sentAt) <= 30 * 60_000,
  ).length;
  const isPrivate = scene.conversation.kind === 'PRIVATE';

  let ownIntent = 0;
  if (lastSelfKind === 'question') ownIntent += 0.35;
  if (lastSelfKind === 'ending') ownIntent -= 0.45;
  if (lastSelfKind === 'ack') ownIntent -= 0.15;
  ownIntent += (interest.score / 100) * 0.5;
  ownIntent = clamp01(ownIntent);

  let theirIntent: number;
  switch (lastOtherKind) {
    case 'request':
      theirIntent = 1;
      break;
    case 'question':
      theirIntent = 0.95;
      break;
    case 'substantive':
      theirIntent = 0.62;
      break;
    case 'ack':
      theirIntent = 0.18;
      break;
    case 'ending':
      theirIntent = 0.02;
      break;
    default:
      theirIntent = 0.1;
  }
  if (lastOther?.mentionedSelf) theirIntent += 0.15;
  if (isPrivate && lastOther && !lastSelf) theirIntent += 0.05;
  if (
    others.filter((message) => now.getTime() - Date.parse(message.sentAt) <= 5 * 60_000).length >= 3
  ) {
    theirIntent += 0.1;
  }
  theirIntent = clamp01(theirIntent);

  let topicClosure = 0.35;
  if (lastOtherKind === 'ending') topicClosure = 1;
  else if (settle) topicClosure = 0.85;
  else if (lastOtherKind === 'ack' && (lastSelfKind === 'ack' || lastSelfKind === 'ending')) {
    topicClosure = 0.9;
  } else if (lastOtherKind === 'ack') topicClosure = 0.62;
  else if (lastOtherKind === 'question' || lastOtherKind === 'request') topicClosure = 0.08;
  else if (lastOtherKind === 'substantive') topicClosure = 0.42;
  if (turns >= 6) {
    const tail = others.slice(-4);
    const average =
      tail.reduce((sum, message) => sum + [...normalizeText(message.text)].length, 0) /
      Math.max(1, tail.length);
    if (average <= 6) topicClosure += 0.12;
  }
  topicClosure = clamp01(topicClosure);

  let fatigue = 0;
  if (
    recent.filter((message) => now.getTime() - Date.parse(message.sentAt) <= 10 * 60_000).length >=
    12
  ) {
    fatigue += 0.3;
  }
  const otherTail = others.slice(-3);
  if (otherTail.length >= 2) {
    const average =
      otherTail.reduce((sum, message) => sum + [...normalizeText(message.text)].length, 0) /
      otherTail.length;
    if (average <= 5) fatigue += 0.25;
  }
  if (sinceLastOtherMs !== null && sinceLastOtherMs >= GROUP_QUIET_CLOSE_MS) fatigue += 0.25;
  if (
    selves.filter((message) => now.getTime() - Date.parse(message.sentAt) <= 5 * 60_000).length >= 3
  ) {
    fatigue += 0.2;
  }
  fatigue = clamp01(fatigue);

  const awaitingTheirAnswer = Boolean(
    lastOther &&
    lastOtherKind &&
    (lastOtherKind === 'question' || lastOtherKind === 'request') &&
    (!lastSelfAt || (lastOtherAt !== null && lastSelfAt < lastOtherAt)),
  );
  const explicitEnd = lastOtherKind === 'ending';
  const directAddress =
    isPrivate ||
    Boolean(lastOther?.mentionedSelf) ||
    lastOtherKind === 'question' ||
    lastOtherKind === 'request';

  let score = 0;
  score += topicClosure * 0.32;
  score += (1 - ownIntent) * 0.24;
  score += (1 - theirIntent) * 0.22;
  score += fatigue * 0.12;
  if (lastSelfKind === 'ack' || lastSelfKind === 'ending') score += 0.18;
  if (explicitEnd) score += 0.15;
  if (awaitingTheirAnswer) score -= 0.35;
  if (directAddress) score -= 0.06;
  score = clamp01(score);

  let verdict: ConversationVerdict = 'continue';
  const lastOtherStillOpen = lastOtherKind === 'question' || lastOtherKind === 'request';
  if (awaitingTheirAnswer) verdict = 'continue';
  else if (explicitEnd) verdict = 'close';
  else if (
    !isPrivate &&
    sinceLastOtherMs !== null &&
    sinceLastOtherMs >= GROUP_QUIET_CLOSE_MS &&
    !lastOtherStillOpen &&
    ownIntent < 0.5
  ) {
    verdict = 'close';
  } else if (theirIntent >= 0.9) verdict = 'continue';
  else if (ownIntent >= 0.6) verdict = 'linger';
  else if (interest.score >= 65) verdict = 'linger';
  else if (score >= 0.62) verdict = 'close';
  else if (score >= 0.45) verdict = 'linger';

  const reasons: string[] = [];
  if (lastOtherKind) reasons.push(`对方最后一句：${KIND_LABEL[lastOtherKind]}`);
  if (lastSelfKind) reasons.push(`我最后一句：${KIND_LABEL[lastSelfKind]}`);
  if (interest.score >= 60) reasons.push(`话题碰到你在意的「${interest.topics.join('、')}」`);
  else if (interest.score <= 25) reasons.push('话题只是日常寒暄，没碰到你在意的事');
  if (awaitingTheirAnswer) reasons.push('对方明确在提问/求助，还没答');
  if (explicitEnd) reasons.push('对方已经明确道别/收束');
  if (fatigue >= 0.4) reasons.push('来回节奏已经偏疲');
  if (topicClosure >= 0.8) reasons.push('话题已基本闭环');
  if (theirIntent >= 0.9) reasons.push('对方明显还想继续');
  if (ownIntent >= 0.6) reasons.push('你自己还有想说的');

  const advice = awaitingTheirAnswer
    ? '先回答对方，不要用沉默逃开。'
    : verdict === 'close'
      ? '这段已经收尾，不必再补一句；对方继续时再判断。'
      : verdict === 'linger'
        ? interest.score >= 60
          ? '你有想接的话，可以自然接一句；不急着现在补。'
          : '先别急着补话；等对方继续，通常不需要再补一句。'
        : '还在聊，正常考虑回复。';

  return {
    verdict,
    score: Math.round(score * 100),
    interest,
    signals: {
      lastOtherKind,
      lastSelfKind,
      ownIntent: Math.round(ownIntent * 100),
      theirIntent: Math.round(theirIntent * 100),
      topicClosure: Math.round(topicClosure * 100),
      fatigue: Math.round(fatigue * 100),
      awaitingTheirAnswer,
      explicitEnd,
      directAddress,
      turns,
      sinceLastOtherMinutes:
        sinceLastOtherMs === null ? null : Math.max(0, Math.round(sinceLastOtherMs / 60_000)),
    },
    reasons,
    advice,
  };
}

function readInterest(input: {
  scene: MindScene;
  memories: readonly PersonaMemoryRecord[];
}): InterestRead {
  const { scene } = input;
  const values = scene.persona.values as Record<string, unknown> | null;
  const sources: { label: string; text: string }[] = [];
  const seen = new Set<string>();
  const addSource = (raw: string, prefix = '') => {
    for (const clause of splitClauses(raw)) {
      if (sources.length >= 24 || clause.length < 2 || clause.length > 40 || seen.has(clause)) {
        continue;
      }
      seen.add(clause);
      sources.push({ label: prefix ? `${prefix}${clause}` : clause, text: clause });
    }
  };
  for (const key of SELF_SOURCE_KEYS) {
    addSource(personaValueText(values, key));
  }
  for (const memory of input.memories) {
    if (!INTEREST_MEMORY_KINDS.has(memory.kind) && memory.subjectType !== 'TOPIC') continue;
    addSource(memory.content);
  }
  const lastInbound = [...scene.messages].reverse().find((message) => !message.isSelf);
  const message = lastInbound ? normalizeText(lastInbound.text) : '';
  if (!lastInbound || !message || sources.length === 0) {
    return { score: 0, reason: '没有可用于判断兴趣的话题', topics: [] };
  }

  const ranked = sources
    .map((source) => ({ ...source, similarity: similarity(message, source.text) }))
    .sort((left, right) => right.similarity - left.similarity);
  const best = ranked[0]?.similarity ?? 0;
  const second = ranked[1]?.similarity ?? 0;
  const amplified = Math.min(1, best * 0.85 + second * 0.15);
  const inboundKind = classifyMessage(lastInbound);
  const asksSomething = inboundKind === 'question' || inboundKind === 'request';
  const bonus = asksSomething && best >= 0.2 ? 0.08 : 0;
  const score = clamp(Math.round((amplified + bonus) * 118), 0, 100);
  const topics = ranked
    .filter((source) => source.similarity >= 0.12)
    .slice(0, 2)
    .map((source) => clip(source.label, 24));
  const reason =
    score >= 60
      ? `碰到你在意的${topics.length > 0 ? `「${topics.join('、')}」` : '话题'}`
      : score >= 30
        ? `有一点相关${topics.length > 0 ? `：${topics.join('、')}` : ''}`
        : asksSomething && [...message].length <= 6
          ? '只是打个招呼，没有具体内容'
          : asksSomething
            ? '对方在问/求助一件具体的事，先回应具体问题'
            : message
              ? '只是日常寒暄，没碰到你在意的事'
              : '没有实际内容';
  return { score, reason, topics };
}

function splitClauses(value: string): string[] {
  return value
    .split(/[，。；、,.!?;:\n\r\t]+/u)
    .map((part) => normalizeText(part))
    .filter(Boolean);
}

function similarity(message: string, source: string): number {
  const messageTokens = meaningfulTokens(message);
  const sourceTokens = new Set(meaningfulTokens(source));
  if (messageTokens.length === 0 || sourceTokens.size === 0) {
    return 0;
  }
  let hits = 0;
  for (const token of messageTokens) {
    if (sourceTokens.has(token)) {
      hits += 1;
    }
  }
  const overlap = hits / messageTokens.length;
  const cosine = Math.max(0, cosineSimilarity(embedText(message), embedText(source)));
  return Math.min(1, overlap * 0.75 + cosine * 0.45);
}

function meaningfulTokens(text: string): string[] {
  const tokens: string[] = [];
  for (const part of text.toLowerCase().split(/[^\p{L}\p{N}]+/u)) {
    if (!part) continue;
    if (/[\u3400-\u9fff]/u.test(part)) {
      for (const char of part) {
        if (!STOP_CHARS.has(char)) tokens.push(char);
      }
      continue;
    }
    if (part.length >= 2 && !STOP_CHARS.has(part)) {
      tokens.push(part);
    }
  }
  return tokens;
}

function normalizeText(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function clip(value: string, max: number): string {
  const chars = [...value];
  return chars.length <= max ? value : `${chars.slice(0, max).join('')}…`;
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}
