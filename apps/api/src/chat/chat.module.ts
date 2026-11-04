import { Module } from '@nestjs/common';
import { AiModule } from '../ai/ai.module.js';
import { AuthModule } from '../auth/auth.module.js';
import { MindModule } from '../mind/mind.module.js';
import { PersonasModule } from '../personas/personas.module.js';
import { RedisModule } from '../redis/redis.module.js';
import { ChatController } from './chat.controller.js';
import { ChatEventsService } from './chat-events.service.js';
import { ChatForwardService } from './chat-forward.service.js';
import { ChatMessageProcessor } from './chat-message-processor.service.js';
import { ChatMessagesService } from './chat-messages.service.js';
import { ChatRuntimeService } from './chat-runtime.service.js';
import { ChatService } from './chat.service.js';
import { MediaModule } from './media.module.js';
import { PrivateBurstService } from './private-burst.service.js';
import { VoiceTranscriptionService } from './voice-transcription.service.js';

@Module({
  imports: [AuthModule, PersonasModule, AiModule, RedisModule, MindModule, MediaModule],
  controllers: [ChatController],
  providers: [
    ChatService,
    ChatRuntimeService,
    ChatMessagesService,
    ChatForwardService,
    ChatMessageProcessor,
    PrivateBurstService,
    VoiceTranscriptionService,
    ChatEventsService,
  ],
})
export class ChatModule {}
