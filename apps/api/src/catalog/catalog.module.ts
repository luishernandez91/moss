import { Module } from '@nestjs/common';
import { ArticleTypesController } from './article-types.controller.js';
import { ArticleTypesService } from './article-types.service.js';
import { ArticlesController } from './articles.controller.js';
import { ArticlesService } from './articles.service.js';

/** Contexto de catálogo: C1 tipos de artículo; C2–C5 agregan artículos, tamaños y productos. */
@Module({
  controllers: [ArticleTypesController, ArticlesController],
  providers: [ArticleTypesService, ArticlesService],
})
export class CatalogModule {}
