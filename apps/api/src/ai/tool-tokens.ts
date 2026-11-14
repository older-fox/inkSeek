import { DEFAULT_TOOL_MAX_TOKENS, MIN_TOOL_MAX_TOKENS } from '@inkseek/shared';
import { CONFIG_KEYS } from '../config/config-keys.js';
import { SystemConfigService } from '../config/system-config.service.js';

/** Missing or nonsensical stored values fall back to the shipped 20k ceiling. */
export function normalizeToolMaxTokens(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= MIN_TOOL_MAX_TOKENS
    ? Math.floor(value)
    : DEFAULT_TOOL_MAX_TOKENS;
}

/** Reads the operator ceiling once per call; settings are live and never cached. */
export async function readToolMaxTokens(config: SystemConfigService): Promise<number> {
  return normalizeToolMaxTokens(await config.get<number>(CONFIG_KEYS.aiMaxTokens));
}
