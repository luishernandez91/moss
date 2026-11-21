import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { TypeDialog } from './type-dialog';
describe('TypeDialog usa tamaño', () => {
  it('bloquea el interruptor con artículos y muestra la razón', async () => {
    TestBed.configureTestingModule({
      imports: [TypeDialog],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        {
          provide: MAT_DIALOG_DATA,
          useValue: { type: { id: 't', name: 'Planta', usesSize: true, articleCount: 1 } },
        },
        { provide: MatDialogRef, useValue: { close: () => undefined } },
      ],
    });
    const f = TestBed.createComponent(TypeDialog);
    TestBed.tick();
    TestBed.inject(HttpTestingController).expectOne('/api/article-types').flush([]);
    await f.whenStable();
    const el = f.nativeElement as HTMLElement;
    const toggle = el.querySelector<HTMLButtonElement>('button[role="switch"]')!;
    expect(toggle.disabled).toBe(true);
    expect(toggle.getAttribute('aria-checked')).toBe('true');
    expect(el.textContent).toContain('ya tiene artículos');
  });
});
