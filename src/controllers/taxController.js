const { query } = require('../../config/database');
const { v4: uuidv4 } = require('uuid');

// Kenya tax helpers
const computePAYE = (gross) => {
  // Kenya PAYE bands 2024
  if (gross <= 24000) return 0;
  if (gross <= 32333) return (gross - 24000) * 0.25;
  if (gross <= 500000) return 2083 + (gross - 32333) * 0.30;
  return 2083 + 140300 + (gross - 500000) * 0.325;
};
const computeNHIF = (gross) => {
  if (gross < 6000) return 150;
  if (gross < 8000) return 300; if (gross < 12000) return 400;
  if (gross < 15000) return 500; if (gross < 20000) return 600;
  if (gross < 25000) return 750; if (gross < 30000) return 850;
  if (gross < 35000) return 900; if (gross < 40000) return 950;
  if (gross < 45000) return 1000; if (gross < 50000) return 1100;
  if (gross < 60000) return 1200; if (gross < 70000) return 1300;
  if (gross < 80000) return 1400; if (gross < 90000) return 1500;
  if (gross < 100000) return 1600; return 1700;
};
const NSSF_RATE = 0.06;
const MAX_NSSF = 1080;

const listTax = async (req, res) => {
  const { year } = req.query;
  const y = parseInt(year) || new Date().getFullYear();
  const businessId = req.user.business_id;

  const [records, vatSummary, payeSummary] = await Promise.all([
    query(
      'SELECT * FROM tax_records WHERE business_id = $1 AND period_year = $2 ORDER BY period_month',
      [businessId, y]
    ),
    // VAT: 16% of income
    query(
      `SELECT EXTRACT(MONTH FROM date)::int AS month,
              SUM(amount) AS gross, SUM(amount) * 0.16 AS vat
       FROM income_records WHERE business_id = $1 AND EXTRACT(YEAR FROM date) = $2
       GROUP BY month ORDER BY month`,
      [businessId, y]
    ),
    query(
      `SELECT period_month AS month, total_paye AS paye, total_nhif AS nhif, total_nssf AS nssf
       FROM payroll_runs WHERE business_id = $1 AND period_year = $2 AND status = 'paid'
       ORDER BY period_month`,
      [businessId, y]
    ),
  ]);

  res.render('pages/tax/index', {
    title: 'Tax — LEDGR',
    records: records.rows,
    vatSummary: vatSummary.rows,
    payeSummary: payeSummary.rows,
    year: y,
    helpers: { computePAYE, computeNHIF },
  });
};

const createTaxRecord = async (req, res) => {
  const { taxType, periodMonth, periodYear, grossAmount, taxAmount, dueDate } = req.body;
  await query(
    `INSERT INTO tax_records (id, business_id, tax_type, period_month, period_year, gross_amount, tax_amount, due_date)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
    [uuidv4(), req.user.business_id, taxType, parseInt(periodMonth),
     parseInt(periodYear), parseFloat(grossAmount), parseFloat(taxAmount),
     dueDate || null]
  );
  res.redirect('/tax?success=1');
};

const markPaid = async (req, res) => {
  await query(
    'UPDATE tax_records SET is_paid = true, paid_date = NOW()::DATE WHERE id = $1 AND business_id = $2',
    [req.params.id, req.user.business_id]
  );
  res.redirect('/tax?paid=1');
};

module.exports = { listTax, createTaxRecord, markPaid, computePAYE, computeNHIF, NSSF_RATE, MAX_NSSF };
