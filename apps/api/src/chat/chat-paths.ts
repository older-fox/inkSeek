import { fileURLToPath } from 'node:url';

/** Both src/chat and dist/chat sit two directories below apps/, so this resolves to <repo>/data. */
export const CHAT_DATA_ROOT = fileURLToPath(new URL('../../../../data/chat/', import.meta.url));
export const CHAT_MEDIA_ROOT = fileURLToPath(
  new URL('../../../../data/chat/images/', import.meta.url),
);
export const CHAT_MEDIA_URL_PREFIX = '/api/v1/media/images';
export const CHAT_VOICE_ROOT = fileURLToPath(
  new URL('../../../../data/chat/voices/', import.meta.url),
);
export const CHAT_VOICE_URL_PREFIX = '/api/v1/media/voices';
