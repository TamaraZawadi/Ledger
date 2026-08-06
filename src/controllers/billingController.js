const { query } = require('../../config/database');
const { v4: uuidv4 } = require('uuid');

// ============================================
// M-PESA DARAJA HELPERS
// ============================================

const getAccessToken = async () => {
  const auth = Buffer.from(
    `${process.env.MPESA_CONSUMER_KEY}:${process.env.MPESA_CONSUMER_SECRET}`
  ).toString('base64');

  const url = process.env.MPESA_ENVIRONMENT === 'production'
    ? 'https://api.safaricom.co.ke/oauth/v1/generate?grant_type=client_credentials'
    : 'https://sandbox.safaricom.co.ke/oauth/v1/generate?grant_type=client_credentials';

  const res = await fetch(url, {
    method: 'GET',
    headers: { Authorization: `Basic ${auth}` },
  });
  const data = await res.json();
  return data.access_token;
};

const stkPush = async ({ phone, amount, accountRef, description }) => {
  const token = await getAccessToken();
  const timestamp = new Date().toISOString().replace(/[-T:.Z]/g, '').slice(0, 14);
  const shortcode = process.env.MPESA_BUSINESS_SHORTCODE;
  const password = Buffer.from(`${shortcode}${process.env.MPESA_PASSKEY}${timestamp}`).toString('base64');

  const url = process.env.MPESA_ENVIRONMENT === 'production'
    ? 'https://api.safaricom.co.ke/mpesa/stkpush/v1/processrequest'
    : 'https://sandbox.safaricom.co.ke/mpesa/stkpush/v1/processrequest';

  const res = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      BusinessShortCode: shortcode,
      Password: password,
      Timestamp: timestamp,
      TransactionType: 'CustomerPayBillOnline',
      Amount: Math.round(amount),
      PartyA: phone.replace(/^0/, '254'),
      PartyB: shortcode,
      PhoneNumber: phone.replace(/^0/, '254'),
      CallBackURL: `${process.env.MPESA_CALLBACK_URL}/billing/callback`,
      AccountReference: accountRef,
      TransactionDesc: description,
    }),
  });
  return res.json();
};

// ============================================
// BILLING CONTROLLERS
// ============================================

const listBilling = async (req, res) => {
  const [schedules, recent] = await Promise.all([
    query(
      'SELECT * FROM billing_schedules WHERE business_id = $1 ORDER BY billing_day',
      [req.user.business_id]
    ),
    query(
      `SELECT bt.*, bs.name AS schedule_name
       FROM billing_transactions bt
       LEFT JOIN billing_schedules bs ON bs.id = bt.schedule_id
       WHERE bt.business_id = $1
       ORDER BY bt.initiated_at DESC LIMIT 20`,
      [req.user.business_id]
    ),
  ]);

  res.render('pages/billing/index', {
    title: 'Billing — LEDGR',
    schedules: schedules.rows,
    transactions: recent.rows,
  });
};

const showNewSchedule = (req, res) => {
  res.render('pages/billing/form', { title: 'Add Billing Schedule — LEDGR', schedule: null, error: null });
};

const createSchedule = async (req, res) => {
  const { name, category, amount, billingDay, paymentMethod, payeeNumber, accountRef } = req.body;
  const nextDue = new Date();
  nextDue.setDate(parseInt(billingDay));
  if (nextDue < new Date()) nextDue.setMonth(nextDue.getMonth() + 1);

  await query(
    `INSERT INTO billing_schedules (id, business_id, name, category, amount, billing_day, payment_method, payee_number, account_ref, next_due_date)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
    [uuidv4(), req.user.business_id, name, category, parseFloat(amount),
     parseInt(billingDay), paymentMethod || 'mpesa', payeeNumber || null,
     accountRef || null, nextDue.toISOString().split('T')[0]]
  );
  res.redirect('/billing?success=1');
};

const triggerPayment = async (req, res) => {
  const { id } = req.params;
  const schedule = await query(
    'SELECT * FROM billing_schedules WHERE id = $1 AND business_id = $2',
    [id, req.user.business_id]
  );
  if (!schedule.rows.length) return res.redirect('/billing');

  const s = schedule.rows[0];
  const txId = uuidv4();

  await query(
    `INSERT INTO billing_transactions (id, business_id, schedule_id, amount, status)
     VALUES ($1,$2,$3,$4,'processing')`,
    [txId, req.user.business_id, id, s.amount]
  );

  try {
    const result = await stkPush({
      phone: s.payee_number,
      amount: s.amount,
      accountRef: s.account_ref || s.name,
      description: `LEDGR: ${s.name}`,
    });

    await query(
      `UPDATE billing_transactions SET mpesa_checkout_id = $1, status = $2 WHERE id = $3`,
      [result.CheckoutRequestID || null,
       result.ResponseCode === '0' ? 'processing' : 'failed',
       txId]
    );

    if (result.ResponseCode === '0') {
      // Update next due date
      const next = new Date();
      next.setMonth(next.getMonth() + 1);
      next.setDate(s.billing_day);
      await query(
        'UPDATE billing_schedules SET last_paid_at = NOW(), next_due_date = $1 WHERE id = $2',
        [next.toISOString().split('T')[0], id]
      );
    }
  } catch (err) {
    await query(
      `UPDATE billing_transactions SET status = 'failed', error_message = $1 WHERE id = $2`,
      [err.message, txId]
    );
  }

  res.redirect('/billing?triggered=1');
};

// POST /billing/callback (M-Pesa callback)
const mpesaCallback = async (req, res) => {
  const { Body } = req.body;
  if (!Body?.stkCallback) return res.json({ ResultCode: 0, ResultDesc: 'OK' });

  const cb = Body.stkCallback;
  const checkoutId = cb.CheckoutRequestID;
  const success = cb.ResultCode === 0;

  const mpesaRef = success
    ? cb.CallbackMetadata?.Item?.find(i => i.Name === 'MpesaReceiptNumber')?.Value
    : null;

  await query(
    `UPDATE billing_transactions
     SET status = $1, mpesa_ref = $2, completed_at = NOW(), error_message = $3
     WHERE mpesa_checkout_id = $4`,
    [success ? 'completed' : 'failed', mpesaRef, success ? null : cb.ResultDesc, checkoutId]
  );

  res.json({ ResultCode: 0, ResultDesc: 'Accepted' });
};

const deleteSchedule = async (req, res) => {
  await query('DELETE FROM billing_schedules WHERE id = $1 AND business_id = $2', [req.params.id, req.user.business_id]);
  res.redirect('/billing?deleted=1');
};

module.exports = { listBilling, showNewSchedule, createSchedule, triggerPayment, mpesaCallback, deleteSchedule };
