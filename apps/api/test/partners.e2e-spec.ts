import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { asc, eq, sql } from 'drizzle-orm';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import type { Partner } from '@moss/contracts';
import { AppModule } from '../src/app.module.js';
import { DATABASE, type Database } from '../src/database/database.module.js';
import { partners, users } from '../src/database/schema.js';
import { loadEnvFile } from '../src/config/load-env-file.js';
import { setPassword } from '../src/auth/set-password.js';
import { verifyPassword } from '../src/auth/password.js';
import { issueSession, SESSION_COOKIE } from '../src/auth/session.js';
import { preparePartners, TEST_PARTNER_EMAIL, TEST_PARTNER_PASSWORD } from './partners-fixture.js';
loadEnvFile();
if (process.env.DATABASE_URL_TEST) process.env.DATABASE_URL = process.env.DATABASE_URL_TEST;
process.env.SESSION_SECRET = 'solo-pruebas-api-no-usar-en-produccion';

describe('socios (PostgreSQL real)', () => {
  let app: INestApplication<App>;
  let db: Database;
  let cookie: string;
  let original: Partner[];
  beforeAll(async () => {
    const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = module.createNestApplication();
    app.setGlobalPrefix('api');
    await app.init();
    db = module.get(DATABASE);
    await preparePartners(db);
  });
  beforeEach(async () => {
    const [user] = await db.select().from(users).where(eq(users.email, TEST_PARTNER_EMAIL));
    cookie = `${SESSION_COOKIE}=${issueSession(user!.id, user!.sessionVersion, process.env.SESSION_SECRET!)}`;
    original = await list();
  });
  afterEach(async () => {
    if (original)
      await db.transaction(async (tx) => {
        await tx.select().from(partners).orderBy(asc(partners.id)).for('update');
        for (const p of original)
          await tx
            .update(partners)
            .set({ name: p.name, shareBps: p.shareBps, version: sql`${partners.version} + 1` })
            .where(eq(partners.id, p.id));
      });
  });
  afterAll(async () => {
    await app?.close();
  });
  const api = () => request(app.getHttpServer());
  const list = async (): Promise<Partner[]> =>
    (await api().get('/api/partners').set('Cookie', cookie).expect(200)).body as Partner[];
  const put = (rows: Partner[]) =>
    api().put('/api/partners').set('Cookie', cookie).send({ partners: rows });

  it('protege los dos endpoints y devuelve solo datos públicos', async () => {
    await api().get('/api/partners').expect(401);
    await api().put('/api/partners').send({ partners: original }).expect(401);
    expect(original).toHaveLength(2);
    expect(Object.keys(original[0]!).sort()).toEqual(['id', 'name', 'shareBps', 'version']);
  });
  it('guarda nombres y participación de ambos socios, incrementando versiones', async () => {
    const changes = original.map((p, i) => ({
      ...p,
      name: ` Editado ${i} `,
      shareBps: i ? 6300 : 3700,
    }));
    const saved = (await put(changes).expect(200)).body as Partner[];
    expect(saved).toEqual(
      changes.map((p) => ({ ...p, name: p.name.trim(), version: p.version + 1 })),
    );
    expect(await list()).toEqual(saved);
  });
  it('rechaza decimales, sumas inválidas e IDs repetidos sin escritura parcial', async () => {
    await put(original.map((p, i) => (i ? p : { ...p, shareBps: 5050 }))).expect(400);
    await put(original.map((p) => ({ ...p, shareBps: 4000 }))).expect(422);
    await put([original[0]!, original[0]!]).expect(422);
    expect(await list()).toEqual(original);
  });
  it.each([0, 1])('detecta solo la versión obsoleta del socio %i', async (index) => {
    const edited = original.map((p) => ({ ...p, name: `${p.name} nuevo` }));
    const saved = (await put(edited).expect(200)).body as Partner[];
    const stale = saved.map((p, i) => (i === index ? { ...p, version: original[i]!.version } : p));
    expect((await put(stale).expect(409)).body.code).toBe('PARTNERS_CHANGED');
    expect(await list()).toEqual(saved);
  });
  it('dos PUT concurrentes con las mismas versiones: uno guarda y el otro recibe 409', async () => {
    let unlock!: () => void;
    let locked!: () => void;
    const gate = new Promise<void>((resolve) => {
      unlock = resolve;
    });
    const ready = new Promise<void>((resolve) => {
      locked = resolve;
    });
    const blocker = db.transaction(async (tx) => {
      await tx.select().from(partners).orderBy(asc(partners.id)).for('update');
      locked();
      await gate;
    });
    await ready;
    const first = original.map((p, i) => ({ ...p, shareBps: i ? 6000 : 4000 }));
    const second = original.map((p, i) => ({ ...p, shareBps: i ? 3000 : 7000 }));
    const responses = Promise.all([put(first).then((r) => r), put(second).then((r) => r)]);
    try {
      await vi.waitFor(
        async () => {
          const waiting = await db.execute(
            sql`SELECT count(*)::int AS count FROM pg_stat_activity WHERE datname = current_database() AND wait_event_type = 'Lock' AND query LIKE '%partners%for update%'`,
          );
          expect(Number(waiting.rows[0]?.count)).toBeGreaterThanOrEqual(2);
        },
        { timeout: 5000, interval: 20 },
      );
    } finally {
      unlock();
      await blocker;
    }
    const results = await responses;
    expect(results.map((r) => r.status).sort((a, b) => a - b)).toEqual([200, 409]);
    const winner = results[0]!.status === 200 ? first : second;
    expect(await list()).toEqual(winner.map((p) => ({ ...p, version: p.version + 1 })));
  });
  it('las restricciones de BD rechazan rango, granularidad y versión negativos', async () => {
    for (const patch of [
      { shareBps: -100 },
      { shareBps: 10100 },
      { shareBps: 5050 },
      { version: -1 },
    ]) {
      await expect(
        db.update(partners).set(patch).where(eq(partners.id, original[0]!.id)),
      ).rejects.toThrow();
    }
    expect(await list()).toEqual(original);
  });
  it('el CLI rechaza una tercera alta y permite cambiar contraseña existente', async () => {
    const email = `third-${randomUUID()}@example.test`;
    await expect(setPassword(db, email, 'solo pruebas', 'Tercero')).rejects.toThrow(
      'Solo puede haber dos socios.',
    );
    expect(await db.select().from(users).where(eq(users.email, email))).toHaveLength(0);
    const [before] = await db.select().from(users).where(eq(users.email, TEST_PARTNER_EMAIL));
    try {
      await setPassword(db, TEST_PARTNER_EMAIL, 'contraseña nueva');
      const [after] = await db.select().from(users).where(eq(users.email, TEST_PARTNER_EMAIL));
      expect(after!.id).toBe(before!.id);
      expect(after!.sessionVersion).toBe(before!.sessionVersion + 1);
      expect(await verifyPassword('contraseña nueva', after!.passwordHash)).toBe(true);
      expect(await db.select().from(partners)).toHaveLength(2);
    } finally {
      await setPassword(db, TEST_PARTNER_EMAIL, TEST_PARTNER_PASSWORD);
    }
  });
});
