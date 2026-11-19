import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { disabled, form, FormField, maxLength, required } from '@angular/forms/signals';
import { MatButtonModule } from '@angular/material/button';
import {
  MAT_DIALOG_DATA,
  MatDialog,
  MatDialogModule,
  MatDialogRef,
} from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import {
  attributeDataTypeLabels,
  type Attribute,
  type AttributeDataType,
  type CreateAttribute,
} from '@moss/contracts';
import {
  applyVariantRule,
  ATTRIBUTE_DATA_TYPES,
  ATTRIBUTE_NAME_MAX,
  ATTRIBUTE_UNIT_MAX,
} from '@moss/domain';
import { firstValueFrom } from 'rxjs';
import { apiErrorMessage } from '../../core/api-error';
import { ConfirmDialog, type ConfirmDialogData } from '../../core/confirm-dialog';
import { ArticleTypesApi } from './article-types-api';

export interface AttributeDialogData {
  typeId: string;
  /** Sin atributo, crea uno nuevo. */
  attribute?: Attribute;
}

/** Crea o edita un atributo. El tipo de dato solo se elige al crear (regla e de C1). */
@Component({
  selector: 'app-attribute-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FormField,
    MatDialogModule,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    MatSlideToggleModule,
  ],
  template: `
    <form (submit)="save($event)">
      <h2 mat-dialog-title>{{ data.attribute ? 'Editar atributo' : 'Nuevo atributo' }}</h2>
      <mat-dialog-content>
        <mat-form-field appearance="outline">
          <mat-label>Nombre</mat-label>
          <input matInput [formField]="attributeForm.name" />
        </mat-form-field>
        <mat-form-field appearance="outline">
          <mat-label>Tipo de dato</mat-label>
          <select matNativeControl [formField]="attributeForm.dataType">
            @for (type of dataTypes; track type) {
              <option [value]="type">{{ labels[type] }}</option>
            }
          </select>
          @if (data.attribute) {
            <mat-hint>No se puede cambiar después de crear el atributo.</mat-hint>
          }
        </mat-form-field>
        @if (model().dataType === 'number') {
          <mat-form-field appearance="outline">
            <mat-label>Unidad</mat-label>
            <input matInput placeholder="cm, L, g" [formField]="attributeForm.unit" />
          </mat-form-field>
        }
        @if (model().dataType === 'list') {
          <mat-form-field appearance="outline">
            <mat-label>Opciones</mat-label>
            <input
              matInput
              placeholder="redonda, cuadrada, hexagonal"
              [formField]="attributeForm.options"
            />
            <mat-hint>Separadas por comas.</mat-hint>
          </mat-form-field>
        }
        <div class="toggles">
          <mat-slide-toggle
            [checked]="isRequired()"
            [disabled]="definesVariant()"
            (change)="isRequired.set($event.checked)"
          >
            Requerido
          </mat-slide-toggle>
          <mat-slide-toggle [checked]="definesVariant()" (change)="setVariant($event.checked)">
            Define variante
          </mat-slide-toggle>
          @if (data.attribute) {
            <mat-slide-toggle [checked]="active()" (change)="active.set($event.checked)">
              Activo
            </mat-slide-toggle>
          }
        </div>
        @if (definesVariant()) {
          <p class="hint">Un atributo que define variante siempre es requerido.</p>
        }
        @if (error()) {
          <p class="error" role="alert">{{ error() }}</p>
        }
      </mat-dialog-content>
      <mat-dialog-actions>
        @if (data.attribute) {
          <button mat-button type="button" class="delete" (click)="remove()">
            Borrar atributo
          </button>
        }
        <span class="spacer"></span>
        <button mat-button type="button" mat-dialog-close>Cancelar</button>
        <button mat-flat-button type="submit" [disabled]="busy() || attributeForm().invalid()">
          Guardar
        </button>
      </mat-dialog-actions>
    </form>
  `,
  styles: `
    mat-dialog-content {
      display: grid;
      gap: 4px;
      padding-top: 8px;
    }
    mat-form-field {
      width: 100%;
    }
    .toggles {
      display: flex;
      flex-wrap: wrap;
      gap: 16px 24px;
      margin: 8px 0;
    }
    .hint {
      margin: 0;
      color: var(--mat-sys-on-surface-variant);
      font: var(--mat-sys-body-small);
    }
    .error {
      color: var(--mat-sys-error);
      margin: 0;
    }
    .spacer {
      flex: 1;
    }
    .delete {
      color: var(--mat-sys-error);
    }
  `,
})
export class AttributeDialog {
  protected readonly data = inject<AttributeDialogData>(MAT_DIALOG_DATA);
  private readonly api = inject(ArticleTypesApi);
  private readonly dialog = inject(MatDialog);
  private readonly ref = inject<MatDialogRef<AttributeDialog, boolean>>(MatDialogRef);
  protected readonly dataTypes = ATTRIBUTE_DATA_TYPES;
  protected readonly labels = attributeDataTypeLabels;

