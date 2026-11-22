import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';
import type { ArticleDetail, ArticleType, Size } from '@moss/contracts';
import { openedDialog } from './dialogs';

const typeIds: string[] = [];
const sizeIds: string[] = [];
test.afterEach(() => {
  execFileSync(
    process.execPath,
    ['test/type-dimensions-cleanup.mjs', JSON.stringify({ typeIds, sizeIds })],
    { cwd: '../api', stdio: 'pipe' },
  );
  typeIds.length = 0;
  sizeIds.length = 0;
});

test('C6 agrega dimensiones y activa tamaños sin cambiar costos', async ({ page }, info) => {
  await page.request.post('/api/auth/login', {
    data: { email: process.env['E2E_AUTH_EMAIL'], password: process.env['E2E_AUTH_PASSWORD'] },
  });
  const name = `C6 ${info.project.name} ${randomUUID().slice(0, 8)}`;
  const t = (await (
    await page.request.post('/api/article-types', { data: { name } })
  ).json()) as ArticleType;
  typeIds.push(t.id);
  const a = (await (
    await page.request.post('/api/articles', {
      data: {
        articleTypeId: t.id,
        name: 'Artículo de revisión',
        stockUnit: 'piece',
        sold: true,
        usedInRecipes: true,
        variants: [
          {
            sku: `C6-${randomUUID().slice(0, 8)}`,
            attributes: {},
            sizeId: null,
            averageCost: 1350,
            price: 2000,
            stock: 2,
          },
        ],
      },
    })
  ).json()) as ArticleDetail;
  await page.request.patch(`/api/articles/${a.id}`, { data: { active: false } });
  await page.request.patch(`/api/articles/${a.id}/variants/${a.variants[0]!.id}`, {
    data: { active: false },
  });
  const size = (await (
    await page.request.post('/api/sizes', {
      data: { key: `c6_${randomUUID().replaceAll('-', '')}`, label: 'C6 Chico' },
    })
  ).json()) as Size;
  sizeIds.push(size.id);
  const history = await (
    await page.request.get(`/api/articles/${a.id}/variants/${a.variants[0]!.id}/cost-history`)
  ).json();
  await page.goto('/tipos-de-articulo');
  await page.getByRole('button', { name: new RegExp(`^${name}`) }).click();
  for (const [label, kind, value, variant] of [
    ['Origen', 'text', 'Local', false],
    ['Lote', 'number', '0', false],
    ['Acabado', 'list', 'mate', true],
    ['Natural', 'boolean', 'false', false],
  ] as const) {
    await page.getByRole('button', { name: 'Nuevo atributo' }).click();
    await openedDialog(page);
    const dialog = page.getByRole('dialog');
    await dialog.getByLabel('Nombre', { exact: true }).fill(label);
    await dialog.getByLabel('Tipo de dato').selectOption(kind);
    if (kind === 'list') await dialog.getByLabel('Opciones').fill('mate, brillante');
    if (variant) await dialog.getByRole('switch', { name: 'Define variante' }).click();
    await expect(dialog.getByRole('button', { name: 'Guardar' })).toBeDisabled();
    if (kind === 'boolean' || kind === 'list')
      await dialog.getByLabel('Valor inicial').selectOption(value);
    else await dialog.getByLabel('Valor inicial').fill(value);
    if (label === 'Natural')
      await page.screenshot({
        path: info.outputPath(`C6-atributo-${info.project.name}.png`),
        fullPage: true,
        scale: 'css',
      });
    await dialog.getByRole('button', { name: 'Guardar' }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
  }
  await page.getByRole('button', { name: 'Acciones del tipo' }).click();
  await page.getByRole('menuitem', { name: 'Activar tamaños' }).click();
  await openedDialog(page);
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('button', { name: 'Activar tamaños' })).toBeDisabled();
  await dialog.getByLabel('Tamaño inicial').selectOption(size.id);
  expect(await dialog.evaluate((el) => el.scrollWidth - el.clientWidth)).toBeLessThanOrEqual(0);
  await page.screenshot({
    path: info.outputPath(`C6-tamano-${info.project.name}.png`),
    fullPage: true,
    scale: 'css',
  });
  await dialog.getByRole('button', { name: 'Activar tamaños' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByText('Usa tamaño', { exact: true })).toBeVisible();
  const after = (await (await page.request.get(`/api/articles/${a.id}`)).json()) as ArticleDetail;
  expect(after.fixedAttributes).toEqual({ origen: 'Local', lote: 0, natural: false });
  expect(after.variants[0]).toEqual({
    ...a.variants[0],
    active: false,
    sizeId: size.id,
    attributes: { acabado: 'mate' },
  });
  expect(
    await (
      await page.request.get(`/api/articles/${a.id}/variants/${a.variants[0]!.id}/cost-history`)
    ).json(),
  ).toEqual(history);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    ),
  ).toBeLessThanOrEqual(0);
  await page.screenshot({
    path: info.outputPath(`C6-pantalla-${info.project.name}.png`),
    fullPage: true,
    scale: 'css',
  });
  await page.goto(`/catalogo/${a.id}`);
  await page.getByRole('button', { name: 'Acciones del artículo' }).click();
  await page.getByRole('menuitem', { name: 'Editar artículo' }).click();
  await openedDialog(page);
  await page.getByRole('dialog').getByLabel('Nombre', { exact: true }).fill('Captura conservada');
  const added = await page.request.post(`/api/article-types/${t.id}/attribute-dimensions`, {
    data: {
      attribute: { name: 'Control', dataType: 'text', required: false, definesVariant: false },
      initialValue: 'Inicial',
    },
  });
  expect(added.status()).toBe(201);
  await page.getByRole('dialog').getByRole('button', { name: 'Guardar' }).click();
  await expect(page.getByRole('dialog').getByRole('alert')).toContainText('Recarga');
  await expect(page.getByRole('dialog').getByRole('button', { name: 'Guardar' })).toBeDisabled();
  await page.getByRole('dialog').getByRole('button', { name: 'Recargar datos' }).click();
  await expect(page.getByRole('dialog').getByLabel('Control', { exact: true })).toHaveValue(
    'Inicial',
  );
  await expect(page.getByRole('dialog').getByLabel('Nombre', { exact: true })).toHaveValue(
    'Captura conservada',
  );
  await page.getByRole('dialog').getByRole('button', { name: 'Guardar' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.getByRole('button', { name: 'Mostrar inactivas' }).click();
  await page.getByRole('button', { name: `Editar ${a.variants[0]!.sku}`, exact: true }).click();
  await openedDialog(page);
  expect(
    (
      await page.request.post(`/api/article-types/${t.id}/attribute-dimensions`, {
        data: {
          attribute: { name: 'Serie', dataType: 'text', required: true, definesVariant: true },
          initialValue: 'A',
        },
      })
    ).status(),
  ).toBe(201);
  await page.getByRole('dialog').getByRole('button', { name: 'Guardar' }).click();
  await expect(page.getByRole('dialog').getByRole('alert')).toContainText('Recarga');
  await page.getByRole('dialog').getByRole('button', { name: 'Recargar datos' }).click();
  await expect(page.getByRole('dialog').getByLabel('Serie', { exact: true })).toHaveValue('A');
  await page.getByRole('dialog').getByRole('button', { name: 'Guardar' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(
    await (
      await page.request.get(`/api/articles/${a.id}/variants/${a.variants[0]!.id}/cost-history`)
    ).json(),
  ).toEqual(history);
});
