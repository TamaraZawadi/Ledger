const { query } = require('../../config/database');
const { validationResult } = require('express-validator');
const { v4: uuidv4 } = require('uuid');

// GET /income
const listIncome = async (req, res) => {
  const { month, year, mode } = req.query;
  const businessId = req.user.business_id;
  const now = new Date();
  const m = parseInt(month) || now.getMonth() + 1;
  const y = parseInt(year) || now.getFullYear();

  try {
  const [records, summary] = await Promise.all([
    query(
      `SELECT id, date, amount, source, description, payment_mode, mpesa_ref, is_verified, created_at
       FROM income_records
       WHERE business_id = $1
         AND EXTRACT(MONTH FROM date) = $2
         AND EXTRACT(YEAR FROM date) = $3
         ${mode ? 'AND payment_mode = $4' : ''}
       ORDER BY date DESC, created_at DESC`,
      mode ? [businessId, m, y, mode] : [businessId, m, y]
    ),
    query(
      `SELECT
         COALESCE(SUM(amount), 0) AS total,
         COALESCE(SUM(amount) FILTER (WHERE payment_mode = 'mpesa'), 0) AS mpesa_total,
         COALESCE(SUM(amount) FILTER (WHERE payment_mode = 'cash'), 0) AS cash_total,
         COALESCE(SUM(amount) FILTER (WHERE payment_mode = 'card'), 0) AS card_total,
         COUNT(*) AS entry_count,
         COALESCE(AVG(amount), 0) AS daily_avg
       FROM income_records
       WHERE business_id = $1
         AND EXTRACT(MONTH FROM date) = $2
         AND EXTRACT(YEAR FROM date) = $3`,
      [businessId, m, y]
    ),
  ]);

  // Daily breakdown for mini chart
  const daily = await query(
    `SELECT date::text, SUM(amount) AS total
     FROM income_records
     WHERE business_id = $1 AND EXTRACT(MONTH FROM date) = $2 AND EXTRACT(YEAR FROM date) = $3
     GROUP BY date ORDER BY date`,
    [businessId, m, y]
  );

  res.render('pages/income/index', {
    title: 'Income — LEDGR',
    records: records.rows,
    summary: summary.rows[0],
    daily: daily.rows,
    filters: { month: m, year: y, mode },
  });
  } catch (err) {
    console.error('Income list error:', err);
    res.status(500).render('pages/error', { title: 'Error — LEDGR', message: 'Failed to load income records.', code: 500 });
  }
};

// GET /income/new
const showNewForm = (req, res) => {
  res.render('pages/income/form', {
    title: 'Record Income — LEDGR',
    income: null,
    error: null,
    today: new Date().toISOString().split('T')[0],
  });
};

// POST /income
const createIncome = async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.render('pages/income/form', {
      title: 'Record Income — LEDGR',
      income: req.body, error: errors.array()[0].msg,
      today: new Date().toISOString().split('T')[0],
    });
  }
  const { date, amount, source, description, paymentMode, mpesaRef } = req.body;
  try {
    await query(
      `INSERT INTO income_records (id, business_id, recorded_by, date, amount, source, description, payment_mode, mpesa_ref)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [uuidv4(), req.user.business_id, req.user.id, date, parseFloat(amount),
       source || 'daily_sales', description || null, paymentMode || 'cash', mpesaRef || null]
    );
    res.redirect('/income?success=1');
  } catch (err) {
    console.error('Income create error:', err);
    res.render('pages/income/form', { title: 'Record Income — LEDGR', income: req.body, error: 'Failed to save. Please try again.', today: new Date().toISOString().split('T')[0] });
  }
};

// POST /income/:id/delete
const deleteIncome = async (req, res) => {
  try {
    await query(
      'DELETE FROM income_records WHERE id = $1 AND business_id = $2',
      [req.params.id, req.user.business_id]
    );
    res.redirect('/income?deleted=1');
  } catch (err) {
    console.error('Income delete error:', err);
    res.redirect('/income?error=delete_failed');
  }
};

module.exports = { listIncome, showNewForm, createIncome, deleteIncome };
