import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { form, FormField, maxLength, required } from '@angular/forms/signals';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { ARTICLE_TYPE_NAME_MAX } from '@moss/domain';
import { apiErrorMessage } from '../../core/api-error';
import { ArticleTypesApi } from './article-types-api';

export interface TypeDialogData {
  /** Sin tipo, crea uno nuevo. */
  type?: { id: string; name: string; usesSize: boolean; articleCount: number };
}

/** Crea o renombra un tipo. Cierra con el ID del tipo guardado. */
@Component({
  selector: 'app-type-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    MatSlideToggleModule,
    FormField,
    MatDialogModule,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
  ],
  template: `
    <form (submit)="save($event)">
      <h2 mat-dialog-title>{{ data.type ? 'Editar tipo' : 'Nuevo tipo' }}</h2>
      <mat-dialog-content>
        <mat-form-field appearance="outline">
          <mat-label>Nombre</mat-label>
          <input matInput [formField]="typeForm.name" />
        </mat-form-field>
        <mat-slide-toggle
          [checked]="usesSize()"
          [disabled]="(data.type?.articleCount ?? 0) > 0"
          (change)="usesSize.set($event.checked)"
          >Usa tamaño</mat-slide-toggle
        >
        @if ((data.type?.articleCount ?? 0) > 0) {
          @if (data.type?.usesSize) {
            <p>Este tipo ya tiene artículos; no se puede desactivar «Usa tamaño».</p>
          } @else {
            <p>
              Para asignar un tamaño a las variantes existentes, usa «Activar tamaños» en las
              acciones del tipo.
            </p>
          }
        }
        @if (error()) {
          <p class="error" role="alert">{{ error() }}</p>
        }
      </mat-dialog-content>
      <mat-dialog-actions align="end">
        <button mat-button type="button" mat-dialog-close>Cancelar</button>
        <button mat-flat-button type="submit" [disabled]="busy() || typeForm().invalid()">
          Guardar
        </button>
      </mat-dialog-actions>
    </form>
  `,
  styles: `
    mat-form-field {
      width: 100%;
      margin-top: 8px;
    }
    .error {
      color: var(--mat-sys-error);
      margin: 0;
    }
  `,
})
export class TypeDialog {
  protected readonly data = inject<TypeDialogData>(MAT_DIALOG_DATA);
  private readonly api = inject(ArticleTypesApi);
  private readonly ref = inject<MatDialogRef<TypeDialog, string>>(MatDialogRef);
  private readonly model = signal({ name: this.data.type?.name ?? '' });
  protected readonly typeForm = form(this.model, (fields) => {
    required(fields.name);
    maxLength(fields.name, ARTICLE_TYPE_NAME_MAX);
  });
  protected readonly usesSize = signal(this.data.type?.usesSize ?? false);
  protected readonly busy = signal(false);
  protected readonly error = signal('');

  protected async save(event: Event): Promise<void> {
    event.preventDefault();
    if (this.busy() || this.typeForm().invalid()) return;
    this.busy.set(true);
    this.error.set('');
    try {
      const { name } = this.model();
      if (this.data.type) {
        await this.api.renameType(this.data.type.id, name, this.usesSize());
        this.ref.close(this.data.type.id);
      } else {
        this.ref.close((await this.api.createType(name, this.usesSize())).id);
      }
    } catch (error) {
      this.error.set(apiErrorMessage(error));
    } finally {
      this.busy.set(false);
    }
  }
}
