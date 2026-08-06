const { query } = require('../../config/database');
const { validationResult } = require('express-validator');
const { v4: uuidv4 } = require('uuid');

// GET /employees
const listEmployees = async (req, res) => {
  const { dept, status = 'active', search } = req.query;
  const businessId = req.user.business_id;

  let sql = `
    SELECT e.id, e.first_name, e.last_name, e.employee_number, e.role_title,
           e.employment_type, e.salary, e.phone, e.email, e.payment_method,
           e.is_active, e.start_date,
           d.name AS department_name, d.id AS department_id
    FROM employees e
    LEFT JOIN departments d ON d.id = e.department_id
    WHERE e.business_id = $1
  `;
  const params = [businessId];

  if (status === 'active') { sql += ` AND e.is_active = true`; }
  else if (status === 'inactive') { sql += ` AND e.is_active = false`; }

  if (dept) { params.push(dept); sql += ` AND e.department_id = $${params.length}`; }

  if (search) {
    params.push(`%${search}%`);
    sql += ` AND (e.first_name ILIKE $${params.length} OR e.last_name ILIKE $${params.length} OR e.employee_number ILIKE $${params.length})`;
  }

  sql += ` ORDER BY d.name, e.first_name`;

  const [employees, departments] = await Promise.all([
    query(sql, params),
    query('SELECT id, name FROM departments WHERE business_id = $1 ORDER BY name', [businessId]),
  ]);

  // Payroll summary
  const summary = await query(
    `SELECT COUNT(*) FILTER (WHERE is_active) AS total_active,
            SUM(salary) FILTER (WHERE is_active) AS monthly_payroll,
            COUNT(DISTINCT department_id) FILTER (WHERE is_active) AS active_departments
     FROM employees WHERE business_id = $1`,
    [businessId]
  );

  res.render('pages/employees/index', {
    title: 'Employees — LEDGR',
    employees: employees.rows,
    departments: departments.rows,
    summary: summary.rows[0],
    filters: { dept, status, search },
  });
};

// GET /employees/new
const showNewForm = async (req, res) => {
  const departments = await query(
    'SELECT id, name FROM departments WHERE business_id = $1 ORDER BY name',
    [req.user.business_id]
  );
  res.render('pages/employees/form', {
    title: 'Add Employee — LEDGR',
    employee: null,
    departments: departments.rows,
    error: null,
  });
};

// POST /employees
const createEmployee = async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    const departments = await query(
      'SELECT id, name FROM departments WHERE business_id = $1 ORDER BY name',
      [req.user.business_id]
    );
    return res.render('pages/employees/form', {
      title: 'Add Employee — LEDGR',
      employee: req.body,
      departments: departments.rows,
      error: errors.array()[0].msg,
    });
  }

  const {
    firstName, lastName, employeeNumber, idNumber, phone, email, roleTitle,
    departmentId, employmentType, salary, paymentMethod, mpesaNumber,
    bankName, bankAccount, startDate
  } = req.body;

  await query(
    `INSERT INTO employees
     (id, business_id, department_id, first_name, last_name, employee_number, id_number,
      phone, email, role_title, employment_type, salary, payment_method,
      mpesa_number, bank_name, bank_account, start_date)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)`,
    [
      uuidv4(), req.user.business_id, departmentId || null,
      firstName, lastName, employeeNumber || null, idNumber || null,
      phone || null, email || null, roleTitle || null, employmentType || 'full_time',
      parseFloat(salary), paymentMethod || 'mpesa',
      mpesaNumber || null, bankName || null, bankAccount || null, startDate
    ]
  );

  res.redirect('/employees?success=created');
};

// GET /employees/:id
const showEmployee = async (req, res) => {
  const result = await query(
    `SELECT e.*, d.name AS department_name
     FROM employees e LEFT JOIN departments d ON d.id = e.department_id
     WHERE e.id = $1 AND e.business_id = $2`,
    [req.params.id, req.user.business_id]
  );

  if (!result.rows.length) return res.redirect('/employees');

  res.render('pages/employees/show', {
    title: `${result.rows[0].first_name} ${result.rows[0].last_name} — LEDGR`,
    employee: result.rows[0],
  });
};

// GET /employees/:id/edit
const showEditForm = async (req, res) => {
  const [empResult, depts] = await Promise.all([
    query(
      'SELECT * FROM employees WHERE id = $1 AND business_id = $2',
      [req.params.id, req.user.business_id]
    ),
    query('SELECT id, name FROM departments WHERE business_id = $1 ORDER BY name', [req.user.business_id]),
  ]);

  if (!empResult.rows.length) return res.redirect('/employees');

  res.render('pages/employees/form', {
    title: 'Edit Employee — LEDGR',
    employee: empResult.rows[0],
    departments: depts.rows,
    error: null,
  });
};

// POST /employees/:id/update
const updateEmployee = async (req, res) => {
  const {
    firstName, lastName, employeeNumber, idNumber, phone, email, roleTitle,
    departmentId, employmentType, salary, paymentMethod, mpesaNumber,
    bankName, bankAccount, startDate, isActive
  } = req.body;

  await query(
    `UPDATE employees SET
      first_name=$1, last_name=$2, employee_number=$3, id_number=$4,
      phone=$5, email=$6, role_title=$7, department_id=$8, employment_type=$9,
      salary=$10, payment_method=$11, mpesa_number=$12, bank_name=$13,
      bank_account=$14, start_date=$15, is_active=$16
     WHERE id=$17 AND business_id=$18`,
    [
      firstName, lastName, employeeNumber || null, idNumber || null,
      phone || null, email || null, roleTitle || null, departmentId || null,
      employmentType, parseFloat(salary), paymentMethod,
      mpesaNumber || null, bankName || null, bankAccount || null,
      startDate, isActive === 'on', req.params.id, req.user.business_id
    ]
  );

  res.redirect(`/employees/${req.params.id}?success=updated`);
};

// POST /employees/:id/deactivate
const deactivateEmployee = async (req, res) => {
  await query(
    'UPDATE employees SET is_active = false, end_date = NOW()::DATE WHERE id = $1 AND business_id = $2',
    [req.params.id, req.user.business_id]
  );
  res.redirect('/employees?success=deactivated');
};

// GET /employees/departments
const listDepartments = async (req, res) => {
  const result = await query(
    `SELECT d.id, d.name, d.description,
            COUNT(e.id) FILTER (WHERE e.is_active) AS employee_count,
            SUM(e.salary) FILTER (WHERE e.is_active) AS total_salary
     FROM departments d
     LEFT JOIN employees e ON e.department_id = d.id
     WHERE d.business_id = $1
     GROUP BY d.id ORDER BY d.name`,
    [req.user.business_id]
  );

  res.render('pages/employees/departments', {
    title: 'Departments — LEDGR',
    departments: result.rows,
  });
};

module.exports = {
  listEmployees, showNewForm, createEmployee,
  showEmployee, showEditForm, updateEmployee,
  deactivateEmployee, listDepartments,
};
