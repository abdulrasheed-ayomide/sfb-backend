const express = require('express');
const notificationController = require('../../controllers/notification.controller');
const { protectCustomer } = require('../../middleware/auth');

const router = express.Router();

router.use(protectCustomer);

router.get('/', notificationController.getNotifications);
router.patch('/read-all', notificationController.markAllAsRead);
router.patch('/:id/read', notificationController.markAsRead);

module.exports = router;
