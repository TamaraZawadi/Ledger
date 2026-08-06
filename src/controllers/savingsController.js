const { query } = require('../../config/database');
const { v4: uuidv4 } = require('uuid');

const listSavings = async (req, res) => {
  const businessId = req.user.business_id;
  const year = parseInt(req.query.year) || new Date().getFullYear();

  const [allocations, summary] = await Promise.all([
    query(
      'SELECT * FROM savings_allocations WHERE business_id = $1 AND period_year = $2 ORDER BY period_month',
      [businessId, year]
    ),
    query(
      `SELECT COALESCE(SUM(amount), 0) AS total_saved,
              COALESCE(SUM(amount) FILTER (WHERE status = 'transferred'), 0) AS transferred,
              COALESCE(SUM(amount) FILTER (WHERE status = 'pending'), 0) AS pending
       FROM savings_allocations WHERE business_id = $1 AND period_year = $2`,
      [businessId, year]
    ),
  ]);

  res.render('pages/savings/index', {
    title: 'Savings — LEDGR',
    allocations: allocations.rows,
    summary: summary.rows[0],
    year,
    savingsRate: req.user.savings_rate,
  });
};

// Auto-compute and save allocation for a given month
const computeAllocation = async (req, res) => {
  const { periodMonth, periodYear } = req.body;
  const businessId = req.user.business_id;
  const m = parseInt(periodMonth);
  const y = parseInt(periodYear);

  const [income, expenses] = await Promise.all([
    query(
      'SELECT COALESCE(SUM(amount),0) AS total FROM income_records WHERE business_id=$1 AND EXTRACT(MONTH FROM date)=$2 AND EXTRACT(YEAR FROM date)=$3',
      [businessId, m, y]
    ),
    query(
      'SELECT COALESCE(SUM(amount),0) AS total FROM expenses WHERE business_id=$1 AND EXTRACT(MONTH FROM date)=$2 AND EXTRACT(YEAR FROM date)=$3',
      [businessId, m, y]
    ),
  ]);

  const netIncome = parseFloat(income.rows[0].total) - parseFloat(expenses.rows[0].total);
  if (netIncome <= 0) return res.redirect('/savings?no_net=1');

  const rate = parseFloat(req.user.savings_rate) || 10;
  const amount = netIncome * (rate / 100);

  // Upsert
  await query(
    `INSERT INTO savings_allocations (id, business_id, period_month, period_year, net_income, savings_rate, amount)
     VALUES ($1,$2,$3,$4,$5,$6,$7)
     ON CONFLICT DO NOTHING`,
    [uuidv4(), businessId, m, y, netIncome, rate, amount]
  );

  res.redirect('/savings?computed=1');
};

const markTransferred = async (req, res) => {
  const { accountReference } = req.body;
  await query(
    `UPDATE savings_allocations SET status = 'transferred', transferred_at = NOW(), account_reference = $1
     WHERE id = $2 AND business_id = $3`,
    [accountReference || null, req.params.id, req.user.business_id]
  );
  res.redirect('/savings?transferred=1');
};

module.exports = { listSavings, computeAllocation, markTransferred };
