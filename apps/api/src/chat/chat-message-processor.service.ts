import { Injectable, Logger } from '@nestjs/common';
import type { ChatConversationKind, ChatMessageKind } from '@inkseek/shared';

export interface PersistedChatMessage {
  messageId: string;
  channelId: string;
  conversationId: string;
  conversationKind: ChatConversationKind;
  externalId: string | null;
  isSelf: boolean;
  senderId: string;
  senderName: string;
  text: string;
  kind: ChatMessageKind;
  /** Resolved quote snapshot, so the quoted content reaches the model context. */
  quote: { authorName: string; text: string } | null;
  imageCount: number;
  voiceCount: number;
  sentAt: Date;
}

/**
 * Every persisted message enters this pipeline, including our own outgoing
 * messages. The AI layer is not connected yet, so the pipeline deliberately
 * stops here after logging.
 */
@Injectable()
export class ChatMessageProcessor {
  private readonly logger = new Logger(ChatMessageProcessor.name);

  async process(message: PersistedChatMessage): Promise<void> {
    // TODO: 接入 AI 框架后，在这里完成人格记忆检索（按 channelId 命名空间隔离）、
    // 上下文拼装、模型调用与回复生成。群聊和私聊的记忆都挂在同一个渠道命名空间下。
    // TODO: 生成回复后调用 ChatService.sendMessage 回写 NapCat，并记录 AI 发送的消息。
    // TODO: 处理失败/超时/限流时写入消息处理状态，供前端展示重试入口。
    // TODO: 当前未接入 AI，消息只入库与展示，不做任何回复或改写。
    if (message.isSelf) {
      // 自己发出的消息不再触发自动回复，仅保留处理入口，方便后续接入 AI 观察链路。
      return;
    }

    this.logger.debug(
      `消息进入处理占位管线：channel=${message.channelId} conversation=${message.conversationId} message=${message.messageId}`,
    );
  }
}
