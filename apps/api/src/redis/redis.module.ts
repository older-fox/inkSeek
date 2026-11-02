import { Module } from '@nestjs/common';
import { RedisProbeService } from './redis-probe.service.js';

@Module({
  providers: [RedisProbeService],
  exports: [RedisProbeService],
})
export class RedisModule {}
