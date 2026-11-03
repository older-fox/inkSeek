import { Injectable, Logger } from '@nestjs/common';
import { ChatPipelineRunner } from './pipeline/pipeline-runner.service.js';
import type { PipelineMessage } from './pipeline/pipeline-types.js';

export type PersistedChatMessage = PipelineMessage;

/**
 * Hand-off point between ingest and the modular pipeline. Ingest stores the
 * message first, then hands a self-contained snapshot to the runner; pipeline
 * failures are logged here and never propagate back into message persistence.
 */
@Injectable()
export class ChatMessageProcessor {
  private readonly logger = new Logger(ChatMessageProcessor.name);

  constructor(private readonly pipeline: ChatPipelineRunner) {}

  async process(message: PersistedChatMessage): Promise<void> {
    try {
      await this.pipeline.run(message);
    } catch (error) {
      this.logger.warn(
        `消息管线执行失败：${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}
