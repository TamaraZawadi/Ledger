// LEDGR — Seed file for development demo data
// Run: npm run seed

require('dotenv').config();
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const { pool, query } = require('../config/database');

async function seed() {
  console.log('🌱 Seeding LEDGR demo data...');

  // 1. Business
  const bizId = uuidv4();
  await query(
    `INSERT INTO businesses (id, name, type, email, phone, kra_pin, currency, savings_rate, vat_rate)
     VALUES ($1, 'Wanjiku Boutique', 'boutique', 'admin@wanjiku.co.ke', '0722000001', 'A000111222B', 'KES', 10, 16)
     ON CONFLICT DO NOTHING`,
    [bizId]
  );

  // 2. Admin user
  const hash = await bcrypt.hash('password123', 12);
  const adminId = uuidv4();
  await query(
    `INSERT INTO users (id, business_id, first_name, last_name, email, password_hash, role)
     VALUES ($1, $2, 'Admin', 'User', 'admin@wanjiku.co.ke', $3, 'admin')
     ON CONFLICT DO NOTHING`,
    [adminId, bizId, hash]
  );

  // 3. Departments
  const depts = {};
  for (const name of ['Sales', 'Deliveries', 'Front Desk', 'Security', 'Management']) {
    const id = uuidv4();
    depts[name] = id;
    await query(
      `INSERT INTO departments (id, business_id, name) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`,
      [id, bizId, name]
    );
  }

  // 4. Expense categories
  const cats = {};
  const catList = [
    { name: 'Electricity', type: 'utility', recurring: true, day: 20 },
    { name: 'Water Supply', type: 'utility', recurring: true, day: 15 },
    { name: 'Wi-Fi / Internet', type: 'utility', recurring: true, day: 5 },
    { name: 'Office Equipment', type: 'maintenance', recurring: false, day: null },
    { name: 'Product Suppliers', type: 'supplier', recurring: false, day: null },
    { name: 'Employee Salaries', type: 'payroll', recurring: true, day: 25 },
  ];
  for (const c of catList) {
    const id = uuidv4();
    cats[c.name] = id;
    await query(
      `INSERT INTO expense_categories (id, business_id, name, type, is_recurring, billing_day)
       VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT DO NOTHING`,
      [id, bizId, c.name, c.type, c.recurring, c.day]
    );
  }

  // 5. Employees (8 across departments)
  const empData = [
    { fn: 'Faith', ln: 'Mwangi', dept: 'Sales', title: 'Sales Lead', salary: 42000, type: 'full_time', mpesa: '0711111001' },
    { fn: 'Brian', ln: 'Ochieng', dept: 'Sales', title: 'Cashier', salary: 28000, type: 'full_time', mpesa: '0711111002' },
    { fn: 'Grace', ln: 'Kamau', dept: 'Front Desk', title: 'Receptionist', salary: 30000, type: 'full_time', mpesa: '0711111003' },
    { fn: 'James', ln: 'Kiprotich', dept: 'Deliveries', title: 'Driver', salary: 25000, type: 'full_time', mpesa: '0711111004' },
    { fn: 'Lucy', ln: 'Njeri', dept: 'Deliveries', title: 'Delivery Assistant', salary: 22000, type: 'casual', mpesa: '0711111005' },
    { fn: 'Peter', ln: 'Karanja', dept: 'Security', title: 'Guard', salary: 20000, type: 'full_time', mpesa: '0711111006' },
    { fn: 'Alice', ln: 'Wambui', dept: 'Management', title: 'Manager', salary: 65000, type: 'full_time', mpesa: '0711111007' },
    { fn: 'David', ln: 'Mutua', dept: 'Security', title: 'Guard', salary: 20000, type: 'full_time', mpesa: '0711111008' },
  ];
  for (const e of empData) {
    await query(
      `INSERT INTO employees (id, business_id, department_id, first_name, last_name, role_title, employment_type, salary, payment_method, mpesa_number, start_date)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'mpesa',$9,'2024-01-01') ON CONFLICT DO NOTHING`,
      [uuidv4(), bizId, depts[e.dept], e.fn, e.ln, e.title, e.type, e.salary, e.mpesa]
    );
  }

  // 6. Income records — last 6 months
  const now = new Date();
  for (let mOffset = 5; mOffset >= 0; mOffset--) {
    const d = new Date(now.getFullYear(), now.getMonth() - mOffset, 1);
    const daysInMonth = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
    const baseAmount = 15000 + Math.random() * 8000;
    for (let day = 1; day <= daysInMonth; day += 1) {
      const amt = baseAmount + (Math.random() - 0.5) * 5000;
      const modes = ['cash', 'mpesa', 'card'];
      const mode = modes[Math.floor(Math.random() * modes.length)];
      const date = new Date(d.getFullYear(), d.getMonth(), day);
      if (date > now) break;
      await query(
        `INSERT INTO income_records (id, business_id, recorded_by, date, amount, source, description, payment_mode)
         VALUES ($1,$2,$3,$4,$5,'daily_sales','Daily boutique sales',$6) ON CONFLICT DO NOTHING`,
        [uuidv4(), bizId, adminId, date.toISOString().split('T')[0], Math.round(amt), mode]
      );
    }
  }

  // 7. Expenses — last 6 months
  const expenseTemplates = [
    { desc: 'Kenya Power bill', cat: 'Electricity', amounts: [8500, 9200, 7800, 8100, 9500, 8800] },
    { desc: 'Nairobi Water bill', cat: 'Water Supply', amounts: [3200, 3100, 3400, 3200, 3300, 3100] },
    { desc: 'Safaricom Fibre', cat: 'Wi-Fi / Internet', amounts: [5999, 5999, 5999, 5999, 5999, 5999] },
    { desc: 'Clothing supplier - Nairobi Wholesale', cat: 'Product Suppliers', amounts: [85000, 92000, 78000, 95000, 88000, 102000] },
    { desc: 'Office chair & desk repair', cat: 'Office Equipment', amounts: [12000, 0, 4500, 0, 8000, 0] },
  ];
  for (let mOffset = 5; mOffset >= 0; mOffset--) {
    const d = new Date(now.getFullYear(), now.getMonth() - mOffset, 10);
    for (const tmpl of expenseTemplates) {
      const amt = tmpl.amounts[5 - mOffset];
      if (!amt) continue;
      await query(
        `INSERT INTO expenses (id, business_id, category_id, recorded_by, date, amount, description, is_paid)
         VALUES ($1,$2,$3,$4,$5,$6,$7,true) ON CONFLICT DO NOTHING`,
        [uuidv4(), bizId, cats[tmpl.cat], adminId, d.toISOString().split('T')[0], amt, tmpl.desc]
      );
    }
  }

  // 8. Billing schedules
  const schedules = [
    { name: 'Kenya Power', category: 'electricity', amount: 8500, day: 20, payee: '522522', ref: 'Meter:001' },
    { name: 'Nairobi Water', category: 'water', amount: 3200, day: 15, payee: '602626', ref: 'Account:WB001' },
    { name: 'Safaricom Fibre', category: 'wifi', amount: 5999, day: 5, payee: '400200', ref: 'Account:SF001' },
  ];
  for (const s of schedules) {
    const next = new Date();
    next.setDate(s.day);
    if (next < new Date()) next.setMonth(next.getMonth() + 1);
    await query(
      `INSERT INTO billing_schedules (id, business_id, name, category, amount, billing_day, payment_method, payee_number, account_ref, next_due_date)
       VALUES ($1,$2,$3,$4,$5,$6,'mpesa',$7,$8,$9) ON CONFLICT DO NOTHING`,
      [uuidv4(), bizId, s.name, s.category, s.amount, s.day, s.payee, s.ref, next.toISOString().split('T')[0]]
    );
  }

  console.log('✅ Seed complete!');
  console.log('   Login: admin@wanjiku.co.ke / password123');
  await pool.end();
}

seed().catch(err => { console.error('❌ Seed error:', err); process.exit(1); });
