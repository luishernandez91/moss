import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, asc, eq, ne, sql } from 'drizzle-orm';
import {
  ArticleTypeError,
  createAttributeDefinition,
  updateAttributeDefinition,
  validateArticleTypeName,
} from '@moss/domain';
import type { ArticleType, Attribute, CreateAttribute, UpdateAttribute } from '@moss/contracts';
import { guardWrite, runDomainRule } from '../common/domain-errors.js';
import { DATABASE, type Database } from '../database/database.module.js';
import { articleTypes, attributes } from '../database/schema.js';

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
      .select({ id: articleTypes.id, name: articleTypes.name })
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

  async createType(name: string): Promise<ArticleType> {
    const existing = await this.db
      .select({ id: articleTypes.id, name: articleTypes.name })
      .from(articleTypes);
    const validName = runDomainRule(ArticleTypeError, () =>
      validateArticleTypeName(name, existing),
    );
    const [created] = await guardWrite(
      () =>
        this.db
          .insert(articleTypes)
          .values({ name: validName })
          .returning({ id: articleTypes.id, name: articleTypes.name }),
      { unique: duplicateType },
    );
    return { ...created!, attributes: [] };
  }

  async renameType(id: string, name: string): Promise<Omit<ArticleType, 'attributes'>> {
    await this.assertTypeExists(id);
    const existing = await this.db
      .select({ id: articleTypes.id, name: articleTypes.name })
      .from(articleTypes);
    const validName = runDomainRule(ArticleTypeError, () =>
      validateArticleTypeName(name, existing, id),
    );
    const [updated] = await guardWrite(
      () =>
        this.db
          .update(articleTypes)
          .set({ name: validName })
          .where(eq(articleTypes.id, id))
          .returning({ id: articleTypes.id, name: articleTypes.name }),
      { unique: duplicateType },
    );
    if (!updated) throw typeNotFound();
    return updated;
  }

  /** Borra el tipo y sus atributos. C2 bloqueará el borrado si hay artículos del tipo. */
  async deleteType(id: string): Promise<void> {
    const deleted = await this.db
      .delete(articleTypes)
      .where(eq(articleTypes.id, id))
      .returning({ id: articleTypes.id });
    if (deleted.length === 0) throw typeNotFound();
  }

  async createAttribute(typeId: string, input: CreateAttribute): Promise<Attribute> {
    await this.assertTypeExists(typeId);
    const siblings = await this.siblings(typeId);
    const definition = runDomainRule(ArticleTypeError, () =>
      createAttributeDefinition(input, siblings),
    );
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

  async updateAttribute(typeId: string, id: string, patch: UpdateAttribute): Promise<Attribute> {
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

  /** C2 bloqueará con 409 `ATTRIBUTE_IN_USE` el borrado de un atributo usado por artículos. */
  async deleteAttribute(typeId: string, id: string): Promise<void> {
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
