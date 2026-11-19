import {
  Inject,
  Injectable,
  UnauthorizedException,
  UnsupportedMediaTypeException,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import type { AuthUser } from '@moss/contracts';
import { ENV } from '../config/config.module.js';
import type { Env } from '../config/env.js';
import { AuthService } from './auth.service.js';
import { PUBLIC_ROUTE } from './public.js';
import { readSessionCookie, verifySession } from './session.js';

export interface AuthRequest extends Request {
  authUser?: AuthUser;
}

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    @Inject(Reflector) private readonly reflector: Reflector,
    @Inject(AuthService) private readonly auth: AuthService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<AuthRequest>();
    const hasBody =
      Number(req.headers['content-length'] ?? 0) > 0 ||
      req.headers['transfer-encoding'] !== undefined;
    if (
      ['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method) &&
      hasBody &&
      !req.is('application/json')
    ) {
      throw new UnsupportedMediaTypeException({
        code: 'JSON_REQUIRED',
        message: 'Envía el cuerpo como application/json.',
      });
    }
    if (
      this.reflector.getAllAndOverride<boolean>(PUBLIC_ROUTE, [
        context.getHandler(),
        context.getClass(),
      ])
    )
      return true;
    const cookie = readSessionCookie(req.headers.cookie);
    const session = cookie ? verifySession(cookie, this.env.SESSION_SECRET) : null;
    if (!session) throw new UnauthorizedException();
    req.authUser = await this.auth.fromSession(session.userId, session.sessionVersion);
    return true;
  }
}
