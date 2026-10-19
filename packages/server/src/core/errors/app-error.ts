/** Domain error hierarchy — controllers/services throw, the HTTP layer maps. */
export class AppError extends Error {
  readonly statusCode: number;
  readonly code: string;
  readonly data: unknown;

  constructor(
    statusCode: number,
    code: string,
    message: string,
    data?: unknown,
  ) {
    super(message);
    this.name = new.target.name;
    this.statusCode = statusCode;
    this.code = code;
    this.data = data;
  }
}

export class ValidationError extends AppError {
  constructor(message: string, data?: unknown) {
    super(400, "VALIDATION_ERROR", message, data);
  }
}

export class UnauthenticatedError extends AppError {
  constructor(message = "Authentication required") {
    super(401, "UNAUTHENTICATED", message);
  }
}

export class InvalidCredentialsError extends AppError {
  constructor(message = "Invalid credentials") {
    super(401, "INVALID_CREDENTIALS", message);
  }
}

export class ForbiddenError extends AppError {
  constructor(code = "FORBIDDEN", message = "Forbidden") {
    super(403, code, message);
  }
}

export class SensitiveScopeRequiredError extends AppError {
  constructor() {
    super(
      403,
      "SENSITIVE_SCOPE_REQUIRED",
      "Re-authentication required for sensitive operations",
    );
  }
}

export class NotFoundError extends AppError {
  constructor(what = "Resource") {
    super(404, "NOT_FOUND", `${what} not found`);
  }
}

export class ConflictError extends AppError {
  constructor(message: string, code = "CONFLICT") {
    super(409, code, message);
  }
}

export class RateLimitedError extends AppError {
  constructor(message = "Too many attempts, please wait") {
    super(429, "RATE_LIMITED", message);
  }
}

export class GoogleNotAllowedError extends AppError {
  constructor() {
    super(
      403,
      "GOOGLE_ACCOUNT_NOT_ALLOWED",
      "This Google account is not the owner account",
    );
  }
}

export class VaultDecryptionError extends AppError {
  constructor(message = "Vault material could not be decrypted") {
    super(500, "VAULT_DECRYPTION_ERROR", message);
  }
}

export class InternalError extends AppError {
  constructor(message = "Internal error", data?: unknown) {
    super(500, "INTERNAL_ERROR", message, data);
  }
}

export function isAppError(error: unknown): error is AppError {
  return error instanceof AppError;
}
