import { FastifyRequest } from 'fastify';
import { z } from 'zod';
import { ValidationError } from '../errors/app-error';

/**
 * Validates arbitrary data against a Zod schema.
 * Throws a ValidationError if validation fails.
 */
export function validateSchema<T>(schema: z.ZodType<T>, data: unknown): T {
  const result = schema.safeParse(data);
  if (!result.success) {
    throw new ValidationError(
      'Validation failed',
      result.error.flatten().fieldErrors
    );
  }
  return result.data;
}

export interface RequestValidationSchemas<
  TBody = unknown,
  TParams = unknown,
  TQuery = unknown
> {
  body?: z.ZodType<TBody>;
  params?: z.ZodType<TParams>;
  query?: z.ZodType<TQuery>;
}

/**
 * Creates a Fastify preHandler hook that validates the request body, path params,
 * and/or query parameters using Zod schemas.
 */
export function validateRequest<TBody = unknown, TParams = unknown, TQuery = unknown>(
  schemas: RequestValidationSchemas<TBody, TParams, TQuery>
) {
  return async (request: FastifyRequest) => {
    if (schemas.body) {
      const result = schemas.body.safeParse(request.body);
      if (!result.success) {
        throw new ValidationError(
          'Request body validation failed',
          result.error.flatten().fieldErrors
        );
      }
      request.body = result.data;
    }

    if (schemas.params) {
      const result = schemas.params.safeParse(request.params);
      if (!result.success) {
        throw new ValidationError(
          'Path parameter validation failed',
          result.error.flatten().fieldErrors
        );
      }
      request.params = result.data;
    }

    if (schemas.query) {
      const result = schemas.query.safeParse(request.query);
      if (!result.success) {
        throw new ValidationError(
          'Query parameter validation failed',
          result.error.flatten().fieldErrors
        );
      }
      request.query = result.data;
    }
  };
}
