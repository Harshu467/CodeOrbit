export class DomainError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly statusCode: number,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'DomainError';
  }
}

export class NotFoundError extends DomainError {
  constructor() {
    super('not_found', 'The requested resource was not found.', 404);
  }
}

export class BadRequestError extends DomainError {
  constructor(message = 'The request is invalid.') {
    super('invalid_request', message, 400);
  }
}

export class ConflictError extends DomainError {
  constructor(message = 'The request conflicts with an existing resource.') {
    super('conflict', message, 409);
  }
}

export class UnauthorizedError extends DomainError {
  constructor() {
    super('unauthorized', 'Authentication is required.', 401);
  }
}

export class ForbiddenError extends DomainError {
  constructor() {
    super('forbidden', 'The caller is not permitted to access this resource.', 403);
  }
}

export class ProviderError extends DomainError {
  constructor(code: string, message: string, statusCode = 422, retryable = false) {
    super(code, message, statusCode);
    this.retryable = retryable;
  }

  readonly retryable: boolean;
}
