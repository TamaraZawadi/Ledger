const jwt = require('jsonwebtoken');
const { query } = require('../../config/database');

// Verify JWT from cookie or Authorization header
const authenticate = async (req, res, next) => {
  try {
    let token = req.cookies?.ledgr_token;

    if (!token && req.headers.authorization?.startsWith('Bearer ')) {
      token = req.headers.authorization.split(' ')[1];
    }

    if (!token) {
      if (req.accepts('html')) return res.redirect('/auth/login');
      return res.status(401).json({ success: false, message: 'Authentication required' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    const result = await query(
      `SELECT u.id, u.business_id, u.first_name, u.last_name, u.email, u.role, u.is_active,
              b.name AS business_name, b.type AS business_type, b.currency, b.logo_url,
              b.savings_rate, b.vat_rate
       FROM users u
       JOIN businesses b ON b.id = u.business_id
       WHERE u.id = $1 AND u.is_active = true`,
      [decoded.id]
    );

    if (!result.rows.length) {
      if (req.accepts('html')) return res.redirect('/auth/login');
      return res.status(401).json({ success: false, message: 'User not found or inactive' });
    }

    req.user = result.rows[0];
    // Make user available to all EJS templates
    res.locals.user = req.user;
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      res.clearCookie('ledgr_token');
      if (req.accepts('html')) return res.redirect('/auth/login?expired=1');
      return res.status(401).json({ success: false, message: 'Token expired' });
    }
    if (req.accepts('html')) return res.redirect('/auth/login');
    return res.status(401).json({ success: false, message: 'Invalid token' });
  }
};

// Role-based authorization factory
const authorize = (...roles) => (req, res, next) => {
  if (!req.user) return res.status(401).json({ success: false, message: 'Not authenticated' });
  if (!roles.includes(req.user.role)) {
    if (req.accepts('html')) {
      return res.status(403).render('pages/error', {
        title: 'Access Denied',
        message: 'You don\'t have permission to access this page.',
        code: 403
      });
    }
    return res.status(403).json({ success: false, message: 'Insufficient permissions' });
  }
  next();
};

// Optional auth — attach user if token exists, don't block if not
const optionalAuth = async (req, res, next) => {
  try {
    const token = req.cookies?.ledgr_token;
    if (token) {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const result = await query(
        'SELECT u.id, u.business_id, u.first_name, u.last_name, u.role, b.name AS business_name FROM users u JOIN businesses b ON b.id = u.business_id WHERE u.id = $1 AND u.is_active = true',
        [decoded.id]
      );
      if (result.rows.length) {
        req.user = result.rows[0];
        res.locals.user = req.user;
      }
    }
  } catch (_) { /* silent */ }
  next();
};

module.exports = { authenticate, authorize, optionalAuth };
