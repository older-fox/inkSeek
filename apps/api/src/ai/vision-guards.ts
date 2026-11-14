/**
 * A model that cannot see the image often answers politely instead of failing,
 * e.g. "抱歉，我无法查看这张图片". Those replies must never be stored as the
 * image description, or they get cached forever.
 */
const REFUSAL_PATTERNS: readonly RegExp[] = [
  /(无法|不能|没法|看不到|看不清)(查看|看到|读取|识别|理解|获取|处理)?[^。！？\n]{0,8}(图片|图像|照片|截图|画面)/u,
  /(不支持|无法处理|无法接收)[^。！？\n]{0,8}(图片|图像|多模态|视觉)/u,
  /^(抱歉|对不起)[，,、\s]*(我)?(无法|不能|没法)/u,
  /unsupported image/iu,
  /\b(i|we)\s+(cannot|can't|can not|am unable to|are unable to)\s+(see|view|read|access|process)\b/iu,
];

/** True when the reply says the model cannot read the image at all. */
export function isVisionRefusal(text: string): boolean {
  const value = text.trim();
  if (value.length === 0) {
    return true;
  }
  return REFUSAL_PATTERNS.some((pattern) => pattern.test(value));
}
