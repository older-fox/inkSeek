import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Legacy shared roots. Read-only: the migration script copies them into channel directories. */
export const CHAT_MEDIA_ROOT = fileURLToPath(
  new URL('../../../../data/chat/images/', import.meta.url),
);
export const CHAT_VOICE_ROOT = fileURLToPath(
  new URL('../../../../data/chat/voices/', import.meta.url),
);
export const CHAT_STICKER_ROOT = fileURLToPath(
  new URL('../../../../data/chat/stickers/', import.meta.url),
);

/** Channel-first root: every channel owns one directory with images, voices and stickers. */
export const CHAT_CHANNEL_ROOT = fileURLToPath(
  new URL('../../../../data/chat/channels/', import.meta.url),
);
export const CHAT_CHANNEL_MEDIA_URL_PREFIX = '/api/v1/media/channels';

export type ChannelMediaKind = 'images' | 'voices' | 'stickers';

const CHANNEL_ID_PATTERN = /^[a-z0-9]{8,64}$/;

export function isChannelId(value: string): boolean {
  return CHANNEL_ID_PATTERN.test(value);
}

/** Absolute path of `<repo>/data/chat/channels/<channelId>/<kind>/<storagePath>`. */
export function channelMediaPath(
  channelId: string,
  kind: ChannelMediaKind,
  storagePath: string,
): string {
  if (!isChannelId(channelId)) {
    throw new Error(`非法的渠道：${channelId}`);
  }
  const segments = storagePath.split('/').filter(Boolean);
  if (segments.some((part) => part === '.' || part === '..' || /[\\:]/.test(part))) {
    throw new Error(`非法的媒体路径：${storagePath}`);
  }
  return resolve(CHAT_CHANNEL_ROOT, channelId, kind, ...segments);
}

export function channelMediaUrl(
  channelId: string,
  kind: ChannelMediaKind,
  storagePath: string,
): string {
  if (!isChannelId(channelId)) {
    throw new Error(`非法的渠道：${channelId}`);
  }
  const encoded = storagePath
    .split('/')
    .filter(Boolean)
    .map((part) => encodeURIComponent(part))
    .join('/');
  return `${CHAT_CHANNEL_MEDIA_URL_PREFIX}/${channelId}/${kind}/${encoded}`;
}

export interface ChannelMediaReference {
  channelId: string;
  kind: ChannelMediaKind;
  storagePath: string;
}

export function splitChannelMediaUrl(reference: string): ChannelMediaReference | null {
  const prefix = `${CHAT_CHANNEL_MEDIA_URL_PREFIX}/`;
  if (!reference.startsWith(prefix)) {
    return null;
  }
  const rest = reference.slice(prefix.length).split('?')[0] ?? '';
  const [channelId = '', kind = '', ...parts] = rest.split('/');
  if (!isChannelId(channelId)) {
    return null;
  }
  if (kind !== 'images' && kind !== 'voices' && kind !== 'stickers') {
    return null;
  }
  let storagePath: string;
  try {
    storagePath = parts.map((part) => decodeURIComponent(part)).join('/');
  } catch {
    return null;
  }
  return storagePath ? { channelId, kind, storagePath } : null;
}

/** Parses a channel media URL and rejects references that belong to another channel. */
export function parseChannelMediaUrl(
  reference: string,
  expectedChannelId: string,
): { kind: ChannelMediaKind; storagePath: string } | null {
  const parsed = splitChannelMediaUrl(reference);
  if (!parsed || parsed.channelId !== expectedChannelId) {
    return null;
  }
  return { kind: parsed.kind, storagePath: parsed.storagePath };
}
