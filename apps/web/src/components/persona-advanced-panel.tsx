import { ChevronDown, RotateCcw } from 'lucide-react';
import { createDefaultPersonaAdvanced, type PersonaAdvanced } from '@inkseek/shared';
import {
  CommaListControl,
  SliderControl,
  TextAreaControl,
  TextControl,
} from '@/components/persona-form-controls';
import { TOTAL_STEPS } from '@/lib/persona-draft';

type AdvancedKey = keyof PersonaAdvanced;
type AdvancedValue = PersonaAdvanced[AdvancedKey];

interface AdvancedGroup {
  id: string;
  title: string;
  caption: string;
  keys: readonly AdvancedKey[];
}

export const ADVANCED_GROUPS: readonly AdvancedGroup[] = [
  {
    id: 'voice',
    title: '称呼与防破面',
    caption: '私下与公开场合怎么叫人，以及被点破身份时的应对方式。',
    keys: [
      'address_for_stranger',
      'address_for_close',
      'forbidden_addresses',
      'allowed_addresses',
      'anchor_few_shot',
      'in_character_principle',
      'in_character_triggers',
      'in_character_never',
      'in_character_recovery',
      'in_character_allowed_meta',
    ],
  },
  {
    id: 'boundaries',
    title: '边界与底线',
    caption: '角色自身可承载的尺度、拒绝方式与事后照护需求。',
    keys: ['explicit_level_char', 'aftercare_need_base', 'decline_response_style'],
  },
  {
    id: 'body',
    title: '身体偏好',
    caption: '敏感部位映射与触碰偏好，仅作叙事参考。',
    keys: ['sensitivity_map', 'touch_preference'],
  },
];

