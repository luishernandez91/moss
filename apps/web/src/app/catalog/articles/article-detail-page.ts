import { SizesApi } from '../sizes/sizes-api';
import { BreakpointObserver } from '@angular/cdk/layout';
import type { ComponentType } from '@angular/cdk/portal';
import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog, type MatDialogConfig } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatSlideToggleModule, type MatSlideToggleChange } from '@angular/material/slide-toggle';
import { MatSnackBar } from '@angular/material/snack-bar';
import { NgTemplateOutlet } from '@angular/common';
import { RouterLink } from '@angular/router';
import type { ArticleVariant, Attribute, CostChange, UpdateArticle } from '@moss/contracts';
import { firstValueFrom, map } from 'rxjs';
import { apiErrorMessage } from '../../core/api-error';
import { formatDateTime, formatMoney, formatStock, formatUnitCost } from '../../core/format';
import { ArticleTypesApi } from '../article-types/article-types-api';
import { ArticleDialog, type ArticleDialogData } from './article-dialog';
import { ArticlesApi } from './articles-api';
import { VariantDialog, type VariantDialogData } from './variant-dialog';

const DIALOG: MatDialogConfig = { width: 'min(560px, calc(100vw - 32px))', maxWidth: '100vw' };
const REASONS: Record<CostChange['reason'], string> = {
  initial: 'Costo inicial',
  manual: 'Edición manual',
};

/** Pantalla 5 · Detalle de artículo y variantes (C2). */
@Component({
  selector: 'app-article-detail-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    MatButtonModule,
    MatIconModule,
    MatMenuModule,
    MatSlideToggleModule,
    NgTemplateOutlet,
    RouterLink,
  ],
  templateUrl: './article-detail-page.html',
  styleUrl: './article-detail-page.scss',
})
export class ArticleDetailPage {
  readonly id = input.required<string>();
  private readonly api = inject(ArticlesApi);
  private readonly dialog = inject(MatDialog);
  private readonly snackBar = inject(MatSnackBar);
  protected readonly formatMoney = formatMoney;
  protected readonly formatStock = formatStock;
  protected readonly formatUnitCost = formatUnitCost;
  protected readonly formatDateTime = formatDateTime;
  protected readonly reasons = REASONS;
  protected readonly isDesktop = toSignal(
    inject(BreakpointObserver)
      .observe('(min-width: 900px)')
      .pipe(map((state) => state.matches)),
    { initialValue: true },
  );

  protected readonly article = this.api.detail(this.id);
  protected readonly sizes = inject(SizesApi).list();
  protected sizeLabel(id: string | null): string {
    const size = this.sizes.value().find((s) => s.id === id);
    return size ? size.label + (size.active ? '' : ' (desactivado)') : '—';
  }
  private readonly types = inject(ArticleTypesApi).types;
  protected readonly type = computed(() => {
    const article = this.article.value();
    return article
      ? this.types.value().find((type) => type.id === article.articleType.id)
      : undefined;
  });
  protected readonly loadError = computed(() =>
    this.article.error() ? apiErrorMessage(this.article.error()) : '',
  );
  protected readonly showInactive = signal(false);
  protected readonly variantAttributes = computed(() =>
    (this.type()?.attributes ?? []).filter((attribute) => attribute.definesVariant),
  );
  protected readonly visibleVariants = computed(() =>
    (this.article.value()?.variants ?? []).filter(
      (variant) => this.showInactive() || variant.active,
    ),
  );
  private readonly chosenVariantId = signal<string | null>(null);
  protected readonly selectedVariant = computed<ArticleVariant | undefined>(() => {
    const variants = this.visibleVariants();
    return variants.find((variant) => variant.id === this.chosenVariantId()) ?? variants[0];
  });
  protected readonly history = this.api.costHistory(
    this.id,
    computed(() => this.selectedVariant()?.id ?? null),
  );

  /** «Material: concreto · Drenaje: sí», en el orden de los atributos del tipo. */
  protected readonly fixedSummary = computed(() => {
    const article = this.article.value();
    if (!article) return '';
    return (this.type()?.attributes ?? [])
      .filter(
        (attribute) =>
          !attribute.definesVariant && article.fixedAttributes[attribute.key] !== undefined,
      )
      .map(
        (attribute) =>
          `${attribute.name}: ${this.value(attribute, article.fixedAttributes[attribute.key])}`,
      )
      .join(' · ');
  });
  protected readonly stockSummary = computed(() => {
    const article = this.article.value();
    if (!article) return '';
    const active = article.variants.filter((variant) => variant.active);
    const total = active.reduce((sum, variant) => sum + variant.stock, 0);
    const amount =
      article.stockUnit === 'piece'
        ? `${formatStock(total, 'piece')} ${total === 1 ? 'pieza' : 'piezas'}`
        : formatStock(total, article.stockUnit);
    return `${active.length} ${active.length === 1 ? 'variante' : 'variantes'} · ${amount} en existencia`;
  });

  protected value(attribute: Attribute, value: unknown): string {
    if (value === undefined) return '—';
    if (attribute.dataType === 'boolean') return value ? 'sí' : 'no';
    return attribute.unit ? `${String(value)} ${attribute.unit}` : String(value);
  }

  protected select(variant: ArticleVariant): void {
    this.chosenVariantId.set(variant.id);
  }

  protected async editArticle(): Promise<void> {
    const article = this.article.value();
    const type = this.type();
    if (!article || !type) return;
    const saved = await this.open<ArticleDialog, ArticleDialogData, string>(ArticleDialog, {
      mode: 'edit',
      article,
      type,
    });
    if (saved) this.article.reload();
  }

  protected async editVariant(variant?: ArticleVariant): Promise<void> {
    const article = this.article.value();
    const type = this.type();
    if (!article || !type) return;
    const saved = await this.open<VariantDialog, VariantDialogData, boolean>(VariantDialog, {
      article,
      type,
      ...(variant && { variant }),
    });
    if (saved) this.refresh();
  }

  protected setVariantActive(variant: ArticleVariant, active: boolean): Promise<void> {
    return this.run(() => this.api.updateVariant(this.id(), variant.id, { active }));
  }

  protected setArticleActive(active: boolean): Promise<void> {
    return this.run(() => this.api.update(this.id(), { active }));
  }

  /** Si la API rechaza el cambio, el interruptor vuelve a su estado (patrón de C1). */
  protected async toggleFlag(
    flag: 'sold' | 'usedInRecipes',
    change: MatSlideToggleChange,
  ): Promise<void> {
    const patch: UpdateArticle = { [flag]: change.checked };
    try {
      await this.api.update(this.id(), patch);
      this.article.reload();
    } catch (error) {
      change.source.checked = !change.checked;
      this.snackBar.open(apiErrorMessage(error), 'Cerrar', { duration: 6000 });
    }
  }

  private async run(action: () => Promise<unknown>): Promise<void> {
    try {
      await action();
    } catch (error) {
      this.snackBar.open(apiErrorMessage(error), 'Cerrar', { duration: 6000 });
    }
    this.refresh();
  }

  private refresh(): void {
    this.article.reload();
    this.history.reload();
  }

  private open<C, D, R>(component: ComponentType<C>, data: D): Promise<R | undefined> {
    return firstValueFrom(this.dialog.open<C, D, R>(component, { ...DIALOG, data }).afterClosed());
  }
}
