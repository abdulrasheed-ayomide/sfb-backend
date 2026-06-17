const mongoose = require('mongoose');

const transactionSchema = new mongoose.Schema(
  {
    reference: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },

    type: {
      type: String,
      enum: ['transfer', 'reversal', 'deposit', 'withdrawal', 'external_transfer', 'admin_credit'],
      default: 'transfer',
    },

    sender: {
      account: { type: mongoose.Schema.Types.ObjectId, ref: 'Account', default: null },
      accountNumber: { type: String, default: '' },
      name: { type: String, default: '' },
    },

    recipient: {
      account: { type: mongoose.Schema.Types.ObjectId, ref: 'Account', default: null },
      accountNumber: { type: String, default: '' },
      name: { type: String, default: '' },
    },

    // For external transfers: destination bank info
    externalBank: {
      bankName: { type: String, default: null },
      bankCode: { type: String, default: null },
      accountNumber: { type: String, default: null },
      accountName: { type: String, default: null },
    },

    amount: {
      type: mongoose.Schema.Types.Decimal128,
      required: true,
      get: (v) => (v ? parseFloat(v.toString()) : 0),
    },

    currency: {
      type: String,
      default: 'NGN',
    },

    narration: {
      type: String,
      trim: true,
      maxlength: 200,
      default: '',
    },

    status: {
      type: String,
      enum: ['pending', 'processing', 'successful', 'failed', 'reversed'],
      default: 'pending',
      index: true,
    },

    originalTransaction: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Transaction',
      default: null,
    },

    reversalTransaction: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Transaction',
      default: null,
    },

    reversalReason: {
      type: String,
      default: null,
    },

    senderBalanceAfter: {
      type: mongoose.Schema.Types.Decimal128,
      get: (v) => (v ? parseFloat(v.toString()) : null),
      default: null,
    },
    recipientBalanceAfter: {
      type: mongoose.Schema.Types.Decimal128,
      get: (v) => (v ? parseFloat(v.toString()) : null),
      default: null,
    },

    idempotencyKey: {
      type: String,
      index: true,
      sparse: true,
      unique: true,
    },

    stateHistory: [
      {
        status: { type: String },
        changedAt: { type: Date, default: Date.now },
        note: { type: String },
      },
    ],

    processedAt: {
      type: Date,
      default: null,
    },

    failureReason: {
      type: String,
      default: null,
    },

    // Admin who performed admin_credit
    performedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Admin',
      default: null,
    },
  },
  {
    timestamps: true,
    toJSON: { getters: true },
    toObject: { getters: true },
  }
);

transactionSchema.index({ 'sender.account': 1, createdAt: -1 });
transactionSchema.index({ 'recipient.account': 1, createdAt: -1 });
transactionSchema.index({ status: 1, createdAt: -1 });
transactionSchema.index({ type: 1, createdAt: -1 });

transactionSchema.methods.pushState = function (status, note = '') {
  this.status = status;
  this.stateHistory.push({ status, changedAt: new Date(), note });
};

module.exports = mongoose.model('Transaction', transactionSchema);
