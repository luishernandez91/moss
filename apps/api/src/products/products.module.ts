import { Module } from '@nestjs/common';
import { ProductsController } from './products.controller.js';
import { ProductsService } from './products.service.js';

/**
 * C4 · Productos y recetas. Módulo propio, junto al de catálogo, para no compartir archivos con
 * C6; comparte el bloqueo de catálogo (`catalogWrite`) con tamaños, tipos y artículos.
 */
@Module({
  controllers: [ProductsController],
  providers: [ProductsService],
})
export class ProductsModule {}
