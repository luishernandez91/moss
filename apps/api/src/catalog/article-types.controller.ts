import { TypeDimensionsService } from './type-dimensions.service.js';
import {
  createAttributeDimensionSchema,
  enableTypeSizeSchema,
  type CreateAttributeDimension,
  type EnableTypeSize,
} from '@moss/contracts';
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Inject,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import {
  articleTypeParamsSchema,
  attributeParamsSchema,
  createArticleTypeSchema,
  createAttributeSchema,
  updateArticleTypeSchema,
  updateAttributeSchema,
  type ArticleType,
  type Attribute,
  type CreateArticleType,
  type CreateAttribute,
  type UpdateArticleType,
  type UpdateAttribute,
} from '@moss/contracts';
import { ArticleTypesService } from './article-types.service.js';

type TypeParams = { id: string };
type AttributeParams = { id: string; attributeId: string };

/** Pantalla 3. Protegido por el guard global de E0.5; valida forma con los esquemas de contracts. */
@Controller('article-types')
export class ArticleTypesController {
  constructor(
    @Inject(ArticleTypesService) private readonly service: ArticleTypesService,
    @Inject(TypeDimensionsService) private readonly dimensions: TypeDimensionsService,
  ) {}

  @Post(':id/attribute-dimensions')
  createDimension(
    @Param({ schema: articleTypeParamsSchema }) params: TypeParams,
    @Body({ schema: createAttributeDimensionSchema }) body: CreateAttributeDimension,
  ): Promise<Attribute> {
    return this.dimensions.createAttribute(params.id, body);
  }

  @Post(':id/enable-size')
  enableSize(
    @Param({ schema: articleTypeParamsSchema }) params: TypeParams,
    @Body({ schema: enableTypeSizeSchema }) body: EnableTypeSize,
  ): Promise<{ usesSize: true }> {
    return this.dimensions.enableSize(params.id, body.initialSizeId);
  }

  @Get()
  list(): Promise<ArticleType[]> {
    return this.service.list();
  }

  @Post()
  create(@Body({ schema: createArticleTypeSchema }) body: CreateArticleType): Promise<ArticleType> {
    return this.service.createType(body.name, body.usesSize);
  }

  @Patch(':id')
  rename(
    @Param({ schema: articleTypeParamsSchema }) params: TypeParams,
    @Body({ schema: updateArticleTypeSchema }) body: UpdateArticleType,
  ): Promise<Omit<ArticleType, 'attributes'>> {
    return this.service.renameType(params.id, body.name, body.usesSize);
  }

  @Delete(':id')
  @HttpCode(204)
  remove(@Param({ schema: articleTypeParamsSchema }) params: TypeParams): Promise<void> {
    return this.service.deleteType(params.id);
  }

  @Post(':id/attributes')
  createAttribute(
    @Param({ schema: articleTypeParamsSchema }) params: TypeParams,
    @Body({ schema: createAttributeSchema }) body: CreateAttribute,
  ): Promise<Attribute> {
    return this.service.createAttribute(params.id, body);
  }

  @Patch(':id/attributes/:attributeId')
  updateAttribute(
    @Param({ schema: attributeParamsSchema }) params: AttributeParams,
    @Body({ schema: updateAttributeSchema }) body: UpdateAttribute,
  ): Promise<Attribute> {
    return this.service.updateAttribute(params.id, params.attributeId, body);
  }

  @Delete(':id/attributes/:attributeId')
  @HttpCode(204)
  removeAttribute(
    @Param({ schema: attributeParamsSchema }) params: AttributeParams,
  ): Promise<void> {
    return this.service.deleteAttribute(params.id, params.attributeId);
  }
}
