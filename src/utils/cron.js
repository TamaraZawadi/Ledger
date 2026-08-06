// LEDGR Cron Jobs — Part 4
// Run separately: node src/utils/cron.js
// Or integrate with a process manager (PM2)

const { query } = require('../../config/database');
const { notifyBillingReminder } = require('./notifications');

// Simple interval-based scheduler (use node-cron in production)
const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;

// Check and trigger due bills — runs every hour
async function processDueBills() {
  const today = new Date().toISOString().split('T')[0];
  console.log(`[CRON] Checking due bills for ${today}`);

  try {
    const due = await query(
      `SELECT bs.*, b.email AS business_email, b.name AS business_name
       FROM billing_schedules bs
       JOIN businesses b ON b.id = bs.business_id
       WHERE bs.is_active = true AND bs.next_due_date <= $1`,
      [today]
    );

    for (const bill of due.rows) {
      console.log(`[CRON] Triggering payment: ${bill.name} — KES ${bill.amount}`);
      // Import billingController dynamically to avoid circular deps
      // In production: use a queue (BullMQ, etc.)
      await query(
        `INSERT INTO billing_transactions (id, business_id, schedule_id, amount, status)
         VALUES (gen_random_uuid(), $1, $2, $3, 'pending')
         ON CONFLICT DO NOTHING`,
        [bill.business_id, bill.id, bill.amount]
      );
    }
  } catch (err) {
    console.error('[CRON] Due bills error:', err.message);
  }
}

// Send reminders for bills due in 3 days — runs once daily at 8am
async function sendBillingReminders() {
  const threeDays = new Date();
  threeDays.setDate(threeDays.getDate() + 3);
  const targetDate = threeDays.toISOString().split('T')[0];

  try {
    const upcoming = await query(
      `SELECT bs.name, bs.amount, bs.next_due_date, b.email, b.name AS business_name
       FROM billing_schedules bs
       JOIN businesses b ON b.id = bs.business_id
       WHERE bs.is_active = true AND bs.next_due_date = $1`,
      [targetDate]
    );

    for (const bill of upcoming.rows) {
      if (bill.email) {
        await notifyBillingReminder({
          email: bill.email,
          businessName: bill.business_name,
          billName: bill.name,
          amount: bill.amount,
          dueDate: bill.next_due_date,
        });
        console.log(`[CRON] Reminder sent: ${bill.name} due ${bill.next_due_date}`);
      }
    }
  } catch (err) {
    console.error('[CRON] Reminder error:', err.message);
  }
}

// Monthly savings computation — runs on 1st of each month
async function computeMonthlySavings() {
  const now = new Date();
  if (now.getDate() !== 1) return;
  const lastMonth = now.getMonth() === 0 ? 12 : now.getMonth();
  const lastYear = now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear();

  try {
    const businesses = await query('SELECT id, savings_rate FROM businesses');
    for (const biz of businesses.rows) {
      const [income, expenses] = await Promise.all([
        query(
          'SELECT COALESCE(SUM(amount),0) AS t FROM income_records WHERE business_id=$1 AND EXTRACT(MONTH FROM date)=$2 AND EXTRACT(YEAR FROM date)=$3',
          [biz.id, lastMonth, lastYear]
        ),
        query(
          'SELECT COALESCE(SUM(amount),0) AS t FROM expenses WHERE business_id=$1 AND EXTRACT(MONTH FROM date)=$2 AND EXTRACT(YEAR FROM date)=$3',
          [biz.id, lastMonth, lastYear]
        ),
      ]);
      const net = parseFloat(income.rows[0].t) - parseFloat(expenses.rows[0].t);
      if (net > 0) {
        const amount = net * (parseFloat(biz.savings_rate) / 100);
        await query(
          `INSERT INTO savings_allocations (id, business_id, period_month, period_year, net_income, savings_rate, amount)
           VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6)
           ON CONFLICT DO NOTHING`,
          [biz.id, lastMonth, lastYear, net, biz.savings_rate, amount]
        );
        console.log(`[CRON] Savings computed for business ${biz.id}: KES ${amount.toFixed(0)}`);
      }
    }
  } catch (err) {
    console.error('[CRON] Savings error:', err.message);
  }
}

// Start schedulers
if (require.main === module) {
  console.log('🕐 LEDGR Cron service started');
  processDueBills();
  setInterval(processDueBills, HOUR);

  const now = new Date();
  const msUntil8am = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 8, 0, 0) - now;
  setTimeout(() => {
    sendBillingReminders();
    computeMonthlySavings();
    setInterval(() => {
      sendBillingReminders();
      computeMonthlySavings();
    }, 24 * HOUR);
  }, msUntil8am > 0 ? msUntil8am : 0);
}

module.exports = { processDueBills, sendBillingReminders, computeMonthlySavings };
