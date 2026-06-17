const asyncHandler = require('../utils/asyncHandler');
const transactionService = require('../services/transaction.service');
const receiptService = require('../services/receipt.service');

const getMeta = (req) => ({
  ip: req.ip,
  userAgent: req.headers['user-agent'],
});

/**
 * @route GET /api/v1/transactions/verify-recipient?accountNumber=...
 */
const verifyRecipient = asyncHandler(async (req, res) => {
  const { accountNumber } = req.query;
  const data = await transactionService.verifyRecipientAccount(accountNumber);
  res.status(200).json({ success: true, data });
});

/**
 * @route POST /api/v1/transactions/transfer
 */
const transfer = asyncHandler(async (req, res) => {
  const { recipientAccountNumber, amount, narration, idempotencyKey } = req.body;
  const { transaction, duplicate } = await transactionService.createTransfer(
    { senderUserId: req.user._id, recipientAccountNumber, amount: Number(amount), narration, idempotencyKey },
    getMeta(req)
  );
  res.status(duplicate ? 200 : 201).json({
    success: true,
    message: duplicate ? 'This transfer has already been processed.' : 'Transfer completed successfully.',
    data: { transaction },
  });
});

/**
 * @route GET /api/v1/transactions
 */
const getHistory = asyncHandler(async (req, res) => {
  const { status, direction, startDate, endDate, search, page, limit } = req.query;
  const data = await transactionService.getTransactionHistory(req.user._id, {
    status, direction, startDate, endDate, search, page, limit,
  });
  res.status(200).json({ success: true, data });
});

/**
 * @route GET /api/v1/transactions/:reference
 */
const getByReference = asyncHandler(async (req, res) => {
  const { reference } = req.params;
  const transaction = await transactionService.getTransactionByReference(req.user._id, reference);
  res.status(200).json({ success: true, data: { transaction } });
});

/**
 * @route GET /api/v1/transactions/:reference/receipt
 */
const getReceipt = asyncHandler(async (req, res) => {
  const { reference } = req.params;
  const transaction = await transactionService.getTransactionByReference(req.user._id, reference);
  receiptService.streamTransactionReceipt(transaction, res);
});

/**
 * @route GET /api/v1/transactions/banks
 */
const getBankList = asyncHandler(async (req, res) => {
  const banks = transactionService.getBankList();
  res.status(200).json({ success: true, data: { banks } });
});

/**
 * @route GET /api/v1/transactions/verify-external?accountNumber=...
 */
const verifyExternalAccount = asyncHandler(async (req, res) => {
  const { accountNumber } = req.query;
  const data = transactionService.verifyExternalAccount(accountNumber);
  res.status(200).json({ success: true, data });
});

/**
 * @route POST /api/v1/transactions/external-transfer
 */
const externalTransfer = asyncHandler(async (req, res) => {
  const { bankCode, bankName, recipientAccountNumber, recipientAccountName, amount, narration, idempotencyKey } = req.body;
  const { transaction, duplicate } = await transactionService.createExternalTransfer(
    {
      senderUserId: req.user._id,
      bankCode,
      bankName,
      recipientAccountNumber,
      recipientAccountName,
      amount: Number(amount),
      narration,
      idempotencyKey,
    },
    getMeta(req)
  );
  res.status(duplicate ? 200 : 201).json({
    success: true,
    message: duplicate ? 'This transfer has already been processed.' : 'External transfer completed successfully.',
    data: { transaction },
  });
});

module.exports = {
  verifyRecipient,
  transfer,
  getHistory,
  getByReference,
  getReceipt,
  getBankList,
  verifyExternalAccount,
  externalTransfer,
};
