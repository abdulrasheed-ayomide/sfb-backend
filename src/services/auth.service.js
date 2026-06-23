const crypto = require('crypto');
const mongoose = require('mongoose');
const config = require('../config/env');
const User = require('../models/User');
const Account = require('../models/Account');
const Otp = require('../models/Otp');
const { signAccessToken, signRefreshToken, verifyRefreshToken } = require('../utils/tokens');
const { generateUniqueAccountNumber, generateUniqueCustomerId } = require('../utils/generateIdentifiers');
const { sendEmail } = require('./email.service');
const emailTemplates = require('./emailTemplates');
const { recordAuditLog } = require('./auditLog.service');
const {
  BadRequestError,
  UnauthorizedError,
  NotFoundError,
  ConflictError,
  ForbiddenError,
} = require('../utils/errors');

/**
 * Registers a new customer.
 * - Creates the User document (unverified, pending_verification status)
 * - Generates and emails an OTP for email verification
 * Does NOT create the Account document yet - that happens on
 * successful email verification, so unverified accounts never hold
 * a banking account number.
 */
const registerUser = async ({ fullName, username, email, phoneNumber, password }, meta = {}) => {
  const existing = await User.findOne({ $or: [{ email }, { username }] });
  if (existing) {
    if (existing.email === email) {
      throw new ConflictError('An account with this email already exists');
    }
    throw new ConflictError('This username is already taken');
  }

  const user = await User.create({
    fullName,
    username,
    email,
    phoneNumber,
    password,
    accountStatus: 'pending_verification',
  });

  await issueOtp(user, 'email_verification');

  await recordAuditLog({
    actorType: 'user',
    actorId: user._id,
    actorLabel: user.email,
    action: 'USER_REGISTERED',
    targetType: 'User',
    targetId: user._id,
    description: 'New user registered, pending email verification',
    ipAddress: meta.ip,
    userAgent: meta.userAgent,
  });

  return user;
};

/**
 * Generates a new OTP for the given user/purpose, invalidates previous
 * unconsumed OTPs of the same purpose, and sends it via email.
 */
const issueOtp = async (user, purpose = 'email_verification') => {

  await Otp.updateMany(
    { 
      user: user._id, 
      purpose, 
      consumed:false 
    },
    { 
      consumed:true 
    }
  );


  const rawCode = Otp.generateCode(6);

  const otpHash = Otp.hashCode(rawCode);

  const expiresAt = new Date(
    Date.now() + config.otp.expiresMinutes * 60 * 1000
  );


  const otp = await Otp.create({
    user:user._id,
    email:user.email,
    otpHash,
    purpose,
    expiresAt,
  });


  const { subject, html, text } =
    emailTemplates.otpEmail({
      fullName:user.fullName,
      code:rawCode,
      expiresMinutes:config.otp.expiresMinutes,
    });



  try {

    await sendEmail({
      to:user.email,
      subject,
      html,
      text,
      userId:user._id,
      notificationType:'otp',
    });


  } catch(error){

    await Otp.deleteOne({
      _id:otp._id
    });


    throw error;

  }


  return {
    expiresAt
  };

};
/**
 * Verifies an OTP code for email verification.
 * On success: marks user as verified/active, creates their Account
 * (account number + customer ID), and sends a welcome email.
 */
const verifyEmailOtp = async ({ email, code }) => {
  const user = await User.findOne({ email });
  if (!user) {
    throw new NotFoundError('No account found with this email');
  }

  if (user.isEmailVerified) {
    throw new ConflictError('Email is already verified');
  }

  const otpRecord = await Otp.findOne({
    user: user._id,
    purpose: 'email_verification',
    consumed: false,
  }).sort({ createdAt: -1 });

  if (!otpRecord) {
    throw new BadRequestError('No active verification code found. Please request a new one.');
  }

  if (otpRecord.expiresAt < new Date()) {
    throw new BadRequestError('Verification code has expired. Please request a new one.');
  }

  if (otpRecord.attempts >= otpRecord.maxAttempts) {
    throw new ForbiddenError('Maximum verification attempts exceeded. Please request a new code.');
  }

  const candidateHash = Otp.hashCode(code);
  if (candidateHash !== otpRecord.otpHash) {
    otpRecord.attempts += 1;
    await otpRecord.save();
    throw new BadRequestError('Invalid verification code');
  }

  // Mark OTP consumed
  otpRecord.consumed = true;
  await otpRecord.save();

  // Activate user and create banking account atomically
  const session = await mongoose.startSession();
  let account;
  try {
    await session.withTransaction(async () => {
      user.isEmailVerified = true;
      user.accountStatus = 'active';
      await user.save({ session });

      const accountNumber = await generateUniqueAccountNumber(session);
      const customerId = await generateUniqueCustomerId(session);

      account = await Account.create(
        [
          {
            user: user._id,
            accountNumber,
            customerId,
            balance: 0,
          },
        ],
        { session }
      ).then((docs) => docs[0]);
 
      user.account = account._id;
      await user.save({ session });
    });
  } finally {
    await session.endSession();
  }

  const { subject, html, text } = emailTemplates.welcomeEmail({
    fullName: user.fullName,
    accountNumber: account.accountNumber,
    customerId: account.customerId,
  });

  await sendEmail({
    to: user.email,
    subject,
    html,
    text,
    userId: user._id,
    notificationType: 'welcome',
  });

  await recordAuditLog({
    actorType: 'user',
    actorId: user._id,
    actorLabel: user.email,
    action: 'EMAIL_VERIFIED',
    targetType: 'User',
    targetId: user._id,
    description: 'User verified email and activated account',
  });

  return { user, account };
};

