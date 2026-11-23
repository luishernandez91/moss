import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { form, FormField, required } from '@angular/forms/signals';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import type { ArticleType } from '@moss/contracts';
import { SizesApi } from '../sizes/sizes-api';
import { ArticleTypesApi } from './article-types-api';
import { apiErrorMessage } from '../../core/api-error';

@Component({
  selector: 'app-enable-size-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormField, MatDialogModule, MatButtonModule, MatFormFieldModule, MatInputModule],
  template: `
    <form (submit)="save($event)">
      <h2 mat-dialog-title>Activar tamaños</h2>
      <mat-dialog-content>
        <p>
          Elige el tamaño inicial para todas las variantes de {{ data.name }}, incluidos los
          registros inactivos.
        </p>
        <p>Se aplica una sola vez. En las altas futuras tendrás que elegir el tamaño.</p>
        <mat-form-field appearance="outline">
          <mat-label>Tamaño inicial</mat-label>
          <select matNativeControl [formField]="sizeForm.initialSizeId">
            <option value="">Elige un tamaño activo</option>
            @for (size of activeSizes(); track size.id) {
              <option [value]="size.id">{{ size.label }}</option>
            }
          </select>
        </mat-form-field>
        @if (sizes.isLoading()) {
          <p>Cargando tamaños…</p>
        } @else if (sizes.error()) {
          <p role="alert">{{ loadError() }}</p>
          <button mat-button type="button" (click)="sizes.reload()">Reintentar</button>
        } @else if (activeSizes().length === 0) {
          <p>No hay tamaños activos. Activa uno en Configuración → Tamaños.</p>
        }
        <p class="hint">No se crean variantes ni cambian SKU, costos o existencias.</p>
        @if (error()) {
          <p class="error" role="alert">{{ error() }}</p>
        }
      </mat-dialog-content>
      <mat-dialog-actions align="end">
        <button mat-button type="button" mat-dialog-close>Cancelar</button>
        <button
          mat-flat-button
          type="submit"
          [disabled]="busy() || sizeForm().invalid() || sizes.isLoading() || !!sizes.error()"
        >
          Activar tamaños
        </button>
      </mat-dialog-actions>
    </form>
  `,
  styles: `
    mat-form-field {
      width: 100%;
      margin-top: 8px;
    }
    .hint {
      font: var(--mat-sys-body-small);
      color: var(--mat-sys-on-surface-variant);
    }
    .error {
      color: var(--mat-sys-error);
    }
  `,
})
export class EnableSizeDialog {
  protected readonly data =
    inject<Pick<ArticleType, 'id' | 'name' | 'articleCount'>>(MAT_DIALOG_DATA);
  private readonly api = inject(ArticleTypesApi);
  private readonly ref = inject<MatDialogRef<EnableSizeDialog, boolean>>(MatDialogRef);
  protected readonly sizes = inject(SizesApi).list();
  protected readonly activeSizes = computed(() => this.sizes.value().filter((s) => s.active));
  protected readonly loadError = computed(() => apiErrorMessage(this.sizes.error()));
  private readonly model = signal({ initialSizeId: '' });
  protected readonly sizeForm = form(this.model, (fields) => required(fields.initialSizeId));
  protected readonly busy = signal(false);
  protected readonly error = signal('');
  protected async save(event: Event): Promise<void> {
    event.preventDefault();
    if (this.busy() || this.sizeForm().invalid() || this.sizes.isLoading() || this.sizes.error())
      return;
    this.busy.set(true);
    this.error.set('');
    try {
      await this.api.enableSize(this.data.id, this.model().initialSizeId);
      this.ref.close(true);
    } catch (error) {
      this.error.set(apiErrorMessage(error));
    } finally {
      this.busy.set(false);
    }
  }
}
