import { Injectable, Logger } from '@nestjs/common';
import { MindRuntimeService } from '../mind/mind-runtime.service.js';
import { MindSettingsService } from '../mind/mind-settings.service.js';
import type { ChatMessageSnapshot } from './chat-message.types.js';
import { PrivateBurstService } from './private-burst.service.js';

/**
 * Hand-off point between ingest and the persona mind. Ingest stores the
 * message first, then hands a self-contained snapshot to the mind. Failures are
 * logged here and never propagate back into message persistence.
 */
@Injectable()
export class ChatMessageProcessor {
  private readonly logger = new Logger(ChatMessageProcessor.name);

  constructor(
    private readonly mind: MindRuntimeService,
    private readonly mindSettings: MindSettingsService,
    private readonly burst: PrivateBurstService,
  ) {}

  async process(message: ChatMessageSnapshot): Promise<void> {
    try {
      if (message.isSelf) {
        return;
      }

      const settings = await this.mindSettings.get(message.channelId);
      if (settings.mode === 'OFF') {
        return;
      }

      if (settings.mode === 'SHADOW') {
        void this.mind
          .turn({ message, mode: 'SHADOW', trigger: 'MESSAGE' })
          .catch((error: unknown) => {
            this.logger.warn(
              `影子心智运行失败：${error instanceof Error ? error.message : String(error)}`,
            );
          });
        return;
      }

      if (message.conversationKind === 'PRIVATE' && settings.privateBurstSeconds > 0) {
        this.burst.schedule(message, settings.privateBurstSeconds, (messages, quietSeconds) =>
          this.handleBurst(messages, quietSeconds),
        );
        return;
      }
      await this.mind.turn({ message, trigger: 'MESSAGE' });
    } catch (error) {
      this.logger.warn(`消息处理失败：${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private async handleBurst(messages: ChatMessageSnapshot[], quietSeconds: number): Promise<void> {
    const last = messages[messages.length - 1];
    if (!last) {
      return;
    }
    for (const merged of messages.slice(0, -1)) {
      await this.mind
        .recordMergedMessage(merged, { batchSize: messages.length, quietSeconds })
        .catch((error: unknown) => {
          this.logger.warn(
            `私聊合并轨迹写入失败：${error instanceof Error ? error.message : String(error)}`,
          );
        });
    }
    await this.mind.turn({ message: last, trigger: 'MESSAGE' });
  }
}
