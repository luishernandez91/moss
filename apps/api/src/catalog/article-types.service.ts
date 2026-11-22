import { catalogWrite } from './catalog-write.js';
import { SizeError, assertUsesSizeChange } from '@moss/domain';
import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, asc, eq, ne, sql } from 'drizzle-orm';
import {
  ArticleTypeError,
  AttributeUsageError,
  assessAttributeChange,
  assessAttributeDeletion,
  assessNewAttribute,
  assessTypeDeletion,
  createAttributeDefinition,
  updateAttributeDefinition,
  validateArticleTypeName,
} from '@moss/domain';
import type { ArticleType, Attribute, CreateAttribute, UpdateAttribute } from '@moss/contracts';
import { guardWrite, runDomainRule } from '../common/domain-errors.js';
import { DATABASE, type Database } from '../database/database.module.js';
import { articleTypes, attributes } from '../database/schema.js';
import { countTypeRecords, loadAttributeUsage } from './attribute-usage.query.js';

const attributeFields = {
  id: attributes.id,
  key: attributes.key,
  name: attributes.name,
  dataType: attributes.dataType,
  unit: attributes.unit,
  options: attributes.options,
  required: attributes.required,
  definesVariant: attributes.definesVariant,
  active: attributes.active,
};

const typeNotFound = () =>
  new NotFoundException({
    code: 'ARTICLE_TYPE_NOT_FOUND',
    message: 'No se encontró el tipo de artículo.',
  });
const attributeNotFound = () =>
  new NotFoundException({ code: 'ATTRIBUTE_NOT_FOUND', message: 'No se encontró el atributo.' });
const duplicateType = {
  code: 'DUPLICATE_NAME',
  message: 'Ya existe un tipo de artículo con ese nombre.',
};
const duplicateAttribute = {
  code: 'DUPLICATE_NAME',
  message: 'Ya existe un atributo con ese nombre o clave en este tipo.',
};

/** Orquesta reglas de `@moss/domain` y persistencia; no contiene reglas propias. */
@Injectable()
export class ArticleTypesService {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async list(): Promise<ArticleType[]> {
    const types = await this.db
      .select({
        id: articleTypes.id,
        name: articleTypes.name,
        usesSize: articleTypes.usesSize,
        articleCount: sql<number>`(SELECT count(*)::int FROM articles a WHERE a.article_type_id = "article_types"."id")`,
      })
      .from(articleTypes)
      .orderBy(sql`lower(${articleTypes.name})`, asc(articleTypes.id));
    const rows = await this.db
      .select({ ...attributeFields, articleTypeId: attributes.articleTypeId })
      .from(attributes)
      .orderBy(asc(attributes.createdAt), asc(attributes.id));
    const byType = new Map<string, Attribute[]>(types.map((type) => [type.id, []]));
    for (const { articleTypeId, ...attribute } of rows) {
      byType.get(articleTypeId)?.push(attribute);
    }
    return types.map((type) => ({ ...type, attributes: byType.get(type.id) ?? [] }));
  }

  async createType(name: string, usesSize = false): Promise<ArticleType> {
    const existing = await this.db
      .select({
        id: articleTypes.id,
        name: articleTypes.name,
        usesSize: articleTypes.usesSize,
        articleCount: sql<number>`(SELECT count(*)::int FROM articles a WHERE a.article_type_id = "article_types"."id")`,
      })
      .from(articleTypes);
    const validName = runDomainRule(ArticleTypeError, () =>
      validateArticleTypeName(name, existing),
    );
    const [created] = await guardWrite(
      () =>
        this.db.insert(articleTypes).values({ name: validName, usesSize }).returning({
          id: articleTypes.id,
          name: articleTypes.name,
          usesSize: articleTypes.usesSize,
        }),
      { unique: duplicateType },
    );
    return { ...created!, articleCount: 0, attributes: [] };
  }

  async renameType(
    id: string,
    name: string | undefined,
    usesSize?: boolean,
  ): Promise<Omit<ArticleType, 'attributes'>> {
    return catalogWrite(this.db, async (tx) => {
      const existing = await new ArticleTypesService(tx).list();
      const current = existing.find((t) => t.id === id);
      if (!current) throw typeNotFound();
      const nextUsesSize = usesSize ?? current.usesSize;
      runDomainRule(
        SizeError,
        () => assertUsesSizeChange(current.usesSize, nextUsesSize, current.articleCount),
        409,
      );
      const validName = runDomainRule(ArticleTypeError, () =>
        validateArticleTypeName(name ?? current.name, existing, id),
      );
      const [updated] = await guardWrite(
        () =>
          tx
            .update(articleTypes)
            .set({ name: validName, usesSize: nextUsesSize })
            .where(eq(articleTypes.id, id))
            .returning(),
        { unique: duplicateType },
      );
      if (!updated) throw typeNotFound();
      return {
        id: updated.id,
        name: updated.name,
        usesSize: updated.usesSize,
        articleCount: current.articleCount,
      };
    });
  }

  /** Borra el tipo y sus atributos, solo si no tiene artículos (activos o no). */
  deleteType(id: string): Promise<void> {
    return catalogWrite(this.db, (tx) => new ArticleTypesService(tx).deleteTypeLocked(id));
  }

