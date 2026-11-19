import { z } from 'zod';

export const authEmailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(z.email({ error: 'Escribe un correo válido.' }));
export const passwordSchema = z.string().min(6, 'La contraseña debe tener al menos 6 caracteres.');
export const loginSchema = z.object({ email: authEmailSchema, password: passwordSchema });
export type LoginInput = z.infer<typeof loginSchema>;

export const authUserSchema = z.object({
  userId: z.uuid(),
  email: z.email(),
  partner: z.object({ id: z.uuid(), name: z.string() }),
});
export type AuthUser = z.infer<typeof authUserSchema>;
