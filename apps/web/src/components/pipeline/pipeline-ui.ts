import type {
  ChatPipelineGraphNode,
  ChatPipelineIoField,
  ChatPipelineIoKind,
  ChatPipelineNodeCategory,
  ChatPipelineNodePosition,
  ChatPipelineNodeStatus,
  ChatPipelineNodeType,
  ChatPipelineVariable,
} from '@inkseek/shared';
import type { LucideIcon } from 'lucide-react';
import { Braces, Cpu, GitBranch, Images, StickyNote, Timer, Type, Variable } from 'lucide-react';
import type { PipelineSelectCreate } from './pipeline-select';

export const CARD_WIDTH = 248;
/** Fixed header band; port rows start right below it. */
export const CARD_HEADER_HEIGHT = 56;
export const PORTS_PADDING_TOP = 6;
export const PORT_ROW_HEIGHT = 18;
export const PORTS_PADDING_BOTTOM = 4;
export const CARD_BODY_ESTIMATE = 132;
export const WORLD_WIDTH = 4000;
export const WORLD_HEIGHT = 2600;

export type PipelineSelection =
  | { kind: 'node'; id: string }
  | { kind: 'edge'; index: number }
  | null;

export const CATEGORY_STYLE: Record<
  ChatPipelineNodeCategory,
  { label: string; icon: LucideIcon; text: string; border: string; background: string; dot: string }
> = {
  system: {
    label: '系统',
    icon: Cpu,
    text: 'text-brass-300',
    border: 'border-brass-400/30',
    background: 'bg-brass-400/[0.09]',
    dot: 'bg-brass-400',
  },
  data: {
    label: '数据',
    icon: Braces,
    text: 'text-[#b9d4ee]',
    border: 'border-[#8fb8e0]/30',
    background: 'bg-[#8fb8e0]/[0.08]',
    dot: 'bg-[#8fb8e0]',
  },
  text: {
    label: '文本',
    icon: Type,
    text: 'text-jade-300',
    border: 'border-jade-400/25',
    background: 'bg-jade-400/[0.08]',
    dot: 'bg-jade-400',
  },
  media: {
    label: '媒体',
    icon: Images,
    text: 'text-[#e9a8b8]',
    border: 'border-[#d98ba0]/30',
    background: 'bg-[#d98ba0]/[0.08]',
    dot: 'bg-[#d98ba0]',
  },
  logic: {
    label: '逻辑',
    icon: GitBranch,
    text: 'text-mist-200',
    border: 'border-mist-100/20',
    background: 'bg-mist-100/[0.07]',
    dot: 'bg-mist-300',
  },
  flow: {
    label: '流程',
    icon: Timer,
    text: 'text-[#c9b3e8]',
    border: 'border-[#a98fd6]/30',
    background: 'bg-[#a98fd6]/[0.08]',
    dot: 'bg-[#a98fd6]',
  },
  variable: {
    label: '变量',
    icon: Variable,
    text: 'text-[#8fd6c2]',
    border: 'border-[#6fc0aa]/30',
    background: 'bg-[#6fc0aa]/[0.08]',
    dot: 'bg-[#6fc0aa]',
  },
  note: {
    label: '注释',
    icon: StickyNote,
    text: 'text-[#d6c49a]',
    border: 'border-[#bfa878]/30',
    background: 'bg-[#bfa878]/[0.08]',
    dot: 'bg-[#bfa878]',
  },
};

export const NODE_STATUS_STYLE: Record<
  ChatPipelineNodeStatus,
  { label: string; text: string; dot: string; border: string }
> = {
  SUCCEEDED: {
    label: '成功',
    text: 'text-jade-300',
    dot: 'bg-jade-400',
    border: 'border-jade-400/35',
  },
  RUNNING: {
    label: '运行中',
    text: 'text-brass-300',
    dot: 'bg-brass-300 animate-pulse',
    border: 'border-brass-400/35',
  },
  SKIPPED: {
    label: '跳过',
    text: 'text-mist-500',
    dot: 'bg-mist-600',
    border: 'border-mist-100/[0.12]',
  },
  CANCELLED: {
    label: '取消',
    text: 'text-mist-400',
    dot: 'bg-mist-500',
    border: 'border-mist-100/[0.16]',
  },
  FAILED: {
    label: '失败',
    text: 'text-signal-400',
    dot: 'bg-signal-400',
    border: 'border-signal-400/40',
  },
};

