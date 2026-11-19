import { createHmac, randomUUID } from 'node:crypto';
import { issueSession, verifySession, readSessionCookie, SESSION_SECONDS } from './session.js';

const secret = 'solo-pruebas-no-usar-en-produccion-123456';
const userId = randomUUID();
const now = 1_800_000_000_000;

describe('cookie firmada', () => {
  it('firma usuario, versión y vencimiento absoluto a 30 días', () => {
    const token = issueSession(userId, 2, secret, now);
    expect(verifySession(token, secret, now)).toEqual({
      userId,
      sessionVersion: 2,
      exp: now / 1000 + SESSION_SECONDS,
    });
    expect(verifySession(token, secret, now + SESSION_SECONDS * 1000)).toBeNull();
    expect(verifySession(token, `${secret}-rotado`, now)).toBeNull();
  });

  it('rechaza firma y contenido alterados, incluso estructuras firmadas inválidas', () => {
    const token = issueSession(userId, 0, secret, now);
    const [payload, signature] = token.split('.');
    const changed = Buffer.from(
      JSON.stringify({ userId: randomUUID(), sessionVersion: 0, exp: now / 1000 + 100 }),
    ).toString('base64url');
    expect(verifySession(`${changed}.${signature}`, secret, now)).toBeNull();
    expect(verifySession(`${payload}.rota`, secret, now)).toBeNull();
    expect(verifySession('malformada', secret, now)).toBeNull();
    const invalid = Buffer.from(
      JSON.stringify({ userId, sessionVersion: -1, exp: 'mañana' }),
    ).toString('base64url');
    const signed = createHmac('sha256', secret).update(invalid).digest('base64url');
    expect(verifySession(`${invalid}.${signed}`, secret, now)).toBeNull();
  });

  it('extrae únicamente moss.sid y rechaza cookies duplicadas', () => {
    expect(readSessionCookie('otra=abc; moss.sid=abc.def; ultima=1')).toBe('abc.def');
    expect(readSessionCookie('moss.sid=a; moss.sid=b')).toBeUndefined();
    expect(readSessionCookie(undefined)).toBeUndefined();
  });
});
