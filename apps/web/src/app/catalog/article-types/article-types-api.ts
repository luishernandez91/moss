import { HttpClient, httpResource } from '@angular/common/http';
import { inject, Service } from '@angular/core';
import type { ArticleType, Attribute, CreateAttribute, UpdateAttribute } from '@moss/contracts';
import { firstValueFrom } from 'rxjs';

const BASE = '/api/article-types';

/** Datos de la pantalla 3: `httpResource` para leer y `HttpClient` para modificar. */
@Service()
export class ArticleTypesApi {
  private readonly http = inject(HttpClient);
  readonly types = httpResource<ArticleType[]>(() => BASE, { defaultValue: [] });

  async createType(name: string): Promise<ArticleType> {
    const created = await firstValueFrom(this.http.post<ArticleType>(BASE, { name }));
    this.types.reload();
    return created;
  }

  async renameType(id: string, name: string): Promise<void> {
    await firstValueFrom(this.http.patch(`${BASE}/${id}`, { name }));
    this.types.reload();
  }

  async deleteType(id: string): Promise<void> {
    await firstValueFrom(this.http.delete(`${BASE}/${id}`));
    this.types.reload();
  }

  async createAttribute(typeId: string, input: CreateAttribute): Promise<Attribute> {
    const created = await firstValueFrom(
      this.http.post<Attribute>(`${BASE}/${typeId}/attributes`, input),
    );
    this.types.reload();
    return created;
  }

  async updateAttribute(typeId: string, id: string, patch: UpdateAttribute): Promise<Attribute> {
    const updated = await firstValueFrom(
      this.http.patch<Attribute>(`${BASE}/${typeId}/attributes/${id}`, patch),
    );
    this.types.reload();
    return updated;
  }

  async deleteAttribute(typeId: string, id: string): Promise<void> {
    await firstValueFrom(this.http.delete(`${BASE}/${typeId}/attributes/${id}`));
    this.types.reload();
  }
}
