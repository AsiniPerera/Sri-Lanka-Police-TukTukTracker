const { error } = require('../utils/apiResponse');

/**
 * 404 handler — catches unmatched routes
 */
const notFound = (req, res, next) => {
  return error(res, `Route ${req.method} ${req.originalUrl} not found`, 404, 'ROUTE_NOT_FOUND');
};

/**
 * Centralised error handler.
 * Translates common Mongoose errors into clean JSON responses.
 */
// eslint-disable-next-line no-unused-vars
const errorHandler = (err, req, res, next) => {
  // Development logging
  if (process.env.NODE_ENV !== 'test') {
    console.error('🔥 Error:', err.message);
    if (process.env.NODE_ENV === 'development') console.error(err.stack);
  }

  // Mongoose CastError (bad ObjectId)
  if (err.name === 'CastError') {
    return error(res, `Invalid ${err.path}: ${err.value}`, 400, 'INVALID_ID');
  }

  // Mongoose duplicate key
  if (err.code === 11000) {
    const field = Object.keys(err.keyValue || {})[0] || 'field';
    const value = err.keyValue ? err.keyValue[field] : '';
    return error(res, `Duplicate value for '${field}': ${value}`, 409, 'DUPLICATE_KEY');
  }

  // Mongoose validation error
  if (err.name === 'ValidationError') {
    const messages = Object.values(err.errors).map((e) => e.message);
    return error(res, messages.join('; '), 400, 'VALIDATION_ERROR');
  }

  // JWT errors (defence in depth)
  if (err.name === 'JsonWebTokenError') {
    return error(res, 'Invalid token', 401, 'INVALID_TOKEN');
  }
  if (err.name === 'TokenExpiredError') {
    return error(res, 'Token expired', 401, 'TOKEN_EXPIRED');
  }

  return error(res, err.message || 'Internal Server Error', err.statusCode || 500, err.code || 'INTERNAL_ERROR');
};

module.exports = { notFound, errorHandler };
