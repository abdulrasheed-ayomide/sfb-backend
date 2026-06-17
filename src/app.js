const express = require('express');
const path = require('path');
const helmet = require('helmet');
const cors = require('cors');
const morgan = require('morgan');
const cookieParser = require('cookie-parser');
const mongoSanitize = require('express-mongo-sanitize');
const xss = require('xss-clean');
const hpp = require('hpp');

const config = require('./config/env');
const { notFound, errorHandler } = require('./middleware/errorHandler');
const { generalLimiter } = require('./middleware/rateLimiters');
const v1Routes = require('./routes/v1');

const app = express();

// --- Security headers ---
app.use(helmet());

// --- CORS ---
const allowedOrigins = [
  config.server.clientUrl,
  'http://localhost:3000',
  'http://localhost:5173',
   'https://spring-fin-bank.vercel.app',
].filter(Boolean);

console.log('CLIENT_URL:', config.server.clientUrl);
console.log('ALLOWED_ORIGINS:', allowedOrigins);
app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (curl, Postman, server-to-server)
      if (!origin) return callback(null, true);
      if (allowedOrigins.includes(origin)) return callback(null, true);
      callback(new Error(`CORS: Origin '${origin}' not allowed`));
    },
    credentials: true,
  })
);

// --- Body parsing ---
app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: true, limit: '10kb' }));
app.use(cookieParser());

// --- Sanitization against NoSQL injection & XSS ---
app.use(mongoSanitize());
app.use(xss());

// --- Prevent HTTP parameter pollution ---
app.use(hpp());

// --- Logging ---
if (!config.isProduction) {
  app.use(morgan('dev'));
} else {
  app.use(morgan('combined'));
}

// --- Static file serving (profile photos) ---
app.use('/uploads', express.static(path.join(__dirname, '..', 'uploads')));

// --- Rate limiting (general) ---
app.use(`/api/${config.server.apiVersion}`, generalLimiter);

// --- API routes ---
app.use(`/api/${config.server.apiVersion}`, v1Routes);

// --- Root ---
app.get('/', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'Welcome to the Spring Financial Bank (SFB) API',
    apiVersion: config.server.apiVersion,
    docs: `/api/${config.server.apiVersion}/health`,
  });
});

// --- 404 + error handling ---
app.use(notFound);
app.use(errorHandler);

module.exports = app;
