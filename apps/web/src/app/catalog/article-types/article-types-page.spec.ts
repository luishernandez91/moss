import { BreakpointObserver, type BreakpointState } from '@angular/cdk/layout';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import type { ArticleType } from '@moss/contracts';
import { of } from 'rxjs';
import { ArticleTypesPage } from './article-types-page';

const maceta: ArticleType = {
  id: '00000000-0000-4000-8000-000000000001',
  name: 'Maceta',
  attributes: [
    {
      id: '00000000-0000-4000-8000-000000000011',
      key: 'material',
      name: 'Material',
      dataType: 'list',
      unit: null,
      options: ['concreto', 'barro'],
      required: true,
      definesVariant: false,
      active: true,
    },
    {
      id: '00000000-0000-4000-8000-000000000012',
      key: 'diametro',
      name: 'Diámetro',
      dataType: 'number',
      unit: 'cm',
      options: null,
      required: true,
      definesVariant: true,
      active: true,
    },
    {
      id: '00000000-0000-4000-8000-000000000013',
      key: 'color',
      name: 'Color',
      dataType: 'list',
      unit: null,
      options: ['gris'],
      required: true,
      definesVariant: true,
      active: false,
    },
  ],
};
const planta: ArticleType = {
  id: '00000000-0000-4000-8000-000000000002',
  name: 'Planta',
  attributes: [],
};

async function render(desktop: boolean, response: ArticleType[] | 'error') {
  const { element } = await setup(desktop, response);
  return element;
}

async function setup(desktop: boolean, response: ArticleType[] | 'error') {
  const observer: Pick<BreakpointObserver, 'observe'> = {
    observe: () => of({ matches: desktop, breakpoints: {} } satisfies BreakpointState),
  };
  TestBed.configureTestingModule({
    imports: [ArticleTypesPage],
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      { provide: BreakpointObserver, useValue: observer },
    ],
  });
  const fixture = TestBed.createComponent(ArticleTypesPage);
  // Dispara la petición de httpResource; whenStable esperaría a que se responda.
  TestBed.tick();
  const request = TestBed.inject(HttpTestingController).expectOne('/api/article-types');
  if (response === 'error') {
    request.flush(
      { code: 'INTERNAL_SERVER_ERROR', message: 'Ocurrió un error inesperado. Intenta de nuevo.' },
      { status: 500, statusText: 'Error' },
    );
  } else {
    request.flush(response);
  }
  await fixture.whenStable();
  return { fixture, element: fixture.nativeElement as HTMLElement };
}

describe('ArticleTypesPage', () => {
  it('en escritorio lista los tipos con atributos activos y muestra la tabla del primero', async () => {
    const element = await render(true, [maceta, planta]);
    const types = [...element.querySelectorAll('.type')].map((node) => [
      node.querySelector('.type-name')?.textContent?.trim(),
      node.querySelector('.count')?.textContent?.trim(),
    ]);
    expect(types).toEqual([
      ['Maceta', '2'],
      ['Planta', '0'],
    ]);
    expect(element.querySelector('h2')?.textContent).toContain('Atributos de Maceta');
    const headers = [...element.querySelectorAll('th')].map((node) => node.textContent?.trim());
    expect(headers).toEqual([
      'Atributo',
      'Tipo de dato',
      'Unidad',
      'Opciones',
      'Requerido',
      'Define variante',
    ]);
    expect(element.querySelectorAll('tbody tr')).toHaveLength(3);
    expect(element.textContent).toContain('concreto, barro');
    expect(element.textContent).toContain('Inactivo');
    // Solo los activos cuentan para la variante.
    expect(element.textContent).toContain('1 atributo define variante: diámetro.');
  });

  it('en celular muestra los atributos como tarjetas', async () => {
    const element = await render(false, [maceta]);
    expect(element.querySelector('table')).toBeNull();
    expect(element.querySelectorAll('.attribute-card')).toHaveLength(3);
    expect(element.textContent).toContain('En cm');
  });

  it('muestra el estado vacío sin tipos', async () => {
    const element = await render(true, []);
    expect(element.textContent).toContain('Aún no hay tipos de artículo.');
  });

  it('muestra el mensaje de la API si la carga falla', async () => {
    const element = await render(true, 'error');
    expect(element.querySelector('[role="alert"]')?.textContent).toContain(
      'Ocurrió un error inesperado. Intenta de nuevo.',
    );
  });

  it('si falla el cambio en línea, el interruptor vuelve a su estado y se muestra el error', async () => {
    const { fixture, element } = await setup(true, [maceta]);
    const toggle = () =>
      element.querySelector<HTMLButtonElement>(
        'button[role="switch"][aria-label="Requerido: Material"]',
      )!;
    expect(toggle().getAttribute('aria-checked')).toBe('true');
    toggle().click();
    await fixture.whenStable();
    const http = TestBed.inject(HttpTestingController);
    const patch = http.expectOne(
      `/api/article-types/${maceta.id}/attributes/${maceta.attributes[0]!.id}`,
    );
    expect(patch.request.body).toEqual({ required: false });
    patch.flush(
      { code: 'ATTRIBUTE_NOT_FOUND', message: 'No se encontró el atributo.' },
      { status: 404, statusText: 'Not Found' },
    );
    // El rechazo de firstValueFrom llega en una tarea posterior al flush.
    await new Promise((resolve) => setTimeout(resolve));
    TestBed.tick();
    http.expectOne('/api/article-types').flush([maceta]);
    await fixture.whenStable();
    expect(toggle().getAttribute('aria-checked')).toBe('true');
    expect(document.body.textContent).toContain('No se encontró el atributo.');
  });
});
