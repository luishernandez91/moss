import { randomUUID } from 'node:crypto';
import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import { openedDialog } from './dialogs';

test.beforeEach(async ({ page }) => {
  const response = await page.request.post('/api/auth/login', {
    data: { email: process.env['E2E_AUTH_EMAIL'], password: process.env['E2E_AUTH_PASSWORD'] },
  });
  expect(response.ok()).toBe(true);
});

/** Fecha de negocio a `days` días de hoy en Ciudad de México (el servidor usa el reloj real). */
function businessDay(days: number): string {
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Mexico_City' }).format(
    new Date(),
  );
  const date = new Date(`${today}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

async function createCampaign(
  request: APIRequestContext,
  body: { name: string; campaignTypeId: string; startDate?: string; endDate?: string },
  schedule: boolean,
): Promise<string> {
  const created = await request.post('/api/campaigns', { data: { budget: 150000, ...body } });
  expect(created.status()).toBe(201);
  const { id } = (await created.json()) as { id: string };
  if (schedule)
    expect((await request.post(`/api/campaigns/${id}/schedule`, { data: {} })).status()).toBe(200);
  return id;
}

async function noHorizontalOverflow(page: Page): Promise<void> {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
}

test('lista de campañas con filtro por estado, línea de tiempo y campañas afectadas en socios', async ({
  page,
  isMobile,
}, testInfo) => {
  const tag = `e2e ${testInfo.project.name} ${randomUUID().slice(0, 6)}`;
  const types = (await (await page.request.get('/api/campaign-types')).json()) as {
    id: string;
    name: string;
  }[];
  const evento = types.find((type) => type.name === 'Evento')!.id;
  const temporada = types.find((type) => type.name === 'Temporada')!.id;
  // Eventos: pueden empalmarse, así que las corridas anteriores en la misma base no estorban.
  await createCampaign(
    page.request,
    {
      name: `${tag} Activa`,
      campaignTypeId: evento,
      startDate: businessDay(-5),
      endDate: businessDay(20),
    },
    true,
  );
  await createCampaign(
    page.request,
    {
      name: `${tag} Programada`,
      campaignTypeId: evento,
      startDate: businessDay(40),
      endDate: businessDay(45),
    },
    true,
  );
  await createCampaign(page.request, { name: `${tag} Borrador`, campaignTypeId: temporada }, false);

  await page.goto('/campanas');
  await expect(page.getByRole('heading', { name: 'Campañas', level: 1 })).toBeVisible();
  const card = (name: string) =>
    page.locator('.campaign-card').filter({ hasText: `${tag} ${name}` });
  await expect(card('Activa')).toContainText('Activa');
  await expect(card('Activa')).toContainText('Evento');
  await expect(card('Programada')).toContainText('Programada');
  await expect(card('Borrador')).toContainText('Sin fechas');
  await expect(card('Activa').locator('dd')).toHaveText(['—', '—', '—']);
  await expect(page.getByRole('button', { name: 'Nueva campaña' })).toHaveCount(0);

  const statuses = page.getByRole('group', { name: 'Estado' });
  await statuses.getByRole('button', { name: 'Activa', exact: true }).click();
  await expect(card('Activa')).toBeVisible();
  await expect(card('Programada')).toHaveCount(0);
  await statuses.getByRole('button', { name: 'Todas' }).click();
  await expect(card('Programada')).toBeVisible();

  if (!isMobile) {
    await page
      .getByRole('group', { name: 'Vista' })
      .getByRole('button', { name: 'Línea de tiempo' })
      .click();
    await expect(page.locator('.timeline-bar', { hasText: `${tag} Activa` })).toBeVisible();
    await expect(page.locator('.timeline-bar', { hasText: `${tag} Borrador` })).toHaveCount(0);
  } else {
    await expect(page.getByRole('heading', { name: 'Línea de tiempo' })).toBeVisible();
    await expect(page.locator('.month-item', { hasText: `${tag} Activa` }).first()).toBeVisible();
  }
  await expect(
    page.getByText('Campañas del mismo tipo no se empalman, excepto eventos.'),
  ).toBeVisible();
  await noHorizontalOverflow(page);
  await page.screenshot({
    path: testInfo.outputPath(`campanas-${testInfo.project.name}.png`),
    fullPage: true,
  });

  // S1: el editor de participación lista por nombre y estado las campañas que aún no se cierran.
  await page.goto('/socios');
  await page.getByRole('button', { name: 'Editar participación' }).click();
  const dialog = await openedDialog(page);
  const affected = dialog.getByRole('region', { name: 'Campañas que aún no se cierran' });
  await expect(affected).toContainText(`${tag} Activa · Activa`);
  await expect(affected).toContainText(`${tag} Programada · Programada`);
  await expect(affected).toContainText(`${tag} Borrador · Borrador`);
  await dialog.getByRole('button', { name: 'Cancelar' }).click();
});
