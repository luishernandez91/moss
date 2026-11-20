import { Module } from '@nestjs/common';
import { CampaignsController } from './campaigns.controller.js';
import { CampaignsService } from './campaigns.service.js';
import { clockProvider } from './clock.js';

/** Contexto de campañas: K1 modelo, lista y programación; K2 en adelante, el resto del ciclo. */
@Module({
  controllers: [CampaignsController],
  providers: [CampaignsService, clockProvider],
})
export class CampaignsModule {}
