import { BreakpointObserver } from '@angular/cdk/layout';
import type { ComponentType } from '@angular/cdk/portal';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog, type MatDialogConfig } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { Router, RouterLink } from '@angular/router';
import type { ArticleType } from '@moss/contracts';
import { firstValueFrom, map } from 'rxjs';
import { apiErrorMessage } from '../../core/api-error';
import { formatStock, formatUnitCost } from '../../core/format';
import { ArticleTypesApi } from '../article-types/article-types-api';
import { ArticleDialog, type ArticleDialogData } from './article-dialog';
import { ArticlesApi, type ArticleFilters } from './articles-api';
import { AttributeFilterDialog, type AttributeFilter } from './attribute-filter-dialog';

const DIALOG: MatDialogConfig = { width: 'min(560px, calc(100vw - 32px))', maxWidth: '100vw' };

/** Pantalla 4 · Catálogo de artículos (C2). */
@Component({
  selector: 'app-articles-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatButtonModule, MatIconModule, RouterLink],
  templateUrl: './articles-page.html',
  styleUrl: './articles-page.scss',
})
export class ArticlesPage {
  private readonly dialog = inject(MatDialog);
  private readonly router = inject(Router);
  protected readonly formatStock = formatStock;
  protected readonly formatUnitCost = formatUnitCost;
  protected readonly isDesktop = toSignal(
    inject(BreakpointObserver)
      .observe('(min-width: 900px)')
      .pipe(map((state) => state.matches)),
    { initialValue: true },
  );

  protected readonly types = inject(ArticleTypesApi).types;
  protected readonly typeId = signal<string | null>(null);
  protected readonly q = signal('');
  protected readonly inStock = signal(false);
  protected readonly includeInactive = signal(false);
  protected readonly attributeFilters = signal<AttributeFilter[]>([]);
  private readonly filters = computed<ArticleFilters>(() => ({
    typeId: this.typeId(),
    q: this.q(),
    inStock: this.inStock(),
    includeInactive: this.includeInactive(),
    attr: this.attributeFilters().map((filter) => `${filter.key}:${filter.value}`),
  }));
  protected readonly articles = inject(ArticlesApi).list(this.filters);
  protected readonly selectedType = computed(() =>
    this.types.value().find((type) => type.id === this.typeId()),
  );
  protected readonly loadError = computed(() =>
    this.articles.error() ? apiErrorMessage(this.articles.error()) : '',
  );
  protected readonly hasFilters = computed(
    () =>
      this.typeId() !== null || this.q().trim() !== '' || this.inStock() || this.includeInactive(),
  );
  protected readonly summary = computed(() => {
    const rows = this.articles.value();
    const variants = rows.reduce((sum, row) => sum + row.variantCount, 0);
    return `${rows.length} ${rows.length === 1 ? 'artículo' : 'artículos'} · ${variants} ${variants === 1 ? 'variante' : 'variantes'}`;
  });

  protected selectType(id: string | null): void {
    this.typeId.set(id);
    this.attributeFilters.set([]);
  }

  protected async addAttributeFilter(type: ArticleType): Promise<void> {
    const filter = await firstValueFrom(
      this.dialog
        .open<AttributeFilterDialog, ArticleType, AttributeFilter>(AttributeFilterDialog, {
          ...DIALOG,
          data: type,
        })
        .afterClosed(),
    );
    if (!filter) return;
    this.attributeFilters.update((filters) => [
      ...filters.filter((other) => other.key !== filter.key),
      filter,
    ]);
  }

  protected removeAttributeFilter(key: string): void {
    this.attributeFilters.update((filters) => filters.filter((filter) => filter.key !== key));
  }

  protected async newArticle(): Promise<void> {
    const id = await this.open<ArticleDialog, ArticleDialogData, string>(ArticleDialog, {
      mode: 'create',
    });
    if (id) await this.router.navigate(['/catalogo', id]);
  }

  private open<C, D, R>(component: ComponentType<C>, data: D): Promise<R | undefined> {
    return firstValueFrom(this.dialog.open<C, D, R>(component, { ...DIALOG, data }).afterClosed());
  }
}
