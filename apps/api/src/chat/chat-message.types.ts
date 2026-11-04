import type { ChatConversationKind, ChatMessageKind } from '@inkseek/shared';

export interface ChatMessageVoice {
  url: string;
  position: number;
  /** Duration in seconds when the connector provides it. */
  duration: number | null;
  /** Speech-to-text text; null for silence or when transcription did not finish. */
  transcript: string | null;
  mimeType: string | null;
  byteSize: number | null;
}

export interface ChatMessageQuote {
  messageId: string | null;
  externalId: string | null;
  authorName: string;
  authorId: string | null;
  text: string;
  kind: ChatMessageKind;
  sentAt: string | null;
  images: string[];
}

/** Self-contained snapshot handed from ingest to the mind runtime. */
export interface ChatMessageSnapshot {
  messageId: string;
  channelId: string;
  conversationId: string;
  conversationKind: ChatConversationKind;
  /** External conversation id: group number for groups, peer QQ for private chats. */
  conversationExternalId: string;
  externalId: string | null;
  isSelf: boolean;
  senderId: string;
  senderName: string;
  text: string;
  kind: ChatMessageKind;
  /** Resolved quote snapshot, so the quoted content reaches the model context. */
  quote: ChatMessageQuote | null;
  /** Stored image references (media URLs), in message order. */
  images: string[];
  imageCount: number;
  /** Stored voice segments in message order; transcription is awaited before the run. */
  voices: ChatMessageVoice[];
  voiceCount: number;
  sentAt: Date;
}
