const mongoose = require('mongoose');
const User = require('../models/User');
const Account = require('../models/Account');
const Transaction = require('../models/Transaction');
const AuditLog = require('../models/AuditLog');
const Admin = require('../models/Admin');
const { sendEmail } = require('./email.service');
const emailTemplates = require('./emailTemplates');
const { recordAuditLog } = require('./auditLog.service');
const { generateTransactionReference } = require('../utils/generateIdentifiers');
const { NotFoundError, ConflictError, BadRequestError } = require('../utils/errors');

// ============================================================
// USER MANAGEMENT
// ============================================================

/**
 * Paginated, filterable list of customers for the admin portal.
 */
const listUsers = async ({ status, kycStatus, search, page = 1, limit = 20 } = {}) => {
  const pageNum = Math.max(parseInt(page, 10) || 1, 1);
  const limitNum = Math.min(Math.max(parseInt(limit, 10) || 20, 1), 100);

  const query = {};
  if (status) query.accountStatus = status;
  if (kycStatus) query.kycStatus = kycStatus;

  if (search) {
    const regex = new RegExp(search, 'i');
    query.$or = [{ fullName: regex }, { email: regex }, { username: regex }, { phoneNumber: regex }];
  }

  const [users, total] = await Promise.all([
    User.find(query)
      .sort({ createdAt: -1 })
      .skip((pageNum - 1) * limitNum)
      .limit(limitNum)
      .populate('account', 'accountNumber customerId balance accountStatus'),
    User.countDocuments(query),
  ]);

  return {
    users,
    pagination: {
      total,
      page: pageNum,
      limit: limitNum,
      totalPages: Math.ceil(total / limitNum) || 1,
    },
  };
};

/**
 * Retrieves full details for a single user, including their account
 * and recent transactions.
 */
const getUserDetails = async (userId) => {
  const user = await User.findById(userId).populate('account');
  if (!user) {
    throw new NotFoundError('User not found');
  }

  let recentTransactions = [];
  if (user.account) {
    recentTransactions = await Transaction.find({
      $or: [{ 'sender.account': user.account._id }, { 'recipient.account': user.account._id }],
    })
      .sort({ createdAt: -1 })
      .limit(10);
  }

  return { user, recentTransactions };
};

/**
 * Updates a user's account status (active, suspended, frozen) and
 * mirrors that status onto their banking Account record. Sends a
 * security alert email and writes an audit log entry.
 */
const updateUserStatus = async (userId, { status, reason }, actor = {}) => {
  const user = await User.findById(userId);
  if (!user) {
    throw new NotFoundError('User not found');
  }

  const previousStatus = user.accountStatus;
  user.accountStatus = status;
  await user.save({ validateBeforeSave: false });

  // Mirror status onto the Account document where relevant
  if (user.account) {
    const accountStatusMap = {
      active: 'active',
      suspended: 'suspended',
      frozen: 'frozen',
    };
    if (accountStatusMap[status]) {
      await Account.findByIdAndUpdate(user.account, { accountStatus: accountStatusMap[status] });
    }
  }

  const actionMap = {
    active: 'ACCOUNT_REACTIVATED',
    suspended: 'ACCOUNT_SUSPENDED',
    frozen: 'ACCOUNT_FROZEN',
  };

  const template = emailTemplates.securityAlertEmail({
    fullName: user.fullName,
    eventDescription: `Your account status has been changed from "${previousStatus}" to "${status}"${
      reason ? ` for the following reason: ${reason}` : '.'
    }`,
    date: new Date().toLocaleString(),
    ip: null,
  });

  await sendEmail({
    to: user.email,
    subject: template.subject,
    html: template.html,
    text: template.text,
    userId: user._id,
    notificationType: 'account_status_change',
  });

  await recordAuditLog({
    actorType: 'admin',
    actorId: actor.actorId,
    actorLabel: actor.actorLabel,
    action: actionMap[status] || 'ACCOUNT_STATUS_CHANGED',
    targetType: 'User',
    targetId: user._id,
    description: `Account status changed from "${previousStatus}" to "${status}"${
      reason ? ` - reason: ${reason}` : ''
    }`,
    metadata: { previousStatus, newStatus: status, reason: reason || null },
    severity: 'critical',
  });

  return user;
};

/**
 * Updates a user's KYC status.
 */
const updateKycStatus = async (userId, { kycStatus, reason }, actor = {}) => {
  const user = await User.findById(userId);
  if (!user) {
    throw new NotFoundError('User not found');
  }

  const previousStatus = user.kycStatus;
  user.kycStatus = kycStatus;
  await user.save({ validateBeforeSave: false });

  await recordAuditLog({
    actorType: 'admin',
    actorId: actor.actorId,
    actorLabel: actor.actorLabel,
    action: 'KYC_STATUS_UPDATED',
    targetType: 'User',
    targetId: user._id,
    description: `KYC status changed from "${previousStatus}" to "${kycStatus}"${
      reason ? ` - reason: ${reason}` : ''
    }`,
    metadata: { previousStatus, newStatus: kycStatus, reason: reason || null },
    severity: 'warning',
  });

  return user;
};

