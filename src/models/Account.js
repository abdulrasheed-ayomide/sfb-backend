const mongoose = require('mongoose');

/**
 * Account schema
 * Represents the banking account associated with a User.
 * Balance updates MUST go through the transaction service using
 * MongoDB sessions to guarantee atomicity - never mutate `balance`
 * directly outside of a session-managed operation.
 */
const accountSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      unique: true,
    },
    accountNumber: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    customerId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    accountType: {
      type: String,
      enum: ['savings', 'current'],
      default: 'savings',
    },
    currency: {
      type: String,
      default: 'NGN',
    },
    balance: {
      type: mongoose.Schema.Types.Decimal128,
      default: 0,
      get: (v) => (v ? parseFloat(v.toString()) : 0),
    },
    accountStatus: {
      type: String,
      enum: ['active', 'suspended', 'frozen', 'closed'],
      default: 'active',
    },
    dailyTransferLimit: {
      type: mongoose.Schema.Types.Decimal128,
      default: 1000000, // default limit, configurable per account
      get: (v) => (v ? parseFloat(v.toString()) : 0),
    },
    accountOpenedDate: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
    toJSON: { getters: true },
    toObject: { getters: true },
  }
);

// accountSchema.index({ accountNumber: 1 }, { unique: true });
// accountSchema.index({ customerId: 1 }, { unique: true });
// accountSchema.index({ user: 1 }, { unique: true });

module.exports = mongoose.model('Account', accountSchema);
