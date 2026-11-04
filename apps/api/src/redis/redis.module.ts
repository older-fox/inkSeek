import { Module } from '@nestjs/common';
import { RedisCacheService } from './redis-cache.service.js';
import { RedisProbeService } from './redis-probe.service.js';

@Module({
  providers: [RedisProbeService, RedisCacheService],
  exports: [RedisProbeService, RedisCacheService],
})
export class RedisModule {}
