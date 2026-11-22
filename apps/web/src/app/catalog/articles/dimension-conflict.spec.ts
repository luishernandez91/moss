import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import type { ArticleDetail, ArticleType } from '@moss/contracts';
import { ArticleDialog } from './article-dialog';
import { VariantDialog } from './variant-dialog';
const type: ArticleType = {
  id: 't',
  name: 'Tipo',
  usesSize: false,
  articleCount: 1,
  attributes: [],
};
const article: ArticleDetail = {
  id: 'a',
  name: 'Captura',
  description: null,
  articleType: type,
  stockUnit: 'piece',
  sold: true,
  usedInRecipes: true,
  active: true,
  fixedAttributes: {},
  variants: [
    {
      id: 'v',
      sku: 'SKU',
      attributes: {},
      sizeId: null,
      averageCost: 100,
      price: null,
      stock: 1,
      active: true,
    },
  ],
};
const dimension = {
  id: 'd',
  key: 'nuevo',
  name: 'Nuevo',
  dataType: 'text' as const,
  unit: null,
  options: null,
  required: true,
  definesVariant: false,
  active: true,
};
for (const scope of ['fixed', 'variant'] as const)
  describe(`C6 conflicto ${scope}`, () => {
    it('envía snapshot, conserva captura y exige recargar antes de reenviar', async () => {
      const component = scope === 'fixed' ? ArticleDialog : VariantDialog;
      TestBed.configureTestingModule({
        imports: [component],
        providers: [
          provideHttpClient(),
          provideHttpClientTesting(),
          {
            provide: MAT_DIALOG_DATA,
            useValue:
              scope === 'fixed'
                ? { mode: 'edit', article, type }
                : { article, type, variant: article.variants[0] },
          },
          { provide: MatDialogRef, useValue: { close: vi.fn() } },
        ],
      });
      const f =
        scope === 'fixed'
          ? TestBed.createComponent(ArticleDialog)
          : TestBed.createComponent(VariantDialog);
      TestBed.tick();
      const http = TestBed.inject(HttpTestingController);
      http.expectOne('/api/sizes').flush([]);
      for (const req of http.match('/api/article-types')) req.flush([type]);
      await f.whenStable();
      const el = f.nativeElement as HTMLElement;
      const submit = () =>
        el.querySelector('form')!.dispatchEvent(new Event('submit', { cancelable: true }));
      const url = scope === 'fixed' ? '/api/articles/a' : '/api/articles/a/variants/v';
      submit();
      const req = http.expectOne(url);
      expect(
        req.request.body[scope === 'fixed' ? 'expectedFixedAttributes' : 'expectedDimension'],
      ).toEqual(scope === 'fixed' ? {} : { attributes: {}, sizeId: null });
      req.flush(
        { code: 'CATALOG_RECORD_CHANGED', message: 'Los atributos cambiaron. Recarga los datos.' },
        { status: 409, statusText: 'Conflict' },
      );
      await f.whenStable();
      expect(el.querySelector<HTMLButtonElement>('button[type="submit"]')!.disabled).toBe(true);
      const reload = [...el.querySelectorAll('button')].find(
        (b) => b.textContent?.trim() === 'Recargar datos',
      );
      expect(reload).toBeTruthy();
      reload!.click();
      const latest = {
        ...article,
        fixedAttributes: scope === 'fixed' ? { nuevo: 'Inicial' } : {},
        variants: [
          { ...article.variants[0]!, attributes: scope === 'variant' ? { nuevo: 'Inicial' } : {} },
        ],
      };
      http.expectOne('/api/articles/a').flush(latest);
      http
        .expectOne('/api/article-types')
        .flush([{ ...type, attributes: [{ ...dimension, definesVariant: scope === 'variant' }] }]);
      await new Promise((r) => setTimeout(r));
      TestBed.tick();
      for (const request of http.match('/api/sizes')) request.flush([]);
      await f.whenStable();
      expect(el.textContent).toContain('Revisa');
      expect(el.querySelector<HTMLInputElement>('input[aria-label="Nuevo"]')?.value).toBe(
        'Inicial',
      );
      // Recargar no envía una escritura automáticamente.
      http.expectNone((r) => r.method === 'PATCH');
      submit();
      const retry = http.expectOne(url);
      expect(
        retry.request.body[scope === 'fixed' ? 'expectedFixedAttributes' : 'expectedDimension'],
      ).toEqual(
        scope === 'fixed'
          ? { nuevo: 'Inicial' }
          : { attributes: { nuevo: 'Inicial' }, sizeId: null },
      );
      expect(retry.request.body[scope === 'fixed' ? 'name' : 'sku']).toBe(
        scope === 'fixed' ? 'Captura' : 'SKU',
      );
      retry.flush(scope === 'fixed' ? latest : latest.variants[0]);
      await f.whenStable();
    });
  });
