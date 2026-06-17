/**
 * Seeds an initial superadmin account using credentials from .env
 * (SEED_ADMIN_EMAIL, SEED_ADMIN_PASSWORD, SEED_ADMIN_USERNAME).
 *
 * Usage: npm run seed:admin
 */
const mongoose = require('mongoose');
const config = require('../config/env');
const Admin = require('../models/Admin');
const logger = require('./logger');

const run = async () => {
  if (!config.seedAdmin.email || !config.seedAdmin.password) {
    logger.error('SEED_ADMIN_EMAIL and SEED_ADMIN_PASSWORD must be set in .env');
    process.exit(1);
  }

  await mongoose.connect(config.db.uri);
  logger.info('Connected to MongoDB for admin seeding');

  const existing = await Admin.findOne({ email: config.seedAdmin.email });
  if (existing) {
    logger.info(`Admin with email ${config.seedAdmin.email} already exists. Skipping.`);
    await mongoose.disconnect();
    return;
  }

  const admin = await Admin.create({
    fullName: 'Super Administrator',
    username: config.seedAdmin.username,
    email: config.seedAdmin.email,
    password: config.seedAdmin.password,
    role: 'superadmin',
    isActive: true,
  });

  logger.info(`Superadmin created: ${admin.email} (username: ${admin.username})`);
  logger.info('IMPORTANT: Log in and change this password immediately.');

  await mongoose.disconnect();
};

run().catch((err) => {
  logger.error('Failed to seed admin:', err);
  process.exit(1);
});
