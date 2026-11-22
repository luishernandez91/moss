import { cents, resolveCost, type Product } from '@moss/domain';
import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { eq, sql } from 'drizzle-orm';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import type { ArticleDetail, ArticleType, Attribute, CreateAttribute, Size } from '@moss/contracts';
import { AppModule } from '../src/app.module.js';
import { DATABASE, type Database } from '../src/database/database.module.js';
import { articles, articleVariants, sizes, variantCostChanges } from '../src/database/schema.js';
import { preparePartners } from './partners-fixture.js';
import { issueSession, SESSION_COOKIE } from '../src/auth/session.js';
import { loadEnvFile } from '../src/config/load-env-file.js';
import { deleteCatalogByPrefix } from './catalog-cleanup.js';
import { seedCatalog, type SpecCatalog } from '../src/database/seed.js';
import { CATALOG_WRITE_LOCK } from '../src/catalog/catalog-write.js';
loadEnvFile();
if (process.env.DATABASE_URL_TEST) process.env.DATABASE_URL = process.env.DATABASE_URL_TEST;
process.env.SESSION_SECRET = 'solo-pruebas-c6-no-usar-en-produccion';

describe('C6 dimensiones atómicas (moss_test, fixtures propias)', () => {
  let app: INestApplication<App>;
  let db: Database;
  let cookie: string;
  const prefix = `e2e-c6-${randomUUID().slice(0, 8)}`;
  const sizeIds: string[] = [];
  const api = () => request(app.getHttpServer());
  const get = (url: string) => api().get(url).set('Cookie', cookie);
  const post = (url: string, body: object) => api().post(url).set('Cookie', cookie).send(body);
  const patch = (url: string, body: object) => api().patch(url).set('Cookie', cookie).send(body);
  const dimension = (id: string, attribute: CreateAttribute, initialValue: unknown) =>
    post(`/api/article-types/${id}/attribute-dimensions`, { attribute, initialValue });
  const enable = (id: string, initialSizeId: string) =>
    post(`/api/article-types/${id}/enable-size`, { initialSizeId });
  const attr = (name = 'Nuevo', required = true): CreateAttribute => ({
    name,
    dataType: 'text',
    required,
    definesVariant: false,
  });
  async function size() {
    const r = await post('/api/sizes', {
      key: `c6_${randomUUID().replaceAll('-', '')}`,
      label: 'C6 Chico',
    }).expect(201);
    const s = r.body as Size;
    sizeIds.push(s.id);
    return s;
  }
  const variant = (attributes = {}) => ({
    sku: `C6-${randomUUID().slice(0, 8)}`,
    attributes,
    sizeId: null,
    averageCost: 1350,
    price: 2000,
    stock: 2,
  });
  const article = (articleTypeId: string, variants = [variant()]) => ({
    articleTypeId,
    name: `${prefix} artículo`,
    stockUnit: 'piece',
    sold: true,
    usedInRecipes: true,
    fixedAttributes: {},
    variants,
  });
  async function fixture() {
    const t = (await post('/api/article-types', { name: `${prefix} ${randomUUID()}` }).expect(201))
      .body as ArticleType;
    const a = (await post('/api/articles', article(t.id)).expect(201)).body as ArticleDetail;
    const b = (await post('/api/articles', article(t.id)).expect(201)).body as ArticleDetail;
    await patch(`/api/articles/${b.id}`, { active: false }).expect(200);
    await patch(`/api/articles/${b.id}/variants/${b.variants[0]!.id}`, { active: false }).expect(
      200,
    );
    return { t, a, b };
  }
  async function snapshot(typeId: string) {
    return {
      type: ((await get('/api/article-types')).body as ArticleType[]).find((t) => t.id === typeId),
      articles: await db
        .select()
        .from(articles)
        .where(eq(articles.articleTypeId, typeId))
        .orderBy(articles.id),
      variants: (
        await db
          .select({ v: articleVariants })
          .from(articleVariants)
          .innerJoin(articles, eq(articles.id, articleVariants.articleId))
          .where(eq(articles.articleTypeId, typeId))
          .orderBy(articleVariants.id)
      ).map((r) => r.v),
      history: (
        await db
          .select({ h: variantCostChanges })
          .from(variantCostChanges)
          .innerJoin(articleVariants, eq(articleVariants.id, variantCostChanges.variantId))
          .innerJoin(articles, eq(articles.id, articleVariants.articleId))
          .where(eq(articles.articleTypeId, typeId))
          .orderBy(variantCostChanges.id)
      ).map((r) => r.h),
    };
  }
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
      for (const id of sizeIds) await db.delete(sizes).where(eq(sizes.id, id));
    }
    await app?.close();
  });
  it('401, 400 y 404 sin escrituras', async () => {
    for (const endpoint of ['attribute-dimensions', 'enable-size'])
      expect(
        (await api().post(`/api/article-types/${randomUUID()}/${endpoint}`).send({})).status,
      ).toBe(401);
    const { t } = await fixture();
    const before = await snapshot(t.id);
    await post(`/api/article-types/${t.id}/attribute-dimensions`, { attribute: attr() }).expect(
      400,
    );
    await post(`/api/article-types/${t.id}/enable-size`, {}).expect(400);
    await dimension(randomUUID(), attr(), 'ok').expect(404);
    await enable(t.id, randomUUID()).expect(404);
    expect(await snapshot(t.id)).toEqual(before);
  });
  for (const scope of ['fixed-required', 'fixed-optional', 'variant'] as const) {
    it.each([
      ['text', 'hola'],
      ['number', 0],
      ['list', 'A'],
      ['boolean', false],
    ] as const)(
      `${scope} %s: aplica a todas e historial intacto`,
      async (dataType, initialValue) => {
        const { t } = await fixture();
        const before = await snapshot(t.id);
        const definition: CreateAttribute =
          dataType === 'list'
            ? {
                name: 'Nuevo',
                dataType,
                options: ['A', 'B'],
                required: scope !== 'fixed-optional',
                definesVariant: scope === 'variant',
              }
            : {
                name: 'Nuevo',
                dataType,
                required: scope !== 'fixed-optional',
                definesVariant: scope === 'variant',
              };
        const r = await dimension(t.id, definition, initialValue).expect(201);
        expect(r.body).not.toHaveProperty('initialValue');
        const after = await snapshot(t.id);
        expect(after.history).toEqual(before.history);
        expect(after.articles).toEqual(
          before.articles.map((a) => ({
            ...a,
            fixedAttributes: scope === 'variant' ? a.fixedAttributes : { nuevo: initialValue },
          })),
        );
        expect(after.variants).toEqual(
          before.variants.map((v) => ({
            ...v,
            attributes: scope === 'variant' ? { nuevo: initialValue } : v.attributes,
          })),
        );
        if (scope !== 'fixed-optional') await post('/api/articles', article(t.id)).expect(422);
        else {
          const future = (await post('/api/articles', article(t.id)).expect(201))
            .body as ArticleDetail;
          expect(future.fixedAttributes).toEqual({});
        }
      },
    );
  }
  it('tamaño activo en todas, sin cambios económicos ni default para futuras altas', async () => {
    const { t, a } = await fixture();
    const s = await size();
    const before = await snapshot(t.id);
    await enable(t.id, s.id).expect(201);
    const after = await snapshot(t.id);
    expect(after.type?.usesSize).toBe(true);
    expect(after.articles).toEqual(before.articles);
    expect(after.history).toEqual(before.history);
    expect(after.variants).toEqual(before.variants.map((v) => ({ ...v, sizeId: s.id })));
    await post('/api/articles', article(t.id)).expect(422);
    await enable(t.id, s.id).expect(409);
    await patch(`/api/article-types/${t.id}`, { usesSize: false }).expect(409);
    expect((await get(`/api/articles/${a.id}`)).body).toMatchObject({
      articleType: { usesSize: true },
    });
  });
  it('valor inválido, clave repetida, tamaño inactivo y estado final inválido revierten todo', async () => {
    const { t, a } = await fixture();
    const s = await size();
    await patch(`/api/sizes/${s.id}`, { active: false }).expect(200);
    let before = await snapshot(t.id);
    await dimension(t.id, attr(), false).expect(422);
    await enable(t.id, s.id).expect(422);
    expect(await snapshot(t.id)).toEqual(before);
    await dimension(t.id, attr(), 'ok').expect(201);
    before = await snapshot(t.id);
    await dimension(t.id, attr(), 'other').expect(422);
    expect(await snapshot(t.id)).toEqual(before);
    // SQL de fixture simula un estado legado inválido: C6 debe validar TODOS los registros.
    await db.update(articles).set({ fixedAttributes: {} }).where(eq(articles.id, a.id));
    before = await snapshot(t.id);
    await dimension(t.id, attr('Segundo'), 'ok').expect(422);
    await patch(`/api/sizes/${s.id}`, { active: true }).expect(200);
    await enable(t.id, s.id).expect(422);
    expect(await snapshot(t.id)).toEqual(before);
  });
  it('detecta colisión final con variante inactiva antes de escribir', async () => {
    const { t, a } = await fixture();
    const s = await size();
    await db.insert(articleVariants).values({
      articleId: a.id,
      sku: `C6-${randomUUID()}`,
      sizeId: s.id,
      attributes: {},
      averageCost: 123,
      active: false,
    });
    const before = await snapshot(t.id);
    await enable(t.id, s.id).expect(409);
    expect(await snapshot(t.id)).toEqual(before);
  });
  it('conserva bloqueos ordinarios de definición y uses_size', async () => {
    const { t } = await fixture();
    await post(`/api/article-types/${t.id}/attributes`, attr()).expect(409);
    await patch(`/api/article-types/${t.id}`, { usesSize: true }).expect(409);
    const optional = (
      await post(`/api/article-types/${t.id}/attributes`, attr('Opcional', false)).expect(201)
    ).body as Attribute;
    await patch(`/api/article-types/${t.id}/attributes/${optional.id}`, { required: true }).expect(
      409,
    );
    await patch(`/api/article-types/${t.id}/attributes/${optional.id}`, {
      definesVariant: true,
    }).expect(409);
    const added = (await dimension(t.id, attr(), 'ok').expect(201)).body as Attribute;
    await patch(`/api/article-types/${t.id}/attributes/${added.id}`, { active: false }).expect(200);
    await db.update(articles).set({ fixedAttributes: {} }).where(eq(articles.articleTypeId, t.id));
    await patch(`/api/article-types/${t.id}/attributes/${added.id}`, { active: true }).expect(409);
  });
  it('seed propio incompatible no revierte uses_size ni deja escrituras previas', async () => {
    const { t } = await fixture();
    const s = await size();
    await enable(t.id, s.id).expect(201);
    const before = await snapshot(t.id);
    const allBefore = (await get('/api/article-types')).body as ArticleType[];
    const catalog: SpecCatalog = {
      tipos_articulo: [
        { id: 'new', nombre: `${prefix} seed rollback`, atributos: [] },
        { id: 'existing', nombre: t.name, atributos: [] },
      ],
      articulos: [],
    };
    await expect(seedCatalog(db, catalog)).rejects.toThrow(/uses_size/);
    expect(await snapshot(t.id)).toEqual(before);
    expect((await get('/api/article-types')).body).toEqual(allBefore);
  });
  it('serializa altas y dimensiones: o se incluyen o exigen capturar la dimensión', async () => {
    for (const variantScope of [false, true]) {
      const { t, a } = await fixture();
      const [created, added] = await Promise.all([
        post('/api/articles', article(t.id)),
        dimension(t.id, { ...attr(), definesVariant: variantScope }, 'ok'),
      ]);
      expect(added.status).toBe(201);
      expect([201, 422]).toContain(created.status);
      const state = await snapshot(t.id);
      if (variantScope)
        expect(state.variants.every((v) => v.attributes['nuevo'] === 'ok')).toBe(true);
      else expect(state.articles.every((a) => a.fixedAttributes['nuevo'] === 'ok')).toBe(true);
      await patch(`/api/articles/${a.id}`, { name: 'Renombrado' }).expect(200);
    }
  });
  it('carrera de tamaño contra desactivación: asigna antes o rechaza sin cambios', async () => {
    const { t } = await fixture();
    const s = await size();
    const [enabled, deactivated] = await Promise.all([
      enable(t.id, s.id),
      patch(`/api/sizes/${s.id}`, { active: false }),
    ]);
    expect(deactivated.status).toBe(200);
    expect([201, 422]).toContain(enabled.status);
    const after = await snapshot(t.id);
    expect(after.type?.usesSize).toBe(enabled.status === 201);
    expect(after.variants.every((v) => v.sizeId === (enabled.status === 201 ? s.id : null))).toBe(
      true,
    );
  });
  it('edición fija y cambios de definición esperan CATALOG_WRITE_LOCK', async () => {
    const { t, a } = await fixture();
    const added = (await dimension(t.id, attr(), 'ok').expect(201)).body as Attribute;
    for (const send of [
      () => patch(`/api/articles/${a.id}`, { fixedAttributes: { nuevo: 'editado' } }),
      () => patch(`/api/article-types/${t.id}/attributes/${added.id}`, { name: 'Renombrado' }),
      () => post(`/api/article-types/${t.id}/attributes`, attr('Optional', false)),
      () => api().delete(`/api/article-types/${t.id}/attributes/${added.id}`).set('Cookie', cookie),
    ]) {
      let release!: () => void;
      let locked!: () => void;
      const ready = new Promise<void>((r) => (locked = r));
      const gate = new Promise<void>((r) => (release = r));
      const transaction = db.transaction(async (tx) => {
        await tx.execute(
          sql`SELECT pg_advisory_xact_lock(${CATALOG_WRITE_LOCK.namespace},${CATALOG_WRITE_LOCK.key})`,
        );
        locked();
        await gate;
      });
      await ready;
      let settled = false;
      const pending = send().then((r) => {
        settled = true;
        return r;
      });
      try {
        await new Promise((r) => setTimeout(r, 75));
        expect(settled).toBe(false);
      } finally {
        release();
        await transaction;
        await pending;
      }
    }
  });
  async function orderedRace(
    first: () => PromiseLike<unknown>,
    second: () => PromiseLike<unknown>,
  ) {
    let release!: () => void;
    let locked!: () => void;
    const ready = new Promise<void>((r) => (locked = r)),
      gate = new Promise<void>((r) => (release = r));
    const holder = db.transaction(async (tx) => {
      await tx.execute(
        sql`SELECT pg_advisory_xact_lock(${CATALOG_WRITE_LOCK.namespace},${CATALOG_WRITE_LOCK.key})`,
      );
      locked();
      await gate;
    });
    await ready;
    const waitQueued = async (count: number) => {
      for (let attempt = 0; attempt < 100; attempt++) {
        const rows = await db.execute(
          sql`SELECT count(*)::int AS n FROM pg_locks WHERE locktype='advisory' AND classid=${CATALOG_WRITE_LOCK.namespace} AND objid=${CATALOG_WRITE_LOCK.key} AND NOT granted`,
        );
        if (Number(rows.rows[0]?.['n']) >= count) return;
        await new Promise((r) => setTimeout(r, 5));
      }
      throw new Error('La escritura no esperó CATALOG_WRITE_LOCK.');
    };
    const firstResult = Promise.resolve(first());
    let secondResult: Promise<unknown> | undefined;
    try {
      await waitQueued(1);
      secondResult = Promise.resolve(second());
      await waitQueued(2);
    } finally {
      release();
      await holder;
      await firstResult;
      await secondResult;
    }
  }
  it('una edición fija concurrente no borra el valor opcional recién aplicado', async () => {
    const { t, a } = await fixture();
    let editedStatus = 0;
    await orderedRace(
      () => dimension(t.id, attr('Nuevo', false), 'inicial').expect(201),
      () =>
        patch(`/api/articles/${a.id}`, { name: 'Editado', fixedAttributes: {} }).then((r) => {
          editedStatus = r.status;
        }),
    );
    expect(editedStatus).toBe(409);
    const after = (await get(`/api/articles/${a.id}`)).body as ArticleDetail;
    expect(after.fixedAttributes).toEqual({ nuevo: 'inicial' });
  });
  it('carreras ordenadas con alta y edición de variantes mantienen la dimensión y el historial', async () => {
    for (const operation of ['attribute', 'size'] as const) {
      const { t, a } = await fixture();
      const s = await size();
      const before = await snapshot(t.id);
      let status = 0;
      const add = () =>
        operation === 'attribute'
          ? dimension(t.id, { ...attr(), definesVariant: true }, 'ok').expect(201)
          : enable(t.id, s.id).expect(201);
      await orderedRace(add, () =>
        patch(`/api/articles/${a.id}/variants/${a.variants[0]!.id}`, {
          attributes: {},
          sizeId: null,
          stock: 9,
        }).then((r) => {
          status = r.status;
        }),
      );
      expect(status).toBe(409);
      const after = await snapshot(t.id);
      expect(after.history).toEqual(before.history);
      expect(after.variants.map((v) => v.stock)).toEqual(before.variants.map((v) => v.stock));
      const invalid = await post(`/api/articles/${a.id}/variants`, variant());
      expect(invalid.status).toBe(422);
    }
  });
  it('carrera con alta de variante incluye la nueva fila si gana el alta', async () => {
    const { t, a } = await fixture();
    // Un atributo previo permite dos combinaciones sin SKU ni variantes generados por C6.
    await dimension(t.id, { ...attr('Color'), definesVariant: true }, 'rojo').expect(201);
    await orderedRace(
      () => post(`/api/articles/${a.id}/variants`, variant({ color: 'azul' })).expect(201),
      () => dimension(t.id, { ...attr(), definesVariant: true }, 'ok').expect(201),
    );
    const after = await snapshot(t.id);
    expect(after.variants.every((v) => v.attributes['nuevo'] === 'ok')).toBe(true);
    expect(after.variants).toHaveLength(3);
  });

  it('rechaza snapshots obsoletos sin cambios y permite quitar un opcional tras recargar', async () => {
    const { t, a } = await fixture();
    const old = a.fixedAttributes;
    await dimension(t.id, attr('Nuevo', false), 'inicial').expect(201);
    const before = await snapshot(t.id);
    await patch(`/api/articles/${a.id}`, {
      fixedAttributes: {},
      expectedFixedAttributes: old,
      name: 'No guardar',
    }).expect(409);
    expect(await snapshot(t.id)).toEqual(before);
    await patch(`/api/articles/${a.id}`, {
      fixedAttributes: {},
      expectedFixedAttributes: { nuevo: 'inicial' },
    }).expect(200);
    expect(((await get(`/api/articles/${a.id}`)).body as ArticleDetail).fixedAttributes).toEqual(
      {},
    );
    const s = await size();
    await enable(t.id, s.id).expect(201);
    const sized = await snapshot(t.id);
    await patch(`/api/articles/${a.id}/variants/${a.variants[0]!.id}`, {
      attributes: {},
      expectedDimension: { attributes: {}, sizeId: null },
      stock: 99,
    }).expect(409);
    expect(await snapshot(t.id)).toEqual(sized);
  });
  it('activar tamaños serializa el alta de artículos antes y después de la asignación', async () => {
    for (const createFirst of [true, false]) {
      const { t } = await fixture();
      const s = await size();
      const create = () => post('/api/articles', article(t.id)).expect(createFirst ? 201 : 422);
      const activate = () => enable(t.id, s.id).expect(201);
      await orderedRace(createFirst ? create : activate, createFirst ? activate : create);
      const state = await snapshot(t.id);
      expect(state.variants).toHaveLength(createFirst ? 3 : 2);
      expect(state.variants.every((v) => v.sizeId === s.id)).toBe(true);
    }
  });
  it('conserva filtros previos, referencias SKU y costo resuelto con una receta propia', async () => {
    const { t, a } = await fixture();
    const s = await size();
    await dimension(t.id, { ...attr('Color'), definesVariant: true }, 'rojo').expect(201);
    const recipe: Product = {
      id: 'recipe',
      name: 'Receta propia',
      parentId: null,
      components: [
        {
          id: 'component',
          kind: 'article',
          category: 'material',
          articleId: a.id,
          attributeFilter: { color: 'rojo' },
          quantity: 2,
        },
      ],
    };
    const cost = async () => {
      const row = (await get(`/api/articles/${a.id}`)).body as ArticleDetail;
      return resolveCost({
        products: [recipe],
        productId: recipe.id,
        size: s.id,
        articles: [
          {
            id: row.id,
            name: row.name,
            stockUnit: row.stockUnit,
            variants: row.variants.map((v) => ({ ...v, averageCost: cents(v.averageCost) })),
          },
        ],
      });
    };
    const before = await cost();
    const references = structuredClone(recipe);
    const filter = `/api/articles?typeId=${t.id}&attr=color:rojo&inStock=true`;
    const ids = () => get(filter).then((r) => (r.body as ArticleDetail[]).map((row) => row.id));
    expect(await ids()).toEqual([a.id]);
    await dimension(t.id, { ...attr('Lote'), definesVariant: true }, 'A').expect(201);
    await dimension(t.id, attr('Origen', false), 'Local').expect(201);
    await enable(t.id, s.id).expect(201);
    expect(await cost()).toEqual(before);
    expect(before.total).toBe(2700);
    expect(recipe).toEqual(references);
    expect(await ids()).toEqual([a.id]);
  });
});
