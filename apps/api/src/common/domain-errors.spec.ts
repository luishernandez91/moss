import { ConflictException, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { DrizzleQueryError } from 'drizzle-orm/errors';
import { guardWrite, postgresErrorCode, runDomainRule } from './domain-errors.js';

class SampleDomainError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

function pgError(code: string): Error {
  return Object.assign(new Error('pg'), { code });
}

describe('runDomainRule', () => {
  it('convierte el error de dominio en 422 con su código y mensaje', () => {
    let caught: unknown;
    try {
      runDomainRule(SampleDomainError, () => {
        throw new SampleDomainError('KEY_CONFLICT', 'Choque de clave.');
      });
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(UnprocessableEntityException);
    expect((caught as UnprocessableEntityException).getResponse()).toEqual({
      code: 'KEY_CONFLICT',
      message: 'Choque de clave.',
    });
  });

  it('deja pasar otros errores y devuelve el resultado', () => {
    expect(runDomainRule(SampleDomainError, () => 7)).toBe(7);
    expect(() =>
      runDomainRule(SampleDomainError, () => {
        throw new TypeError('otro');
      }),
    ).toThrow(TypeError);
  });
});

describe('postgresErrorCode', () => {
  it('lee el código directo o envuelto por Drizzle en cause', () => {
    expect(postgresErrorCode(pgError('23505'))).toBe('23505');
    expect(postgresErrorCode(new DrizzleQueryError('insert', [], pgError('23503')))).toBe('23503');
    expect(postgresErrorCode(new Error('sin código'))).toBeUndefined();
    expect(postgresErrorCode('texto')).toBeUndefined();
  });
});

describe('guardWrite', () => {
  const duplicate = { code: 'DUPLICATE_NAME', message: 'Ya existe.' };
  const missing = () => new NotFoundException({ code: 'ARTICLE_TYPE_NOT_FOUND', message: 'No.' });

  it('traduce la violación de unicidad (23505) a 409 con el código indicado', async () => {
    const write = guardWrite(
      () => Promise.reject(new DrizzleQueryError('insert', [], pgError('23505'))),
      { unique: duplicate },
    );
    await expect(write).rejects.toBeInstanceOf(ConflictException);
    await expect(write).rejects.toMatchObject({ response: duplicate });
  });

  it('traduce la llave foránea rota (23503) al error indicado', async () => {
    await expect(
      guardWrite(() => Promise.reject(pgError('23503')), { foreignKey: missing }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('traduce un borrado RESTRICT (23001) a SIZE_IN_USE', async () => {
    const conflict = { code: 'SIZE_IN_USE', message: 'El tamaño está en uso.' };
    await expect(
      guardWrite(() => Promise.reject(new DrizzleQueryError('delete', [], pgError('23001'))), {
        foreignKey: () => new ConflictException(conflict),
      }),
    ).rejects.toMatchObject({ response: conflict });
  });

  it('propaga los códigos sin traducción y devuelve el resultado', async () => {
    await expect(
      guardWrite(() => Promise.reject(pgError('23503')), { unique: duplicate }),
    ).rejects.toMatchObject({ code: '23503' });
    await expect(guardWrite(() => Promise.resolve('ok'), { unique: duplicate })).resolves.toBe(
      'ok',
    );
  });
});