// ============================================================
// TRANSACTION MANAGEMENT
// ============================================================

/**
 * Paginated, filterable list of all transactions for admin review. 
 */
const listTransactions = async ({ status, type, search, startDate, endDate, page = 1, limit = 20 } = {}) => {
  const pageNum = Math.max(parseInt(page, 10) || 1, 1);
  const limitNum = Math.min(Math.max(parseInt(limit, 10) || 20, 1), 100);

  const query = {};
  if (status) query.status = status;
  if (type) query.type = type;

  if (startDate || endDate) {
    query.createdAt = {};
    if (startDate) query.createdAt.$gte = new Date(startDate);
    if (endDate) query.createdAt.$lte = new Date(endDate);
  }

  if (search) {
    const regex = new RegExp(search, 'i');
    query.$or = [
      { reference: regex },
      { narration: regex },
      { 'sender.name': regex },
      { 'recipient.name': regex },
      { 'sender.accountNumber': regex },
      { 'recipient.accountNumber': regex },
    ];
  }

  const [transactions, total] = await Promise.all([
    Transaction.find(query)
      .sort({ createdAt: -1 })
      .skip((pageNum - 1) * limitNum)
      .limit(limitNum),
    Transaction.countDocuments(query),
  ]);

  return {
    transactions,
    pagination: {
      total,
      page: pageNum,
      limit: limitNum,
      totalPages: Math.ceil(total / limitNum) || 1,
    },
  };
};

/**
 * Retrieves a single transaction by ID for admin review, with full
 * state history.
 */
const getTransactionById = async (transactionId) => {
  const transaction = await Transaction.findById(transactionId)
    .populate('originalTransaction')
    .populate('reversalTransaction');

  if (!transaction) {
    throw new NotFoundError('Transaction not found');
  }

  return transaction;
};

/**
 * Lists failed transactions for admin review/reconciliation.
 */
const listFailedTransactions = async ({ page = 1, limit = 20 } = {}) => {
  return listTransactions({ status: 'failed', page, limit });
};

/**
 * Lists reversed transactions for monitoring.
 */
const listReversedTransactions = async ({ page = 1, limit = 20 } = {}) => {
  return listTransactions({ status: 'reversed', page, limit });
};

// ============================================================
// ANALYTICS
// ============================================================

/**
 * Returns high-level analytics for the admin dashboard:
 * total users, active users, total transfers, transaction volume,
 * and daily activity metrics for the last 14 days.
 */
const getAnalyticsOverview = async () => {
  const now = new Date();
  const fourteenDaysAgo = new Date(now);
  fourteenDaysAgo.setDate(now.getDate() - 13);
  fourteenDaysAgo.setHours(0, 0, 0, 0);

  const [
    totalUsers,
    activeUsers,
    suspendedUsers,
    frozenUsers,
    pendingVerificationUsers,
    totalTransactions,
    successfulTransactions,
    failedTransactions,
    reversedTransactions,
    volumeAgg,
    dailyActivity,
  ] = await Promise.all([
    User.countDocuments({}),
    User.countDocuments({ accountStatus: 'active' }),
    User.countDocuments({ accountStatus: 'suspended' }),
    User.countDocuments({ accountStatus: 'frozen' }),
    User.countDocuments({ accountStatus: 'pending_verification' }),
    Transaction.countDocuments({ type: { $in: ['transfer', 'external_transfer'] } }),
    Transaction.countDocuments({ type: { $in: ['transfer', 'external_transfer'] }, status: 'successful' }),
    Transaction.countDocuments({ type: { $in: ['transfer', 'external_transfer'] }, status: 'failed' }),
    Transaction.countDocuments({ status: 'reversed' }),
    Transaction.aggregate([
      { $match: { type: { $in: ['transfer', 'external_transfer', 'admin_credit'] }, status: 'successful' } },
      { $group: { _id: null, totalVolume: { $sum: { $toDouble: '$amount' } } } },
    ]),
    Transaction.aggregate([
      { $match: { type: { $in: ['transfer', 'external_transfer'] }, createdAt: { $gte: fourteenDaysAgo } } },
      {
        $group: {
          _id: {
            year: { $year: '$createdAt' },
            month: { $month: '$createdAt' },
            day: { $dayOfMonth: '$createdAt' },
          },
          count: { $sum: 1 },
          volume: { $sum: { $toDouble: '$amount' } },
          successful: {
            $sum: { $cond: [{ $eq: ['$status', 'successful'] }, 1, 0] },
          },
          failed: {
            $sum: { $cond: [{ $eq: ['$status', 'failed'] }, 1, 0] },
          },
        },
      },
      { $sort: { '_id.year': 1, '_id.month': 1, '_id.day': 1 } },
    ]),
  ]);

  const totalVolume = volumeAgg[0]?.totalVolume || 0;

  const dailyActivityFormatted = dailyActivity.map((d) => ({
    date: `${d._id.year}-${String(d._id.month).padStart(2, '0')}-${String(d._id.day).padStart(2, '0')}`,
    transactionCount: d.count,
    volume: d.volume,
    successful: d.successful,
    failed: d.failed,
  }));

  return {
    users: {
      total: totalUsers,
      active: activeUsers,
      suspended: suspendedUsers,
      frozen: frozenUsers,
      pendingVerification: pendingVerificationUsers,
    },
    transactions: {
      total: totalTransactions,
      successful: successfulTransactions,
      failed: failedTransactions,
      reversed: reversedTransactions,
      totalVolume,
    },
    dailyActivity: dailyActivityFormatted,
  };
};

