/**
 * Email templates for Spring Financial Bank (SFB).
 * Each function returns { subject, html, text }.
 * Keep templates simple, accessible, and consistent with the SFB brand.
 */

const BRAND_COLOR = '#0B2545';
const ACCENT_COLOR = '#1768AC';

const wrapper = (innerHtml, title) => `
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${title}</title>
  </head>
  <body style="margin:0; padding:0; background-color:#f4f6f8; font-family: Arial, Helvetica, sans-serif; color:#1a1f36;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding: 24px 0;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" style="max-width:560px; background:#ffffff; border-radius:8px; overflow:hidden; border:1px solid #e3e8ee;">
            <tr>
              <td style="background-color:${BRAND_COLOR}; padding: 20px 32px;">
                <span style="color:#ffffff; font-size:18px; font-weight:bold; letter-spacing:0.5px;">Spring Financial Bank</span>
              </td>
            </tr>
            <tr>
              <td style="padding: 32px;">
                ${innerHtml}
              </td>
            </tr>
            <tr>
              <td style="padding: 20px 32px; border-top:1px solid #e3e8ee; font-size:12px; color:#8a94a6;">
                This is an automated message from Spring Financial Bank (SFB). Please do not reply to this email.
                If you did not expect this message, contact support immediately.
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>
`;

const otpEmail = ({ fullName, code, expiresMinutes }) => {
  const subject = 'Verify your Spring Financial Bank account';
  const html = wrapper(
    `
    <h2 style="margin-top:0; color:${BRAND_COLOR};">Verify your email address</h2>
    <p>Hi ${fullName},</p>
    <p>Use the verification code below to confirm your email address and activate your Spring Financial Bank account.</p>
    <div style="text-align:center; margin: 24px 0;">
      <span style="display:inline-block; font-size:28px; font-weight:bold; letter-spacing:6px; background:#f0f4f8; padding:12px 24px; border-radius:6px; color:${BRAND_COLOR};">${code}</span>
    </div>
    <p>This code expires in <strong>${expiresMinutes} minutes</strong>. If you didn't request this, you can safely ignore this email.</p>
    `,
    subject
  );
  const text = `Your Spring Financial Bank verification code is ${code}. It expires in ${expiresMinutes} minutes.`;
  return { subject, html, text };
};

const welcomeEmail = ({ fullName, accountNumber, customerId }) => {
  const subject = 'Welcome to Spring Financial Bank';
  const html = wrapper(
    `
    <h2 style="margin-top:0; color:${BRAND_COLOR};">Welcome to SFB, ${fullName}!</h2>
    <p>Your account has been successfully verified and activated.</p>
    <table style="width:100%; margin: 16px 0; font-size:14px;">
      <tr><td style="padding:6px 0; color:#8a94a6;">Account Number</td><td style="padding:6px 0; text-align:right; font-weight:bold;">${accountNumber}</td></tr>
      <tr><td style="padding:6px 0; color:#8a94a6;">Customer ID</td><td style="padding:6px 0; text-align:right; font-weight:bold;">${customerId}</td></tr>
    </table>
    <p>You can now log in to your dashboard to manage your account, view transactions, and transfer funds securely.</p>
    `,
    subject
  );
  const text = `Welcome to SFB, ${fullName}! Your account number is ${accountNumber} and your customer ID is ${customerId}.`;
  return { subject, html, text };
};

const passwordResetEmail = ({ fullName, resetUrl, expiresMinutes }) => {
  const subject = 'Reset your Spring Financial Bank password';
  const html = wrapper(
    `
    <h2 style="margin-top:0; color:${BRAND_COLOR};">Password reset request</h2>
    <p>Hi ${fullName},</p>
    <p>We received a request to reset your password. Click the button below to set a new password. This link expires in <strong>${expiresMinutes} minutes</strong>.</p>
    <div style="text-align:center; margin: 24px 0;">
      <a href="${resetUrl}" style="display:inline-block; background:${ACCENT_COLOR}; color:#ffffff; text-decoration:none; padding:12px 28px; border-radius:6px; font-weight:bold;">Reset Password</a>
    </div>
    <p>If you did not request a password reset, please ignore this email or contact support if you have concerns about your account security.</p>
    `,
    subject
  );
  const text = `Reset your SFB password using this link (expires in ${expiresMinutes} minutes): ${resetUrl}`;
  return { subject, html, text };
};

