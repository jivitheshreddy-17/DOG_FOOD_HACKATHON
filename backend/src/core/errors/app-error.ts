import { ERROR_CODES, ErrorCode } from './error-codes';

export class AppError extends Error {
  public readonly code: ErrorCode;
  public readonly statusCode: number;
  public readonly details?: unknown;

  constructor(
    code: ErrorCode,
    statusCode: number,
    message: string,
    details?: unknown
  ) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = 'Authentication required', details?: unknown) {
    super(ERROR_CODES.UNAUTHORIZED, 401, message, details);
  }
}

export class InvalidSessionError extends AppError {
  constructor(message = 'Session is invalid or expired', details?: unknown) {
    super(ERROR_CODES.INVALID_SESSION, 401, message, details);
  }
}

export class ForbiddenError extends AppError {
  constructor(message = 'You do not have permission to perform this action', details?: unknown) {
    super(ERROR_CODES.FORBIDDEN, 403, message, details);
  }
}

export class ValidationError extends AppError {
  constructor(message = 'Request validation failed', details?: unknown) {
    super(ERROR_CODES.VALIDATION_ERROR, 400, message, details);
  }
}

export class NotFoundError extends AppError {
  constructor(message = 'Resource not found', details?: unknown) {
    super(ERROR_CODES.NOT_FOUND, 404, message, details);
  }
}

export class ConflictError extends AppError {
  constructor(message = 'Resource conflict', details?: unknown) {
    super(ERROR_CODES.CONFLICT, 409, message, details);
  }
}

export class AlreadyHasProjectError extends AppError {
  constructor(message = 'Team already has a project', details?: unknown) {
    super(ERROR_CODES.ALREADY_HAS_PROJECT, 409, message, details);
  }
}

export class AlreadySubmittedError extends AppError {
  constructor(message = 'Project has already been submitted', details?: unknown) {
    super(ERROR_CODES.ALREADY_SUBMITTED, 409, message, details);
  }
}

export class SubmissionDeadlinePassedError extends AppError {
  constructor(message = 'Submission deadline has passed', details?: unknown) {
    super(ERROR_CODES.SUBMISSION_DEADLINE_PASSED, 400, message, details);
  }
}
