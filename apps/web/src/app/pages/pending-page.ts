import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/** Pantalla provisional hasta que se implemente su historia del backlog. */
@Component({
  selector: 'app-pending-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="pending">
      <h1>{{ title() }}</h1>
      <p>
        Esta pantalla se construye en la historia <strong>{{ story() }}</strong> del backlog.
      </p>
    </section>
  `,
  styles: `
    .pending {
      padding: 24px;
      max-width: 640px;
    }
    h1 {
      font: var(--mat-sys-headline-small);
      margin: 0 0 8px;
    }
    p {
      color: var(--mat-sys-on-surface-variant);
    }
  `,
})
export class PendingPage {
  readonly title = input.required<string>();
  readonly story = input.required<string>();
}
