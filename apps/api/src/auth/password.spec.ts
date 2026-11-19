import { scrypt } from 'node:crypto';
import { hashPassword, verifyPassword } from './password.js';

describe('contraseñas con scrypt real', () => {
  it('usa N=32768, r=8, p=3 y maxmem=64 MiB; sal distinta y verificación real', async () => {
    const password = 'clave de prueba';
    const first = await hashPassword(password);
    const second = await hashPassword(password);
    expect(first).not.toBe(second);
    const [algorithm, n, r, p, salt, hash] = first.split('$');
    expect([algorithm, n, r, p]).toEqual(['scrypt', '32768', '8', '3']);
    expect(Buffer.from(salt!, 'base64url')).toHaveLength(16);
    const expected = await new Promise<Buffer>((resolve, reject) => {
      scrypt(
        password,
        Buffer.from(salt!, 'base64url'),
        64,
        { N: 32768, r: 8, p: 3, maxmem: 64 * 1024 * 1024 },
        (error, key) => (error ? reject(error) : resolve(key)),
      );
    });
    expect(hash).toBe(expected.toString('base64url'));
    await expect(verifyPassword(password, first)).resolves.toBe(true);
    await expect(verifyPassword('incorrecta', first)).resolves.toBe(false);
    await expect(verifyPassword(password, 'roto')).resolves.toBe(false);
  });

  it('exige seis caracteres y no recorta la contraseña', async () => {
    await expect(hashPassword('12345')).rejects.toThrow();
    const hash = await hashPassword(' clave ');
    await expect(verifyPassword(' clave ', hash)).resolves.toBe(true);
    await expect(verifyPassword('clave', hash)).resolves.toBe(false);
  });
});
