import type {
  ChatMessageImageSummary,
  ChatMessageKind,
  ChatMessagePart,
  ChatMessageVoiceSummary,
} from '@inkseek/shared';
import type { OneBotSegment } from './onebot.js';

export interface ExtractedContent {
  text: string;
  kind: ChatMessageKind;
}

export function findForwardSegment(segments: readonly OneBotSegment[]): OneBotSegment | null {
  return segments.find((segment) => segment.type === 'forward') ?? null;
}

export function extractContent(
  segments: readonly OneBotSegment[],
  options: { markReply?: boolean } = {},
): ExtractedContent {
  const parts: string[] = [];
  let hasFace = false;
  let hasPlainText = false;
  let hasImages = false;
  let hasVoices = false;
  let hasForward = false;

  segments.forEach((segment) => {
    const data = segment.data;

    switch (segment.type) {
      case 'text': {
        const text = typeof data['text'] === 'string' ? data['text'] : '';
        if (text.length > 0) {
          parts.push(text);
          hasPlainText = true;
        }
        break;
      }
      case 'at': {
        const label =
          (typeof data['name'] === 'string' && data['name']) ||
          (data['qq'] !== undefined ? String(data['qq']) : '');
        if (label) {
          parts.push(`@${label} `);
          hasPlainText = true;
        }
        break;
      }
      case 'face':
        parts.push('[表情]');
        hasFace = true;
        break;
      // mface / marketface are stored as image assets and rendered directly.
      case 'image':
      case 'mface':
      case 'marketface':
        hasImages = true;
        break;
      // record is stored as a voice asset and rendered as an audio bar.
      case 'record':
        hasVoices = true;
        break;
      case 'forward':
        parts.push('[嵌套聊天记录]');
        hasPlainText = true;
        hasForward = true;
        break;
      // Main messages render the quote from their snapshot instead of text;
      // forward nodes have no snapshot and only need a placeholder.
      case 'reply':
        if (options.markReply) {
          parts.push('[引用]');
          hasPlainText = true;
        }
        break;
      case 'video': {
        const url = findBilibiliVideoUrl(data);
        parts.push(url ? `[视频: ${url}]` : '[视频]');
        hasPlainText = true;
        break;
      }
      case 'file':
        parts.push('[文件]');
        hasPlainText = true;
        break;
      case 'json':
      case 'xml': {
        const url = findBilibiliVideoUrl(data);
        parts.push(url ? `[视频链接: ${url}]` : '[卡片消息]');
        hasPlainText = true;
        break;
      }
      default:
        break;
    }
  });

  const text = parts.join('').trim();
  const kind: ChatMessageKind = hasForward
    ? 'FORWARD'
    : hasImages || hasVoices
      ? text.length > 0
        ? 'MIXED'
        : hasVoices && !hasImages
          ? 'VOICE'
          : 'IMAGE'
      : hasFace && !hasPlainText
        ? 'FACE'
        : 'TEXT';

  return { text, kind };
}

/**
 * Replays stored OneBot segments so text, images and voices keep their
 * original order. Media assets carry the segment index in `position`.
 * Nested forwards render from their stored children; `skipForward` suppresses
 * the placeholder so the tree view can show the expanded block instead.
 */
