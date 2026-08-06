const { query, getClient } = require('../../config/database');
const { v4: uuidv4 } = require('uuid');
const { computePAYE, computeNHIF, NSSF_RATE, MAX_NSSF } = require('./taxController');

const listPayroll = async (req, res) => {
  const runs = await query(
    'SELECT * FROM payroll_runs WHERE business_id = $1 ORDER BY period_year DESC, period_month DESC',
    [req.user.business_id]
  );
  res.render('pages/payroll/index', { title: 'Payroll — LEDGR', runs: runs.rows });
};

const showRunForm = async (req, res) => {
  const now = new Date();
  const employees = await query(
    `SELECT e.id, e.first_name, e.last_name, e.salary, e.payment_method, e.mpesa_number, d.name AS dept
     FROM employees e LEFT JOIN departments d ON d.id = e.department_id
     WHERE e.business_id = $1 AND e.is_active = true ORDER BY d.name, e.first_name`,
    [req.user.business_id]
  );

  const previews = employees.rows.map(e => {
    const gross = parseFloat(e.salary);
    const paye = computePAYE(gross);
    const nhif = computeNHIF(gross);
    const nssf = Math.min(gross * NSSF_RATE, MAX_NSSF);
    return { ...e, gross, paye, nhif, nssf, net: gross - paye - nhif - nssf };
  });

  res.render('pages/payroll/run', {
    title: 'Run Payroll — LEDGR',
    employees: previews,
    month: now.getMonth() + 1,
    year: now.getFullYear(),
    totalGross: previews.reduce((s, e) => s + e.gross, 0),
    totalNet: previews.reduce((s, e) => s + e.net, 0),
    totalPAYE: previews.reduce((s, e) => s + e.paye, 0),
  });
};

const createRun = async (req, res) => {
  const { periodMonth, periodYear } = req.body;
  const businessId = req.user.business_id;
  const client = await getClient();

  const employees = await query(
    'SELECT * FROM employees WHERE business_id = $1 AND is_active = true',
    [businessId]
  );

  const items = employees.rows.map(e => {
    const gross = parseFloat(e.salary);
    const paye = computePAYE(gross);
    const nhif = computeNHIF(gross);
    const nssf = Math.min(gross * NSSF_RATE, MAX_NSSF);
    return { ...e, gross, paye, nhif, nssf, net: gross - paye - nhif - nssf };
  });

  const runId = uuidv4();
  const totals = items.reduce((acc, e) => ({
    gross: acc.gross + e.gross, paye: acc.paye + e.paye,
    nhif: acc.nhif + e.nhif, nssf: acc.nssf + e.nssf, net: acc.net + e.net,
  }), { gross: 0, paye: 0, nhif: 0, nssf: 0, net: 0 });

  try {
    await client.query('BEGIN');
    await client.query(
      `INSERT INTO payroll_runs (id, business_id, run_by, period_month, period_year, total_gross, total_paye, total_nhif, total_nssf, total_net, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'draft')`,
      [runId, businessId, req.user.id, parseInt(periodMonth), parseInt(periodYear),
       totals.gross, totals.paye, totals.nhif, totals.nssf, totals.net]
    );
    for (const e of items) {
      await client.query(
        `INSERT INTO payroll_items (id, payroll_run_id, employee_id, gross_salary, paye, nhif, nssf, net_salary)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [uuidv4(), runId, e.id, e.gross, e.paye, e.nhif, e.nssf, e.net]
      );
    }
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Payroll run error:', err);
    return res.redirect('/payroll?error=run_failed');
  } finally { client.release(); }

  res.redirect(`/payroll/${runId}`);
};

const showRun = async (req, res) => {
  const [run, items] = await Promise.all([
    query('SELECT * FROM payroll_runs WHERE id = $1 AND business_id = $2', [req.params.id, req.user.business_id]),
    query(
      `SELECT pi.*, e.first_name, e.last_name, e.mpesa_number, e.payment_method, d.name AS dept
       FROM payroll_items pi
       JOIN employees e ON e.id = pi.employee_id
       LEFT JOIN departments d ON d.id = e.department_id
       WHERE pi.payroll_run_id = $1 ORDER BY d.name, e.first_name`,
      [req.params.id]
    ),
  ]);
  if (!run.rows.length) return res.redirect('/payroll');
  res.render('pages/payroll/show', {
    title: 'Payroll Run — LEDGR', run: run.rows[0], items: items.rows,
  });
};

const approveRun = async (req, res) => {
  await query(
    `UPDATE payroll_runs SET status = 'approved', approved_by = $1, approved_at = NOW() WHERE id = $2 AND business_id = $3`,
    [req.user.id, req.params.id, req.user.business_id]
  );
  res.redirect(`/payroll/${req.params.id}?approved=1`);
};

module.exports = { listPayroll, showRunForm, createRun, showRun, approveRun };
