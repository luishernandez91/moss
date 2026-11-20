import { BreakpointObserver } from '@angular/cdk/layout';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { campaignStatusLabels, campaignStatusSchema, type CampaignStatus } from '@moss/contracts';
import { map } from 'rxjs';
import { apiErrorMessage } from '../core/api-error';
import { formatDateRange, formatMoney } from '../core/format';
import { CampaignsApi } from './campaigns-api';
import {
  barPlacement,
  monthGroups,
  timelineCampaigns,
  timelineMonths,
  timelineRows,
} from './campaign-timeline';

/**
 * Pantalla 11 · Campañas (K1): lista con filtro por estado y línea de tiempo. Sin «Nueva campaña» ni
 * menú de acciones: crear, editar, programar, cancelar y clonar llegan con K2. Gastado, vendido y
 * resultado se muestran como «—» hasta K4 y K6.
 */
@Component({
  selector: 'app-campaigns-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './campaigns-page.html',
  styleUrl: './campaigns-page.scss',
})
export class CampaignsPage {
  protected readonly labels = campaignStatusLabels;
  protected readonly statuses = campaignStatusSchema.options;
  protected readonly formatMoney = formatMoney;
  protected readonly formatDateRange = formatDateRange;
  protected readonly isDesktop = toSignal(
    inject(BreakpointObserver)
      .observe('(min-width: 900px)')
      .pipe(map((state) => state.matches)),
    { initialValue: true },
  );

  protected readonly status = signal<CampaignStatus | null>(null);
  protected readonly view = signal<'list' | 'timeline'>('list');
  protected readonly campaigns = inject(CampaignsApi).list(this.status);
  protected readonly loadError = computed(() =>
    this.campaigns.error() ? apiErrorMessage(this.campaigns.error()) : '',
  );

  protected readonly shown = computed(() => timelineCampaigns(this.campaigns.value()));
  protected readonly months = computed(() => timelineMonths(this.shown()));
  protected readonly rows = computed(() => timelineRows(this.shown()));
  protected readonly groups = computed(() => monthGroups(this.shown(), this.months()));

  protected bar(campaign: Parameters<typeof barPlacement>[0]): { left: string; width: string } {
    const { left, width } = barPlacement(campaign, this.months());
    return { left: `${left}%`, width: `${width}%` };
  }
}
