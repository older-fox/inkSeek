import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { resolve } from 'node:path';
import { AuthModule } from './auth/auth.module.js';
import { BootstrapModule } from './bootstrap/bootstrap.module.js';
import { ChatModule } from './chat/chat.module.js';
import { SystemConfigModule } from './config/system-config.module.js';
import { DatabaseModule } from './database/database.module.js';
import { HealthModule } from './health/health.module.js';
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
    BootstrapModule,
    ChatModule,
    SettingsModule,
    HealthModule,
  ],
})
export class AppModule {}
