import { httpResource } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed } from '@angular/core';
import type { HealthResponse } from '@moss/contracts';
import { formatDate } from '../core/format';

@Component({
  selector: 'app-dashboard-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="dashboard">
      <h1>Dashboard</h1>
      <p class="today">Hoy es {{ today }}</p>
      <p class="status" [class.ok]="apiOk()" data-testid="api-status">{{ apiStatus() }}</p>
      <p class="hint">Los indicadores llegan en la historia <strong>S3</strong> del backlog.</p>
    </section>
  `,
  styles: `
    .dashboard {
      padding: 24px;
      display: grid;
      gap: 8px;
      max-width: 640px;
    }
    h1 {
      font: var(--mat-sys-headline-small);
      margin: 0;
    }
    .today,
    .hint {
      color: var(--mat-sys-on-surface-variant);
      margin: 0;
    }
    .status {
      margin: 8px 0;
      padding: 8px 12px;
      border-radius: 8px;
      background: var(--mat-sys-error-container);
      color: var(--mat-sys-on-error-container);
      width: fit-content;
    }
    .status.ok {
      background: var(--mat-sys-primary-container);
      color: var(--mat-sys-on-primary-container);
    }
  `,
})
export class DashboardPage {
  protected readonly today = formatDate(
    new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Mexico_City' }).format(new Date()),
  );

  private readonly health = httpResource<HealthResponse>(() => '/api/health');

  protected readonly apiOk = computed(() => this.health.value()?.status === 'ok');

  protected readonly apiStatus = computed(() => {
    if (this.health.isLoading()) {
      return 'Revisando conexión con la API…';
    }
    const value = this.health.value();
    if (!value) {
      return 'API sin conexión. Corre pnpm dev en la raíz del repositorio.';
    }
    return value.database === 'up'
      ? 'API y base de datos conectadas'
      : 'API conectada, base de datos sin conexión';
  });
}
