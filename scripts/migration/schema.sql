-- ====================================================================
-- CHIT FUND MANAGER - PRODUCTION POSTGRESQL / CLOUD SQL SCHEMA
-- Target Database: PostgreSQL 14+ / Google Cloud SQL
-- Character set: UTF8
-- ====================================================================

-- 1. USERS & CREDENTIALS
CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    salt TEXT NOT NULL,
    name TEXT NOT NULL,
    role TEXT DEFAULT 'admin',
    created_at TIMESTAMPTZ NOT NULL,
    login_id TEXT,
    recovery_email TEXT,
    recovery_phone TEXT,
    is_active INTEGER DEFAULT 1,
    failed_login_attempts INTEGER DEFAULT 0,
    locked_until TIMESTAMPTZ,
    updated_at TIMESTAMPTZ,
    last_login_at TIMESTAMPTZ,
    password_changed_at TIMESTAMPTZ,
    security_question TEXT,
    security_answer_hash TEXT,
    failed_recovery_attempts INTEGER DEFAULT 0,
    recovery_locked_until TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_users_login_id ON users(login_id);

-- 2. CHITS
CREATE TABLE IF NOT EXISTS chits (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    chit_value NUMERIC(15,2) NOT NULL,
    total_months INTEGER NOT NULL,
    total_members INTEGER NOT NULL,
    start_month TEXT NOT NULL,
    end_month TEXT NOT NULL,
    status TEXT DEFAULT 'active',
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL,
    current_month INTEGER DEFAULT 1,
    monthly_chit_value NUMERIC(15,2) DEFAULT 301500
);

-- 3. CHIT MONTH RULES
CREATE TABLE IF NOT EXISTS chit_month_rules (
    id TEXT PRIMARY KEY,
    chit_id TEXT NOT NULL REFERENCES chits(id) ON DELETE CASCADE,
    month_number INTEGER NOT NULL,
    month_name TEXT NOT NULL,
    pre_lift_payment NUMERIC(15,2) NOT NULL,
    post_lift_payment NUMERIC(15,2) NOT NULL,
    monthly_chit_value NUMERIC(15,2) NOT NULL,
    expected_lift_payout NUMERIC(15,2) NOT NULL,
    UNIQUE(chit_id, month_number)
);

CREATE INDEX IF NOT EXISTS idx_month_rules_chit_id ON chit_month_rules(chit_id);

-- 4. MEMBERS
CREATE TABLE IF NOT EXISTS members (
    id TEXT PRIMARY KEY,
    chit_id TEXT NOT NULL REFERENCES chits(id) ON DELETE CASCADE,
    customer_name TEXT NOT NULL,
    phone TEXT NOT NULL,
    ticket_number TEXT,
    status TEXT DEFAULT 'active',
    join_date TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_members_chit_id ON members(chit_id);
CREATE INDEX IF NOT EXISTS idx_members_phone ON members(phone);

-- 5. LIFT DETAILS
CREATE TABLE IF NOT EXISTS lift_details (
    id TEXT PRIMARY KEY,
    chit_id TEXT NOT NULL REFERENCES chits(id) ON DELETE CASCADE,
    member_id TEXT NOT NULL UNIQUE REFERENCES members(id) ON DELETE CASCADE,
    lift_month INTEGER NOT NULL,
    lift_amount_received NUMERIC(15,2) NOT NULL,
    lift_date TEXT NOT NULL,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL,
    status TEXT DEFAULT 'Completed',
    payment_method TEXT DEFAULT 'Cash',
    reference_number TEXT,
    updated_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_lift_details_chit_id ON lift_details(chit_id);

-- 6. MONTHLY DUES
CREATE TABLE IF NOT EXISTS monthly_dues (
    id TEXT PRIMARY KEY,
    chit_id TEXT NOT NULL REFERENCES chits(id) ON DELETE CASCADE,
    member_id TEXT NOT NULL REFERENCES members(id) ON DELETE CASCADE,
    month_number INTEGER NOT NULL,
    month_name TEXT NOT NULL,
    due_amount NUMERIC(15,2) NOT NULL,
    paid_amount NUMERIC(15,2) NOT NULL DEFAULT 0,
    balance_amount NUMERIC(15,2) NOT NULL,
    status TEXT NOT NULL DEFAULT 'PENDING',
    due_date TEXT NOT NULL,
    generated_at TIMESTAMPTZ NOT NULL,
    UNIQUE(chit_id, member_id, month_number)
);

CREATE INDEX IF NOT EXISTS idx_monthly_dues_chit ON monthly_dues(chit_id);
CREATE INDEX IF NOT EXISTS idx_monthly_dues_member ON monthly_dues(member_id);
CREATE INDEX IF NOT EXISTS idx_monthly_dues_status ON monthly_dues(status);

-- 7. PAYMENTS
CREATE TABLE IF NOT EXISTS payments (
    id TEXT PRIMARY KEY,
    monthly_due_id TEXT REFERENCES monthly_dues(id) ON DELETE CASCADE,
    chit_id TEXT NOT NULL REFERENCES chits(id) ON DELETE CASCADE,
    member_id TEXT NOT NULL REFERENCES members(id) ON DELETE CASCADE,
    month_number INTEGER NOT NULL,
    month_name TEXT NOT NULL,
    amount NUMERIC(15,2) NOT NULL,
    payment_method TEXT NOT NULL,
    reference_no TEXT,
    notes TEXT,
    payment_date TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_payments_chit ON payments(chit_id);
CREATE INDEX IF NOT EXISTS idx_payments_member ON payments(member_id);
CREATE INDEX IF NOT EXISTS idx_payments_due ON payments(monthly_due_id);

-- 8. SESSIONS
CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    session_token_hash TEXT UNIQUE NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL,
    last_used_at TIMESTAMPTZ NOT NULL,
    ip_address TEXT,
    user_agent TEXT
);

CREATE INDEX IF NOT EXISTS idx_sessions_hash ON sessions(session_token_hash);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);

-- 9. PASSWORD RESETS
CREATE TABLE IF NOT EXISTS password_resets (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    recovery_code TEXT NOT NULL,
    reset_token TEXT UNIQUE NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    used INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_password_resets_token ON password_resets(reset_token);
