const asyncHandler = require('../utils/asyncHandler');
const adminService = require('../services/admin.service');
const transactionService = require('../services/transaction.service');
const User = require('../models/User');
const Transaction = require('../models/Transaction');

const getActor = (req) => ({
  actorType: 'admin',
  actorId: req.admin._id,
  actorLabel: req.admin.email,
});

// ============================================================
// USER MANAGEMENT
// ============================================================

/**
 * @route GET /api/v1/admin/users
 */
const listUsers = asyncHandler(async (req, res) => {
  const { status, kycStatus, search, page, limit } = req.query;
  const data = await adminService.listUsers({ status, kycStatus, search, page, limit });

  res.status(200).json({ success: true, data });
});

/**
 * @route GET /api/v1/admin/users/:id
 */
const getUserDetails = asyncHandler(async (req, res) => {
  const data = await adminService.getUserDetails(req.params.id);

  res.status(200).json({ success: true, data });
});

/**
 * @route PATCH /api/v1/admin/users/:id/status
 */
const updateUserStatus = asyncHandler(async (req, res) => {
  const { status, reason } = req.body;
  const user = await adminService.updateUserStatus(req.params.id, { status, reason }, getActor(req));

  res.status(200).json({
    success: true,
    message: `User account status updated to "${status}"`,
    data: { user: user.toJSON() },
  });
});

/**
 * @route PATCH /api/v1/admin/users/:id/kyc
 */
const updateKycStatus = asyncHandler(async (req, res) => {
  const { kycStatus, reason } = req.body;
  const user = await adminService.updateKycStatus(req.params.id, { kycStatus, reason }, getActor(req));

  res.status(200).json({
    success: true,
    message: `KYC status updated to "${kycStatus}"`,
    data: { user: user.toJSON() },
  });
});

// ============================================================
// TRANSACTION MANAGEMENT
// ============================================================

/**
 * @route GET /api/v1/admin/transactions
 */
const listTransactions = asyncHandler(async (req, res) => {
  const { status, type, search, startDate, endDate, page, limit } = req.query;
  const data = await adminService.listTransactions({ status, type, search, startDate, endDate, page, limit });

  res.status(200).json({ success: true, data });
});

/**
 * @route GET /api/v1/admin/transactions/failed
 */
const listFailedTransactions = asyncHandler(async (req, res) => {
  const { page, limit } = req.query;
  const data = await adminService.listFailedTransactions({ page, limit });

  res.status(200).json({ success: true, data });
});

/**
 * @route GET /api/v1/admin/transactions/reversed
 */
const listReversedTransactions = asyncHandler(async (req, res) => {
  const { page, limit } = req.query;
  const data = await adminService.listReversedTransactions({ page, limit });

  res.status(200).json({ success: true, data });
});

/**
 * @route GET /api/v1/admin/transactions/:id
 */
const getTransactionById = asyncHandler(async (req, res) => {
  const transaction = await adminService.getTransactionById(req.params.id);

  res.status(200).json({ success: true, data: { transaction } });
});

/**
 * @route POST /api/v1/admin/transactions/:id/reverse
 */
const reverseTransaction = asyncHandler(async (req, res) => {
  const { reason } = req.body;

  const { original, reversal } = await transactionService.reverseTransaction(
    req.params.id,
    reason,
    getActor(req)
  );

  res.status(200).json({
    success: true,
    message: 'Transaction reversed successfully',
    data: { original, reversal },
  });
});

// ============================================================
// ANALYTICS
// ============================================================

/**
 * @route GET /api/v1/admin/analytics/overview
 */
const getAnalyticsOverview = asyncHandler(async (req, res) => {
  const data = await adminService.getAnalyticsOverview();

  res.status(200).json({ success: true, data });
});

// ============================================================
// AUDIT LOGS
// ============================================================

/**
 * @route GET /api/v1/admin/audit-logs
 */
const listAuditLogs = asyncHandler(async (req, res) => {
  const { action, actorType, severity, startDate, endDate, page, limit } = req.query;
  const data = await adminService.listAuditLogs({ action, actorType, severity, startDate, endDate, page, limit });

  res.status(200).json({ success: true, data });
});

// ============================================================
// CREDIT ACCOUNT
// ============================================================

/**
 * @route POST /api/v1/admin/credit-account
 */
const creditAccount = asyncHandler(async (req, res) => {
  const { accountNumber, amount, narration } = req.body;
  const { transaction, account } = await adminService.creditAccount(
    { accountNumber, amount: Number(amount), narration },
    getActor(req)
  );
  res.status(200).json({
    success: true,
    message: `Account ${accountNumber} credited successfully`,
    data: { transaction, account },
  });
});

// ============================================================
// EXTERNAL TRANSFERS
// ============================================================

/**
 * @route GET /api/v1/admin/external-transfers
 */
const listExternalTransfers = asyncHandler(async (req, res) => {
  const { page, limit } = req.query;
  const data = await adminService.listExternalTransfers({ page, limit });
  res.status(200).json({ success: true, data });
});

/**
 * @route POST /api/v1/admin/external-transfers/:id/reverse
 */
const reverseExternalTransfer = asyncHandler(async (req, res) => {
  const { reason } = req.body;
  const { original, reversal } = await adminService.reverseExternalTransfer(req.params.id, reason, getActor(req));
  res.status(200).json({
    success: true,
    message: 'External transfer reversed successfully',
    data: { original, reversal },
  });
});

// ============================================================
// ADMIN MANAGEMENT
// ============================================================

/**
 * @route GET /api/v1/admin/admins
 */
const listAdmins = asyncHandler(async (req, res) => {
  const { page, limit } = req.query;
  const data = await adminService.listAdmins({ page, limit });
  res.status(200).json({ success: true, data });
});

/**
 * @route PATCH /api/v1/admin/admins/:id/status
 */
const updateAdminStatus = asyncHandler(async (req, res) => {
  const { isActive } = req.body;
  const admin = await adminService.updateAdminStatus(req.params.id, { isActive }, getActor(req));
  res.status(200).json({
    success: true,
    message: `Admin ${isActive ? 'reactivated' : 'deactivated'} successfully`,
    data: { admin: admin.toJSON() },
  });
});

// @route DELETE /api/v1/admin/users/:id
//  * @desc Delete a user account (soft delete or hard delete based on your preference)
//  * @access Admins only
//  * @param {ObjectId} params.id - User ID to delete

const deleteUser = asyncHandler(async (req, res) => {
  const deletedUser = await User.findByIdAndDelete(req.params.id);

  if (!deletedUser) {
    return res.status(404).json({
      success: false,
      message: 'User not found',
    });
  }

  res.status(200).json({
    success: true,
    message: 'User deleted successfully',
  });
});

const deleteTransaction = asyncHandler(async (req, res) => {
  const transaction = await Transaction.findByIdAndDelete(
    req.params.id
  );

  if (!transaction) {
    return res.status(404).json({
      success: false,
      message: 'Transaction not found',
    });
  }

  res.status(200).json({
    success: true,
    message: 'Transaction deleted successfully',
  });
});

module.exports = {
  listUsers,
  getUserDetails,
  updateUserStatus,
  updateKycStatus,
  listTransactions,
  listFailedTransactions,
  listReversedTransactions,
  getTransactionById,
  reverseTransaction,
  getAnalyticsOverview,
  listAuditLogs,
  creditAccount,
  listExternalTransfers,
  reverseExternalTransfer,
  listAdmins,
  updateAdminStatus,
  deleteUser,
  deleteTransaction,
};
