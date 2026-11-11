import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Carga el .env de la raíz del monorepo si existe. En producción las variables
 * llegan del entorno y el archivo no es necesario.
 */
export function loadEnvFile(): void {
  for (const candidate of ['.env', '../../.env']) {
    const path = resolve(process.cwd(), candidate);
    if (existsSync(path)) {
      process.loadEnvFile(path);
      return;
    }
  }
}
