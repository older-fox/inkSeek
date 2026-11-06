import { Module } from '@nestjs/common';
import { AiModule } from '../ai/ai.module.js';
import { AuthModule } from '../auth/auth.module.js';
import { MediaModule } from '../chat/media.module.js';
import { RedisModule } from '../redis/redis.module.js';
import { MindActionExecutor } from './mind-action-executor.service.js';
import { MindController } from './mind.controller.js';
import { MindDriftService } from './mind-drift.service.js';
import { MindHeartbeatLogService } from './mind-heartbeat-log.service.js';
import { MindHeartbeatService } from './mind-heartbeat.service.js';
import { MindPlannerService } from './mind-planner.service.js';
import { MindReplyLockService } from './mind-reply-lock.service.js';
import { MindRuntimeService } from './mind-runtime.service.js';
import { MindSceneService } from './mind-scene.service.js';
import { MindService } from './mind.service.js';
import { MindSettingsService } from './mind-settings.service.js';
import { MindSocialService } from './mind-social.service.js';
import { MindToolsService } from './mind-tools.service.js';
import { PersonaGroupStanceService } from './persona-group-stance.service.js';
import { PersonaLongEventService } from './persona-long-event.service.js';
import { PersonaMemoryService } from './persona-memory.service.js';
import { PersonaRelationshipService } from './persona-relationship.service.js';
import { PersonaStateService } from './persona-state.service.js';
import { StickerService } from './sticker.service.js';
import { WebSearchService } from './web-search.service.js';

@Module({
  imports: [AuthModule, AiModule, RedisModule, MediaModule],
  controllers: [MindController],
  providers: [
    MindSettingsService,
    PersonaStateService,
    PersonaRelationshipService,
    PersonaGroupStanceService,
    PersonaLongEventService,
    PersonaMemoryService,
    MindSceneService,
    MindSocialService,
    MindToolsService,
    MindDriftService,
    MindPlannerService,
    MindReplyLockService,
    MindHeartbeatLogService,
    StickerService,
    WebSearchService,
    MindActionExecutor,
    MindRuntimeService,
    MindHeartbeatService,
    MindService,
  ],
  exports: [
    MindSettingsService,
    PersonaStateService,
    PersonaRelationshipService,
    PersonaGroupStanceService,
    PersonaLongEventService,
    PersonaMemoryService,
    MindRuntimeService,
    MindService,
    MindActionExecutor,
    StickerService,
  ],
})
export class MindModule {}
