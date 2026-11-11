import { Test } from '@nestjs/testing';
import { healthResponseSchema } from '@moss/contracts';
import { DATABASE } from '../database/database.module.js';
import { HealthController } from './health.controller.js';
import { HealthService } from './health.service.js';

async function createController(execute: () => Promise<unknown>) {
  const moduleRef = await Test.createTestingModule({
    controllers: [HealthController],
    providers: [HealthService, { provide: DATABASE, useValue: { execute } }],
  }).compile();
  return moduleRef.get(HealthController);
}

describe('HealthController', () => {
  it('reporta ok cuando la base responde', async () => {
    const controller = await createController(() => Promise.resolve({ rows: [] }));
    const result = await controller.check();
    expect(healthResponseSchema.parse(result)).toMatchObject({ status: 'ok', database: 'up' });
  });

  it('reporta degradado cuando la base no responde', async () => {
    const controller = await createController(() => Promise.reject(new Error('sin conexión')));
    await expect(controller.check()).resolves.toMatchObject({
      status: 'degraded',
      database: 'down',
    });
  });
});
