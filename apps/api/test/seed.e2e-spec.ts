import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { and, eq, inArray, isNull, like } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import { loadEnvFile } from '../src/config/load-env-file.js';
import * as schema from '../src/database/schema.js';
import {
  articleTypes,
  articleVariants,
  articles,
  attributes,
  products,
  variantCostChanges,
} from '../src/database/schema.js';
import { assessProductCosts } from '@moss/domain';
import type { Database } from '../src/database/database.module.js';
import { loadProductCatalog } from '../src/products/product-catalog.query.js';
import { SeedConflictError, seedCatalog, type SpecCatalog } from '../src/database/seed.js';
import { deleteCatalogByPrefix } from './catalog-cleanup.js';

loadEnvFile();
if (process.env.DATABASE_URL_TEST) process.env.DATABASE_URL = process.env.DATABASE_URL_TEST;

const specCatalog = JSON.parse(
  readFileSync(new URL('../../../docs/datos/catalogo-ejemplo.json', import.meta.url), 'utf8'),
) as SpecCatalog;

/** El catálogo real con nombres y SKU únicos para no chocar con otros datos de la base. */
function isolated(prefix: string, catalog: SpecCatalog = specCatalog): SpecCatalog {
  const sku = prefix.replace(/[^a-z0-9]/gi, '').toUpperCase();
  return {
    ...catalog,
    productos: (catalog.productos ?? []).map((product) => ({
      ...product,
      nombre: `${prefix} ${product.nombre}`,
      componentes: product.componentes.map((component) =>
        component.variante_sku === undefined
          ? component
          : { ...component, variante_sku: `${sku}-${component.variante_sku}` },
      ),
    })),
    tipos_articulo: catalog.tipos_articulo.map((type) => ({
      ...type,
      nombre: `${prefix} ${type.nombre}`,
    })),
    articulos: catalog.articulos.map((article) => ({
      ...article,
      nombre: `${prefix} ${article.nombre}`,
      variantes: article.variantes.map((variant) => ({ ...variant, sku: `${sku}-${variant.sku}` })),
    })),
  };
}

