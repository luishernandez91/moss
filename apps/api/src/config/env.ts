import { z } from 'zod';

const envSchema = z.object({
  DATABASE_URL: z.url({ error: 'DATABASE_URL debe ser una URL de PostgreSQL' }),
  API_PORT: z.coerce.number().int().positive().default(3000),
  TZ_BUSINESS: z.string().default('America/Mexico_City'),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  SESSION_SECRET: z
    .string()
    .refine(
      (value) => Buffer.byteLength(value) >= 32,
      'SESSION_SECRET debe contener al menos 32 bytes aleatorios',
    ),
  TRUST_PROXY_HOPS: z.coerce.number().int().min(0).max(5).default(0),
});

export type Env = z.infer<typeof envSchema>;

/** Valida las variables de entorno al arrancar; falla rápido con un mensaje claro. */
export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const result = envSchema.safeParse(source);
  if (!result.success) {
    const problems = result.error.issues
      .map((issue) => `- ${issue.path.join('.')}: ${issue.message}`)
      .join('\n');
    throw new Error(`Variables de entorno inválidas:\n${problems}\nRevisa tu archivo .env.`);
  }
  return result.data;
}
