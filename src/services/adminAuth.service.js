const Admin = require('../models/Admin');
const config = require('../config/env');
const { signAccessToken, signRefreshToken, verifyRefreshToken } = require('../utils/tokens');
const { recordAuditLog } = require('./auditLog.service');
const { UnauthorizedError, ForbiddenError, ConflictError, NotFoundError } = require('../utils/errors');

/**
 * Authenticates an admin with email + password.
 */
const loginAdmin = async ({ email, password }, meta = {}) => {
  const admin = await Admin.findOne({ email }).select('+password +refreshTokens.token');
  if (!admin) {
    throw new UnauthorizedError('Invalid email or password');
  }

  if (admin.isLocked) {
    throw new ForbiddenError('Admin account temporarily locked due to multiple failed login attempts.');
  }

  if (!admin.isActive) {
    throw new ForbiddenError('This admin account has been deactivated.');
  }

  const isMatch = await admin.comparePassword(password);
  if (!isMatch) {
    if (admin.lockUntil && admin.lockUntil < Date.now()) {
      admin.failedLoginAttempts = 1;
      admin.lockUntil = null;
    } else {
      admin.failedLoginAttempts += 1;
    }

    if (admin.failedLoginAttempts >= config.accountLockout.maxAttempts) {
      admin.lockUntil = new Date(Date.now() + config.accountLockout.lockMinutes * 60 * 1000);
    }

    await admin.save({ validateBeforeSave: false });

    await recordAuditLog({
      actorType: 'admin',
      actorId: admin._id,
      actorLabel: admin.email,
      action: 'ADMIN_LOGIN_FAILED',
      targetType: 'Admin',
      targetId: admin._id,
      description: 'Failed admin login attempt - incorrect password',
      ipAddress: meta.ip,
      userAgent: meta.userAgent,
      severity: 'warning',
    });

    throw new UnauthorizedError('Invalid email or password');
  }

  admin.failedLoginAttempts = 0;
  admin.lockUntil = null;
  admin.lastLoginAt = new Date();
  admin.lastLoginIp = meta.ip || null;

  const accessToken = signAccessToken({ sub: admin._id.toString(), type: 'admin', role: admin.role });
  const refreshToken = signRefreshToken({ sub: admin._id.toString(), type: 'admin' });

  admin.refreshTokens.push({
    token: refreshToken,
    userAgent: meta.userAgent || null,
    ip: meta.ip || null,
  });

  if (admin.refreshTokens.length > 5) {
    admin.refreshTokens = admin.refreshTokens.slice(-5);
  }

  await admin.save({ validateBeforeSave: false });

  await recordAuditLog({
    actorType: 'admin',
    actorId: admin._id,
    actorLabel: admin.email,
    action: 'ADMIN_LOGIN_SUCCESS',
    targetType: 'Admin',
    targetId: admin._id,
    description: 'Admin logged in successfully',
    ipAddress: meta.ip,
    userAgent: meta.userAgent,
  });

  return { admin, accessToken, refreshToken };
};

/**
 * Issues a new admin access token given a valid refresh token.
 */
const refreshAdminAccessToken = async (refreshToken) => {
  if (!refreshToken) {
    throw new UnauthorizedError('Refresh token is required');
  }

  let decoded;
  try {
    decoded = verifyRefreshToken(refreshToken);
  } catch (err) {
    throw new UnauthorizedError('Invalid or expired refresh token');
  }

  if (decoded.type !== 'admin') {
    throw new UnauthorizedError('Invalid token type');
  }

  const admin = await Admin.findById(decoded.sub).select('+refreshTokens.token');
  if (!admin || !admin.isActive) {
    throw new UnauthorizedError('Admin no longer exists or is inactive');
  }

  const tokenExists = admin.refreshTokens.some((rt) => rt.token === refreshToken);
  if (!tokenExists) {
    throw new UnauthorizedError('Refresh token has been revoked');
  }

  const accessToken = signAccessToken({ sub: admin._id.toString(), type: 'admin', role: admin.role });
  return { accessToken, admin };
};

/**
 * Logs out an admin by removing the refresh token.
 */
const logoutAdmin = async (adminId, refreshToken) => {
  const admin = await Admin.findById(adminId).select('+refreshTokens.token');
  if (!admin) return;

  admin.refreshTokens = admin.refreshTokens.filter((rt) => rt.token !== refreshToken);
  await admin.save({ validateBeforeSave: false });

  await recordAuditLog({
    actorType: 'admin',
    actorId: admin._id,
    actorLabel: admin.email,
    action: 'ADMIN_LOGOUT',
    targetType: 'Admin',
    targetId: admin._id,
    description: 'Admin logged out',
  });
};

/**
 * Changes an admin's own password.
 */
const changeAdminPassword = async (adminId, { currentPassword, newPassword }, meta = {}) => {
  const admin = await Admin.findById(adminId).select('+password +refreshTokens.token');
  if (!admin) {
    throw new NotFoundError('Admin not found');
  }

  const isMatch = await admin.comparePassword(currentPassword);
  if (!isMatch) {
    throw new UnauthorizedError('Current password is incorrect');
  }

  admin.password = newPassword;
  admin.refreshTokens = [];
  await admin.save();

  await recordAuditLog({
    actorType: 'admin',
    actorId: admin._id,
    actorLabel: admin.email,
    action: 'ADMIN_PASSWORD_CHANGED',
    targetType: 'Admin',
    targetId: admin._id,
    description: 'Admin changed their password',
    ipAddress: meta.ip,
    userAgent: meta.userAgent,
    severity: 'warning',
  });

  return admin;
};

/**
 * Creates a new admin account. Only superadmins should be able to call this
 * (enforced at the route level via requireRole).
 */
const createAdmin = async ({ fullName, username, email, password, role }, actor = {}) => {
  const existing = await Admin.findOne({ $or: [{ email }, { username }] });
  if (existing) {
    if (existing.email === email) {
      throw new ConflictError('An admin with this email already exists');
    }
    throw new ConflictError('This username is already taken');
  }

  const admin = await Admin.create({
    fullName,
    username,
    email,
    password,
    role: role || 'support',
  });

  await recordAuditLog({
    actorType: 'admin',
    actorId: actor.actorId,
    actorLabel: actor.actorLabel,
    action: 'ADMIN_CREATED',
    targetType: 'Admin',
    targetId: admin._id,
    description: `New admin account created with role "${admin.role}"`,
    severity: 'warning',
  });

  return admin;
};

module.exports = {
  loginAdmin,
  refreshAdminAccessToken,
  logoutAdmin,
  changeAdminPassword,
  createAdmin,
};
