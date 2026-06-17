const mongoose = require('mongoose');
const Account = require('../models/Account');
const User = require('../models/User');
const Transaction = require('../models/Transaction');
const { generateTransactionReference } = require('../utils/generateIdentifiers');
const { sendEmail } = require('./email.service');
const emailTemplates = require('./emailTemplates');
const { recordAuditLog } = require('./auditLog.service');
const {
  BadRequestError,
  NotFoundError,
  ForbiddenError,
  ConflictError,
} = require('../utils/errors');

/**
 * Looks up a recipient account by account number for the "verify recipient"
 * step before a transfer is submitted. Returns only non-sensitive info.
 */
const verifyRecipientAccount = async (accountNumber) => {
  const account = await Account.findOne({ accountNumber }).populate('user', 'fullName accountStatus');

  if (!account) {
    throw new NotFoundError('No account found with this account number');
  }

  if (account.accountStatus !== 'active') {
    throw new ForbiddenError('This account cannot currently receive transfers');
  }

  return {
    accountNumber: account.accountNumber,
    accountName: account.user.fullName,
  };
};

/**
 * Executes an internal fund transfer between two SFB accounts.
 *
 * Uses a MongoDB session/transaction to guarantee that:
 *  - sender balance is decremented
 *  - recipient balance is incremented
 *  - the transaction record is created
 * all atomically, or none of it happens.
 *
 * Validation performed:
 *  - sender account exists, active, not the same as recipient
 *  - recipient account exists and active
 *  - amount > 0
 *  - sufficient balance
 *  - idempotency (duplicate request protection)
 *
 * @param {Object} params
 * @param {ObjectId} params.senderUserId
 * @param {String} params.recipientAccountNumber
 * @param {Number} params.amount
 * @param {String} [params.narration]
 * @param {String} [params.idempotencyKey]
 * @param {Object} [meta] - { ip, userAgent }
 */
const createTransfer = async (
  { senderUserId, recipientAccountNumber, amount, narration = '', idempotencyKey = null },
  meta = {}
) => {
  if (amount <= 0) {
    throw new BadRequestError('Transfer amount must be greater than zero');
  }

  // --- Idempotency check (outside the session is fine for a fast pre-check) ---
  if (idempotencyKey) {
    const existing = await Transaction.findOne({ idempotencyKey });
    if (existing) {
      return { transaction: existing, duplicate: true };
    }
  }

  const senderAccount = await Account.findOne({ user: senderUserId });
  if (!senderAccount) {
    throw new NotFoundError('Sender account not found');
  }

  if (senderAccount.accountStatus !== 'active') {
    throw new ForbiddenError('Your account cannot currently send transfers. Please contact support.');
  }

  const recipientAccount = await Account.findOne({ accountNumber: recipientAccountNumber }).populate('user');
  if (!recipientAccount) {
    throw new NotFoundError('Recipient account not found');
  }

  if (recipientAccount.accountStatus !== 'active') {
    throw new ForbiddenError('Recipient account cannot currently receive transfers');
  }

  if (senderAccount._id.equals(recipientAccount._id)) {
    throw new BadRequestError('You cannot transfer funds to your own account');
  }

  const senderUser = await User.findById(senderUserId);
  const reference = generateTransactionReference();

  const session = await mongoose.startSession();
  let transaction;

  try {
    await session.withTransaction(async () => {
      // Re-fetch within the session for the freshest balance and to lock via session reads
      const sender = await Account.findById(senderAccount._id).session(session);
      const recipient = await Account.findById(recipientAccount._id).session(session);

      const senderBalance = parseFloat(sender.balance.toString());
      const transferAmount = parseFloat(amount);

      if (senderBalance < transferAmount) {
        throw new BadRequestError('Insufficient balance to complete this transfer');
      }

      // Create the transaction record in 'pending' state first
      const txDocs = await Transaction.create(
        [
          {
            reference,
            type: 'transfer',
            sender: {
              account: sender._id,
              accountNumber: sender.accountNumber,
              name: senderUser.fullName,
            },
            recipient: {
              account: recipient._id,
              accountNumber: recipient.accountNumber,
              name: recipient.user.fullName,
            },
            amount: mongoose.Types.Decimal128.fromString(transferAmount.toFixed(2)),
            narration,
            status: 'pending',
            idempotencyKey,
            stateHistory: [{ status: 'pending', changedAt: new Date(), note: 'Transfer initiated' }],
          },
        ],
        { session }
      );
      transaction = txDocs[0];

      // Move to 'processing'
      transaction.pushState('processing', 'Validating balances and updating accounts');
      await transaction.save({ session });

      // Update balances atomically
      const newSenderBalance = (senderBalance - transferAmount).toFixed(2);
      const newRecipientBalance = (parseFloat(recipient.balance.toString()) + transferAmount).toFixed(2);

      sender.balance = mongoose.Types.Decimal128.fromString(newSenderBalance);
      recipient.balance = mongoose.Types.Decimal128.fromString(newRecipientBalance);

      await sender.save({ session });
      await recipient.save({ session });

      // Mark transaction successful
      transaction.senderBalanceAfter = mongoose.Types.Decimal128.fromString(newSenderBalance);
      transaction.recipientBalanceAfter = mongoose.Types.Decimal128.fromString(newRecipientBalance);
      transaction.pushState('successful', 'Funds transferred successfully');
      transaction.processedAt = new Date();
      await transaction.save({ session });
    });
  } catch (error) {
    // If the transaction document was created before the error occurred,
    // mark it as failed and trigger reversal logic (credit back sender if needed).
    if (transaction) {
      await handleFailedTransaction(transaction._id, error.message);
    }
    throw error;
  } finally {
    await session.endSession();
  }

  // --- Post-transaction side effects (outside the DB transaction) ---
  await sendTransferNotifications({ transaction, senderUser, recipientUser: recipientAccount.user });

  await recordAuditLog({
    actorType: 'user',
    actorId: senderUserId,
    actorLabel: senderUser.email,
    action: 'TRANSFER_CREATED',
    targetType: 'Transaction',
    targetId: transaction._id,
    description: `Transfer of ${transaction.amount} to account ${recipientAccount.accountNumber}`,
    metadata: {
      reference: transaction.reference,
      amount: transaction.amount,
      recipientAccountNumber: recipientAccount.accountNumber,
    },
    ipAddress: meta.ip,
    userAgent: meta.userAgent,
  });

  return { transaction, duplicate: false };
};

