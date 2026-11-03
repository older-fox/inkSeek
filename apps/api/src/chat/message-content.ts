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

export function extractContent(segments: readonly OneBotSegment[]): ExtractedContent {
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
      case 'video':
        parts.push('[视频]');
        hasPlainText = true;
        break;
      case 'file':
        parts.push('[文件]');
        hasPlainText = true;
        break;
      case 'json':
      case 'xml':
        parts.push('[卡片消息]');
        hasPlainText = true;
        break;
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
  options: { skipForward?: boolean } = {},
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
        case 'video':
          appendText('[视频]');
          break;
        case 'file':
          appendText('[文件]');
          break;
        case 'json':
        case 'xml':
          appendText('[卡片消息]');
          break;
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
