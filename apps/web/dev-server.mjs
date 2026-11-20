// `pnpm dev` de la web: `ng serve` en WEB_PORT (variable de entorno o .env de la raíz), 4200 por
// defecto. El proxy toma API_PORT del mismo lugar.
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';

const envFile = new URL('../../.env', import.meta.url);
if (existsSync(envFile)) process.loadEnvFile(envFile);

const server = spawn('ng', ['serve', '--port', process.env.WEB_PORT ?? '4200'], {
  stdio: 'inherit',
  shell: true,
});
server.on('exit', (code) => process.exit(code ?? 0));
