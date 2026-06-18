const express = require('express');
const transactionController = require('../../controllers/transaction.controller');
// console.log("transfer controller =>", transactionController.transfer);
// console.log("externalTransfer controller =>", transactionController.externalTransfer);

const { protectCustomer } = require('../../middleware/auth');
const { transferLimiter } = require('../../middleware/rateLimiters');
const validate = require('../../middleware/validate');
const {
  transferValidator,
  verifyRecipientValidator,
} = require('../../validators/transaction.validator');

const router = express.Router();

router.use(protectCustomer);

// Bank list (public for auth users)
router.get('/banks', transactionController.getBankList);

// Internal transfer
router.get('/verify-recipient', verifyRecipientValidator, validate, transactionController.verifyRecipient);
router.post('/transfer', transferLimiter, transferValidator, validate, transactionController.transfer);
// router.post('/transfer', (req, res) => {
//   res.send('working');
// });

// External transfer
router.get('/verify-external', transactionController.verifyExternalAccount);
router.post('/external-transfer', transferLimiter, transactionController.externalTransfer);

// History
router.get('/', transactionController.getHistory);
router.get('/:reference/receipt', transactionController.getReceipt);
router.get('/:reference', transactionController.getByReference);

// console.log('transferLimiter:', transferLimiter);
// console.log('transferValidator:', transferValidator);
// console.log('transfer controller:', transactionController.transfer);
module.exports = router;
