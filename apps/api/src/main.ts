import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import { loadEnvFile } from './config/load-env-file.js';
import { loadEnv } from './config/env.js';

loadEnvFile();
const env = loadEnv();

const app = await NestFactory.create(AppModule);
app.setGlobalPrefix('api');
app.enableShutdownHooks();
await app.listen(env.API_PORT);