/**
 * Resends an OTP for email verification.
 */
const resendEmailOtp = async ({ email }) => {
  const user = await User.findOne({ email });
  if (!user) {
    throw new NotFoundError('No account found with this email');
  }
  if (user.isEmailVerified) {
    throw new ConflictError('Email is already verified');
  }
  return issueOtp(user, 'email_verification');
};

/**
 * Authenticates a user with email + password.
 * Handles account lockout after repeated failures and issues
 * access + refresh tokens on success.
 */
const loginUser = async ({ email, password }, meta = {}) => {
  const user = await User.findOne({ email }).select('+password +refreshTokens.token');
  if (!user) {
    throw new UnauthorizedError('Invalid email or password');
  }

  if (user.isLocked) {
    throw new ForbiddenError(
      `Account temporarily locked due to multiple failed login attempts. Please try again later.`
    );
  }

  const isMatch = await user.comparePassword(password);
  if (!isMatch) {
    await user.incrementLoginAttempts();

    await recordAuditLog({
      actorType: 'user',
      actorId: user._id,
      actorLabel: user.email,
      action: 'LOGIN_FAILED',
      targetType: 'User',
      targetId: user._id,
      description: 'Failed login attempt - incorrect password',
      ipAddress: meta.ip,
      userAgent: meta.userAgent,
      severity: 'warning',
    });

    throw new UnauthorizedError('Invalid email or password');
  }

  if (!user.isEmailVerified) {

  console.log('Sending verification OTP to:', user.email);

  try {

    await issueOtp(user, 'email_verification');

  } catch (err) {

    console.error(
      "OTP email failed:",
      err.message
    );

    const error = new ForbiddenError(
      'Your email is not verified. Please request a new verification code.'
    );

    error.errorCode = 'EMAIL_NOT_VERIFIED';

    throw error;
  }


  const error = new ForbiddenError(
    'Please verify your email before logging in.'
  );

  error.errorCode = 'EMAIL_NOT_VERIFIED';

  throw error;
}


  if (user.accountStatus === 'suspended') {
    throw new ForbiddenError('Your account has been suspended. Please contact support.');
  }

  if (user.accountStatus === 'frozen') {
    throw new ForbiddenError('Your account has been frozen. Please contact support.');
  }

  await user.resetLoginAttempts();

  user.lastLoginAt = new Date();
  user.lastLoginIp = meta.ip || null;

  const accessToken = signAccessToken({ sub: user._id.toString(), type: 'customer' });
  const refreshToken = signRefreshToken({ sub: user._id.toString(), type: 'customer' });

  user.refreshTokens.push({
    token: refreshToken,
    userAgent: meta.userAgent || null,
    ip: meta.ip || null,
  });

  // Keep only the last 5 sessions per user
  if (user.refreshTokens.length > 5) {
    user.refreshTokens = user.refreshTokens.slice(-5);
  }

  await user.save({ validateBeforeSave: false });

  await recordAuditLog({
    actorType: 'user',
    actorId: user._id,
    actorLabel: user.email,
    action: 'LOGIN_SUCCESS',
    targetType: 'User',
    targetId: user._id,
    description: 'User logged in successfully',
    ipAddress: meta.ip,
    userAgent: meta.userAgent,
  });

  return { user, accessToken, refreshToken };
};

/**
 * Issues a new access token given a valid refresh token.
 */
const refreshAccessToken = async (refreshToken) => {
  if (!refreshToken) {
    throw new UnauthorizedError('Refresh token is required');
  }

  let decoded;
  try {
    decoded = verifyRefreshToken(refreshToken);
  } catch (err) {
    throw new UnauthorizedError('Invalid or expired refresh token');
  }

  if (decoded.type !== 'customer') {
    throw new UnauthorizedError('Invalid token type');
  }

  const user = await User.findById(decoded.sub).select('+refreshTokens.token');
  if (!user) {
    throw new UnauthorizedError('User no longer exists');
  }

  const tokenExists = user.refreshTokens.some((rt) => rt.token === refreshToken);
  if (!tokenExists) {
    throw new UnauthorizedError('Refresh token has been revoked');
  }

  const accessToken = signAccessToken({ sub: user._id.toString(), type: 'customer' });
  return { accessToken, user };
};

/**
 * Logs out a user by removing the given refresh token from their record.
 */
