import { HttpClient, httpResource } from '@angular/common/http';
import { inject, Service, type Signal } from '@angular/core';
import type {
  ArticleDetail,
  ArticleSummary,
  ArticleVariant,
  CostChange,
  CreateArticle,
  CreateVariant,
  UpdateArticle,
  UpdateVariant,
} from '@moss/contracts';
import { firstValueFrom } from 'rxjs';

const BASE = '/api/articles';

/** Filtros de la pantalla 4, ya en la forma de los parámetros de la API. */
export interface ArticleFilters {
  typeId: string | null;
  q: string;
  inStock: boolean;
  includeInactive: boolean;
  /** `clave:valor`, como los espera `?attr=`. */
  attr: string[];
}

/** Datos de las pantallas 4 y 5: `httpResource` para leer, `HttpClient` para modificar. */
@Service()
export class ArticlesApi {
  private readonly http = inject(HttpClient);

  list(filters: Signal<ArticleFilters>) {
    return httpResource<ArticleSummary[]>(
      () => {
        const { typeId, q, inStock, includeInactive, attr } = filters();
        const params: Record<string, string | string[]> = {};
        if (typeId) params['typeId'] = typeId;
        if (q.trim()) params['q'] = q.trim();
        if (inStock) params['inStock'] = 'true';
        if (includeInactive) params['includeInactive'] = 'true';
        if (typeId && attr.length > 0) params['attr'] = attr;
        return { url: BASE, params };
      },
      { defaultValue: [] },
    );
  }

  detail(id: Signal<string>) {
    return httpResource<ArticleDetail>(() => `${BASE}/${id()}`);
  }

  costHistory(articleId: Signal<string>, variantId: Signal<string | null>) {
    return httpResource<CostChange[]>(
      () => {
        const variant = variantId();
        return variant ? `${BASE}/${articleId()}/variants/${variant}/cost-history` : undefined;
      },
      { defaultValue: [] },
    );
  }

  create(input: CreateArticle): Promise<ArticleDetail> {
    return firstValueFrom(this.http.post<ArticleDetail>(BASE, input));
  }

  update(id: string, patch: UpdateArticle): Promise<ArticleDetail> {
    return firstValueFrom(this.http.patch<ArticleDetail>(`${BASE}/${id}`, patch));
  }

  addVariant(articleId: string, input: CreateVariant): Promise<ArticleVariant> {
    return firstValueFrom(this.http.post<ArticleVariant>(`${BASE}/${articleId}/variants`, input));
  }

  updateVariant(
    articleId: string,
    variantId: string,
    patch: UpdateVariant,
  ): Promise<ArticleVariant> {
    return firstValueFrom(
      this.http.patch<ArticleVariant>(`${BASE}/${articleId}/variants/${variantId}`, patch),
    );
  }
}