export function buildParts(
  rawSegments: unknown,
  images: readonly ChatMessageImageSummary[],
  voices: readonly ChatMessageVoiceSummary[],
  fallbackText: string,
  options: { skipForward?: boolean; markReply?: boolean } = {},
): ChatMessagePart[] {
  const parts: ChatMessagePart[] = [];
  const imagesByPosition = new Map<number, ChatMessageImageSummary>();
  const voicesByPosition = new Map<number, ChatMessageVoiceSummary>();

  images.forEach((image) => {
    if (!imagesByPosition.has(image.position)) {
      imagesByPosition.set(image.position, image);
    }
  });
  voices.forEach((voice) => {
    if (!voicesByPosition.has(voice.position)) {
      voicesByPosition.set(voice.position, voice);
    }
  });

  const consumedImages = new Set<string>();
  const consumedVoices = new Set<string>();

  const appendText = (value: string) => {
    if (!value) {
      return;
    }
    const last = parts[parts.length - 1];
    if (last && last.type === 'text') {
      last.text += value;
    } else {
      parts.push({ type: 'text', text: value });
    }
  };

  if (Array.isArray(rawSegments)) {
    rawSegments.forEach((raw, position) => {
      if (!raw || typeof raw !== 'object') {
        return;
      }

      const segment = raw as { type?: unknown; data?: unknown };
      const data =
        segment.data && typeof segment.data === 'object'
          ? (segment.data as Record<string, unknown>)
          : {};

      switch (segment.type) {
        case 'text':
          appendText(typeof data['text'] === 'string' ? data['text'] : '');
          break;
        case 'at': {
          const label =
            (typeof data['name'] === 'string' && data['name']) ||
            (data['qq'] !== undefined ? String(data['qq']) : '');
          if (label) {
            appendText(`@${label} `);
          }
          break;
        }
        case 'image':
        case 'mface':
        case 'marketface': {
          const image = imagesByPosition.get(position);
          if (image && !consumedImages.has(image.id)) {
            consumedImages.add(image.id);
            parts.push({ type: 'image', image });
          } else if (!image) {
            appendText('[图片]');
          }
          break;
        }
        case 'record': {
          const voice = voicesByPosition.get(position);
          if (voice && !consumedVoices.has(voice.id)) {
            consumedVoices.add(voice.id);
            parts.push({ type: 'voice', voice });
          } else if (!voice) {
            appendText('[语音]');
          }
          break;
        }
        case 'face':
          appendText('[表情]');
          break;
        case 'forward':
          if (!options.skipForward) {
            appendText('[嵌套聊天记录]');
          }
          break;
        case 'reply':
          if (options.markReply) {
            appendText('[引用]');
          }
          break;
        case 'video': {
          const url = findBilibiliVideoUrl(data);
          appendText(url ? `[视频: ${url}]` : '[视频]');
          break;
        }
        case 'file':
          appendText('[文件]');
          break;
        case 'json':
        case 'xml': {
          const url = findBilibiliVideoUrl(data);
          appendText(url ? `[视频链接: ${url}]` : '[卡片消息]');
          break;
        }
        default:
          break;
      }
    });
  }

  images.forEach((image) => {
    if (!consumedImages.has(image.id)) {
      parts.push({ type: 'image', image });
    }
  });
  voices.forEach((voice) => {
    if (!consumedVoices.has(voice.id)) {
      parts.push({ type: 'voice', voice });
    }
  });

  if (parts.length === 0 && fallbackText && !options.skipForward) {
    appendText(fallbackText);
  }

  return parts;
}

const B23_URL = /(?:https?:\/\/)?b23\.tv\/[0-9A-Za-z]+/i;
const BILI_VIDEO_URL =
  /(?:https?:\/\/)?(?:www\.|m\.)?bilibili\.com\/video\/(?:BV[0-9A-Za-z]{10}|av\d+)[^\s"'<>]*/i;
const BARE_BVID = /(?<![0-9A-Za-z])(BV[0-9A-Za-z]{10})(?![0-9A-Za-z])/;

/**
 * QQ share cards hide the real link inside a JSON/XML string. The persona needs
 * the URL in the message text so it can decide to call video.watch later.
 */
export function findBilibiliVideoUrl(value: unknown, depth = 0): string | null {
  if (depth > 5 || value === null || value === undefined) {
    return null;
  }
  if (typeof value === 'string') {
    const direct = value.match(B23_URL)?.[0] ?? value.match(BILI_VIDEO_URL)?.[0];
    if (direct) {
      return normalizeVideoUrl(direct);
    }
    const bare = value.match(BARE_BVID)?.[1];
    if (bare) {
      return `https://www.bilibili.com/video/${bare}`;
    }
    const trimmed = value.trim();
    if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
      try {
        return findBilibiliVideoUrl(JSON.parse(trimmed), depth + 1);
      } catch {
        return null;
      }
    }
    return null;
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findBilibiliVideoUrl(item, depth + 1);
      if (found) {
        return found;
      }
    }
    return null;
  }
  if (typeof value === 'object') {
    for (const item of Object.values(value as Record<string, unknown>)) {
      const found = findBilibiliVideoUrl(item, depth + 1);
      if (found) {
        return found;
      }
    }
    return null;
  }
  return null;
}

function normalizeVideoUrl(raw: string): string {
  const trimmed = raw.trim().replace(/[)\]，。！？、;,.!?'"]+$/, '');
  if (trimmed.startsWith('//')) {
    return `https:${trimmed}`;
  }
  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed;
  }
  if (/^b23\.tv\//i.test(trimmed)) {
    return `https://${trimmed}`;
  }
  if (/^bilibili\.com\//i.test(trimmed) || /^(?:www\.|m\.)?bilibili\.com\//i.test(trimmed)) {
    return `https://${trimmed}`;
  }
  const bvid = trimmed.match(BARE_BVID)?.[1];
  return bvid ? `https://www.bilibili.com/video/${bvid}` : trimmed;
}
