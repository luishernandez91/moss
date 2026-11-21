import { Body, Controller, Get, HttpCode, Inject, Param, Post, Query, Req } from '@nestjs/common';
import {
  campaignListQuerySchema,
  campaignParamsSchema,
  createCampaignSchema,
  scheduleCampaignSchema,
  type Campaign,
  type CampaignListQuery,
  type CampaignType,
  type CreateCampaign,
  type ScheduleCampaign,
} from '@moss/contracts';
import type { AuthRequest } from '../auth/auth.guard.js';
import { CampaignsService } from './campaigns.service.js';

/**
 * K1: lista (pantalla 11) y API mínima sin interfaz para crear borradores y programarlos. Editar,
 * regresar a borrador, cancelar y clonar llegan con K2.
 */
@Controller()
export class CampaignsController {
  constructor(@Inject(CampaignsService) private readonly service: CampaignsService) {}

  @Get('campaign-types')
  types(): Promise<CampaignType[]> {
    return this.service.types();
  }

  @Get('campaigns')
  list(@Query({ schema: campaignListQuerySchema }) query: CampaignListQuery): Promise<Campaign[]> {
    return this.service.list(query);
  }

  @Post('campaigns')
  create(@Body({ schema: createCampaignSchema }) body: CreateCampaign): Promise<Campaign> {
    return this.service.create(body);
  }

  @Post('campaigns/:id/schedule')
  @HttpCode(200)
  schedule(
    @Param({ schema: campaignParamsSchema }) params: { id: string },
    @Body({ schema: scheduleCampaignSchema }) body: ScheduleCampaign,
    @Req() req: AuthRequest,
  ): Promise<Campaign> {
    const user = req.authUser!;
    return this.service.schedule(params.id, body.reason, {
      userId: user.userId,
      partnerId: user.partner.id,
    });
  }
}