// ============================================================
// AUDIT LOGS
// ============================================================

/**
 * Paginated, filterable list of audit log entries.
 */
const listAuditLogs = async ({ action, actorType, severity, startDate, endDate, page = 1, limit = 50 } = {}) => {
  const pageNum = Math.max(parseInt(page, 10) || 1, 1);
  const limitNum = Math.min(Math.max(parseInt(limit, 10) || 50, 1), 100);

  const query = {};
  if (action) query.action = new RegExp(action, 'i');
  if (actorType) query.actorType = actorType;
  if (severity) query.severity = severity;

  if (startDate || endDate) {
    query.createdAt = {};
    if (startDate) query.createdAt.$gte = new Date(startDate);
    if (endDate) query.createdAt.$lte = new Date(endDate);
  }

  const [logs, total] = await Promise.all([
    AuditLog.find(query)
      .sort({ createdAt: -1 })
      .skip((pageNum - 1) * limitNum)
      .limit(limitNum),
    AuditLog.countDocuments(query),
  ]);

  return {
    logs,
    pagination: {
      total,
      page: pageNum,
      limit: limitNum,
      totalPages: Math.ceil(total / limitNum) || 1,
    },
  };
};


// ============================================================
// CREDIT ACCOUNT (Admin Only)
// ============================================================

/**
 * Admin-only: Credit a customer's account.
 * Creates an admin_credit transaction record and audit log.
 */
const creditAccount = async ({ accountNumber, amount, narration }, actor = {}) => {
  if (!amount || amount <= 0) {
    throw new BadRequestError('Amount must be greater than zero');
  }

  const account = await Account.findOne({ accountNumber }).populate('user');
  if (!account) {
    throw new NotFoundError('Account not found');
  }

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const reference = generateTransactionReference();
    const newBalance = parseFloat(account.balance.toString()) + amount;

    account.balance = newBalance;
    await account.save({ session });

    const transaction = await Transaction.create(
      [
        {
          reference,
          type: 'admin_credit',
          sender: {
            account: null,
            accountNumber: 'ADMIN',
            name: actor.actorLabel || 'Admin',
          },
          recipient: {
            account: account._id,
            accountNumber: account.accountNumber,
            name: account.user.fullName,
          },
          amount,
          narration: narration || 'Admin credit',
          status: 'successful',
          recipientBalanceAfter: newBalance,
          processedAt: new Date(),
          performedBy: actor.actorId,
          stateHistory: [{ status: 'successful', changedAt: new Date(), note: 'Admin credit applied' }],
        },
      ],
      { session }
    );

    await session.commitTransaction();

    await recordAuditLog({
      actorType: 'admin',
      actorId: actor.actorId,
      actorLabel: actor.actorLabel,
      action: 'ACCOUNT_CREDITED',
      targetType: 'Account',
      targetId: account._id,
      description: `Account ${accountNumber} credited with ${amount} NGN. Narration: ${narration || 'Admin credit'}`,
      metadata: { accountNumber, amount, narration, newBalance },
      severity: 'warning',
    });

    return { transaction: transaction[0], account };
  } catch (err) {
    await session.abortTransaction();
    throw err;
  } finally {
    session.endSession();
  }
};

// ============================================================
// EXTERNAL TRANSFERS (Admin view)
// ============================================================

/**
 * List all external transfers for admin review.
 */
