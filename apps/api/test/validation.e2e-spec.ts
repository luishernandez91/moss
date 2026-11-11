import { Body, Controller, type INestApplication, Post } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { businessDateSchema, centsSchema } from '@moss/contracts';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { z } from 'zod';
import { AppModule } from '../src/app.module.js';
import { loadEnvFile } from '../src/config/load-env-file.js';

loadEnvFile();
if (process.env.DATABASE_URL_TEST) {
  process.env.DATABASE_URL = process.env.DATABASE_URL_TEST;
}

const sampleSchema = z.object({ amount: centsSchema, date: businessDateSchema });

@Controller('sample')
class SampleController {
  @Post()
  create(@Body({ schema: sampleSchema }) body: z.infer<typeof sampleSchema>) {
    return body;
  }
}

describe('Validación con esquemas Zod (e2e)', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
      controllers: [SampleController],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('acepta un cuerpo válido', async () => {
    await request(app.getHttpServer())
      .post('/sample')
      .send({ amount: 5310, date: '2026-11-10' })
      .expect(201, { amount: 5310, date: '2026-11-10' });
  });

  it('rechaza montos con decimales con un error en español', async () => {
    const response = await request(app.getHttpServer())
      .post('/sample')
      .send({ amount: 53.1, date: '2026-11-10' })
      .expect(400);
    expect(response.body).toMatchObject({
      code: 'VALIDATION_ERROR',
      message: 'Revisa los datos enviados.',
      details: [{ path: 'amount', message: 'El monto debe estar en centavos enteros' }],
    });
  });
});
