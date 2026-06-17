const nodemailer = require('nodemailer');
const config = require('../config/env');
const logger = require('../utils/logger');
const Notification = require('../models/Notification');

/**
 * Email service
 * Wraps Nodemailer to send transactional emails and records each
 * attempt as a Notification document for auditability.
 */

let transporter;

const getTransporter = () => {
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: config.email.host,
      port: config.email.port,
      secure: config.email.secure,
      auth: {
        user: config.email.user,
        pass: config.email.pass,
      },
    });
  }
  return transporter;
};

/**
 * Sends an email and logs a Notification record.
 *
 * @param {Object} params
 * @param {String} params.to - recipient email address
 * @param {String} params.subject
 * @param {String} params.html
 * @param {String} [params.text]
 * @param {ObjectId} [params.userId] - user to attach the notification record to
 * @param {String} [params.notificationType] - one of Notification.type enum values
 * @param {ObjectId} [params.relatedTransaction]
 */
const sendEmail = async ({
  to,
  subject,
  html,
  text,
  userId = null,
  notificationType = 'general',
  relatedTransaction = null,
}) => {
  let deliveryStatus = 'pending';
  let deliveryError = null;

  try {
    await getTransporter().sendMail({
      from: config.email.from,
      to,
      subject,
      html,
      text: text || undefined,
    });
    deliveryStatus = 'sent';
  } catch (error) {
    deliveryStatus = 'failed';
    deliveryError = error.message;
    logger.error(`Failed to send email to ${to}: ${error.message}`);
  }

  if (userId) {
    try {
      await Notification.create({
        user: userId,
        type: notificationType,
        channel: 'email',
        title: subject,
        message: text || subject,
        relatedTransaction,
        deliveryStatus,
        deliveryError,
      });
    } catch (notifErr) {
      logger.error(`Failed to record notification: ${notifErr.message}`);
    }
  }

  if (deliveryStatus === 'failed') {
    // We do not throw here by default - email failure should not
    // necessarily block the primary operation (e.g. registration).
    // Callers that require guaranteed delivery should check the return value.
    return { success: false, error: deliveryError };
  }

  return { success: true };
};

module.exports = {
  sendEmail,
  getTransporter,
};
