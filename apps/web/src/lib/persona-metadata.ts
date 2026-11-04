import type { PersonaValue } from '@/lib/channel-persona';

export interface PersonaHistoryEntry {
  id: string;
  time: string;
  field: string;
  from: string;
  to: string;
  reason: string;
}

export interface PersonaMetadata {
  createdAt: string;
  updatedAt: string;
  history: readonly PersonaHistoryEntry[];
}

const MANUAL_REASON = '手动编辑';
const COALESCE_WINDOW_MS = 15_000;

export function formatPersonaTimestamp(iso: string, withYear = true): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return iso;
  }

  const pad = (value: number) => String(value).padStart(2, '0');
  const stamp = `${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(
    date.getMinutes(),
  )}`;

  return withYear ? `${date.getFullYear()}-${stamp}` : stamp;
}

export function formatPersonaValue(value: PersonaValue | undefined): string {
  if (value === undefined) {
    return '未同步';
  }
  if (Array.isArray(value)) {
    return value.length > 0 ? value.join('、') : '空';
  }
  if (typeof value === 'boolean') {
    return value ? '开启' : '关闭';
  }
  return String(value);
}

/**
 * 同一次拖动会在很短时间内产生大量变更，合并为一条历史，保留最初的值。
 */
export function appendPersonaHistory(
  meta: PersonaMetadata,
  change: { field: string; from: string; to: string },
  time = new Date(),
): PersonaMetadata {
  const latest = meta.history[0];
  const sameDraftChange =
    latest !== undefined &&
    latest.field === change.field &&
    latest.reason === MANUAL_REASON &&
    time.getTime() - new Date(latest.time).getTime() <= COALESCE_WINDOW_MS;

  if (latest !== undefined && sameDraftChange) {
    return {
      ...meta,
      updatedAt: time.toISOString(),
      history: [{ ...latest, time: time.toISOString(), to: change.to }, ...meta.history.slice(1)],
    };
  }

  return {
    ...meta,
    updatedAt: time.toISOString(),
    history: [
      {
        id: `local-${time.getTime()}`,
        time: time.toISOString(),
        field: change.field,
        from: change.from,
        to: change.to,
        reason: MANUAL_REASON,
      },
      ...meta.history,
    ],
  };
}
