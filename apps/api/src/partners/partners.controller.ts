import { Body, Controller, Get, Inject, Put } from '@nestjs/common';
import { updatePartnersSchema, type Partner, type UpdatePartners } from '@moss/contracts';
import { PartnersService } from './partners.service.js';
@Controller('partners')
export class PartnersController {
  constructor(@Inject(PartnersService) private readonly service: PartnersService) {}
  @Get() list(): Promise<Partner[]> {
    return this.service.list();
  }
  @Put() update(@Body({ schema: updatePartnersSchema }) input: UpdatePartners): Promise<Partner[]> {
    return this.service.update(input);
  }
}
