const mongoose = require('mongoose');

/**
 * AuditLog schema
 * Immutable record of security-relevant and administrative events.
 * Every critical action in the system (logins, transfers, profile
 * updates, admin actions, security events) must write an entry here.
 *
 * Audit logs should never be updated or deleted through normal
 * application flows.
 */
const auditLogSchema = new mongoose.Schema(
  {
    actorType: {
      type: String,
      enum: ['user', 'admin', 'system'],
      required: true,
    },
    actorId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
      // Not strictly typed to one collection since actor can be User or Admin
      refPath: undefined,
    },
    actorLabel: {
      type: String, // denormalized label (e.g. email/username) for quick reading
      default: null,
    },
    action: {
      type: String,
      required: true,
      // e.g. 'LOGIN_SUCCESS', 'LOGIN_FAILED', 'TRANSFER_CREATED',
      // 'TRANSFER_REVERSED', 'PROFILE_UPDATED', 'ACCOUNT_SUSPENDED',
      // 'ACCOUNT_FROZEN', 'ACCOUNT_REACTIVATED', 'PASSWORD_CHANGED', etc.
      index: true,
    },
    targetType: {
      type: String,
      enum: ['User', 'Admin', 'Account', 'Transaction', 'Otp', 'System', null],
      default: null,
    },
    targetId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
    },
    description: {
      type: String,
      default: '',
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    ipAddress: {
      type: String,
      default: null,
    },
    userAgent: {
      type: String,
      default: null,
    },
    severity: {
      type: String,
      enum: ['info', 'warning', 'critical'],
      default: 'info',
    },
  },
  {
    timestamps: true,
  }
);

auditLogSchema.index({ actorId: 1, createdAt: -1 });
auditLogSchema.index({ action: 1, createdAt: -1 });
auditLogSchema.index({ targetType: 1, targetId: 1 });
auditLogSchema.index({ createdAt: -1 });

module.exports = mongoose.model('AuditLog', auditLogSchema);
