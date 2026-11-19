import { HttpErrorResponse } from '@angular/common/http';
import { apiErrorSchema } from '@moss/contracts';

const FALLBACK = 'Ocurrió un error inesperado. Intenta de nuevo.';

/** Mensaje en español de una respuesta de error de la API (`{ code, message }`). */
export function apiErrorMessage(error: unknown): string {
  if (error instanceof HttpErrorResponse) {
    const parsed = apiErrorSchema.safeParse(error.error);
    if (parsed.success) return parsed.data.message;
    if (error.status === 0) return 'No hay conexión con el servidor. Intenta de nuevo.';
  }
  return FALLBACK;
}
