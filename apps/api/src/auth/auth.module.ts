import { Module } from '@nestjs/common';
import { PasswordService } from '../common/crypto/password.service.js';
import { AuthController } from './auth.controller.js';
import { AuthGuard } from './auth.guard.js';
import { AuthService } from './auth.service.js';
import { SessionService } from './session.service.js';

@Module({
  controllers: [AuthController],
  providers: [AuthService, AuthGuard, PasswordService, SessionService],
  exports: [AuthService, PasswordService, SessionService],
})
export class AuthModule {}
