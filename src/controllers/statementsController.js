const { query } = require('../../config/database');
const PDFDocument = require('pdfkit');

const listStatements = async (req, res) => {
  const businessId = req.user.business_id;
  const payrollRuns = await query(
    'SELECT id, period_month, period_year, total_net, status, created_at FROM payroll_runs WHERE business_id = $1 ORDER BY period_year DESC, period_month DESC LIMIT 12',
    [businessId]
  );
  res.render('pages/statements/index', {
    title: 'Statements — LEDGR',
    payrollRuns: payrollRuns.rows,
  });
};

// GET /statements/pl?month=&year=
const downloadPL = async (req, res) => {
  const { month, year } = req.query;
  const businessId = req.user.business_id;
  const m = parseInt(month) || new Date().getMonth() + 1;
  const y = parseInt(year) || new Date().getFullYear();
  const monthName = new Date(y, m - 1).toLocaleString('default', { month: 'long' });

  const [income, expenses, business] = await Promise.all([
    query(
      `SELECT date, amount, description, payment_mode FROM income_records
       WHERE business_id = $1 AND EXTRACT(MONTH FROM date) = $2 AND EXTRACT(YEAR FROM date) = $3
       ORDER BY date`,
      [businessId, m, y]
    ),
    query(
      `SELECT e.date, e.amount, e.description, e.vendor, c.name AS category
       FROM expenses e LEFT JOIN expense_categories c ON c.id = e.category_id
       WHERE e.business_id = $1 AND EXTRACT(MONTH FROM e.date) = $2 AND EXTRACT(YEAR FROM e.date) = $3
       ORDER BY e.date`,
      [businessId, m, y]
    ),
    query('SELECT name, email, address FROM businesses WHERE id = $1', [businessId]),
  ]);

  const biz = business.rows[0];
  const totalIncome = income.rows.reduce((s, r) => s + parseFloat(r.amount), 0);
  const totalExpenses = expenses.rows.reduce((s, r) => s + parseFloat(r.amount), 0);
  const net = totalIncome - totalExpenses;

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename=LEDGR_PL_${monthName}_${y}.pdf`);

  const doc = new PDFDocument({ margin: 50, size: 'A4' });
  doc.pipe(res);

  // Header
  doc.fontSize(22).font('Helvetica-Bold').text('LEDGR', 50, 50);
  doc.fontSize(10).font('Helvetica').fillColor('#666').text(`${biz.name} — Profit & Loss Statement`, 50, 78);
  doc.fillColor('#000');
  doc.fontSize(14).font('Helvetica-Bold').text(`${monthName} ${y}`, 50, 100);

  doc.moveTo(50, 125).lineTo(545, 125).strokeColor('#e0e0e0').stroke();
  let y2 = 140;

  // Income section
  doc.fontSize(12).font('Helvetica-Bold').fillColor('#00b87f').text('INCOME', 50, y2);
  y2 += 20;
  income.rows.forEach(r => {
    doc.fontSize(9).font('Helvetica').fillColor('#333');
    doc.text(new Date(r.date).toLocaleDateString('en-KE'), 50, y2);
    doc.text(r.description || 'Daily sales', 130, y2);
    doc.text(`KES ${parseFloat(r.amount).toLocaleString()}`, 450, y2, { align: 'right', width: 95 });
    y2 += 16;
  });
  y2 += 6;
  doc.fontSize(10).font('Helvetica-Bold').fillColor('#00b87f');
  doc.text(`Total Income: KES ${totalIncome.toLocaleString()}`, 50, y2, { align: 'right', width: 495 });
  y2 += 24;

  // Expenses section
  doc.fontSize(12).font('Helvetica-Bold').fillColor('#dc3545').text('EXPENSES', 50, y2);
  y2 += 20;
  expenses.rows.forEach(r => {
    doc.fontSize(9).font('Helvetica').fillColor('#333');
    doc.text(new Date(r.date).toLocaleDateString('en-KE'), 50, y2);
    doc.text(r.description || r.category || 'Expense', 130, y2);
    doc.text(`KES ${parseFloat(r.amount).toLocaleString()}`, 450, y2, { align: 'right', width: 95 });
    y2 += 16;
  });
  y2 += 6;
  doc.fontSize(10).font('Helvetica-Bold').fillColor('#dc3545');
  doc.text(`Total Expenses: KES ${totalExpenses.toLocaleString()}`, 50, y2, { align: 'right', width: 495 });
  y2 += 24;

  // Net
  doc.moveTo(50, y2).lineTo(545, y2).strokeColor('#333').stroke();
  y2 += 12;
  doc.fontSize(13).font('Helvetica-Bold').fillColor(net >= 0 ? '#00b87f' : '#dc3545');
  doc.text(`NET INCOME: KES ${net.toLocaleString()}`, 50, y2, { align: 'right', width: 495 });

  doc.end();
};

// GET /statements/payroll/:id
const downloadPayslips = async (req, res) => {
  const [run, items] = await Promise.all([
    query('SELECT * FROM payroll_runs WHERE id = $1 AND business_id = $2', [req.params.id, req.user.business_id]),
    query(
      `SELECT pi.*, e.first_name, e.last_name, e.mpesa_number, d.name AS dept
       FROM payroll_items pi JOIN employees e ON e.id = pi.employee_id
       LEFT JOIN departments d ON d.id = e.department_id
       WHERE pi.payroll_run_id = $1 ORDER BY d.name, e.first_name`,
      [req.params.id]
    ),
  ]);
  if (!run.rows.length) return res.status(404).send('Not found');

  const r = run.rows[0];
  const monthName = new Date(r.period_year, r.period_month - 1).toLocaleString('default', { month: 'long' });

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename=LEDGR_Payroll_${monthName}_${r.period_year}.pdf`);

  const doc = new PDFDocument({ margin: 50, size: 'A4' });
  doc.pipe(res);

  doc.fontSize(20).font('Helvetica-Bold').text('LEDGR Payroll Summary', 50, 50);
  doc.fontSize(12).font('Helvetica').fillColor('#666').text(`${monthName} ${r.period_year}`, 50, 76);
  doc.fillColor('#000');
  let yp = 110;

  // Table header
  const cols = [50, 180, 270, 340, 400, 460];
  const headers = ['Employee', 'Department', 'Gross', 'PAYE', 'NHIF/NSSF', 'Net'];
  doc.fontSize(9).font('Helvetica-Bold').fillColor('#666');
  headers.forEach((h, i) => doc.text(h, cols[i], yp));
  yp += 16;
  doc.moveTo(50, yp).lineTo(545, yp).strokeColor('#e0e0e0').stroke();
  yp += 8;

  items.rows.forEach(item => {
    doc.fontSize(9).font('Helvetica').fillColor('#333');
    doc.text(`${item.first_name} ${item.last_name}`, cols[0], yp);
    doc.text(item.dept || '—', cols[1], yp);
    doc.text(`${parseFloat(item.gross_salary).toLocaleString()}`, cols[2], yp);
    doc.text(`${parseFloat(item.paye).toLocaleString()}`, cols[3], yp);
    doc.text(`${(parseFloat(item.nhif) + parseFloat(item.nssf)).toLocaleString()}`, cols[4], yp);
    doc.font('Helvetica-Bold').text(`${parseFloat(item.net_salary).toLocaleString()}`, cols[5], yp);
    yp += 18;
  });

  yp += 12;
  doc.moveTo(50, yp).lineTo(545, yp).strokeColor('#333').stroke();
  yp += 10;
  doc.fontSize(11).font('Helvetica-Bold');
  doc.text(`Total Net Payroll: KES ${parseFloat(r.total_net).toLocaleString()}`, 50, yp, { align: 'right', width: 495 });

  doc.end();
};

