import type { Channel } from '@/lib/connections';

export interface PersonaRevision {
  id: string;
  time: string;
  source: string;
  content: string;
  reason: string;
}

const SOURCES = ['手动修订', '对话校准', '模板同步', '巡检修正', '审核回滚'] as const;

const CONTENTS = [
  '调整作息窗口与主动触发条件',
  '补充禁忌称呼与拒绝方式',
  '修正敏感度映射与触碰偏好',
  '更新身份描述与常服细节',
  '重写防破面规则与禁用语',
  '补充关系网与知识边界',
  '修正语气词密度与句长偏好',
  '更新长期目标与当前阻碍',
  '整理称呼规则与允许称呼',
  '校准数值基线与衰减参数',
  '补充边界备注与安全词',
  '调整台词锚点与风格样本',
  '修订世界设定与背景经历',
  '更新外貌、发型与声音描述',
  '整理核心价值与不可谈判项',
  '修正错字率与分条发送规则',
] as const;

const REASONS = [
  '适配新的夜班排班',
  '修正与卡面描述不一致处',
  '回应近期的对话偏差',
  '统一称呼与语气规则',
  '收敛过宽的主动触发条件',
  '补充遗漏的边界说明',
  '同步线下活动的最新安排',
  '清理重复与失效的设定',
  '降低夜间打扰的频率',
  '修正敏感度数值的偏差',
] as const;

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

function formatTime(index: number, offsetMinutes: number): string {
  const base = Date.UTC(2026, 10, 2, 16, 40);
  const timestamp = base - index * 19 * 60 * 60 * 1000 - offsetMinutes * 60 * 1000;
  const date = new Date(timestamp);

  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(
    date.getUTCDate(),
  )} ${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}`;
}

export function revisionHistoryForChannel(channel: Channel): readonly PersonaRevision[] {
  const seedSource = channel.accountId || channel.id;
  const seed = Array.from(seedSource).reduce(
    (total, character) => total + character.charCodeAt(0),
    0,
  );
  const total = 186 + (seed % 17);
  const offsetMinutes = seed % 60;

  return Array.from({ length: total }, (_, index) => ({
    id: `${channel.id}-revision-${index}`,
    time: formatTime(index, offsetMinutes),
    source: SOURCES[(index + seed) % SOURCES.length] ?? SOURCES[0],
    content: CONTENTS[(index + seed) % CONTENTS.length] ?? CONTENTS[0],
    reason: REASONS[(index + seed * 3) % REASONS.length] ?? REASONS[0],
  }));
}
