const asyncHandler = require('../utils/asyncHandler');
const accountService = require('../services/account.service');

/**
 * @route GET /api/v1/accounts/dashboard
 */
const getDashboard = asyncHandler(async (req, res) => {
  const data = await accountService.getDashboardOverview(req.user._id);

  res.status(200).json({
    success: true,
    data,
  });
});

/**
 * @route GET /api/v1/accounts/me
 */
const getMyAccount = asyncHandler(async (req, res) => {
  const account = await accountService.getAccountDetails(req.user._id);

  res.status(200).json({
    success: true,
    data: { account },
  });
});

module.exports = {
  getDashboard,
  getMyAccount,
};
