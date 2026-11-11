import { expect, test } from '@playwright/test';

test('abre el dashboard y navega a Campañas', async ({ page, isMobile }) => {
  await page.goto('/');
  await expect(page).toHaveURL(/\/inicio$/);
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();

  const nav = page.getByRole('navigation', { name: 'Navegación principal' });
  await nav.getByRole('link', { name: 'Campañas' }).click();
  await expect(page.getByRole('heading', { name: 'Campañas' })).toBeVisible();
  await expect(page.getByText('historia K1')).toBeVisible();

  if (isMobile) {
    await nav.getByRole('link', { name: 'Más' }).click();
    await expect(page.getByRole('link', { name: 'Configuración' })).toBeVisible();
  }
});

test('la página no se desborda horizontalmente', async ({ page }) => {
  await page.goto('/inicio');
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
});
