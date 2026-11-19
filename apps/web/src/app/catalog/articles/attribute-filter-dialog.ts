import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import type { ArticleType } from '@moss/contracts';

export interface AttributeFilter {
  key: string;
  value: string;
  /** Texto de la pastilla: «Diámetro: 10 cm». */
  label: string;
}

/** Elige un atributo del tipo y su valor para filtrar la lista (pantalla 4). */
@Component({
  selector: 'app-attribute-filter-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatDialogModule, MatButtonModule, MatFormFieldModule, MatInputModule],
  template: `
    <form (submit)="apply($event)">
      <h2 mat-dialog-title>Filtrar por atributo</h2>
      <mat-dialog-content>
        <mat-form-field appearance="outline">
          <mat-label>Atributo</mat-label>
          <select
            matNativeControl
            aria-label="Atributo"
            [value]="key()"
            (change)="choose($any($event.target).value)"
          >
            <option value="">Elige un atributo</option>
            @for (attribute of attributes(); track attribute.key) {
              <option [value]="attribute.key">{{ attribute.name }}</option>
            }
          </select>
        </mat-form-field>
        @if (selected(); as attribute) {
          @if (attribute.dataType === 'list' || attribute.dataType === 'boolean') {
            <mat-form-field appearance="outline">
              <mat-label>Valor</mat-label>
              <select
                matNativeControl
                aria-label="Valor"
                [value]="value()"
                (change)="value.set($any($event.target).value)"
              >
                <option value="">Elige un valor</option>
                @if (attribute.dataType === 'boolean') {
                  <option value="true">Sí</option>
                  <option value="false">No</option>
                } @else {
                  @for (option of attribute.options; track option) {
                    <option [value]="option">{{ option }}</option>
                  }
                }
              </select>
            </mat-form-field>
          } @else {
            <mat-form-field appearance="outline">
              <mat-label>Valor</mat-label>
              <input
                matInput
                aria-label="Valor"
                [type]="attribute.dataType === 'number' ? 'number' : 'text'"
                [value]="value()"
                (input)="value.set($any($event.target).value)"
              />
              @if (attribute.unit) {
                <span matTextSuffix>{{ attribute.unit }}</span>
              }
            </mat-form-field>
          }
        }
      </mat-dialog-content>
      <mat-dialog-actions align="end">
        <button mat-button type="button" mat-dialog-close>Cancelar</button>
        <button mat-flat-button type="submit" [disabled]="!selected() || value().trim() === ''">
          Aplicar
        </button>
      </mat-dialog-actions>
    </form>
  `,
  styles: `
    mat-dialog-content {
      display: grid;
      padding-top: 8px;
    }
    mat-form-field {
      width: 100%;
    }
  `,
})
export class AttributeFilterDialog {
  private readonly type = inject<ArticleType>(MAT_DIALOG_DATA);
  private readonly ref = inject<MatDialogRef<AttributeFilterDialog, AttributeFilter>>(MatDialogRef);
  protected readonly attributes = computed(() =>
    this.type.attributes.filter((attribute) => attribute.active),
  );
  protected readonly key = signal('');
  protected readonly value = signal('');
  protected readonly selected = computed(() =>
    this.attributes().find((attribute) => attribute.key === this.key()),
  );

  protected choose(key: string): void {
    this.key.set(key);
    this.value.set('');
  }

  protected apply(event: Event): void {
    event.preventDefault();
    const attribute = this.selected();
    const value = this.value().trim();
    if (!attribute || value === '') return;
    const shown =
      attribute.dataType === 'boolean'
        ? value === 'true'
          ? 'sí'
          : 'no'
        : attribute.unit
          ? `${value} ${attribute.unit}`
          : value;
    this.ref.close({ key: attribute.key, value, label: `${attribute.name}: ${shown}` });
  }
}
