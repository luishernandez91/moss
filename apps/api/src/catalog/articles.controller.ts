import { Body, Controller, Get, Inject, Param, Patch, Post, Query, Req } from '@nestjs/common';
import {
  articleListQuerySchema,
  articleParamsSchema,
  createArticleSchema,
  createVariantSchema,
  updateArticleSchema,
  updateVariantSchema,
  variantParamsSchema,
  type ArticleDetail,
  type ArticleListQuery,
  type ArticleSummary,
  type ArticleVariant,
  type CostChange,
  type CreateArticle,
  type CreateVariant,
  type UpdateArticle,
  type UpdateVariant,
} from '@moss/contracts';
import type { AuthRequest } from '../auth/auth.guard.js';
import { ArticlesService } from './articles.service.js';

type ArticleParams = { id: string };
type VariantParams = { id: string; variantId: string };

/** Pantallas 4 y 5. Sin DELETE: artículos y variantes se desactivan. */
@Controller('articles')
export class ArticlesController {
  constructor(@Inject(ArticlesService) private readonly service: ArticlesService) {}

  @Get()
  list(
    @Query({ schema: articleListQuerySchema }) query: ArticleListQuery,
  ): Promise<ArticleSummary[]> {
    return this.service.list(query);
  }

  @Get(':id')
  detail(@Param({ schema: articleParamsSchema }) params: ArticleParams): Promise<ArticleDetail> {
    return this.service.detail(params.id);
  }

  @Post()
  create(
    @Body({ schema: createArticleSchema }) body: CreateArticle,
    @Req() req: AuthRequest,
  ): Promise<ArticleDetail> {
    return this.service.create(body, req.authUser!.partner.id);
  }

  @Patch(':id')
  update(
    @Param({ schema: articleParamsSchema }) params: ArticleParams,
    @Body({ schema: updateArticleSchema }) body: UpdateArticle,
  ): Promise<ArticleDetail> {
    return this.service.update(params.id, body);
  }

  @Post(':id/variants')
  addVariant(
    @Param({ schema: articleParamsSchema }) params: ArticleParams,
    @Body({ schema: createVariantSchema }) body: CreateVariant,
    @Req() req: AuthRequest,
  ): Promise<ArticleVariant> {
    return this.service.addVariant(params.id, body, req.authUser!.partner.id);
  }

  @Patch(':id/variants/:variantId')
  updateVariant(
    @Param({ schema: variantParamsSchema }) params: VariantParams,
    @Body({ schema: updateVariantSchema }) body: UpdateVariant,
    @Req() req: AuthRequest,
  ): Promise<ArticleVariant> {
    return this.service.updateVariant(params.id, params.variantId, body, req.authUser!.partner.id);
  }

  @Get(':id/variants/:variantId/cost-history')
  costHistory(
    @Param({ schema: variantParamsSchema }) params: VariantParams,
  ): Promise<CostChange[]> {
    return this.service.costHistory(params.id, params.variantId);
  }
}
