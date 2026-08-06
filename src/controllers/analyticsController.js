const { query } = require('../../config/database');

const showAnalytics = async (req, res) => {
  const businessId = req.user.business_id;
  const year = parseInt(req.query.year) || new Date().getFullYear();

  const [monthly, categoryBreakdown, topExpenses, incomeVsExpense] = await Promise.all([
    // Monthly income vs expenses for the year
    query(
      `SELECT m.month,
              COALESCE(i.total, 0) AS income,
              COALESCE(e.total, 0) AS expenses,
              COALESCE(i.total, 0) - COALESCE(e.total, 0) AS net
       FROM generate_series(1, 12) AS m(month)
       LEFT JOIN (
         SELECT EXTRACT(MONTH FROM date)::int AS month, SUM(amount) AS total
         FROM income_records WHERE business_id = $1 AND EXTRACT(YEAR FROM date) = $2
         GROUP BY month
       ) i ON i.month = m.month
       LEFT JOIN (
         SELECT EXTRACT(MONTH FROM date)::int AS month, SUM(amount) AS total
         FROM expenses WHERE business_id = $1 AND EXTRACT(YEAR FROM date) = $2
         GROUP BY month
       ) e ON e.month = m.month
       ORDER BY m.month`,
      [businessId, year]
    ),
    // Expense category breakdown (current year)
    query(
      `SELECT c.name, c.type, COALESCE(SUM(e.amount), 0) AS total
       FROM expense_categories c
       LEFT JOIN expenses e ON e.category_id = c.id
         AND EXTRACT(YEAR FROM e.date) = $2
       WHERE c.business_id = $1
       GROUP BY c.id ORDER BY total DESC`,
      [businessId, year]
    ),
    // Top 5 expense descriptions
    query(
      `SELECT description, vendor, SUM(amount) AS total, COUNT(*) AS count
       FROM expenses
       WHERE business_id = $1 AND EXTRACT(YEAR FROM date) = $2
       GROUP BY description, vendor ORDER BY total DESC LIMIT 5`,
      [businessId, year]
    ),
    // Year totals
    query(
      `SELECT
         COALESCE((SELECT SUM(amount) FROM income_records WHERE business_id = $1 AND EXTRACT(YEAR FROM date) = $2), 0) AS total_income,
         COALESCE((SELECT SUM(amount) FROM expenses WHERE business_id = $1 AND EXTRACT(YEAR FROM date) = $2), 0) AS total_expenses`,
      [businessId, year]
    ),
  ]);

  const totals = incomeVsExpense.rows[0];
  const netIncome = parseFloat(totals.total_income) - parseFloat(totals.total_expenses);

  res.render('pages/analytics/index', {
    title: 'Analytics — LEDGR',
    year,
    monthly: monthly.rows,
    categoryBreakdown: categoryBreakdown.rows,
    topExpenses: topExpenses.rows,
    totals: { ...totals, net: netIncome, savingsRate: req.user.savings_rate },
    // Serialise for Chart.js
    chartData: {
      labels: ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'],
      income: monthly.rows.map(r => parseFloat(r.income)),
      expenses: monthly.rows.map(r => parseFloat(r.expenses)),
      net: monthly.rows.map(r => parseFloat(r.net)),
    },
  });
};

module.exports = { showAnalytics };
