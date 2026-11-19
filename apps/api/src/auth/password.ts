import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { passwordSchema } from '@moss/contracts';

const options = { N: 32768, r: 8, p: 3, maxmem: 64 * 1024 * 1024 };

function derive(password: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, 64, options, (error, key) => (error ? reject(error) : resolve(key)));
  });
}

export async function hashPassword(password: string): Promise<string> {
  passwordSchema.parse(password);
  const salt = randomBytes(16);
  const hash = await derive(password, salt);
  return `scrypt$32768$8$3$${salt.toString('base64url')}$${hash.toString('base64url')}`;
}

export async function verifyPassword(password: string, encoded: string): Promise<boolean> {
  const match = /^scrypt\$32768\$8\$3\$([\w-]{22})\$([\w-]{86})$/.exec(encoded);
  if (!match) return false;
  const actual = await derive(password, Buffer.from(match[1]!, 'base64url'));
  const expected = Buffer.from(match[2]!, 'base64url');
  return expected.length === actual.length && timingSafeEqual(actual, expected);
}
