const { query } = require('../../config/database');
const bcrypt = require('bcryptjs');

const showSettings = async (req, res) => {
  const [business, users] = await Promise.all([
    query('SELECT * FROM businesses WHERE id = $1', [req.user.business_id]),
    query(
      'SELECT id, first_name, last_name, email, role, is_active, last_login FROM users WHERE business_id = $1 ORDER BY role, first_name',
      [req.user.business_id]
    ),
  ]);
  res.render('pages/settings/index', {
    title: 'Settings — LEDGR',
    business: business.rows[0],
    users: users.rows,
    success: req.query.success || null,
  });
};

const updateBusiness = async (req, res) => {
  const { name, type, kraPin, phone, address, currency, savingsRate, vatRate } = req.body;
  await query(
    `UPDATE businesses SET name=$1, type=$2, kra_pin=$3, phone=$4, address=$5,
     currency=$6, savings_rate=$7, vat_rate=$8 WHERE id=$9`,
    [name, type, kraPin || null, phone || null, address || null,
     currency || 'KES', parseFloat(savingsRate) || 10,
     parseFloat(vatRate) || 16, req.user.business_id]
  );
  res.redirect('/settings?success=business');
};

const inviteUser = async (req, res) => {
  const { firstName, lastName, email, role } = req.body;
  const { v4: uuidv4 } = require('uuid');
  const tempPassword = Math.random().toString(36).slice(-10);
  const hash = await bcrypt.hash(tempPassword, 12);
  try {
    await query(
      `INSERT INTO users (id, business_id, first_name, last_name, email, password_hash, role)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [uuidv4(), req.user.business_id, firstName, lastName, email, hash, role || 'user']
    );
    // Only log temp password in development
    if (process.env.NODE_ENV !== 'production') {
      console.log(`[INVITE] ${email} — temp password: ${tempPassword}`);
    }
    res.redirect('/settings?success=invited');
  } catch (err) {
    console.error('Invite error:', err.message);
    res.redirect('/settings?error=invite_failed');
  }
};

const toggleUser = async (req, res) => {
  await query(
    'UPDATE users SET is_active = NOT is_active WHERE id = $1 AND business_id = $2 AND id != $3',
    [req.params.id, req.user.business_id, req.user.id]
  );
  res.redirect('/settings?success=user');
};

const updatePassword = async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  if (!newPassword || newPassword.length < 8) {
    return res.redirect('/settings?error=password_too_short');
  }
  const result = await query('SELECT password_hash FROM users WHERE id = $1', [req.user.id]);
  if (!result.rows.length) {
    return res.redirect('/settings?error=user_not_found');
  }
  const valid = await bcrypt.compare(currentPassword, result.rows[0].password_hash);
  if (!valid) return res.redirect('/settings?error=wrong_password');
  const hash = await bcrypt.hash(newPassword, 12);
  await query('UPDATE users SET password_hash = $1 WHERE id = $2', [hash, req.user.id]);
  res.redirect('/settings?success=password');
};

module.exports = { showSettings, updateBusiness, inviteUser, toggleUser, updatePassword };
