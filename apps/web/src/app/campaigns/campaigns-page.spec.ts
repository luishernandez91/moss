import { BreakpointObserver, type BreakpointState } from '@angular/cdk/layout';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import type { Campaign } from '@moss/contracts';
import { of } from 'rxjs';
import { CampaignsPage } from './campaigns-page';

const temporada = {
  id: '00000000-0000-4000-8000-000000000001',
  name: 'Temporada',
  allowsOverlap: false,
};
const evento = { id: '00000000-0000-4000-8000-000000000002', name: 'Evento', allowsOverlap: true };
const rows: Campaign[] = [
  {
    id: '00000000-0000-4000-8000-000000000a01',
    name: 'Nochebuena 2026',
    type: temporada,
    status: 'active',
    budget: 300000,
    startDate: '2026-11-01',
    endDate: '2026-12-24',
    reinvestmentPercent: 0,
    notes: null,
  },
  {
    id: '00000000-0000-4000-8000-000000000a02',
    name: 'Suculentas para eventos',
    type: evento,
    status: 'active',
    budget: 220000,
    startDate: '2026-11-10',
    endDate: '2026-12-20',
    reinvestmentPercent: 0,
    notes: null,
  },
  {
    id: '00000000-0000-4000-8000-000000000a03',
    name: 'Borrador',
    type: temporada,
    status: 'draft',
    budget: 0,
    startDate: null,
    endDate: null,
    reinvestmentPercent: 0,
    notes: null,
  },
];

function setup(desktop: boolean) {
  const observer: Pick<BreakpointObserver, 'observe'> = {
    observe: () => of({ matches: desktop, breakpoints: {} } satisfies BreakpointState),
  };
  TestBed.configureTestingModule({
    imports: [CampaignsPage],
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      { provide: BreakpointObserver, useValue: observer },
    ],
  });
  const fixture = TestBed.createComponent(CampaignsPage);
  TestBed.tick();
  return {
    fixture,
    http: TestBed.inject(HttpTestingController),
    element: fixture.nativeElement as HTMLElement,
  };
}

describe('CampaignsPage', () => {
  it('muestra pastillas de estado y tarjetas sin cifras de gastos ni ventas, sin acciones de K2', async () => {
    const { fixture, http, element } = setup(true);
    http.expectOne('/api/campaigns').flush(rows);
    await fixture.whenStable();
    const chips = [...element.querySelectorAll('.status-chips button')].map((b) =>
      b.textContent?.trim(),
    );
    expect(chips).toEqual([
      'Todas',
      'Borrador',
      'Programada',
      'Activa',
      'Por cerrar',
      'Cerrada',
      'Cancelada',
    ]);
    const card = element.querySelector('.campaign-card')!;
    expect(card.textContent).toContain('Nochebuena 2026');
    expect(card.textContent).toContain('Activa');
    expect(card.textContent).toContain('Temporada');
    expect(card.textContent).toContain('1 nov – 24 dic 2026');
    expect(card.textContent).toContain('Presupuesto $3,000.00');
    expect([...card.querySelectorAll('dd')].map((dd) => dd.textContent?.trim())).toEqual([
      '—',
      '—',
      '—',
    ]);
    expect(element.querySelectorAll('.campaign-card')).toHaveLength(3);
    expect(element.textContent).toContain('Sin fechas');
    expect(element.textContent).not.toContain('Nueva campaña');
    expect(element.querySelector('[aria-label^="Acciones"]')).toBeNull();
  });

  it('filtra por estado con el parámetro de la API', async () => {
    const { fixture, http, element } = setup(true);
    http.expectOne('/api/campaigns').flush(rows);
    await fixture.whenStable();
    [...element.querySelectorAll<HTMLButtonElement>('.status-chips button')]
      .find((b) => b.textContent?.trim() === 'Activa')!
      .click();
    TestBed.tick();
    const filtered = http.expectOne((request) => request.url === '/api/campaigns');
    expect(filtered.request.params.get('status')).toBe('active');
    filtered.flush([]);
    await fixture.whenStable();
    expect(element.textContent).toContain('No hay campañas con este estado.');
  });

  it('en escritorio, «Línea de tiempo» muestra filas por tipo y la nota de empalme', async () => {
    const { fixture, http, element } = setup(true);
    http.expectOne('/api/campaigns').flush(rows);
    await fixture.whenStable();
    [...element.querySelectorAll<HTMLButtonElement>('.view-toggle button')]
      .find((b) => b.textContent?.trim() === 'Línea de tiempo')!
      .click();
    await fixture.whenStable();
    expect(
      [...element.querySelectorAll('.timeline-row-label')].map((n) => n.textContent?.trim()),
    ).toEqual(['Evento', 'Temporada']);
    expect(element.querySelectorAll('.timeline-bar')).toHaveLength(2);
    expect(element.textContent).toContain(
      'Campañas del mismo tipo no se empalman, excepto eventos.',
    );
  });

  it('en celular muestra tarjetas y la línea de tiempo por mes', async () => {
    const { fixture, http, element } = setup(false);
    http.expectOne('/api/campaigns').flush(rows);
    await fixture.whenStable();
    expect(element.querySelector('.view-toggle')).toBeNull();
    expect(element.querySelectorAll('.campaign-card')).toHaveLength(3);
    expect(
      [...element.querySelectorAll('.month-group dt')].map((n) => n.textContent?.trim()),
    ).toEqual(['NOV', 'DIC']);
  });

  it('muestra el estado vacío sin campañas', async () => {
    const { fixture, http, element } = setup(true);
    http.expectOne('/api/campaigns').flush([]);
    await fixture.whenStable();
    expect(element.textContent).toContain('Aún no hay campañas.');
  });
});
