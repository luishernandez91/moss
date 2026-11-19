import { Controller, Get, type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { eq } from 'drizzle-orm';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { AppModule } from '../src/app.module.js';
import { DATABASE, type Database } from '../src/database/database.module.js';
import { users, partners } from '../src/database/schema.js';
import { setPassword } from '../src/auth/set-password.js';
import { LoginAttempts } from '../src/auth/login-attempts.js';
import { issueSession, SESSION_SECONDS } from '../src/auth/session.js';
import { preparePartners, TEST_PARTNER_EMAIL } from './partners-fixture.js';
import { loadEnvFile } from '../src/config/load-env-file.js';

loadEnvFile();
if (process.env.DATABASE_URL_TEST) process.env.DATABASE_URL = process.env.DATABASE_URL_TEST;
process.env.SESSION_SECRET = 'solo-pruebas-api-no-usar-en-produccion';

@Controller('private-test')
class PrivateController {
  @Get() read() {
    return { ok: true };
  }
}

describe('autenticación (PostgreSQL real)', () => {
  let app: INestApplication<App>;
  let db: Database;
  let attempts: LoginAttempts;
  const email = TEST_PARTNER_EMAIL;
  const password = 'solo pruebas';
  let userId: string;

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      imports: [AppModule],
      controllers: [PrivateController],
    }).compile();
    app = module.createNestApplication();
    app.setGlobalPrefix('api');
    await app.init();
    db = module.get(DATABASE);
    attempts = module.get(LoginAttempts);
    userId = (await preparePartners(db)).id;
  });

  afterAll(async () => {
    await app?.close();
  });

  async function login(pass = password) {
    return request(app.getHttpServer()).post('/api/auth/login').send({ email, password: pass });
  }

  it('login emite cookie httpOnly/lax de 30 días; la API devuelve solo usuario y socio UUID', async () => {
    const result = await login();
    expect(result.status).toBe(200);
    const cookie = result.headers['set-cookie']![0]!;
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('SameSite=Lax');
    expect(cookie).toContain(`Max-Age=${SESSION_SECONDS}`);
    expect(cookie).toContain('Path=/api');
    const me = await request(app.getHttpServer())
      .get('/api/auth/me')
      .set('Cookie', cookie)
      .expect(200);
    expect(me.body).toEqual({
      userId,
      email,
      partner: { id: expect.any(String), name: 'Socio de prueba' },
    });
    expect(me.body.partner.id).toMatch(/^[0-9a-f-]{36}$/);
    await request(app.getHttpServer()).get('/api/private-test').set('Cookie', cookie).expect(200);
  });

  it('rechaza login incorrecto con mensaje genérico y protege rutas por defecto', async () => {
    const wrong = await login('incorrecta');
    const unknown = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: 'nadie@example.test', password: 'incorrecta' });
    expect(wrong.status).toBe(401);
    expect(unknown.body).toEqual(wrong.body);
    expect(wrong.body.message).toBe('Correo o contraseña incorrectos.');
    await request(app.getHttpServer()).get('/api/private-test').expect(401);
    await request(app.getHttpServer()).get('/api/health').expect(200);
    await login();
  });

  it('rechaza cookie vencida, alterada y de versión anterior tras cambiar contraseña', async () => {
    const before = (await login()).headers['set-cookie']![0]!;
    const expired = issueSession(
      userId,
      0,
      process.env.SESSION_SECRET!,
      Date.now() - (SESSION_SECONDS + 1) * 1000,
    );
    await request(app.getHttpServer())
      .get('/api/auth/me')
      .set('Cookie', `moss.sid=${expired}`)
      .expect(401);
    await request(app.getHttpServer())
      .get('/api/auth/me')
      .set('Cookie', 'moss.sid=alterada.firma')
      .expect(401);
    const [previous] = await db.select().from(users).where(eq(users.id, userId));
    await setPassword(db, email.toUpperCase(), password);
    const account = await db.select().from(users).where(eq(users.id, userId));
    expect(account[0]!.sessionVersion).toBe(previous!.sessionVersion + 1);
    await request(app.getHttpServer()).get('/api/auth/me').set('Cookie', before).expect(401);
    const updated = await login();
    await request(app.getHttpServer())
      .get('/api/auth/me')
      .set('Cookie', updated.headers['set-cookie']![0]!)
      .expect(200);
    expect(await db.select().from(partners).where(eq(partners.userId, userId))).toHaveLength(1);
  });

  it('logout POST sin cuerpo funciona; cuerpos no JSON se rechazan', async () => {
    const logout = await request(app.getHttpServer()).post('/api/auth/logout').expect(204);
    expect(logout.headers['set-cookie']![0]).toContain('moss.sid=;');
    await request(app.getHttpServer())
      .post('/api/auth/login')
      .type('form')
      .send({ email, password })
      .expect(415);
    await request(app.getHttpServer())
      .post('/api/auth/logout')
      .type('text')
      .send('texto')
      .expect(415);
    await request(app.getHttpServer())
      .post('/api/auth/login')
      .set('Content-Type', 'application/json; charset=utf-8')
      .send({ email, password })
      .expect(200);
  });

  it('cinco fallos bloquean la IP incluso con una contraseña correcta', async () => {
    // Se controla el reloj del limitador, no scrypt ni la base.
    let now = 0;
    const clock = vi.spyOn(attempts, 'now').mockImplementation(() => now);
    await login();
    for (let i = 0; i < 4; i++) expect((await login('incorrecta')).status).toBe(401);
    expect((await login('incorrecta')).status).toBe(429);
    expect((await login()).status).toBe(429);
    now = 900_000;
    expect((await login()).status).toBe(200);
    clock.mockRestore();
  });
});
