const mongoose = require('mongoose');
const config = require('./env');
const logger = require('../utils/logger');

/**
 * Establishes the connection to MongoDB.
 * Exits the process on failure during startup since the API
 * cannot function without a database connection.
 */
const connectDB = async () => {
  try {
    mongoose.set('strictQuery', true);

    const conn = await mongoose.connect(config.db.uri, {
      // Modern mongoose driver no longer needs useNewUrlParser/useUnifiedTopology
      autoIndex: !config.isProduction, // disable automatic index builds in production
    });

    logger.info(`MongoDB connected: ${conn.connection.host}/${conn.connection.name}`);

    mongoose.connection.on('error', (err) => {
      logger.error(`MongoDB connection error: ${err.message}`);
    });

    mongoose.connection.on('disconnected', () => {
      logger.warn('MongoDB disconnected');
    });

    return conn;
  } catch (error) {
    logger.error(`Failed to connect to MongoDB: ${error.message}`);
    process.exit(1);
  }
};

module.exports = connectDB;