  protected readonly model = signal({
    name: this.data.attribute?.name ?? '',
    dataType: (this.data.attribute?.dataType ?? 'text') as AttributeDataType,
    unit: this.data.attribute?.unit ?? '',
    options: this.data.attribute?.options?.join(', ') ?? '',
  });
  protected readonly attributeForm = form(this.model, (fields) => {
    required(fields.name);
    maxLength(fields.name, ATTRIBUTE_NAME_MAX);
    maxLength(fields.unit, ATTRIBUTE_UNIT_MAX);
    required(fields.options, { when: ({ valueOf }) => valueOf(fields.dataType) === 'list' });
    disabled(fields.dataType, { when: () => this.data.attribute !== undefined });
  });
  protected readonly isRequired = signal(this.data.attribute?.required ?? false);
  protected readonly definesVariant = signal(this.data.attribute?.definesVariant ?? false);
  protected readonly active = signal(this.data.attribute?.active ?? true);
  protected readonly busy = signal(false);
  protected readonly error = signal('');
  private readonly options = computed(() =>
    this.model()
      .options.split(',')
      .map((option) => option.trim())
      .filter((option) => option !== ''),
  );

  protected setVariant(checked: boolean): void {
    const flags = applyVariantRule({ required: this.isRequired(), definesVariant: checked });
    this.definesVariant.set(flags.definesVariant);
    this.isRequired.set(flags.required);
  }

  protected async save(event: Event): Promise<void> {
    event.preventDefault();
    if (this.busy() || this.attributeForm().invalid()) return;
    this.busy.set(true);
    this.error.set('');
    try {
      const { attribute, typeId } = this.data;
      const { name, dataType, unit } = this.model();
      const flags = { required: this.isRequired(), definesVariant: this.definesVariant() };
      if (attribute) {
        await this.api.updateAttribute(typeId, attribute.id, {
          name,
          ...flags,
          active: this.active(),
          ...(dataType === 'number' && { unit: unit.trim() === '' ? null : unit }),
          ...(dataType === 'list' && { options: this.options() }),
        });
      } else {
        await this.api.createAttribute(typeId, this.createPayload(name, dataType, unit, flags));
      }
      this.ref.close(true);
    } catch (error) {
      this.error.set(apiErrorMessage(error));
    } finally {
      this.busy.set(false);
    }
  }

  protected async remove(): Promise<void> {
    const attribute = this.data.attribute!;
    const confirmed = await firstValueFrom(
      this.dialog
        .open<ConfirmDialog, ConfirmDialogData, boolean>(ConfirmDialog, {
          data: {
            title: 'Borrar atributo',
            message: `Se borrará «${attribute.name}». Si solo quieres dejar de usarlo, desactívalo.`,
            confirm: 'Borrar',
          },
        })
        .afterClosed(),
    );
    if (!confirmed) return;
    try {
      await this.api.deleteAttribute(this.data.typeId, attribute.id);
      this.ref.close(true);
    } catch (error) {
      this.error.set(apiErrorMessage(error));
    }
  }

  private createPayload(
    name: string,
    dataType: AttributeDataType,
    unit: string,
    flags: { required: boolean; definesVariant: boolean },
  ): CreateAttribute {
    switch (dataType) {
      case 'number':
        return { name, dataType, unit: unit.trim() === '' ? null : unit, ...flags };
      case 'list':
        return { name, dataType, options: this.options(), ...flags };
      default:
        return { name, dataType, ...flags };
    }
  }
}