/**
 * Sends debit/credit email notifications after a successful transfer.
 */
const sendTransferNotifications = async ({ transaction, senderUser, recipientUser }) => {
  const date = transaction.processedAt
    ? new Date(transaction.processedAt).toLocaleString()
    : new Date().toLocaleString();

  // Debit alert to sender
  const debitTemplate = emailTemplates.debitAlertEmail({
    fullName: senderUser.fullName,
    amount: transaction.amount,
    currency: transaction.currency,
    recipientName: transaction.recipient.name,
    reference: transaction.reference,
    date,
    balance: transaction.senderBalanceAfter,
  });

  await sendEmail({
    to: senderUser.email,
    subject: debitTemplate.subject,
    html: debitTemplate.html,
    text: debitTemplate.text,
    userId: senderUser._id,
    notificationType: 'debit_alert',
    relatedTransaction: transaction._id,
  });

  // Credit alert to recipient
  const creditTemplate = emailTemplates.creditAlertEmail({
    fullName: recipientUser.fullName,
    amount: transaction.amount,
    currency: transaction.currency,
    senderName: transaction.sender.name,
    reference: transaction.reference,
    date,
    balance: transaction.recipientBalanceAfter,
  });

  await sendEmail({
    to: recipientUser.email,
    subject: creditTemplate.subject,
    html: creditTemplate.html,
    text: creditTemplate.text,
    userId: recipientUser._id,
    notificationType: 'credit_alert',
    relatedTransaction: transaction._id,
  });
};

/**
 * Handles a transaction that failed *after* its record was created but
 * before it reached the 'successful' state (e.g. a write failure or
 * network interruption mid-process).
 *
 * Per the platform's reversal policy:
 *  - We do NOT blindly reverse on every transient error.
 *  - We only credit funds back to the sender if the sender's balance
 *    was actually debited as part of this transaction (i.e. the
 *    transaction had progressed far enough to mutate balances).
 *  - Every state change and reversal is recorded in the audit log and
 *    the transaction's own stateHistory for reconciliation.
 */
