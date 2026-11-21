import { BreakpointObserver, type BreakpointState } from '@angular/cdk/layout';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import type { ArticleSummary, ArticleType } from '@moss/contracts';
import { of } from 'rxjs';
import { ArticlesPage } from './articles-page';

const maceta: ArticleType = {
  usesSize: false,
  articleCount: 0,
  id: '00000000-0000-4000-8000-000000000001',
  name: 'Maceta',
  attributes: [
    {
      id: '00000000-0000-4000-8000-000000000011',
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
const rows: ArticleSummary[] = [
  {
    id: '00000000-0000-4000-8000-0000000000a1',
    name: 'Maceta de concreto',
    articleType: { usesSize: false, id: maceta.id, name: 'Maceta' },
    stockUnit: 'piece',
    sold: true,
    usedInRecipes: true,
    active: true,
    variantCount: 5,
    costFrom: 900,
    totalStock: 125,
  },
  {
    id: '00000000-0000-4000-8000-0000000000a2',
    name: 'Hilo de cáñamo',
    articleType: { usesSize: false, id: '00000000-0000-4000-8000-000000000002', name: 'Material' },
    stockUnit: 'm',
    sold: false,
    usedInRecipes: true,
    active: true,
    variantCount: 1,
    costFrom: 50,
    totalStock: 300,
  },
];

async function setup(desktop: boolean) {
  const observer: Pick<BreakpointObserver, 'observe'> = {
    observe: () => of({ matches: desktop, breakpoints: {} } satisfies BreakpointState),
  };
  TestBed.configureTestingModule({
    imports: [ArticlesPage],
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      provideRouter([]),
      { provide: BreakpointObserver, useValue: observer },
    ],
  });
  const fixture = TestBed.createComponent(ArticlesPage);
  TestBed.tick();
  const http = TestBed.inject(HttpTestingController);
  http.expectOne('/api/sizes?purpose=filter').flush([]);
  http.expectOne('/api/article-types').flush([maceta]);
  const element = fixture.nativeElement as HTMLElement;
  return { fixture, http, element };
}

describe('ArticlesPage', () => {
  it('en escritorio muestra la tabla con costo y existencia en la unidad del artículo', async () => {
    const { fixture, http, element } = await setup(true);
    http.expectOne((request) => request.url === '/api/articles').flush(rows);
    await fixture.whenStable();
    const headers = [...element.querySelectorAll('th')].map((node) => node.textContent?.trim());
    expect(headers).toEqual([
      'Artículo',
      'Tipo',
      'Variantes',
      'Costo desde',
      'Existencia',
      'Se vende',
      'Se usa en recetas',
    ]);
    const hilo = element.querySelectorAll('tbody tr')[1]!.textContent!;
    expect(hilo).toContain('$0.50/m');
    expect(hilo).toContain('300 m');
    expect(element.textContent).toContain('2 artículos · 6 variantes');
  });

  it('en celular muestra tarjetas', async () => {
    const { fixture, http, element } = await setup(false);
    http.expectOne((request) => request.url === '/api/articles').flush(rows);
    await fixture.whenStable();
    expect(element.querySelector('table')).toBeNull();
    expect(element.querySelectorAll('.article-card')).toHaveLength(2);
    expect(element.textContent).toContain('Desde $9.00');
  });

  it('filtra por tipo, existencia e inactivos con los parámetros de la API', async () => {
    const { fixture, http, element } = await setup(true);
    http.expectOne((request) => request.url === '/api/articles').flush(rows);
    await fixture.whenStable();
    const chip = [...element.querySelectorAll<HTMLButtonElement>('.type-chips button')].find(
      (button) => button.textContent?.trim() === 'Maceta',
    )!;
    chip.click();
    TestBed.tick();
    const byType = http.expectOne((request) => request.url === '/api/articles');
    expect(byType.request.params.get('typeId')).toBe(maceta.id);
    byType.flush([rows[0]!]);
    await fixture.whenStable();
    element.querySelector<HTMLButtonElement>('button[aria-label="Solo con existencia"]')!.click();
    element.querySelector<HTMLButtonElement>('button[aria-label="Mostrar inactivos"]')!.click();
    TestBed.tick();
    const flags = http.expectOne((request) => request.url === '/api/articles');
    expect(flags.request.params.get('inStock')).toBe('true');
    expect(flags.request.params.get('includeInactive')).toBe('true');
    flags.flush([]);
    await fixture.whenStable();
    expect(element.textContent).toContain('No hay artículos con estos filtros.');
  });
});