const listExternalTransfers = async ({ page = 1, limit = 20 } = {}) => {
  const pageNum = Math.max(parseInt(page, 10) || 1, 1);
  const limitNum = Math.min(Math.max(parseInt(limit, 10) || 20, 1), 100);

  const [transactions, total] = await Promise.all([
    Transaction.find({ type: 'external_transfer' })
      .sort({ createdAt: -1 })
      .skip((pageNum - 1) * limitNum)
      .limit(limitNum),
    Transaction.countDocuments({ type: 'external_transfer' }),
  ]);

  return {
    transactions,
    pagination: {
      total,
      page: pageNum,
      limit: limitNum,
      totalPages: Math.ceil(total / limitNum) || 1,
    },
  };
};

/**
 * Reverse an external transfer — restores user balance.
 */
const reverseExternalTransfer = async (transactionId, reason, actor = {}) => {
  const original = await Transaction.findById(transactionId);
  if (!original) throw new NotFoundError('Transaction not found');
  if (original.type !== 'external_transfer') throw new BadRequestError('Transaction is not an external transfer');
  if (original.status === 'reversed') throw new BadRequestError('Transaction has already been reversed');
  if (original.status !== 'successful') throw new BadRequestError('Only successful transactions can be reversed');

  const account = await Account.findById(original.sender.account);
  if (!account) throw new NotFoundError('Sender account not found');

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const refundAmount = parseFloat(original.amount.toString());
    const newBalance = parseFloat(account.balance.toString()) + refundAmount;
    account.balance = newBalance;
    await account.save({ session });

    original.status = 'reversed';
    original.reversalReason = reason;
    await original.save({ session });

    const reference = generateTransactionReference();
    const reversal = await Transaction.create(
      [
        {
          reference,
          type: 'reversal',
          sender: { account: null, accountNumber: 'ADMIN', name: actor.actorLabel || 'Admin' },
          recipient: {
            account: account._id,
            accountNumber: account.accountNumber,
            name: original.sender.name,
          },
          amount: refundAmount,
          narration: `Reversal of external transfer ${original.reference}: ${reason}`,
          status: 'successful',
          originalTransaction: original._id,
          recipientBalanceAfter: newBalance,
          processedAt: new Date(),
          stateHistory: [{ status: 'successful', changedAt: new Date(), note: 'External transfer reversal' }],
        },
      ],
      { session }
    );

    original.reversalTransaction = reversal[0]._id;
    await original.save({ session });

    await session.commitTransaction();

    await recordAuditLog({
      actorType: 'admin',
      actorId: actor.actorId,
      actorLabel: actor.actorLabel,
      action: 'EXTERNAL_TRANSFER_REVERSED',
      targetType: 'Transaction',
      targetId: original._id,
      description: `External transfer ${original.reference} reversed. Reason: ${reason}`,
      severity: 'critical',
    });

    return { original, reversal: reversal[0] };
  } catch (err) {
    await session.abortTransaction();
    throw err;
  } finally {
    session.endSession();
  }
};

// ============================================================
// ADMIN MANAGEMENT (Superadmin)
// ============================================================

/**
 * List all admin accounts (superadmin only).
 */
const listAdmins = async ({ page = 1, limit = 20 } = {}) => {
  const pageNum = Math.max(parseInt(page, 10) || 1, 1);
  const limitNum = Math.min(Math.max(parseInt(limit, 10) || 20, 1), 100);

  const [admins, total] = await Promise.all([
    Admin.find({}).sort({ createdAt: -1 }).skip((pageNum - 1) * limitNum).limit(limitNum),
    Admin.countDocuments({}),
  ]);

  return {
    admins,
    pagination: { total, page: pageNum, limit: limitNum, totalPages: Math.ceil(total / limitNum) || 1 },
  };
};

/**
 * Deactivate/reactivate an admin.
 */
const updateAdminStatus = async (adminId, { isActive }, actor = {}) => {
  const admin = await Admin.findById(adminId);
  if (!admin) throw new NotFoundError('Admin not found');

  admin.isActive = isActive;
  await admin.save({ validateBeforeSave: false });

  await recordAuditLog({
    actorType: 'admin',
    actorId: actor.actorId,
    actorLabel: actor.actorLabel,
    action: isActive ? 'ADMIN_REACTIVATED' : 'ADMIN_DEACTIVATED',
    targetType: 'Admin',
    targetId: admin._id,
    description: `Admin ${admin.email} ${isActive ? 'reactivated' : 'deactivated'}`,
    severity: 'critical',
  });

  return admin;
};


module.exports = {
  listUsers,
  getUserDetails,
  updateUserStatus,
  updateKycStatus,
  listTransactions,
  getTransactionById,
  listFailedTransactions,
  listReversedTransactions,
  getAnalyticsOverview,
  listAuditLogs,
  creditAccount,
  listExternalTransfers,
  reverseExternalTransfer,
  listAdmins,
  updateAdminStatus,
};