const handleFailedTransaction = async (transactionId, reason) => {
  const session = await mongoose.startSession();

  try {
    await session.withTransaction(async () => {
      const transaction = await Transaction.findById(transactionId).session(session);
      if (!transaction) return;

      // If already terminal, do nothing
      if (['successful', 'reversed', 'failed'].includes(transaction.status)) {
        return;
      }

      const wasDebited = transaction.senderBalanceAfter !== null;

      transaction.failureReason = reason;
      transaction.pushState('failed', `Transaction failed: ${reason}`);
      await transaction.save({ session });

      if (wasDebited) {
        // Sender's balance was already decremented - credit it back via a reversal record
        const senderAccount = await Account.findById(transaction.sender.account).session(session);
        const recipientAccount = await Account.findById(transaction.recipient.account).session(session);

        const amount = parseFloat(transaction.amount.toString());

        const senderBalance = parseFloat(senderAccount.balance.toString());
        const recipientBalance = parseFloat(recipientAccount.balance.toString());

        // Credit sender back
        senderAccount.balance = mongoose.Types.Decimal128.fromString((senderBalance + amount).toFixed(2));
        await senderAccount.save({ session });

        // If recipient was also credited, debit it back
        let recipientBalanceAfter = recipientBalance;
        if (transaction.recipientBalanceAfter !== null) {
          recipientBalanceAfter = recipientBalance - amount;
          recipientAccount.balance = mongoose.Types.Decimal128.fromString(recipientBalanceAfter.toFixed(2));
          await recipientAccount.save({ session });
        }

        const reversalRef = generateTransactionReference();
        const reversalDocs = await Transaction.create(
          [
            {
              reference: reversalRef,
              type: 'reversal',
              sender: transaction.recipient, // reversed direction
              recipient: transaction.sender,
              amount: transaction.amount,
              currency: transaction.currency,
              narration: `Reversal of ${transaction.reference}`,
              status: 'reversed',
              originalTransaction: transaction._id,
              reversalReason: reason,
              stateHistory: [
                { status: 'reversed', changedAt: new Date(), note: `Auto-reversal due to: ${reason}` },
              ],
              processedAt: new Date(),
              senderBalanceAfter: mongoose.Types.Decimal128.fromString(recipientBalanceAfter.toFixed(2)),
              recipientBalanceAfter: mongoose.Types.Decimal128.fromString((senderBalance + amount).toFixed(2)),
            },
          ],
          { session }
        );

        transaction.reversalTransaction = reversalDocs[0]._id;
        transaction.pushState('reversed', `Reversed via ${reversalRef}`);
        await transaction.save({ session });
      }
    });
  } finally {
    await session.endSession();
  }

  // Send reversal notification email (best-effort, outside the session)
  try {
    const transaction = await Transaction.findById(transactionId);
    if (transaction && transaction.status === 'reversed') {
      const senderAccount = await Account.findById(transaction.sender.account).populate('user');
      if (senderAccount && senderAccount.user) {
        const template = emailTemplates.reversalAlertEmail({
          fullName: senderAccount.user.fullName,
          amount: transaction.amount,
          currency: transaction.currency,
          originalReference: transaction.reference,
          reason,
          date: new Date().toLocaleString(),
        });

        await sendEmail({
          to: senderAccount.user.email,
          subject: template.subject,
          html: template.html,
          text: template.text,
          userId: senderAccount.user._id,
          notificationType: 'reversal_alert',
          relatedTransaction: transaction._id,
        });
      }
    }

    await recordAuditLog({
      actorType: 'system',
      actorLabel: 'transaction-engine',
      action: 'TRANSACTION_FAILED',
      targetType: 'Transaction',
      targetId: transactionId,
      description: `Transaction marked as failed: ${reason}`,
      severity: 'critical',
    });
  } catch (err) {
    // Notification failures should not throw further - already logged by email service
  }
};

/**
 * Manually reverses a successful transaction (e.g. initiated by an admin
 * investigating a dispute). Credits the original sender back, debits the
 * original recipient, and creates a reversal transaction record.
 *
 * @param {ObjectId} transactionId - the original successful transaction
 * @param {String} reason
 * @param {Object} actor - { actorType: 'admin'|'user', actorId, actorLabel }
 */
