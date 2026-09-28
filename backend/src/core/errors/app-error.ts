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

export class InvalidVotingModeError extends AppError {
  constructor(message = 'Invalid voting mode', details?: unknown) {
    super(ERROR_CODES.INVALID_VOTING_MODE, 400, message, details);
  }
}

export class VotingNotOpenError extends AppError {
  constructor(message = 'Voting is not open', details?: unknown) {
    super(ERROR_CODES.VOTING_NOT_OPEN, 403, message, details);
  }
}

export class VotingClosedError extends AppError {
  constructor(message = 'Voting is closed', details?: unknown) {
    super(ERROR_CODES.VOTING_CLOSED, 403, message, details);
  }
}

export class DuplicateVoteError extends AppError {
  constructor(message = 'Duplicate vote', details?: unknown) {
    super(ERROR_CODES.DUPLICATE_VOTE, 409, message, details);
  }
}

export class VoteLimitExceededError extends AppError {
  constructor(message = 'Vote limit exceeded', details?: unknown) {
    super(ERROR_CODES.VOTE_LIMIT_EXCEEDED, 403, message, details);
  }
}

export class InvalidOtpError extends AppError {
  constructor(message = 'Invalid OTP or verification token', details?: unknown) {
    super(ERROR_CODES.INVALID_OTP, 400, message, details);
  }
}

export class OtpExpiredError extends AppError {
  constructor(message = 'OTP or verification token has expired', details?: unknown) {
    super(ERROR_CODES.OTP_EXPIRED, 400, message, details);
  }
}

export class OtpUsedError extends AppError {
  constructor(message = 'OTP or verification token has already been used', details?: unknown) {
    super(ERROR_CODES.OTP_USED, 400, message, details);
  }
}
