const { body, query } = require('express-validator');

const adminLoginValidator = [
  body('email').trim().isEmail().withMessage('A valid email address is required').normalizeEmail(),
  body('password').notEmpty().withMessage('Password is required'),
];

const adminChangePasswordValidator = [
  body('currentPassword').notEmpty().withMessage('Current password is required'),
  body('newPassword')
    .isLength({ min: 8 })
    .withMessage('Password must be at least 8 characters long')
    .matches(/[A-Z]/)
    .withMessage('Password must contain at least one uppercase letter')
    .matches(/[a-z]/)
    .withMessage('Password must contain at least one lowercase letter')
    .matches(/[0-9]/)
    .withMessage('Password must contain at least one number')
    .matches(/[^A-Za-z0-9]/)
    .withMessage('Password must contain at least one special character'),
  body('confirmNewPassword').custom((value, { req }) => {
    if (value !== req.body.newPassword) {
      throw new Error('Passwords do not match');
    }
    return true;
  }),
];

const createAdminValidator = [
  body('fullName').trim().notEmpty().withMessage('Full name is required'),
  body('username')
    .trim()
    .toLowerCase()
    .notEmpty()
    .withMessage('Username is required')
    .matches(/^[a-z0-9_]+$/)
    .withMessage('Username can only contain lowercase letters, numbers, and underscores'),
  body('email').trim().isEmail().withMessage('A valid email address is required').normalizeEmail(),
  body('password')
    .isLength({ min: 8 })
    .withMessage('Password must be at least 8 characters long')
    .matches(/[A-Z]/)
    .matches(/[a-z]/)
    .matches(/[0-9]/)
    .matches(/[^A-Za-z0-9]/)
    .withMessage('Password must include upper/lowercase letters, a number, and a special character'),
  body('role')
    .optional()
    .isIn(['superadmin', 'admin', 'support', 'compliance'])
    .withMessage('Invalid role'),
];

const userListValidator = [
  query('status')
    .optional()
    .isIn(['active', 'suspended', 'frozen', 'pending_verification'])
    .withMessage('Invalid status filter'),
  query('kycStatus')
    .optional()
    .isIn(['not_started', 'pending', 'verified', 'rejected'])
    .withMessage('Invalid KYC status filter'),
  query('search').optional().trim().isLength({ max: 100 }),
  query('page').optional().isInt({ min: 1 }),
  query('limit').optional().isInt({ min: 1, max: 100 }),
];

const updateUserStatusValidator = [
  body('status')
    .isIn(['active', 'suspended', 'frozen'])
    .withMessage('Status must be one of: active, suspended, frozen'),
  body('reason').optional().trim().isLength({ max: 300 }),
];

const updateKycStatusValidator = [
  body('kycStatus')
    .isIn(['not_started', 'pending', 'verified', 'rejected'])
    .withMessage('Invalid KYC status'),
  body('reason').optional().trim().isLength({ max: 300 }),
];

const transactionListValidator = [
  query('status')
    .optional()
    .isIn(['pending', 'processing', 'successful', 'failed', 'reversed'])
    .withMessage('Invalid status filter'),
  query('type').optional().isIn(['transfer', 'reversal', 'deposit', 'withdrawal']),
  query('search').optional().trim().isLength({ max: 100 }),
  query('startDate').optional().isISO8601(),
  query('endDate').optional().isISO8601(),
  query('page').optional().isInt({ min: 1 }),
  query('limit').optional().isInt({ min: 1, max: 100 }),
];

const reverseTransactionValidator = [
  body('reason')
    .trim()
    .notEmpty()
    .withMessage('A reason is required')
    .isLength({ max: 300 })
    .withMessage('Reason cannot exceed 300 characters'),
];

const auditLogListValidator = [
  query('action').optional().trim().isLength({ max: 100 }),
  query('actorType').optional().isIn(['user', 'admin', 'system']),
  query('severity').optional().isIn(['info', 'warning', 'critical']),
  query('startDate').optional().isISO8601(),
  query('endDate').optional().isISO8601(),
  query('page').optional().isInt({ min: 1 }),
  query('limit').optional().isInt({ min: 1, max: 100 }),
];

module.exports = {
  adminLoginValidator,
  adminChangePasswordValidator,
  createAdminValidator,
  userListValidator,
  updateUserStatusValidator,
  updateKycStatusValidator,
  transactionListValidator,
  reverseTransactionValidator,
  auditLogListValidator,
};
