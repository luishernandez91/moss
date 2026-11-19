import { createInterface } from 'node:readline';
import { Writable } from 'node:stream';
import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import { PartnerError } from '@moss/domain';
import { ZodError } from 'zod';
import { authEmailSchema, passwordSchema } from '@moss/contracts';
import { loadEnvFile } from '../config/load-env-file.js';
import * as schema from '../database/schema.js';
import { setPassword } from './set-password.js';

class CommandInputError extends Error {}

/** readline controla el terminal; su salida va a un sink para no hacer eco de las teclas. */
async function readPassword(): Promise<string> {
  if (!process.stdin.isTTY || !process.stdout.isTTY)
    throw new CommandInputError('Ejecuta el comando desde una terminal interactiva.');
  const muted = new Writable({
    write(_chunk, _encoding, callback) {
      callback();
    },
  });
  const reader = createInterface({ input: process.stdin, output: muted, terminal: true });
  process.stdout.write('Contraseña (mínimo 6 caracteres): ');
  try {
    return await new Promise((resolve, reject) => {
      reader.once('SIGINT', () => reject(new CommandInputError('Operación cancelada.')));
      reader.once('close', () => reject(new CommandInputError('Entrada cancelada.')));
      reader.question('', resolve);
    });
  } finally {
    reader.close();
    process.stdout.write('\n');
  }
}

loadEnvFile();
let pool: pg.Pool | undefined;
try {
  const [emailInput, name, ...extra] = process.argv.slice(2);
  if (!emailInput || extra.length)
    throw new CommandInputError('Uso: pnpm auth:set-password <correo> [nombre]');
  const email = authEmailSchema.parse(emailInput);
  if (!process.env.DATABASE_URL) throw new CommandInputError('Falta DATABASE_URL en .env.');
  const password = passwordSchema.parse(await readPassword());
  pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  await setPassword(drizzle(pool, { schema }), email, password, name);
  process.stdout.write(
    'Contraseña guardada. Las sesiones anteriores de esta cuenta ya no son válidas.\n',
  );
} catch (error) {
  // No imprimir errores de PostgreSQL, que podrían incluir conexión o valores sensibles.
  const message =
    error instanceof CommandInputError || error instanceof PartnerError
      ? error.message
      : error instanceof ZodError
        ? error.issues.map((issue) => issue.message).join('\n')
        : 'No se pudo guardar la contraseña. Revisa la conexión a la base.';
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
} finally {
  await pool?.end();
}
