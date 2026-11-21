import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { SizesPage } from './sizes-page';
const rows = [
  { id: 's', key: 'small', label: 'Chico', sortOrder: 0, active: true, inUse: true },
  { id: 'm', key: 'medium', label: 'Mediano', sortOrder: 1, active: false, inUse: false },
];
describe('SizesPage', () => {
  it('muestra estado, uso y orden; el fallo conserva la lista', async () => {
    TestBed.configureTestingModule({
      imports: [SizesPage],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    });
    const fixture = TestBed.createComponent(SizesPage);
    const http = TestBed.inject(HttpTestingController);
    TestBed.tick();
    http.expectOne('/api/sizes').flush(rows);
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.textContent).toContain('Mediano');
    expect(el.textContent).toContain('Desactivado');
    el.querySelector<HTMLButtonElement>('button[aria-label="Subir Mediano"]')!.click();
    const req = http.expectOne('/api/sizes/order');
    expect(req.request.body).toEqual({ ids: ['m', 's'] });
    req.flush(
      { code: 'SIZE_ORDER_CONFLICT', message: 'Recarga antes de ordenar.' },
      { status: 409, statusText: 'Conflict' },
    );
    await fixture.whenStable();
    expect(el.textContent).toContain('Recarga antes de ordenar.');
    expect([...el.querySelectorAll('.size-name')].map((n) => n.textContent?.trim())).toEqual([
      'Chico',
      'Mediano',
    ]);
    http.verify();
  });
});
