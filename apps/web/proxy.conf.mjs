// Proxy del servidor de desarrollo hacia la API. El puerto sale de API_PORT (variable de entorno o
// .env de la raíz), con 3000 por defecto, para correr varios worktrees a la vez.
import { existsSync } from 'node:fs';

const envFile = new URL('../../.env', import.meta.url);
if (!process.env.API_PORT && existsSync(envFile)) process.loadEnvFile(envFile);

export default {
  '/api': { target: `http://localhost:${process.env.API_PORT ?? 3000}`, secure: false },
};
