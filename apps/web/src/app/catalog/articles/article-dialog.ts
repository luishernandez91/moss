import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import {
  stockUnitLabels,
  stockUnitSchema,
  type ArticleDetail,
  type ArticleType,
  type StockUnit,
} from '@moss/contracts';
import { apiErrorMessage } from '../../core/api-error';
import { ArticlesApi } from './articles-api';
import { AttributeFields, validateAttributeValues } from './attribute-fields';
import { readVariantDraft } from './variant-draft';
import { EMPTY_VARIANT, VariantFields, type VariantDraft } from './variant-fields';

export type ArticleDialogData =
  | { mode: 'create'; types: readonly ArticleType[] }
  | { mode: 'edit'; article: ArticleDetail; type: ArticleType };

/** Alta (con la primera variante) o edición de un artículo. Cierra con el ID guardado. */
@Component({
  selector: 'app-article-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    MatDialogModule,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    MatSlideToggleModule,
    AttributeFields,
    VariantFields,
  ],
  template: `
    <form (submit)="save($event)">
      <h2 mat-dialog-title>{{ data.mode === 'create' ? 'Nuevo artículo' : 'Editar artículo' }}</h2>
      <mat-dialog-content>
        @if (data.mode === 'create') {
          <mat-form-field appearance="outline">
            <mat-label>Tipo</mat-label>
            <select
              matNativeControl
              aria-label="Tipo"
              [value]="typeId()"
              (change)="changeType($any($event.target).value)"
            >
              <option value="">Elige un tipo</option>
              @for (type of data.types; track type.id) {
                <option [value]="type.id">{{ type.name }}</option>
              }
            </select>
          </mat-form-field>
        }
        <mat-form-field appearance="outline">
          <mat-label>Nombre</mat-label>
          <input matInput [value]="name()" (input)="name.set($any($event.target).value)" />
        </mat-form-field>
        <mat-form-field appearance="outline">
          <mat-label>Descripción (opcional)</mat-label>
          <input
            matInput
            [value]="description()"
            (input)="description.set($any($event.target).value)"
          />
        </mat-form-field>
        @if (data.mode === 'create') {
          <mat-form-field appearance="outline">
            <mat-label>Unidad de existencia</mat-label>
            <select
              matNativeControl
              aria-label="Unidad de existencia"
              [value]="stockUnit()"
              (change)="stockUnit.set($any($event.target).value)"
            >
              @for (unit of units; track unit) {
                <option [value]="unit">{{ unitLabels[unit] }}</option>
              }
            </select>
            <mat-hint
              >La existencia y el costo de todas las variantes se expresan en esta unidad.</mat-hint
            >
          </mat-form-field>
        }
        <div class="toggles">
          <mat-slide-toggle [checked]="sold()" (change)="sold.set($event.checked)"
            >Se vende</mat-slide-toggle
          >
          <mat-slide-toggle [checked]="usedInRecipes()" (change)="usedInRecipes.set($event.checked)"
            >Se usa en recetas</mat-slide-toggle
          >
        </div>
        @if (type(); as type) {
          <app-attribute-fields
            [definitions]="type.attributes"
            scope="fixed"
            [(values)]="fixedAttributes"
            [errors]="fixedErrors()"
          />
          @if (data.mode === 'create') {
            <h3>Primera variante</h3>
            <app-variant-fields
              [definitions]="type.attributes"
              [unit]="stockUnit()"
              [(draft)]="variant"
              [errors]="variantErrors()"
              [attributeErrors]="variantAttributeErrors()"
            />
          }
        }
        @if (error()) {
          <p class="error" role="alert">{{ error() }}</p>
        }
      </mat-dialog-content>
      <mat-dialog-actions align="end">
        <button mat-button type="button" mat-dialog-close>Cancelar</button>
        <button
          mat-flat-button
          type="submit"
          [disabled]="busy() || !type() || name().trim() === ''"
        >
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
      gap: 12px 24px;
      margin: 4px 0 12px;
    }
    h3 {
      margin: 12px 0 8px;
      font: var(--mat-sys-title-small);
    }
    .error {
      color: var(--mat-sys-error);
      margin: 0;
    }
  `,
})
export class ArticleDialog {
  protected readonly data = inject<ArticleDialogData>(MAT_DIALOG_DATA);
  private readonly api = inject(ArticlesApi);
  private readonly ref = inject<MatDialogRef<ArticleDialog, string>>(MatDialogRef);
  protected readonly units = stockUnitSchema.options;
  protected readonly unitLabels = stockUnitLabels;

  private readonly editing = this.data.mode === 'edit' ? this.data.article : null;
  protected readonly typeId = signal(this.data.mode === 'edit' ? this.data.type.id : '');
  protected readonly type = computed(() =>
    this.data.mode === 'edit'
      ? this.data.type
      : this.data.types.find((type) => type.id === this.typeId()),
  );
  protected readonly name = signal(this.editing?.name ?? '');
  protected readonly description = signal(this.editing?.description ?? '');
  protected readonly stockUnit = signal<StockUnit>(this.editing?.stockUnit ?? 'piece');
  protected readonly sold = signal(this.editing?.sold ?? true);
  protected readonly usedInRecipes = signal(this.editing?.usedInRecipes ?? true);
  protected readonly fixedAttributes = signal<Record<string, unknown>>({
    ...this.editing?.fixedAttributes,
  });
  protected readonly variant = signal<VariantDraft>(EMPTY_VARIANT);
  protected readonly fixedErrors = signal<Record<string, string>>({});
  protected readonly variantErrors = signal<Record<string, string>>({});
  protected readonly variantAttributeErrors = signal<Record<string, string>>({});
  protected readonly busy = signal(false);
  protected readonly error = signal('');

  protected changeType(id: string): void {
    this.typeId.set(id);
    this.fixedAttributes.set({});
    this.variant.set(EMPTY_VARIANT);
  }

  protected async save(event: Event): Promise<void> {
    event.preventDefault();
    const type = this.type();
    if (this.busy() || !type) return;
    const fixed = validateAttributeValues(type.attributes, 'fixed', this.fixedAttributes());
    this.fixedErrors.set(fixed.errors);
    const description = this.description().trim() === '' ? null : this.description();
    const base = {
      name: this.name(),
      description,
      sold: this.sold(),
      usedInRecipes: this.usedInRecipes(),
    };
    let action: () => Promise<{ id: string }>;
    if (this.data.mode === 'create') {
      const variant = readVariantDraft(type.attributes, this.variant());
      this.variantErrors.set(variant.errors ?? {});
      this.variantAttributeErrors.set(variant.variant ? {} : variant.attributeErrors);
      if (!fixed.values || !variant.variant) return;
      const input = {
        ...base,
        articleTypeId: type.id,
        stockUnit: this.stockUnit(),
        fixedAttributes: fixed.values,
        variants: [variant.variant],
      };
      action = () => this.api.create(input);
    } else {
      if (!fixed.values) return;
      const patch = { ...base, fixedAttributes: fixed.values };
      const id = this.editing!.id;
      action = () => this.api.update(id, patch);
    }
    this.busy.set(true);
    this.error.set('');
    try {
      this.ref.close((await action()).id);
    } catch (error) {
      this.error.set(apiErrorMessage(error));
    } finally {
      this.busy.set(false);
    }
  }
}
