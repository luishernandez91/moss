import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { form, FormField, required, maxLength } from '@angular/forms/signals';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import type { Size } from '@moss/contracts';
import { SizesApi } from './sizes-api';
import { apiErrorMessage } from '../../core/api-error';
@Component({
  selector: 'app-size-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormField, MatDialogModule, MatButtonModule, MatFormFieldModule, MatInputModule],
  template: `<form (submit)="save($event)">
    <h2 mat-dialog-title>{{ data ? 'Editar tamaño' : 'Nuevo tamaño' }}</h2>
    <mat-dialog-content>
      <mat-form-field appearance="outline"
        ><mat-label>Nombre</mat-label><input matInput [formField]="fields.label"
      /></mat-form-field>
      @if (!data) {
        <mat-form-field appearance="outline"
          ><mat-label>Clave en inglés</mat-label
          ><input matInput [formField]="fields.key" /><mat-hint
            >No cambia después de crear el tamaño.</mat-hint
          ></mat-form-field
        >
      }
      @if (error()) {
        <p role="alert" class="error">{{ error() }}</p>
      }
    </mat-dialog-content>
    <mat-dialog-actions align="end"
      ><button mat-button type="button" mat-dialog-close>Cancelar</button
      ><button mat-flat-button type="submit" [disabled]="busy() || fields().invalid()">
        Guardar
      </button></mat-dialog-actions
    >
  </form>`,
  styles: `
    mat-dialog-content {
      display: grid;
      gap: 12px;
      padding-top: 8px;
    }
    .error {
      color: var(--mat-sys-error);
    }
  `,
})
export class SizeDialog {
  protected readonly data = inject<Size | null>(MAT_DIALOG_DATA);
  private readonly api = inject(SizesApi);
  private readonly ref = inject(MatDialogRef<SizeDialog, boolean>);
  private readonly model = signal({ key: this.data?.key ?? '', label: this.data?.label ?? '' });
  protected readonly fields = form(this.model, (p) => {
    required(p.key);
    maxLength(p.key, 40);
    required(p.label);
    maxLength(p.label, 80);
  });
  protected readonly busy = signal(false);
  protected readonly error = signal('');
  protected async save(event: Event) {
    event.preventDefault();
    if (this.busy() || this.fields().invalid()) return;
    this.busy.set(true);
    this.error.set('');
    try {
      if (this.data) await this.api.update(this.data.id, { label: this.model().label });
      else await this.api.create({ ...this.model(), active: true });
      this.ref.close(true);
    } catch (e) {
      this.error.set(apiErrorMessage(e));
    } finally {
      this.busy.set(false);
    }
  }
}