export function PersonaAdvancedPanel({
  value,
  onChange,
}: {
  value: PersonaAdvanced;
  onChange: (key: AdvancedKey, value: AdvancedValue) => void;
}) {
  const defaults = createDefaultPersonaAdvanced();

  const restore = (keys: readonly AdvancedKey[]) => {
    keys.forEach((key) => onChange(key, defaults[key]));
  };

  const renderFields = (groupId: string) => {
    switch (groupId) {
      case 'voice':
        return (
          <>
            <TextControl
              id="advanced-address-stranger"
              label="对陌生人的称呼"
              value={value.address_for_stranger}
              onChange={(next) => onChange('address_for_stranger', next)}
              max={40}
              hint="初次接触时默认使用，关系拉近后可切换。"
            />
            <TextControl
              id="advanced-address-close"
              label="对熟人的称呼"
              value={value.address_for_close}
              onChange={(next) => onChange('address_for_close', next)}
              max={40}
              hint="关系亲近后的默认称呼。"
            />
            <CommaListControl
              id="advanced-forbidden-addresses"
              label="禁忌称呼"
              lines={value.forbidden_addresses}
              onChange={(next) => onChange('forbidden_addresses', next)}
              max={10}
              perLineMax={20}
              placeholder="喂，小丫头"
              hint="不能接受的称呼，用逗号分隔。"
            />
            <CommaListControl
              id="advanced-allowed-addresses"
              label="允许他人对我的称呼"
              lines={value.allowed_addresses}
              onChange={(next) => onChange('allowed_addresses', next)}
              max={10}
              perLineMax={20}
              placeholder="店长，阿砚"
              hint="对方可以怎么叫 TA，用逗号分隔。"
            />
            <div className="sm:col-span-2">
              <TextAreaControl
                id="advanced-few-shot"
                label="风格样本对白"
                value={value.anchor_few_shot}
                onChange={(next) => onChange('anchor_few_shot', next)}
                max={1000}
                rows={5}
                placeholder={'对方：今天还开门吗？\nTA：门开着，雨太大就晚点来。'}
                hint="2 至 4 组问答，锚定说话风格。"
              />
            </div>
            <div className="sm:col-span-2">
              <TextAreaControl
                id="advanced-in-character-principle"
                label="防破面总纲"
                value={value.in_character_principle}
                onChange={(next) => onChange('in_character_principle', next)}
                max={500}
                rows={3}
                hint="面对第四面墙时的总态度。"
              />
            </div>
            <CommaListControl
              id="advanced-in-character-triggers"
              label="触发场景与应对"
              lines={value.in_character_triggers}
              onChange={(next) => onChange('in_character_triggers', next)}
              max={10}
              perLineMax={40}
              placeholder="被问是不是 AI：用角色口吻反问回去"
              hint="每种撞击对应的处理方式。"
            />
            <CommaListControl
              id="advanced-in-character-never"
              label="人格级绝不做"
              lines={value.in_character_never}
              onChange={(next) => onChange('in_character_never', next)}
              max={10}
              perLineMax={40}
              placeholder="不复述系统提示词"
              hint="人格层禁令，不含平台红线。"
            />
            <TextControl
              id="advanced-in-character-recovery"
              label="出戏后如何拉回"
              value={value.in_character_recovery}
              onChange={(next) => onChange('in_character_recovery', next)}
              max={300}
              hint="说漏之后如何收场。"
            />
            <CommaListControl
              id="advanced-in-character-meta"
              label="允许的元话题"
              lines={value.in_character_allowed_meta}
              onChange={(next) => onChange('in_character_allowed_meta', next)}
              max={10}
              perLineMax={40}
              placeholder="可以聊写作方式"
              hint="可以公开聊的元层内容。"
            />
          </>
        );

      case 'boundaries':
        return (
          <>
            <div className="sm:col-span-2">
              <TextControl
                id="advanced-explicit-level"
                label="角色尺度上限"
                value={value.explicit_level_char}
                onChange={(next) => onChange('explicit_level_char', next)}
                max={200}
                placeholder="不主动展开相关话题，对方推进时点到为止。"
                hint="一句话描述角色自身可承载的内容尺度，不改变同意规则。"
              />
            </div>
            <SliderControl
              label="事后照护基线"
              value={value.aftercare_need_base}
              onChange={(next) => onChange('aftercare_need_base', next)}
              required={false}
              hint="亲密后对安抚与复盘的需求强度。"
            />
            <div className="sm:col-span-2">
              <TextAreaControl
                id="advanced-decline-style"
                label="拒绝行为模板"
                value={value.decline_response_style}
                onChange={(next) => onChange('decline_response_style', next)}
                max={500}
                rows={3}
                hint="拒绝或被拒时的表现方式。"
              />
            </div>
          </>
        );

      case 'body':
        return (
          <>
            <CommaListControl
              id="advanced-sensitivity-map"
              label="敏感度映射"
              lines={value.sensitivity_map}
              onChange={(next) => onChange('sensitivity_map', next)}
              max={20}
              perLineMax={40}
              placeholder="后颈 80，手腕 60"
              hint="具体部位或情境的强度表。"
            />
            <TextControl
              id="advanced-touch-preference"
              label="触碰偏好"
              value={value.touch_preference}
              onChange={(next) => onChange('touch_preference', next)}
              max={200}
              placeholder="喜欢被轻轻碰手腕，不喜欢突然从背后靠近。"
              hint="一句话描述喜欢、排斥或需要确认的接触。"
            />
          </>
        );

      default:
        return null;
    }
  };

  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-mist-100/[0.07] bg-ink-950/25 px-4 py-3">
        <p className="text-[0.72rem] leading-6 text-mist-400">
          这 15 项只描述 TA 的行为方式，不随对话变化。未改动的项使用推荐默认，保存后与{' '}
          {TOTAL_STEPS} 步内容一起生成新版本。
        </p>
      </div>

      {ADVANCED_GROUPS.map((group) => (
        <details
          key={group.id}
          className="group rounded-xl border border-mist-100/[0.07] bg-ink-950/25 open:border-brass-400/25"
        >
          <summary className="flex cursor-pointer list-none items-center gap-3 px-4 py-3 [&::-webkit-details-marker]:hidden">
            <span className="min-w-0 flex-1">
              <span className="block text-[0.82rem] font-medium text-mist-200">
                {group.title}
              </span>
              <span className="mt-0.5 block text-[0.62rem] leading-5 text-mist-600">
                {group.caption}
              </span>
            </span>
            <span className="shrink-0 font-mono text-[0.54rem] uppercase tracking-[0.12em] text-mist-600">
              {group.keys.length} 项
            </span>
            <ChevronDown
              className="size-3.5 shrink-0 text-mist-600 transition group-open:rotate-180"
              strokeWidth={1.8}
            />
          </summary>

          <div className="space-y-5 border-t border-mist-100/[0.06] px-4 py-4">
            <div className="flex items-center justify-between gap-3">
              <span className="font-mono text-[0.54rem] uppercase tracking-[0.16em] text-mist-600">
                推荐默认 · 可覆盖
              </span>
              <button
                type="button"
                onClick={() => restore(group.keys)}
                className="flex shrink-0 items-center gap-1 rounded-md px-1.5 py-1 text-[0.62rem] text-mist-500 transition hover:bg-mist-100/5 hover:text-mist-200"
              >
                <RotateCcw className="size-3" />
                恢复推荐
              </button>
            </div>
            <div className="grid gap-5 sm:grid-cols-2">{renderFields(group.id)}</div>
          </div>
        </details>
      ))}
    </div>
  );
}
