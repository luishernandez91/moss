import {
  Inject,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { eq } from 'drizzle-orm';
import {
  ArticleError,
  ArticleTypeError,
  SizeError,
  TypeDimensionError,
  assertSizeRequirement,
  createAttributeDefinition,
  planAttributeDimension,
  planSizeDimension,
  type DimensionState,
} from '@moss/domain';
import {
  buildAttributesSchema,
  type Attribute,
  type AttributeDefinitionForValues,
  type CreateAttributeDimension,
} from '@moss/contracts';
import { DATABASE, type Database } from '../database/database.module.js';
import { articles, articleTypes, articleVariants, attributes, sizes } from '../database/schema.js';
import { runDomainRule } from '../common/domain-errors.js';
import { catalogWrite } from './catalog-write.js';

@Injectable()
export class TypeDimensionsService {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  createAttribute(typeId: string, input: CreateAttributeDimension): Promise<Attribute> {
    return catalogWrite(this.db, async (tx) => {
      const current = await this.load(tx, typeId);
      const definition = runDomainRule(ArticleTypeError, () =>
        createAttributeDefinition(input.attribute, current.definitions),
      );
      const next = runDomainRule(TypeDimensionError, () =>
        runDomainRule(
          ArticleError,
          () => planAttributeDimension(definition, input.initialValue, current),
          409,
        ),
      );
      this.validateFinal(
        [...current.definitions, { ...definition, active: true }],
        current.type.usesSize,
        next,
      );
      // Solo después de validar el conjunto completo se escribe. Cualquier fallo revierte todo.
      const [created] = await tx
        .insert(attributes)
        .values({ ...definition, articleTypeId: typeId })
        .returning();
      if (definition.definesVariant) {
        for (const v of next.variants)
          await tx
            .update(articleVariants)
            .set({ attributes: v.attributes })
            .where(eq(articleVariants.id, v.id));
      } else {
        for (const a of next.articles)
          await tx
            .update(articles)
            .set({ fixedAttributes: a.fixedAttributes })
            .where(eq(articles.id, a.id));
      }
      return created!;
    });
  }

  enableSize(typeId: string, initialSizeId: string): Promise<{ usesSize: true }> {
    return catalogWrite(this.db, async (tx) => {
      const current = await this.load(tx, typeId);
      const [size] = await tx.select().from(sizes).where(eq(sizes.id, initialSizeId));
      if (!size)
        throw new NotFoundException({
          code: 'SIZE_NOT_FOUND',
          message: 'No se encontró el tamaño.',
        });
      const next = runDomainRule(
        TypeDimensionError,
        () =>
          runDomainRule(SizeError, () =>
            runDomainRule(
              ArticleError,
              () => planSizeDimension(current.type.usesSize, size, current),
              409,
            ),
          ),
        409,
      );
      this.validateFinal(current.definitions, true, next);
      for (const v of next.variants)
        await tx
          .update(articleVariants)
          .set({ sizeId: v.sizeId })
          .where(eq(articleVariants.id, v.id));
      await tx.update(articleTypes).set({ usesSize: true }).where(eq(articleTypes.id, typeId));
      return { usesSize: true };
    });
  }

  private async load(tx: Database, typeId: string) {
    const [type] = await tx.select().from(articleTypes).where(eq(articleTypes.id, typeId));
    if (!type)
      throw new NotFoundException({
        code: 'ARTICLE_TYPE_NOT_FOUND',
        message: 'No se encontró el tipo de artículo.',
      });
    const definitions = await tx
      .select()
      .from(attributes)
      .where(eq(attributes.articleTypeId, typeId));
    const articleRows = await tx
      .select()
      .from(articles)
      .where(eq(articles.articleTypeId, typeId))
      .orderBy(articles.id);
    const variantRows = await tx
      .select({ variant: articleVariants })
      .from(articleVariants)
      .innerJoin(articles, eq(articles.id, articleVariants.articleId))
      .where(eq(articles.articleTypeId, typeId))
      .orderBy(articleVariants.id);
    return {
      type,
      definitions,
      articles: articleRows,
      variants: variantRows.map((row) => row.variant),
    };
  }

  private validateFinal(
    definitions: readonly AttributeDefinitionForValues[],
    usesSize: boolean,
    state: DimensionState,
  ): void {
    const fixed = buildAttributesSchema(definitions, 'fixed');
    const variant = buildAttributesSchema(definitions, 'variant');
    for (const [records, schema, scope] of [
      [state.articles.map((a) => ({ id: a.id, values: a.fixedAttributes })), fixed, 'artículo'],
      [state.variants.map((v) => ({ id: v.id, values: v.attributes })), variant, 'variante'],
    ] as const) {
      for (const record of records) {
        const parsed = schema.safeParse(record.values);
        if (!parsed.success)
          throw new UnprocessableEntityException({
            code: 'INVALID_ATTRIBUTES',
            message: `Revisa los atributos del registro (${scope}): no coinciden con la definición del tipo.`,
            details: { id: record.id, issues: parsed.error.issues },
          });
      }
    }
    for (const v of state.variants)
      runDomainRule(SizeError, () => assertSizeRequirement(usesSize, v.sizeId));
  }
}
