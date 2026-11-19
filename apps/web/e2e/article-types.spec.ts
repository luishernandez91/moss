import { randomUUID } from 'node:crypto';
import { expect, test, type Page } from '@playwright/test';
import { openedDialog } from './dialogs';

const created: string[] = [];

test.beforeEach(async ({ page }) => {
  const response = await page.request.post('/api/auth/login', {
    data: { email: process.env['E2E_AUTH_EMAIL'], password: process.env['E2E_AUTH_PASSWORD'] },
  });
  expect(response.ok()).toBe(true);
});

test.afterEach(async ({ page }) => {
  const response = await page.request.get('/api/article-types');
  if (!response.ok()) return;
  const types = (await response.json()) as { id: string; name: string }[];
  for (const type of types.filter((entry) => created.includes(entry.name))) {
    await page.request.delete(`/api/article-types/${type.id}`);
  }
});

async function saveDialog(page: Page): Promise<void> {
  await page.getByRole('dialog').getByRole('button', { name: 'Guardar' }).click();
}

async function addAttribute(
  page: Page,
  attribute: { name: string; dataType: string; unit?: string; options?: string; variant?: boolean },
): Promise<void> {
  await page.getByRole('button', { name: 'Nuevo atributo' }).click();
  await openedDialog(page);
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Nombre').fill(attribute.name);
  await dialog.getByLabel('Tipo de dato').selectOption({ label: attribute.dataType });
  if (attribute.unit) await dialog.getByLabel('Unidad').fill(attribute.unit);
  if (attribute.options) await dialog.getByLabel('Opciones').fill(attribute.options);
  if (attribute.variant) await dialog.getByRole('switch', { name: 'Define variante' }).click();
  await saveDialog(page);
  await expect(page.getByRole('dialog')).toHaveCount(0);
}

test('administra tipos de artículo y sus atributos', async ({ page }, testInfo) => {
  const typeName = `e2e ${testInfo.project.name} ${randomUUID().slice(0, 8)}`;
  created.push(typeName);

  await page.goto('/tipos-de-articulo');
  await expect(page.getByRole('heading', { name: 'Tipos de artículo', level: 1 })).toBeVisible();

  await page.getByRole('button', { name: 'Nuevo tipo' }).click();
  await openedDialog(page);
  await page.getByRole('dialog').getByLabel('Nombre').fill(typeName);
  await saveDialog(page);
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByRole('heading', { name: `Atributos de ${typeName}` })).toBeVisible();
  await expect(page.getByText('Este tipo aún no tiene atributos.')).toBeVisible();

  await addAttribute(page, {
    name: 'Forma',
    dataType: 'Lista',
    options: 'redonda, cuadrada, hexagonal',
    variant: true,
  });
  await addAttribute(page, { name: 'Diámetro', dataType: 'Número', unit: 'cm', variant: true });
  await addAttribute(page, { name: 'Drenaje', dataType: 'Sí/No' });
  await expect(page.getByText('redonda, cuadrada, hexagonal')).toBeVisible();
  await expect(page.getByText('2 atributos definen variante: forma × diámetro.')).toBeVisible();
  await expect(
    page.getByRole('button', { name: new RegExp(`^${typeName}`) }).getByText('3', { exact: true }),
  ).toBeVisible();

  // Un nombre distinto con la misma clave generada se rechaza con un mensaje claro.
  await page.getByRole('button', { name: 'Nuevo atributo' }).click();
  await openedDialog(page);
  await page.getByRole('dialog').getByLabel('Nombre').fill('Diametro');
  await page.getByRole('dialog').getByLabel('Tipo de dato').selectOption({ label: 'Número' });
  await saveDialog(page);
  await expect(page.getByRole('dialog').getByRole('alert')).toHaveText(
    '«Diametro» genera la clave «diametro», que ya usa el atributo «Diámetro».',
  );
  await page.getByRole('dialog').getByRole('button', { name: 'Cancelar' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);

  await page.getByRole('switch', { name: 'Define variante: Forma' }).click();
  await expect(page.getByText('1 atributo define variante: diámetro.')).toBeVisible();

  await page.getByRole('button', { name: 'Editar Drenaje' }).click();
  await openedDialog(page);
  await page.getByRole('dialog').getByRole('switch', { name: 'Activo' }).click();
  await saveDialog(page);
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByText('Inactivo')).toBeVisible();

  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
  await page.screenshot({
    path: testInfo.outputPath(`tipos-de-articulo-${testInfo.project.name}.png`),
    fullPage: true,
  });

  await page.getByRole('button', { name: 'Acciones del tipo' }).click();
  await page.getByRole('menuitem', { name: 'Borrar tipo' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Borrar' }).click();
  await expect(page.getByRole('heading', { name: `Atributos de ${typeName}` })).toHaveCount(0);
  await expect(page.getByRole('button', { name: new RegExp(`^${typeName}`) })).toHaveCount(0);
});
