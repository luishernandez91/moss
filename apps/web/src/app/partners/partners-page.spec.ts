import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { PartnersPage } from './partners-page';
import type { Partner } from '@moss/contracts';
const pair: Partner[] = [
  { id: '00000000-0000-4000-8000-000000000001', name: 'Ana', shareBps: 3700, version: 0 },
  { id: '00000000-0000-4000-8000-000000000002', name: 'Bruno', shareBps: 6300, version: 0 },
];
function setup() {
  TestBed.configureTestingModule({
    imports: [PartnersPage],
    providers: [provideHttpClient(), provideHttpClientTesting()],
  });
  const fixture = TestBed.createComponent(PartnersPage);
  TestBed.tick();
  return {
    fixture,
    http: TestBed.inject(HttpTestingController),
    element: fixture.nativeElement as HTMLElement,
  };
}
describe('Socios', () => {
  afterEach(() => TestBed.inject(HttpTestingController).verify());
  it('muestra carga y luego porcentajes reales y montos sin datos, sin cifras ilustrativas', async () => {
    const { fixture, http, element } = setup();
    expect(element.textContent).toContain('Cargando socios');
    http.expectOne('/api/partners').flush(pair);
    await fixture.whenStable();
    expect(element.textContent).toContain('Ganancia 37%');
    expect(element.textContent).toContain('Ganancia 63%');
    expect(element.textContent).toContain('Aún no hay cierres registrados.');
    expect(element.querySelectorAll('dd')).toHaveLength(6);
    expect(element.textContent).not.toContain('$');
    expect(element.textContent).not.toContain('Nuevo socio');
  });
  it('deshabilita edición con configuración incompleta', async () => {
    const { fixture, http, element } = setup();
    http.expectOne('/api/partners').flush(pair.slice(0, 1));
    await fixture.whenStable();
    expect(element.querySelector('button')!.disabled).toBe(true);
    expect(element.textContent).toContain('se requieren exactamente dos socios');
  });
  it('muestra error de API y permite reintentar sin fingir estado vacío', async () => {
    const { fixture, http, element } = setup();
    http
      .expectOne('/api/partners')
      .flush(
        { code: 'INTERNAL_SERVER_ERROR', message: 'No se pudieron cargar los socios.' },
        { status: 500, statusText: 'Error' },
      );
    await fixture.whenStable();
    expect(element.querySelector('[role="alert"]')!.textContent).toContain(
      'No se pudieron cargar los socios.',
    );
    expect(element.textContent).not.toContain('Aún no hay cierres');
    [...element.querySelectorAll('button')]
      .find((b) => b.textContent?.includes('Reintentar'))!
      .click();
    TestBed.tick();
    http.expectOne('/api/partners').flush(pair);
    await fixture.whenStable();
    expect(element.textContent).toContain('Ana');
  });
});
