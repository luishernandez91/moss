import { HttpClient, httpResource } from '@angular/common/http';
import { inject, Service } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import type { CreateSize, Size, UpdateSize } from '@moss/contracts';
@Service()
export class SizesApi {
  private readonly http = inject(HttpClient);
  list(purpose: 'manage' | 'filter' = 'manage') {
    return httpResource<Size[]>(
      () => (purpose === 'manage' ? '/api/sizes' : '/api/sizes?purpose=filter'),
      { defaultValue: [] },
    );
  }
  create(body: CreateSize) {
    return firstValueFrom(this.http.post<Size>('/api/sizes', body));
  }
  update(id: string, body: UpdateSize) {
    return firstValueFrom(this.http.patch<Size>(`/api/sizes/${id}`, body));
  }
  remove(id: string) {
    return firstValueFrom(this.http.delete(`/api/sizes/${id}`));
  }
  order(ids: string[]) {
    return firstValueFrom(this.http.put<Size[]>('/api/sizes/order', { ids }));
  }
}
