const nodemailer = require('nodemailer');

// ============================================
// EMAIL — Nodemailer
// ============================================

const createTransporter = () => nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'smtp.gmail.com',
  port: parseInt(process.env.SMTP_PORT) || 587,
  secure: false,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

const emailTemplates = {
  billingConfirmation: ({ businessName, billName, amount, mpesaRef, date }) => ({
    subject: `✅ Payment confirmed — ${billName}`,
    html: `
      <div style="font-family: Inter, sans-serif; max-width: 520px; margin: 0 auto; padding: 32px 24px; background: #fff;">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:24px;">
          <div style="width:28px;height:28px;background:#0d0d0d;color:#00e5a0;border-radius:6px;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:14px;">L</div>
          <span style="font-size:18px;font-weight:700;">LEDGR</span>
        </div>
        <h2 style="color:#1a1a1a;margin:0 0 8px;">Payment Confirmed</h2>
        <p style="color:#666;margin:0 0 24px;">Your automated payment has been processed successfully.</p>
        <div style="background:#f5f4f1;border-radius:10px;padding:20px;margin-bottom:24px;">
          <div style="display:flex;justify-content:space-between;margin-bottom:8px;">
            <span style="color:#888;font-size:13px;">Bill</span>
            <span style="font-weight:600;">${billName}</span>
          </div>
          <div style="display:flex;justify-content:space-between;margin-bottom:8px;">
            <span style="color:#888;font-size:13px;">Amount</span>
            <span style="font-weight:600;color:#00b87f;">KES ${Number(amount).toLocaleString()}</span>
          </div>
          <div style="display:flex;justify-content:space-between;margin-bottom:8px;">
            <span style="color:#888;font-size:13px;">M-Pesa Ref</span>
            <span style="font-weight:600;">${mpesaRef || '—'}</span>
          </div>
          <div style="display:flex;justify-content:space-between;">
            <span style="color:#888;font-size:13px;">Date</span>
            <span style="font-weight:600;">${new Date(date).toLocaleDateString('en-KE')}</span>
          </div>
        </div>
        <p style="color:#999;font-size:12px;">This is an automated notification from LEDGR for ${businessName}.</p>
      </div>`,
  }),

  payrollNotification: ({ employeeName, month, year, netSalary, mpesaRef }) => ({
    subject: `💰 Salary credited — ${month} ${year}`,
    html: `
      <div style="font-family: Inter, sans-serif; max-width: 520px; margin: 0 auto; padding: 32px 24px; background: #fff;">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:24px;">
          <div style="width:28px;height:28px;background:#0d0d0d;color:#00e5a0;border-radius:6px;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:14px;">L</div>
          <span style="font-size:18px;font-weight:700;">LEDGR</span>
        </div>
        <h2 style="color:#1a1a1a;margin:0 0 8px;">Salary Credited</h2>
        <p style="color:#666;margin:0 0 24px;">Hi ${employeeName}, your salary for ${month} ${year} has been processed.</p>
        <div style="background:#f5f4f1;border-radius:10px;padding:20px;margin-bottom:24px;">
          <div style="font-size:28px;font-weight:700;color:#00b87f;text-align:center;margin-bottom:4px;">KES ${Number(netSalary).toLocaleString()}</div>
          <div style="text-align:center;color:#888;font-size:13px;">Net salary via M-Pesa</div>
          ${mpesaRef ? `<div style="text-align:center;color:#555;font-size:12px;margin-top:8px;">Ref: ${mpesaRef}</div>` : ''}
        </div>
      </div>`,
  }),

  billingReminder: ({ businessName, billName, amount, dueDate }) => ({
    subject: `⏰ Bill due soon — ${billName}`,
    html: `
      <div style="font-family: Inter, sans-serif; max-width: 520px; margin: 0 auto; padding: 32px 24px;">
        <h2>${billName} is due on ${new Date(dueDate).toLocaleDateString('en-KE')}</h2>
        <p>Amount: <strong>KES ${Number(amount).toLocaleString()}</strong></p>
        <p>LEDGR will process this automatically. No action needed unless you want to cancel.</p>
        <p style="color:#999;font-size:12px;">Sent by LEDGR for ${businessName}</p>
      </div>`,
  }),
};

const sendEmail = async ({ to, subject, html }) => {
  if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
    console.log('[EMAIL] SMTP not configured — email skipped:', { to, subject });
    return { skipped: true };
  }
  const transporter = createTransporter();
  return transporter.sendMail({
    from: process.env.SMTP_FROM || `"LEDGR" <${process.env.SMTP_USER}>`,
    to, subject, html,
  });
};

// ============================================
// SMS — Africa's Talking
// ============================================

const sendSMS = async ({ to, message }) => {
  if (!process.env.AT_API_KEY || process.env.AT_API_KEY === '') {
    console.log('[SMS] Africa\'s Talking not configured — SMS skipped:', { to, message: message.substring(0, 40) });
    return { skipped: true };
  }

  const africastalking = require('africastalking')({
    apiKey: process.env.AT_API_KEY,
    username: process.env.AT_USERNAME || 'sandbox'
  });

  try {
    const formattedPhone = to.startsWith('+') ? to : `+254${to.replace(/^0/, '')}`;
    
    const result = await africastalking.SMS.send({
      to: [formattedPhone],
      message,
      from: process.env.AT_SENDER_ID || 'LEDGR',
    });
    
    return result;
  } catch (error) {
    console.error('[SMS] Africa\'s Talking Error:', error);
    throw error;
  }
};

// ============================================
// HIGH-LEVEL NOTIFICATION HELPERS
// ============================================

const notifyBillingConfirmed = async ({ email, phone, businessName, billName, amount, mpesaRef }) => {
  const template = emailTemplates.billingConfirmation({ businessName, billName, amount, mpesaRef, date: new Date() });
  await Promise.allSettled([
    email ? sendEmail({ to: email, ...template }) : Promise.resolve(),
    phone ? sendSMS({ to: phone, message: `LEDGR: ${billName} payment of KES ${amount} confirmed. Ref: ${mpesaRef || 'N/A'}` }) : Promise.resolve(),
  ]);
};

const notifyPayroll = async ({ email, phone, employeeName, month, year, netSalary, mpesaRef }) => {
  const template = emailTemplates.payrollNotification({ employeeName, month, year, netSalary, mpesaRef });
  await Promise.allSettled([
    email ? sendEmail({ to: email, ...template }) : Promise.resolve(),
    phone ? sendSMS({ to: phone, message: `LEDGR: Your ${month} ${year} salary of KES ${Number(netSalary).toLocaleString()} has been sent. Ref: ${mpesaRef || 'N/A'}` }) : Promise.resolve(),
  ]);
};

const notifyBillingReminder = async ({ email, businessName, billName, amount, dueDate }) => {
  const template = emailTemplates.billingReminder({ businessName, billName, amount, dueDate });
  if (email) await sendEmail({ to: email, ...template });
};

module.exports = {
  sendEmail, sendSMS,
  notifyBillingConfirmed, notifyPayroll, notifyBillingReminder,
  emailTemplates,
};
