import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { AuthController } from './auth.controller.js';
import { AuthGuard } from './auth.guard.js';
import { AuthService } from './auth.service.js';
import { LoginAttempts } from './login-attempts.js';

@Module({
  controllers: [AuthController],
  providers: [
    AuthService,
    { provide: LoginAttempts, useFactory: () => new LoginAttempts() },
    { provide: APP_GUARD, useClass: AuthGuard },
  ],
})
export class AuthModule {}
