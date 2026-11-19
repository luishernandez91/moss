import { randomUUID } from 'node:crypto';
import { expect, test, type Page } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  const response = await page.request.post('/api/auth/login', {
    data: { email: process.env['E2E_AUTH_EMAIL'], password: process.env['E2E_AUTH_PASSWORD'] },
  });
  expect(response.ok()).toBe(true);
});

/** Tipo con un atributo fijo y dos de variante, creado por la API (pantalla 3 ya tiene su prueba). */
async function createType(page: Page, name: string): Promise<string> {
  const type = await page.request.post('/api/article-types', { data: { name } });
  expect(type.ok()).toBe(true);
  const { id } = (await type.json()) as { id: string };
  for (const attribute of [
    {
      name: 'Material',
      dataType: 'list',
      options: ['concreto', 'barro'],
      required: true,
      definesVariant: false,
    },
    {
      name: 'Forma',
      dataType: 'list',
      options: ['redonda', 'cuadrada'],
      required: true,
      definesVariant: true,
    },
    { name: 'Diámetro', dataType: 'number', unit: 'cm', required: true, definesVariant: true },
  ]) {
    expect(
      (await page.request.post(`/api/article-types/${id}/attributes`, { data: attribute })).ok(),
    ).toBe(true);
  }
  return id;
}

async function noHorizontalOverflow(page: Page): Promise<void> {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
}

test('alta de artículo y variantes, historial de costo, inactivas y filtros', async ({
  page,
}, testInfo) => {
  const tag = `${testInfo.project.name} ${randomUUID().slice(0, 6)}`;
  const typeName = `e2e ${tag} Maceta`;
  const articleName = `e2e ${tag} Maceta de concreto`;
  const sku = `E2E-${randomUUID().slice(0, 6).toUpperCase()}`;
  const typeId = await createType(page, typeName);
  // Un insumo en metros para ver la unidad en la lista.
  const material = await page.request.post('/api/article-types', {
    data: { name: `e2e ${tag} Material` },
  });
  const materialId = ((await material.json()) as { id: string }).id;
  expect(
    (
      await page.request.post('/api/articles', {
        data: {
          articleTypeId: materialId,
          name: `e2e ${tag} Hilo de cáñamo`,
          stockUnit: 'm',
          sold: false,
          usedInRecipes: true,
          variants: [{ sku: `${sku}-HIL`, averageCost: 50, price: null, stock: 300 }],
        },
      })
    ).ok(),
  ).toBe(true);

  await page.goto('/catalogo');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(/Catálogo/);
  await page.getByRole('button', { name: 'Nuevo artículo' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Tipo', { exact: true }).selectOption({ label: typeName });
  await dialog.getByLabel('Nombre', { exact: true }).fill(articleName);
  await dialog.getByLabel('Material').selectOption('concreto');
  await dialog.getByLabel('SKU').fill(`${sku}-r08`);
  await dialog.getByLabel('Forma').selectOption('redonda');
  await dialog.getByLabel('Diámetro').fill('8');
  await dialog.getByLabel('Costo promedio').fill('15.00');
  await dialog.getByLabel('Precio (opcional)').fill('35');
  await dialog.getByLabel('Existencia', { exact: true }).fill('25');
  await dialog.getByRole('button', { name: 'Guardar' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);

  await expect(page.getByRole('heading', { level: 1, name: articleName })).toBeVisible();
  await expect(page.getByText('Material: concreto')).toBeVisible();
  await expect(page.getByText('1 variante · 25 piezas en existencia')).toBeVisible();

  // La misma combinación se rechaza con un mensaje claro; con otro diámetro se agrega.
  await page.getByRole('button', { name: 'Agregar variante' }).click();
  await dialog.getByLabel('SKU').fill(`${sku}-r08b`);
  await dialog.getByLabel('Forma').selectOption('redonda');
  await dialog.getByLabel('Diámetro').fill('8');
  await dialog.getByLabel('Costo promedio').fill('16');
  await dialog.getByRole('button', { name: 'Guardar' }).click();
  await expect(dialog.getByRole('alert')).toContainText('ya tiene esa combinación de atributos');
  await dialog.getByLabel('Diámetro').fill('10');
  await dialog.getByRole('button', { name: 'Guardar' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByText('2 variantes · 25 piezas en existencia')).toBeVisible();

  // Editar el costo agrega una entrada al historial.
  await page.getByRole('button', { name: `Editar ${sku}-R08`, exact: true }).click();
  await dialog.getByLabel('Costo promedio').fill('18.00');
  await dialog.getByRole('button', { name: 'Guardar' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  if (testInfo.project.name === 'mobile') await page.getByText('Ver historial de costo').click();
  const history = page.locator('.history li');
  await expect(history).toHaveCount(2);
  await expect(history.first()).toContainText('Edición manual');
  await expect(history.first()).toContainText('$18.00');
  await expect(history.last()).toContainText('Costo inicial');

  // Desactivar oculta la variante; «Mostrar inactivas» la muestra con «Reactivar».
  await page.getByRole('button', { name: `Desactivar ${sku}-R08B` }).click();
  await expect(page.getByText('1 variante · 25 piezas en existencia')).toBeVisible();
  await page.getByRole('button', { name: 'Mostrar inactivas' }).click();
  await expect(page.getByText('Inactiva', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: `Reactivar ${sku}-R08B` }).click();
  await expect(page.getByText('2 variantes · 25 piezas en existencia')).toBeVisible();
  await noHorizontalOverflow(page);
  await page.screenshot({
    path: testInfo.outputPath(`detalle-de-articulo-${testInfo.project.name}.png`),
    fullPage: true,
  });

  // Lista: unidad como sufijo, filtro por tipo y por atributo de variante.
  await page.getByRole('link', { name: 'Catálogo' }).first().click();
  await expect(page.getByText('$0.50/m').first()).toBeVisible();
  await expect(page.getByText('300 m').first()).toBeVisible();
  await page
    .getByRole('group', { name: 'Tipo de artículo' })
    .getByRole('button', { name: typeName })
    .click();
  await page.getByRole('button', { name: 'Filtrar por atributo' }).click();
  await dialog.getByLabel('Atributo').selectOption({ label: 'Diámetro' });
  await dialog.getByLabel('Valor').fill('10');
  await dialog.getByRole('button', { name: 'Aplicar' }).click();
  await expect(page.getByText('Diámetro: 10 cm')).toBeVisible();
  await expect(page.getByText(articleName)).toBeVisible();
  await expect(page.getByText('1 artículo · 2 variantes')).toBeVisible();
  await noHorizontalOverflow(page);
  await page.screenshot({
    path: testInfo.outputPath(`catalogo-${testInfo.project.name}.png`),
    fullPage: true,
  });

  // Pantalla 3: un atributo con valores no se puede borrar.
  await page.goto('/tipos-de-articulo');
  await page.getByRole('button', { name: new RegExp(`^${typeName}`) }).click();
  await page.getByRole('button', { name: 'Editar Material' }).click();
  await dialog.getByRole('button', { name: 'Borrar atributo' }).click();
  await page
    .getByRole('dialog')
    .last()
    .getByRole('button', { name: 'Borrar', exact: true })
    .click();
  await expect(page.getByRole('dialog').getByRole('alert')).toContainText(
    'desactívalo en lugar de borrarlo',
  );
  expect(typeId).toBeTruthy();
});
