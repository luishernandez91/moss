import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { form, FormField, required, maxLength, min, max } from '@angular/forms/signals';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import type { Partner, UpdatePartners } from '@moss/contracts';
import { campaignStatusLabels } from '@moss/contracts';
import {
  PARTNER_NAME_MAX,
  PartnerError,
  percentageToShareBps,
  validatePartnerSettings,
} from '@moss/domain';
import { apiErrorMessage } from '../core/api-error';
import { PartnersApi } from './partners-api';
import { CampaignsApi } from '../campaigns/campaigns-api';

@Component({
  selector: 'app-partners-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormField, MatDialogModule, MatButtonModule, MatFormFieldModule, MatInputModule],
  template: `
    <form (submit)="save($event)">
      <h2 mat-dialog-title>Editar socios y participación</h2>
      <mat-dialog-content>
        <fieldset [disabled]="busy()">
          <legend>Socio 1</legend>
          <mat-form-field
            ><mat-label>Nombre del socio 1</mat-label
            ><input matInput [formField]="fields.firstName"
          /></mat-form-field>
          <mat-form-field
            ><mat-label>Ganancia %</mat-label
            ><input
              matInput
              type="number"
              step="1"
              aria-label="Ganancia % del socio 1"
              [formField]="fields.firstPercent"
          /></mat-form-field>
        </fieldset>
        <fieldset [disabled]="busy()">
          <legend>Socio 2</legend>
          <mat-form-field
            ><mat-label>Nombre del socio 2</mat-label
            ><input matInput [formField]="fields.secondName"
          /></mat-form-field>
          <mat-form-field
            ><mat-label>Ganancia %</mat-label
            ><input
              matInput
              type="number"
              step="1"
              aria-label="Ganancia % del socio 2"
              [formField]="fields.secondPercent"
          /></mat-form-field>
        </fieldset>
        <p>Reparto de la ganancia. Debe sumar 100%</p>
        <p class="warning">
          El cambio aplicará al cierre de todas las campañas que aún no estén cerradas. Los cierres
          ya registrados no cambian.
        </p>
        <section class="affected" aria-label="Campañas que aún no se cierran">
          @if (affected.hasValue() && affected.value().length === 0) {
            <p>No hay campañas sin cerrar.</p>
          } @else {
            <ul>
              @for (campaign of affected.value(); track campaign.id) {
                <li>{{ campaign.name }} · {{ statusLabels[campaign.status] }}</li>
              }
            </ul>
          }
        </section>
        @if (validation().error) {
          <p class="error" role="alert">{{ validation().error }}</p>
        }
        @if (error()) {
          <p class="error" role="alert">{{ error() }}</p>
        }
        @if (conflict()) {
          <button mat-button type="button" (click)="reload()" [disabled]="busy()">
            Recargar datos actuales
          </button>
        }
        @if (refreshed()) {
          <div role="status">
            <p>Datos actuales. Tu captura se conserva; revísala antes de guardar:</p>
            @for (partner of current(); track partner.id) {
              <p>{{ partner.name }} · {{ partner.shareBps / 100 }}%</p>
            }
          </div>
        }
      </mat-dialog-content>
      <mat-dialog-actions align="end">
        <button mat-button type="button" mat-dialog-close [disabled]="busy()">Cancelar</button>
        <button
          mat-flat-button
          type="submit"
          [disabled]="busy() || fields().invalid() || !!validation().error || conflict()"
        >
          Guardar cambios
        </button>
      </mat-dialog-actions>
    </form>
  `,
  styles: `
    fieldset {
      border: 0;
      padding: 0;
      margin: 12px 0;
      display: grid;
      grid-template-columns: 1fr 150px;
      gap: 12px;
      min-width: 0;
    }
    legend {
      margin-bottom: 12px;
      font-weight: 600;
    }
    mat-form-field {
      width: 100%;
      min-width: 0;
    }
    .warning {
      padding: 12px;
      border-radius: 8px;
      background: var(--mat-sys-surface-container);
    }
    .error {
      color: var(--mat-sys-error);
    }
    @media (max-width: 500px) {
      fieldset {
        grid-template-columns: 1fr;
        gap: 0;
      }
    }
  `,
})
export class PartnersDialog {
  private readonly initial = inject<Partner[]>(MAT_DIALOG_DATA);
  private readonly api = inject(PartnersApi);
  private readonly ref = inject<MatDialogRef<PartnersDialog>>(MatDialogRef);
  /** K1: campañas no cerradas a las que aplicará el cambio, por nombre y estado. */
  protected readonly affected = inject(CampaignsApi).awaitingClose();
  protected readonly statusLabels = campaignStatusLabels;
  protected readonly current = signal(this.initial);
  private readonly model = signal({
    firstName: this.initial[0]!.name,
    secondName: this.initial[1]!.name,
    firstPercent: this.initial[0]!.shareBps / 100,
    secondPercent: this.initial[1]!.shareBps / 100,
  });
  protected readonly fields = form(this.model, (f) => {
    required(f.firstName);
    required(f.secondName);
    maxLength(f.firstName, PARTNER_NAME_MAX);
    maxLength(f.secondName, PARTNER_NAME_MAX);
    required(f.firstPercent);
    required(f.secondPercent);
    min(f.firstPercent, 0);
    max(f.firstPercent, 100);
    min(f.secondPercent, 0);
    max(f.secondPercent, 100);
  });
  protected readonly busy = signal(false);
  protected readonly error = signal('');
  protected readonly conflict = signal(false);
  protected readonly refreshed = signal(false);
  protected readonly validation = computed<{ input?: UpdatePartners; error?: string }>(() => {
    const m = this.model();
    try {
      const partners = [
        {
          ...this.current()[0]!,
          name: m.firstName,
          shareBps: percentageToShareBps(m.firstPercent),
        },
        {
          ...this.current()[1]!,
          name: m.secondName,
          shareBps: percentageToShareBps(m.secondPercent),
        },
      ];
      validatePartnerSettings(partners);
      return { input: { partners } };
    } catch (error) {
      if (error instanceof PartnerError) return { error: error.message };
      throw error;
    }
  });
  protected async save(event: Event): Promise<void> {
    event.preventDefault();
    const input = this.validation().input;
    if (this.busy() || this.conflict() || this.fields().invalid() || !input) return;
    this.busy.set(true);
    this.ref.disableClose = true;
    this.error.set('');
    try {
      await this.api.update(input);
      this.ref.close();
    } catch (error) {
      this.error.set(apiErrorMessage(error));
      this.conflict.set(error instanceof HttpErrorResponse && error.status === 409);
    } finally {
      this.busy.set(false);
      this.ref.disableClose = false;
    }
  }
  protected async reload(): Promise<void> {
    this.busy.set(true);
    this.ref.disableClose = true;
    try {
      const partners = await this.api.read();
      if (partners.length !== 2 || this.initial.some((p) => !partners.some((c) => c.id === p.id))) {
        this.error.set('La lista de socios cambió. Cierra el editor y vuelve a abrirlo.');
        return;
      }
      this.current.set(this.initial.map((p) => partners.find((c) => c.id === p.id)!));
      this.conflict.set(false);
      this.error.set('');
      this.refreshed.set(true);
    } catch (error) {
      this.error.set(apiErrorMessage(error));
    } finally {
      this.busy.set(false);
      this.ref.disableClose = false;
    }
  }
}
