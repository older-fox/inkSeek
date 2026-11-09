import { Body, Controller, HttpCode, Param, Post, UseGuards } from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  chatDirectConversationSchema,
  chatDirectMessageSchema,
  type ChatConversationSummary,
  type ChatDirectConversationInput,
  type ChatDirectMessageInput,
  type ChatMessageSummary,
} from '@inkseek/shared';
import { AuthGuard } from '../auth/auth.guard.js';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe.js';
import { ChatDirectService } from './chat-direct.service.js';

@ApiTags('chat')
@ApiCookieAuth()
@Controller('chat/direct')
@UseGuards(AuthGuard)
export class ChatDirectController {
  constructor(private readonly direct: ChatDirectService) {}

  /** Idempotently opens (or reuses) the direct conversation backing a web test chat. */
  @Post('conversations')
  @ApiOperation({ summary: '打开一条绕过 QQ 的直连会话' })
  ensure(
    @Body(new ZodValidationPipe(chatDirectConversationSchema))
    input: ChatDirectConversationInput,
  ): Promise<ChatConversationSummary> {
    return this.direct.ensure(input);
  }

  /** Feeds a user message into the agent pipeline as if it had arrived from QQ. */
  @Post('conversations/:id/messages')
  @HttpCode(201)
  @ApiOperation({ summary: '以指定身份直接对人格说话（不经过 QQ）' })
  send(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(chatDirectMessageSchema)) input: ChatDirectMessageInput,
  ): Promise<ChatMessageSummary> {
    return this.direct.sendIncoming(id, input.text);
  }
}
