const { query } = require('../../config/database');

const showDashboard = async (req, res) => {
  const businessId = req.user.business_id;
  const today = new Date();
  const month = today.getMonth() + 1;
  const year = today.getFullYear();

  try {
    const [incomeThisMonth, expensesThisMonth, employeeSummary, recentActivity, upcomingBills] = await Promise.all([
      // Monthly income total
      query(
        `SELECT COALESCE(SUM(amount), 0) AS total,
                COUNT(*) AS entries,
                COALESCE(SUM(amount) FILTER (WHERE date = CURRENT_DATE), 0) AS today
         FROM income_records
         WHERE business_id = $1 AND EXTRACT(MONTH FROM date) = $2 AND EXTRACT(YEAR FROM date) = $3`,
        [businessId, month, year]
      ),
      // Monthly expenses total
      query(
        `SELECT COALESCE(SUM(amount), 0) AS total,
                COALESCE(SUM(amount) FILTER (WHERE c.type = 'utility'), 0) AS utilities,
                COALESCE(SUM(amount) FILTER (WHERE c.type = 'payroll'), 0) AS payroll
         FROM expenses e
         LEFT JOIN expense_categories c ON c.id = e.category_id
         WHERE e.business_id = $1 AND EXTRACT(MONTH FROM e.date) = $2 AND EXTRACT(YEAR FROM e.date) = $3`,
        [businessId, month, year]
      ),
      // Employee stats
      query(
        `SELECT COUNT(*) FILTER (WHERE is_active) AS active,
                COUNT(DISTINCT department_id) FILTER (WHERE is_active) AS departments,
                COALESCE(SUM(salary) FILTER (WHERE is_active), 0) AS payroll_total
         FROM employees WHERE business_id = $1`,
        [businessId]
      ),
      // Recent income (last 5)
      query(
        `SELECT date, amount, source, description, payment_mode
         FROM income_records WHERE business_id = $1
         ORDER BY date DESC, created_at DESC LIMIT 5`,
        [businessId]
      ),
      // Upcoming bills
      query(
        `SELECT name, category, amount, next_due_date, payment_method
         FROM billing_schedules
         WHERE business_id = $1 AND is_active = true AND next_due_date <= CURRENT_DATE + 14
         ORDER BY next_due_date LIMIT 5`,
        [businessId]
      ),
    ]);

    const income = parseFloat(incomeThisMonth.rows[0].total);
    const expenses = parseFloat(expensesThisMonth.rows[0].total);
    const netIncome = income - expenses;
    const savingsRate = parseFloat(req.user.savings_rate) || 10;

    res.render('pages/dashboard', {
      title: 'Dashboard — LEDGR',
      welcome: req.query.welcome === '1',
      stats: {
        income,
        incomeToday: parseFloat(incomeThisMonth.rows[0].today),
        expenses,
        netIncome,
        savings: netIncome > 0 ? netIncome * (savingsRate / 100) : 0,
        savingsRate,
        employees: parseInt(employeeSummary.rows[0].active),
        departments: parseInt(employeeSummary.rows[0].departments),
        monthlyPayroll: parseFloat(employeeSummary.rows[0].payroll_total),
      },
      recentActivity: recentActivity.rows,
      upcomingBills: upcomingBills.rows,
      month: today.toLocaleString('default', { month: 'long' }),
      year,
    });
  } catch (err) {
    console.error('Dashboard error:', err);
    res.render('pages/dashboard', {
      title: 'Dashboard — LEDGR',
      welcome: false,
      stats: { income: 0, incomeToday: 0, expenses: 0, netIncome: 0, savings: 0, savingsRate: 10, employees: 0, departments: 0, monthlyPayroll: 0 },
      recentActivity: [],
      upcomingBills: [],
      month: today.toLocaleString('default', { month: 'long' }),
      year,
    });
  }
};

module.exports = { showDashboard };
