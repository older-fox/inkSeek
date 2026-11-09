import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service.js';
import { ChatEventsService } from './chat-events.service.js';
import type { OneBotRequester } from './onebot.js';

/** QQ transcribes asynchronously; the first call often arrives before the text exists. */
const RETRY_DELAYS_MS = [0, 2_000, 5_000];
const FETCH_TIMEOUT_MS = 10_000;
const MAX_DESCRIPTION_LENGTH = 2_000;

@Injectable()
export class VoiceTranscriptionService {
  private readonly logger = new Logger(VoiceTranscriptionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly events: ChatEventsService,
  ) {}

  /**
   * Requests QQ's own speech-to-text for the message's first voice segment.
   * Silence, very short clips or an unavailable transcription service leave the
   * description null; none of them should fail message ingestion.
   */
  async transcribe(
    client: OneBotRequester,
    message: {
      id: string;
      externalId: string | null;
      channelId: string;
      conversationId: string;
    },
  ): Promise<{ voiceId: string; transcript: string } | null> {
    if (!message.externalId) {
      return null;
    }

    const voice = await this.prisma.chatVoiceAsset.findFirst({
      where: { messageId: message.id },
      orderBy: { position: 'asc' },
      select: { id: true },
    });

    if (!voice) {
      return null;
    }

    for (const delay of RETRY_DELAYS_MS) {
      if (delay > 0) {
        await sleep(delay);
      }

      const description = await this.request(client, message.externalId);
      if (!description) {
        continue;
      }

      await this.prisma.chatVoiceAsset.update({
        where: { id: voice.id },
        data: { description },
      });
      this.events.emit({
        type: 'message.updated',
        channelId: message.channelId,
        conversationId: message.conversationId,
        messageId: message.id,
      });
      return { voiceId: voice.id, transcript: description };
    }

    this.logger.debug(`语音未获得转写文本：${message.externalId}`);
    return null;
  }

  /** One fetch_ptt_text attempt; any failure means "no transcript yet", not an error. */
  private async request(client: OneBotRequester, externalId: string): Promise<string | null> {
    try {
      const response = await client.call<{ text?: string }>(
        'fetch_ptt_text',
        { message_id: externalId },
        FETCH_TIMEOUT_MS,
      );
      const text = typeof response?.text === 'string' ? response.text.trim() : '';
      return text ? text.slice(0, MAX_DESCRIPTION_LENGTH) : null;
    } catch (error) {
      this.logger.debug(
        `fetch_ptt_text 失败：${error instanceof Error ? error.message : String(error)}`,
      );
      return null;
    }
  }
}

/** Waits between transcription retries; QQ needs a moment to finish ASR. */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
