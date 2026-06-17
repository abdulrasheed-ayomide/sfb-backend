const asyncHandler = require('../utils/asyncHandler');
const authService = require('../services/auth.service');
const config = require('../config/env');

const getMeta = (req) => ({
  ip: req.ip,
  userAgent: req.headers['user-agent'],
});

const cookieOptions = {
  httpOnly: true,
  secure: config.isProduction,
  sameSite: 'strict',
  maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
};

/**
 * @route POST /api/v1/auth/register
 */
const register = asyncHandler(async (req, res) => {
  const { fullName, username, email, phoneNumber, password } = req.body;

  const user = await authService.registerUser(
    { fullName, username, email, phoneNumber, password },
    getMeta(req)
  );

  res.status(201).json({
    success: true,
    message: 'Registration successful. Please check your email for a verification code.',
    data: {
      userId: user._id,
      email: user.email,
    },
  });
});

/**
 * @route POST /api/v1/auth/verify-otp
 */
const verifyOtp = asyncHandler(async (req, res) => {
  const { email, code } = req.body;

  const { user, account } = await authService.verifyEmailOtp({ email, code });

  res.status(200).json({
    success: true,
    message: 'Email verified successfully. Your account is now active.',
    data: {
      user: user.toJSON(),
      account: {
        accountNumber: account.accountNumber,
        customerId: account.customerId,
        accountType: account.accountType,
        balance: account.balance,
      },
    },
  });
});

/**
 * @route POST /api/v1/auth/resend-otp
 */
const resendOtp = asyncHandler(async (req, res) => {
  const { email } = req.body;
  await authService.resendEmailOtp({ email });

  res.status(200).json({
    success: true,
    message: 'A new verification code has been sent to your email.',
  });
});

/**
 * @route POST /api/v1/auth/login
 */
const login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;

  const { user, accessToken, refreshToken } = await authService.loginUser({ email, password }, getMeta(req));

  res.cookie('refreshToken', refreshToken, cookieOptions);

  res.status(200).json({
    success: true,
    message: 'Login successful',
    data: {
      user: user.toJSON(),
      accessToken,
    },
  });
});

/**
 * @route POST /api/v1/auth/refresh
 */
const refresh = asyncHandler(async (req, res) => {
  const refreshToken = req.cookies?.refreshToken || req.body.refreshToken;

  const { accessToken, user } = await authService.refreshAccessToken(refreshToken);

  res.status(200).json({
    success: true,
    data: {
      accessToken,
      user: user.toJSON(),
    },
  });
});

/**
 * @route POST /api/v1/auth/logout
 */
const logout = asyncHandler(async (req, res) => {
  const refreshToken = req.cookies?.refreshToken || req.body.refreshToken;

  if (req.user && refreshToken) {
    await authService.logoutUser(req.user._id, refreshToken);
  }

  res.clearCookie('refreshToken', cookieOptions);

  res.status(200).json({
    success: true,
    message: 'Logged out successfully',
  });
});

/**
 * @route POST /api/v1/auth/forgot-password
 */
const forgotPassword = asyncHandler(async (req, res) => {
  const { email } = req.body;
  await authService.forgotPassword({ email });

  // Always return the same response to prevent account enumeration
  res.status(200).json({
    success: true,
    message: 'If an account with that email exists, a password reset link has been sent.',
  });
});

/**
 * @route POST /api/v1/auth/reset-password
 */
const resetPassword = asyncHandler(async (req, res) => {
  const { email, token, password } = req.body;
  await authService.resetPassword({ email, token, password });

  res.status(200).json({
    success: true,
    message: 'Your password has been reset successfully. Please log in with your new password.',
  });
});

/**
 * @route POST /api/v1/auth/change-password
 */
const changePassword = asyncHandler(async (req, res) => {
  const { currentPassword, newPassword } = req.body;

  await authService.changePassword(req.user._id, { currentPassword, newPassword }, getMeta(req));

  res.status(200).json({
    success: true,
    message: 'Password changed successfully. Please log in again on other devices.',
  });
});

/**
 * @route GET /api/v1/auth/me
 */
const getMe = asyncHandler(async (req, res) => {
  res.status(200).json({
    success: true,
    data: { user: req.user.toJSON() },
  });
});

module.exports = {
  register,
  verifyOtp,
  resendOtp,
  login,
  refresh,
  logout,
  forgotPassword,
  resetPassword,
  changePassword,
  getMe,
};
