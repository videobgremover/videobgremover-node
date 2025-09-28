/**
 * Custom error classes for VideoBGRemover SDK
 * (from Python client/models.py)
 */

/**
 * Base API error class
 */
export class ApiError extends Error {
  constructor(
    message: string,
    public readonly statusCode?: number,
    public readonly code?: string
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

/**
 * Error thrown when user has insufficient credits
 */
export class InsufficientCreditsError extends ApiError {
  constructor(message = 'Insufficient credits to process video') {
    super(message, 402, 'INSUFFICIENT_CREDITS')
    this.name = 'InsufficientCreditsError'
  }
}

/**
 * Error thrown when job is not found
 */
export class JobNotFoundError extends ApiError {
  constructor(jobId: string) {
    super(`Job not found: ${jobId}`, 404, 'JOB_NOT_FOUND')
    this.name = 'JobNotFoundError'
  }
}

/**
 * Error thrown when video processing fails
 */
export class ProcessingError extends ApiError {
  constructor(
    message: string,
    public readonly jobId?: string
  ) {
    super(message, 500, 'PROCESSING_ERROR')
    this.name = 'ProcessingError'
  }
}

/**
 * General VideoBGRemover SDK error
 */
export class VideoBGRemoverError extends Error {
  constructor(
    message: string,
    public readonly code?: string
  ) {
    super(message)
    this.name = 'VideoBGRemoverError'
  }
}

/**
 * Validation error for input parameters
 */
export class ValidationError extends VideoBGRemoverError {
  constructor(
    message: string,
    public readonly field?: string
  ) {
    super(message, 'VALIDATION_ERROR')
    this.name = 'ValidationError'
  }
}