describe('db:seed con el catálogo de ejemplo (PostgreSQL real)', () => {
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  const db = drizzle(pool, { schema });
  const prefixes: string[] = [];
  const nextPrefix = () => {
    const prefix = `e2e-seed-${randomUUID().slice(0, 6)}`;
    prefixes.push(prefix);
    return prefix;
  };

  afterAll(async () => {
    for (const prefix of prefixes) await deleteCatalogByPrefix(db, prefix);
    await pool.end();
  });

  const expectedAttributes = specCatalog.tipos_articulo.reduce(
    (sum, type) =>
      sum +
      type.atributos.filter((attribute) => !['unidad_consumo', 'tamano'].includes(attribute.nombre))
        .length,
    0,
  );
  const expectedVariants = specCatalog.articulos.reduce(
    (sum, article) => sum + article.variantes.length,
    0,
  );
  const expectedProducts = specCatalog.productos!.length;
  const expectedComponents = specCatalog.productos!.reduce(
    (sum, product) => sum + product.componentes.length,
    0,
  );
  const none = {
    articleTypes: 0,
    attributes: 0,
    articles: 0,
    variants: 0,
    products: 0,
    recipeComponents: 0,
  };

  it('carga tipos, atributos, artículos y variantes; la segunda corrida no cambia nada', async () => {
    const prefix = nextPrefix();
    const catalog = isolated(prefix);
    const first = await seedCatalog(db, catalog);
    expect(first.created).toEqual({
      articleTypes: specCatalog.tipos_articulo.length,
      attributes: expectedAttributes,
      articles: specCatalog.articulos.length,
      variants: expectedVariants,
      products: expectedProducts,
      recipeComponents: expectedComponents,
    });
    expect(first.existing).toEqual(none);

    // Artículos creados en piezas porque el catálogo no les da unidad_consumo.
    const withoutUnit = specCatalog.articulos
      .filter((article) => article.atributos_fijos?.['unidad_consumo'] == null)
      .map((article) => `${prefix} ${article.nombre}`);
    expect(withoutUnit).toHaveLength(specCatalog.articulos.length - 3);
    expect(first.defaultedToPiece).toEqual(withoutUnit);

    const second = await seedCatalog(db, catalog);
    expect(second.defaultedToPiece).toEqual([]);
    expect(second.created).toEqual(none);
    expect(second.existing).toEqual(first.created);
  });

  it('siembra size_id sin tamano y mantiene referencias de recetas por tamaño', async () => {
    const prefix = nextPrefix();
    const catalog = isolated(prefix);
    await seedCatalog(db, catalog);
    await seedCatalog(db, catalog);
    const types = await db
      .select()
      .from(articleTypes)
      .where(like(articleTypes.name, `${prefix}%`));
    expect(types.filter((t) => t.usesSize).map((t) => t.name)).toEqual([`${prefix} Planta`]);
    const variants = await db
      .select({
        sku: articleVariants.sku,
        sizeId: articleVariants.sizeId,
        attributes: articleVariants.attributes,
        historyId: variantCostChanges.id,
      })
      .from(articleVariants)
      .innerJoin(articles, eq(articles.id, articleVariants.articleId))
      .innerJoin(variantCostChanges, eq(variantCostChanges.variantId, articleVariants.id))
      .where(like(articles.name, `${prefix}%`));
    expect(variants).toHaveLength(expectedVariants);
    expect(variants.filter((v) => v.sizeId !== null)).toHaveLength(11);
    expect(variants.every((v) => !('tamano' in v.attributes))).toBe(true);
    const sizes = await db.select().from(schema.sizes);
    const mapping: Record<string, string> = {
      mini: 'mini',
      chico: 'small',
      mediano: 'medium',
      grande: 'large',
    };
    for (const product of specCatalog.productos ?? []) {
      for (const component of product.componentes) {
        if (
          !('filtro_atributos' in component) ||
          !component.filtro_atributos ||
          !('tamano' in component.filtro_atributos)
        )
          continue;
        const raw = component.filtro_atributos.tamano;
        const required = raw === '{tamano}' ? ['chico', 'mediano'] : [String(raw)];
        const source = catalog.articulos.find((a) => a.id === component.articulo_id)!;
        for (const value of required) {
          const size = sizes.find((s) => s.key === mapping[value])!;
          expect(size).toBeDefined();
          expect(
            variants.some(
              (v) => v.sizeId === size.id && source.variantes.some((s) => s.sku === v.sku),
            ),
          ).toBe(true);
        }
      }
    }
    const defs = await db
      .select()
      .from(schema.attributes)
      .where(
        inArray(
          schema.attributes.articleTypeId,
          types.map((t) => t.id),
        ),
      );
    expect(defs.some((a) => a.key === 'tamano')).toBe(false);
  });

  it('traduce la unidad, las etiquetas, los enums y los montos de la especificación', async () => {
    const prefix = nextPrefix();
    await seedCatalog(db, isolated(prefix));
    const rows = await db
      .select({
        name: articles.name,
        stockUnit: articles.stockUnit,
        fixed: articles.fixedAttributes,
      })
      .from(articles)
      .where(like(articles.name, `${prefix}%`));
    const byName = Object.fromEntries(rows.map((row) => [row.name.slice(prefix.length + 1), row]));
    expect(byName['Hilo de cáñamo']).toMatchObject({ stockUnit: 'm', fixed: {} });
    expect(byName['Liga de tela para collar']).toMatchObject({ stockUnit: 'piece' });
    expect(byName['Tierra preparada']).toMatchObject({ stockUnit: 'piece' });
    // Un valor nulo del ejemplo (npk de las vitaminas) no se guarda.
    expect(byName['Vitaminas B1 enraizador']?.fixed).not.toHaveProperty('npk');

    const [material] = await db
      .select({ id: articleTypes.id })
      .from(articleTypes)
      .where(eq(articleTypes.name, `${prefix} Material de producción`));
    const materialAttributes = await db
      .select({ key: attributes.key })
      .from(attributes)
      .where(eq(attributes.articleTypeId, material!.id));
    expect(materialAttributes.map((row) => row.key)).toEqual(['color']);

    const [maceta] = await db
      .select({ id: articleTypes.id })
      .from(articleTypes)
      .where(eq(articleTypes.name, `${prefix} Maceta`));
    const macetaAttributes = await db
      .select({
        key: attributes.key,
        name: attributes.name,
        dataType: attributes.dataType,
        unit: attributes.unit,
      })
      .from(attributes)
      .where(eq(attributes.articleTypeId, maceta!.id));
    expect(macetaAttributes).toContainEqual({
      key: 'diametro',
      name: 'Diámetro',
      dataType: 'number',
      unit: 'cm',
    });
    expect(macetaAttributes).toContainEqual({
      key: 'drenaje',
      name: 'Drenaje',
      dataType: 'boolean',
      unit: null,
    });

    const sku = prefix.replace(/[^a-z0-9]/gi, '').toUpperCase();
    const [hilo] = await db
      .select()
      .from(articleVariants)
      .where(eq(articleVariants.sku, `${sku}-MAT-HIL-NAT`));
    expect(hilo).toMatchObject({
      averageCost: 50,
      price: null,
      stock: 300,
      attributes: { color: 'natural' },
    });
    const history = await db
      .select()
      .from(variantCostChanges)
      .where(eq(variantCostChanges.variantId, hilo!.id));
    expect(history).toEqual([
      expect.objectContaining({
        reason: 'initial',
        previousCost: null,
        averageCost: 50,
        changedByPartnerId: null,
      }),
    ]);
  });

  it('si la base ya tiene parte del catálogo, solo agrega lo que falta y nunca actualiza', async () => {
    const prefix = nextPrefix();
    const catalog = isolated(prefix);
    const [maceta] = await db
      .insert(articleTypes)
      .values({ name: `${prefix} Maceta` })
      .returning();
    await db.insert(attributes).values({
      articleTypeId: maceta!.id,
      key: 'material',
      name: 'Material base',
      dataType: 'list',
      options: ['concreto', 'barro', 'cerámica', 'plástico', 'vidrio'],
      required: true,
      definesVariant: false,
    });
    const report = await seedCatalog(db, catalog);
    expect(report.existing).toMatchObject({ articleTypes: 1, attributes: 1 });
    expect(report.created.articleTypes).toBe(specCatalog.tipos_articulo.length - 1);
    const [material] = await db
      .select({ name: attributes.name })
      .from(attributes)
      .where(and(eq(attributes.articleTypeId, maceta!.id), eq(attributes.key, 'material')));
    expect(material!.name).toBe('Material base');
  });

  it('un choque con datos existentes aborta todo, nombra el conflicto y no deja cambios', async () => {
    const prefix = nextPrefix();
    const [maceta] = await db
      .insert(articleTypes)
      .values({ name: `${prefix} Maceta` })
      .returning();
    await db.insert(attributes).values({
      articleTypeId: maceta!.id,
      key: 'diametro',
      name: 'Diámetro',
      dataType: 'text',
      required: false,
      definesVariant: false,
    });
    await expect(seedCatalog(db, isolated(prefix))).rejects.toThrow(SeedConflictError);
    await expect(seedCatalog(db, isolated(prefix))).rejects.toThrow(
      /diametro.*ya existe como text.*como number/,
    );
    const created = await db
      .select({ id: articleTypes.id })
      .from(articleTypes)
      .where(like(articleTypes.name, `${prefix}%`));
    expect(created.map((row) => row.id)).toEqual([maceta!.id]);
  });

  it('un SKU que ya pertenece a otro artículo aborta sin cambios', async () => {
    const prefix = nextPrefix();
    const first = isolated(prefix);
    await seedCatalog(db, first);
    const renamed: SpecCatalog = {
      ...first,
      articulos: first.articulos.map((article, index) =>
        index === 0 ? { ...article, nombre: `${prefix} Otro nombre` } : article,
      ),
    };
    await expect(seedCatalog(db, renamed)).rejects.toThrow(/SKU .* ya pertenece/);
    expect(
      await db
        .select()
        .from(articles)
        .where(eq(articles.name, `${prefix} Otro nombre`)),
    ).toEqual([]);
  });

  it('un artículo existente con otra unidad de existencia aborta sin agregarle variantes', async () => {
    const prefix = nextPrefix();
    const [type] = await db
      .insert(articleTypes)
      .values({ name: `${prefix} Material de producción` })
      .returning();
    await db.insert(articles).values({
      articleTypeId: type!.id,
      name: `${prefix} Hilo de cáñamo`,
      stockUnit: 'piece',
      sold: false,
      usedInRecipes: true,
    });
    await expect(seedCatalog(db, isolated(prefix))).rejects.toThrow(/Hilo de cáñamo.*pieza.*m/);
    const sku = prefix.replace(/[^a-z0-9]/gi, '').toUpperCase();
    expect(
      await db
        .select()
        .from(articleVariants)
        .where(eq(articleVariants.sku, `${sku}-MAT-HIL-NAT`)),
    ).toEqual([]);
  });

  it('una unidad de consumo fuera del enum aborta y nombra el valor', async () => {
    const prefix = nextPrefix();
    const catalog = isolated(prefix);
    const broken: SpecCatalog = {
      ...catalog,
      articulos: catalog.articulos.map((article) =>
        article.id === 'hilo-canamo'
          ? { ...article, atributos_fijos: { unidad_consumo: 'gramo' } }
          : article,
      ),
    };
    await expect(seedCatalog(db, broken)).rejects.toThrow(/Hilo de cáñamo.*«gramo»/);
    expect(
      await db
        .select()
        .from(articleTypes)
        .where(like(articleTypes.name, `${prefix}%`)),
    ).toEqual([]);
  });

  it('las entradas iniciales del historial del seed no tienen socio', async () => {
    const prefix = nextPrefix();
    await seedCatalog(db, isolated(prefix));
    const variantIds = (
      await db
        .select({ id: articleVariants.id })
        .from(articleVariants)
        .innerJoin(articles, eq(articles.id, articleVariants.articleId))
        .where(like(articles.name, `${prefix}%`))
    ).map((row) => row.id);
    const withoutPartner = await db
      .select()
      .from(variantCostChanges)
      .where(inArray(variantCostChanges.variantId, variantIds));
    expect(withoutPartner).toHaveLength(expectedVariants);
    expect(withoutPartner.every((row) => row.changedByPartnerId === null)).toBe(true);
    expect(
      await db.select().from(variantCostChanges).where(isNull(variantCostChanges.variantId)),
    ).toEqual([]);
  });

  describe('productos y recetas (C4)', () => {
    async function seeded(prefix: string) {
      const loaded = await loadProductCatalog(db as unknown as Database);
      const ids = new Map(
        loaded.catalog.products
          .filter((product) => product.name.startsWith(`${prefix} `))
          .map((product) => [product.name.slice(prefix.length + 1), product.id]),
      );
      const sizes = new Map(loaded.sizeRows.map((size) => [size.key, size.id]));
      const costs = new Map(
        assessProductCosts(loaded.catalog, { minMarginPercent: 0 }).map((row) => [
          row.productId,
          row.sizes,
        ]),
      );
      const costOf = (name: string, key: string) =>
        costs.get(ids.get(name)!)!.find((entry) => entry.sizeId === sizes.get(key));
      const components = (name: string) =>
        loaded.catalog.components.filter((component) => component.productId === ids.get(name));
      return { loaded, ids, sizes, costOf, components };
    }

    it('siembra árbol, oferta, precios y recetas por size_id; los costos de D2 cuadran', async () => {
      const prefix = nextPrefix();
      await seedCatalog(db, isolated(prefix));
      const { loaded, ids, sizes, costOf, components } = await seeded(prefix);

      expect(costOf('Kokedama Nochebuena', 'small')).toMatchObject({
        status: 'ok',
        cost: 5310,
        price: 12000,
      });
      // Nochebuena mediana con tierra: $74.65; con el Reno de C5 ($18.50) da los $93.15 de D2.
      expect(costOf('Kokedama Nochebuena', 'medium')).toMatchObject({
        status: 'ok',
        cost: 7465,
        price: 16000,
      });
      expect(costOf('Kokedama Helecho Boston', 'small')).toMatchObject({
        status: 'ok',
        cost: 6285,
      });
      expect(costOf('Cactus en maceta de concreto', 'small')).toMatchObject({
        status: 'needs_choice',
        cost: null,
        price: 9500,
      });
      expect(costOf('Centro de mesa suculenta mini', 'mini')).toMatchObject({ status: 'ok' });

      const helecho = loaded.catalog.products.find(
        (product) => product.id === ids.get('Kokedama Helecho Boston'),
      )!;
      expect(helecho.sizeOffer).toEqual({
        mode: 'explicit',
        sizeIds: [sizes.get('small'), sizes.get('medium')],
      });
      expect(
        loaded.catalog.products.find((product) => product.id === ids.get('Kokedama Nochebuena')),
      ).toMatchObject({
        parentId: ids.get('Kokedama'),
        sizeOffer: { mode: 'inherit' },
      });
      // {tamano} es el tamaño producido; un literal es el size_id del catálogo; nunca un atributo tamano.
      expect(components('Kokedama Nochebuena')[0]).toMatchObject({
        variantSize: { match: 'produced' },
        attributeFilter: {},
      });
      expect(components('Cactus en maceta de concreto')[0]).toMatchObject({
        variantSize: { match: 'size', sizeId: sizes.get('small') },
        attributeFilter: {},
      });
      const soil = components('Kokedama').find(
        (component) => component.kind === 'article' && component.variantId !== null,
      )!;
      expect(soil.values).toEqual([
        { sizeId: sizes.get('small'), quantity: 0.01 },
        { sizeId: sizes.get('medium'), quantity: 0.015 },
        { sizeId: sizes.get('large'), quantity: 0.025 },
      ]);
      const fab = components('Kokedama').find((component) => component.kind === 'fixed')!;
      expect(
        components('Kokedama Helecho Boston').find((component) => component.kind === 'fixed'),
      ).toMatchObject({
        replacesComponentId: fab.id,
      });
    });

    it('dos corridas conservan los mismos IDs y referencias', async () => {
      const prefix = nextPrefix();
      await seedCatalog(db, isolated(prefix));
      const before = await seeded(prefix);
      const report = await seedCatalog(db, isolated(prefix));
      expect(report.created).toEqual(none);
      expect(report.existing).toMatchObject({
        products: expectedProducts,
        recipeComponents: expectedComponents,
      });
      const after = await seeded(prefix);
      expect([...after.ids]).toEqual([...before.ids]);
      const own = (state: typeof before) =>
        state.loaded.catalog.components.filter((component) =>
          [...state.ids.values()].includes(component.productId),
        );
      expect(own(after)).toEqual(own(before));
    });

    it('un producto agregado después resuelve su sustitución contra el componente ya sembrado', async () => {
      const prefix = nextPrefix();
      const full = isolated(prefix);
      await seedCatalog(db, {
        ...full,
        productos: full.productos!.filter((product) => product.id === 'kokedama'),
      });
      const partial = await seeded(prefix);
      const fabId = partial
        .components('Kokedama')
        .find((component) => component.kind === 'fixed')!.id;
      const report = await seedCatalog(db, full);
      expect(report.existing).toMatchObject({ products: 1, recipeComponents: 4 });
      expect(report.created).toMatchObject({
        products: expectedProducts - 1,
        recipeComponents: expectedComponents - 4,
      });
      const complete = await seeded(prefix);
      expect(complete.ids.get('Kokedama')).toBe(partial.ids.get('Kokedama'));
      expect(
        complete
          .components('Kokedama Helecho Boston')
          .find((component) => component.kind === 'fixed'),
      ).toMatchObject({
        replacesComponentId: fabId,
      });
      expect(complete.costOf('Kokedama Helecho Boston', 'small')).toMatchObject({ cost: 6285 });
    });

    it('un producto existente con otro padre aborta todo sin cambios', async () => {
      const prefix = nextPrefix();
      const full = isolated(prefix);
      await seedCatalog(db, { ...full, productos: [] });
      await db.insert(products).values({ name: `${prefix} Kokedama Nochebuena` });
      await expect(seedCatalog(db, full)).rejects.toThrow(/Kokedama Nochebuena.*otro padre/);
      const rows = await db
        .select({ name: products.name })
        .from(products)
        .where(like(products.name, `${prefix}%`));
      expect(rows.map((row) => row.name)).toEqual([`${prefix} Kokedama Nochebuena`]);
    });

    it('una variante fija inexistente aborta y nombra el SKU', async () => {
      const prefix = nextPrefix();
      const full = isolated(prefix);
      const broken: SpecCatalog = {
        ...full,
        productos: full.productos!.map((product) =>
          product.id === 'kokedama'
            ? {
                ...product,
                componentes: product.componentes.map((component) =>
                  component.variante_sku ? { ...component, variante_sku: 'NO-EXISTE' } : component,
                ),
              }
            : product,
        ),
      };
      await expect(seedCatalog(db, broken)).rejects.toThrow(/Kokedama.*NO-EXISTE/);
      expect(
        await db
          .select()
          .from(products)
          .where(like(products.name, `${prefix}%`)),
      ).toEqual([]);
    });
  });
});
