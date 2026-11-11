import { z } from 'zod';

/** Monto en centavos enteros (ver AGENTS.md, regla 1). */
export const centsSchema = z.number().int('El monto debe estar en centavos enteros');

/** Fecha de negocio `AAAA-MM-DD`. */
export const businessDateSchema = z.iso.date({ error: 'Usa el formato AAAA-MM-DD' });

/** Forma de todos los errores que responde la API. */
export const apiErrorSchema = z.object({
  code: z.string(),
  message: z.string(),
  details: z.unknown().optional(),
});
export type ApiError = z.infer<typeof apiErrorSchema>;
