/**
 * Prompt-facing, surrogate-safe truncation.
 *
 * `String.prototype.slice` counts UTF-16 code units, so it can cut through a
 * surrogate pair (emoji, math letters like `𝓞`). `JSON.stringify` then emits a
 * dangling `\ud835` escape, and strict parsers such as DeepSeek's reject the
 * whole request with "unexpected end of hex escape". Spreading the string
 * iterates code points instead, so a pair is never split.
 *
 * `max` counts code points (not UTF-16 units). Pass an empty `suffix` when the
 * text is stored or shown as-is and should not gain an ellipsis.
 */
export function truncateText(value: string, max: number, suffix = '…'): string {
  if (value.length <= max) return value;
  const chars = [...value];
  return chars.length <= max ? value : `${chars.slice(0, max).join('')}${suffix}`;
}

/** A high surrogate without a following low, or a low without a leading high. */
const LONE_SURROGATE = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g;

/**
 * Last line of defense at the LLM boundary: never send an unpaired surrogate.
 * Truncation is fixed at the source, but stored memories, model output and
 * future callers can still introduce one; replacing it with U+FFFD keeps the
 * request valid instead of failing the whole turn.
 */
export function sanitizeText(value: string): string {
  return value.replace(LONE_SURROGATE, '\uFFFD');
}
