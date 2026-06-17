const PDFDocument = require('pdfkit');

const BRAND_COLOR = '#0B2545';
const ACCENT_COLOR = '#1768AC';
const MUTED_COLOR = '#8A94A6';

/**
 * Generates a branded PDF transaction receipt for Spring Financial Bank
 * and streams it directly to the provided response object.
 *
 * @param {Object} transaction - a Transaction document (or plain object)
 * @param {import('express').Response} res
 */
const streamTransactionReceipt = (transaction, res) => {
  const doc = new PDFDocument({ size: 'A4', margin: 50 });

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="SFB-Receipt-${transaction.reference}.pdf"`);

  doc.pipe(res);

  // --- Header ---
  doc.rect(0, 0, doc.page.width, 90).fill(BRAND_COLOR);
  doc
    .fillColor('#ffffff')
    .fontSize(22)
    .font('Helvetica-Bold')
    .text('Spring Financial Bank', 50, 30);
  doc
    .fontSize(10)
    .font('Helvetica')
    .text('Official Transaction Receipt', 50, 58);

  doc.fillColor('#000000');
  doc.moveDown(4);
  doc.y = 120;

  // --- Status badge ---
  const statusColors = {
    successful: '#1a7f37',
    pending: '#b08900',
    processing: '#1768AC',
    failed: '#cf222e',
    reversed: '#8250df',
  };
  const statusColor = statusColors[transaction.status] || MUTED_COLOR;

  doc
    .fontSize(14)
    .font('Helvetica-Bold')
    .fillColor(statusColor)
    .text(transaction.status.toUpperCase(), 50, 120, { align: 'right', width: doc.page.width - 100 });

  doc.fillColor('#000000');

  // --- Title ---
  doc
    .fontSize(16)
    .font('Helvetica-Bold')
    .text('Transaction Receipt', 50, 110);

  doc.moveDown(2);

  // --- Reference & date ---
  doc
    .fontSize(10)
    .font('Helvetica')
    .fillColor(MUTED_COLOR)
    .text(`Reference: ${transaction.reference}`, 50, 150)
    .text(
      `Date: ${
        transaction.processedAt
          ? new Date(transaction.processedAt).toLocaleString()
          : new Date(transaction.createdAt).toLocaleString()
      }`,
      50,
      165
    );

  doc.fillColor('#000000');
  doc.moveDown(3);

  // --- Amount block ---
  const amount = parseFloat(transaction.amount.toString());
  doc.y = 200;
  doc
    .fontSize(28)
    .font('Helvetica-Bold')
    .fillColor(BRAND_COLOR)
    .text(`${transaction.currency} ${amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}`, 50, 200, {
      align: 'center',
    });

  doc.fillColor('#000000');
  doc.moveDown(2);

  // --- Details table ---
  const startY = 270;
  const rows = [
    ['Sender Name', transaction.sender.name],
    ['Sender Account Number', transaction.sender.accountNumber],
    ['Recipient Name', transaction.recipient.name],
    ['Recipient Account Number', transaction.recipient.accountNumber],
    ['Transaction Type', transaction.type],
    ['Narration', transaction.narration || '—'],
    ['Status', transaction.status],
  ];

  if (transaction.reversalReason) {
    rows.push(['Reversal Reason', transaction.reversalReason]);
  }

  let y = startY;
  const lineHeight = 28;

  doc.fontSize(11);
  rows.forEach((row, idx) => {
    const rowY = y + idx * lineHeight;

    if (idx % 2 === 0) {
      doc.rect(50, rowY - 6, doc.page.width - 100, lineHeight).fill('#f6f8fa');
      doc.fillColor('#000000');
    }

    doc
      .font('Helvetica-Bold')
      .fillColor(MUTED_COLOR)
      .text(row[0], 60, rowY, { width: 220 });

    doc
      .font('Helvetica')
      .fillColor('#000000')
      .text(String(row[1]), 290, rowY, { width: 250, align: 'right' });
  });

  // --- Footer ---
  const footerY = y + rows.length * lineHeight + 40;
  doc
    .moveTo(50, footerY)
    .lineTo(doc.page.width - 50, footerY)
    .strokeColor('#e3e8ee')
    .stroke();

  doc
    .fontSize(9)
    .fillColor(MUTED_COLOR)
    .font('Helvetica')
    .text(
      'This receipt is computer-generated and serves as proof of transaction processed through Spring Financial Bank (SFB). ' +
        'For inquiries, please contact our support team with the reference number above.',
      50,
      footerY + 15,
      { width: doc.page.width - 100, align: 'center' }
    );

  doc
    .fontSize(9)
    .fillColor(ACCENT_COLOR)
    .text('Spring Financial Bank — Secure. Trusted. Digital Banking.', 50, footerY + 50, {
      width: doc.page.width - 100,
      align: 'center',
    });

  doc.end();
};

module.exports = {
  streamTransactionReceipt,
};
