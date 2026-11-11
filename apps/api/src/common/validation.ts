import { BadRequestException, StandardSchemaValidationPipe } from '@nestjs/common';
import type { ApiError } from '@moss/contracts';

/**
 * Valida con el esquema Zod declarado en el decorador:
 * `@Body({ schema: createExpenseSchema }) body: CreateExpense`.
 */
export function createValidationPipe(): StandardSchemaValidationPipe {
  return new StandardSchemaValidationPipe({
    exceptionFactory: (issues) => {
      const body: ApiError = {
        code: 'VALIDATION_ERROR',
        message: 'Revisa los datos enviados.',
        details: issues.map((issue) => ({
          path: (issue.path ?? [])
            .map((segment) => (typeof segment === 'object' ? String(segment.key) : String(segment)))
            .join('.'),
          message: issue.message,
        })),
      };
      return new BadRequestException(body);
    },
  });
}
