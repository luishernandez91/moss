import { BreakpointObserver } from '@angular/cdk/layout';
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { MatIconModule } from '@angular/material/icon';
import { MatListModule } from '@angular/material/list';
import { MatSidenavModule } from '@angular/material/sidenav';
import { MatToolbarModule } from '@angular/material/toolbar';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { AuthService } from '../auth';
import { map } from 'rxjs';
import { MOBILE_TABS, NAV_ITEMS } from '../navigation';

@Component({
  selector: 'app-shell',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterOutlet,
    RouterLink,
    RouterLinkActive,
    MatSidenavModule,
    MatToolbarModule,
    MatListModule,
    MatIconModule,
    MatButtonModule,
  ],
  templateUrl: './shell.html',
  styleUrl: './shell.scss',
})
export class Shell {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  protected readonly leaving = signal(false);
  protected readonly logoutError = signal('');

  protected async logout(): Promise<void> {
    if (this.leaving()) return;
    this.leaving.set(true);
    this.logoutError.set('');
    try {
      await this.auth.logout();
      await this.router.navigateByUrl('/login');
    } catch {
      this.logoutError.set('No se pudo cerrar sesión. Intenta de nuevo.');
    } finally {
      this.leaving.set(false);
    }
  }

  protected readonly navItems = NAV_ITEMS;
  protected readonly mobileTabs = [
    ...NAV_ITEMS.filter((item) => MOBILE_TABS.includes(item.path)),
    { path: 'mas', label: 'Más', icon: 'menu', story: '' },
  ];

  protected readonly isDesktop = toSignal(
    inject(BreakpointObserver)
      .observe('(min-width: 900px)')
      .pipe(map((state) => state.matches)),
    { initialValue: true },
  );
}
