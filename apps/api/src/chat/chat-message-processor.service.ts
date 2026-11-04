import { Injectable, Logger } from '@nestjs/common';
import { MindRuntimeService } from '../mind/mind-runtime.service.js';
import { MindSettingsService } from '../mind/mind-settings.service.js';
import { ChatPipelineRunner } from './pipeline/pipeline-runner.service.js';
import type { PipelineMessage } from './pipeline/pipeline-types.js';
import { PrivateBurstService } from './private-burst.service.js';

export type PersistedChatMessage = PipelineMessage;

/**
 * Hand-off point between ingest and the behavior engines. Ingest stores the
 * message first, then hands a self-contained snapshot to either the classic
 * pipeline or the persona mind. Pipeline/mind failures are logged here and
 * never propagate back into message persistence.
 */
@Injectable()
export class ChatMessageProcessor {
  private readonly logger = new Logger(ChatMessageProcessor.name);

  constructor(
    private readonly pipeline: ChatPipelineRunner,
    private readonly mind: MindRuntimeService,
    private readonly mindSettings: MindSettingsService,
    private readonly burst: PrivateBurstService,
  ) {}

  async process(message: PersistedChatMessage): Promise<void> {
    try {
      if (message.isSelf) {
        await this.pipeline.run(message);
        return;
      }

      const settings = await this.mindSettings.get(message.channelId);
      if (settings.mode === 'LIVE' || settings.mode === 'APPROVAL') {
        if (message.conversationKind === 'PRIVATE' && settings.privateBurstSeconds > 0) {
          this.burst.schedule(message, settings.privateBurstSeconds, (messages, quietSeconds) =>
            this.handleBurst(messages, quietSeconds),
          );
          return;
        }
        const result = await this.mind.turn({ message, trigger: 'MESSAGE' });
        if (result.skipped && !result.suppressed) {
          await this.pipeline.run(message);
        }
        return;
      }

      await this.pipeline.run(message);

      if (settings.mode === 'SHADOW') {
        void this.mind
          .turn({ message, mode: 'SHADOW', trigger: 'MESSAGE' })
          .catch((error: unknown) => {
            this.logger.warn(
              `影子心智运行失败：${error instanceof Error ? error.message : String(error)}`,
            );
          });
      }
    } catch (error) {
      this.logger.warn(`消息处理失败：${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private async handleBurst(messages: PersistedChatMessage[], quietSeconds: number): Promise<void> {
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
    const result = await this.mind.turn({ message: last, trigger: 'MESSAGE' });
    if (result.skipped && !result.suppressed) {
      await this.pipeline.run(last);
    }
  }
}
