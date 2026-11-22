import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { EnableSizeDialog } from './enable-size-dialog';
describe('C6 tamaño inicial', () => {
  it('espera tamaños, solo ofrece activos, exige elección y conserva error', async () => {
    const close = vi.fn();
    TestBed.configureTestingModule({
      imports: [EnableSizeDialog],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: MAT_DIALOG_DATA, useValue: { id: 't', name: 'Planta', articleCount: 2 } },
        { provide: MatDialogRef, useValue: { close } },
      ],
    });
    const f = TestBed.createComponent(EnableSizeDialog);
    TestBed.tick();
    const http = TestBed.inject(HttpTestingController);
    const el = f.nativeElement as HTMLElement;
    http.expectOne('/api/article-types').flush([]);
    expect(el.querySelector<HTMLButtonElement>('button[type="submit"]')!.disabled).toBe(true);
    http.expectOne('/api/sizes').flush([
      { id: 's', key: 'small', label: 'Chico', active: true },
      { id: 'm', key: 'medium', label: 'Mediano', active: false },
    ]);
    await f.whenStable();
    expect(el.textContent).toContain('Chico');
    expect(el.textContent).not.toContain('Mediano');
    const select = el.querySelector('select')!;
    select.value = 's';
    select.dispatchEvent(new Event('input'));
    select.dispatchEvent(new Event('change'));
    await f.whenStable();
    el.querySelector('form')!.dispatchEvent(new Event('submit', { cancelable: true }));
    const req = http.expectOne('/api/article-types/t/enable-size');
    expect(req.request.body).toEqual({ initialSizeId: 's' });
    req.flush(
      { code: 'SIZE_INACTIVE', message: 'El tamaño está desactivado; elige uno activo.' },
      { status: 422, statusText: 'Unprocessable Entity' },
    );
    await f.whenStable();
    expect(el.querySelector('[role="alert"]')?.textContent).toContain('desactivado');
    expect(close).not.toHaveBeenCalled();
  });
});
