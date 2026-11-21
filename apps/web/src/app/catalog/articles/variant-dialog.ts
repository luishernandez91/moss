import { SizesApi } from '../sizes/sizes-api';
import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import {
  variantConflictSchema,
  type ArticleDetail,
  type ArticleType,
  type ArticleVariant,
  type VariantConflict,
} from '@moss/contracts';
import { apiErrorMessage } from '../../core/api-error';
import { pesosText } from '../../core/format';
import { ArticlesApi } from './articles-api';
import { readVariantDraft } from './variant-draft';
import { EMPTY_VARIANT, VariantFields, type VariantDraft } from './variant-fields';

export interface VariantDialogData {
  article: ArticleDetail;
  type: ArticleType;
  /** Sin variante, agrega una nueva. */
  variant?: ArticleVariant;
}

/**
 * Agrega o edita una variante. Si el SKU o la combinación ya existen en una variante desactivada,
 * ofrece reactivarla en lugar de crear otra.
 */
@Component({
  selector: 'app-variant-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatDialogModule, MatButtonModule, VariantFields],
  template: `
    <form (submit)="save($event)">
      <h2 mat-dialog-title>{{ data.variant ? 'Editar variante' : 'Agregar variante' }}</h2>
      <mat-dialog-content>
        <app-variant-fields
          [definitions]="data.type.attributes"
          [usesSize]="data.type.usesSize"
          [sizes]="sizes.value()"
          [currentSizeId]="data.variant?.sizeId ?? null"
          [unit]="data.article.stockUnit"
          [(draft)]="draft"
          [errors]="errors()"
          [attributeErrors]="attributeErrors()"
        />
        @if (error()) {
          <p class="error" role="alert">{{ error() }}</p>
        }
      </mat-dialog-content>
      <mat-dialog-actions>
        @if (inactiveConflict(); as conflict) {
          <button mat-button type="button" (click)="reactivate(conflict)">
            Reactivar la existente
          </button>
        }
        <span class="spacer"></span>
        <button mat-button type="button" mat-dialog-close>Cancelar</button>
        <button mat-flat-button type="submit" [disabled]="busy()">Guardar</button>
      </mat-dialog-actions>
    </form>
  `,
  styles: `
    mat-dialog-content {
      padding-top: 8px;
    }
    .error {
      color: var(--mat-sys-error);
      margin: 0;
    }
    .spacer {
      flex: 1;
    }
  `,
})
export class VariantDialog {
  protected readonly data = inject<VariantDialogData>(MAT_DIALOG_DATA);
  protected readonly sizes = inject(SizesApi).list();
  private readonly api = inject(ArticlesApi);
  private readonly ref = inject<MatDialogRef<VariantDialog, boolean>>(MatDialogRef);
  protected readonly draft = signal<VariantDraft>(
    this.data.variant
      ? {
          sizeId: this.data.variant.sizeId,
          sku: this.data.variant.sku,
          attributes: { ...this.data.variant.attributes },
          averageCost: pesosText(this.data.variant.averageCost),
          price: this.data.variant.price === null ? '' : pesosText(this.data.variant.price),
          stock: String(this.data.variant.stock),
        }
      : EMPTY_VARIANT,
  );
  protected readonly errors = signal<Record<string, string>>({});
  protected readonly attributeErrors = signal<Record<string, string>>({});
  protected readonly inactiveConflict = signal<VariantConflict | null>(null);
  protected readonly busy = signal(false);
  protected readonly error = signal('');

  protected async save(event: Event): Promise<void> {
    event.preventDefault();
    if (this.busy()) return;
    const result = readVariantDraft(
      this.data.type.attributes,
      this.draft(),
      this.data.type.usesSize,
    );
    this.errors.set(result.errors ?? {});
    this.attributeErrors.set(result.variant ? {} : result.attributeErrors);
    if (!result.variant) return;
    await this.run(() =>
      this.data.variant
        ? this.api.updateVariant(this.data.article.id, this.data.variant.id, result.variant)
        : this.api.addVariant(this.data.article.id, result.variant),
    );
  }

  protected reactivate(conflict: VariantConflict): Promise<void> {
    return this.run(() =>
      this.api.updateVariant(this.data.article.id, conflict.variantId, { active: true }),
    );
  }

  private async run(action: () => Promise<unknown>): Promise<void> {
    this.busy.set(true);
    this.error.set('');
    this.inactiveConflict.set(null);
    try {
      await action();
      this.ref.close(true);
    } catch (error) {
      this.error.set(apiErrorMessage(error));
      const details =
        error instanceof HttpErrorResponse
          ? (error.error as { details?: unknown })?.details
          : undefined;
      const conflict = variantConflictSchema.safeParse(details);
      if (
        conflict.success &&
        !conflict.data.active &&
        this.belongsToArticle(conflict.data.variantId)
      ) {
        this.inactiveConflict.set(conflict.data);
      }
    } finally {
      this.busy.set(false);
    }
  }

  /** Solo se reactiva una variante de este artículo (un SKU de otro artículo no se toca aquí). */
  private belongsToArticle(variantId: string): boolean {
    return this.data.article.variants.some((variant) => variant.id === variantId);
  }
}
