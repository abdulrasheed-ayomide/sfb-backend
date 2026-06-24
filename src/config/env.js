/**
 * Centralized environment configuration.
 * All environment variable access should go through this module so that
 * defaults, parsing, and validation live in a single place.
 */

require('dotenv').config();

const required = (key, fallback = undefined) => {
  const value = process.env[key] ?? fallback;
  if (value === undefined) {
    // Fail fast in production if a critical variable is missing.
    if (process.env.NODE_ENV === 'production') {
      throw new Error(`Missing required environment variable: ${key}`);
    }
  }
  return value;
};

const config = {
  env: process.env.NODE_ENV || 'development',
  isProduction: process.env.NODE_ENV === 'production',

  server: {
    port: parseInt(process.env.PORT, 10) || 5000,
    apiVersion: process.env.API_VERSION || 'v1',
    clientUrl: process.env.CLIENT_URL || 'http://localhost:3000',
  },

  db: {
    uri: required('MONGO_URI', 'mongodb://127.0.0.1:27017/sfb_bank'),
  },

  jwt: {
    accessSecret: required('JWT_ACCESS_SECRET', 'dev_access_secret_change_me'),
    refreshSecret: required('JWT_REFRESH_SECRET', 'dev_refresh_secret_change_me'),
    accessExpires: process.env.JWT_ACCESS_EXPIRES || '15m',
    refreshExpires: process.env.JWT_REFRESH_EXPIRES || '7d',
  },

  otp: {
    expiresMinutes: parseInt(process.env.OTP_EXPIRES_MINUTES, 10) || 10,
  },

  passwordReset: {
    expiresMinutes: parseInt(process.env.PASSWORD_RESET_EXPIRES_MINUTES, 10) || 30,
  },

  bcrypt: {
    saltRounds: parseInt(process.env.BCRYPT_SALT_ROUNDS, 10) || 12,
  },

  accountLockout: {
    maxAttempts: parseInt(process.env.MAX_LOGIN_ATTEMPTS, 10) || 5,
    lockMinutes: parseInt(process.env.ACCOUNT_LOCK_MINUTES, 10) || 30,
  },

  email: {
    host: process.env.SMTP_HOST,  
    port: parseInt(process.env.SMTP_PORT, 10) || 587,
    secure: process.env.SMTP_SECURE === 'true',
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
    from: process.env.EMAIL_FROM || 'Spring Financial Bank <no-reply@springfinancialbank.com>',
  },

  rateLimit: {
    windowMinutes: parseInt(process.env.RATE_LIMIT_WINDOW_MINUTES, 10) || 15,
    maxRequests: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS, 10) || 100,
    authMaxRequests: parseInt(process.env.AUTH_RATE_LIMIT_MAX_REQUESTS, 10) || 10,
  },

  seedAdmin: {
    email: process.env.SEED_ADMIN_EMAIL,
    password: process.env.SEED_ADMIN_PASSWORD,
    username: process.env.SEED_ADMIN_USERNAME || 'superadmin',
  },
};

module.exports = config;
