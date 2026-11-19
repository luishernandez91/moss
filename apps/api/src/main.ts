import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import { loadEnvFile } from './config/load-env-file.js';
import { loadEnv } from './config/env.js';
import type { NestExpressApplication } from '@nestjs/platform-express';

loadEnvFile();
const env = loadEnv();

const app = await NestFactory.create<NestExpressApplication>(AppModule);
if (env.TRUST_PROXY_HOPS > 0) app.set('trust proxy', env.TRUST_PROXY_HOPS);
app.setGlobalPrefix('api');
app.enableShutdownHooks();
await app.listen(env.API_PORT);