const debitAlertEmail = ({ fullName, amount, currency, recipientName, reference, date, balance }) => {
  const subject = `Debit Alert: ${currency} ${amount.toLocaleString()} from your account`;
  const html = wrapper(
    `
    <h2 style="margin-top:0; color:${BRAND_COLOR};">Debit Alert</h2>
    <p>Hi ${fullName},</p>
    <p>Your account has been debited as follows:</p>
    <table style="width:100%; margin: 16px 0; font-size:14px;">
      <tr><td style="padding:6px 0; color:#8a94a6;">Amount Debited</td><td style="padding:6px 0; text-align:right; font-weight:bold;">${currency} ${amount.toLocaleString()}</td></tr>
      <tr><td style="padding:6px 0; color:#8a94a6;">Recipient</td><td style="padding:6px 0; text-align:right;">${recipientName}</td></tr>
      <tr><td style="padding:6px 0; color:#8a94a6;">Reference</td><td style="padding:6px 0; text-align:right;">${reference}</td></tr>
      <tr><td style="padding:6px 0; color:#8a94a6;">Date &amp; Time</td><td style="padding:6px 0; text-align:right;">${date}</td></tr>
      <tr><td style="padding:6px 0; color:#8a94a6;">Available Balance</td><td style="padding:6px 0; text-align:right; font-weight:bold;">${currency} ${balance.toLocaleString()}</td></tr>
    </table>
    <p>If you did not authorize this transaction, please contact support immediately.</p>
    `,
    subject
  );
  const text = `Debit Alert: ${currency} ${amount} sent to ${recipientName}. Ref: ${reference}. New balance: ${currency} ${balance}.`;
  return { subject, html, text };
};

const creditAlertEmail = ({ fullName, amount, currency, senderName, reference, date, balance }) => {
  const subject = `Credit Alert: ${currency} ${amount.toLocaleString()} received`;
  const html = wrapper(
    `
    <h2 style="margin-top:0; color:${BRAND_COLOR};">Credit Alert</h2>
    <p>Hi ${fullName},</p>
    <p>Your account has been credited as follows:</p>
    <table style="width:100%; margin: 16px 0; font-size:14px;">
      <tr><td style="padding:6px 0; color:#8a94a6;">Amount Received</td><td style="padding:6px 0; text-align:right; font-weight:bold;">${currency} ${amount.toLocaleString()}</td></tr>
      <tr><td style="padding:6px 0; color:#8a94a6;">From</td><td style="padding:6px 0; text-align:right;">${senderName}</td></tr>
      <tr><td style="padding:6px 0; color:#8a94a6;">Reference</td><td style="padding:6px 0; text-align:right;">${reference}</td></tr>
      <tr><td style="padding:6px 0; color:#8a94a6;">Date &amp; Time</td><td style="padding:6px 0; text-align:right;">${date}</td></tr>
      <tr><td style="padding:6px 0; color:#8a94a6;">Available Balance</td><td style="padding:6px 0; text-align:right; font-weight:bold;">${currency} ${balance.toLocaleString()}</td></tr>
    </table>
    `,
    subject
  );
  const text = `Credit Alert: ${currency} ${amount} received from ${senderName}. Ref: ${reference}. New balance: ${currency} ${balance}.`;
  return { subject, html, text };
};

const reversalAlertEmail = ({ fullName, amount, currency, originalReference, reason, date }) => {
  const subject = `Transaction Reversal: ${currency} ${amount.toLocaleString()}`;
  const html = wrapper(
    `
    <h2 style="margin-top:0; color:${BRAND_COLOR};">Transaction Reversed</h2>
    <p>Hi ${fullName},</p>
    <p>A transaction on your account has been reversed. Details below:</p>
    <table style="width:100%; margin: 16px 0; font-size:14px;">
      <tr><td style="padding:6px 0; color:#8a94a6;">Reversal Amount</td><td style="padding:6px 0; text-align:right; font-weight:bold;">${currency} ${amount.toLocaleString()}</td></tr>
      <tr><td style="padding:6px 0; color:#8a94a6;">Original Reference</td><td style="padding:6px 0; text-align:right;">${originalReference}</td></tr>
      <tr><td style="padding:6px 0; color:#8a94a6;">Reason</td><td style="padding:6px 0; text-align:right;">${reason}</td></tr>
      <tr><td style="padding:6px 0; color:#8a94a6;">Date &amp; Time</td><td style="padding:6px 0; text-align:right;">${date}</td></tr>
    </table>
    <p>The reversed amount has been credited back to your account.</p>
    `,
    subject
  );
  const text = `Transaction reversed: ${currency} ${amount}. Original ref: ${originalReference}. Reason: ${reason}.`;
  return { subject, html, text };
};

const securityAlertEmail = ({ fullName, eventDescription, date, ip }) => {
  const subject = 'Security Alert: New activity on your account';
  const html = wrapper(
    `
    <h2 style="margin-top:0; color:${BRAND_COLOR};">Security Alert</h2>
    <p>Hi ${fullName},</p>
    <p>${eventDescription}</p>
    <table style="width:100%; margin: 16px 0; font-size:14px;">
      <tr><td style="padding:6px 0; color:#8a94a6;">Date &amp; Time</td><td style="padding:6px 0; text-align:right;">${date}</td></tr>
      <tr><td style="padding:6px 0; color:#8a94a6;">IP Address</td><td style="padding:6px 0; text-align:right;">${ip || 'Unknown'}</td></tr>
    </table>
    <p>If this wasn't you, please reset your password immediately and contact support.</p>
    `,
    subject
  );
  const text = `Security Alert: ${eventDescription} at ${date} from IP ${ip || 'Unknown'}.`;
  return { subject, html, text };
};

module.exports = {
  otpEmail,
  welcomeEmail,
  passwordResetEmail,
  debitAlertEmail,
  creditAlertEmail,
  reversalAlertEmail,
  securityAlertEmail,
};
