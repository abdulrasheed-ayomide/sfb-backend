const mongoose = require('mongoose');
const crypto = require('crypto');

/**
 * OTP schema
 * Stores hashed one-time-passcodes for email verification and
 * (optionally) other verification flows. Raw OTP values are never
 * stored - only their SHA-256 hash.
 *
 * A TTL index automatically removes expired documents from MongoDB.
 */
const otpSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    email: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
    },
    otpHash: {
      type: String,
      required: true,
    },
    purpose: {
      type: String,
      enum: ['email_verification', 'login_2fa'],
      default: 'email_verification',
    },
    attempts: {
      type: Number,
      default: 0,
    },
    maxAttempts: {
      type: Number,
      default: 5,
    },
    consumed: {
      type: Boolean,
      default: false,
    },
    expiresAt: {
      type: Date,
      required: true,
      index: { expires: 0 }, // TTL index - document removed once expiresAt is reached
    },
  },
  {
    timestamps: true,
  }
);

/**
 * Hash a raw OTP code using SHA-256.
 * Used both when generating and when validating an OTP.
 */
otpSchema.statics.hashCode = function (rawCode) {
  return crypto.createHash('sha256').update(String(rawCode)).digest('hex');
};

/**
 * Generate a random numeric OTP code of the given length.
 */
otpSchema.statics.generateCode = function (length = 6) {
  const min = Math.pow(10, length - 1);
  const max = Math.pow(10, length) - 1;
  return Math.floor(min + Math.random() * (max - min + 1)).toString();
};

module.exports = mongoose.model('Otp', otpSchema);
