const { body } = require('express-validator');

const updateProfileValidator = [
  body('fullName')
    .optional()
    .trim()
    .isLength({ min: 2, max: 100 })
    .withMessage('Full name must be between 2 and 100 characters'),

  body('phoneNumber')
    .optional()
    .trim()
    .matches(/^\+?[0-9]{7,15}$/)
    .withMessage('A valid phone number is required'),
];

module.exports = {
  updateProfileValidator,
};
