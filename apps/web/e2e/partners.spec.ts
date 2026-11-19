import { expect, test } from '@playwright/test';
import type { Partner } from '@moss/contracts';

test.describe.configure({ mode: 'serial' });
let original: Partner[];
test.beforeEach(async ({ page }) => {
  const login = await page.request.post('/api/auth/login', {
    data: { email: process.env['E2E_AUTH_EMAIL'], password: process.env['E2E_AUTH_PASSWORD'] },
  });
  expect(login.ok()).toBe(true);
  const response = await page.request.get('/api/partners');
  expect(response.ok()).toBe(true);
  original = (await response.json()) as Partner[];
  expect(original).toHaveLength(2);
});
test.afterEach(async ({ page }) => {
  if (!original) return;
  const currentResponse = await page.request.get('/api/partners');
  expect(currentResponse.ok()).toBe(true);
  const current = (await currentResponse.json()) as Partner[];
  const response = await page.request.put('/api/partners', {
    data: {
      partners: original.map((p) => ({
        ...p,
        version: current.find((c) => c.id === p.id)!.version,
      })),
    },
  });
  expect(response.ok()).toBe(true);
});

test('edita socios, exige porcentajes enteros y muestra aviso antes de guardar', async ({
  page,
}, testInfo) => {
  await page.goto('/socios');
  await expect(page.getByRole('heading', { name: 'Socios', exact: true })).toBeVisible();
  await expect(page.getByText('Aún no hay cierres registrados.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Editar participación' })).toBeEnabled();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    ),
  ).toBeLessThanOrEqual(0);
  await page.screenshot({
    path: testInfo.outputPath(`socios-${testInfo.project.name}.png`),
    fullPage: true,
    scale: 'css',
    animations: 'disabled',
  });
  await page.getByRole('button', { name: 'Editar participación' }).click();
  const dialog = page.getByRole('dialog');
  await expect(
    dialog.getByText(
      'El cambio aplicará al cierre de todas las campañas que aún no estén cerradas. Los cierres ya registrados no cambian.',
    ),
  ).toBeVisible();
  const first = dialog.getByLabel('Ganancia % del socio 1');
  const second = dialog.getByLabel('Ganancia % del socio 2');
  const save = dialog.getByRole('button', { name: 'Guardar cambios' });
  await first.fill('50.5');
  await expect(save).toBeDisabled();
  await expect(dialog.getByRole('alert')).toHaveText('Usa porcentajes enteros entre 0 y 100.');
  await first.fill('37');
  await second.fill('50');
  await expect(save).toBeDisabled();
  await expect(dialog.getByRole('alert')).toHaveText('Las participaciones deben sumar 100%.');
  await second.fill('63');
  await dialog.getByLabel('Nombre del socio 1', { exact: true }).fill('Socio editado');
  await expect(save).toBeEnabled();
  await dialog.screenshot({
    scale: 'css',
    animations: 'disabled',
    path: testInfo.outputPath(`editor-${testInfo.project.name}.png`),
  });
  await save.click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Socio editado', exact: true })).toBeVisible();
  await expect(page.getByText('Ganancia 37%', { exact: true })).toBeVisible();
  await expect(page.getByText('Ganancia 63%', { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByText('Ganancia 37%', { exact: true })).toBeVisible();
});

test('un conflicto conserva la captura y exige recargar y revisar antes de reenviar', async ({
  page,
}) => {
  await page.goto('/socios');
  await page.getByRole('button', { name: 'Editar participación' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Nombre del socio 1', { exact: true }).fill('Mi captura');
  const changed = await page.request.put('/api/partners', {
    data: { partners: original.map((p) => ({ ...p, name: `${p.name} concurrente` })) },
  });
  expect(changed.ok()).toBe(true);
  await dialog.getByRole('button', { name: 'Guardar cambios' }).click();
  await expect(dialog.getByRole('alert')).toContainText('Otro usuario modificó los socios.');
  await expect(dialog.getByLabel('Nombre del socio 1', { exact: true })).toHaveValue('Mi captura');
  await expect(dialog.getByRole('button', { name: 'Guardar cambios' })).toBeDisabled();
  await dialog.getByRole('button', { name: 'Recargar datos actuales' }).click();
  await expect(dialog.getByRole('status')).toContainText('concurrente');
  await expect(dialog.getByLabel('Nombre del socio 1', { exact: true })).toHaveValue('Mi captura');
  await dialog.getByRole('button', { name: 'Guardar cambios' }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Mi captura', exact: true })).toBeVisible();
});
