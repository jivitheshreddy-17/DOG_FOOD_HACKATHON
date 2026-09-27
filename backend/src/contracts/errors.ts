import { z } from 'zod';

export const ERROR_CODES = {
  UNAUTHORIZED: 'UNAUTHORIZED',
  INVALID_SESSION: 'INVALID_SESSION',
  FORBIDDEN: 'FORBIDDEN',
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  NOT_FOUND: 'NOT_FOUND',
  CONFLICT: 'CONFLICT',
  ALREADY_HAS_PROJECT: 'ALREADY_HAS_PROJECT',
  ALREADY_SUBMITTED: 'ALREADY_SUBMITTED',
  SUBMISSION_DEADLINE_PASSED: 'SUBMISSION_DEADLINE_PASSED',
  INTERNAL_SERVER_ERROR: 'INTERNAL_SERVER_ERROR',
} as const;

export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES];

export const errorCodeSchema = z.enum([
  ERROR_CODES.UNAUTHORIZED,
  ERROR_CODES.INVALID_SESSION,
  ERROR_CODES.FORBIDDEN,
  ERROR_CODES.VALIDATION_ERROR,
  ERROR_CODES.NOT_FOUND,
  ERROR_CODES.CONFLICT,
  ERROR_CODES.ALREADY_HAS_PROJECT,
  ERROR_CODES.ALREADY_SUBMITTED,
  ERROR_CODES.SUBMISSION_DEADLINE_PASSED,
  ERROR_CODES.INTERNAL_SERVER_ERROR,
]);

export const apiErrorPayloadSchema = z.object({
  code: errorCodeSchema,
  message: z.string(),
  details: z.unknown().optional(),
});

export type ApiErrorPayload = z.infer<typeof apiErrorPayloadSchema>;

export const apiErrorResponseSchema = z.object({
  error: apiErrorPayloadSchema,
});

export type ApiErrorResponse = z.infer<typeof apiErrorResponseSchema>;

export const apiSuccessResponseSchema = <T extends z.ZodTypeAny>(dataSchema: T) =>
  z.object({
    data: dataSchema,
  });
