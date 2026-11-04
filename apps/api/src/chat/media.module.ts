import { Module } from '@nestjs/common';
import { AiModule } from '../ai/ai.module.js';
import { ChatMediaService } from './chat-media.service.js';
import { ImageDescriptionService } from './image-description.service.js';

/**
 * Media access is shared by the chat pipeline and the persona mind. Keeping it
 * in its own module avoids a ChatModule -> MindModule -> ChatModule cycle while
 * still giving both paths the same content-addressed store and vision cache.
 */
@Module({
  imports: [AiModule],
  providers: [ChatMediaService, ImageDescriptionService],
  exports: [ChatMediaService, ImageDescriptionService],
})
export class MediaModule {}
