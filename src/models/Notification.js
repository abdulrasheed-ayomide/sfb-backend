const mongoose = require('mongoose');

/**
 * Notification schema
 * Stores a record of every notification sent to a user (email-based today,
 * but the schema supports future channels such as SMS or push).
 * Used to power an in-app notification center and for audit/debugging
 * of the email notification system.
 */
const notificationSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    type: {
      type: String,
      enum: [
        'debit_alert',
        'credit_alert',
        'reversal_alert',
        'security_alert',
        'account_status_change',
        'welcome',
        'password_reset',
        'otp',
        'general',
      ],
      required: true,
    },
    channel: {
      type: String,
      enum: ['email', 'sms', 'push', 'in_app'],
      default: 'email',
    },
    title: {
      type: String,
      required: true,
    },
    message: {
      type: String,
      required: true,
    },
    relatedTransaction: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Transaction',
      default: null,
    },
    isRead: {
      type: Boolean,
      default: false,
    },
    deliveryStatus: {
      type: String,
      enum: ['pending', 'sent', 'failed'],
      default: 'pending',
    },
    deliveryError: {
      type: String,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

notificationSchema.index({ user: 1, createdAt: -1 });
notificationSchema.index({ user: 1, isRead: 1 });

module.exports = mongoose.model('Notification', notificationSchema);
