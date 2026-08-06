const express = require('express');
const { body } = require('express-validator');
const { authenticate, authorize, optionalAuth } = require('../middleware/auth');

const authController     = require('../controllers/authController');
const dashboardController= require('../controllers/dashboardController');
const employeeController = require('../controllers/employeeController');
const incomeController   = require('../controllers/incomeController');
const expensesController = require('../controllers/expensesController');
const billingController  = require('../controllers/billingController');
const payrollController  = require('../controllers/payrollController');
const taxController      = require('../controllers/taxController');
const analyticsController= require('../controllers/analyticsController');
const savingsController  = require('../controllers/savingsController');
const statementsController=require('../controllers/statementsController');
const settingsController = require('../controllers/settingsController');
const forecastController = require('../controllers/forecastController');
const chatController = require('../controllers/chatController');

const router = express.Router();

// ── PUBLIC ───────────────────────────────────────────────────────────────────
router.get('/', optionalAuth, (req, res) => {
  res.render('pages/landing', {
    title: 'LEDGR — Retail Finance Management',
    loggedIn: !!req.user,
    user: req.user || null,
  });
});

// ── AUTH ─────────────────────────────────────────────────────────────────────
router.get('/auth/login', optionalAuth, authController.showLogin);
router.get('/auth/register', optionalAuth, authController.showRegister);
router.post('/auth/register', [
  body('firstName').trim().notEmpty().withMessage('First name required'),
  body('lastName').trim().notEmpty().withMessage('Last name required'),
  body('businessName').trim().notEmpty().withMessage('Business name required'),
  body('businessType').isIn(['boutique','supermarket','retail','other']).withMessage('Select a business type'),
  body('email').isEmail().normalizeEmail().withMessage('Valid email required'),
  body('password').isLength({ min: 8 }).withMessage('Password must be at least 8 characters'),
], authController.register);
router.post('/auth/login', [
  body('email').isEmail().normalizeEmail(),
  body('password').notEmpty(),
], authController.login);
router.post('/auth/logout', authController.logout);
router.get('/auth/logout', authController.logoutGet);   // allows typing /auth/logout in browser URL bar

// M-Pesa callback (public — called by Safaricom)
router.post('/billing/callback', billingController.mpesaCallback);

// ── Chatbot (Gemini) — public so it works on landing page ────────────────────
router.post('/api/chat', chatController.handleChat);

// ── PROTECTED ────────────────────────────────────────────────────────────────
router.use(authenticate);

// Dashboard
router.get('/dashboard', dashboardController.showDashboard);

// ── PART 1: Employees ────────────────────────────────────────────────────────
router.get('/employees', employeeController.listEmployees);
router.get('/employees/departments', authorize('admin','manager'), employeeController.listDepartments);
router.get('/employees/new', authorize('admin','manager'), employeeController.showNewForm);
router.post('/employees', authorize('admin','manager'), [
  body('firstName').trim().notEmpty().withMessage('First name required'),
  body('lastName').trim().notEmpty().withMessage('Last name required'),
  body('salary').isFloat({ min: 0 }).withMessage('Valid salary required'),
  body('startDate').isDate().withMessage('Valid start date required'),
], employeeController.createEmployee);
router.get('/employees/:id', employeeController.showEmployee);
router.get('/employees/:id/edit', authorize('admin','manager'), employeeController.showEditForm);
router.post('/employees/:id/update', authorize('admin','manager'), employeeController.updateEmployee);
router.post('/employees/:id/deactivate', authorize('admin'), employeeController.deactivateEmployee);

// ── PART 2: Income ───────────────────────────────────────────────────────────
router.get('/income', incomeController.listIncome);
router.get('/income/new', incomeController.showNewForm);
router.post('/income', [
  body('date').isDate().withMessage('Valid date required'),
  body('amount').isFloat({ min: 0.01 }).withMessage('Valid amount required'),
], incomeController.createIncome);
router.post('/income/:id/delete', authorize('admin','manager'), incomeController.deleteIncome);

// ── PART 2: Expenses ─────────────────────────────────────────────────────────
router.get('/expenses', expensesController.listExpenses);
router.get('/expenses/new', expensesController.showNewForm);
router.post('/expenses', [
  body('date').isDate().withMessage('Valid date required'),
  body('amount').isFloat({ min: 0.01 }).withMessage('Valid amount required'),
  body('description').trim().notEmpty().withMessage('Description required'),
], expensesController.createExpense);
router.post('/expenses/:id/delete', authorize('admin','manager'), expensesController.deleteExpense);

// ── PART 2: Billing ──────────────────────────────────────────────────────────
router.get('/billing', billingController.listBilling);
router.get('/billing/new', authorize('admin','manager'), billingController.showNewSchedule);
router.post('/billing', authorize('admin','manager'), billingController.createSchedule);
router.post('/billing/:id/trigger', authorize('admin'), billingController.triggerPayment);
router.post('/billing/:id/delete', authorize('admin'), billingController.deleteSchedule);

// ── PART 2: Payroll ──────────────────────────────────────────────────────────
router.get('/payroll', payrollController.listPayroll);
router.get('/payroll/new', authorize('admin','manager'), payrollController.showRunForm);
router.post('/payroll', authorize('admin','manager'), payrollController.createRun);
router.get('/payroll/:id', payrollController.showRun);
router.post('/payroll/:id/approve', authorize('admin'), payrollController.approveRun);

// ── PART 2: Tax ──────────────────────────────────────────────────────────────
router.get('/tax', taxController.listTax);
router.post('/tax', authorize('admin','manager'), taxController.createTaxRecord);
router.post('/tax/:id/paid', authorize('admin'), taxController.markPaid);

// ── PART 3: Analytics ────────────────────────────────────────────────────────
router.get('/analytics', analyticsController.showAnalytics);

// ── PART 3: Forecast (Predictive) ──────────────────────────────────────
router.get('/forecast', forecastController.showForecast);
router.get('/api/forecast', forecastController.apiForecast);

// ── PART 3: Savings ──────────────────────────────────────────────────────────
router.get('/savings', savingsController.listSavings);
router.post('/savings/compute', savingsController.computeAllocation);
router.post('/savings/:id/transfer', savingsController.markTransferred);

// ── PART 3: Statements & Search ──────────────────────────────────────────────
router.get('/statements', statementsController.listStatements);
router.get('/statements/pl', statementsController.downloadPL);
router.get('/statements/payroll/:id', statementsController.downloadPayslips);
router.get('/search', statementsController.search);

// ── PART 4: Settings ─────────────────────────────────────────────────────────
router.get('/settings', authorize('admin','manager'), settingsController.showSettings);
router.post('/settings/business', authorize('admin'), settingsController.updateBusiness);
router.post('/settings/invite', authorize('admin'), settingsController.inviteUser);
router.post('/settings/users/:id/toggle', authorize('admin'), settingsController.toggleUser);
router.post('/settings/password', settingsController.updatePassword);

// 404
router.use((req, res) =>
  res.status(404).render('pages/error', { title: '404 — LEDGR', message: 'Page not found.', code: 404 })
);

module.exports = router;
