import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpException,
  Inject,
  Post,
  Req,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import { loginSchema, type LoginInput, type AuthUser } from '@moss/contracts';
import type { Response } from 'express';
import { ENV } from '../config/config.module.js';
import type { Env } from '../config/env.js';
import type { AuthRequest } from './auth.guard.js';
import { AuthService, publicUser } from './auth.service.js';
import { LoginAttempts } from './login-attempts.js';
import { Public } from './public.js';
import { cookieOptions, issueSession, SESSION_COOKIE, SESSION_SECONDS } from './session.js';

@Controller('auth')
export class AuthController {
  constructor(
    @Inject(AuthService) private readonly auth: AuthService,
    @Inject(LoginAttempts) private readonly attempts: LoginAttempts,
    @Inject(ENV) private readonly env: Env,
  ) {}

  private assertNotBlocked(ip: string, res: Response): void {
    const seconds = this.attempts.retryAfter(ip);
    if (seconds) {
      res.setHeader('Retry-After', seconds);
      throw new HttpException(
        { code: 'LOGIN_BLOCKED', message: 'Demasiados intentos. Intenta de nuevo en 15 minutos.' },
        429,
      );
    }
  }

  @Public()
  @Post('login')
  @HttpCode(200)
  async login(
    @Body({ schema: loginSchema }) input: LoginInput,
    @Req() req: AuthRequest,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthUser> {
    res.setHeader('Cache-Control', 'no-store');
    const ip = req.ip ?? req.socket.remoteAddress ?? 'unknown';
    this.assertNotBlocked(ip, res);
    const account = await this.auth.authenticate(input.email, input.password);
    // Otra solicitud concurrente puede haber completado el quinto fallo durante scrypt.
    this.assertNotBlocked(ip, res);
    if (!account) {
      this.attempts.fail(ip);
      this.assertNotBlocked(ip, res);
      throw new UnauthorizedException({
        code: 'INVALID_CREDENTIALS',
        message: 'Correo o contraseña incorrectos.',
      });
    }
    this.attempts.succeed(ip);
    res.cookie(
      SESSION_COOKIE,
      issueSession(account.userId, account.sessionVersion, this.env.SESSION_SECRET),
      { ...cookieOptions(this.env.NODE_ENV === 'production'), maxAge: SESSION_SECONDS * 1000 },
    );
    return publicUser(account);
  }

  @Get('me')
  me(@Req() req: AuthRequest, @Res({ passthrough: true }) res: Response): AuthUser {
    res.setHeader('Cache-Control', 'no-store');
    return req.authUser!;
  }

  @Public()
  @Post('logout')
  @HttpCode(204)
  logout(@Res({ passthrough: true }) res: Response): void {
    res.setHeader('Cache-Control', 'no-store');
    res.clearCookie(SESSION_COOKIE, cookieOptions(this.env.NODE_ENV === 'production'));
  }
}
