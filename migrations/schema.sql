-- ============================================
-- LEDGR Database Schema
-- Run: psql -U postgres -d ledgr_db -f schema.sql
-- ============================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================
-- USERS & ACCESS CONTROL (Part 1)
-- ============================================

CREATE TABLE IF NOT EXISTS businesses (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(200) NOT NULL,
  type VARCHAR(50) NOT NULL CHECK (type IN ('boutique', 'supermarket', 'retail', 'other')),
  kra_pin VARCHAR(20),
  phone VARCHAR(20),
  email VARCHAR(150) UNIQUE NOT NULL,
  address TEXT,
  logo_url VARCHAR(500),
  currency VARCHAR(10) DEFAULT 'KES',
  timezone VARCHAR(50) DEFAULT 'Africa/Nairobi',
  savings_rate DECIMAL(5,2) DEFAULT 10.00,
  vat_rate DECIMAL(5,2) DEFAULT 16.00,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  first_name VARCHAR(100) NOT NULL,
  last_name VARCHAR(100) NOT NULL,
  email VARCHAR(150) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  role VARCHAR(20) NOT NULL DEFAULT 'user' CHECK (role IN ('admin', 'manager', 'accountant', 'user')),
  is_active BOOLEAN DEFAULT true,
  avatar_url VARCHAR(500),
  last_login TIMESTAMPTZ,
  password_reset_token VARCHAR(255),
  password_reset_expires TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(business_id, email)
);

CREATE TABLE IF NOT EXISTS user_permissions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  permission VARCHAR(50) NOT NULL,
  -- e.g. 'view_analytics', 'edit_income', 'manage_employees', 'view_statements', 'manage_billing'
  granted_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, permission)
);

-- ============================================
-- DEPARTMENTS & EMPLOYEES (Part 1)
-- ============================================

