const { query } = require('../../config/database');
const { validationResult } = require('express-validator');
const { v4: uuidv4 } = require('uuid');

const listExpenses = async (req, res) => {
  const { month, year, type } = req.query;
  const businessId = req.user.business_id;
  const now = new Date();
  const m = parseInt(month) || now.getMonth() + 1;
  const y = parseInt(year) || now.getFullYear();

  try {
  const [expenses, categories, summary] = await Promise.all([
    query(
      `SELECT e.id, e.date, e.amount, e.description, e.vendor, e.payment_method, e.is_paid,
              c.name AS category_name, c.type AS category_type
       FROM expenses e
       LEFT JOIN expense_categories c ON c.id = e.category_id
       WHERE e.business_id = $1
         AND EXTRACT(MONTH FROM e.date) = $2
         AND EXTRACT(YEAR FROM e.date) = $3
         ${type ? 'AND c.type = $4' : ''}
       ORDER BY e.date DESC`,
      type ? [businessId, m, y, type] : [businessId, m, y]
    ),
    query('SELECT id, name, type FROM expense_categories WHERE business_id = $1 ORDER BY name', [businessId]),
    query(
      `SELECT COALESCE(SUM(e.amount), 0) AS total,
              COALESCE(SUM(e.amount) FILTER (WHERE c.type = 'utility'), 0) AS utilities,
              COALESCE(SUM(e.amount) FILTER (WHERE c.type = 'supplier'), 0) AS suppliers,
              COALESCE(SUM(e.amount) FILTER (WHERE c.type = 'maintenance'), 0) AS maintenance,
              COALESCE(SUM(e.amount) FILTER (WHERE c.type = 'payroll'), 0) AS payroll
       FROM expenses e LEFT JOIN expense_categories c ON c.id = e.category_id
       WHERE e.business_id = $1 AND EXTRACT(MONTH FROM e.date) = $2 AND EXTRACT(YEAR FROM e.date) = $3`,
      [businessId, m, y]
    ),
  ]);

  res.render('pages/expenses/index', {
    title: 'Expenses — LEDGR',
    expenses: expenses.rows,
    categories: categories.rows,
    summary: summary.rows[0],
    filters: { month: m, year: y, type },
  });
  } catch (err) {
    console.error('Expenses list error:', err);
    res.status(500).render('pages/error', { title: 'Error — LEDGR', message: 'Failed to load expenses.', code: 500 });
  }
};

const showNewForm = async (req, res) => {
  const categories = await query(
    'SELECT id, name, type FROM expense_categories WHERE business_id = $1 ORDER BY name',
    [req.user.business_id]
  );
  res.render('pages/expenses/form', {
    title: 'Log Expense — LEDGR',
    expense: null, error: null,
    categories: categories.rows,
    today: new Date().toISOString().split('T')[0],
  });
};

const createExpense = async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    const categories = await query('SELECT id, name, type FROM expense_categories WHERE business_id = $1 ORDER BY name', [req.user.business_id]);
    return res.render('pages/expenses/form', {
      title: 'Log Expense — LEDGR', expense: req.body,
      error: errors.array()[0].msg, categories: categories.rows,
      today: new Date().toISOString().split('T')[0],
    });
  }
  const { date, amount, description, categoryId, vendor, paymentMethod, isPaid } = req.body;
  await query(
    `INSERT INTO expenses (id, business_id, category_id, recorded_by, date, amount, description, vendor, payment_method, is_paid)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
    [uuidv4(), req.user.business_id, categoryId || null, req.user.id,
     date, parseFloat(amount), description, vendor || null,
     paymentMethod || 'cash', isPaid === 'on']
  );
  res.redirect('/expenses?success=1');
};

const deleteExpense = async (req, res) => {
  try {
    await query('DELETE FROM expenses WHERE id = $1 AND business_id = $2', [req.params.id, req.user.business_id]);
    res.redirect('/expenses?deleted=1');
  } catch (err) {
    console.error('Expense delete error:', err);
    res.redirect('/expenses?error=delete_failed');
  }
};

module.exports = { listExpenses, showNewForm, createExpense, deleteExpense };