const reverseTransaction = async (transactionId, reason, actor = {}) => {
  if (!reason || !reason.trim()) {
    throw new BadRequestError('A reason is required to reverse a transaction');
  }

  const session = await mongoose.startSession();
  let reversal;
  let original;

  try {
    await session.withTransaction(async () => {
      original = await Transaction.findById(transactionId).session(session);
      if (!original) {
        throw new NotFoundError('Transaction not found');
      }

      if (original.status !== 'successful') {
        throw new ConflictError('Only successful transactions can be reversed');
      }

      if (original.reversalTransaction) {
        throw new ConflictError('This transaction has already been reversed');
      }

      const senderAccount = await Account.findById(original.sender.account).session(session).populate('user');
      const recipientAccount = await Account.findById(original.recipient.account)
        .session(session)
        .populate('user');

      const amount = parseFloat(original.amount.toString());
      const senderBalance = parseFloat(senderAccount.balance.toString());
      const recipientBalance = parseFloat(recipientAccount.balance.toString());

      if (recipientBalance < amount) {
        throw new ConflictError(
          'Cannot reverse: recipient account does not have sufficient balance to cover the reversal'
        );
      }

      // Credit original sender, debit original recipient
      const newSenderBalance = (senderBalance + amount).toFixed(2);
      const newRecipientBalance = (recipientBalance - amount).toFixed(2);

      senderAccount.balance = mongoose.Types.Decimal128.fromString(newSenderBalance);
      recipientAccount.balance = mongoose.Types.Decimal128.fromString(newRecipientBalance);

      await senderAccount.save({ session });
      await recipientAccount.save({ session });

      const reversalRef = generateTransactionReference();
      const reversalDocs = await Transaction.create(
        [
          {
            reference: reversalRef,
            type: 'reversal',
            sender: original.recipient,
            recipient: original.sender,
            amount: original.amount,
            currency: original.currency,
            narration: `Reversal of ${original.reference}: ${reason}`,
            status: 'reversed',
            originalTransaction: original._id,
            reversalReason: reason,
            stateHistory: [{ status: 'reversed', changedAt: new Date(), note: reason }],
            processedAt: new Date(),
            senderBalanceAfter: mongoose.Types.Decimal128.fromString(newRecipientBalance),
            recipientBalanceAfter: mongoose.Types.Decimal128.fromString(newSenderBalance),
          },
        ],
        { session }
      );
      reversal = reversalDocs[0];

      original.reversalTransaction = reversal._id;
      original.pushState('reversed', `Manually reversed: ${reason}`);
      await original.save({ session });

      // Stash populated accounts for post-session notifications
      original._senderAccountPopulated = senderAccount;
      original._recipientAccountPopulated = recipientAccount;
    });
  } finally {
    await session.endSession();
  }

  // --- Notifications ---
  const senderUser = original._senderAccountPopulated.user;
  const recipientUser = original._recipientAccountPopulated.user;

  const senderTemplate = emailTemplates.reversalAlertEmail({
    fullName: senderUser.fullName,
    amount: original.amount,
    currency: original.currency,
    originalReference: original.reference,
    reason,
    date: new Date().toLocaleString(),
  });

  await sendEmail({
    to: senderUser.email,
    subject: senderTemplate.subject,
    html: senderTemplate.html,
    text: senderTemplate.text,
    userId: senderUser._id,
    notificationType: 'reversal_alert',
    relatedTransaction: original._id,
  });

  const recipientTemplate = emailTemplates.reversalAlertEmail({
    fullName: recipientUser.fullName,
    amount: original.amount,
    currency: original.currency,
    originalReference: original.reference,
    reason,
    date: new Date().toLocaleString(),
  });

  await sendEmail({
    to: recipientUser.email,
    subject: recipientTemplate.subject,
    html: recipientTemplate.html,
    text: recipientTemplate.text,
    userId: recipientUser._id,
    notificationType: 'reversal_alert',
    relatedTransaction: original._id,
  });

  await recordAuditLog({
    actorType: actor.actorType || 'system',
    actorId: actor.actorId || null,
    actorLabel: actor.actorLabel || 'system',
    action: 'TRANSACTION_REVERSED',
    targetType: 'Transaction',
    targetId: original._id,
    description: `Transaction ${original.reference} reversed via ${reversal.reference}: ${reason}`,
    metadata: { originalReference: original.reference, reversalReference: reversal.reference, reason },
    severity: 'critical',
  });

  return { original, reversal };
};

