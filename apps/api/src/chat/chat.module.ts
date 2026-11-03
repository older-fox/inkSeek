import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { PersonasModule } from '../personas/personas.module.js';
import { ChatController } from './chat.controller.js';
import { ChatEventsService } from './chat-events.service.js';
import { ChatForwardService } from './chat-forward.service.js';
import { ChatMediaService } from './chat-media.service.js';
import { ChatMessageProcessor } from './chat-message-processor.service.js';
import { ChatMessagesService } from './chat-messages.service.js';
import { ChatPersonaService } from './chat-persona.service.js';
import { ChatRuntimeService } from './chat-runtime.service.js';
import { ChatService } from './chat.service.js';

@Module({
  imports: [AuthModule, PersonasModule],
  controllers: [ChatController],
  providers: [
    ChatService,
    ChatRuntimeService,
    ChatMessagesService,
    ChatForwardService,
    ChatPersonaService,
    ChatMediaService,
    ChatMessageProcessor,
    ChatEventsService,
  ],
})
export class ChatModule {}