  private async deleteTypeLocked(id: string): Promise<void> {
    const [type] = await this.db
      .select({ name: articleTypes.name })
      .from(articleTypes)
      .where(eq(articleTypes.id, id));
    if (!type) throw typeNotFound();
    const { typeArticleCount } = await countTypeRecords(this.db, id);
    runDomainRule(AttributeUsageError, () => assessTypeDeletion(type.name, typeArticleCount), 409);
    const deleted = await guardWrite(
      () =>
        this.db
          .delete(articleTypes)
          .where(eq(articleTypes.id, id))
          .returning({ id: articleTypes.id }),
      {
        // Un artículo creado entre la verificación y el borrado (llave foránea restrict).
        foreignKey: () =>
          new ConflictException({
            code: 'ARTICLE_TYPE_IN_USE',
            message: `El tipo «${type.name}» tiene artículos; no se puede borrar.`,
          }),
      },
    );
    if (deleted.length === 0) throw typeNotFound();
  }

  createAttribute(typeId: string, input: CreateAttribute): Promise<Attribute> {
    return catalogWrite(this.db, (tx) =>
      new ArticleTypesService(tx).createAttributeLocked(typeId, input),
    );
  }

  private async createAttributeLocked(typeId: string, input: CreateAttribute): Promise<Attribute> {
    await this.assertTypeExists(typeId);
    const siblings = await this.siblings(typeId);
    const definition = runDomainRule(ArticleTypeError, () =>
      createAttributeDefinition(input, siblings),
    );
    const usage = await loadAttributeUsage(
      this.db,
      typeId,
      definition.key,
      definition.definesVariant,
    );
    runDomainRule(AttributeUsageError, () => assessNewAttribute(definition, usage), 409);
    const [created] = await guardWrite(
      () =>
        this.db
          .insert(attributes)
          .values({ ...definition, articleTypeId: typeId })
          .returning(attributeFields),
      { unique: duplicateAttribute, foreignKey: typeNotFound },
    );
    return created!;
  }

  updateAttribute(typeId: string, id: string, patch: UpdateAttribute): Promise<Attribute> {
    return catalogWrite(this.db, (tx) =>
      new ArticleTypesService(tx).updateAttributeLocked(typeId, id, patch),
    );
  }

  private async updateAttributeLocked(
    typeId: string,
    id: string,
    patch: UpdateAttribute,
  ): Promise<Attribute> {
    const [current] = await this.db
      .select(attributeFields)
      .from(attributes)
      .where(and(eq(attributes.id, id), eq(attributes.articleTypeId, typeId)));
    if (!current) throw attributeNotFound();
    const { active, ...changes } = patch;
    const siblings = await this.siblings(typeId, id);
    const definition = runDomainRule(ArticleTypeError, () =>
      updateAttributeDefinition(current, changes, siblings),
    );
    const usage = await loadAttributeUsage(this.db, typeId, current.key, current.definesVariant);
    const activity = { before: current.active, after: active ?? current.active };
    runDomainRule(
      AttributeUsageError,
      () => assessAttributeChange(current, definition, usage, activity),
      409,
    );
    const [updated] = await guardWrite(
      () =>
        this.db
          .update(attributes)
          .set({ ...definition, ...(active !== undefined && { active }) })
          .where(and(eq(attributes.id, id), eq(attributes.articleTypeId, typeId)))
          .returning(attributeFields),
      { unique: duplicateAttribute },
    );
    if (!updated) throw attributeNotFound();
    return updated;
  }

  /** Un atributo con valores guardados no se borra (409 `ATTRIBUTE_IN_USE`); se desactiva. */
  deleteAttribute(typeId: string, id: string): Promise<void> {
    return catalogWrite(this.db, (tx) =>
      new ArticleTypesService(tx).deleteAttributeLocked(typeId, id),
    );
  }

  private async deleteAttributeLocked(typeId: string, id: string): Promise<void> {
    const [current] = await this.db
      .select(attributeFields)
      .from(attributes)
      .where(and(eq(attributes.id, id), eq(attributes.articleTypeId, typeId)));
    if (!current) throw attributeNotFound();
    const usage = await loadAttributeUsage(this.db, typeId, current.key, current.definesVariant);
    runDomainRule(AttributeUsageError, () => assessAttributeDeletion(current, usage), 409);
    const deleted = await this.db
      .delete(attributes)
      .where(and(eq(attributes.id, id), eq(attributes.articleTypeId, typeId)))
      .returning({ id: attributes.id });
    if (deleted.length === 0) throw attributeNotFound();
  }

  private async assertTypeExists(id: string): Promise<void> {
    const [type] = await this.db
      .select({ id: articleTypes.id })
      .from(articleTypes)
      .where(eq(articleTypes.id, id));
    if (!type) throw typeNotFound();
  }

  private siblings(typeId: string, excludeId?: string) {
    return this.db
      .select({ id: attributes.id, key: attributes.key, name: attributes.name })
      .from(attributes)
      .where(
        excludeId === undefined
          ? eq(attributes.articleTypeId, typeId)
          : and(eq(attributes.articleTypeId, typeId), ne(attributes.id, excludeId)),
      );
  }
}
