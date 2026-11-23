import { assertDimensionSnapshot, TypeDimensionError } from '@moss/domain';
import { catalogWrite } from './catalog-write.js';
import { SizeError, assertSizeRequirement, assertSizeAssignment } from '@moss/domain';
import {
  Inject,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { and, asc, desc, eq, ilike, inArray, ne, or, sql, type SQL } from 'drizzle-orm';
import {
  ArticleError,
  assertArticleFlags,
  duplicateCombinationError,
  duplicateSkuError,
  findDuplicateCombination,
  normalizeSku,
  validateStock,
  type ExistingVariant,
} from '@moss/domain';
import {
  attributeFilterValueSchema,
  buildAttributesSchema,
  type ApiError,
  type ArticleDetail,
  type ArticleListQuery,
  type ArticleSummary,
  type ArticleVariant,
  type AttributeDefinitionForValues,
  type AttributeValues,
  type CostChange,
  type CreateArticle,
  type CreateVariant,
  type UpdateArticle,
  type UpdateVariant,
} from '@moss/contracts';
import type { z } from 'zod';
import { guardWrite, runDomainRule } from '../common/domain-errors.js';
import { DATABASE, type Database } from '../database/database.module.js';
import {
  articleTypes,
  articleVariants,
  articles,
  attributes,
  partners,
  sizes,
  variantCostChanges,
} from '../database/schema.js';

type Transaction = Parameters<Parameters<Database['transaction']>[0]>[0];
type Executor = Database | Transaction;

const variantFields = {
  sizeId: articleVariants.sizeId,
  id: articleVariants.id,
  sku: articleVariants.sku,
  attributes: articleVariants.attributes,
  averageCost: articleVariants.averageCost,
  price: articleVariants.price,
  stock: articleVariants.stock,
  active: articleVariants.active,
};

const articleFields = {
  id: articles.id,
  name: articles.name,
  description: articles.description,
  stockUnit: articles.stockUnit,
  sold: articles.sold,
  usedInRecipes: articles.usedInRecipes,
  active: articles.active,
  fixedAttributes: articles.fixedAttributes,
  articleTypeId: articleTypes.id,
  articleTypeName: articleTypes.name,
  usesSize: articleTypes.usesSize,
};

const notFound = (code: string, message: string) => new NotFoundException({ code, message });
const articleNotFound = () => notFound('ARTICLE_NOT_FOUND', 'No se encontró el artículo.');
const variantNotFound = () => notFound('VARIANT_NOT_FOUND', 'No se encontró la variante.');
const typeNotFound = () =>
  notFound('ARTICLE_TYPE_NOT_FOUND', 'No se encontró el tipo de artículo.');

/** Carrera de unicidad que la validación previa no vio: 409 con el código del dominio. */
function duplicateRace(constraint: string | undefined): ApiError {
  return constraint === 'article_variants_sku_unique'
    ? {
        code: 'DUPLICATE_SKU',
        message: 'Otra persona acaba de guardar ese SKU. Recarga e intenta de nuevo.',
      }
    : {
        code: 'DUPLICATE_COMBINATION',
        message: 'Otra persona acaba de guardar esa combinación. Recarga e intenta de nuevo.',
      };
}

function escapeLike(text: string): string {
  return text.replace(/[\\%_]/g, (character) => `\\${character}`);
}

/** Orquesta las reglas de `@moss/domain` y los esquemas de `@moss/contracts`; no tiene reglas propias. */
@Injectable()
export class ArticlesService {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async list(query: ArticleListQuery): Promise<ArticleSummary[]> {
    const conditions: SQL[] = [];
    if (!query.includeInactive) conditions.push(eq(articles.active, true));
    if (query.typeId) conditions.push(eq(articles.articleTypeId, query.typeId));
    if (query.q) {
      const pattern = `%${escapeLike(query.q)}%`;
      conditions.push(
        or(
          ilike(articles.name, pattern),
          sql`EXISTS (SELECT 1 FROM ${articleVariants} WHERE ${articleVariants.articleId} = ${articles.id} AND ${articleVariants.sku} ILIKE ${pattern})`,
        )!,
      );
    }
    const fixed: AttributeValues = {};
    const variant: AttributeValues = {};
    if (query.attr && query.typeId) {
      const definitions = await this.definitions(this.db, query.typeId);
      for (const filter of query.attr) {
        const definition = definitions.find((candidate) => candidate.key === filter.key);
        if (!definition) {
          throw new UnprocessableEntityException({
            code: 'INVALID_FILTER',
            message: `El tipo no tiene el atributo «${filter.key}».`,
          });
        }
        const parsed = attributeFilterValueSchema(definition).safeParse(filter.value);
        if (!parsed.success) {
          throw new UnprocessableEntityException({
            code: 'INVALID_FILTER',
            message: parsed.error.issues[0]!.message,
          });
        }
        (definition.definesVariant ? variant : fixed)[definition.key] = parsed.data;
      }
    }
    if (Object.keys(fixed).length > 0) {
      conditions.push(sql`${articles.fixedAttributes} @> ${JSON.stringify(fixed)}::jsonb`);
    }
    if (Object.keys(variant).length > 0 || query.inStock || query.sizeId) {
      // Una misma variante activa debe cumplir los filtros de variante y, si se pide, tener existencia.
      conditions.push(sql`EXISTS (
        SELECT 1 FROM ${articleVariants}
        WHERE ${articleVariants.articleId} = ${articles.id}
          AND ${articleVariants.active}
          AND ${articleVariants.attributes} @> ${JSON.stringify(variant)}::jsonb
          ${query.sizeId ? sql`AND ${articleVariants.sizeId} = ${query.sizeId}` : sql``}
          ${query.inStock ? sql`AND ${articleVariants.stock} > 0` : sql``}
      )`);
    }

    const activeVariants = this.db
      .select({
        articleId: articleVariants.articleId,
        variantCount: sql<number>`count(*)::int`.as('variant_count'),
        costFrom: sql<number | null>`min(${articleVariants.averageCost})`.as('cost_from'),
        totalStock: sql<string>`coalesce(sum(${articleVariants.stock}), 0)`.as('total_stock'),
      })
      .from(articleVariants)
      .where(eq(articleVariants.active, true))
      .groupBy(articleVariants.articleId)
      .as('active_variants');

    const rows = await this.db
      .select({
        id: articles.id,
        name: articles.name,
        stockUnit: articles.stockUnit,
        sold: articles.sold,
        usedInRecipes: articles.usedInRecipes,
        active: articles.active,
        articleTypeId: articleTypes.id,
        articleTypeName: articleTypes.name,
        usesSize: articleTypes.usesSize,
        variantCount: activeVariants.variantCount,
        costFrom: activeVariants.costFrom,
        totalStock: activeVariants.totalStock,
      })
      .from(articles)
      .innerJoin(articleTypes, eq(articleTypes.id, articles.articleTypeId))
      .leftJoin(activeVariants, eq(activeVariants.articleId, articles.id))
      .where(and(...conditions))
      .orderBy(sql`lower(${articles.name})`, asc(articles.id));

    return rows.map(
      ({
        articleTypeId,
        articleTypeName,
        usesSize,
        variantCount,
        costFrom,
        totalStock,
        ...row
      }) => ({
        ...row,
        articleType: { id: articleTypeId, name: articleTypeName, usesSize },
        variantCount: variantCount ?? 0,
        costFrom: costFrom === null ? null : Number(costFrom),
        totalStock: Number(totalStock ?? 0),
      }),
    );
  }

  async detail(id: string): Promise<ArticleDetail> {
    const [article] = await this.db
      .select(articleFields)
      .from(articles)
      .innerJoin(articleTypes, eq(articleTypes.id, articles.articleTypeId))
      .where(eq(articles.id, id));
    if (!article) throw articleNotFound();
    const variants = await this.db
      .select(variantFields)
      .from(articleVariants)
      .leftJoin(sizes, eq(sizes.id, articleVariants.sizeId))
      .where(eq(articleVariants.articleId, id))
      .orderBy(asc(sizes.sortOrder), asc(articleVariants.createdAt), asc(articleVariants.id));
    const { articleTypeId, articleTypeName, usesSize, ...rest } = article;
    return {
      ...rest,
      articleType: { id: articleTypeId, name: articleTypeName, usesSize },
      variants,
    };
  }

  create(input: CreateArticle, partnerId: string): Promise<ArticleDetail> {
    return catalogWrite(this.db, (tx) => new ArticlesService(tx).createLocked(input, partnerId));
  }
  private async createLocked(input: CreateArticle, partnerId: string): Promise<ArticleDetail> {
    const [type] = await this.db
      .select({ id: articleTypes.id, usesSize: articleTypes.usesSize })
      .from(articleTypes)
      .where(eq(articleTypes.id, input.articleTypeId));
    if (!type) throw typeNotFound();
    runDomainRule(ArticleError, () => assertArticleFlags(input));
    const definitions = await this.definitions(this.db, input.articleTypeId);
    const fixedAttributes = this.validateValues(definitions, 'fixed', input.fixedAttributes, [
      'fixedAttributes',
    ]);

    const prepared: (ExistingVariant & Omit<CreateVariant, 'sku' | 'attributes'>)[] = [];
    for (const [index, variant] of input.variants.entries()) {
      await this.validateSize(type.usesSize, variant.sizeId);
      const next = this.prepareVariant(definitions, variant, ['variants', index, 'attributes']);
      runDomainRule(ArticleError, () => {
        const sameSku = prepared.find((other) => other.sku === next.sku);
        if (sameSku) throw duplicateSkuError(sameSku);
        const sameCombination = findDuplicateCombination(
          next.attributes,
          prepared,
          undefined,
          next.sizeId,
        );
        if (sameCombination) throw duplicateCombinationError(sameCombination);
      });
      prepared.push({ ...next, id: `nuevo-${index}`, active: true });
    }
    await this.assertSkusAvailable(prepared.map((variant) => variant.sku));

    const articleId = await guardWrite(
      () =>
        this.db.transaction(async (tx) => {
          const [article] = await tx
            .insert(articles)
            .values({
              articleTypeId: input.articleTypeId,
              name: input.name,
              description: input.description,
              stockUnit: input.stockUnit,
              sold: input.sold,
              usedInRecipes: input.usedInRecipes,
              fixedAttributes,
            })
            .returning({ id: articles.id });
          for (const variant of prepared) {
            await this.insertVariant(tx, article!.id, variant, partnerId);
          }
          return article!.id;
        }),
      { unique: duplicateRace, foreignKey: typeNotFound },
    );
    return this.detail(articleId);
  }

  async update(id: string, patch: UpdateArticle): Promise<ArticleDetail> {
    // Clientes sin snapshot: captura antes de esperar el bloqueo para detectar carreras en vuelo.
    const expected =
      patch.fixedAttributes === undefined
        ? undefined
        : (patch.expectedFixedAttributes ?? (await this.detail(id)).fixedAttributes);
    return catalogWrite(this.db, (tx) => new ArticlesService(tx).updateLocked(id, patch, expected));
  }

  private async updateLocked(
    id: string,
    patch: UpdateArticle,
    expected?: AttributeValues,
  ): Promise<ArticleDetail> {
    const current = await this.detail(id);
    runDomainRule(ArticleError, () =>
      assertArticleFlags({
        sold: patch.sold ?? current.sold,
        usedInRecipes: patch.usedInRecipes ?? current.usedInRecipes,
      }),
    );
    if (expected !== undefined)
      runDomainRule(
        TypeDimensionError,
        () => assertDimensionSnapshot(current.fixedAttributes, expected),
        409,
      );
    const { fixedAttributes, expectedFixedAttributes: _expected, ...rest } = patch;
    const values =
      fixedAttributes === undefined
        ? undefined
        : this.validateValues(
            await this.definitions(this.db, current.articleType.id),
            'fixed',
            fixedAttributes,
            ['fixedAttributes'],
          );
    await this.db
      .update(articles)
      .set({ ...rest, ...(values !== undefined && { fixedAttributes: values }) })
      .where(eq(articles.id, id));
    return this.detail(id);
  }

  addVariant(articleId: string, input: CreateVariant, partnerId: string): Promise<ArticleVariant> {
    return catalogWrite(this.db, (tx) =>
      new ArticlesService(tx).addVariantLocked(articleId, input, partnerId),
    );
  }
  private async addVariantLocked(
    articleId: string,
    input: CreateVariant,
    partnerId: string,
  ): Promise<ArticleVariant> {
    const article = await this.detail(articleId);
    const definitions = await this.definitions(this.db, article.articleType.id);
    await this.validateSize(article.articleType.usesSize, input.sizeId);
    const next = this.prepareVariant(definitions, input, ['attributes']);
    runDomainRule(ArticleError, () => {
      const duplicate = findDuplicateCombination(
        next.attributes,
        article.variants,
        undefined,
        next.sizeId,
      );
      if (duplicate) throw duplicateCombinationError(duplicate);
    });
    await this.assertSkusAvailable([next.sku]);
    return guardWrite(
      () => this.db.transaction((tx) => this.insertVariant(tx, articleId, next, partnerId)),
      { unique: duplicateRace },
    );
  }

  async updateVariant(
    articleId: string,
    variantId: string,
    patch: UpdateVariant,
    partnerId: string,
  ): Promise<ArticleVariant> {
    let expected = patch.expectedDimension;
    if (expected === undefined && (patch.attributes !== undefined || patch.sizeId !== undefined)) {
      const current = (await this.detail(articleId)).variants.find((v) => v.id === variantId);
      if (!current) throw variantNotFound();
      expected = { attributes: current.attributes, sizeId: current.sizeId };
    }
    return catalogWrite(this.db, (tx) =>
      new ArticlesService(tx).updateVariantLocked(articleId, variantId, patch, partnerId, expected),
    );
  }
  private async updateVariantLocked(
    articleId: string,
    variantId: string,
    patch: UpdateVariant,
    partnerId: string,
    expected?: { attributes: AttributeValues; sizeId: string | null },
  ): Promise<ArticleVariant> {
    const article = await this.detail(articleId);
    const current = article.variants.find((variant) => variant.id === variantId);
    if (!current) throw variantNotFound();
    if (expected !== undefined)
      runDomainRule(
        TypeDimensionError,
        () =>
          assertDimensionSnapshot(
            current.attributes,
            expected.attributes,
            current.sizeId,
            expected.sizeId,
          ),
        409,
      );
    const sizeId = patch.sizeId === undefined ? current.sizeId : patch.sizeId;
    await this.validateSize(article.articleType.usesSize, sizeId, current.sizeId);
    const changes: Partial<typeof articleVariants.$inferInsert> = {};
    if (patch.sizeId !== undefined) changes.sizeId = sizeId;
    if (patch.sku !== undefined) {
      changes.sku = runDomainRule(ArticleError, () => normalizeSku(patch.sku!));
      if (changes.sku !== current.sku) await this.assertSkusAvailable([changes.sku], variantId);
    }
    if (patch.attributes !== undefined || patch.sizeId !== undefined) {
      const definitions = await this.definitions(this.db, article.articleType.id);
      const values = this.validateValues(
        definitions,
        'variant',
        patch.attributes ?? current.attributes,
        ['attributes'],
      );
      runDomainRule(ArticleError, () => {
        const duplicate = findDuplicateCombination(values, article.variants, variantId, sizeId);
        if (duplicate) throw duplicateCombinationError(duplicate);
      });
      changes.attributes = values;
    }
    if (patch.stock !== undefined) {
      changes.stock = runDomainRule(ArticleError, () => validateStock(patch.stock!));
    }
    if (patch.price !== undefined) changes.price = patch.price;
    if (patch.active !== undefined) changes.active = patch.active;
    const costChanged =
      patch.averageCost !== undefined && patch.averageCost !== current.averageCost;
    if (costChanged) changes.averageCost = patch.averageCost!;

    if (Object.keys(changes).length === 0) return current;
    return guardWrite(
      () =>
        this.db.transaction(async (tx) => {
          const [updated] = await tx
            .update(articleVariants)
            .set(changes)
            .where(and(eq(articleVariants.id, variantId), eq(articleVariants.articleId, articleId)))
            .returning(variantFields);
          if (costChanged) {
            await tx.insert(variantCostChanges).values({
              variantId,
              previousCost: current.averageCost,
              averageCost: patch.averageCost!,
              reason: 'manual',
              changedByPartnerId: partnerId,
            });
          }
          return updated!;
        }),
      { unique: duplicateRace },
    );
  }

  async costHistory(articleId: string, variantId: string): Promise<CostChange[]> {
    const [variant] = await this.db
      .select({ id: articleVariants.id })
      .from(articleVariants)
      .where(and(eq(articleVariants.id, variantId), eq(articleVariants.articleId, articleId)));
    if (!variant) throw variantNotFound();
    const rows = await this.db
      .select({
        id: variantCostChanges.id,
        previousCost: variantCostChanges.previousCost,
        averageCost: variantCostChanges.averageCost,
        reason: variantCostChanges.reason,
        changedAt: variantCostChanges.changedAt,
        partnerId: partners.id,
        partnerName: partners.name,
      })
      .from(variantCostChanges)
      .leftJoin(partners, eq(partners.id, variantCostChanges.changedByPartnerId))
      .where(eq(variantCostChanges.variantId, variantId))
      .orderBy(desc(variantCostChanges.changedAt), desc(variantCostChanges.id));
    return rows.map(({ partnerId, partnerName, changedAt, ...row }) => ({
      ...row,
      changedAt: changedAt.toISOString(),
      changedBy: partnerId && partnerName ? { id: partnerId, name: partnerName } : null,
    }));
  }

  private async validateSize(
    usesSize: boolean,
    sizeId: string | null,
    currentId: string | null = null,
  ): Promise<void> {
    runDomainRule(SizeError, () => assertSizeRequirement(usesSize, sizeId));
    if (sizeId === null) return;
    const [size] = await this.db.select().from(sizes).where(eq(sizes.id, sizeId));
    if (!size) throw notFound('SIZE_NOT_FOUND', 'No se encontró el tamaño.');
    runDomainRule(SizeError, () => assertSizeAssignment(size, currentId));
  }

  private definitions(db: Executor, typeId: string): Promise<AttributeDefinitionForValues[]> {
    return db
      .select({
        key: attributes.key,
        name: attributes.name,
        dataType: attributes.dataType,
        options: attributes.options,
        required: attributes.required,
        definesVariant: attributes.definesVariant,
        active: attributes.active,
      })
      .from(attributes)
      .where(eq(attributes.articleTypeId, typeId));
  }

  /** Valida con el esquema construido desde las definiciones de C1; 422 con detalles por ruta. */
  private validateValues(
    definitions: readonly AttributeDefinitionForValues[],
    scope: 'fixed' | 'variant',
    values: Record<string, unknown>,
    path: readonly (string | number)[],
  ): AttributeValues {
    const parsed = buildAttributesSchema(definitions, scope).safeParse(values);
    if (parsed.success) return parsed.data;
    throw new UnprocessableEntityException({
      code: 'INVALID_ATTRIBUTES',
      message: 'Revisa los atributos: no coinciden con la definición del tipo.',
      details: parsed.error.issues.map((issue: z.core.$ZodIssue) => ({
        path: [...path, ...issue.path, ...('keys' in issue ? [issue.keys[0]] : [])].join('.'),
        message: issue.message,
      })),
    });
  }

  private prepareVariant(
    definitions: readonly AttributeDefinitionForValues[],
    input: CreateVariant,
    path: readonly (string | number)[],
  ) {
    return {
      sizeId: input.sizeId,
      sku: runDomainRule(ArticleError, () => normalizeSku(input.sku)),
      attributes: this.validateValues(definitions, 'variant', input.attributes, path),
      averageCost: input.averageCost,
      price: input.price,
      stock: runDomainRule(ArticleError, () => validateStock(input.stock)),
    };
  }

  /** El SKU es único en todo el catálogo, también contra variantes inactivas. */
  private async assertSkusAvailable(skus: readonly string[], excludeId?: string): Promise<void> {
    const existing = await this.db
      .select({
        id: articleVariants.id,
        sku: articleVariants.sku,
        attributes: articleVariants.attributes,
        active: articleVariants.active,
      })
      .from(articleVariants)
      .where(
        excludeId === undefined
          ? inArray(articleVariants.sku, [...skus])
          : and(inArray(articleVariants.sku, [...skus]), ne(articleVariants.id, excludeId)),
      );
    if (existing[0]) {
      runDomainRule(ArticleError, () => {
        throw duplicateSkuError(existing[0]!);
      });
    }
  }

  private async insertVariant(
    tx: Transaction,
    articleId: string,
    variant: {
      sizeId: string | null;
      sku: string;
      attributes: AttributeValues;
      averageCost: number;
      price: number | null;
      stock: number;
    },
    partnerId: string,
  ): Promise<ArticleVariant> {
    const [created] = await tx
      .insert(articleVariants)
      .values({
        articleId,
        sizeId: variant.sizeId,
        sku: variant.sku,
        attributes: variant.attributes,
        averageCost: variant.averageCost,
        price: variant.price,
        stock: variant.stock,
      })
      .returning(variantFields);
    await tx.insert(variantCostChanges).values({
      variantId: created!.id,
      previousCost: null,
      averageCost: variant.averageCost,
      reason: 'initial',
      changedByPartnerId: partnerId,
    });
    return created!;
  }
}
