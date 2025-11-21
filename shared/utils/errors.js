/**
 * Custom error classes for better error handling
 */

export class AppError extends Error {
  constructor(message, statusCode = 500, code = 'INTERNAL_ERROR') {
    super(message);
    this.name = this.constructor.name;
    this.statusCode = statusCode;
    this.code = code;
    Error.captureStackTrace(this, this.constructor);
  }
}

export class ValidationError extends AppError {
  constructor(message, details = {}) {
    super(message, 400, 'VALIDATION_ERROR');
    this.details = details;
  }
}

export class AuthenticationError extends AppError {
  constructor(message = 'Authentication required') {
    super(message, 401, 'AUTHENTICATION_ERROR');
  }
}

export class AuthorizationError extends AppError {
  constructor(message = 'Insufficient permissions') {
    super(message, 403, 'AUTHORIZATION_ERROR');
  }
}

export class NotFoundError extends AppError {
  constructor(resource = 'Resource') {
    super(`${resource} not found`, 404, 'NOT_FOUND');
  }
}

export class ConflictError extends AppError {
  constructor(message) {
    super(message, 409, 'CONFLICT');
  }
}

/**
 * Error handler middleware
 */
export function errorHandler(error, request) {
  if (error instanceof AppError) {
    return new Response(
      JSON.stringify({
        error: {
          code: error.code,
          message: error.message,
          ...(error.details && { details: error.details }),
        },
      }),
      {
        status: error.statusCode,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }

  // Unknown error - always include message for debugging
  console.error('Unhandled error:', error);
  console.error('Error stack:', error.stack);
  console.error('Error message:', error.message);
  console.error('Error name:', error.name);
  console.error('Error constructor:', error.constructor?.name);
  
  // Include error message in response for better debugging
  const errorMessage = error.message || 'An unexpected error occurred';
  
  return new Response(
    JSON.stringify({
      error: {
        code: 'INTERNAL_ERROR',
        message: errorMessage,
        // Always include stack trace for debugging (you can remove this in production)
        ...(error.stack && { details: error.stack }),
      },
    }),
    {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    }
  );
}

