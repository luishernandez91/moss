import { Controller, Get } from '@nestjs/common';
import type { HealthResponse } from '@moss/contracts';
import { HealthService } from './health.service.js';
import { Public } from '../auth/public.js';

@Controller('health')
export class HealthController {
  constructor(private readonly health: HealthService) {}

  @Get()
  @Public()
  check(): Promise<HealthResponse> {
    return this.health.check();
  }
}
