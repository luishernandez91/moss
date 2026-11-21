import { ConflictException, HttpException, UnprocessableEntityException } from '@nestjs/common';
import type { ApiError } from '@moss/contracts';

/** Forma común de los errores de dominio: `code` estable y `message` en español. */
type DomainErrorClass = abstract new (...args: never[]) => Error & { readonly code: string };

/**
 * Ejecuta una regla de dominio y convierte su error en `{ code, message, details? }`: 422 si la
 * regla rechaza los datos (por defecto) o 409 si choca con datos guardados. `details` sale de la
 * propiedad `conflict` del error, si la tiene. Cualquier otro error se propaga sin cambios.
 */
export function runDomainRule<T>(
  errorClass: DomainErrorClass,
  rule: () => T,
  status: 409 | 422 = 422,
): T {
  try {
    return rule();
  } catch (error) {
    if (error instanceof errorClass) {
      const conflict = (error as { conflict?: unknown }).conflict;
      const body: ApiError = {
        code: error.code,
        message: error.message,
        ...(conflict !== undefined && { details: conflict }),
      };
      throw status === 409 ? new ConflictException(body) : new UnprocessableEntityException(body);
    }
    throw error;
  }
}

/** Código de error de PostgreSQL (SQLSTATE), directo o envuelto por Drizzle en `cause`. */
export function postgresErrorCode(error: unknown): string | undefined {
  for (let current: unknown = error; current instanceof Error; current = current.cause) {
    const code = (current as Error & { code?: unknown }).code;
    if (typeof code === 'string' && /^[0-9A-Z]{5}$/.test(code)) return code;
  }
  return undefined;
}

/** Nombre de la restricción violada, si PostgreSQL lo reporta. */
export function postgresConstraint(error: unknown): string | undefined {
  for (let current: unknown = error; current instanceof Error; current = current.cause) {
    const constraint = (current as Error & { constraint?: unknown }).constraint;
    if (typeof constraint === 'string') return constraint;
  }
  return undefined;
}

export interface WriteGuards {
  /**
   * 23505: otra solicitud ganó la carrera de unicidad. Responde 409 con este cuerpo, o con el que
   * devuelva la función según la restricción violada.
   */
  unique?: ApiError | ((constraint: string | undefined) => ApiError);
  /** 23503/23001: referencia inválida o borrado RESTRICT; el registro padre se borró entre la validación y la escritura. */
  foreignKey?: () => HttpException;
  /** Si se indica, solo traduce las FK con estos nombres; las demás se propagan intactas. */
  foreignKeyConstraint?: string | readonly string[];
}

/**
 * Ejecuta una escritura y traduce las violaciones de restricciones que el dominio validó antes
 * pero que una solicitud concurrente puede provocar. Cualquier otro error se propaga.
 */
export async function guardWrite<T>(action: () => Promise<T>, guards: WriteGuards): Promise<T> {
  try {
    return await action();
  } catch (error) {
    const code = postgresErrorCode(error);
    if (code === '23505' && guards.unique) {
      const body =
        typeof guards.unique === 'function'
          ? guards.unique(postgresConstraint(error))
          : guards.unique;
      throw new ConflictException(body);
    }
    if (
      (code === '23503' || code === '23001') &&
      guards.foreignKey &&
      matchesConstraint(guards.foreignKeyConstraint, postgresConstraint(error))
    )
      throw guards.foreignKey();
    throw error;
  }
}

function matchesConstraint(
  expected: string | readonly string[] | undefined,
  actual: string | undefined,
): boolean {
  if (expected === undefined) return true;
  if (actual === undefined) return false;
  return typeof expected === 'string' ? expected === actual : expected.includes(actual);
}
