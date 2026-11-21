import { httpResource } from '@angular/common/http';
import { Service, type Signal } from '@angular/core';
import type { Campaign, CampaignStatus } from '@moss/contracts';

/** Datos de la pantalla 11. Crear y programar existen en la API, pero su interfaz llega con K2. */
@Service()
export class CampaignsApi {
  list(status: Signal<CampaignStatus | null>) {
    return httpResource<Campaign[]>(
      () => {
        const value = status();
        const params: Record<string, string> = value ? { status: value } : {};
        return { url: '/api/campaigns', params };
      },
      { defaultValue: [] },
    );
  }

  /** Las que aún no se cierran: el editor de participación de S1 las lista. */
  awaitingClose() {
    return httpResource<Campaign[]>(
      () => ({ url: '/api/campaigns', params: { awaitingClose: 'true' } }),
      { defaultValue: [] },
    );
  }
}
