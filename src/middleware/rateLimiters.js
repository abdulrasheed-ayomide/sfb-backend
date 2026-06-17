const rateLimit = require('express-rate-limit');
const config = require('../config/env');

/**
 * General API rate limiter applied to all routes.
 */
const generalLimiter = rateLimit({
  windowMs: config.rateLimit.windowMinutes * 60 * 1000,
  max: config.rateLimit.maxRequests,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: {
      code: 'TOO_MANY_REQUESTS',
      message: 'Too many requests from this IP. Please try again later.',
    },
  },
});

/**
 * Stricter rate limiter for authentication endpoints
 * (login, register, password reset, OTP requests) to mitigate
 * brute-force and enumeration attacks.
 */
const authLimiter = rateLimit({
  windowMs: config.rateLimit.windowMinutes * 60 * 1000,
  max: config.rateLimit.authMaxRequests,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: {
      code: 'TOO_MANY_REQUESTS',
      message: 'Too many authentication attempts. Please try again later.',
    },
  },
});

/**
 * Very strict limiter for OTP / resend endpoints to prevent abuse
 * of the email-sending service.
 */
const otpLimiter = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 minutes
  max: 3,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: {
      code: 'TOO_MANY_REQUESTS',
      message: 'Too many OTP requests. Please wait a few minutes before trying again.',
    },
  },
});

/**
 * Limiter for the funds transfer endpoint to slow down automated abuse.
 */
const transferLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: {
      code: 'TOO_MANY_REQUESTS',
      message: 'Too many transfer requests. Please slow down.',
    },
  },
});
// console.log(transferLimiter);

module.exports = {
  generalLimiter,
  authLimiter,
  otpLimiter,
  transferLimiter,
};
