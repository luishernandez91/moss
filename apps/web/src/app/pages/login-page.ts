import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { email, form, FormField, minLength, required } from '@angular/forms/signals';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { Router } from '@angular/router';
import { AuthService } from '../core/auth';

@Component({
  selector: 'app-login-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormField, MatButtonModule, MatFormFieldModule, MatInputModule, MatIconModule],
  template: `
    <main class="login">
      <section class="card" aria-labelledby="login-title">
        <div class="brand"><mat-icon aria-hidden="true">eco</mat-icon> Moss &amp; Roots</div>
        <h1 id="login-title">Iniciar sesión</h1>
        <p>Bienvenido. Ingresa para continuar.</p>
        <form (submit)="login($event)">
          <mat-form-field appearance="outline">
            <mat-label>Correo electrónico</mat-label>
            <input matInput type="email" autocomplete="username" [formField]="loginForm.email" />
          </mat-form-field>
          <mat-form-field appearance="outline">
            <mat-label>Contraseña</mat-label>
            <input
              matInput
              type="password"
              autocomplete="current-password"
              [formField]="loginForm.password"
            />
          </mat-form-field>
          @if (error()) {
            <p class="error" role="alert">{{ error() }}</p>
          }
          <button mat-flat-button type="submit" [disabled]="busy() || loginForm().invalid()">
            {{ busy() ? 'Entrando…' : 'Entrar' }}
          </button>
        </form>
      </section>
    </main>
  `,
  styles: `
    .login {
      min-height: 100dvh;
      display: grid;
      place-items: center;
      padding: 24px;
      box-sizing: border-box;
    }
    .card {
      width: 100%;
      max-width: 380px;
      padding: 32px;
      box-sizing: border-box;
      border: 1px solid var(--mat-sys-outline-variant);
      border-radius: 24px;
      background: var(--mat-sys-surface-container-lowest);
    }
    .brand {
      display: flex;
      align-items: center;
      gap: 8px;
      color: var(--mat-sys-primary);
      font: var(--mat-sys-title-medium);
      margin-bottom: 32px;
    }
    h1 {
      font: var(--mat-sys-headline-medium);
      margin: 0 0 8px;
    }
    p {
      color: var(--mat-sys-on-surface-variant);
      margin: 0 0 24px;
    }
    form {
      display: grid;
    }
    mat-form-field {
      width: 100%;
    }
    button {
      min-height: 48px;
    }
    .error {
      color: var(--mat-sys-error);
      margin: 0 0 16px;
    }
    @media (max-width: 480px) {
      .login {
        padding: 16px;
      }
      .card {
        padding: 24px;
      }
    }
  `,
})
export class LoginPage {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly credentials = signal({ email: '', password: '' });
  protected readonly loginForm = form(this.credentials, (fields) => {
    required(fields.email);
    email(fields.email);
    required(fields.password);
    minLength(fields.password, 6);
  });
  protected readonly busy = signal(false);
  protected readonly error = signal('');

  protected async login(event: Event): Promise<void> {
    event.preventDefault();
    if (this.busy() || this.loginForm().invalid()) return;
    this.busy.set(true);
    this.error.set('');
    try {
      await this.auth.login(this.credentials());
      this.credentials.update((value) => ({ ...value, password: '' }));
      await this.router.navigateByUrl('/inicio');
    } catch (error) {
      this.error.set(
        error instanceof HttpErrorResponse && error.status === 429
          ? 'Demasiados intentos. Intenta de nuevo en 15 minutos.'
          : error instanceof HttpErrorResponse && [400, 401].includes(error.status)
            ? 'Correo o contraseña incorrectos.'
            : 'No se pudo conectar. Intenta de nuevo.',
      );
    } finally {
      this.busy.set(false);
    }
  }
}
