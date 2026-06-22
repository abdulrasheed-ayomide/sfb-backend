const { Resend } = require('resend');
const logger = require('../utils/logger');
const Notification = require('../models/Notification');

const resend = new Resend(process.env.RESEND_API_KEY);

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
    const { data, error } = await resend.emails.send({
      from: process.env.EMAIL_FROM,
      to,
      subject,
      html,
      text: text || undefined,
    });

    if (error) {
      throw new Error(error.message);
    }

    console.log('Email sent:', data);
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

  return {
    success: deliveryStatus === 'sent',
    error: deliveryError,
  };
};

module.exports = {
  sendEmail,
};