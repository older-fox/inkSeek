import { Injectable, Logger } from '@nestjs/common';
import type { MindSettingsRecord } from '@inkseek/shared';
import { LlmService } from '../ai/llm.service.js';
import { truncateText } from '../common/text.js';
import { CONFIG_KEYS } from '../config/config-keys.js';
import { SystemConfigService } from '../config/system-config.service.js';
import type { PersonaState } from '../generated/prisma/client.js';
import { readMindBannedWords } from './mind-banned-words.js';
import { personaValueText, readStringArray } from './mind.types.js';
import type { MindScene } from './mind.types.js';

const SCENE_MAX_TOKENS = 4000;
const SCENE_RETRY_MAX_TOKENS = 6000;
const SCENE_TEXT_LIMIT = 4000;

export interface SceneWriteInput {
  scene: MindScene;
  state: PersonaState;
  settings: MindSettingsRecord;
  /** The planner's one-or-two sentence cue for this turn. */
  cue: string;
  runId?: string;
  signal?: AbortSignal;
  dryRun?: boolean;
}

export interface SceneWriteResult {
  text: string;
  providerId: string | null;
  model: string | null;
  latencyMs: number;
  promptTokens: number;
  completionTokens: number;
}

/**
 * EXPLICIT scene mode's second pass: the planner decides what happens in one
 * short cue, and this writer turns it into prose without spending the planner's
 * token budget or mixing narration into the dialogue beats.
 */
@Injectable()
export class MindSceneWriterService {
  private readonly logger = new Logger(MindSceneWriterService.name);

  constructor(
    private readonly llm: LlmService,
    private readonly config: SystemConfigService,
  ) {}

  /**
   * Turns the planner's cue into narration. Retries once at a larger budget when
   * the first pass yields nothing; returns null when both passes come back empty.
   */
  async write(input: SceneWriteInput): Promise<SceneWriteResult | null> {
    const cue = input.cue.trim();
    if (!cue) {
      return null;
    }
    const prompt = await this.buildPrompt(input, cue);
    const system = `你就是「${input.scene.persona.name}」，不是助手。只写场景、动作和身体反应，不写台词，不写标题，不解释，不提 AI、模型、提示词或系统。`;
    const first = await this.complete(input, prompt, system, SCENE_MAX_TOKENS);
    let completion = first;
    let promptTokens = first.promptTokens ?? 0;
    let completionTokens = first.completionTokens ?? 0;
    let elapsedMs = first.latencyMs;
    let text = cleanSceneText(first.text);
    if (!text) {
      completion = await this.complete(input, prompt, system, SCENE_RETRY_MAX_TOKENS);
      text = cleanSceneText(completion.text);
      promptTokens += completion.promptTokens ?? 0;
      completionTokens += completion.completionTokens ?? 0;
      elapsedMs += completion.latencyMs;
    }
    if (!text) {
      this.logger.warn('场景扩写返回空内容');
      return null;
    }
    return {
      text: text.slice(0, SCENE_TEXT_LIMIT),
      providerId: completion.providerId,
      model: completion.model,
      latencyMs: elapsedMs,
      promptTokens,
      completionTokens,
    };
  }

  /** Single LLM call with a high temperature; dry runs skip call logging. */
  private complete(
    input: SceneWriteInput,
    prompt: string,
    system: string,
    maxTokens: number,
  ) {
    return this.llm.complete({
      prompt,
      system,
      providerId: input.settings.providerId,
      model: input.settings.model,
      temperature: 0.85,
      maxTokens,
      source: 'mind.scene',
      runId: input.runId,
      log: input.dryRun ? false : undefined,
      signal: input.signal,
    });
  }

