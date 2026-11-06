import { Global, Module } from '@nestjs/common';
import { BilibiliAuthService } from './bilibili-auth.service.js';
import { SystemConfigService } from './system-config.service.js';

@Global()
@Module({
  providers: [SystemConfigService, BilibiliAuthService],
  exports: [SystemConfigService, BilibiliAuthService],
})
export class SystemConfigModule {}
