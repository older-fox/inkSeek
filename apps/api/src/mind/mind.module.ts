import { Module } from '@nestjs/common';
import { AiModule } from '../ai/ai.module.js';
import { AuthModule } from '../auth/auth.module.js';
import { MediaModule } from '../chat/media.module.js';
import { PhoneModule } from '../phone/phone.module.js';
import { RedisModule } from '../redis/redis.module.js';
import { MindActionExecutor } from './mind-action-executor.service.js';
import { MindBrowserService } from './mind-browser.service.js';
import { MindClosureService } from './mind-closure.service.js';
import { MindController } from './mind.controller.js';
import { MindDriftService } from './mind-drift.service.js';
import { MindFocusService } from './mind-focus.service.js';
import { MindHeartbeatLogService } from './mind-heartbeat-log.service.js';
import { MindHeartbeatService } from './mind-heartbeat.service.js';
import { MindLearningService } from './mind-learning.service.js';
import { MindLoopService } from './mind-loop.service.js';
import { MindPhoneFocusService } from './mind-phone-focus.service.js';
import { MindPlannerService } from './mind-planner.service.js';
import { MindReplyLockService } from './mind-reply-lock.service.js';
import { MindRuntimeService } from './mind-runtime.service.js';
import { MindSceneService } from './mind-scene.service.js';
import { MindService } from './mind.service.js';
import { MindSettingsService } from './mind-settings.service.js';
import { MindSituationService } from './mind-situation.service.js';
import { MindSocialService } from './mind-social.service.js';
import { MindToolsService } from './mind-tools.service.js';
import { PersonaGroupStanceService } from './persona-group-stance.service.js';
import { PersonaLongEventService } from './persona-long-event.service.js';
import { PersonaMemoryService } from './persona-memory.service.js';
import { PersonaRelationshipService } from './persona-relationship.service.js';
import { PersonaStateService } from './persona-state.service.js';
import { PersonaStyleNoteService } from './persona-style-note.service.js';
import { StickerService } from './sticker.service.js';
import { VideoInsightService } from './video-insight.service.js';
import { WebSearchService } from './web-search.service.js';

@Module({
  imports: [AuthModule, AiModule, RedisModule, MediaModule, PhoneModule],
  controllers: [MindController],
  providers: [
    MindSettingsService,
    PersonaStateService,
    PersonaRelationshipService,
    PersonaGroupStanceService,
    PersonaLongEventService,
    PersonaMemoryService,
    PersonaStyleNoteService,
    MindLearningService,
    MindFocusService,
    MindSituationService,
    MindSceneService,
    MindSocialService,
    MindToolsService,
    MindDriftService,
    MindPlannerService,
    MindReplyLockService,
    MindClosureService,
    MindHeartbeatLogService,
    MindPhoneFocusService,
    MindLoopService,
    StickerService,
    VideoInsightService,
    WebSearchService,
    MindBrowserService,
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
    PersonaStyleNoteService,
    MindLearningService,
    MindRuntimeService,
    MindService,
    MindActionExecutor,
    MindFocusService,
    MindSituationService,
    MindPhoneFocusService,
    MindLoopService,
    StickerService,
    MindBrowserService,
  ],
})
export class MindModule {}
