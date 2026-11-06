import { Module } from '@nestjs/common';
import { PhoneService } from './phone.service.js';

@Module({
  providers: [PhoneService],
  exports: [PhoneService],
})
export class PhoneModule {}
