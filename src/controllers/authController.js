const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const { query, getClient } = require('../../config/database');
const { validationResult } = require('express-validator');

// Helper: create signed JWT
const signToken = (userId) =>
  jwt.sign({ id: userId }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  });

// Helper: set cookie
const setTokenCookie = (res, token) => {
  res.cookie('ledgr_token', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
  });
};

// GET /auth/login
const showLogin = (req, res) => {
  if (req.user) return res.redirect('/dashboard');
  res.render('pages/auth/login', {
    title: 'Sign In — LEDGR',
    error: req.query.error || null,
    expired: req.query.expired === '1',
    loggedout: req.query.loggedout === '1',
  });
};

// GET /auth/register
const showRegister = (req, res) => {
  if (req.user) return res.redirect('/dashboard');
  res.render('pages/auth/register', {
    title: 'Create Account — LEDGR',
    error: null,
  });
};

// POST /auth/register
const register = async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.render('pages/auth/register', {
      title: 'Create Account — LEDGR',
      error: errors.array()[0].msg,
      formData: req.body,
    });
  }

  const { businessName, businessType, businessEmail, firstName, lastName, email, password, phone } = req.body;
  const client = await getClient();

  try {
    await client.query('BEGIN');

    // Check if email already exists across all users
    const existingUser = await client.query('SELECT id FROM users WHERE email = $1', [email]);
    if (existingUser.rows.length) {
      await client.query('ROLLBACK');
      return res.render('pages/auth/register', {
        title: 'Create Account — LEDGR',
        error: 'An account with this email already exists.',
        formData: req.body,
      });
    }

    // Create business
    const businessResult = await client.query(
      `INSERT INTO businesses (id, name, type, email, phone) VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [uuidv4(), businessName, businessType, businessEmail || email, phone || null]
    );
    const businessId = businessResult.rows[0].id;

    // Create default departments
    const defaultDepts = ['Sales', 'Deliveries', 'Front Desk', 'Security', 'Management'];
    for (const dept of defaultDepts) {
      await client.query(
        `INSERT INTO departments (id, business_id, name) VALUES ($1, $2, $3)`,
        [uuidv4(), businessId, dept]
      );
    }

    // Create default expense categories
    const defaultCategories = [
      { name: 'Electricity', type: 'utility', recurring: true, day: 20 },
      { name: 'Water Supply', type: 'utility', recurring: true, day: 15 },
      { name: 'Wi-Fi / Internet', type: 'utility', recurring: true, day: 5 },
      { name: 'Office Equipment', type: 'maintenance', recurring: false, day: null },
      { name: 'Product Suppliers', type: 'supplier', recurring: false, day: null },
      { name: 'Employee Salaries', type: 'payroll', recurring: true, day: 25 },
    ];
    for (const cat of defaultCategories) {
      await client.query(
        `INSERT INTO expense_categories (id, business_id, name, type, is_recurring, billing_day)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [uuidv4(), businessId, cat.name, cat.type, cat.recurring, cat.day]
      );
    }

    // Hash password and create admin user
    const hash = await bcrypt.hash(password, 12);
    const userResult = await client.query(
      `INSERT INTO users (id, business_id, first_name, last_name, email, password_hash, role)
       VALUES ($1, $2, $3, $4, $5, $6, 'admin') RETURNING id`,
      [uuidv4(), businessId, firstName, lastName, email, hash]
    );

    await client.query('COMMIT');

    const token = signToken(userResult.rows[0].id);
    setTokenCookie(res, token);
    res.redirect('/dashboard?welcome=1');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Register error:', err);
    res.render('pages/auth/register', {
      title: 'Create Account — LEDGR',
      error: 'Something went wrong. Please try again.',
      formData: req.body,
    });
  } finally {
    client.release();
  }
};

// POST /auth/login
const login = async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.render('pages/auth/login', {
      title: 'Sign In — LEDGR',
      error: errors.array()[0].msg,
      expired: false,
    });
  }

  const { email, password } = req.body;

  try {
    const result = await query(
      `SELECT u.id, u.password_hash, u.is_active, u.first_name, u.role, b.name AS business_name
       FROM users u JOIN businesses b ON b.id = u.business_id
       WHERE u.email = $1`,
      [email]
    );

    if (!result.rows.length) {
      return res.render('pages/auth/login', {
        title: 'Sign In — LEDGR',
        error: 'Invalid email or password',
      expired: false,
      });
    }

    const user = result.rows[0];
    if (!user.is_active) {
      return res.render('pages/auth/login', {
        title: 'Sign In — LEDGR',
        error: 'Your account has been deactivated. Contact your administrator.',
      expired: false,
      });
    }

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      return res.render('pages/auth/login', {
        title: 'Sign In — LEDGR',
        error: 'Invalid email or password',
      expired: false,
      });
    }

    // Update last login
    await query('UPDATE users SET last_login = NOW() WHERE id = $1', [user.id]);

    const token = signToken(user.id);
    setTokenCookie(res, token);
    res.redirect('/dashboard');
  } catch (err) {
    console.error('Login error:', err);
    res.render('pages/auth/login', {
      title: 'Sign In — LEDGR',
      error: 'Server error. Please try again.',
      expired: false,
    });
  }
};

// POST /auth/logout  (form submission from sidebar/settings)
const logout = (req, res) => {
  res.clearCookie('ledgr_token', { httpOnly: true, sameSite: 'lax' });
  res.redirect('/auth/login?loggedout=1');
};

// GET /auth/logout  (direct URL access — so typing /auth/logout in browser works too)
const logoutGet = (req, res) => {
  res.clearCookie('ledgr_token', { httpOnly: true, sameSite: 'lax' });
  res.redirect('/auth/login?loggedout=1');
};

module.exports = { showLogin, showRegister, register, login, logout, logoutGet };
