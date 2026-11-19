import { ConflictException, UnprocessableEntityException } from '@nestjs/common';
import type { ApiError } from '@moss/contracts';

/** Forma común de los errores de dominio: `code` estable y `message` en español. */
type DomainErrorClass = abstract new (...args: never[]) => Error & { readonly code: string };

/**
 * Ejecuta una regla de dominio y convierte su error en 422 `{ code, message }`.
 * Cualquier otro error se propaga sin cambios.
 */
export function runDomainRule<T>(errorClass: DomainErrorClass, rule: () => T): T {
  try {
    return rule();
  } catch (error) {
    if (error instanceof errorClass) {
      const body: ApiError = { code: error.code, message: error.message };
      throw new UnprocessableEntityException(body);
    }
    throw error;
  }
}

/** Violación de unicidad de PostgreSQL (23505), directa o envuelta por Drizzle en `cause`. */
export function isUniqueViolation(error: unknown): boolean {
  for (let current: unknown = error; current instanceof Error; current = current.cause) {
    if ((current as Error & { code?: unknown }).code === '23505') return true;
  }
  return false;
}

/**
 * Inserta o actualiza y convierte una carrera de unicidad en 409, con el mismo código que la
 * regla de dominio. El dominio valida antes con un mensaje que nombra el registro existente.
 */
export async function guardUnique<T>(action: () => Promise<T>, conflict: ApiError): Promise<T> {
  try {
    return await action();
  } catch (error) {
    if (isUniqueViolation(error)) throw new ConflictException(conflict);
    throw error;
  }
}
