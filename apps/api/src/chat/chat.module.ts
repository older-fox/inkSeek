import { Module } from '@nestjs/common';
import { AiModule } from '../ai/ai.module.js';
import { AuthModule } from '../auth/auth.module.js';
import { PersonasModule } from '../personas/personas.module.js';
import { RedisModule } from '../redis/redis.module.js';
import { ChatController } from './chat.controller.js';
import { ChatEventsService } from './chat-events.service.js';
import { ChatForwardService } from './chat-forward.service.js';
import { ImageDescriptionService } from './image-description.service.js';
import { ChatMediaService } from './chat-media.service.js';
import { ChatMessageProcessor } from './chat-message-processor.service.js';
import { ChatMessagesService } from './chat-messages.service.js';
import { ChatPersonaService } from './chat-persona.service.js';
import { ChatRuntimeService } from './chat-runtime.service.js';
import { ChatService } from './chat.service.js';
import { PromptCompressionService } from './prompt-compression.service.js';
import { VoiceTranscriptionService } from './voice-transcription.service.js';
import { PipelineController } from './pipeline/pipeline.controller.js';
import { PipelineEffectsService } from './pipeline/pipeline-effects.service.js';
import { PipelineEventsService } from './pipeline/pipeline-events.service.js';
import { PipelineGraphService } from './pipeline/pipeline-graph.service.js';
import { ChatPipelineRunner } from './pipeline/pipeline-runner.service.js';

@Module({
  imports: [AuthModule, PersonasModule, AiModule, RedisModule],
  controllers: [ChatController, PipelineController],
  providers: [
    ChatService,
    ChatRuntimeService,
    ChatMessagesService,
    ChatForwardService,
    ImageDescriptionService,
    PromptCompressionService,
    ChatPersonaService,
    ChatMediaService,
    ChatMessageProcessor,
    VoiceTranscriptionService,
    ChatPipelineRunner,
    PipelineEffectsService,
    PipelineEventsService,
    PipelineGraphService,
    ChatEventsService,
  ],
})
export class ChatModule {}
