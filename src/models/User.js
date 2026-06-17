const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const config = require('../config/env');

/**
 * User schema
 * Represents a registered customer of Spring Financial Bank.
 * Account/banking details live in the separate Account model
 * (one-to-one relationship via `account` ref).
 */
const userSchema = new mongoose.Schema(
  {
    fullName: {
      type: String,
      required: [true, 'Full name is required'],
      trim: true,
      minlength: [2, 'Full name must be at least 2 characters'],
      maxlength: [100, 'Full name cannot exceed 100 characters'],
    },
    username: {
      type: String,
      required: [true, 'Username is required'],
      unique: true,
      trim: true,
      lowercase: true,
      minlength: [3, 'Username must be at least 3 characters'],
      maxlength: [30, 'Username cannot exceed 30 characters'],
      match: [/^[a-z0-9_]+$/, 'Username can only contain lowercase letters, numbers, and underscores'],
    },
    email: {
      type: String,
      required: [true, 'Email is required'],
      unique: true,
      trim: true,
      lowercase: true,
      match: [/^\S+@\S+\.\S+$/, 'Please provide a valid email address'],
    },
    phoneNumber: {
      type: String,
      required: [true, 'Phone number is required'],
      trim: true,
      match: [/^\+?[0-9]{7,15}$/, 'Please provide a valid phone number'],
    },
    password: {
      type: String,
      required: [true, 'Password is required'],
      minlength: [8, 'Password must be at least 8 characters'],
      select: false,
    },
    role: {
      type: String,
      enum: ['customer'],
      default: 'customer',
    },
    profilePhoto: {
      type: String,
      default: null,
    },

    // --- Email verification ---
    isEmailVerified: {
      type: Boolean,
      default: false,
    },

    // --- Account status ---
    accountStatus: {
      type: String,
      enum: ['active', 'suspended', 'frozen', 'pending_verification'],
      default: 'pending_verification',
    },

    // --- KYC ---
    kycStatus: {
      type: String,
      enum: ['not_started', 'pending', 'verified', 'rejected'],
      default: 'not_started',
    },

    // --- Linked banking account ---
    account: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Account',
    },

    // --- Security: login attempts & lockout ---
    failedLoginAttempts: {
      type: Number,
      default: 0,
    },
    lockUntil: {
      type: Date,
      default: null,
    },
    lastLoginAt: {
      type: Date,
      default: null,
    },
    lastLoginIp: {
      type: String,
      default: null,
    },

    // --- Password reset ---
    passwordResetToken: {
      type: String,
      select: false,
    },
    passwordResetExpires: {
      type: Date,
      select: false,
    },

    // --- Refresh tokens (allow multiple active sessions/devices) ---
    refreshTokens: [
      {
        token: { type: String, select: false },
        createdAt: { type: Date, default: Date.now },
        userAgent: { type: String },
        ip: { type: String },
      },
    ],
  },
  {
    timestamps: true,
  }
);

// --- Indexes ---
// userSchema.index({ email: 1 }, { unique: true });
// userSchema.index({ username: 1 }, { unique: true });
userSchema.index({ accountStatus: 1 });
userSchema.index({ createdAt: -1 });

// --- Virtual: is the account currently locked? ---
userSchema.virtual('isLocked').get(function () {
  return !!(this.lockUntil && this.lockUntil > Date.now());
});

// --- Hash password before saving ---
userSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, config.bcrypt.saltRounds);
  next();
});

// --- Instance method: compare password ---
userSchema.methods.comparePassword = async function (candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

// --- Instance method: register failed login attempt ---
userSchema.methods.incrementLoginAttempts = async function () {
  // If lock has expired, reset counter
  if (this.lockUntil && this.lockUntil < Date.now()) {
    this.failedLoginAttempts = 1;
    this.lockUntil = null;
  } else {
    this.failedLoginAttempts += 1;
  }

  if (this.failedLoginAttempts >= config.accountLockout.maxAttempts) {
    this.lockUntil = new Date(Date.now() + config.accountLockout.lockMinutes * 60 * 1000);
  }

  await this.save({ validateBeforeSave: false });
};

// --- Instance method: reset login attempts on successful login ---
userSchema.methods.resetLoginAttempts = async function () {
  this.failedLoginAttempts = 0;
  this.lockUntil = null;
  await this.save({ validateBeforeSave: false });
};

// --- Remove sensitive fields when converting to JSON ---
userSchema.set('toJSON', {
  transform: (doc, ret) => {
    delete ret.password;
    delete ret.refreshTokens;
    delete ret.passwordResetToken;
    delete ret.passwordResetExpires;
    delete ret.__v;
    return ret;
  },
});

module.exports = mongoose.model('User', userSchema);