export const IO_KIND_STYLE: Record<ChatPipelineIoKind, { label: string; className: string }> = {
  text: { label: '文本', className: 'border-brass-400/25 bg-brass-400/[0.07] text-brass-200' },
  number: { label: '数字', className: 'border-jade-400/25 bg-jade-400/[0.07] text-jade-300' },
  boolean: { label: '布尔', className: 'border-signal-400/25 bg-signal-400/[0.06] text-signal-400' },
  json: { label: 'JSON', className: 'border-mist-100/20 bg-mist-100/[0.06] text-mist-300' },
  image: {
    label: '图片',
    className: 'border-[#8fb8e0]/35 bg-[#8fb8e0]/[0.09] text-[#b9d4ee]',
  },
  any: { label: '任意', className: 'border-mist-100/[0.14] bg-mist-100/[0.04] text-mist-400' },
};

export const IO_KIND_DOT: Record<ChatPipelineIoKind, string> = {
  text: 'border-brass-400/60 bg-brass-400/40',
  number: 'border-jade-400/60 bg-jade-400/40',
  boolean: 'border-signal-400/60 bg-signal-400/40',
  json: 'border-mist-100/45 bg-mist-100/25',
  image: 'border-[#8fb8e0]/70 bg-[#8fb8e0]/40',
  any: 'border-mist-100/30 bg-mist-100/10',
};

export const IO_KIND_RING: Record<ChatPipelineIoKind, string> = {
  text: 'ring-brass-400/50',
  number: 'ring-jade-400/50',
  boolean: 'ring-signal-400/50',
  json: 'ring-mist-100/40',
  image: 'ring-[#8fb8e0]/50',
  any: 'ring-mist-100/25',
};

export function cardRows(definition: ChatPipelineNodeType | null): number {
  return Math.max(1, definition?.inputs.length ?? 0, definition?.outputs.length ?? 0);
}

const NOTE_LINE_HEIGHT = 20;
const NOTE_CHARS_PER_LINE = 26;

/** Text carried by a layout-only note card. */
export function noteTextOf(config: Record<string, unknown> | null | undefined): string {
  const text = config?.['text'];
  return typeof text === 'string' ? text : '';
}

/** Rough wrapped line count; overestimating only adds slack to the fit view. */
export function noteLineCount(text: string): number {
  return text.split('\n').reduce((total, line) => {
    return total + Math.max(1, Math.ceil([...line].length / NOTE_CHARS_PER_LINE));
  }, 0);
}

export function cardHeight(
  definition: ChatPipelineNodeType | null,
  config?: Record<string, unknown> | null,
): number {
  if (definition?.layout) {
    const lines = Math.max(1, noteLineCount(noteTextOf(config) || '双击编辑说明…'));
    return CARD_HEADER_HEIGHT + 8 + lines * NOTE_LINE_HEIGHT + 12;
  }

  return (
    CARD_HEADER_HEIGHT +
    PORTS_PADDING_TOP +
    cardRows(definition) * PORT_ROW_HEIGHT +
    PORTS_PADDING_BOTTOM +
    CARD_BODY_ESTIMATE
  );
}

function portRowY(node: ChatPipelineGraphNode, index: number): number {
  return (
    node.position.y +
    CARD_HEADER_HEIGHT +
    PORTS_PADDING_TOP +
    index * PORT_ROW_HEIGHT +
    PORT_ROW_HEIGHT / 2
  );
}

function portIndex(fields: ChatPipelineIoField[] | undefined, key: string): number {
  const index = fields?.findIndex((field) => field.key === key) ?? -1;
  return index < 0 ? 0 : index;
}

export function outputPoint(
  node: ChatPipelineGraphNode,
  definition: ChatPipelineNodeType | null,
  key: string,
): ChatPipelineNodePosition {
  return {
    x: node.position.x + CARD_WIDTH,
    y: portRowY(node, portIndex(definition?.outputs, key)),
  };
}

export function inputPoint(
  node: ChatPipelineGraphNode,
  definition: ChatPipelineNodeType | null,
  key: string,
): ChatPipelineNodePosition {
  return {
    x: node.position.x,
    y: portRowY(node, portIndex(definition?.inputs, key)),
  };
}

export function edgePath(
  start: ChatPipelineNodePosition,
  end: ChatPipelineNodePosition,
): string {
  const distance = Math.max(48, Math.abs(end.x - start.x) * 0.5);
  return `M ${start.x} ${start.y} C ${start.x + distance} ${start.y}, ${end.x - distance} ${end.y}, ${end.x} ${end.y}`;
}

export function edgeMidpoint(
  start: ChatPipelineNodePosition,
  end: ChatPipelineNodePosition,
): ChatPipelineNodePosition {
  return { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 };
}

