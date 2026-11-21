import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';
import { openedDialog } from './dialogs';
import type { Size } from '@moss/contracts';

let initial: Size[] = [];
let tempId: string | undefined;

// Hook separado: también restaura el catálogo si el flujo agota su tiempo.
test.afterEach(async ({ page }) => {
  if (initial.length === 0) return;

  if (tempId) expect((await page.request.delete(`/api/sizes/${tempId}`)).status()).toBe(204);
  const current = (await (await page.request.get('/api/sizes')).json()) as Size[];
  const ids = [
    ...initial.map((s) => s.id),
    ...current.filter((s) => !initial.some((i) => i.id === s.id)).map((s) => s.id),
  ];
  expect((await page.request.put('/api/sizes/order', { data: { ids } })).ok()).toBe(true);
});

test('tamaños, tipo con tamaño, variantes y filtro', async ({ page }, testInfo) => {
  expect(
    (
      await page.request.post('/api/auth/login', {
        data: { email: process.env['E2E_AUTH_EMAIL'], password: process.env['E2E_AUTH_PASSWORD'] },
      })
    ).ok(),
  ).toBe(true);
  const tag = randomUUID().slice(0, 6);
  const label = `Especial ${tag}`;
  const name = `e2e Planta ${tag}`;
  const sku = `E2E-${tag.toUpperCase()}`;
  initial = (await (await page.request.get('/api/sizes')).json()) as Size[];
  const small = initial.find((s) => s.key === 'small')!;
  const medium = initial.find((s) => s.key === 'medium')!;
  await page.goto('/configuracion/tamanos');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Tamaños');
  tempId = undefined;
  await page.getByRole('button', { name: 'Nuevo tamaño' }).click();
  await openedDialog(page);
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Nombre', { exact: true }).fill(label);
  await dialog.getByLabel('Clave en inglés').fill(`custom_${tag}`);
  await dialog.getByRole('button', { name: 'Guardar', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByText(label, { exact: true })).toBeVisible();
  const sizes = (await (await page.request.get('/api/sizes')).json()) as Size[];
  tempId = sizes.find((s) => s.key === `custom_${tag}`)!.id;
  await page.getByRole('button', { name: `Subir ${label}`, exact: true }).click();
  await expect
    .poll(async () => ((await (await page.request.get('/api/sizes')).json()) as Size[]).at(-2)?.id)
    .toBe(tempId);
  await page.getByRole('button', { name: `Editar ${label}`, exact: true }).click();
  await openedDialog(page);
  await dialog.getByLabel('Nombre', { exact: true }).fill(`${label} nuevo`);
  await dialog.getByRole('button', { name: 'Guardar', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await page.getByRole('button', { name: `Desactivar ${label} nuevo`, exact: true }).click();
  await expect(
    page.getByRole('button', { name: `Reactivar ${label} nuevo`, exact: true }),
  ).toBeVisible();
  await expect(page.locator('html')).toHaveJSProperty(
    'scrollWidth',
    testInfo.project.use.viewport!.width,
  );
  await page.locator('main').evaluateAll((nodes) =>
    nodes.forEach((node) => {
      node.scrollTop = 0;
    }),
  );
  await page.screenshot({
    path: testInfo.outputPath('sizes.png'),
    fullPage: true,
    animations: 'disabled',
    scale: 'css',
  });
  await page.goto('/catalogo');
  await expect(
    page.getByLabel('Tamaño', { exact: true }).locator('option', { hasText: `${label} nuevo` }),
  ).toHaveCount(0);

  await page.goto('/tipos-de-articulo');
  await page.getByRole('button', { name: 'Nuevo tipo', exact: true }).click();
  await openedDialog(page);
  await dialog.getByLabel('Nombre', { exact: true }).fill(name);
  await dialog.getByRole('switch', { name: 'Usa tamaño' }).click();
  await expect(dialog.getByRole('switch', { name: 'Usa tamaño' })).toHaveAttribute(
    'aria-checked',
    'true',
  );
  await dialog.getByRole('button', { name: 'Guardar', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByText('Usa tamaño', { exact: true })).toBeVisible();
  await page.locator('main').evaluateAll((nodes) =>
    nodes.forEach((node) => {
      node.scrollTop = 0;
    }),
  );
  await page.screenshot({
    path: testInfo.outputPath('size-type.png'),
    fullPage: true,
    animations: 'disabled',
    scale: 'css',
  });
  await page.goto('/catalogo');
  await page.getByRole('button', { name: 'Nuevo artículo', exact: true }).click();
  await openedDialog(page);
  await dialog.getByLabel('Tipo', { exact: true }).selectOption({ label: name });
  await dialog.getByLabel('Nombre', { exact: true }).fill(name);
  await dialog.getByLabel('SKU').fill(sku);
  await dialog.getByLabel('Costo promedio').fill('25');
  await dialog.getByLabel('Existencia', { exact: true }).fill('2');
  await dialog.getByRole('button', { name: 'Guardar', exact: true }).click();
  await expect(dialog.getByRole('alert')).toContainText('Elige un tamaño.');
  await dialog.getByLabel('Tamaño', { exact: true }).selectOption(small.id);
  await dialog.getByRole('button', { name: 'Guardar', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(name);
  await page.getByRole('button', { name: 'Agregar variante', exact: true }).click();
  await openedDialog(page);
  await dialog.getByLabel('Tamaño', { exact: true }).selectOption(medium.id);
  await dialog.getByLabel('SKU').fill(`${sku}-MD`);
  await dialog.getByLabel('Costo promedio').fill('40');
  await dialog.getByLabel('Existencia', { exact: true }).fill('0');
  await dialog.getByRole('button', { name: 'Guardar', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByText('Mediano', { exact: true })).toBeVisible();
  if (testInfo.project.name.includes('desktop'))
    await expect(page.locator('.variants th').first()).toHaveText('Tamaño');
  await expect(page.locator('html')).toHaveJSProperty(
    'scrollWidth',
    testInfo.project.use.viewport!.width,
  );
  await page.locator('main').evaluateAll((nodes) =>
    nodes.forEach((node) => {
      node.scrollTop = 0;
    }),
  );
  await page.screenshot({
    path: testInfo.outputPath('size-variants.png'),
    fullPage: true,
    animations: 'disabled',
    scale: 'css',
  });
  await page.goto('/catalogo');
  await page.getByRole('button', { name, exact: true }).click();
  await page.getByLabel('Tamaño', { exact: true }).selectOption(medium.id);
  await page.getByRole('button', { name: 'Solo con existencia' }).click();
  await expect(page.getByText('No hay artículos con estos filtros.')).toBeVisible();
  await page.getByLabel('Tamaño', { exact: true }).selectOption(small.id);
  await expect(page.getByRole('link').filter({ hasText: name })).toBeVisible();
  await page.locator('main').evaluateAll((nodes) =>
    nodes.forEach((node) => {
      node.scrollTop = 0;
    }),
  );
  await page.screenshot({
    path: testInfo.outputPath('size-filter.png'),
    fullPage: true,
    animations: 'disabled',
    scale: 'css',
  });
  await page.goto('/configuracion/tamanos');
  await page.getByRole('button', { name: 'Borrar Chico', exact: true }).click();
  await openedDialog(page);
  await dialog.getByRole('button', { name: 'Borrar', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole('alert')).toContainText('El tamaño está en uso');
});
