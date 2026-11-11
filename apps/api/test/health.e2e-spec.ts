import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import { healthResponseSchema } from '@moss/contracts';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { AppModule } from '../src/app.module.js';
import { loadEnvFile } from '../src/config/load-env-file.js';

// Requiere PostgreSQL corriendo (pnpm db:up) y DATABASE_URL en el entorno o en .env.
loadEnvFile();
if (process.env.DATABASE_URL_TEST) {
  process.env.DATABASE_URL = process.env.DATABASE_URL_TEST;
}

describe('API (e2e)', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /api/health responde ok con la base arriba', async () => {
    const response = await request(app.getHttpServer()).get('/api/health').expect(200);
    expect(healthResponseSchema.parse(response.body)).toMatchObject({
      status: 'ok',
      database: 'up',
    });
  });

  it('una ruta inexistente responde con el formato de error', async () => {
    const response = await request(app.getHttpServer()).get('/api/no-existe').expect(404);
    expect(response.body).toMatchObject({
      code: 'NOT_FOUND',
      message: 'No se encontró el recurso.',
    });
  });
});