/**
 * Retrieves paginated transaction history for a user's account with
 * filtering by status, direction (incoming/outgoing), date range, and
 * a free-text search across reference, narration, and counterparty name.
 */
const getTransactionHistory = async (userId, filters = {}) => {
  const account = await Account.findOne({ user: userId });
  if (!account) {
    throw new NotFoundError('Account not found');
  }

  const { status, direction, startDate, endDate, search, page = 1, limit = 20 } = filters;

  const pageNum = Math.max(parseInt(page, 10) || 1, 1);
  const limitNum = Math.min(Math.max(parseInt(limit, 10) || 20, 1), 100);

  const conditions = [];

  if (direction === 'incoming') {
    conditions.push({ 'recipient.account': account._id });
  } else if (direction === 'outgoing') {
    conditions.push({ 'sender.account': account._id });
  } else {
    conditions.push({
      $or: [{ 'sender.account': account._id }, { 'recipient.account': account._id }],
    });
  }

  const query = { $and: conditions };

  if (status) {
    query.status = status;
  }

  if (startDate || endDate) {
    query.createdAt = {};
    if (startDate) query.createdAt.$gte = new Date(startDate);
    if (endDate) query.createdAt.$lte = new Date(endDate);
  }

  if (search) {
    const regex = new RegExp(search, 'i');
    query.$and.push({
      $or: [
        { reference: regex },
        { narration: regex },
        { 'sender.name': regex },
        { 'recipient.name': regex },
        { 'sender.accountNumber': regex },
        { 'recipient.accountNumber': regex },
      ],
    });
  }

  const [transactions, total] = await Promise.all([
    Transaction.find(query)
      .sort({ createdAt: -1 })
      .skip((pageNum - 1) * limitNum)
      .limit(limitNum),
    Transaction.countDocuments(query),
  ]);

  // Annotate each transaction with direction relative to this account
  const annotated = transactions.map((tx) => {
    const obj = tx.toObject();
    if (tx.type === 'admin_credit') {
      obj.direction = 'incoming';
    } else if (!tx.sender.account) {
      obj.direction = 'incoming';
    } else {
      obj.direction = tx.sender.account.equals(account._id) ? 'outgoing' : 'incoming';
    }
    return obj;
  });

  return {
    transactions: annotated,
    pagination: {
      total,
      page: pageNum,
      limit: limitNum,
      totalPages: Math.ceil(total / limitNum) || 1,
    },
  };
};

/**
 * Retrieves a single transaction by reference, ensuring the requesting
 * user is a party to it (sender or recipient).
 */
const getTransactionByReference = async (userId, reference) => {
  const account = await Account.findOne({ user: userId });
  if (!account) {
    throw new NotFoundError('Account not found');
  }

  const transaction = await Transaction.findOne({ reference });
  if (!transaction) {
    throw new NotFoundError('Transaction not found');
  }

  const senderMatch = transaction.sender.account && transaction.sender.account.equals(account._id);
  const recipientMatch = transaction.recipient.account && transaction.recipient.account.equals(account._id);
  const isParty = senderMatch || recipientMatch;

  if (!isParty) {
    throw new ForbiddenError('You do not have permission to view this transaction');
  }

  const obj = transaction.toObject();
  if (transaction.type === 'admin_credit' || !transaction.sender.account) {
    obj.direction = 'incoming';
  } else {
    obj.direction = senderMatch ? 'outgoing' : 'incoming';
  }
  return obj;
};

// ============================================================
// EXTERNAL BANK TRANSFER
// ============================================================

const NIGERIAN_BANKS = [
  { name: 'Opay', code: 'OPAY' },
  { name: 'PalmPay', code: 'PALMPAY' },
  { name: 'Moniepoint', code: 'MONIEPOINT' },
  { name: 'Access Bank', code: 'ACCESS' },
  { name: 'GTBank', code: 'GTB' },
  { name: 'UBA', code: 'UBA' },
  { name: 'First Bank', code: 'FIRSTBANK' },
  { name: 'Zenith Bank', code: 'ZENITH' },
  { name: 'Union Bank', code: 'UNIONBANK' },
  { name: 'Fidelity Bank', code: 'FIDELITY' },
  { name: 'Sterling Bank', code: 'STERLING' },
  { name: 'Wema Bank', code: 'WEMA' },
];

