import { Body, Controller, Get, Inject, Param, Patch, Post, Put, Query } from '@nestjs/common';
import {
  createProductSchema,
  productCostQuerySchema,
  productListQuerySchema,
  productParamsSchema,
  productPricesSchema,
  recipeSchema,
  updateProductSchema,
  type CreateProduct,
  type ProductCost,
  type ProductCostQuery,
  type ProductDetail,
  type ProductListItem,
  type ProductPricesInput,
  type RecipeInput,
  type UpdateProduct,
} from '@moss/contracts';
import { ProductsService } from './products.service.js';

type ProductParams = { id: string };

/** Pantallas 7 y 8. Sin DELETE: los productos se desactivan. */
@Controller('products')
export class ProductsController {
  constructor(@Inject(ProductsService) private readonly service: ProductsService) {}

  @Get()
  list(
    @Query({ schema: productListQuerySchema }) query: { includeInactive: boolean },
  ): Promise<ProductListItem[]> {
    return this.service.list(query.includeInactive);
  }

  @Post()
  create(@Body({ schema: createProductSchema }) body: CreateProduct): Promise<ProductDetail> {
    return this.service.create(body);
  }

  @Get(':id')
  detail(@Param({ schema: productParamsSchema }) params: ProductParams): Promise<ProductDetail> {
    return this.service.detail(params.id);
  }

  @Patch(':id')
  update(
    @Param({ schema: productParamsSchema }) params: ProductParams,
    @Body({ schema: updateProductSchema }) body: UpdateProduct,
  ): Promise<ProductDetail> {
    return this.service.update(params.id, body);
  }

  @Put(':id/prices')
  setPrices(
    @Param({ schema: productParamsSchema }) params: ProductParams,
    @Body({ schema: productPricesSchema }) body: ProductPricesInput,
  ): Promise<ProductDetail> {
    return this.service.setPrices(params.id, body);
  }

  @Put(':id/recipe')
  setRecipe(
    @Param({ schema: productParamsSchema }) params: ProductParams,
    @Body({ schema: recipeSchema }) body: RecipeInput,
  ): Promise<ProductDetail> {
    return this.service.setRecipe(params.id, body);
  }

  @Get(':id/cost')
  cost(
    @Param({ schema: productParamsSchema }) params: ProductParams,
    @Query({ schema: productCostQuerySchema }) query: ProductCostQuery,
  ): Promise<ProductCost> {
    return this.service.cost(params.id, query);
  }
}
