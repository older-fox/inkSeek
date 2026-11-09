/**
 * Critical-value advisories only. The planner is told to judge which attributes
 * a turn or event affects and apply the change itself, so this module does not
 * pre-write stat-by-stat consequences. It only flags values already in a
 * dangerous band; nothing here mutates state or blocks behavior.
 */
export const CRITICAL_HEALTH = 30;
export const CRITICAL_SLEEP_DEBT = 85;
export const CRITICAL_AWAKE_HOURS = 24;
export const CRITICAL_STRESS = 90;

export interface CriticalAdvisory {
  awakeMinutes: number | null;
  awakeHours: number | null;
  warnings: string[];
}

/** Collects warnings for values already in a dangerous band; advisory only, the
 *  caller decides whether to surface or act on them. */
export function criticalAdvisory(
  awakeMinutes: number | null,
  context?: { health?: number; sleepDebt?: number; stress?: number },
): CriticalAdvisory {
  const warnings: string[] = [];
  const awakeHours =
    awakeMinutes === null || !Number.isFinite(awakeMinutes) ? null : Math.max(0, awakeMinutes / 60);

  if (awakeHours !== null && awakeHours >= CRITICAL_AWAKE_HOURS) {
    warnings.push(`已连续清醒约 ${round1(awakeHours)} 小时，超过一天没有睡。`);
  }
  if (context?.sleepDebt !== undefined && context.sleepDebt >= CRITICAL_SLEEP_DEBT) {
    warnings.push(`睡眠债 ${context.sleepDebt}，已经严重缺觉。`);
  }
  if (context?.health !== undefined && context.health <= CRITICAL_HEALTH) {
    warnings.push(
      context.health <= 15
        ? `健康 ${context.health}，已经极低，继续恶化可能危及生命。`
        : `健康 ${context.health}，已经进入危险区。`,
    );
  }
  if (context?.stress !== undefined && context.stress >= CRITICAL_STRESS) {
    warnings.push(`压力 ${context.stress}，已经接近上限。`);
  }

  return {
    awakeMinutes,
    awakeHours: awakeHours === null ? null : round1(awakeHours),
    warnings,
  };
}

/** Rounds to one decimal place for display. */
function round1(value: number): number {
  return Math.round(value * 10) / 10;
}
