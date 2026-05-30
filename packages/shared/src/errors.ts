export class WikiError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly statusCode: number = 500,
  ) {
    super(message);
    this.name = "WikiError";
  }
}

export class NotFoundError extends WikiError {
  constructor(resource: string, id?: string) {
    super(
      id ? `${resource} '${id}' not found` : `${resource} not found`,
      "NOT_FOUND",
      404,
    );
    this.name = "NotFoundError";
  }
}

export class ForbiddenError extends WikiError {
  constructor(action?: string) {
    super(
      action ? `Forbidden: ${action}` : "Forbidden",
      "FORBIDDEN",
      403,
    );
    this.name = "ForbiddenError";
  }
}

export class UnauthorizedError extends WikiError {
  constructor() {
    super("Authentication required", "UNAUTHORIZED", 401);
    this.name = "UnauthorizedError";
  }
}

export class ValidationError extends WikiError {
  constructor(
    message: string,
    public readonly fields?: Record<string, string[]>,
  ) {
    super(message, "VALIDATION_ERROR", 400);
    this.name = "ValidationError";
  }
}

export class ConflictError extends WikiError {
  constructor(message: string) {
    super(message, "CONFLICT", 409);
    this.name = "ConflictError";
  }
}

export class SetupRequiredError extends WikiError {
  constructor() {
    super("First-run setup is required before using the wiki", "SETUP_REQUIRED", 503);
    this.name = "SetupRequiredError";
  }
}

export class AiUnavailableError extends WikiError {
  constructor() {
    super("AI features are not configured or currently unavailable", "AI_UNAVAILABLE", 503);
    this.name = "AiUnavailableError";
  }
}
