const { AppError } = require('../utils/errors');
const logger = require('../utils/logger');

/**
 * 404 handler - placed after all routes.
 */
const notFound = (req, res, next) => {
  const error = new AppError(`Route not found: ${req.method} ${req.originalUrl}`, 404, 'ROUTE_NOT_FOUND');
  next(error);
};

/**
 * Central error-handling middleware.
 * Converts known error types (Mongoose validation, duplicate keys, JWT errors)
 * into consistent AppError-style responses, and logs unexpected errors.
 */
// eslint-disable-next-line no-unused-vars
const errorHandler = (err, req, res, next) => {
  let error = err;

  // Mongoose validation error
  if (err.name === 'ValidationError' && err.errors) {
    const details = Object.values(err.errors).map((e) => e.message);
    error = new AppError('Validation failed', 422, 'VALIDATION_ERROR', details);
  }

  // Mongoose duplicate key error
  if (err.code === 11000) {
    const field = Object.keys(err.keyValue || {})[0];
    error = new AppError(`${field} already exists`, 409, 'DUPLICATE_KEY', { field });
  }

  // Mongoose cast error (invalid ObjectId etc.)
  if (err.name === 'CastError') {
    error = new AppError(`Invalid value for ${err.path}: ${err.value}`, 400, 'INVALID_ID');
  }

  // JWT errors
  if (err.name === 'JsonWebTokenError') {
    error = new AppError('Invalid authentication token', 401, 'INVALID_TOKEN');
  }
  if (err.name === 'TokenExpiredError') {
    error = new AppError('Authentication token expired', 401, 'TOKEN_EXPIRED');
  }

  const statusCode = error.statusCode || 500;
  const errorCode = error.errorCode || 'INTERNAL_ERROR';
  const isOperational = error.isOperational || false;

  if (!isOperational || statusCode >= 500) {
    logger.error(`${req.method} ${req.originalUrl} -> ${err.message}`, err.stack);
  }

  res.status(statusCode).json({
    success: false,
    error: {
      code: errorCode,
      message: error.message || 'Internal server error',
      ...(error.details ? { details: error.details } : {}),
    },
  });
};

module.exports = { notFound, errorHandler };
