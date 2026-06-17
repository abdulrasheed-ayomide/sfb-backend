const { validationResult } = require('express-validator');
const { ValidationError } = require('../utils/errors');

/**
 * Runs after express-validator chains and converts validation
 * failures into a standardized ValidationError response.
 *
 * Usage: router.post('/route', [validators...], validate, controller)
 */
const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    const details = errors.array().map((e) => ({
      field: e.path,
      message: e.msg,
    }));
    throw new ValidationError('Validation failed', details);
  }
  next();
};

module.exports = validate;
