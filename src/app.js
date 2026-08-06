require('dotenv').config();
const express = require('express');
const path = require('path');
const helmet = require('helmet');
const cors = require('cors');
const morgan = require('morgan');
const compression = require('compression');
const cookieParser = require('cookie-parser');
const rateLimit = require('express-rate-limit');

const routes = require('./routes');

const app = express();
const PORT = process.env.PORT || 3000;

// ============================================
// SECURITY
// ============================================

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", 'cdn.jsdelivr.net', 'cdnjs.cloudflare.com'],
      scriptSrcAttr: ["'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'", 'fonts.googleapis.com', 'cdnjs.cloudflare.com'],
      fontSrc: ["'self'", 'fonts.gstatic.com', 'cdnjs.cloudflare.com'],
      imgSrc: ["'self'", 'data:', 'https:'],
    },
  },
}));

app.use(cors({
  origin: process.env.APP_URL || 'http://localhost:3000',
  credentials: true,
}));

// Rate limiting
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 min
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { success: false, message: 'Too many attempts. Try again in 15 minutes.' },
});

app.use('/auth/login', authLimiter);
app.use('/auth/register', authLimiter);
app.use(generalLimiter);

// ============================================
// MIDDLEWARE
// ============================================

app.use(compression());
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(cookieParser(process.env.COOKIE_SECRET || 'ledgr-cookie-secret'));

// Static files (no cache in dev so changes are picked up immediately)
const staticMaxAge = process.env.NODE_ENV === 'production' ? '1d' : 0;
app.use(express.static(path.join(__dirname, 'public'), { maxAge: staticMaxAge }));

// ============================================
// TEMPLATE ENGINE
// ============================================

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Global template helpers
app.use((req, res, next) => {
  res.locals.formatCurrency = (amount, currency = 'KES') =>
    new Intl.NumberFormat('en-KE', { style: 'currency', currency, minimumFractionDigits: 0 }).format(amount || 0);

  res.locals.formatDate = (date) =>
    date ? new Date(date).toLocaleDateString('en-KE', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

  res.locals.formatNumber = (n) =>
    new Intl.NumberFormat('en-KE').format(n || 0);

  res.locals.currentPath = req.path;
  next();
});

// ============================================
// ROUTES
// ============================================

app.use('/', routes);

// ============================================
// GLOBAL ERROR HANDLER
// ============================================

app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  const status = err.status || 500;
  if (req.accepts('html')) {
    return res.status(status).render('pages/error', {
      title: 'Error — LEDGR',
      message: process.env.NODE_ENV === 'production' ? 'Something went wrong.' : err.message,
      code: status,
    });
  }
  res.status(status).json({ success: false, message: err.message || 'Internal server error' });
});

// ============================================
// START
// ============================================

app.listen(PORT, () => {
  console.log(`\n🟢 LEDGR running on http://localhost:${PORT}`);
  console.log(`   Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`   Run 'npm run migrate' to set up the database\n`);
});

module.exports = app;
