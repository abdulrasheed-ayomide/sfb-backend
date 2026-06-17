const express = require('express');
const accountController = require('../../controllers/account.controller');
const { protectCustomer } = require('../../middleware/auth');

const router = express.Router();

router.use(protectCustomer);

router.get('/dashboard', accountController.getDashboard);
router.get('/me', accountController.getMyAccount);

module.exports = router;
