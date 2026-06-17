const { verifyAccessToken } = require('../utils/tokens');
const { UnauthorizedError, ForbiddenError } = require('../utils/errors');
const User = require('../models/User');
const Admin = require('../models/Admin');
const asyncHandler = require('../utils/asyncHandler');

/**
 * Extracts a bearer token from the Authorization header.
 */
const extractToken = (req) => {
  const header = req.headers.authorization || '';
  if (header.startsWith('Bearer ')) {
    return header.slice(7).trim();
  }
  // Fallback to httpOnly cookie if present (e.g. "accessToken")
  if (req.cookies && req.cookies.accessToken) {
    return req.cookies.accessToken;
  }
  return null;
};

/**
 * Requires a valid customer JWT access token.
 * Attaches the authenticated user document to req.user.
 * Rejects users whose account is suspended/frozen.
 */
const protectCustomer = asyncHandler(async (req, res, next) => {
  const token = extractToken(req);
  if (!token) {
    throw new UnauthorizedError('Authentication required. Please log in.');
  }

  let decoded;
  try {
    decoded = verifyAccessToken(token);
  } catch (err) {
    throw new UnauthorizedError('Invalid or expired session. Please log in again.');
  }

  if (decoded.type !== 'customer') {
    throw new UnauthorizedError('Invalid token type for this resource.');
  }

  const user = await User.findById(decoded.sub);
  if (!user) {
    throw new UnauthorizedError('User account no longer exists.');
  }

  if (user.accountStatus === 'suspended') {
    throw new ForbiddenError('Your account has been suspended. Please contact support.');
  }

  if (user.accountStatus === 'frozen') {
    throw new ForbiddenError('Your account has been frozen. Please contact support.');
  }

  req.user = user;
  next();
});

/**
 * Requires a valid admin JWT access token.
 * Attaches the authenticated admin document to req.admin.
 */
const protectAdmin = asyncHandler(async (req, res, next) => {
  const token = extractToken(req);
  if (!token) {
    throw new UnauthorizedError('Admin authentication required.');
  }

  let decoded;
  try {
    decoded = verifyAccessToken(token);
  } catch (err) {
    throw new UnauthorizedError('Invalid or expired admin session.');
  }

  if (decoded.type !== 'admin') {
    throw new UnauthorizedError('Invalid token type for this resource.');
  }

  const admin = await Admin.findById(decoded.sub);
  if (!admin || !admin.isActive) {
    throw new UnauthorizedError('Admin account no longer exists or is inactive.');
  }

  req.admin = admin;
  next();
});

/**
 * Role-based access control for admin routes.
 * Usage: requireRole('superadmin', 'admin')
 */
const requireRole = (...allowedRoles) => (req, res, next) => {
  if (!req.admin) {
    throw new UnauthorizedError('Admin authentication required.');
  }
  if (!allowedRoles.includes(req.admin.role)) {
    throw new ForbiddenError('You do not have permission to perform this action.');
  }
  next();
};

module.exports = {
  protectCustomer,
  protectAdmin,
  requireRole,
  extractToken,
};