  /**
   * Assembles the writer prompt: cue, scene style, persona body details, current
   * state, relationship and recent dialogue. Banned words are merged globally;
   * a failed config read degrades to an empty list.
   */
  private async buildPrompt(input: SceneWriteInput, cue: string): Promise<string> {
    const { scene, state } = input;
    const values = (scene.persona.values ?? {}) as Record<string, unknown>;
    const target =
      scene.cast.find((member) => member.contactId === scene.anchor.senderId) ??
      scene.cast.find((member) => member.contactId === scene.messages.at(-1)?.senderId) ??
      null;
    const globalBanned = await this.config
      .get<unknown>(CONFIG_KEYS.mindGlobalBannedWords)
      .then(readMindBannedWords)
      .catch(() => []);
    const banned = [
      ...readStringArray(values['banned_words']),
      ...globalBanned,
    ]
      .map((word) => word.trim())
      .filter(Boolean);

    /** A card field as display text; blank means the expanded line is skipped. */
    const text = (key: string): string => personaValueText(values, key).trim();
    /** A card list field with blank entries removed. */
    const list = (key: string): string[] =>
      readStringArray(values[key])
        .map((item) => item.trim())
        .filter(Boolean);

    const recent = scene.messages
      .slice(-16)
      .map(
        (message) =>
          `- ${message.isSelf ? scene.persona.name : message.senderName}：${trim(
            message.text || `[${message.kind}]`,
            180,
          )}`,
      )
      .join('\n');

    const relationship = target?.relationship
      ? [
          `对象：${target.nickname}`,
          `好感 ${target.relationship.affinity}、信任 ${target.relationship.trust}、亲密 ${target.relationship.intimacy}、吸引 ${target.relationship.attraction}`,
          target.relationship.relationTags?.length
            ? `关系标签：${target.relationship.relationTags.join('、')}`
            : '',
          target.relationship.boundaries?.length
            ? `关系边界：${target.relationship.boundaries.join('、')}`
            : '',
          target.relationship.addressHere?.length
            ? `称呼：${target.relationship.addressHere.join('、')}`
            : '',
        ]
          .filter(Boolean)
          .join('\n')
      : '';

    return [
      `【这一轮要发生的事】\n${cue}`,
      `【场景写法】\n${
        text('scene_style') ||
        '默认：以角色本人的视角写环境、动作、身体反应和感官；动作有先后，写清楚接触点和反应，不用比喻代替过程。'
      }`,
      `【尺度】\n${text('explicit_level_char') || '按角色卡与当下关系判断，不主动越过对方明确给出的边界。'}`,
      [
        text('appearance') ? `外貌：${text('appearance')}` : '',
        text('body_type') ? `体型：${text('body_type')}` : '',
        text('outfit') ? `服装：${text('outfit')}` : '',
        text('voice') ? `声音：${text('voice')}` : '',
      ]
        .filter(Boolean)
        .join('\n'),
      [
        list('sensitivity_map').length > 0 ? `敏感点：${list('sensitivity_map').join('、')}` : '',
        text('touch_preference') ? `触碰偏好：${text('touch_preference')}` : '',
        list('taboos').length > 0 ? `禁忌：${list('taboos').join('、')}` : '',
        list('non_negotiable').length > 0
          ? `不可妥协：${list('non_negotiable').join('、')}`
          : '',
        text('aftercare_need_base') ? `事后照护需求：${text('aftercare_need_base')}` : '',
      ]
        .filter(Boolean)
        .join('\n'),
      [
        `心情 ${state.moodValence}（-100 低落 .. 100 愉快）、情绪强度 ${state.moodArousal}`,
        `精力 ${state.energy}、健康 ${state.health}、压力 ${state.stress}、社交电量 ${state.socialBattery}`,
        `整洁程度 ${state.grooming}`,
      ].join('\n'),
      relationship,
      `【最近对话】\n${recent || '没有可参考的近期对话'}`,
      banned.length > 0 ? `【禁用语】不要出现这些词或句式：${banned.join('、')}` : '',
      [
        '写作要求：',
        '- 只写环境、动作、身体反应、感官和情绪变化，不写台词；台词会由 TA 随后另发。',
        '- 动作要有先后和接触点：谁对谁做了什么、衣物和身体怎么变化、对方怎么反应；不要用比喻代替过程，不要一句话带过。',
        '- 贴着角色本人的视角写，具体、连续、有节奏；可以分短段，但不要总结、不要心理分析报告。',
        '- 长度 300-800 字，信息密度优先，不凑字数。',
        '- 不出现 AI、模型、提示词、系统等词，不跳出角色。',
        '只输出正文。',
      ].join('\n'),
    ]
      .filter(Boolean)
      .join('\n\n');
  }
}

/** Strips code fences and a leading scene label some models add despite instructions. */
function cleanSceneText(value: string): string {
  return value
    .replace(/^```[a-z]*\s*/iu, '')
    .replace(/```$/u, '')
    .replace(/^【?场景】?[：:]?\s*/u, '')
    .trim();
}

/** Trims then hard-cuts at a character budget, keeping prompt lines bounded. */
function trim(value: string, max: number): string {
  return truncateText(value.trim(), max);
}