CREATE TABLE IF NOT EXISTS departments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  name VARCHAR(100) NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS employees (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  department_id UUID REFERENCES departments(id) ON DELETE SET NULL,
  first_name VARCHAR(100) NOT NULL,
  last_name VARCHAR(100) NOT NULL,
  employee_number VARCHAR(50),
  id_number VARCHAR(50),
  phone VARCHAR(20),
  email VARCHAR(150),
  role_title VARCHAR(100),
  employment_type VARCHAR(20) DEFAULT 'full_time' CHECK (employment_type IN ('full_time', 'part_time', 'contract', 'casual')),
  salary DECIMAL(14,2) NOT NULL DEFAULT 0,
  payment_method VARCHAR(20) DEFAULT 'mpesa' CHECK (payment_method IN ('mpesa', 'bank', 'cash')),
  mpesa_number VARCHAR(20),
  bank_name VARCHAR(100),
  bank_account VARCHAR(50),
  start_date DATE NOT NULL,
  end_date DATE,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- INCOME (Part 2)
-- ============================================

CREATE TABLE IF NOT EXISTS income_records (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  recorded_by UUID REFERENCES users(id),
  date DATE NOT NULL,
  amount DECIMAL(14,2) NOT NULL,
  source VARCHAR(100) DEFAULT 'daily_sales',
  description TEXT,
  payment_mode VARCHAR(30) DEFAULT 'cash' CHECK (payment_mode IN ('cash', 'mpesa', 'card', 'bank_transfer', 'cheque')),
  mpesa_ref VARCHAR(100),
  receipt_url VARCHAR(500),
  is_verified BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- EXPENSES (Part 2)
-- ============================================

CREATE TABLE IF NOT EXISTS expense_categories (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  name VARCHAR(100) NOT NULL,
  type VARCHAR(30) NOT NULL CHECK (type IN ('utility', 'maintenance', 'supplier', 'payroll', 'tax', 'other')),
  is_recurring BOOLEAN DEFAULT false,
  billing_day INTEGER CHECK (billing_day BETWEEN 1 AND 28),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS expenses (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  category_id UUID REFERENCES expense_categories(id) ON DELETE SET NULL,
  recorded_by UUID REFERENCES users(id),
  date DATE NOT NULL,
  amount DECIMAL(14,2) NOT NULL,
  description VARCHAR(500) NOT NULL,
  vendor VARCHAR(200),
  payment_method VARCHAR(30) DEFAULT 'cash',
  mpesa_ref VARCHAR(100),
  receipt_url VARCHAR(500),
  is_paid BOOLEAN DEFAULT false,
  paid_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- BILLING / AUTOMATED PAYMENTS (Part 2)
-- ============================================

CREATE TABLE IF NOT EXISTS billing_schedules (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  name VARCHAR(150) NOT NULL,
  category VARCHAR(50) NOT NULL CHECK (category IN ('electricity', 'water', 'wifi', 'rent', 'supplier', 'other')),
  amount DECIMAL(14,2) NOT NULL,
  currency VARCHAR(10) DEFAULT 'KES',
  billing_day INTEGER NOT NULL CHECK (billing_day BETWEEN 1 AND 28),
  payment_method VARCHAR(30) DEFAULT 'mpesa',
  payee_number VARCHAR(50),
  account_ref VARCHAR(100),
  is_active BOOLEAN DEFAULT true,
  last_paid_at TIMESTAMPTZ,
  next_due_date DATE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS billing_transactions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  schedule_id UUID REFERENCES billing_schedules(id) ON DELETE SET NULL,
  amount DECIMAL(14,2) NOT NULL,
  status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  mpesa_ref VARCHAR(100),
  mpesa_checkout_id VARCHAR(200),
  initiated_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  error_message TEXT,
  metadata JSONB DEFAULT '{}'
);

-- ============================================
-- PAYROLL (Part 2 + 3)
-- ============================================

CREATE TABLE IF NOT EXISTS payroll_runs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  run_by UUID REFERENCES users(id),
  period_month INTEGER NOT NULL CHECK (period_month BETWEEN 1 AND 12),
  period_year INTEGER NOT NULL,
  total_gross DECIMAL(14,2) DEFAULT 0,
  total_paye DECIMAL(14,2) DEFAULT 0,
  total_nhif DECIMAL(14,2) DEFAULT 0,
  total_nssf DECIMAL(14,2) DEFAULT 0,
  total_net DECIMAL(14,2) DEFAULT 0,
  status VARCHAR(20) DEFAULT 'draft' CHECK (status IN ('draft', 'approved', 'paid', 'cancelled')),
  approved_by UUID REFERENCES users(id),
  approved_at TIMESTAMPTZ,
  paid_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS payroll_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  payroll_run_id UUID NOT NULL REFERENCES payroll_runs(id) ON DELETE CASCADE,
  employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  gross_salary DECIMAL(14,2) NOT NULL,
  paye DECIMAL(14,2) DEFAULT 0,
  nhif DECIMAL(14,2) DEFAULT 0,
  nssf DECIMAL(14,2) DEFAULT 0,
  other_deductions DECIMAL(14,2) DEFAULT 0,
  net_salary DECIMAL(14,2) NOT NULL,
  payment_status VARCHAR(20) DEFAULT 'pending' CHECK (payment_status IN ('pending', 'processing', 'paid', 'failed')),
  mpesa_ref VARCHAR(100),
  paid_at TIMESTAMPTZ
);

-- ============================================
-- TAX (Part 2)
-- ============================================

CREATE TABLE IF NOT EXISTS tax_records (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  tax_type VARCHAR(50) NOT NULL CHECK (tax_type IN ('vat', 'corporate', 'paye', 'withholding', 'other')),
  period_month INTEGER CHECK (period_month BETWEEN 1 AND 12),
  period_year INTEGER NOT NULL,
  gross_amount DECIMAL(14,2) NOT NULL,
  tax_amount DECIMAL(14,2) NOT NULL,
  due_date DATE,
  paid_date DATE,
  is_paid BOOLEAN DEFAULT false,
  kra_return_ref VARCHAR(100),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- SAVINGS (Part 3)
-- ============================================

CREATE TABLE IF NOT EXISTS savings_allocations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  period_month INTEGER NOT NULL CHECK (period_month BETWEEN 1 AND 12),
  period_year INTEGER NOT NULL,
  net_income DECIMAL(14,2) NOT NULL,
  savings_rate DECIMAL(5,2) NOT NULL,
  amount DECIMAL(14,2) NOT NULL,
  status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'transferred', 'held')),
  account_reference VARCHAR(200),
  transferred_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(business_id, period_month, period_year)
);

-- ============================================
-- AUDIT LOG
-- ============================================

CREATE TABLE IF NOT EXISTS audit_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  business_id UUID REFERENCES businesses(id) ON DELETE SET NULL,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  action VARCHAR(100) NOT NULL,
  entity_type VARCHAR(50),
  entity_id UUID,
  old_values JSONB,
  new_values JSONB,
  ip_address INET,
  user_agent TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- INDEXES FOR PERFORMANCE
-- ============================================

CREATE INDEX IF NOT EXISTS idx_users_business ON users(business_id);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_employees_business ON employees(business_id);
CREATE INDEX IF NOT EXISTS idx_employees_department ON employees(department_id);
CREATE INDEX IF NOT EXISTS idx_income_business_date ON income_records(business_id, date);
CREATE INDEX IF NOT EXISTS idx_expenses_business_date ON expenses(business_id, date);
CREATE INDEX IF NOT EXISTS idx_billing_business ON billing_schedules(business_id);
CREATE INDEX IF NOT EXISTS idx_payroll_runs_business ON payroll_runs(business_id);
CREATE INDEX IF NOT EXISTS idx_audit_business ON audit_logs(business_id, created_at DESC);

-- ============================================
-- UPDATED_AT TRIGGER
-- ============================================

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['businesses','users','employees','income_records','expenses'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_updated_at_%s ON %s', t, t);
    EXECUTE format('CREATE TRIGGER trg_updated_at_%s BEFORE UPDATE ON %s FOR EACH ROW EXECUTE FUNCTION update_updated_at()', t, t);
  END LOOP;
END;
$$ LANGUAGE plpgsql;
