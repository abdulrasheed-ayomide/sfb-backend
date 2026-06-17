const asyncHandler = require('../utils/asyncHandler');
const adminAuthService = require('../services/adminAuth.service');
const config = require('../config/env');

const getMeta = (req) => ({
  ip: req.ip,
  userAgent: req.headers['user-agent'],
});

const cookieOptions = {
  httpOnly: true,
  secure: config.isProduction,
  sameSite: 'strict',
  maxAge: 7 * 24 * 60 * 60 * 1000,
};

/**
 * @route POST /api/v1/admin/auth/login
 */
const login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;

  const { admin, accessToken, refreshToken } = await adminAuthService.loginAdmin(
    { email, password },
    getMeta(req)
  );

  res.cookie('adminRefreshToken', refreshToken, cookieOptions);

  res.status(200).json({
    success: true,
    message: 'Login successful',
    data: {
      admin: admin.toJSON(),
      accessToken,
      // Also returned in body so the frontend SPA can store it for logout revocation.
      // The httpOnly cookie is used by the /refresh endpoint.
      refreshToken,
    },
  });
});

/**
 * @route POST /api/v1/admin/auth/refresh
 */
const refresh = asyncHandler(async (req, res) => {
  const refreshToken = req.cookies?.adminRefreshToken || req.body.refreshToken;

  const { accessToken, admin } = await adminAuthService.refreshAdminAccessToken(refreshToken);

  res.status(200).json({
    success: true,
    data: {
      accessToken,
      admin: admin.toJSON(),
    },
  });
});

/**
 * @route POST /api/v1/admin/auth/logout
 */
const logout = asyncHandler(async (req, res) => {
  const refreshToken = req.cookies?.adminRefreshToken || req.body.refreshToken;

  if (req.admin && refreshToken) {
    await adminAuthService.logoutAdmin(req.admin._id, refreshToken);
  }

  res.clearCookie('adminRefreshToken', cookieOptions);

  res.status(200).json({
    success: true,
    message: 'Logged out successfully',
  });
});

/**
 * @route POST /api/v1/admin/auth/change-password
 */
const changePassword = asyncHandler(async (req, res) => {
  const { currentPassword, newPassword } = req.body;

  await adminAuthService.changeAdminPassword(req.admin._id, { currentPassword, newPassword }, getMeta(req));

  res.status(200).json({
    success: true,
    message: 'Password changed successfully. Please log in again on other devices.',
  });
});

/**
 * @route POST /api/v1/admin/auth/create-admin
 * Restricted to superadmin role at the route level.
 */
const createAdmin = asyncHandler(async (req, res) => {
  const { fullName, username, email, password, role } = req.body;

  const admin = await adminAuthService.createAdmin(
    { fullName, username, email, password, role },
    { actorId: req.admin._id, actorLabel: req.admin.email }
  );

  res.status(201).json({
    success: true,
    message: 'Admin account created successfully',
    data: { admin: admin.toJSON() },
  });
});

/**
 * @route GET /api/v1/admin/auth/me
 */
const getMe = asyncHandler(async (req, res) => {
  res.status(200).json({
    success: true,
    data: { admin: req.admin.toJSON() },
  });
});

module.exports = {
  login,
  refresh,
  logout,
  changePassword,
  createAdmin,
  getMe,
};
