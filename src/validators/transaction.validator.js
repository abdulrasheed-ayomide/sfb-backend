const { body, query } = require('express-validator');

const transferValidator = [
  body('recipientAccountNumber')
    .trim()
    .notEmpty()
    .withMessage('Recipient account number is required')
    .isLength({ min: 10, max: 10 })
    .withMessage('Account number must be 10 digits')
    .isNumeric()
    .withMessage('Account number must contain only digits'),

  body('amount')
    .notEmpty()
    .withMessage('Amount is required')
    .isFloat({ gt: 0 })
    .withMessage('Amount must be a positive number')
    .custom((value) => {
      if (Number(value) > 100000000) {
        throw new Error('Amount exceeds maximum allowed transfer limit');
      }
      return true;
    }),

  body('narration')
    .optional({ checkFalsy: true })
    .trim()
    .isLength({ max: 200 })
    .withMessage('Narration cannot exceed 200 characters'),

  body('idempotencyKey')
    .optional({ checkFalsy: true })
    .trim()
    .isLength({ min: 8, max: 100 })
    .withMessage('Invalid idempotency key'),
];
// console.log(transferValidator)

const verifyRecipientValidator = [
  query('accountNumber')
    .trim()
    .notEmpty()
    .withMessage('Account number is required')
    .isLength({ min: 10, max: 10 })
    .withMessage('Account number must be 10 digits')
    .isNumeric()
    .withMessage('Account number must contain only digits'),
];

const transactionHistoryValidator = [
  query('status')
    .optional()
    .isIn(['pending', 'processing', 'successful', 'failed', 'reversed'])
    .withMessage('Invalid status filter'),
  query('direction')
    .optional()
    .isIn(['incoming', 'outgoing'])
    .withMessage('Invalid direction filter'),
  query('startDate').optional().isISO8601().withMessage('startDate must be a valid date'),
  query('endDate').optional().isISO8601().withMessage('endDate must be a valid date'),
  query('page').optional().isInt({ min: 1 }).withMessage('page must be a positive integer'),
  query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('limit must be between 1 and 100'),
  query('search').optional().trim().isLength({ max: 100 }),
];

module.exports = {
  transferValidator,
  verifyRecipientValidator,
  transactionHistoryValidator,
};
