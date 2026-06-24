const express = require('express');
const authController = require('../../controllers/auth.controller');
const { protectCustomer } = require('../../middleware/auth');
const { authLimiter, otpLimiter } = require('../../middleware/rateLimiters');
const validate = require('../../middleware/validate');
const {
  registerValidator,
  loginValidator,
  verifyOtpValidator,
  resendOtpValidator,
  forgotPasswordValidator,
  resetPasswordValidator,
  changePasswordValidator,
} = require('../../validators/auth.validator');

const router = express.Router();

router.post('/register', authLimiter, registerValidator, validate, authController.register);
router.post('/verify-otp', authLimiter, verifyOtpValidator, validate, authController.verifyOtp);
router.post('/resend-otp', otpLimiter, resendOtpValidator, validate, authController.resendOtp);
router.post('/login', authLimiter, loginValidator, validate, authController.login);
router.post('/refresh', authController.refresh);
router.post('/logout', protectCustomer, authController.logout);
router.post('/forgot-password', authLimiter, forgotPasswordValidator, validate, authController.forgotPassword);
router.post('/reset-password', authLimiter, resetPasswordValidator, validate, authController.resetPassword);
router.post('/change-password', protectCustomer, changePasswordValidator, validate, authController.changePassword);
router.get('/me', protectCustomer, authController.getMe);
router.get('/test-email', async (req, res) => {
  try {
    await sendEmail({
      to: 'yourtestemail@gmail.com',
      subject: 'SMTP Test',
      html: '<h1>Hello</h1>',
    });

    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({
      success: false,
      error: err.message,
    });
  }
});

module.exports = router;