const logoutUser = async (userId, refreshToken) => {
  const user = await User.findById(userId).select('+refreshTokens.token');
  if (!user) return;

  user.refreshTokens = user.refreshTokens.filter((rt) => rt.token !== refreshToken);
  await user.save({ validateBeforeSave: false });

  await recordAuditLog({
    actorType: 'user',
    actorId: user._id,
    actorLabel: user.email,
    action: 'LOGOUT',
    targetType: 'User',
    targetId: user._id,
    description: 'User logged out',
  });
};

/**
 * Initiates password reset: generates a secure token, stores its hash
 * with an expiry, and emails a reset link to the user.
 * Always responds the same way regardless of whether the email exists,
 * to avoid account enumeration.
 */
const forgotPassword = async ({ email }) => {
  const user = await User.findOne({ email });
  if (!user) {
    // Do not reveal whether the email exists
    return;
  }

  const rawToken = crypto.randomBytes(32).toString('hex');
  const hashedToken = crypto.createHash('sha256').update(rawToken).digest('hex');

  user.passwordResetToken = hashedToken;
  user.passwordResetExpires = new Date(Date.now() + config.passwordReset.expiresMinutes * 60 * 1000);
  await user.save({ validateBeforeSave: false });

  const resetUrl = `${config.server.clientUrl}/reset-password?token=${rawToken}&email=${encodeURIComponent(
    user.email
  )}`;

  const { subject, html, text } = emailTemplates.passwordResetEmail({
    fullName: user.fullName,
    resetUrl,
    expiresMinutes: config.passwordReset.expiresMinutes,
  });

  await sendEmail({
    to: user.email,
    subject,
    html,
    text,
    userId: user._id,
    notificationType: 'password_reset',
  });

  await recordAuditLog({
    actorType: 'user',
    actorId: user._id,
    actorLabel: user.email,
    action: 'PASSWORD_RESET_REQUESTED',
    targetType: 'User',
    targetId: user._id,
    description: 'Password reset link requested',
    severity: 'warning',
  });
};

/**
 * Completes password reset using the raw token from the reset link.
 */
const resetPassword = async ({ email, token, password }) => {
  const hashedToken = crypto.createHash('sha256').update(token).digest('hex');

  const user = await User.findOne({
    email,
    passwordResetToken: hashedToken,
    passwordResetExpires: { $gt: new Date() },
  }).select('+passwordResetToken +passwordResetExpires +refreshTokens.token');

  if (!user) {
    throw new BadRequestError('Password reset link is invalid or has expired');
  }

  user.password = password;
  user.passwordResetToken = undefined;
  user.passwordResetExpires = undefined;
  // Invalidate all existing sessions for security
  user.refreshTokens = [];
  await user.save();

  const { subject, html, text } = emailTemplates.securityAlertEmail({
    fullName: user.fullName,
    eventDescription: 'Your password was successfully reset.',
    date: new Date().toLocaleString(),
    ip: null,
  });

  await sendEmail({
    to: user.email,
    subject,
    html,
    text,
    userId: user._id,
    notificationType: 'security_alert',
  });

  await recordAuditLog({
    actorType: 'user',
    actorId: user._id,
    actorLabel: user.email,
    action: 'PASSWORD_RESET_COMPLETED',
    targetType: 'User',
    targetId: user._id,
    description: 'Password reset completed successfully',
    severity: 'warning',
  });

  return user;
};

/**
 * Changes a logged-in user's password (requires current password).
 */
const changePassword = async (userId, { currentPassword, newPassword }, meta = {}) => {
  const user = await User.findById(userId).select('+password +refreshTokens.token');
  if (!user) {
    throw new NotFoundError('User not found');
  }

  const isMatch = await user.comparePassword(currentPassword);
  if (!isMatch) {
    throw new UnauthorizedError('Current password is incorrect');
  }

  user.password = newPassword;
  // Invalidate all sessions except optionally keep current - for simplicity, clear all
  user.refreshTokens = [];
  await user.save();

  const { subject, html, text } = emailTemplates.securityAlertEmail({
    fullName: user.fullName,
    eventDescription: 'Your account password was changed.',
    date: new Date().toLocaleString(),
    ip: meta.ip,
  });

  await sendEmail({
    to: user.email,
    subject,
    html,
    text,
    userId: user._id,
    notificationType: 'security_alert',
  });

  await recordAuditLog({
    actorType: 'user',
    actorId: user._id,
    actorLabel: user.email,
    action: 'PASSWORD_CHANGED',
    targetType: 'User',
    targetId: user._id,
    description: 'User changed their password',
    ipAddress: meta.ip,
    userAgent: meta.userAgent,
    severity: 'warning',
  });

  return user;
};

module.exports = {
  registerUser,
  issueOtp,
  verifyEmailOtp,
  resendEmailOtp,
  loginUser,
  refreshAccessToken,
  logoutUser,
  forgotPassword,
  resetPassword,
  changePassword,
};
