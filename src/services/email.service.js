const nodemailer = require('nodemailer');
const config = require('../config/env');
const logger = require('../utils/logger');
const Notification = require('../models/Notification');

let transporter;

/**
 * Create SMTP transporter once and reuse it.
 */
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
 * Send email and record notification.
 */
const sendEmail = async ({
  to,
  subject,
  html,
  text,
  userId,
  notificationType = 'system',
  relatedTransaction,
}) => {
  let deliveryStatus = 'pending';
  let deliveryError = null;

  try {
    console.log('SMTP HOST:', config.email.host);
    console.log('SMTP USER:', config.email.user);
    console.log('Sending email to:', to);

    await getTransporter().sendMail({
      from: config.email.from,
      to,
      subject,
      html,
      text: text || undefined,
    });

    console.log('Email sent successfully');
    deliveryStatus = 'sent';
  } catch (error) {
    deliveryStatus = 'failed';
    deliveryError = error.message;

    logger.error(
      `Failed to send email to ${to}: ${error.message}`
    );
  }

  try {
    if (userId) {
      await Notification.create({
        user: userId,
        type: notificationType,
        title: subject,
        message: text || 'Email notification',
        relatedTransaction,
        deliveryStatus,
        deliveryError,
      });
    }
  } catch (notifErr) {
    logger.error(
      `Failed to record notification: ${notifErr.message}`
    );
  }

  return {
    success: deliveryStatus === 'sent',
    error: deliveryError,
  };
};

module.exports = {
  sendEmail,
  getTransporter,
};