import { BreakpointObserver, type BreakpointState } from '@angular/cdk/layout';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import type { ArticleDetail, ArticleType, CostChange } from '@moss/contracts';
import { of } from 'rxjs';
import { ArticleDetailPage } from './article-detail-page';

const typeId = '00000000-0000-4000-8000-000000000001';
const maceta: ArticleType = {
  id: typeId,
  name: 'Maceta',
  attributes: [
    {
      id: '00000000-0000-4000-8000-000000000011',
      key: 'material',
      name: 'Material',
      dataType: 'list',
      unit: null,
      options: ['concreto'],
      required: true,
      definesVariant: false,
      active: true,
    },
    {
      id: '00000000-0000-4000-8000-000000000012',
      key: 'drenaje',
      name: 'Drenaje',
      dataType: 'boolean',
      unit: null,
      options: null,
      required: true,
      definesVariant: false,
      active: true,
    },
    {
      id: '00000000-0000-4000-8000-000000000013',
      key: 'forma',
      name: 'Forma',
      dataType: 'list',
      unit: null,
      options: ['redonda'],
      required: true,
      definesVariant: true,
      active: true,
    },
    {
      id: '00000000-0000-4000-8000-000000000014',
      key: 'diametro',
      name: 'Diámetro',
      dataType: 'number',
      unit: 'cm',
      options: null,
      required: true,
      definesVariant: true,
      active: true,
    },
  ],
};
const article: ArticleDetail = {
  id: '00000000-0000-4000-8000-0000000000a1',
  name: 'Maceta de concreto',
  description: null,
  articleType: { id: typeId, name: 'Maceta' },
  stockUnit: 'piece',
  sold: true,
  usedInRecipes: true,
  active: true,
  fixedAttributes: { material: 'concreto', drenaje: true },
  variants: [
    {
      id: '00000000-0000-4000-8000-0000000000b1',
      sku: 'MAC-CON-R08-GR',
      attributes: { forma: 'redonda', diametro: 8 },
      averageCost: 1500,
      price: 3500,
      stock: 25,
      active: true,
    },
    {
      id: '00000000-0000-4000-8000-0000000000b2',
      sku: 'MAC-CON-R10-GR',
      attributes: { forma: 'redonda', diametro: 10 },
      averageCost: 1800,
      price: null,
      stock: 0,
      active: false,
    },
  ],
};
const history: CostChange[] = [
  {
    id: '00000000-0000-4000-8000-0000000000c2',
    previousCost: 1600,
    averageCost: 1500,
    reason: 'manual',
    changedAt: '2026-11-04T18:00:00.000Z',
    changedBy: { id: '00000000-0000-4000-8000-0000000000d1', name: 'Luis' },
  },
  {
    id: '00000000-0000-4000-8000-0000000000c1',
    previousCost: null,
    averageCost: 1600,
    reason: 'initial',
    changedAt: '2026-08-20T18:00:00.000Z',
    changedBy: null,
  },
];

async function setup(desktop: boolean) {
  const observer: Pick<BreakpointObserver, 'observe'> = {
    observe: () => of({ matches: desktop, breakpoints: {} } satisfies BreakpointState),
  };
  TestBed.configureTestingModule({
    imports: [ArticleDetailPage],
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      provideRouter([]),
      { provide: BreakpointObserver, useValue: observer },
    ],
  });
  const fixture = TestBed.createComponent(ArticleDetailPage);
  fixture.componentRef.setInput('id', article.id);
  TestBed.tick();
  const http = TestBed.inject(HttpTestingController);
  http.expectOne(`/api/articles/${article.id}`).flush(article);
  http.expectOne('/api/article-types').flush([maceta]);
  // Con el artículo cargado se pide el historial de la primera variante; whenStable lo esperaría.
  await new Promise((resolve) => setTimeout(resolve));
  TestBed.tick();
  http
    .expectOne(`/api/articles/${article.id}/variants/${article.variants[0]!.id}/cost-history`)
    .flush(history);
  await fixture.whenStable();
  return { fixture, http, element: fixture.nativeElement as HTMLElement };
}

describe('ArticleDetailPage', () => {
  it('muestra atributos fijos, variantes activas con una columna por atributo de variante e historial', async () => {
    const { element } = await setup(true);
    expect(element.querySelector('h1')?.textContent).toContain('Maceta de concreto');
    expect(element.textContent).toContain('Material: concreto · Drenaje: sí');
    expect(element.textContent).toContain('1 variante · 25 piezas en existencia');
    const headers = [...element.querySelectorAll('.variants th')].map((node) =>
      node.textContent?.trim(),
    );
    expect(headers.slice(0, 6)).toEqual([
      'SKU',
      'Forma',
      'Diámetro',
      'Costo prom.',
      'Precio',
      'Existencia',
    ]);
    const rowsText = [...element.querySelectorAll('.variants tbody tr')].map(
      (row) => row.textContent,
    );
    expect(rowsText).toHaveLength(1);
    expect(rowsText[0]).toContain('8 cm');
    expect(rowsText[0]).toContain('$15.00');
    const entries = [...element.querySelectorAll('.history li')].map((node) =>
      node.textContent?.replace(/\s+/g, ' ').trim(),
    );
    expect(entries).toEqual([
      '4 nov 2026 · Edición manual (Luis) $15.00',
      '20 ago 2026 · Costo inicial $16.00',
    ]);
  });

  it('«Mostrar inactivas» incluye las variantes desactivadas con la acción Reactivar', async () => {
    const { fixture, element } = await setup(true);
    element.querySelector<HTMLButtonElement>('button[aria-label="Mostrar inactivas"]')!.click();
    await fixture.whenStable();
    expect(element.querySelectorAll('.variants tbody tr')).toHaveLength(2);
    expect(element.textContent).toContain('Inactiva');
    expect(element.querySelector('button[aria-label="Reactivar MAC-CON-R10-GR"]')).not.toBeNull();
  });

  it('en celular muestra tarjetas de variante', async () => {
    const { element } = await setup(false);
    expect(element.querySelector('.variants table')).toBeNull();
    expect(element.querySelectorAll('.variant-card')).toHaveLength(1);
    expect(element.textContent).toContain('redonda');
  });
});
