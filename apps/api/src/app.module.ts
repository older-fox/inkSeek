import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { resolve } from 'node:path';
import { AiModule } from './ai/ai.module.js';
import { AuthModule } from './auth/auth.module.js';
import { BootstrapModule } from './bootstrap/bootstrap.module.js';
import { ChatModule } from './chat/chat.module.js';
import { SystemConfigModule } from './config/system-config.module.js';
import { DatabaseModule } from './database/database.module.js';
import { HealthModule } from './health/health.module.js';
import { MindModule } from './mind/mind.module.js';
import { PersonasModule } from './personas/personas.module.js';
import { SettingsModule } from './settings/settings.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: [resolve(process.cwd(), '../../.env'), resolve(process.cwd(), '.env')],
    }),
    DatabaseModule,
    SystemConfigModule,
    AuthModule,
    AiModule,
    BootstrapModule,
    MindModule,
    ChatModule,
    PersonasModule,
    SettingsModule,
    HealthModule,
  ],
})
export class AppModule {}
