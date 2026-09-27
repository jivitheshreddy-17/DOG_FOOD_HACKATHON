import { FastifyError, FastifyReply, FastifyRequest } from 'fastify';
import { AppError } from './app-error';
import { ERROR_CODES } from './error-codes';

export function errorHandler(
  error: FastifyError | Error,
  request: FastifyRequest,
  reply: FastifyReply
) {
  // If it's a known domain AppError
  if (error instanceof AppError) {
    return reply.status(error.statusCode).send({
      error: {
        code: error.code,
        message: error.message,
        ...(error.details !== undefined ? { details: error.details } : {}),
      },
    });
  }

  // Fastify route schema validation errors
  if ('validation' in error && Boolean(error.validation)) {
    return reply.status(400).send({
      error: {
        code: ERROR_CODES.VALIDATION_ERROR,
        message: 'Request validation failed',
        details: error.validation,
      },
    });
  }

  // Fastify 404 routing errors
  if ('statusCode' in error && error.statusCode === 404) {
    return reply.status(404).send({
      error: {
        code: ERROR_CODES.NOT_FOUND,
        message: error.message || 'Route not found',
      },
    });
  }

  // Unknown / unexpected internal errors
  // Log the diagnostic information internally
  request.log.error(error);

  // Return controlled generic error response, preventing leak of stack traces or internals
  return reply.status(500).send({
    error: {
      code: ERROR_CODES.INTERNAL_SERVER_ERROR,
      message: 'Internal server error',
    },
  });
}
