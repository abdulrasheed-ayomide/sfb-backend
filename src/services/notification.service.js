const Notification = require('../models/Notification');
const { NotFoundError } = require('../utils/errors');

/**
 * Retrieves paginated notifications for a user.
 */
const getNotifications = async (userId, { page = 1, limit = 20, unreadOnly = false } = {}) => {
  const pageNum = Math.max(parseInt(page, 10) || 1, 1);
  const limitNum = Math.min(Math.max(parseInt(limit, 10) || 20, 1), 100);

  const query = { user: userId };
  if (unreadOnly === 'true' || unreadOnly === true) {
    query.isRead = false;
  }

  const [notifications, total, unreadCount] = await Promise.all([
    Notification.find(query)
      .sort({ createdAt: -1 })
      .skip((pageNum - 1) * limitNum)
      .limit(limitNum),
    Notification.countDocuments(query),
    Notification.countDocuments({ user: userId, isRead: false }),
  ]);

  return {
    notifications,
    unreadCount,
    pagination: {
      total,
      page: pageNum,
      limit: limitNum,
      totalPages: Math.ceil(total / limitNum) || 1,
    },
  };
};

/**
 * Marks a single notification as read.
 */
const markAsRead = async (userId, notificationId) => {
  const notification = await Notification.findOneAndUpdate(
    { _id: notificationId, user: userId },
    { isRead: true },
    { new: true }
  );

  if (!notification) {
    throw new NotFoundError('Notification not found');
  }

  return notification;
};

/**
 * Marks all notifications as read for a user.
 */
const markAllAsRead = async (userId) => {
  await Notification.updateMany({ user: userId, isRead: false }, { isRead: true });
};

module.exports = {
  getNotifications,
  markAsRead,
  markAllAsRead,
};
