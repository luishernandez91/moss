import { createHmac, timingSafeEqual } from 'node:crypto';
import type { CookieOptions } from 'express';
import { z } from 'zod';

export const SESSION_COOKIE = 'moss.sid';
export const SESSION_SECONDS = 30 * 24 * 60 * 60;
const payloadSchema = z
  .object({
    userId: z.uuid(),
    sessionVersion: z.number().int().nonnegative(),
    exp: z.number().int().positive(),
  })
  .strict();
export type SessionPayload = z.infer<typeof payloadSchema>;

export function issueSession(
  userId: string,
  sessionVersion: number,
  secret: string,
  now = Date.now(),
): string {
  const payload = payloadSchema.parse({
    userId,
    sessionVersion,
    exp: Math.floor(now / 1000) + SESSION_SECONDS,
  });
  const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `${encoded}.${createHmac('sha256', secret).update(encoded).digest('base64url')}`;
}

export function verifySession(
  token: string,
  secret: string,
  now = Date.now(),
): SessionPayload | null {
  if (token.length > 1024 || !/^[\w-]+\.[\w-]{43}$/.test(token)) return null;
  const [encoded, signature] = token.split('.') as [string, string];
  const expected = createHmac('sha256', secret).update(encoded).digest();
  const actual = Buffer.from(signature, 'base64url');
  if (
    actual.toString('base64url') !== signature ||
    actual.length !== expected.length ||
    !timingSafeEqual(expected, actual)
  )
    return null;
  try {
    const payload = payloadSchema.safeParse(
      JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')),
    );
    return payload.success && payload.data.exp > Math.floor(now / 1000) ? payload.data : null;
  } catch {
    return null;
  }
}

export function readSessionCookie(header: string | undefined): string | undefined {
  const matches = header
    ?.split(';')
    .map((part) => part.trim())
    .filter((part) => part.startsWith(`${SESSION_COOKIE}=`));
  return matches?.length === 1 ? matches[0]!.slice(SESSION_COOKIE.length + 1) : undefined;
}

export function cookieOptions(production: boolean): CookieOptions {
  return { httpOnly: true, sameSite: 'lax', secure: production, path: '/api' };
}
