const Account = require('../models/Account');
const Transaction = require('../models/Transaction');
const { NotFoundError } = require('../utils/errors');

/**
 * Returns the dashboard overview for a user: account details, balance,
 * and the 5 most recent transactions.
 */
const getDashboardOverview = async (userId) => {
  const account = await Account.findOne({ user: userId });
  if (!account) {
    throw new NotFoundError('Account not found');
  }

  const recentTransactions = await Transaction.find({
    $or: [{ 'sender.account': account._id }, { 'recipient.account': account._id }],
  })
    .sort({ createdAt: -1 })
    .limit(5);

  const annotated = recentTransactions.map((tx) => {
    const obj = tx.toObject();

    const senderId = tx.sender?.account?.toString();
    const accountId = account._id.toString();

    obj.direction =
      senderId === accountId
        ? 'outgoing'
        : 'incoming';

    return obj;
  });

  return {
    account: account.toJSON(),
    recentTransactions: annotated,
  };
};

/**
 * Returns full account details for the authenticated user.
 */
const getAccountDetails = async (userId) => {
  const account = await Account.findOne({ user: userId });
  if (!account) {
    throw new NotFoundError('Account not found');
  }
  return account;
};

module.exports = {
  getDashboardOverview,
  getAccountDetails,
};
