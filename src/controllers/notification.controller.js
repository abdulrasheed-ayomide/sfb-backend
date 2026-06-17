const asyncHandler = require('../utils/asyncHandler');
const notificationService = require('../services/notification.service');

/**
 * @route GET /api/v1/notifications
 */
const getNotifications = asyncHandler(async (req, res) => {
  const { page, limit, unreadOnly } = req.query;

  const data = await notificationService.getNotifications(req.user._id, { page, limit, unreadOnly });

  res.status(200).json({
    success: true,
    data,
  });
});

/**
 * @route PATCH /api/v1/notifications/:id/read
 */
const markAsRead = asyncHandler(async (req, res) => {
  const notification = await notificationService.markAsRead(req.user._id, req.params.id);

  res.status(200).json({
    success: true,
    data: { notification },
  });
});

/**
 * @route PATCH /api/v1/notifications/read-all
 */
const markAllAsRead = asyncHandler(async (req, res) => {
  await notificationService.markAllAsRead(req.user._id);

  res.status(200).json({
    success: true,
    message: 'All notifications marked as read',
  });
});

module.exports = {
  getNotifications,
  markAsRead,
  markAllAsRead,
};
