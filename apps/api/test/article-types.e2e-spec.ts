import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { eq, like } from 'drizzle-orm';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import type { ArticleType } from '@moss/contracts';
import { AppModule } from '../src/app.module.js';
import { DATABASE, type Database } from '../src/database/database.module.js';
import { articleTypes, attributes } from '../src/database/schema.js';
import { preparePartners } from './partners-fixture.js';
import { issueSession, SESSION_COOKIE } from '../src/auth/session.js';
import { loadEnvFile } from '../src/config/load-env-file.js';

loadEnvFile();
if (process.env.DATABASE_URL_TEST) process.env.DATABASE_URL = process.env.DATABASE_URL_TEST;
process.env.SESSION_SECRET = 'solo-pruebas-api-no-usar-en-produccion';

describe('tipos de artículo y atributos (PostgreSQL real)', () => {
  let app: INestApplication<App>;
  let db: Database;
  let cookie: string;
  const prefix = `e2e-${randomUUID().slice(0, 8)}`;

  beforeAll(async () => {
    const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = module.createNestApplication();
    app.setGlobalPrefix('api');
    await app.init();
    db = module.get(DATABASE);
    const user = await preparePartners(db);
    cookie = `${SESSION_COOKIE}=${issueSession(user.id, user.sessionVersion, process.env.SESSION_SECRET!)}`;
  });

  afterAll(async () => {
    if (db) {
      await db.delete(articleTypes).where(like(articleTypes.name, `${prefix}%`));
    }
    await app?.close();
  });

  const api = () => request(app.getHttpServer());
  const get = (path: string) => api().get(path).set('Cookie', cookie);
  const post = (path: string, body: object) => api().post(path).set('Cookie', cookie).send(body);
  const patch = (path: string, body: object) => api().patch(path).set('Cookie', cookie).send(body);
  const del = (path: string) => api().delete(path).set('Cookie', cookie);

  async function createType(name: string): Promise<string> {
    const response = await post('/api/article-types', { name: `${prefix} ${name}` });
    expect(response.status).toBe(201);
    return (response.body as ArticleType).id;
  }

  async function listed(id: string): Promise<ArticleType | undefined> {
    const response = await get('/api/article-types');
    expect(response.status).toBe(200);
    return (response.body as ArticleType[]).find((type) => type.id === id);
  }

  it('exige sesión en todos los endpoints', async () => {
    const id = randomUUID();
    const responses = await Promise.all([
      api().get('/api/article-types'),
      api().post('/api/article-types').send({ name: 'x' }),
      api().patch(`/api/article-types/${id}`).send({ name: 'x' }),
      api().delete(`/api/article-types/${id}`),
      api().post(`/api/article-types/${id}/attributes`).send({}),
      api().patch(`/api/article-types/${id}/attributes/${id}`).send({ active: false }),
      api().delete(`/api/article-types/${id}/attributes/${id}`),
    ]);
    for (const response of responses) {
      expect(response.status).toBe(401);
      expect(response.body).toMatchObject({ code: 'UNAUTHORIZED' });
    }
  });

  it('crea, lista, renombra y borra un tipo', async () => {
    const id = await createType('Maceta');
    expect(await listed(id)).toEqual({ id, name: `${prefix} Maceta`, attributes: [] });

    const renamed = await patch(`/api/article-types/${id}`, { name: `  ${prefix} Macetas ` });
    expect(renamed.status).toBe(200);
    expect(renamed.body).toMatchObject({ id, name: `${prefix} Macetas` });

    expect((await del(`/api/article-types/${id}`)).status).toBe(204);
    expect(await listed(id)).toBeUndefined();
    expect((await del(`/api/article-types/${id}`)).status).toBe(404);
  });

  it('rechaza nombres de tipo duplicados con 422 y un mensaje claro', async () => {
    await createType('Sustrato');
    const duplicate = await post('/api/article-types', { name: `${prefix} SUSTRATO` });
    expect(duplicate.status).toBe(422);
    expect(duplicate.body).toEqual({
      code: 'DUPLICATE_NAME',
      message: `Ya existe el tipo de artículo «${prefix} Sustrato».`,
    });
  });

  it('valida la forma de la petición con 400 y los identificadores de ruta', async () => {
    const invalid = await post('/api/article-types', { name: '' });
    expect(invalid.status).toBe(400);
    expect(invalid.body).toMatchObject({ code: 'VALIDATION_ERROR' });
    expect((await patch('/api/article-types/no-es-uuid', { name: 'x' })).status).toBe(400);
    expect((await patch(`/api/article-types/${randomUUID()}`, { name: 'x' })).status).toBe(404);
  });

  it('gestiona atributos: crear, editar en parcial, desactivar y borrar', async () => {
    const id = await createType('Planta');
    const created = await post(`/api/article-types/${id}/attributes`, {
      name: ' Tamaño ',
      dataType: 'list',
      options: ['mini', 'chico', 'mediano', 'grande'],
      required: true,
      definesVariant: true,
    });
    expect(created.status).toBe(201);
    expect(created.body).toEqual({
      id: expect.any(String),
      key: 'tamano',
      name: 'Tamaño',
      dataType: 'list',
      unit: null,
      options: ['mini', 'chico', 'mediano', 'grande'],
      required: true,
      definesVariant: true,
      active: true,
    });
    const attributeId = (created.body as { id: string }).id;
    const base = `/api/article-types/${id}/attributes/${attributeId}`;

    const renamed = await patch(base, { name: 'Tamaño de planta', definesVariant: false });
    expect(renamed.status).toBe(200);
    expect(renamed.body).toMatchObject({ key: 'tamano', name: 'Tamaño de planta' });

    const deactivated = await patch(base, { active: false });
    expect(deactivated.body).toMatchObject({ active: false });
    expect((await listed(id))!.attributes).toHaveLength(1);

    expect((await del(base)).status).toBe(204);
    expect((await listed(id))!.attributes).toEqual([]);
    expect((await del(base)).status).toBe(404);
  });

  it('devuelve los atributos en orden de creación', async () => {
    const id = await createType('Orden');
    for (const name of ['Material', 'Drenaje', 'Forma']) {
      await post(`/api/article-types/${id}/attributes`, {
        name,
        dataType: 'boolean',
        required: false,
        definesVariant: false,
      });
    }
    expect((await listed(id))!.attributes.map((attribute) => attribute.name)).toEqual([
      'Material',
      'Drenaje',
      'Forma',
    ]);
  });

  it('aplica las reglas de dominio con 422', async () => {
    const id = await createType('Reglas');
    const path = `/api/article-types/${id}/attributes`;
    expect(
      (
        await post(path, {
          name: 'Diámetro',
          dataType: 'number',
          unit: 'cm',
          required: true,
          definesVariant: true,
        })
      ).status,
    ).toBe(201);

    const conflict = await post(path, {
      name: 'Diametro',
      dataType: 'number',
      required: true,
      definesVariant: false,
    });
    expect(conflict.status).toBe(422);
    expect(conflict.body).toEqual({
      code: 'KEY_CONFLICT',
      message: '«Diametro» genera la clave «diametro», que ya usa el atributo «Diámetro».',
    });

    const variant = await post(path, {
      name: 'Forma',
      dataType: 'list',
      options: ['redonda'],
      required: false,
      definesVariant: true,
    });
    expect(variant.status).toBe(422);
    expect(variant.body).toMatchObject({ code: 'VARIANT_REQUIRES_REQUIRED' });

    const repeated = await post(path, {
      name: 'Color',
      dataType: 'list',
      options: ['gris', 'Gris'],
      required: true,
      definesVariant: false,
    });
    expect(repeated.body).toMatchObject({ code: 'INVALID_OPTIONS' });
  });

  it('no permite cambiar el tipo de dato y responde 404 para un atributo de otro tipo', async () => {
    const first = await createType('Uno');
    const second = await createType('Dos');
    const created = await post(`/api/article-types/${first}/attributes`, {
      name: 'Drenaje',
      dataType: 'boolean',
      required: true,
      definesVariant: false,
    });
    const attributeId = (created.body as { id: string }).id;
    expect(
      (await patch(`/api/article-types/${first}/attributes/${attributeId}`, { dataType: 'text' }))
        .status,
    ).toBe(400);
    expect(
      (await patch(`/api/article-types/${second}/attributes/${attributeId}`, { active: false }))
        .status,
    ).toBe(404);
    expect(
      (
        await post(`/api/article-types/${randomUUID()}/attributes`, {
          name: 'X',
          dataType: 'text',
          required: false,
          definesVariant: false,
        })
      ).status,
    ).toBe(404);
  });

  it('borrar un tipo borra sus atributos en cascada', async () => {
    const id = await createType('Cascada');
    await post(`/api/article-types/${id}/attributes`, {
      name: 'Composición',
      dataType: 'text',
      required: true,
      definesVariant: false,
    });
    expect((await del(`/api/article-types/${id}`)).status).toBe(204);
    expect(await db.select().from(attributes).where(eq(attributes.articleTypeId, id))).toEqual([]);
  });

  it('traduce una violación de unicidad de la base a 409 (carrera entre solicitudes)', async () => {
    const name = `${prefix} Carrera`;
    const [first, second] = await Promise.all([
      post('/api/article-types', { name }),
      post('/api/article-types', { name }),
    ]);
    const statuses = [first.status, second.status].sort((a, b) => a - b);
    // Gana una; la otra choca en el dominio (422) o, si ambas validaron a la vez, en la base (409).
    expect(statuses[0]).toBe(201);
    expect([409, 422]).toContain(statuses[1]);
    const loser = first.status === 201 ? second : first;
    if (loser.status === 409) expect(loser.body).toMatchObject({ code: 'DUPLICATE_NAME' });
  });
});
