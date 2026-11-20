import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { eq, inArray, like } from 'drizzle-orm';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import type { Campaign, CampaignType } from '@moss/contracts';
import type { Clock } from '@moss/domain';
import { AppModule } from '../src/app.module.js';
import { CLOCK } from '../src/campaigns/clock.js';
import { DATABASE, type Database } from '../src/database/database.module.js';
import { campaignEvents, campaignTypes, campaigns, partners } from '../src/database/schema.js';
import { issueSession, SESSION_COOKIE } from '../src/auth/session.js';
import { loadEnvFile } from '../src/config/load-env-file.js';
import { postgresErrorCode } from '../src/common/domain-errors.js';
import { preparePartners } from './partners-fixture.js';

loadEnvFile();
if (process.env.DATABASE_URL_TEST) process.env.DATABASE_URL = process.env.DATABASE_URL_TEST;
process.env.SESSION_SECRET = 'solo-pruebas-api-no-usar-en-produccion';

/** Hoy es 20 nov 2026 en Ciudad de México. */
const clock: Clock = { now: () => new Date('2026-11-20T18:00:00Z') };

describe('campañas (PostgreSQL real)', () => {
  let app: INestApplication<App>;
  let db: Database;
  let cookie: string;
  let userId: string;
  let partnerId: string;
  const prefix = `e2e-${randomUUID().slice(0, 8)}`;
  /** Tipos propios de la suite: la base de pruebas es compartida entre corridas. */
  let season: string;
  let event: string;

  const api = () => request(app.getHttpServer());
  const get = (path: string) => api().get(path).set('Cookie', cookie);
  const post = (path: string, body: object = {}) =>
    api().post(path).set('Cookie', cookie).send(body);

  async function draft(
    name: string,
    typeId: string,
    dates: { startDate?: string | null; endDate?: string | null } = {},
  ): Promise<Campaign> {
    const response = await post('/api/campaigns', {
      name: `${prefix} ${name}`,
      campaignTypeId: typeId,
      budget: 300000,
      ...dates,
    });
    expect(response.status, JSON.stringify(response.body)).toBe(201);
    return response.body as Campaign;
  }

  async function scheduled(name: string, typeId: string, startDate: string, endDate: string) {
    const campaign = await draft(name, typeId, { startDate, endDate });
    const response = await post(`/api/campaigns/${campaign.id}/schedule`);
    expect(response.status, JSON.stringify(response.body)).toBe(200);
    return response.body as Campaign;
  }

  const eventsOf = (campaignId: string) =>
    db.select().from(campaignEvents).where(eq(campaignEvents.campaignId, campaignId));

  beforeAll(async () => {
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(CLOCK)
      .useValue(clock)
      .compile();
    app = module.createNestApplication();
    app.setGlobalPrefix('api');
    await app.init();
    db = module.get(DATABASE);
    const user = await preparePartners(db);
    userId = user.id;
    [{ id: partnerId }] = (await db
      .select({ id: partners.id })
      .from(partners)
      .where(eq(partners.userId, user.id))) as [{ id: string }];
    cookie = `${SESSION_COOKIE}=${issueSession(user.id, user.sessionVersion, process.env.SESSION_SECRET!)}`;
    [{ id: season }] = (await db
      .insert(campaignTypes)
      .values({ name: `${prefix} Temporada`, allowsOverlap: false })
      .returning({ id: campaignTypes.id })) as [{ id: string }];
    [{ id: event }] = (await db
      .insert(campaignTypes)
      .values({ name: `${prefix} Evento`, allowsOverlap: true })
      .returning({ id: campaignTypes.id })) as [{ id: string }];
  });

  afterAll(async () => {
    if (db) {
      const ids = (
        await db
          .select({ id: campaigns.id })
          .from(campaigns)
          .where(like(campaigns.name, `${prefix}%`))
      ).map((row) => row.id);
      if (ids.length > 0) {
        await db.delete(campaignEvents).where(inArray(campaignEvents.campaignId, ids));
        await db.delete(campaigns).where(inArray(campaigns.id, ids));
      }
      await db.delete(campaignTypes).where(like(campaignTypes.name, `${prefix}%`));
    }
    await app?.close();
  });

  it('exige sesión', async () => {
    const id = randomUUID();
    for (const response of await Promise.all([
      api().get('/api/campaigns'),
      api().get('/api/campaign-types'),
      api().post('/api/campaigns').send({}),
      api().post(`/api/campaigns/${id}/schedule`).send({}),
    ])) {
      expect(response.status).toBe(401);
    }
  });

  it('los tipos sembrados son Temporada (sin empalme) y Evento (con empalme)', async () => {
    const response = await get('/api/campaign-types');
    expect(response.status).toBe(200);
    const types = response.body as CampaignType[];
    expect(types).toContainEqual(
      expect.objectContaining({ name: 'Temporada', allowsOverlap: false }),
    );
    expect(types).toContainEqual(expect.objectContaining({ name: 'Evento', allowsOverlap: true }));
  });

  it('crea borradores con o sin fechas; un borrador no valida el rango (D4)', async () => {
    const withoutDates = await draft('Sin fechas', season);
    expect(withoutDates).toMatchObject({
      status: 'draft',
      startDate: null,
      endDate: null,
      budget: 300000,
      reinvestmentPercent: 0,
      notes: null,
      type: { id: season, allowsOverlap: false },
    });
    const inverted = await draft('Fechas invertidas', season, {
      startDate: '2026-12-31',
      endDate: '2026-12-01',
    });
    expect(inverted.status).toBe('draft');
    expect(await eventsOf(withoutDates.id)).toEqual([]);
  });

  it('valida la forma (400) y el tipo (404)', async () => {
    expect(
      (await post('/api/campaigns', { name: 'x', campaignTypeId: season, budget: 1.5 })).status,
    ).toBe(400);
    const unknown = await post('/api/campaigns', {
      name: 'x',
      campaignTypeId: randomUUID(),
      budget: 0,
    });
    expect(unknown.status).toBe(404);
    expect(unknown.body).toMatchObject({ code: 'CAMPAIGN_TYPE_NOT_FOUND' });
    expect((await post(`/api/campaigns/${randomUUID()}/schedule`)).status).toBe(404);
  });

  it('programar registra exactamente un evento en la misma transacción', async () => {
    const campaign = await draft('Reyes', season, {
      startDate: '2027-01-02',
      endDate: '2027-01-06',
    });
    const response = await post(`/api/campaigns/${campaign.id}/schedule`, { reason: ' listo ' });
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ id: campaign.id, status: 'scheduled' });
    expect(await eventsOf(campaign.id)).toEqual([
      expect.objectContaining({
        type: 'schedule',
        fromStatus: 'draft',
        toStatus: 'scheduled',
        payload: { reason: 'listo', userId, partnerId },
      }),
    ]);
    // Programar otra vez no está permitido y no agrega eventos.
    const again = await post(`/api/campaigns/${campaign.id}/schedule`);
    expect(again.status).toBe(422);
    expect(again.body).toMatchObject({ code: 'TRANSITION_NOT_ALLOWED' });
    expect(await eventsOf(campaign.id)).toHaveLength(1);
  });

  it('programar sin fechas o con rango inválido es 422 y no crea evento', async () => {
    const missing = await draft('Sin fin', season, { startDate: '2027-02-01' });
    const missingResponse = await post(`/api/campaigns/${missing.id}/schedule`);
    expect(missingResponse.status).toBe(422);
    expect(missingResponse.body).toMatchObject({ code: 'MISSING_DATES' });
    const inverted = await draft('Invertida', season, {
      startDate: '2027-03-10',
      endDate: '2027-03-01',
    });
    expect((await post(`/api/campaigns/${inverted.id}/schedule`)).body).toMatchObject({
      code: 'INVALID_DATE_RANGE',
    });
    expect([...(await eventsOf(missing.id)), ...(await eventsOf(inverted.id))]).toEqual([]);
  });

  it('dos temporadas empalmadas: 409 que nombra la otra campaña y sin evento (§10)', async () => {
    const first = await scheduled('Nochebuena', season, '2027-12-10', '2027-12-31');
    const second = await draft('Diciembre', season, {
      startDate: '2027-12-01',
      endDate: '2027-12-15',
    });
    const response = await post(`/api/campaigns/${second.id}/schedule`);
    expect(response.status).toBe(409);
    expect(response.body).toEqual({
      code: 'OVERLAP',
      message: `Las fechas del 2027-12-01 al 2027-12-15 se empalman con «${prefix} Nochebuena» (del 2027-12-10 al 2027-12-31), del mismo tipo.`,
      details: {
        conflicts: [
          {
            id: first.id,
            name: `${prefix} Nochebuena`,
            type: season,
            startDate: '2027-12-10',
            endDate: '2027-12-31',
          },
        ],
      },
    });
    expect(await eventsOf(second.id)).toEqual([]);
  });

  it('dos eventos empalmados se programan sin error', async () => {
    await scheduled('Boda', event, '2028-05-10', '2028-05-12');
    await scheduled('Bautizo', event, '2028-05-11', '2028-05-11');
  });

  it('un evento y una temporada en las mismas fechas no chocan (§10)', async () => {
    await scheduled('Temporada mayo', season, '2028-06-01', '2028-06-30');
    await scheduled('Evento mayo', event, '2028-06-01', '2028-06-30');
  });

  it('borradores, canceladas y cerradas no participan en el empalme', async () => {
    await draft('Borrador encimado', season, { startDate: '2029-01-01', endDate: '2029-01-31' });
    await db.insert(campaigns).values([
      {
        name: `${prefix} Cancelada`,
        campaignTypeId: season,
        allowsOverlap: false,
        budget: 0,
        status: 'cancelled',
        startDate: '2029-01-01',
        endDate: '2029-01-31',
      },
      {
        name: `${prefix} Cerrada`,
        campaignTypeId: season,
        allowsOverlap: false,
        budget: 0,
        status: 'closed',
        startDate: '2029-01-01',
        endDate: '2029-01-31',
      },
    ]);
    await scheduled('Enero', season, '2029-01-10', '2029-01-20');
  });

  it('la base rechaza con EXCLUDE un empalme que no pasó por el dominio, e ignora los eventos', async () => {
    const values = {
      campaignTypeId: season,
      allowsOverlap: false,
      budget: 0,
      status: 'scheduled' as const,
    };
    await db.insert(campaigns).values({
      ...values,
      name: `${prefix} Directa 1`,
      startDate: '2030-01-01',
      endDate: '2030-01-10',
    });
    let caught: unknown;
    try {
      await db.insert(campaigns).values({
        ...values,
        name: `${prefix} Directa 2`,
        startDate: '2030-01-10',
        endDate: '2030-01-20',
      });
    } catch (error) {
      caught = error;
    }
    expect(postgresErrorCode(caught)).toBe('23P01');
    const events = { ...values, campaignTypeId: event, allowsOverlap: true };
    await db.insert(campaigns).values([
      {
        ...events,
        name: `${prefix} Evento directo 1`,
        startDate: '2030-01-01',
        endDate: '2030-01-10',
      },
      {
        ...events,
        name: `${prefix} Evento directo 2`,
        startDate: '2030-01-05',
        endDate: '2030-01-08',
      },
    ]);
  });

  it('la FK compuesta mantiene allows_overlap igual al del tipo', async () => {
    let caught: unknown;
    try {
      await db.insert(campaigns).values({
        name: `${prefix} Incoherente`,
        campaignTypeId: season,
        allowsOverlap: true,
        budget: 0,
      });
    } catch (error) {
      caught = error;
    }
    expect(postgresErrorCode(caught)).toBe('23503');
    const [type] = await db
      .insert(campaignTypes)
      .values({ name: `${prefix} Feria`, allowsOverlap: false })
      .returning();
    const campaign = await draft('Feria 1', type!.id);
    await db
      .update(campaignTypes)
      .set({ allowsOverlap: true })
      .where(eq(campaignTypes.id, type!.id));
    const [row] = await db.select().from(campaigns).where(eq(campaigns.id, campaign.id));
    expect(row!.allowsOverlap).toBe(true);
  });

  it('dos programaciones simultáneas que se empalman: una gana, la otra recibe 409 y no deja evento', async () => {
    const a = await draft('Carrera A', season, { startDate: '2031-03-01', endDate: '2031-03-10' });
    const b = await draft('Carrera B', season, { startDate: '2031-03-05', endDate: '2031-03-15' });
    const responses = await Promise.all([
      post(`/api/campaigns/${a.id}/schedule`),
      post(`/api/campaigns/${b.id}/schedule`),
    ]);
    expect(responses.map((response) => response.status).sort((a, b) => a - b)).toEqual([200, 409]);
    const loser = responses.find((response) => response.status === 409)!;
    expect(loser.body).toMatchObject({ code: 'OVERLAP' });
    expect([...(await eventsOf(a.id)), ...(await eventsOf(b.id))]).toHaveLength(1);
  });

  it('la lista deriva el estado con el reloj, filtra y ordena (pantalla 11)', async () => {
    const active = await scheduled('Lista activa', season, '2026-11-01', '2026-11-25');
    const closing = await scheduled('Lista por cerrar', season, '2026-10-01', '2026-10-31');
    const future = await scheduled('Lista programada', season, '2026-12-01', '2026-12-05');
    const pending = await draft('Lista borrador', season);
    const [closed] = await db
      .insert(campaigns)
      .values({
        name: `${prefix} Lista cerrada`,
        campaignTypeId: season,
        allowsOverlap: false,
        budget: 0,
        status: 'closed',
        startDate: '2026-01-01',
        endDate: '2026-01-31',
      })
      .returning({ id: campaigns.id });
    const mine = (rows: Campaign[]) => rows.filter((row) => row.name.startsWith(`${prefix} Lista`));

    const all = mine((await get('/api/campaigns')).body as Campaign[]);
    expect(all.map((row) => [row.id, row.status])).toEqual([
      [active.id, 'active'],
      [closing.id, 'closing'],
      [future.id, 'scheduled'],
      [pending.id, 'draft'],
      [closed!.id, 'closed'],
    ]);
    expect(
      mine((await get('/api/campaigns?status=active')).body as Campaign[]).map((row) => row.id),
    ).toEqual([active.id]);
    expect(
      mine((await get('/api/campaigns?awaitingClose=true')).body as Campaign[]).map(
        (row) => row.id,
      ),
    ).toEqual([active.id, closing.id, future.id, pending.id]);
    expect((await get('/api/campaigns?status=activa')).status).toBe(400);
  });
});