// GET /statements/search
const search = async (req, res) => {
  const { q, type, from, to } = req.query;
  const businessId = req.user.business_id;
  if (!q && !from) {
    return res.render('pages/statements/search', { title: 'Search — LEDGR', results: null, query: req.query });
  }

  const fromDate = from || '2020-01-01';
  const toDate = to || new Date().toISOString().split('T')[0];

  const [income, expenses] = await Promise.all([
    query(
      `SELECT 'income' AS type, date, amount, description, payment_mode AS extra
       FROM income_records
       WHERE business_id = $1 AND date BETWEEN $2 AND $3
         ${q ? 'AND description ILIKE $4' : ''}
       ORDER BY date DESC LIMIT 50`,
      q ? [businessId, fromDate, toDate, `%${q}%`] : [businessId, fromDate, toDate]
    ),
    query(
      `SELECT 'expense' AS type, date, amount, description, payment_method AS extra
       FROM expenses
       WHERE business_id = $1 AND date BETWEEN $2 AND $3
         ${q ? 'AND (description ILIKE $4 OR vendor ILIKE $4)' : ''}
       ORDER BY date DESC LIMIT 50`,
      q ? [businessId, fromDate, toDate, `%${q}%`] : [businessId, fromDate, toDate]
    ),
  ]);

  const results = [...income.rows, ...expenses.rows].sort((a, b) => new Date(b.date) - new Date(a.date));
  res.render('pages/statements/search', { title: 'Search — LEDGR', results, query: req.query });
};

module.exports = { listStatements, downloadPL, downloadPayslips, search };
