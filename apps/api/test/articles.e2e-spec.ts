import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { eq } from 'drizzle-orm';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import type {
  ArticleDetail,
  ArticleSummary,
  ArticleVariant,
  Attribute,
  CostChange,
} from '@moss/contracts';
import { AppModule } from '../src/app.module.js';
import { DATABASE, type Database } from '../src/database/database.module.js';
import { partners, users } from '../src/database/schema.js';
import { preparePartners } from './partners-fixture.js';
import { issueSession, SESSION_COOKIE } from '../src/auth/session.js';
import { loadEnvFile } from '../src/config/load-env-file.js';
import { deleteCatalogByPrefix } from './catalog-cleanup.js';

loadEnvFile();
if (process.env.DATABASE_URL_TEST) process.env.DATABASE_URL = process.env.DATABASE_URL_TEST;
process.env.SESSION_SECRET = 'solo-pruebas-api-no-usar-en-produccion';

describe('artículos y variantes (PostgreSQL real)', () => {
  let app: INestApplication<App>;
  let db: Database;
  let partnerId: string;
  let cookie: string;
  const prefix = `e2e-${randomUUID().slice(0, 8)}`;
  const skuPrefix = `E2E${randomUUID().slice(0, 6).toUpperCase()}`;
  let macetaType: string;
  let sustratoType: string;
  const attributeIds: Record<string, string> = {};

  const api = () => request(app.getHttpServer());
  const get = (path: string) => api().get(path).set('Cookie', cookie);
  const post = (path: string, body: object) => api().post(path).set('Cookie', cookie).send(body);
  const patch = (path: string, body: object) => api().patch(path).set('Cookie', cookie).send(body);
  const del = (path: string) => api().delete(path).set('Cookie', cookie);
  const sku = (suffix: string) => `${skuPrefix}-${suffix}`;

  async function createType(name: string, attributes: object[]): Promise<string> {
    const type = await post('/api/article-types', { name: `${prefix} ${name}` });
    expect(type.status).toBe(201);
    const id = (type.body as { id: string }).id;
    for (const attribute of attributes) {
      const created = await post(`/api/article-types/${id}/attributes`, attribute);
      expect(created.status).toBe(201);
      attributeIds[(created.body as Attribute).key] = (created.body as Attribute).id;
    }
    return id;
  }

  function variant(suffix: string, attributes: object, overrides: object = {}) {
    return {
      sku: sku(suffix),
      attributes,
      averageCost: 1500,
      price: 3500,
      stock: 10,
      ...overrides,
    };
  }

  function maceta(name: string, variants: object[], overrides: object = {}) {
    return {
      articleTypeId: macetaType,
      name: `${prefix} ${name}`,
      stockUnit: 'piece',
      sold: true,
      usedInRecipes: true,
      fixedAttributes: { material: 'concreto', codigo: 'A:1' },
      variants,
      ...overrides,
    };
  }

  async function createArticle(body: object): Promise<ArticleDetail> {
    const response = await post('/api/articles', body);
    expect(response.status, JSON.stringify(response.body)).toBe(201);
    return response.body as ArticleDetail;
  }

  async function list(query: string): Promise<ArticleSummary[]> {
    const response = await get(`/api/articles?${query}`);
    expect(response.status, JSON.stringify(response.body)).toBe(200);
    return (response.body as ArticleSummary[]).filter((row) => row.name.startsWith(prefix));
  }

  beforeAll(async () => {
    const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = module.createNestApplication();
    app.setGlobalPrefix('api');
    await app.init();
    db = module.get(DATABASE);
    // Socios de prueba fijos de S1 (solo puede haber dos); no se borran al terminar.
    const user = await preparePartners(db);
    [{ id: partnerId }] = (await db
      .select({ id: partners.id })
      .from(partners)
      .where(eq(partners.userId, user.id))) as [{ id: string }];
    cookie = `${SESSION_COOKIE}=${issueSession(user.id, user.sessionVersion, process.env.SESSION_SECRET!)}`;
    macetaType = await createType('Maceta', [
      {
        name: 'Material',
        dataType: 'list',
        options: ['concreto', 'barro'],
        required: true,
        definesVariant: false,
      },
      { name: 'Drenaje', dataType: 'boolean', required: false, definesVariant: false },
      { name: 'Código', dataType: 'text', required: false, definesVariant: false },
      {
        name: 'Forma',
        dataType: 'list',
        options: ['redonda', 'cuadrada'],
        required: true,
        definesVariant: true,
      },
      { name: 'Diámetro', dataType: 'number', unit: 'cm', required: true, definesVariant: true },
    ]);
    sustratoType = await createType('Sustrato', [
      { name: 'Composición', dataType: 'text', required: true, definesVariant: false },
    ]);
  });

  afterAll(async () => {
    if (db) {
      await deleteCatalogByPrefix(db, prefix);
    }
    await app?.close();
  });

  it('exige sesión', async () => {
    const id = randomUUID();
    for (const response of await Promise.all([
      api().get('/api/articles'),
      api().get(`/api/articles/${id}`),
      api().post('/api/articles').send({}),
      api().patch(`/api/articles/${id}`).send({ active: false }),
      api().post(`/api/articles/${id}/variants`).send({}),
      api().patch(`/api/articles/${id}/variants/${id}`).send({ active: false }),
      api().get(`/api/articles/${id}/variants/${id}/cost-history`),
    ])) {
      expect(response.status).toBe(401);
    }
  });

  it('crea un artículo con sus variantes, normaliza el SKU y registra el costo inicial', async () => {
    const created = await createArticle(
      maceta('Concreto', [
        variant(
          'r08-gr',
          { forma: 'redonda', diametro: 8 },
          { sku: ` ${sku('r08')} `.toLowerCase(), stock: 2.5 },
        ),
        variant(
          'c10',
          { forma: 'cuadrada', diametro: 10 },
          { averageCost: 2000, price: null, stock: 0 },
        ),
      ]),
    );
    expect(created).toMatchObject({
      name: `${prefix} Concreto`,
      articleType: { id: macetaType, name: `${prefix} Maceta` },
      stockUnit: 'piece',
      description: null,
      fixedAttributes: { material: 'concreto', codigo: 'A:1' },
      active: true,
    });
    expect(
      created.variants.map((v) => [v.sku, v.attributes, v.averageCost, v.price, v.stock]),
    ).toEqual([
      [sku('R08'), { forma: 'redonda', diametro: 8 }, 1500, 3500, 2.5],
      [sku('C10'), { forma: 'cuadrada', diametro: 10 }, 2000, null, 0],
    ]);
    const history = await get(
      `/api/articles/${created.id}/variants/${created.variants[0]!.id}/cost-history`,
    );
    expect(history.status).toBe(200);
    expect(history.body).toEqual([
      expect.objectContaining({
        previousCost: null,
        averageCost: 1500,
        reason: 'initial',
        changedBy: { id: partnerId, name: 'Socio de prueba' },
      }),
    ]);
    const detail = await get(`/api/articles/${created.id}`);
    expect(detail.body).toEqual(created);
  });

  it('valida los atributos contra el tipo con 422 y detalles por ruta', async () => {
    const missing = await post(
      '/api/articles',
      maceta('Sin material', [variant('x1', { forma: 'redonda', diametro: 8 })], {
        fixedAttributes: {},
      }),
    );
    expect(missing.status).toBe(422);
    expect(missing.body).toMatchObject({
      code: 'INVALID_ATTRIBUTES',
      details: [expect.objectContaining({ path: 'fixedAttributes.material' })],
    });
    const badOption = await post(
      '/api/articles',
      maceta('Plástico', [variant('x2', { forma: 'ovalada', diametro: 8 })]),
    );
    expect(badOption.body).toMatchObject({
      code: 'INVALID_ATTRIBUTES',
      details: [expect.objectContaining({ path: 'variants.0.attributes.forma' })],
    });
    const unknown = await post(
      '/api/articles',
      maceta('Extra', [variant('x3', { forma: 'redonda', diametro: 8, color: 'gris' })]),
    );
    expect(unknown.status).toBe(422);
    const variantMissing = await post(
      '/api/articles',
      maceta('Incompleta', [variant('x4', { forma: 'redonda' })]),
    );
    expect(variantMissing.body).toMatchObject({ code: 'INVALID_ATTRIBUTES' });
  });

  it('aplica las reglas de dominio de artículo y variante con 422', async () => {
    const flags = await post(
      '/api/articles',
      maceta('Sin uso', [variant('f1', { forma: 'redonda', diametro: 6 })], {
        sold: false,
        usedInRecipes: false,
      }),
    );
    expect(flags.body).toMatchObject({ code: 'INVALID_FLAGS' });
    const badSku = await post(
      '/api/articles',
      maceta('SKU raro', [variant('f2', { forma: 'redonda', diametro: 6 }, { sku: 'MAC CON' })]),
    );
    expect(badSku.body).toMatchObject({ code: 'INVALID_SKU' });
    const repeated = await post(
      '/api/articles',
      maceta('Repetida', [
        variant('f3', { forma: 'redonda', diametro: 6 }),
        variant('f4', { diametro: 6, forma: 'redonda' }),
      ]),
    );
    expect(repeated.status).toBe(422);
    expect(repeated.body).toMatchObject({ code: 'DUPLICATE_COMBINATION' });
    const badStock = await post(
      '/api/articles',
      maceta('Existencia', [variant('f5', { forma: 'redonda', diametro: 6 }, { stock: 0.0005 })]),
    );
    expect(badStock.body).toMatchObject({ code: 'INVALID_STOCK' });
  });

  it('SKU y combinación son únicos también contra variantes inactivas; el conflicto ofrece reactivar', async () => {
    const article = await createArticle(
      maceta('Barro', [variant('b1', { forma: 'redonda', diametro: 12 })], {
        fixedAttributes: { material: 'barro' },
      }),
    );
    const [first] = article.variants;
    expect(
      (await patch(`/api/articles/${article.id}/variants/${first!.id}`, { active: false })).body,
    ).toMatchObject({ active: false });

    const sameCombination = await post(
      `/api/articles/${article.id}/variants`,
      variant('b2', { forma: 'redonda', diametro: 12 }),
    );
    expect(sameCombination.status).toBe(422);
    expect(sameCombination.body).toEqual({
      code: 'DUPLICATE_COMBINATION',
      message: `La variante ${sku('B1')} ya tiene esa combinación de atributos. Está desactivada: reactívala en lugar de crearla.`,
      details: { variantId: first!.id, active: false },
    });

    const other = await createArticle(
      maceta('Otra', [variant('o1', { forma: 'cuadrada', diametro: 6 })]),
    );
    const sameSku = await post(
      `/api/articles/${other.id}/variants`,
      variant('b1', { forma: 'redonda', diametro: 6 }),
    );
    expect(sameSku.status).toBe(422);
    expect(sameSku.body).toMatchObject({
      code: 'DUPLICATE_SKU',
      details: { variantId: first!.id, active: false },
    });

    const reactivated = await patch(`/api/articles/${article.id}/variants/${first!.id}`, {
      active: true,
    });
    expect(reactivated.body).toMatchObject({ active: true });
    const added = await post(
      `/api/articles/${article.id}/variants`,
      variant('b16', { forma: 'redonda', diametro: 16 }),
    );
    expect(added.status).toBe(201);
    const renamed = await patch(
      `/api/articles/${article.id}/variants/${(added.body as ArticleVariant).id}`,
      { attributes: { forma: 'redonda', diametro: 12 } },
    );
    expect(renamed.body).toMatchObject({ code: 'DUPLICATE_COMBINATION' });
  });

  it('un artículo sin atributos de variante tiene una sola variante con atributos vacíos', async () => {
    const article = await createArticle({
      articleTypeId: sustratoType,
      name: `${prefix} Fibra de coco`,
      stockUnit: 'bag',
      sold: false,
      usedInRecipes: true,
      fixedAttributes: { composicion: 'Cáscara de coco' },
      variants: [{ sku: sku('fib'), averageCost: 0, price: null, stock: 40 }],
    });
    expect(article.variants).toEqual([expect.objectContaining({ attributes: {}, stock: 40 })]);
    const second = await post(`/api/articles/${article.id}/variants`, {
      sku: sku('fib2'),
      averageCost: 0,
      price: null,
      stock: 1,
    });
    expect(second.body).toMatchObject({ code: 'DUPLICATE_COMBINATION' });
  });

  it('historial: editar el costo agrega una entrada manual; precio, existencia o el mismo costo no', async () => {
    const article = await createArticle(
      maceta('Historial', [variant('h1', { forma: 'redonda', diametro: 10 })]),
    );
    const path = `/api/articles/${article.id}/variants/${article.variants[0]!.id}`;
    expect((await patch(path, { price: 4000, stock: 3 })).status).toBe(200);
    expect((await patch(path, { averageCost: 1500 })).status).toBe(200);
    expect((await patch(path, { averageCost: 1800 })).body).toMatchObject({ averageCost: 1800 });
    const history = (await get(`${path}/cost-history`)).body as CostChange[];
    expect(history.map((entry) => [entry.reason, entry.previousCost, entry.averageCost])).toEqual([
      ['manual', 1500, 1800],
      ['initial', null, 1500],
    ]);
    expect(history[0]!.changedBy).toEqual({ id: partnerId, name: 'Socio de prueba' });
  });

  it('el SKU de una variante se edita con normalización, formato y unicidad', async () => {
    const article = await createArticle(
      maceta('SKU editable', [
        variant('se1', { forma: 'redonda', diametro: 9 }),
        variant('se2', { forma: 'cuadrada', diametro: 9 }),
      ]),
    );
    const [first, second] = article.variants;
    const path = `/api/articles/${article.id}/variants/${first!.id}`;
    const renamed = await patch(path, { sku: ` ${sku('se1-nuevo').toLowerCase()} ` });
    expect(renamed.status).toBe(200);
    expect(renamed.body).toMatchObject({ sku: sku('SE1-NUEVO') });
    const taken = await patch(path, { sku: second!.sku.toLowerCase() });
    expect(taken.status).toBe(422);
    expect(taken.body).toMatchObject({
      code: 'DUPLICATE_SKU',
      details: { variantId: second!.id, active: true },
    });
    expect((await patch(path, { sku: 'SKU INVÁLIDO' })).body).toMatchObject({
      code: 'INVALID_SKU',
    });
    // El SKU anterior queda libre para otro artículo (p. ej. al corregir una unidad mal capturada).
    const reused = await createArticle(
      maceta('SKU reutilizado', [variant('se1', { forma: 'redonda', diametro: 9 })]),
    );
    expect(reused.variants[0]!.sku).toBe(sku('SE1'));
  });

  it('si se borra el socio, su historial de costo se conserva sin socio (ON DELETE SET NULL)', async () => {
    // Segundo socio de prueba: se borra y se vuelve a crear con preparePartners al final.
    const [other] = await db
      .select()
      .from(users)
      .where(eq(users.email, 'e2e-partner-2@example.test'));
    const otherUserId = other!.id;
    const otherCookie = `${SESSION_COOKIE}=${issueSession(otherUserId, other!.sessionVersion, process.env.SESSION_SECRET!)}`;
    const response = await api()
      .post('/api/articles')
      .set('Cookie', otherCookie)
      .send(maceta('Socio borrado', [variant('fk1', { forma: 'redonda', diametro: 7 })]));
    expect(response.status).toBe(201);
    const created = response.body as ArticleDetail;
    await db.delete(partners).where(eq(partners.userId, otherUserId));
    await db.delete(users).where(eq(users.id, otherUserId));
    const history = (
      await get(`/api/articles/${created.id}/variants/${created.variants[0]!.id}/cost-history`)
    ).body as CostChange[];
    expect(history).toEqual([
      expect.objectContaining({ reason: 'initial', averageCost: 1500, changedBy: null }),
    ]);
    // preparePartners vuelve a fijar las contraseñas (incrementa la versión de sesión): nueva cookie.
    const restored = await preparePartners(db);
    cookie = `${SESSION_COOKIE}=${issueSession(restored.id, restored.sessionVersion, process.env.SESSION_SECRET!)}`;
  });

  it('desactiva y reactiva artículos; la lista oculta inactivos salvo que se pidan', async () => {
    const article = await createArticle(
      maceta('Inactivo', [variant('i1', { forma: 'redonda', diametro: 6 })]),
    );
    expect((await patch(`/api/articles/${article.id}`, { active: false })).body).toMatchObject({
      active: false,
    });
    expect((await list(`typeId=${macetaType}`)).map((row) => row.id)).not.toContain(article.id);
    expect(
      (await list(`typeId=${macetaType}&includeInactive=true`)).map((row) => row.id),
    ).toContain(article.id);
    expect((await patch(`/api/articles/${article.id}`, { active: true })).body).toMatchObject({
      active: true,
    });
    const unknownField = await patch(`/api/articles/${article.id}`, { stockUnit: 'm' });
    expect(unknownField.status).toBe(400);
  });

  describe('filtros de la lista', () => {
    let small: ArticleDetail;
    let large: ArticleDetail;

    beforeAll(async () => {
      small = await createArticle(
        maceta(
          'Filtro chica',
          [
            variant('fc8', { forma: 'redonda', diametro: 8 }, { averageCost: 900, stock: 5 }),
            variant('fc10', { forma: 'redonda', diametro: 10 }, { averageCost: 1200, stock: 0 }),
          ],
          { fixedAttributes: { material: 'barro', drenaje: true, codigo: 'B:2:3' } },
        ),
      );
      large = await createArticle(
        maceta(
          'Filtro grande',
          [variant('fg10', { forma: 'cuadrada', diametro: 10 }, { stock: 0 })],
          { fixedAttributes: { material: 'barro' } },
        ),
      );
    });

    it('resume variantes activas, costo desde y existencia total', async () => {
      const [row] = await list(`typeId=${macetaType}&q=${encodeURIComponent('Filtro chica')}`);
      expect(row).toMatchObject({
        id: small.id,
        variantCount: 2,
        costFrom: 900,
        totalStock: 5,
        articleType: { name: `${prefix} Maceta` },
      });
    });

    it('filtra por atributo fijo y por atributo de variante', async () => {
      const ids = async (query: string) => (await list(query)).map((row) => row.id).sort();
      expect(await ids(`typeId=${macetaType}&attr=drenaje:true`)).toEqual([small.id]);
      expect(await ids(`typeId=${macetaType}&attr=material:barro&attr=diametro:10`)).toEqual(
        [small.id, large.id].sort(),
      );
      expect(
        await ids(`typeId=${macetaType}&attr=material:barro&attr=diametro:10&attr=forma:cuadrada`),
      ).toEqual([large.id]);
    });

    it('con existencia exige una variante activa con stock > 0 que cumpla los filtros de variante', async () => {
      const ids = async (query: string) => (await list(query)).map((row) => row.id);
      // Ninguna variante de 10 cm tiene existencia.
      expect(
        await ids(`typeId=${macetaType}&attr=material:barro&attr=diametro:10&inStock=true`),
      ).toEqual([]);
      // Sin filtro de variante: basta una variante activa con existencia.
      const inStock = await ids(`typeId=${macetaType}&attr=material:barro&inStock=true`);
      expect(inStock).toContain(small.id);
      expect(inStock).not.toContain(large.id);
    });

    it('el valor del filtro puede contener «:»', async () => {
      expect(
        (await list(`typeId=${macetaType}&attr=${encodeURIComponent('codigo:B:2:3')}`)).map(
          (row) => row.id,
        ),
      ).toEqual([small.id]);
    });

    it('busca por nombre o SKU sin distinguir mayúsculas', async () => {
      expect((await list(`q=${encodeURIComponent('filtro GRANDE')}`)).map((row) => row.id)).toEqual(
        [large.id],
      );
      expect((await list(`q=${sku('fc8').toLowerCase()}`)).map((row) => row.id)).toEqual([
        small.id,
      ]);
    });

    it('rechaza filtros mal formados (400) y atributos o valores que el tipo no tiene (422)', async () => {
      expect((await get('/api/articles?attr=diametro:10')).status).toBe(400);
      expect((await get(`/api/articles?typeId=${macetaType}&attr=diametro`)).status).toBe(400);
      const unknown = await get(`/api/articles?typeId=${macetaType}&attr=peso:10`);
      expect(unknown.status).toBe(422);
      expect(unknown.body).toMatchObject({ code: 'INVALID_FILTER' });
      expect(
        (await get(`/api/articles?typeId=${macetaType}&attr=diametro:diez`)).body,
      ).toMatchObject({ code: 'INVALID_FILTER' });
    });
  });

  describe('bloqueos de C1 con artículos guardados', () => {
    const attribute = (key: string) =>
      `/api/article-types/${macetaType}/attributes/${attributeIds[key]}`;

    beforeAll(async () => {
      await createArticle(
        maceta('Bloqueos', [variant('bl1', { forma: 'redonda', diametro: 8 })], {
          fixedAttributes: { material: 'concreto' },
        }),
      );
    });

    it('no borra un atributo en uso ni un tipo con artículos', async () => {
      const response = await del(attribute('material'));
      expect(response.status).toBe(409);
      expect(response.body).toMatchObject({ code: 'ATTRIBUTE_IN_USE' });
      const type = await del(`/api/article-types/${macetaType}`);
      expect(type.status).toBe(409);
      expect(type.body).toMatchObject({ code: 'ARTICLE_TYPE_IN_USE' });
    });

    it('opciones: quitar o renombrar una en uso es 409; agregar se permite', async () => {
      expect((await patch(attribute('material'), { options: ['barro'] })).body).toMatchObject({
        code: 'ATTRIBUTE_IN_USE',
      });
      expect(
        (await patch(attribute('material'), { options: ['Concreto pulido', 'barro'] })).status,
      ).toBe(409);
      expect(
        (await patch(attribute('material'), { options: ['concreto', 'barro', 'cerámica'] })).status,
      ).toBe(200);
    });

    it('unidad y «define variante» de un atributo en uso son 409', async () => {
      expect((await patch(attribute('diametro'), { unit: 'mm' })).body).toMatchObject({
        code: 'ATTRIBUTE_IN_USE',
      });
      expect((await patch(attribute('diametro'), { definesVariant: false })).body).toMatchObject({
        code: 'ATTRIBUTE_IN_USE',
      });
    });

    it('requerido con valores faltantes, y «define variante» nuevo con variantes, son 409 VALUES_MISSING', async () => {
      const required = await patch(attribute('drenaje'), { required: true });
      expect(required.status).toBe(409);
      expect(required.body).toMatchObject({ code: 'ATTRIBUTE_VALUES_MISSING' });
      const unused = await post(`/api/article-types/${macetaType}/attributes`, {
        name: 'Acabado',
        dataType: 'text',
        required: false,
        definesVariant: false,
      });
      expect(unused.status).toBe(201);
      const variantNow = await patch(
        `/api/article-types/${macetaType}/attributes/${(unused.body as Attribute).id}`,
        { definesVariant: true },
      );
      expect(variantNow.status).toBe(409);
      expect(variantNow.body).toMatchObject({ code: 'ATTRIBUTE_VALUES_MISSING' });
      expect((variantNow.body as { message: string }).message).toMatch(/\d+ variantes?\.$/);
    });

    it('cambiar solo mayúsculas de una opción en uso es 409', async () => {
      expect((await patch(attribute('material'), { options: ['Concreto', 'barro'] })).status).toBe(
        409,
      );
    });

    it('reactivar un atributo requerido con valores faltantes es 409', async () => {
      const created = await post(`/api/article-types/${macetaType}/attributes`, {
        name: 'Sello',
        dataType: 'text',
        required: false,
        definesVariant: false,
      });
      const path = `/api/article-types/${macetaType}/attributes/${(created.body as Attribute).id}`;
      expect((await patch(path, { active: false })).status).toBe(200);
      expect((await patch(path, { required: true })).status).toBe(200);
      const reactivated = await patch(path, { active: true });
      expect(reactivated.status).toBe(409);
      expect(reactivated.body).toMatchObject({ code: 'ATTRIBUTE_VALUES_MISSING' });
    });

    it('un atributo de variante sin valores no pasa a fijo requerido si el tipo tiene artículos', async () => {
      const type = await createType('Sin valores', [
        {
          name: 'Tono',
          dataType: 'list',
          options: ['claro'],
          required: true,
          definesVariant: true,
        },
      ]);
      const tono = `/api/article-types/${type}/attributes/${attributeIds['tono']}`;
      expect((await patch(tono, { active: false })).status).toBe(200);
      await createArticle({
        articleTypeId: type,
        name: `${prefix} Sin tono`,
        stockUnit: 'piece',
        sold: true,
        usedInRecipes: false,
        variants: [{ sku: sku('tono'), averageCost: 100, price: null, stock: 1 }],
      });
      const moved = await patch(tono, { definesVariant: false, active: true });
      expect(moved.status).toBe(409);
      expect(moved.body).toMatchObject({ code: 'ATTRIBUTE_VALUES_MISSING' });
    });

    it('un atributo nuevo requerido o de variante en un tipo con artículos es 409', async () => {
      const fixed = await post(`/api/article-types/${macetaType}/attributes`, {
        name: 'Peso',
        dataType: 'number',
        required: true,
        definesVariant: false,
      });
      expect(fixed.body).toMatchObject({ code: 'ATTRIBUTE_VALUES_MISSING' });
      const variantAttribute = await post(`/api/article-types/${macetaType}/attributes`, {
        name: 'Color',
        dataType: 'list',
        options: ['gris'],
        required: true,
        definesVariant: true,
      });
      expect(variantAttribute.status).toBe(409);
    });

    it('renombrar cambia solo la etiqueta; cambiar la clave es 422 y el tipo de dato 400', async () => {
      expect((await patch(attribute('material'), { name: 'Material base' })).body).toMatchObject({
        key: 'material',
        name: 'Material base',
      });
      const key = await patch(attribute('material'), { key: 'material_base' });
      expect(key.status).toBe(422);
      expect(key.body).toMatchObject({ code: 'KEY_IMMUTABLE' });
      expect((await patch(attribute('material'), { dataType: 'text' })).status).toBe(400);
    });
  });
});
