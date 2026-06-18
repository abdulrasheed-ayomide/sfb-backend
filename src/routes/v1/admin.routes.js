const express = require('express');
const adminAuthController = require('../../controllers/adminAuth.controller');
const adminController = require('../../controllers/admin.controller');
const { protectAdmin, requireRole } = require('../../middleware/auth');
const { authLimiter } = require('../../middleware/rateLimiters');
const validate = require('../../middleware/validate');
const {
  adminLoginValidator,
  adminChangePasswordValidator,
  createAdminValidator,
  userListValidator,
  updateUserStatusValidator,
  updateKycStatusValidator,
  transactionListValidator,
  reverseTransactionValidator,
  auditLogListValidator,
} = require('../../validators/admin.validator');

const router = express.Router();

// ============================================================
// ADMIN AUTH (public)
// ============================================================
router.post('/auth/login', authLimiter, adminLoginValidator, validate, adminAuthController.login);
router.post('/auth/refresh', adminAuthController.refresh);

// ============================================================
// Everything below requires a valid admin session
// ============================================================
router.use(protectAdmin);

router.post('/auth/logout', adminAuthController.logout);
router.get('/auth/me', adminAuthController.getMe);
router.post('/auth/change-password', adminChangePasswordValidator, validate, adminAuthController.changePassword);
router.post(
  '/auth/create-admin',
  requireRole('superadmin'),
  createAdminValidator,
  validate,
  adminAuthController.createAdmin
);

// ============================================================
// USER MANAGEMENT
// ============================================================
router.get('/users', userListValidator, validate, adminController.listUsers);
router.get('/users/:id', adminController.getUserDetails);
router.patch(
  '/users/:id/status',
  requireRole('superadmin', 'admin', 'compliance'),
  updateUserStatusValidator,
  validate,
  adminController.updateUserStatus
);
router.patch(
  '/users/:id/kyc',
  requireRole('superadmin', 'admin', 'compliance'),
  updateKycStatusValidator,
  validate,
  adminController.updateKycStatus
);

// ============================================================
// CREDIT ACCOUNT (Admin Only - customers cannot access)
// ============================================================
router.post(
  '/credit-account',
  requireRole('superadmin', 'admin'),
  adminController.creditAccount
);

// ============================================================
// TRANSACTION MANAGEMENT
// ============================================================
router.get('/transactions', transactionListValidator, validate, adminController.listTransactions);
router.get('/transactions/failed', adminController.listFailedTransactions);
router.get('/transactions/reversed', adminController.listReversedTransactions);
router.get('/transactions/:id', adminController.getTransactionById);
router.delete('/transactions/:id', requireRole('superadmin', 'admin'), adminController.deleteTransaction);
router.post('/transactions/:id/reverse', requireRole('superadmin', 'admin', 'compliance'), reverseTransactionValidator, validate, adminController.reverseTransaction);

// ============================================================
// EXTERNAL TRANSFERS
// ============================================================
router.get('/external-transfers', adminController.listExternalTransfers);
router.post(
  '/external-transfers/:id/reverse',
  requireRole('superadmin', 'admin', 'compliance'),
  adminController.reverseExternalTransfer
);

// ============================================================
// ANALYTICS
// ============================================================
router.get('/analytics/overview', adminController.getAnalyticsOverview);

// ============================================================
// AUDIT LOGS
// ============================================================
router.get('/audit-logs', auditLogListValidator, validate, adminController.listAuditLogs);

// ============================================================
// ADMIN MANAGEMENT (superadmin only)
// ============================================================
router.get('/admins', requireRole('superadmin'), adminController.listAdmins);
router.patch('/admins/:id/status', requireRole('superadmin'), adminController.updateAdminStatus);

module.exports = router;
