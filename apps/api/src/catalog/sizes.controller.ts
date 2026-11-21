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
  Put,
  Query,
} from '@nestjs/common';
import {
  createSizeSchema,
  updateSizeSchema,
  sizeParamsSchema,
  sizeListQuerySchema,
  reorderSizesSchema,
  type CreateSize,
  type UpdateSize,
} from '@moss/contracts';
import { SizesService } from './sizes.service.js';
@Controller('sizes')
export class SizesController {
  constructor(@Inject(SizesService) private readonly service: SizesService) {}
  @Get() list(@Query({ schema: sizeListQuerySchema }) query: { purpose: 'manage' | 'filter' }) {
    return this.service.list(query.purpose);
  }
  @Post() create(@Body({ schema: createSizeSchema }) body: CreateSize) {
    return this.service.create(body);
  }
  @Put('order') order(@Body({ schema: reorderSizesSchema }) body: { ids: string[] }) {
    return this.service.order(body.ids);
  }
  @Patch(':id') update(
    @Param({ schema: sizeParamsSchema }) params: { id: string },
    @Body({ schema: updateSizeSchema }) body: UpdateSize,
  ) {
    return this.service.update(params.id, body);
  }
  @Delete(':id') @HttpCode(204) remove(
    @Param({ schema: sizeParamsSchema }) params: { id: string },
  ) {
    return this.service.remove(params.id);
  }
}