/**
 * Returns the static bank list for the frontend.
 */
const getBankList = () => NIGERIAN_BANKS;

/**
 * Mock account name lookup for demo purposes.
 * Generates a deterministic name based on account number digits.
 */
const MOCK_NAMES = [
  'JOHN DOE', 'JANE SMITH', 'MICHAEL JOHNSON', 'SARAH WILLIAMS',
  'DAVID BROWN', 'EMILY DAVIS', 'JAMES WILSON', 'LINDA TAYLOR',
  'ROBERT ANDERSON', 'PATRICIA THOMAS', 'CHARLES JACKSON', 'BARBARA WHITE',
];

const verifyExternalAccount = (accountNumber) => {
  if (!/^\d{10}$/.test(accountNumber)) {
    throw new BadRequestError('Please enter a valid 10-digit account number');
  }
  const sum = accountNumber.split('').reduce((acc, d) => acc + parseInt(d), 0);
  const name = MOCK_NAMES[sum % MOCK_NAMES.length];
  return { accountNumber, accountName: name };
};

/**
 * Process an external bank transfer (demo — deducts from user's balance only).
 */
const createExternalTransfer = async (
  { senderUserId, bankCode, bankName, recipientAccountNumber, recipientAccountName, amount, narration = '', idempotencyKey = null },
  meta = {}
) => {
  if (amount <= 0) throw new BadRequestError('Transfer amount must be greater than zero');

  if (idempotencyKey) {
    const existing = await Transaction.findOne({ idempotencyKey });
    if (existing) return { transaction: existing, duplicate: true };
  }

  const senderAccount = await Account.findOne({ user: senderUserId });
  if (!senderAccount) throw new NotFoundError('Sender account not found');
  if (senderAccount.accountStatus !== 'active') {
    throw new ForbiddenError('Your account cannot currently send transfers. Please contact support.');
  }

  const senderUser = await User.findById(senderUserId);
  const currentBalance = parseFloat(senderAccount.balance.toString());
  if (currentBalance < amount) throw new BadRequestError('Insufficient balance for this transfer');

  const reference = generateTransactionReference();

  const session = await mongoose.startSession();
  session.startTransaction();

  let transaction;
  try {
    const newSenderBalance = currentBalance - amount;
    await Account.findByIdAndUpdate(
      senderAccount._id,
      { balance: newSenderBalance },
      { session }
    );

    const txnData = {
      reference,
      type: 'external_transfer',
      sender: {
        account: senderAccount._id,
        accountNumber: senderAccount.accountNumber,
        name: senderUser.fullName,
      },
      recipient: {
        account: null,
        accountNumber: recipientAccountNumber,
        name: recipientAccountName,
      },
      externalBank: {
        bankName,
        bankCode,
        accountNumber: recipientAccountNumber,
        accountName: recipientAccountName,
      },
      amount,
      narration: narration || `Transfer to ${bankName}`,
      status: 'successful',
      senderBalanceAfter: newSenderBalance,
      processedAt: new Date(),
      stateHistory: [{ status: 'successful', changedAt: new Date(), note: 'External transfer processed' }],
    };
    if (idempotencyKey) txnData.idempotencyKey = idempotencyKey;

    [transaction] = await Transaction.create([txnData], { session });
    await session.commitTransaction();
  } catch (err) {
    await session.abortTransaction();
    throw err;
  } finally {
    session.endSession();
  }

  await recordAuditLog({
    actorType: 'customer',
    actorId: senderUser._id,
    actorLabel: senderUser.email,
    action: 'EXTERNAL_TRANSFER_INITIATED',
    targetType: 'Transaction',
    targetId: transaction._id,
    description: `External transfer of ${amount} NGN to ${bankName} account ${recipientAccountNumber}`,
    ipAddress: meta.ip,
    userAgent: meta.userAgent,
  });

  return { transaction };
};

module.exports = {
  verifyRecipientAccount,
  createTransfer,
  handleFailedTransaction,
  reverseTransaction,
  getTransactionHistory,
  getTransactionByReference,
  getBankList,
  verifyExternalAccount,
  createExternalTransfer,
};
