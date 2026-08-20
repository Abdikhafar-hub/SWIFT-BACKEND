export class AppError extends Error {
  public readonly statusCode: number;
  public readonly code: string;
  public readonly isOperational: boolean;
  public readonly details?: unknown;

  constructor(message: string, statusCode: number = 500, code: string = "INTERNAL_ERROR", details?: unknown) {
    super(message);
    this.name = this.constructor.name;
    this.statusCode = statusCode;
    this.code = code;
    this.isOperational = true;
    this.details = details;
    Error.captureStackTrace(this, this.constructor);
  }
}

export class BadRequestError extends AppError {
  constructor(message: string = "Bad request", details?: unknown) {
    super(message, 400, "BAD_REQUEST", details);
  }
}

export class ValidationError extends AppError {
  constructor(message: string = "Validation failed", details?: unknown) {
    super(message, 400, "VALIDATION_ERROR", details);
  }
}

export class UnauthorizedError extends AppError {
  constructor(message: string = "Authentication required") {
    super(message, 401, "UNAUTHORIZED");
  }
}

export class ForbiddenError extends AppError {
  constructor(message: string = "Access denied: insufficient permissions or cross-tenant isolation violation") {
    super(message, 403, "FORBIDDEN");
  }
}

export class NotFoundError extends AppError {
  constructor(resource: string = "Resource") {
    super(`${resource} not found`, 404, "NOT_FOUND");
  }
}

export class ConflictError extends AppError {
  constructor(message: string = "Resource already exists", details?: unknown) {
    super(message, 409, "CONFLICT", details);
  }
}

export class DuplicateResourceError extends AppError {
  constructor(message: string = "Duplicate resource detected", details?: unknown) {
    super(message, 409, "DUPLICATE_RESOURCE", details);
  }
}

export class InvalidStatusTransitionError extends AppError {
  constructor(fromStatus: string, toStatus: string) {
    super(
      `Cannot transition application status from '${fromStatus}' to '${toStatus}'.`,
      422,
      "INVALID_STATUS_TRANSITION"
    );
  }
}

export class InvalidApplicationStateError extends AppError {
  constructor(message: string) {
    super(message, 422, "INVALID_APPLICATION_STATE");
  }
}

export class ExternalServiceError extends AppError {
  constructor(serviceName: string, message: string = "External service unavailable") {
    super(`${serviceName}: ${message}`, 502, "EXTERNAL_SERVICE_ERROR");
  }
}

export class RateLimitedError extends AppError {
  constructor(message: string = "Too many requests, please try again later.") {
    super(message, 429, "RATE_LIMITED");
  }
}
