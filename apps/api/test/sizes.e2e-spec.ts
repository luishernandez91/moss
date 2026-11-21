import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { sql } from 'drizzle-orm';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import type { ArticleDetail, Size } from '@moss/contracts';
import { AppModule } from '../src/app.module.js';
import { DATABASE, type Database } from '../src/database/database.module.js';
import { preparePartners } from './partners-fixture.js';
import { issueSession, SESSION_COOKIE } from '../src/auth/session.js';
import { loadEnvFile } from '../src/config/load-env-file.js';
import { deleteCatalogByPrefix } from './catalog-cleanup.js';
loadEnvFile();
if (process.env.DATABASE_URL_TEST) process.env.DATABASE_URL = process.env.DATABASE_URL_TEST;
process.env.SESSION_SECRET = 'solo-pruebas-api-no-usar-en-produccion';

describe('C3 tamaños (moss_test)', () => {
  let app: INestApplication<App>;
  let db: Database;
  let cookie: string;
  const prefix = `e2e-size-${randomUUID().slice(0, 8)}`;
  const sizeIds: string[] = [];
  const api = () => request(app.getHttpServer());
  const get = (url: string) => api().get(url).set('Cookie', cookie);
  const post = (url: string, body: object) => api().post(url).set('Cookie', cookie).send(body);
  const patch = (url: string, body: object) => api().patch(url).set('Cookie', cookie).send(body);
  const del = (url: string) => api().delete(url).set('Cookie', cookie);
  async function size(): Promise<Size> {
    const r = await post('/api/sizes', {
      key: `s_${randomUUID().replaceAll('-', '')}`,
      label: 'Prueba',
    });
    expect(r.status, JSON.stringify(r.body)).toBe(201);
    sizeIds.push((r.body as Size).id);
    return r.body as Size;
  }
  async function type(usesSize: boolean) {
    const r = await post('/api/article-types', { name: `${prefix} ${randomUUID()}`, usesSize });
    expect(r.status).toBe(201);
    return r.body as { id: string; name: string };
  }
  const variant = (sizeId: string | null, attributes = {}, stock = 1) => ({
    sku: `S-${randomUUID().slice(0, 8)}`,
    sizeId,
    attributes,
    stock,
    price: null,
    averageCost: 100,
  });
  const article = (articleTypeId: string, variants: object[]) => ({
    articleTypeId,
    name: prefix,
    stockUnit: 'piece',
    sold: true,
    usedInRecipes: true,
    variants,
  });
  beforeAll(async () => {
    const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = module.createNestApplication();
    app.setGlobalPrefix('api');
    await app.init();
    db = module.get(DATABASE);
    const u = await preparePartners(db);
    cookie = `${SESSION_COOKIE}=${issueSession(u.id, u.sessionVersion, process.env.SESSION_SECRET!)}`;
  });
  afterAll(async () => {
    if (db) {
      await deleteCatalogByPrefix(db, prefix);
      for (const id of sizeIds) await db.execute(sql`DELETE FROM sizes WHERE id = ${id}`);
    }
    await app?.close();
  });
  it('protege todos los endpoints y valida forma y referencias', async () => {
    for (const [method, url, body] of [
      ['get', '/api/sizes', {}],
      ['post', '/api/sizes', {}],
      ['patch', `/api/sizes/${randomUUID()}`, {}],
      ['delete', `/api/sizes/${randomUUID()}`, {}],
      ['put', '/api/sizes/order', { ids: [] }],
    ] as const)
      expect((await api()[method](url).send(body)).status).toBe(401);
    expect((await post('/api/sizes', { key: 's', label: '' })).status).toBe(400);
    expect((await patch(`/api/sizes/${randomUUID()}`, { label: 'Otro' })).status).toBe(404);
  });
  it('CRUD, clave inmutable y orden atómico, sin sobrescribir ante catálogo distinto', async () => {
    const s = await size();
    expect((await post('/api/sizes', { key: s.key, label: 'Duplicado' })).status).toBe(422);
    expect((await patch(`/api/sizes/${s.id}`, { key: 'other' })).body).toMatchObject({
      code: 'KEY_IMMUTABLE',
    });
    const before = (await get('/api/sizes')).body as Size[];
    const ids = before.map((s) => s.id).reverse();
    const r = await api().put('/api/sizes/order').set('Cookie', cookie).send({ ids });
    expect(r.status).toBe(200);
    expect(((await get('/api/sizes')).body as Size[]).map((s) => s.id)).toEqual(ids);
    expect(
      (
        await api()
          .put('/api/sizes/order')
          .set('Cookie', cookie)
          .send({ ids: ids.slice(1) })
      ).status,
    ).toBe(409);
    expect(((await get('/api/sizes')).body as Size[]).map((s) => s.id)).toEqual(ids);
    await api()
      .put('/api/sizes/order')
      .set('Cookie', cookie)
      .send({ ids: before.map((s) => s.id) })
      .expect(200);
    await del(`/api/sizes/${s.id}`).expect(204);
  });
  it('exige size_id según tipo en alta, agregar y editar; bloquea ambos cambios de uses_size', async () => {
    const s = await size();
    const sized = await type(true);
    const plain = await type(false);
    expect((await post('/api/articles', article(sized.id, [variant(null)]))).body).toMatchObject({
      code: 'SIZE_REQUIRED',
    });
    expect((await post('/api/articles', article(plain.id, [variant(s.id)]))).body).toMatchObject({
      code: 'SIZE_NOT_ALLOWED',
    });
    for (const [t, id] of [
      [sized, s.id],
      [plain, null],
    ] as const) {
      const r = await post('/api/articles', article(t.id, [variant(id)]));
      expect(r.status).toBe(201);
      const a = r.body as ArticleDetail;
      const invalid = id ? null : s.id;
      expect((await post(`/api/articles/${a.id}/variants`, variant(invalid))).status).toBe(422);
      expect(
        (await patch(`/api/articles/${a.id}/variants/${a.variants[0]!.id}`, { sizeId: invalid }))
          .status,
      ).toBe(422);
      await patch(`/api/articles/${a.id}`, { active: false });
      expect((await patch(`/api/article-types/${t.id}`, { usesSize: !id })).status).toBe(409);
      expect(
        (await patch(`/api/article-types/${t.id}`, { name: t.name, usesSize: !!id })).status,
      ).toBe(200);
    }
  });
  it('no deja carreras entre cambiar el tipo y crear artículos', async () => {
    const t = await type(false);
    const [a, changed] = await Promise.all([
      post('/api/articles', article(t.id, [variant(null)])),
      patch(`/api/article-types/${t.id}`, { name: t.name, usesSize: true }),
    ]);
    expect([
      [201, 409],
      [422, 200],
    ]).toContainEqual([a.status, changed.status]);
  });
  it('unicidad con tamaño y sin tamaño, incluida edición e inactivas y respaldo SQL', async () => {
    const s = await size();
    const m = await size();
    const t = await type(true);
    const r = await post('/api/articles', article(t.id, [variant(s.id), variant(m.id)]));
    expect(r.status).toBe(201);
    const a = r.body as ArticleDetail;
    await patch(`/api/articles/${a.id}/variants/${a.variants[0]!.id}`, { active: false });
    expect((await post(`/api/articles/${a.id}/variants`, variant(s.id))).body).toMatchObject({
      code: 'DUPLICATE_COMBINATION',
    });
    expect(
      (await patch(`/api/articles/${a.id}/variants/${a.variants[1]!.id}`, { sizeId: s.id })).body,
    ).toMatchObject({ code: 'DUPLICATE_COMBINATION' });
    const plain = await type(false);
    const p = (await post('/api/articles', article(plain.id, [variant(null)])))
      .body as ArticleDetail;
    expect((await post(`/api/articles/${p.id}/variants`, variant(null))).body).toMatchObject({
      code: 'DUPLICATE_COMBINATION',
    });
    for (const [articleId, sizeId] of [
      [a.id, s.id],
      [p.id, null],
    ]) {
      await expect(
        db.execute(
          sql`INSERT INTO article_variants(article_id,sku,size_id,attributes,average_cost) VALUES (${articleId},${randomUUID()},${sizeId},'{}',0)`,
        ),
      ).rejects.toThrow();
    }
  });
  it('borrado en uso 409; renombrar/desactivar siempre; filtros muestran solo inactivos usados', async () => {
    const s = await size();
    const unused = await size();
    const t = await type(true);
    const a = (await post('/api/articles', article(t.id, [variant(s.id)]))).body as ArticleDetail;
    await patch(`/api/articles/${a.id}/variants/${a.variants[0]!.id}`, { active: false });
    const r = await del(`/api/sizes/${s.id}`);
    expect(r.status).toBe(409);
    expect(r.body).toMatchObject({ code: 'SIZE_IN_USE' });
    for (const id of [s.id, unused.id])
      await patch(`/api/sizes/${id}`, { label: 'Renombrado', active: false }).expect(200);
    const filters = (await get('/api/sizes?purpose=filter')).body as Size[];
    expect(filters.map((s) => s.id)).toContain(s.id);
    expect(filters.map((s) => s.id)).not.toContain(unused.id);
    await patch(`/api/articles/${a.id}/variants/${a.variants[0]!.id}`, {
      sizeId: s.id,
      stock: 2,
    }).expect(200);
    expect((await post('/api/articles', article(t.id, [variant(s.id)]))).body).toMatchObject({
      code: 'SIZE_INACTIVE',
    });
  });
  it('sizeId, attr e inStock deben coincidir en la misma variante activa', async () => {
    const s = await size();
    const m = await size();
    const t = await type(true);
    await post(`/api/article-types/${t.id}/attributes`, {
      name: 'Color',
      dataType: 'text',
      required: true,
      definesVariant: true,
    }).expect(201);
    const a = (
      await post(
        '/api/articles',
        article(t.id, [
          variant(s.id, { color: 'rojo' }, 2),
          variant(m.id, { color: 'rojo' }, 0),
          variant(m.id, { color: 'azul' }, 3),
        ]),
      )
    ).body as ArticleDetail;
    const query = `/api/articles?typeId=${t.id}&sizeId=${m.id}&attr=color:rojo&inStock=true`;
    expect((await get(query)).body).toEqual([]);
    await patch(
      `/api/articles/${a.id}/variants/${a.variants.find((v) => v.sizeId === m.id && v.attributes['color'] === 'rojo')!.id}`,
      { stock: 1 },
    );
    expect(((await get(query)).body as ArticleDetail[]).map((a) => a.id)).toEqual([a.id]);
  });
});
