import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { eq, inArray, isNull, like } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import { loadEnvFile } from '../src/config/load-env-file.js';
import * as schema from '../src/database/schema.js';
import {
  articleTypes,
  articleVariants,
  articles,
  attributes,
  variantCostChanges,
} from '../src/database/schema.js';
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
      sum + type.atributos.filter((attribute) => attribute.nombre !== 'unidad_consumo').length,
    0,
  );
  const expectedVariants = specCatalog.articulos.reduce(
    (sum, article) => sum + article.variantes.length,
    0,
  );

  it('carga tipos, atributos, artículos y variantes; la segunda corrida no cambia nada', async () => {
    const prefix = nextPrefix();
    const catalog = isolated(prefix);
    const first = await seedCatalog(db, catalog);
    expect(first.created).toEqual({
      articleTypes: specCatalog.tipos_articulo.length,
      attributes: expectedAttributes,
      articles: specCatalog.articulos.length,
      variants: expectedVariants,
    });
    expect(first.existing).toEqual({ articleTypes: 0, attributes: 0, articles: 0, variants: 0 });

    const second = await seedCatalog(db, catalog);
    expect(second.created).toEqual({ articleTypes: 0, attributes: 0, articles: 0, variants: 0 });
    expect(second.existing).toEqual(first.created);
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
      .where(eq(attributes.articleTypeId, maceta!.id));
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
});
