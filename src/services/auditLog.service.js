const AuditLog = require('../models/AuditLog');
const logger = require('../utils/logger');

/**
 * Writes an audit log entry. Failures to write an audit log are logged
 * but do not throw, so they never break the primary request flow -
 * however, callers handling highly sensitive actions may choose to
 * await and check the result if stricter guarantees are required.
 *
 * @param {Object} params
 * @param {'user'|'admin'|'system'} params.actorType
 * @param {ObjectId|null} params.actorId
 * @param {String|null} params.actorLabel
 * @param {String} params.action
 * @param {String|null} params.targetType
 * @param {ObjectId|null} params.targetId
 * @param {String} [params.description]
 * @param {Object} [params.metadata]
 * @param {String|null} [params.ipAddress]
 * @param {String|null} [params.userAgent]
 * @param {'info'|'warning'|'critical'} [params.severity]
 * @param {Object} [params.session] - optional mongoose session for atomic writes
 */
const recordAuditLog = async ({
  actorType,
  actorId = null,
  actorLabel = null,
  action,
  targetType = null,
  targetId = null,
  description = '',
  metadata = {},
  ipAddress = null,
  userAgent = null,
  severity = 'info',
  session = null,
}) => {
  try {
    const doc = new AuditLog({
      actorType,
      actorId,
      actorLabel,
      action,
      targetType,
      targetId,
      description,
      metadata,
      ipAddress,
      userAgent,
      severity,
    });

    if (session) {
      await doc.save({ session });
    } else {
      await doc.save();
    }
  } catch (error) {
    logger.error(`Failed to record audit log for action "${action}": ${error.message}`);
  }
};

module.exports = { recordAuditLog };
