import {
  HttpClient,
  HttpErrorResponse,
  httpResource,
  type HttpInterceptorFn,
} from '@angular/common/http';
import { effect, inject, Injector, Service } from '@angular/core';
import { Router, type CanActivateFn } from '@angular/router';
import type { AuthUser, LoginInput } from '@moss/contracts';
import { catchError, firstValueFrom, throwError } from 'rxjs';

@Service()
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly injector = inject(Injector);
  private readonly session = httpResource<AuthUser>(() => '/api/auth/me');

  /** Vuelve a comprobar vencimiento y versión al navegar; no confía en una copia local. */
  checkSession(): Promise<boolean> {
    this.session.reload();
    return new Promise((resolve) => {
      const watcher = effect(
        () => {
          if (this.session.isLoading()) return;
          const authenticated = this.session.hasValue();
          watcher.destroy();
          resolve(authenticated);
        },
        { injector: this.injector },
      );
    });
  }

  async login(input: LoginInput): Promise<void> {
    const user = await firstValueFrom(this.http.post<AuthUser>('/api/auth/login', input));
    this.session.set(user);
  }

  async logout(): Promise<void> {
    await firstValueFrom(this.http.post<void>('/api/auth/logout', null));
    this.session.set(undefined);
  }
}

export const authGuard: CanActivateFn = async () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  return (await auth.checkSession()) || router.parseUrl('/login');
};

export const sessionExpiredInterceptor: HttpInterceptorFn = (req, next) => {
  const router = inject(Router);
  return next(req).pipe(
    catchError((error: unknown) => {
      if (
        error instanceof HttpErrorResponse &&
        error.status === 401 &&
        req.url.startsWith('/api/') &&
        !req.url.startsWith('/api/auth/')
      ) {
        void router.navigateByUrl('/login');
      }
      return throwError(() => error);
    }),
  );
};
