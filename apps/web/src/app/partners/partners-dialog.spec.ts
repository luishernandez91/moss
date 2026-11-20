import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import type { Campaign, Partner } from '@moss/contracts';
import { PartnersDialog } from './partners-dialog';

const pair: Partner[] = [
  { id: '00000000-0000-4000-8000-000000000001', name: 'Ana', shareBps: 5000, version: 0 },
  { id: '00000000-0000-4000-8000-000000000002', name: 'Bruno', shareBps: 5000, version: 0 },
];
const temporada = {
  id: '00000000-0000-4000-8000-000000000011',
  name: 'Temporada',
  allowsOverlap: false,
};
const pending: Campaign[] = [
  {
    id: '00000000-0000-4000-8000-000000000a01',
    name: 'Nochebuena 2026',
    type: temporada,
    status: 'active',
    budget: 0,
    startDate: '2026-11-01',
    endDate: '2026-12-24',
    reinvestmentPercent: 0,
    notes: null,
  },
  {
    id: '00000000-0000-4000-8000-000000000a02',
    name: 'Reyes 2027',
    type: temporada,
    status: 'scheduled',
    budget: 0,
    startDate: '2027-01-02',
    endDate: '2027-01-06',
    reinvestmentPercent: 0,
    notes: null,
  },
];

function setup() {
  TestBed.configureTestingModule({
    imports: [PartnersDialog],
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      { provide: MAT_DIALOG_DATA, useValue: pair },
      { provide: MatDialogRef, useValue: { close: () => undefined } },
    ],
  });
  const fixture = TestBed.createComponent(PartnersDialog);
  TestBed.tick();
  const http = TestBed.inject(HttpTestingController);
  // PartnersApi carga los socios al crearse; el diálogo trabaja con los que recibe.
  http.match('/api/partners').forEach((request) => request.flush(pair));
  return { fixture, http, element: fixture.nativeElement as HTMLElement };
}

describe('PartnersDialog: campañas afectadas (K1)', () => {
  it('lista por nombre y estado las campañas que aún no se cierran', async () => {
    const { fixture, http, element } = setup();
    const request = http.expectOne((r) => r.url === '/api/campaigns');
    expect(request.request.params.get('awaitingClose')).toBe('true');
    request.flush(pending);
    await fixture.whenStable();
    expect(
      [...element.querySelectorAll('.affected li')].map((li) =>
        li.textContent?.replace(/\s+/g, ' ').trim(),
      ),
    ).toEqual(['Nochebuena 2026 · Activa', 'Reyes 2027 · Programada']);
  });

  it('sin campañas por cerrar lo dice', async () => {
    const { fixture, http, element } = setup();
    http.expectOne((r) => r.url === '/api/campaigns').flush([]);
    await fixture.whenStable();
    expect(element.textContent).toContain('No hay campañas sin cerrar.');
  });

  it('si la carga falla, lo dice en lugar de mostrar una lista vacía', async () => {
    const { fixture, http, element } = setup();
    http
      .expectOne((r) => r.url === '/api/campaigns')
      .flush(
        {
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Ocurrió un error inesperado. Intenta de nuevo.',
        },
        { status: 500, statusText: 'Error' },
      );
    await fixture.whenStable();
    expect(element.querySelector('.affected [role="alert"]')?.textContent).toContain(
      'No se pudieron cargar las campañas afectadas',
    );
  });
});
