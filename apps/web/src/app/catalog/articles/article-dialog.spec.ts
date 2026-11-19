import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import type { ArticleType } from '@moss/contracts';
import { ArticleDialog } from './article-dialog';

const maceta: ArticleType = {
  id: '00000000-0000-4000-8000-000000000001',
  name: 'Maceta',
  attributes: [],
};

describe('ArticleDialog', () => {
  it('si se abre antes de que lleguen los tipos, los muestra cuando llegan', async () => {
    TestBed.configureTestingModule({
      imports: [ArticleDialog],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: MAT_DIALOG_DATA, useValue: { mode: 'create' } },
        { provide: MatDialogRef, useValue: { close: () => undefined } },
      ],
    });
    const fixture = TestBed.createComponent(ArticleDialog);
    TestBed.tick();
    const element = fixture.nativeElement as HTMLElement;
    const options = () =>
      [...element.querySelectorAll('select[aria-label="Tipo"] option')].map((option) =>
        option.textContent?.trim(),
      );
    expect(options()).toEqual(['Elige un tipo']);
    TestBed.inject(HttpTestingController).expectOne('/api/article-types').flush([maceta]);
    await fixture.whenStable();
    expect(options()).toEqual(['Elige un tipo', 'Maceta']);
  });
});
