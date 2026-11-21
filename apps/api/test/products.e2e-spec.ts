import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { eq, sql } from 'drizzle-orm';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import type {
  ArticleDetail,
  ProductCost,
  ProductDetail,
  ProductListItem,
  RecipeComponentView,
  Size,
} from '@moss/contracts';
import { AppModule } from '../src/app.module.js';
import { DATABASE, type Database } from '../src/database/database.module.js';
import { recipeComponents } from '../src/database/schema.js';
import { issueSession, SESSION_COOKIE } from '../src/auth/session.js';
import { loadEnvFile } from '../src/config/load-env-file.js';
import { preparePartners } from './partners-fixture.js';
import { deleteCatalogByPrefix } from './catalog-cleanup.js';

loadEnvFile();
if (process.env.DATABASE_URL_TEST) process.env.DATABASE_URL = process.env.DATABASE_URL_TEST;
process.env.SESSION_SECRET = 'solo-pruebas-api-no-usar-en-produccion';

describe('C4 productos y recetas (moss_test)', () => {
  let app: INestApplication<App>;
  let db: Database;
  let cookie: string;
  const prefix = `e2e-prod-${randomUUID().slice(0, 8)}`;
  const skuPrefix = `P${randomUUID().slice(0, 6).toUpperCase()}`;
  const tempSizeIds: string[] = [];
  const size: Record<'small' | 'medium' | 'large', string> = { small: '', medium: '', large: '' };
  const variant: Record<string, string> = {};
  const article: Record<string, string> = {};

  const api = () => request(app.getHttpServer());
  const get = (path: string) => api().get(path).set('Cookie', cookie);
  const post = (path: string, body: object) => api().post(path).set('Cookie', cookie).send(body);
  const patch = (path: string, body: object) => api().patch(path).set('Cookie', cookie).send(body);
  const put = (path: string, body: object) => api().put(path).set('Cookie', cookie).send(body);
  const name = (label: string) => `${prefix} ${label}`;

  async function createType(label: string, usesSize: boolean, attributes: object[] = []) {
    const type = await post('/api/article-types', { name: name(label), usesSize });
    expect(type.status, JSON.stringify(type.body)).toBe(201);
    const id = (type.body as { id: string }).id;
    for (const attribute of attributes) {
      const created = await post(`/api/article-types/${id}/attributes`, attribute);
      expect(created.status, JSON.stringify(created.body)).toBe(201);
    }
    return id;
  }

  async function createArticle(
    key: string,
    body: { articleTypeId: string; stockUnit: string; variants: object[]; usedInRecipes?: boolean },
  ) {
    const response = await post('/api/articles', {
      name: name(key),
      sold: true,
      usedInRecipes: true,
      fixedAttributes: {},
      ...body,
    });
    expect(response.status, JSON.stringify(response.body)).toBe(201);
    const created = response.body as ArticleDetail;
    article[key] = created.id;
    for (const v of created.variants) variant[v.sku.slice(skuPrefix.length + 1)] = v.id;
    return created;
  }

  const v = (suffix: string, averageCost: number, extra: object = {}) => ({
    sku: `${skuPrefix}-${suffix}`,
    averageCost,
    price: null,
    stock: 1,
    attributes: {},
    ...extra,
  });

  async function createProduct(body: object): Promise<ProductDetail> {
    const response = await post('/api/products', body);
    expect(response.status, JSON.stringify(response.body)).toBe(201);
    return response.body as ProductDetail;
  }

  async function detail(id: string): Promise<ProductDetail> {
    const response = await get(`/api/products/${id}`);
    expect(response.status, JSON.stringify(response.body)).toBe(200);
    return response.body as ProductDetail;
  }

  async function setRecipe(id: string, components: object[], expected = 200) {
    const { version } = await detail(id);
    const response = await put(`/api/products/${id}/recipe`, { version, components });
    expect(response.status, JSON.stringify(response.body)).toBe(expected);
    return response;
  }

  async function listed(query = ''): Promise<ProductListItem[]> {
    const response = await get(`/api/products${query}`);
    expect(response.status, JSON.stringify(response.body)).toBe(200);
    return (response.body as ProductListItem[]).filter((row) => row.name.startsWith(prefix));
  }

  async function cost(id: string, sizeId: string, choices: string[] = []) {
    const query = [`sizeId=${sizeId}`, ...choices.map((choice) => `choice=${choice}`)].join('&');
    return get(`/api/products/${id}/cost?${query}`);
  }

  async function tempSize(): Promise<Size> {
    const response = await post('/api/sizes', {
      key: `p_${randomUUID().replaceAll('-', '').slice(0, 20)}`,
      label: 'Temporal',
    });
    expect(response.status).toBe(201);
    tempSizeIds.push((response.body as Size).id);
    return response.body as Size;
  }

  /** Convierte un componente del detalle en la entrada de la receta, conservando su id. */
  const asInput = (component: RecipeComponentView) =>
    component.kind === 'fixed'
      ? {
          id: component.id,
          kind: 'fixed',
          concept: component.concept,
          category: component.category,
          replacesComponentId: component.replacesComponentId,
          values: component.values.map(({ sizeId, amount }) => ({ sizeId, amount })),
        }
      : {
          id: component.id,
          kind: 'article',
          articleId: component.articleId,
          variantId: component.variantId,
          attributeFilter: component.attributeFilter,
          variantSize: component.variantSize,
          concept: component.concept,
          category: component.category,
          replacesComponentId: component.replacesComponentId,
          values: component.values.map(({ sizeId, quantity }) => ({ sizeId, quantity })),
        };

  const fab = (amounts: [string | null, number][]) => ({
    kind: 'fixed',
    concept: 'Fabricación',
    category: 'labor',
    values: amounts.map(([sizeId, amount]) => ({ sizeId, amount })),
  });

  let kokedama: ProductDetail;
  let nochebuena: ProductDetail;

  beforeAll(async () => {
    const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = module.createNestApplication();
    app.setGlobalPrefix('api');
    await app.init();
    db = module.get(DATABASE);
    const user = await preparePartners(db);
    cookie = `${SESSION_COOKIE}=${issueSession(user.id, user.sessionVersion, process.env.SESSION_SECRET!)}`;

    const sizes = (await get('/api/sizes')).body as Size[];
    for (const key of ['small', 'medium', 'large'] as const) {
      size[key] = sizes.find((candidate) => candidate.key === key)!.id;
    }

    const planta = await createType('Planta', true);
    const maceta = await createType('Maceta', false, [
      {
        name: 'Forma',
        dataType: 'list',
        options: ['redonda', 'cuadrada'],
        required: true,
        definesVariant: true,
      },
      {
        name: 'Color',
        dataType: 'list',
        options: ['gris', 'blanco', 'negro'],
        required: true,
        definesVariant: true,
      },
    ]);
    const insumo = await createType('Insumo', false);
    await createArticle('planta', {
      articleTypeId: planta,
      stockUnit: 'piece',
      variants: [
        v('PL-CH', 3000, { sizeId: size.small }),
        v('PL-MD', 4500, { sizeId: size.medium }),
      ],
    });
    await createArticle('maceta', {
      articleTypeId: maceta,
      stockUnit: 'piece',
      variants: [
        v('MA-RG', 1500, { attributes: { forma: 'redonda', color: 'gris' } }),
        v('MA-RB', 1500, { attributes: { forma: 'redonda', color: 'blanco' } }),
        v('MA-CN', 2000, { attributes: { forma: 'cuadrada', color: 'negro' } }),
      ],
    });
    await createArticle('hilo', { articleTypeId: insumo, stockUnit: 'm', variants: [v('HI', 50)] });
    await createArticle('tierra', {
      articleTypeId: insumo,
      stockUnit: 'bag',
      variants: [v('TI', 11000)],
    });
    await createArticle('vitrina', {
      articleTypeId: insumo,
      stockUnit: 'piece',
      usedInRecipes: false,
      variants: [v('VI', 100)],
    });

    kokedama = await createProduct({
      name: name('Kokedama'),
      sizeOffer: { mode: 'explicit', sizeIds: [size.small, size.medium, size.large] },
    });
    await setRecipe(kokedama.id, [
      {
        kind: 'article',
        articleId: article['tierra'],
        variantId: variant['TI'],
        values: [
          { sizeId: size.small, quantity: 0.01 },
          { sizeId: size.medium, quantity: 0.015 },
          { sizeId: size.large, quantity: 0.025 },
        ],
      },
      {
        kind: 'article',
        articleId: article['hilo'],
        values: [
          { sizeId: size.small, quantity: 4 },
          { sizeId: size.medium, quantity: 6 },
          { sizeId: size.large, quantity: 8 },
        ],
      },
      fab([
        [size.small, 2000],
        [size.medium, 2500],
        [size.large, 3000],
      ]),
    ]);
    nochebuena = await createProduct({ name: name('Kokedama Nochebuena'), parentId: kokedama.id });
    await setRecipe(nochebuena.id, [
      {
        kind: 'article',
        articleId: article['planta'],
        variantSize: { match: 'produced' },
        values: [{ sizeId: null, quantity: 1 }],
      },
    ]);
    const priced = await put(`/api/products/${nochebuena.id}/prices`, {
      version: (await detail(nochebuena.id)).version,
      prices: [{ sizeId: size.small, price: 12000 }],
    });
    expect(priced.status, JSON.stringify(priced.body)).toBe(200);
  });

  afterAll(async () => {
    if (db) {
      await deleteCatalogByPrefix(db, prefix);
      for (const id of tempSizeIds) await db.execute(sql`DELETE FROM sizes WHERE id = ${id}`);
    }
    await app?.close();
  });

  it('401 sin sesión en cada endpoint', async () => {
    const id = randomUUID();
    for (const [method, url] of [
      ['get', '/api/products'],
      ['post', '/api/products'],
      ['get', `/api/products/${id}`],
      ['patch', `/api/products/${id}`],
      ['put', `/api/products/${id}/prices`],
      ['put', `/api/products/${id}/recipe`],
      ['get', `/api/products/${id}/cost?sizeId=${id}`],
    ] as const) {
      expect((await api()[method](url).send({})).status, `${method} ${url}`).toBe(401);
    }
  });

  it('400 por forma y 404 por producto o tamaño inexistente', async () => {
    expect((await post('/api/products', { name: ' ' })).status).toBe(400);
    expect((await get('/api/products/no-es-uuid')).status).toBe(400);
    expect((await get(`/api/products/${kokedama.id}/cost`)).status).toBe(400);
    const missing = randomUUID();
    for (const response of [
      await get(`/api/products/${missing}`),
      await patch(`/api/products/${missing}`, { version: 0, name: 'x' }),
      await put(`/api/products/${missing}/prices`, { version: 0, prices: [] }),
      await put(`/api/products/${missing}/recipe`, { version: 0, components: [] }),
      await cost(missing, size.small),
    ]) {
      expect(response.status).toBe(404);
      expect(response.body).toMatchObject({ code: 'PRODUCT_NOT_FOUND' });
    }
    expect((await cost(kokedama.id, randomUUID())).body).toMatchObject({ code: 'SIZE_NOT_FOUND' });
  });

  it('lista el árbol con costo D2, precio y margen por tamaño; un error de datos va por tamaño', async () => {
    const rows = await listed();
    const root = rows.find((row) => row.id === kokedama.id)!;
    const child = rows.find((row) => row.id === nochebuena.id)!;
    expect(root).toMatchObject({ depth: 1, parentId: null, sizeOfferFrom: kokedama.id });
    expect(root.componentNames).toEqual([name('tierra'), name('hilo'), 'Fabricación']);
    expect(child).toMatchObject({
      depth: 2,
      parentId: kokedama.id,
      sizeOffer: { mode: 'inherit' },
    });
    expect(rows.indexOf(child)).toBe(rows.indexOf(root) + 1);
    expect(child.sizes).toEqual([
      {
        sizeId: size.small,
        status: 'ok',
        cost: 3000 + 110 + 200 + 2000,
        price: 12000,
        marginPercent: ((12000 - 5310) / 12000) * 100,
        warning: null,
        error: null,
      },
      // 0.015 bulto × $110 = $1.65; sin precio: null, sin herencia.
      {
        sizeId: size.medium,
        status: 'ok',
        cost: 4500 + 165 + 300 + 2500,
        price: null,
        marginPercent: null,
        warning: null,
        error: null,
      },
      expect.objectContaining({
        sizeId: size.large,
        status: 'error',
        cost: null,
        error: expect.objectContaining({ code: 'NO_MATCHING_VARIANT' }),
      }),
    ]);
  });

  it('detalle con ancestros por consulta recursiva y componentes heredados', async () => {
    const view = await detail(nochebuena.id);
    expect(view.ancestors).toEqual([{ id: kokedama.id, name: name('Kokedama'), active: true }]);
    expect(view.sizes.map((entry) => entry.id)).toEqual([size.small, size.medium, size.large]);
    expect(view.prices).toEqual([{ sizeId: size.small, price: 12000 }]);
    expect(view.components).toEqual([
      expect.objectContaining({
        kind: 'article',
        articleId: article['planta'],
        variantSize: { match: 'produced' },
        values: [{ sizeId: null, quantity: 1, amount: null }],
      }),
    ]);
    expect(view.inherited.map((component) => [component.productName, component.name])).toEqual([
      [name('Kokedama'), name('tierra')],
      [name('Kokedama'), name('hilo')],
      [name('Kokedama'), 'Fabricación'],
    ]);
    expect((await detail(kokedama.id)).children).toEqual([
      { id: nochebuena.id, name: name('Kokedama Nochebuena'), active: true },
    ]);
  });

  it('desglose de D2 con cantidades fraccionarias y origen de cada línea', async () => {
    const response = await cost(nochebuena.id, size.medium);
    expect(response.status, JSON.stringify(response.body)).toBe(200);
    const body = response.body as ProductCost;
    expect(body.total).toBe(7465);
    expect(body.lines.map((line) => [line.origin, line.quantity, line.subtotal])).toEqual([
      ['own', 1, 4500],
      ['inherited', 0.015, 165],
      ['inherited', 6, 300],
      ['inherited', 1, 2500],
    ]);
    expect(body.lines[1]).toMatchObject({ stockUnit: 'bag', sourceProductId: kokedama.id });
  });

  it('sustitución heredada por id; quitar el componente sustituido es 409 sin cambios', async () => {
    const helecho = await createProduct({
      name: name('Kokedama Helecho'),
      parentId: kokedama.id,
      sizeOffer: { mode: 'explicit', sizeIds: [size.small, size.medium] },
    });
    const fabId = (await detail(kokedama.id)).components.find((c) => c.kind === 'fixed')!.id;
    await setRecipe(helecho.id, [
      {
        kind: 'fixed',
        concept: 'Fabricación (helecho)',
        category: 'labor',
        replacesComponentId: fabId,
        values: [
          { sizeId: size.small, amount: 2400 },
          { sizeId: size.medium, amount: 3000 },
        ],
      },
    ]);
    const body = (await cost(helecho.id, size.small)).body as ProductCost;
    const replacement = body.lines.find((line) => line.origin === 'own')!;
    expect(body.lines.find((line) => line.componentId === fabId)).toMatchObject({
      origin: 'overridden',
      replacedBy: replacement.componentId,
      subtotal: 2000,
    });
    expect(body.total).toBe(110 + 200 + 2400);

    const before = await detail(kokedama.id);
    const response = await put(`/api/products/${kokedama.id}/recipe`, {
      version: before.version,
      components: before.components.filter((component) => component.id !== fabId).map(asInput),
    });
    expect(response.status).toBe(409);
    expect(response.body).toMatchObject({
      code: 'COMPONENT_IN_USE',
      details: [{ componentId: fabId, productId: helecho.id }],
    });
    const after = await detail(kokedama.id);
    expect(after.version).toBe(before.version);
    expect(after.components.map((component) => component.id)).toEqual(
      before.components.map((component) => component.id),
    );
  });

  it('la receta conserva la identidad de los componentes al editarla', async () => {
    const before = await detail(kokedama.id);
    const hilo = before.components.find((component) => component.articleId === article['hilo'])!;
    const response = await put(`/api/products/${kokedama.id}/recipe`, {
      version: before.version,
      components: before.components.map((component) =>
        component.id === hilo.id
          ? {
              ...asInput(component),
              values: component.values.map(({ sizeId, quantity }) => ({
                sizeId,
                quantity: quantity! + 1,
              })),
            }
          : asInput(component),
      ),
    });
    expect(response.status, JSON.stringify(response.body)).toBe(200);
    const after = response.body as ProductDetail;
    expect(after.version).toBe(before.version + 1);
    expect(after.components.map((component) => component.id)).toEqual(
      before.components.map((component) => component.id),
    );
    expect(after.components.find((component) => component.id === hilo.id)!.values[0]).toMatchObject(
      {
        quantity: 5,
      },
    );
    // Se restaura para las demás pruebas.
    const restored = await put(`/api/products/${kokedama.id}/recipe`, {
      version: after.version,
      components: before.components.map(asInput),
    });
    expect(restored.status, JSON.stringify(restored.body)).toBe(200);
  });

  it('variantes ambiguas: «Requiere elegir variante» con candidatas y cálculo al elegir', async () => {
    const base = await createProduct({ name: name('Planta en maceta') });
    await setRecipe(base.id, [{ ...fab([[null, 800]]), concept: 'Armado' }]);
    const cactus = await createProduct({
      name: name('Cactus'),
      parentId: base.id,
      sizeOffer: { mode: 'explicit', sizeIds: [size.small] },
    });
    await setRecipe(cactus.id, [
      {
        kind: 'article',
        articleId: article['maceta'],
        attributeFilter: { forma: 'redonda' },
        values: [{ sizeId: null, quantity: 1 }],
      },
      {
        kind: 'article',
        articleId: article['planta'],
        variantSize: { match: 'size', sizeId: size.small },
        values: [{ sizeId: null, quantity: 1 }],
      },
    ]);
    const row = (await listed()).find((candidate) => candidate.id === cactus.id)!;
    expect(row.sizes).toEqual([expect.objectContaining({ status: 'needs_choice', cost: null })]);

    const pending = (await cost(cactus.id, size.small)).body as ProductCost;
    expect(pending.total).toBeNull();
    expect(pending.pendingChoices).toEqual([
      expect.objectContaining({
        articleId: article['maceta'],
        candidates: [
          expect.objectContaining({ variantId: variant['MA-RG'], unitCost: 1500 }),
          expect.objectContaining({ variantId: variant['MA-RB'], unitCost: 1500 }),
        ],
      }),
    ]);
    const componentId = pending.pendingChoices[0]!.componentId;
    const chosen = await cost(cactus.id, size.small, [`${componentId}:${variant['MA-RB']}`]);
    expect(chosen.status, JSON.stringify(chosen.body)).toBe(200);
    expect(chosen.body).toMatchObject({ total: 1500 + 3000 + 800, pendingChoices: [] });
    const wrong = await cost(cactus.id, size.small, [`${componentId}:${variant['MA-CN']}`]);
    expect(wrong.status).toBe(422);
    expect(wrong.body).toMatchObject({ code: 'VARIANT_NOT_ALLOWED' });
  });

  it('árbol: rechaza el cuarto nivel, ciclos y padres inexistentes (422)', async () => {
    const a = await createProduct({ name: name('Nivel 1') });
    const b = await createProduct({ name: name('Nivel 2'), parentId: a.id });
    const c = await createProduct({ name: name('Nivel 3'), parentId: b.id });
    const deep = await post('/api/products', { name: name('Nivel 4'), parentId: c.id });
    expect(deep.status).toBe(422);
    expect(deep.body).toMatchObject({ code: 'TREE_TOO_DEEP' });
    const cycle = await patch(`/api/products/${a.id}`, { version: a.version, parentId: b.id });
    expect(cycle.status).toBe(422);
    expect(cycle.body).toMatchObject({ code: 'CYCLE' });
    const self = await patch(`/api/products/${a.id}`, { version: a.version, parentId: a.id });
    expect(self.body).toMatchObject({ code: 'CYCLE' });
    const orphan = await post('/api/products', { name: name('Huérfano'), parentId: randomUUID() });
    expect(orphan.status).toBe(422);
    expect(orphan.body).toMatchObject({ code: 'PARENT_NOT_FOUND' });
    expect((await detail(a.id)).parentId).toBeNull();
  });

  it('nombre duplicado sin importar mayúsculas: 422', async () => {
    const response = await post('/api/products', { name: name('KOKEDAMA') });
    expect(response.status).toBe(422);
    expect(response.body).toMatchObject({ code: 'DUPLICATE_PRODUCT_NAME' });
  });

  it('precios: solo tamaños ofrecidos; versión obsoleta 409 sin escritura parcial', async () => {
    const current = await detail(nochebuena.id);
    const notOffered = await tempSize();
    const outside = await put(`/api/products/${kokedama.id}/prices`, {
      version: (await detail(kokedama.id)).version,
      prices: [{ sizeId: notOffered.id, price: 100 }],
    });
    expect(outside.status).toBe(422);
    expect(outside.body).toMatchObject({ code: 'SIZE_NOT_OFFERED' });

    const stale = await put(`/api/products/${nochebuena.id}/prices`, {
      version: current.version - 1,
      prices: [],
    });
    expect(stale.status).toBe(409);
    expect(stale.body).toMatchObject({ code: 'PRODUCT_CHANGED' });
    expect((await detail(nochebuena.id)).prices).toEqual(current.prices);
  });

  it('dos ediciones con la misma versión: una gana y la otra recibe 409', async () => {
    const product = await createProduct({ name: name('Concurrente') });
    const recipe = (amount: number) => ({
      version: product.version,
      components: [{ ...fab([[null, amount]]), concept: 'Armado' }],
    });
    const responses = await Promise.all([
      put(`/api/products/${product.id}/recipe`, recipe(100)),
      put(`/api/products/${product.id}/recipe`, recipe(200)),
    ]);
    expect(responses.map((response) => response.status).sort((a, b) => a - b)).toEqual([200, 409]);
    const stored = await db
      .select()
      .from(recipeComponents)
      .where(eq(recipeComponents.productId, product.id));
    expect(stored).toHaveLength(1);
    expect((await detail(product.id)).version).toBe(product.version + 1);
  });

  it('un error de validación revierte la transacción completa', async () => {
    const before = await detail(nochebuena.id);
    const response = await put(`/api/products/${nochebuena.id}/recipe`, {
      version: before.version,
      components: [
        { kind: 'fixed', concept: 'Nuevo', values: [{ sizeId: null, amount: 1 }] },
        {
          kind: 'fixed',
          concept: 'Sustituye algo ajeno',
          replacesComponentId: randomUUID(),
          values: [{ sizeId: null, amount: 1 }],
        },
      ],
    });
    expect(response.status).toBe(422);
    expect(response.body).toMatchObject({ code: 'INVALID_REPLACEMENT' });
    const after = await detail(nochebuena.id);
    expect(after.version).toBe(before.version);
    expect(after.components).toEqual(before.components);
  });

  it('registros desactivados: la referencia existente se conserva; una nueva se rechaza', async () => {
    const deactivate = await patch(`/api/articles/${article['tierra']}/variants/${variant['TI']}`, {
      active: false,
    });
    expect(deactivate.status, JSON.stringify(deactivate.body)).toBe(200);
    try {
      const line = ((await cost(nochebuena.id, size.small)).body as ProductCost).lines.find(
        (candidate) => candidate.variantId === variant['TI'],
      );
      expect(line).toMatchObject({ variantInactive: true, subtotal: 110 });
      const kept = await detail(kokedama.id);
      const resend = await put(`/api/products/${kokedama.id}/recipe`, {
        version: kept.version,
        components: kept.components.map(asInput),
      });
      expect(resend.status, JSON.stringify(resend.body)).toBe(200);
      const fresh = await createProduct({ name: name('Con variante inactiva') });
      const rejected = await setRecipe(
        fresh.id,
        [
          {
            kind: 'article',
            articleId: article['tierra'],
            variantId: variant['TI'],
            values: [{ sizeId: null, quantity: 1 }],
          },
        ],
        422,
      );
      expect(rejected.body).toMatchObject({ code: 'VARIANT_INACTIVE' });
      const notForRecipes = await setRecipe(
        fresh.id,
        [
          {
            kind: 'article',
            articleId: article['vitrina'],
            values: [{ sizeId: null, quantity: 1 }],
          },
        ],
        422,
      );
      expect(notForRecipes.body).toMatchObject({ code: 'ARTICLE_NOT_FOR_RECIPES' });
    } finally {
      await patch(`/api/articles/${article['tierra']}/variants/${variant['TI']}`, { active: true });
    }

    const retired = await tempSize();
    await patch(`/api/sizes/${retired.id}`, { active: false });
    const offer = await post('/api/products', {
      name: name('Tamaño inactivo'),
      sizeOffer: { mode: 'explicit', sizeIds: [retired.id] },
    });
    expect(offer.status).toBe(422);
    expect(offer.body).toMatchObject({ code: 'SIZE_INACTIVE' });
  });

  it('desactivar un producto lo oculta de la lista salvo con includeInactive', async () => {
    const product = await createProduct({ name: name('Retirado') });
    const updated = await patch(`/api/products/${product.id}`, {
      version: product.version,
      active: false,
    });
    expect(updated.status, JSON.stringify(updated.body)).toBe(200);
    expect((await listed()).some((row) => row.id === product.id)).toBe(false);
    expect(
      (await listed('?includeInactive=true')).find((row) => row.id === product.id),
    ).toMatchObject({ active: false });
    const child = await post('/api/products', {
      name: name('Hijo de retirado'),
      parentId: product.id,
    });
    expect(child.status).toBe(422);
    expect(child.body).toMatchObject({ code: 'PARENT_INACTIVE' });
  });

  it('SIZE_IN_USE en cada tabla de C4: oferta, precio, valor de componente y tamaño de variante', async () => {
    const cases: [string, (sizeId: string) => Promise<void>][] = [
      [
        'product_sizes',
        async (sizeId) => {
          await createProduct({
            name: name(`Oferta ${sizeId}`),
            sizeOffer: { mode: 'explicit', sizeIds: [sizeId] },
          });
        },
      ],
      [
        'product_prices',
        async (sizeId) => {
          const product = await createProduct({ name: name(`Precio ${sizeId}`) });
          const response = await put(`/api/products/${product.id}/prices`, {
            version: product.version,
            prices: [{ sizeId, price: 100 }],
          });
          expect(response.status, JSON.stringify(response.body)).toBe(200);
        },
      ],
      [
        'recipe_component_values',
        async (sizeId) => {
          const product = await createProduct({ name: name(`Valor ${sizeId}`) });
          await setRecipe(product.id, [{ ...fab([[sizeId, 100]]), concept: 'Armado' }]);
        },
      ],
      [
        'recipe_components.variant_size_id',
        async (sizeId) => {
          const product = await createProduct({ name: name(`Variante ${sizeId}`) });
          await setRecipe(product.id, [
            {
              kind: 'article',
              articleId: article['planta'],
              variantSize: { match: 'size', sizeId },
              values: [{ sizeId: null, quantity: 1 }],
            },
          ]);
        },
      ],
    ];
    for (const [table, reference] of cases) {
      const temporary = await tempSize();
      await reference(temporary.id);
      const listedSize = ((await get('/api/sizes')).body as Size[]).find(
        (s) => s.id === temporary.id,
      );
      expect(listedSize?.inUse, table).toBe(true);
      const response = await api().delete(`/api/sizes/${temporary.id}`).set('Cookie', cookie);
      expect(response.status, table).toBe(409);
      expect(response.body).toMatchObject({ code: 'SIZE_IN_USE' });
    }
    // Sin referencias se sigue pudiendo borrar.
    const unused = await tempSize();
    expect((await api().delete(`/api/sizes/${unused.id}`).set('Cookie', cookie)).status).toBe(204);
    tempSizeIds.splice(tempSizeIds.indexOf(unused.id), 1);
  });
});
