import { HttpClient, httpResource } from '@angular/common/http';
import { inject, Service } from '@angular/core';
import type { Partner, UpdatePartners } from '@moss/contracts';
import { firstValueFrom } from 'rxjs';
@Service()
export class PartnersApi {
  private readonly http = inject(HttpClient);
  readonly partners = httpResource<Partner[]>(() => '/api/partners');
  async update(input: UpdatePartners): Promise<void> {
    await firstValueFrom(this.http.put<Partner[]>('/api/partners', input));
    this.partners.reload();
  }
  read(): Promise<Partner[]> {
    return firstValueFrom(this.http.get<Partner[]>('/api/partners'));
  }
}
