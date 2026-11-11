import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { apiErrorSchema, type ApiError } from '@moss/contracts';
import type { Response } from 'express';

const DEFAULT_MESSAGES: Partial<Record<number, string>> = {
  [HttpStatus.BAD_REQUEST]: 'La solicitud tiene datos inválidos.',
  [HttpStatus.UNAUTHORIZED]: 'Inicia sesión para continuar.',
  [HttpStatus.FORBIDDEN]: 'No tienes permiso para esta acción.',
  [HttpStatus.NOT_FOUND]: 'No se encontró el recurso.',
  [HttpStatus.CONFLICT]: 'La operación entra en conflicto con datos existentes.',
};

/** Todas las respuestas de error tienen la forma `{ code, message, details? }`. */
@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(ApiExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const raw = exception.getResponse();
      if (isApiError(raw)) {
        response.status(status).json(raw);
        return;
      }
      const details = typeof raw === 'object' ? raw : undefined;
      const body: ApiError = {
        code: HttpStatus[status] ?? 'ERROR',
        message: DEFAULT_MESSAGES[status] ?? exception.message,
        ...(details ? { details } : {}),
      };
      response.status(status).json(body);
      return;
    }

    this.logger.error(exception);
    const body: ApiError = {
      code: 'INTERNAL_SERVER_ERROR',
      message: 'Ocurrió un error inesperado. Intenta de nuevo.',
    };
    response.status(HttpStatus.INTERNAL_SERVER_ERROR).json(body);
  }
}

function isApiError(value: unknown): value is ApiError {
  return apiErrorSchema.safeParse(value).success;
}
