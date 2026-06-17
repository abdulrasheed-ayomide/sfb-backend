const Account = require('../models/Account');

/**
 * Generates a random 10-digit account number string.
 */
const randomAccountNumber = () => {
  let num = '';
  for (let i = 0; i < 10; i++) {
    num += Math.floor(Math.random() * 10).toString();
  }
  // Ensure it doesn't start with 0 for a more realistic look
  if (num.startsWith('0')) {
    num = '1' + num.slice(1);
  }
  return num;
};

/**
 * Generates a unique 10-digit account number, retrying on collision.
 * Should be called within the same transaction/session that creates
 * the Account document to minimize race conditions, though the unique
 * index on `accountNumber` is the ultimate safeguard.
 */
const generateUniqueAccountNumber = async (session = null) => {
  let accountNumber;
  let exists = true;
  let attempts = 0;

  while (exists) {
    accountNumber = randomAccountNumber();
    const query = Account.findOne({ accountNumber });
    if (session) query.session(session);
    const existing = await query.exec();
    exists = !!existing;

    attempts += 1;
    if (attempts > 10) {
      throw new Error('Unable to generate a unique account number after multiple attempts');
    }
  }

  return accountNumber;
};

/**
 * Generates a unique customer ID in the format SFB-XXXXXXXX (8 digits).
 */
const generateUniqueCustomerId = async (session = null) => {
  let customerId;
  let exists = true;
  let attempts = 0;

  while (exists) {
    const digits = Math.floor(10000000 + Math.random() * 89999999).toString();
    customerId = `SFB-${digits}`;
    const query = Account.findOne({ customerId });
    if (session) query.session(session);
    const existing = await query.exec();
    exists = !!existing;

    attempts += 1;
    if (attempts > 10) {
      throw new Error('Unable to generate a unique customer ID after multiple attempts');
    }
  }

  return customerId;
};

/**
 * Generates a unique transaction reference, e.g. SFB-TX-1718380923123-AB12CD
 */
const generateTransactionReference = () => {
  const timestamp = Date.now();
  const randomPart = Math.random().toString(36).substring(2, 8).toUpperCase();
  return `SFB-TX-${timestamp}-${randomPart}`;
};

module.exports = {
  generateUniqueAccountNumber,
  generateUniqueCustomerId,
  generateTransactionReference,
};
