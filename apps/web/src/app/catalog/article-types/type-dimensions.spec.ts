import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { AttributeDialog } from './attribute-dialog';

function field(el: HTMLElement, label: string): HTMLInputElement | HTMLSelectElement {
  const wrapper = [...el.querySelectorAll('mat-form-field')].find(
    (n) => n.querySelector('mat-label')?.textContent?.trim() === label,
  );
  const control = wrapper?.querySelector<HTMLInputElement | HTMLSelectElement>('input, select');
  expect(control, label).toBeTruthy();
  return control!;
}
async function change(el: HTMLElement, label: string, value: string) {
  const c = field(el, label);
  c.value = value;
  c.dispatchEvent(new Event('input'));
  c.dispatchEvent(new Event('change'));
  await Promise.resolve();
  TestBed.tick();
}
describe('C6 diálogo de atributo con registros', () => {
  it.each([
    ['text', 'hola', 'hola'],
    ['number', '0', 0],
    ['list', 'A', 'A'],
    ['boolean', 'false', false],
  ] as const)('captura %s con valor inicial y explica alcance', async (dataType, raw, value) => {
    const close = vi.fn();
    TestBed.configureTestingModule({
      imports: [AttributeDialog],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: MAT_DIALOG_DATA, useValue: { typeId: 't', articleCount: 2 } },
        { provide: MatDialogRef, useValue: { close } },
      ],
    });
    const f = TestBed.createComponent(AttributeDialog);
    TestBed.tick();
    const http = TestBed.inject(HttpTestingController);
    http.expectOne('/api/article-types').flush([]);
    await f.whenStable();
    const el = f.nativeElement as HTMLElement;
    await change(el, 'Nombre', 'Nuevo');
    await change(el, 'Tipo de dato', dataType);
    if (dataType === 'list') await change(el, 'Opciones', 'A, B');
    expect(el.textContent).toContain('inactivos');
    expect(el.textContent).toContain('altas futuras');
    await change(el, 'Valor inicial', raw);
    el.querySelector('form')!.dispatchEvent(new Event('submit', { cancelable: true }));
    const req = http.expectOne('/api/article-types/t/attribute-dimensions');
    expect(req.request.body.initialValue).toBe(value);
    expect(req.request.body.attribute.dataType).toBe(dataType);
    req.flush(
      { code: 'INVALID_INITIAL_VALUE', message: 'Revisa el valor inicial.' },
      { status: 422, statusText: 'Unprocessable Entity' },
    );
    await f.whenStable();
    expect(el.querySelector('[role="alert"]')?.textContent).toContain('Revisa el valor inicial.');
    expect(field(el, 'Valor inicial').value).toBe(raw);
    expect(close).not.toHaveBeenCalled();
  });
  it('no acepta blanco como cero ni omisión de booleano', async () => {
    TestBed.configureTestingModule({
      imports: [AttributeDialog],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: MAT_DIALOG_DATA, useValue: { typeId: 't', articleCount: 1 } },
        { provide: MatDialogRef, useValue: { close: vi.fn() } },
      ],
    });
    const f = TestBed.createComponent(AttributeDialog);
    TestBed.tick();
    const http = TestBed.inject(HttpTestingController);
    http.expectOne('/api/article-types').flush([]);
    await f.whenStable();
    const el = f.nativeElement as HTMLElement;
    await change(el, 'Nombre', 'Nuevo');
    for (const kind of ['number', 'boolean']) {
      await change(el, 'Tipo de dato', kind);
      expect(el.querySelector<HTMLButtonElement>('button[type="submit"]')!.disabled).toBe(true);
      el.querySelector('form')!.dispatchEvent(new Event('submit', { cancelable: true }));
      http.expectNone('/api/article-types/t/attribute-dimensions');
    }
  });
});