/** Point at `t` on the cubic bezier drawn by `edgePath`. */
export function edgeCurvePoint(
  start: ChatPipelineNodePosition,
  end: ChatPipelineNodePosition,
  t: number,
): ChatPipelineNodePosition {
  const distance = Math.max(48, Math.abs(end.x - start.x) * 0.5);
  const control1 = { x: start.x + distance, y: start.y };
  const control2 = { x: end.x - distance, y: end.y };
  const mt = 1 - t;
  const a = mt * mt * mt;
  const b = 3 * mt * mt * t;
  const c = 3 * mt * t * t;
  const d = t * t * t;
  return {
    x: a * start.x + b * control1.x + c * control2.x + d * end.x,
    y: a * start.y + b * control1.y + c * control2.y + d * end.y,
  };
}

export function categoryOf(
  node: ChatPipelineGraphNode,
  catalog: ChatPipelineNodeType[],
): ChatPipelineNodeCategory {
  return catalog.find((entry) => entry.type === node.type)?.category ?? 'logic';
}

export function definitionOf(
  node: ChatPipelineGraphNode,
  catalog: ChatPipelineNodeType[],
): ChatPipelineNodeType | null {
  return catalog.find((entry) => entry.type === node.type) ?? null;
}

export function formatConfigValue(value: unknown): string {
  if (value === undefined || value === null || value === '') {
    return '∅';
  }
  if (typeof value === 'string') {
    return value.length > 34 ? `${value.slice(0, 34)}…` : value;
  }
  return JSON.stringify(value);
}

export function formatConditionValue(value: unknown): string {
  if (typeof value === 'string') {
    return `"${value}"`;
  }
  return JSON.stringify(value) ?? 'null';
}

/** One-line runtime value for edge pills; whitespace is flattened. */
export function formatRuntimePreview(value: unknown, max = 26): string {
  if (value === undefined) {
    return '—';
  }
  if (value === null) {
    return 'null';
  }
  if (typeof value === 'string') {
    const text = value.replace(/\s+/g, ' ').trim();
    if (text === '') {
      return '空文本';
    }
    return text.length > max ? `${text.slice(0, max)}…` : text;
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  if (Array.isArray(value)) {
    return `[${value.length} 项]`;
  }
  try {
    const text = JSON.stringify(value);
    if (text === undefined) {
      return String(value);
    }
    return text.length > max ? `${text.slice(0, max)}…` : text;
  } catch {
    return '…';
  }
}

/** Pretty runtime value for inspector blocks. */
export function formatRuntimeDetail(value: unknown): string {
  if (value === undefined) {
    return '（未收到）';
  }
  try {
    return JSON.stringify(value, null, 2) ?? 'null';
  } catch {
    return String(value);
  }
}

export function formatRunTime(iso: string): string {
  const date = new Date(iso);
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const time = date.toLocaleTimeString('zh-CN', { hour12: false });
  return `${month}-${day} ${time}`;
}

export function formatDuration(ms: number | null): string {
  if (ms === null) {
    return '—';
  }
  return ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(2)}s`;
}

/** True when adding from → to would close a loop in the push-based DAG. */
export function wouldCreateCycle(
  edges: Array<{ from: string; to: string }>,
  from: string,
  to: string,
): boolean {
  if (from === to) {
    return true;
  }
  const outgoing = new Map<string, string[]>();
  for (const edge of edges) {
    const list = outgoing.get(edge.from) ?? [];
    list.push(edge.to);
    outgoing.set(edge.from, list);
  }

  const stack = [to];
  const seen = new Set<string>();
  while (stack.length > 0) {
    const current = stack.pop()!;
    if (current === from) {
      return true;
    }
    if (seen.has(current)) {
      continue;
    }
    seen.add(current);
    stack.push(...(outgoing.get(current) ?? []));
  }

  return false;
}

export const VARIABLE_KEY_PATTERN = /^[\p{L}\p{N}\p{M}_-]{1,32}$/u;
export const MAX_PIPELINE_VARIABLES = 32;

/** Create-row config for dropdowns that pick a pipeline variable. */
export function variableSelectCreate(
  variables: ChatPipelineVariable[],
  onCreate: (key: string) => void,
): PipelineSelectCreate {
  return {
    label: '新建变量',
    placeholder: '变量名，如 计数器 或 counter',
    maxLength: 32,
    validate: (value) => {
      if (!VARIABLE_KEY_PATTERN.test(value)) {
        return '支持任意语言的字母、数字、下划线或连字符，1–32 个字符';
      }
      if (variables.some((variable) => variable.key === value)) {
        return '该变量已存在，直接选择即可';
      }
      if (variables.length >= MAX_PIPELINE_VARIABLES) {
        return `一张图最多 ${MAX_PIPELINE_VARIABLES} 个变量`;
      }
      return null;
    },
    onCreate,
  };
}
