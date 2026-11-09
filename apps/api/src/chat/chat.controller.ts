import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  Put,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  chatConversationQuerySchema,
  chatMessageQuerySchema,
  connectChatChannelSchema,
  saveChannelPersonaSchema,
  sendChatMessageSchema,
  type ChatChannelConnectInput,
  type ChatChannelSummary,
  type ChatConversationKind,
  type ChatConversationSummary,
  type ChatForwardDetail,
  type ChatMessagePage,
  type ChatMessageSummary,
  type ChatSendMessageInput,
  type SaveChannelPersonaInput,
} from '@inkseek/shared';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { AuthGuard } from '../auth/auth.guard.js';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe.js';
import { ChatEventsService } from './chat-events.service.js';
import { ChatService } from './chat.service.js';

interface ConversationQuery {
  kind: ChatConversationKind;
}

interface MessageQuery {
  cursor?: string;
  limit: number;
}

@ApiTags('chat')
@ApiCookieAuth()
@Controller('chat')
@UseGuards(AuthGuard)
export class ChatController {
  constructor(
    private readonly chat: ChatService,
    private readonly events: ChatEventsService,
  ) {}

  /** Channels the operator has connected; no live NapCat state is consulted here. */
  @Get('channels')
  @ApiOperation({ summary: '列出已接入的消息渠道' })
  channels(): Promise<ChatChannelSummary[]> {
    return this.chat.listChannels();
  }

  /** Persists the channel only after a successful NapCat handshake, so bad credentials fail early. */
  @Post('channels')
  @HttpCode(201)
  @ApiOperation({ summary: '连接 NapCat 并接入一个 QQ 渠道' })
  connect(
    @Body(new ZodValidationPipe(connectChatChannelSchema)) input: ChatChannelConnectInput,
  ): Promise<ChatChannelSummary> {
    return this.chat.connect(input);
  }

  /** Deletes the channel and everything stored under its namespace; this is irreversible. */
  @Delete('channels/:id')
  @HttpCode(204)
  @ApiOperation({ summary: '移除渠道并清空该渠道命名空间下的数据' })
  removeChannel(@Param('id') id: string): Promise<void> {
    return this.chat.deleteChannel(id);
  }

  /** Conversations of one kind within the current channel namespace, most recent activity first. */
  @Get('conversations')
  @ApiOperation({ summary: '按类型列出渠道命名空间内的会话' })
  conversations(
    @Query(new ZodValidationPipe(chatConversationQuerySchema)) query: ConversationQuery,
  ): Promise<ChatConversationSummary[]> {
    return this.chat.listConversations(query.kind);
  }

  /** Cursor-paginated history; the cursor is the id of the oldest loaded message. */
  @Get('conversations/:id/messages')
  @ApiOperation({ summary: '分页读取会话消息' })
  messages(
    @Param('id') id: string,
    @Query(new ZodValidationPipe(chatMessageQuerySchema)) query: MessageQuery,
  ): Promise<ChatMessagePage> {
    return this.chat.getMessages(id, { cursor: query.cursor, limit: query.limit });
  }

  /** Expanded nodes of one merged-forward message, read from stored attachments. */
  @Get('messages/:id/forward')
  @ApiOperation({ summary: '读取合并转发消息展开后的节点' })
  forward(@Param('id') id: string): Promise<ChatForwardDetail> {
    return this.chat.getForwardDetail(id);
  }

  /** Sends through the channel's NapCat session and archives the resulting message. */
  @Post('conversations/:id/messages')
  @HttpCode(201)
  @ApiOperation({ summary: '通过 NapCat 发送消息并归档' })
  send(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(sendChatMessageSchema)) input: ChatSendMessageInput,
  ): Promise<ChatMessageSummary> {
    return this.chat.sendMessage(id, input);
  }

  /** Writes the persona values the mind reads as its single source of truth. */
  @Put('channels/:id/persona')
  @ApiOperation({ summary: '保存渠道人格的基本数值（唯一真源）' })
  savePersona(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(saveChannelPersonaSchema))
    input: SaveChannelPersonaInput,
  ): Promise<ChatChannelSummary> {
    return this.chat.updatePersonaValues(id, input);
  }

  /** Hijacks the response and streams chat events as SSE until the client disconnects. */
  @Get('events')
  @ApiOperation({ summary: '订阅渠道、会话与消息的实时变更' })
  stream(@Req() request: FastifyRequest, @Res() reply: FastifyReply): void {
    reply.hijack();

    const response = reply.raw;
    response.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    response.write('retry: 3000\n\n');
    response.write(': connected\n\n');
    response.flushHeaders();

    let closed = false;
    /** Tears the stream down once; both client disconnect and publisher close reach it. */
    const cleanup = () => {
      if (closed) {
        return;
      }
      closed = true;
      clearInterval(heartbeat);
      subscription.unsubscribe();
      response.end();
    };

    const subscription = this.events.stream().subscribe({
      next: (event) => {
        if (!closed) {
          response.write(`data: ${JSON.stringify(event)}\n\n`);
        }
      },
      error: cleanup,
      complete: cleanup,
    });

    const heartbeat = setInterval(() => {
      if (!closed) {
        response.write(': keep-alive\n\n');
      }
    }, 15_000);

    request.raw.on('close', cleanup);
    response.on('close', cleanup);
  }
}
