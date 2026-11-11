import { ChangeDetectionStrategy, Component } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { MatListModule } from '@angular/material/list';
import { RouterLink } from '@angular/router';
import { MOBILE_TABS, NAV_ITEMS } from '../core/navigation';

@Component({
  selector: 'app-more-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatListModule, MatIconModule, RouterLink],
  template: `
    <mat-nav-list>
      @for (item of items; track item.path) {
        <a mat-list-item [routerLink]="['/', item.path]">
          <mat-icon matListItemIcon>{{ item.icon }}</mat-icon>
          <span matListItemTitle>{{ item.label }}</span>
        </a>
      }
    </mat-nav-list>
  `,
})
export class MorePage {
  protected readonly items = NAV_ITEMS.filter((item) => !MOBILE_TABS.includes(item.path));
}
