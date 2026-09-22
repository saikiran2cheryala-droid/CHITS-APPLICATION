import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';

const DATA_DIR = path.join(process.cwd(), 'data');
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const DB_PATH = path.join(DATA_DIR, 'chit_manager.db');
export const db = new Database(DB_PATH);

// Enable WAL mode & foreign keys
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

export function hashPassword(plainText: string, salt?: string) {
  const actualSalt = salt || crypto.randomBytes(16).toString('hex');
  const hash = crypto.pbkdf2Sync(plainText, actualSalt, 100000, 64, 'sha512').toString('hex');
  return { hash, salt: actualSalt };
}

export function verifyPassword(plainText: string, storedHash: string, salt: string): boolean {
  try {
    // 1. Try modern 100,000 iterations
    const hash = crypto.pbkdf2Sync(plainText, salt, 100000, 64, 'sha512').toString('hex');
    const hashBuf = Buffer.from(hash, 'hex');
    const storedBuf = Buffer.from(storedHash, 'hex');
    if (hashBuf.length === storedBuf.length && crypto.timingSafeEqual(hashBuf, storedBuf)) {
      return true;
    }
    // 2. Fallback check for legacy 10,000 iterations
    const legacyHash = crypto.pbkdf2Sync(plainText, salt, 10000, 64, 'sha512').toString('hex');
    const legacyBuf = Buffer.from(legacyHash, 'hex');
    if (legacyBuf.length === storedBuf.length && crypto.timingSafeEqual(legacyBuf, storedBuf)) {
      return true;
    }
    return false;
  } catch (_) {
    return false;
  }
}

export function hashSecurityAnswer(answer: string): string {
  const normalized = answer.trim().toLowerCase().replace(/\s+/g, ' ');
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.pbkdf2Sync(normalized, salt, 10000, 64, 'sha512').toString('hex');
  return `${salt}:${hash}`;
}

export function verifySecurityAnswer(answer: string, storedCombinedHash: string): boolean {
  try {
    if (!storedCombinedHash || !storedCombinedHash.includes(':')) return false;
    const [salt, storedHash] = storedCombinedHash.split(':');
    const normalized = answer.trim().toLowerCase().replace(/\s+/g, ' ');
    const hash = crypto.pbkdf2Sync(normalized, salt, 10000, 64, 'sha512').toString('hex');
    const hashBuf = Buffer.from(hash, 'hex');
    const storedBuf = Buffer.from(storedHash, 'hex');
    if (hashBuf.length !== storedBuf.length) return false;
    return crypto.timingSafeEqual(hashBuf, storedBuf);
  } catch (_) {
    return false;
  }
}

export function validatePasswordStrength(password: string): { isValid: boolean; error?: string } {
  if (!password || password.length < 8) {
    return { isValid: false, error: 'Password must be at least 8 characters long.' };
  }
  if (!/[A-Z]/.test(password)) {
    return { isValid: false, error: 'Password must contain at least one uppercase letter (A-Z).' };
  }
  if (!/[a-z]/.test(password)) {
    return { isValid: false, error: 'Password must contain at least one lowercase letter (a-z).' };
  }
  if (!/[0-9]/.test(password)) {
    return { isValid: false, error: 'Password must contain at least one number (0-9).' };
  }
  if (!/[!@#$%^&*(),.?":{}|<>\-_=+]/.test(password)) {
    return { isValid: false, error: 'Password must contain at least one special character (!@#$%^&*...).' };
  }
  return { isValid: true };
}

export function getPasswordExpirationDate(changedAtStr: string): Date {
  const date = new Date(changedAtStr);
  const year = date.getFullYear();
  const month = date.getMonth();
  const day = date.getDate();
  const targetMonth = month + 3;
  const expires = new Date(date.getTime());
  expires.setFullYear(year, targetMonth, day);
  // If the target month has fewer days than 'day' (e.g. Nov 31 -> Dec 1), clamp to last day of target month
  if (expires.getMonth() !== ((targetMonth % 12) + 12) % 12) {
    expires.setDate(0);
  }
  return expires;
}

export function isPasswordExpired(changedAtStr?: string | null): boolean {
  if (!changedAtStr) return false;
  const expiresAt = getPasswordExpirationDate(changedAtStr);
  return Date.now() > expiresAt.getTime();
}

export function hashToken(token: string) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export function sanitizeUser(user: any) {
  if (!user) return null;
  const changedAt = user.password_changed_at || user.created_at;
  const expiresAt = changedAt ? getPasswordExpirationDate(changedAt).toISOString() : null;
  const expired = isPasswordExpired(changedAt);

  return {
    id: user.id,
    login_id: user.login_id || user.username,
    username: user.username,
    name: user.name,
    role: user.role || 'admin',
    recovery_email: user.recovery_email || '',
    recovery_phone: user.recovery_phone || '',
    is_active: user.is_active !== 0,
    password_changed_at: user.password_changed_at || null,
    password_expires_at: expiresAt,
    is_password_expired: expired,
    security_question: user.security_question || 'What is your primary contact number?',
    created_at: user.created_at,
    updated_at: user.updated_at || user.created_at,
    last_login_at: user.last_login_at || null,
  };
}

export function initDatabase() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      login_id TEXT UNIQUE,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      salt TEXT NOT NULL,
      name TEXT NOT NULL,
      role TEXT DEFAULT 'admin',
      recovery_email TEXT,
      recovery_phone TEXT,
      is_active INTEGER DEFAULT 1,
      failed_login_attempts INTEGER DEFAULT 0,
      locked_until TEXT,
      password_changed_at TEXT,
      security_question TEXT,
      security_answer_hash TEXT,
      failed_recovery_attempts INTEGER DEFAULT 0,
      recovery_locked_until TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT,
      last_login_at TEXT
    );

    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      session_token_hash TEXT UNIQUE NOT NULL,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL,
      last_used_at TEXT NOT NULL,
      ip_address TEXT,
      user_agent TEXT,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS password_resets (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      recovery_code TEXT NOT NULL,
      reset_token TEXT UNIQUE NOT NULL,
      expires_at TEXT NOT NULL,
      used INTEGER DEFAULT 0,
      created_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS chits (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      chit_value REAL NOT NULL,
      total_months INTEGER NOT NULL,
      total_members INTEGER NOT NULL,
      start_month TEXT NOT NULL,
      end_month TEXT NOT NULL,
      status TEXT DEFAULT 'active',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS chit_month_rules (
      id TEXT PRIMARY KEY,
      chit_id TEXT NOT NULL,
      month_number INTEGER NOT NULL,
      month_name TEXT NOT NULL,
      pre_lift_payment REAL NOT NULL,
      post_lift_payment REAL NOT NULL,
      monthly_chit_value REAL NOT NULL,
      expected_lift_payout REAL NOT NULL,
      FOREIGN KEY (chit_id) REFERENCES chits(id) ON DELETE CASCADE,
      UNIQUE(chit_id, month_number)
    );

    CREATE TABLE IF NOT EXISTS members (
      id TEXT PRIMARY KEY,
      chit_id TEXT NOT NULL,
      customer_name TEXT NOT NULL,
      phone TEXT NOT NULL,
      ticket_number TEXT,
      status TEXT DEFAULT 'active',
      join_date TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (chit_id) REFERENCES chits(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS lift_details (
      id TEXT PRIMARY KEY,
      chit_id TEXT NOT NULL,
      member_id TEXT NOT NULL UNIQUE,
      lift_month INTEGER NOT NULL,
      lift_amount_received REAL NOT NULL,
      lift_date TEXT NOT NULL,
      payment_method TEXT DEFAULT 'Cash',
      reference_number TEXT,
      notes TEXT,
      status TEXT DEFAULT 'Completed',
      created_at TEXT NOT NULL,
      updated_at TEXT,
      FOREIGN KEY (chit_id) REFERENCES chits(id) ON DELETE CASCADE,
      FOREIGN KEY (member_id) REFERENCES members(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS monthly_dues (
      id TEXT PRIMARY KEY,
      chit_id TEXT NOT NULL,
      member_id TEXT NOT NULL,
      month_number INTEGER NOT NULL,
      month_name TEXT NOT NULL,
      due_amount REAL NOT NULL,
      paid_amount REAL NOT NULL DEFAULT 0,
      balance_amount REAL NOT NULL,
      status TEXT NOT NULL DEFAULT 'PENDING',
      due_date TEXT NOT NULL,
      generated_at TEXT NOT NULL,
      FOREIGN KEY (chit_id) REFERENCES chits(id) ON DELETE CASCADE,
      FOREIGN KEY (member_id) REFERENCES members(id) ON DELETE CASCADE,
      UNIQUE(chit_id, member_id, month_number)
    );

    CREATE TABLE IF NOT EXISTS payments (
      id TEXT PRIMARY KEY,
      monthly_due_id TEXT NOT NULL,
      chit_id TEXT NOT NULL,
      member_id TEXT NOT NULL,
      month_number INTEGER NOT NULL,
      month_name TEXT NOT NULL,
      amount REAL NOT NULL,
      payment_method TEXT NOT NULL,
      reference_no TEXT,
      notes TEXT,
      payment_date TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (monthly_due_id) REFERENCES monthly_dues(id) ON DELETE CASCADE,
      FOREIGN KEY (chit_id) REFERENCES chits(id) ON DELETE CASCADE,
      FOREIGN KEY (member_id) REFERENCES members(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_monthly_dues_lookup ON monthly_dues (chit_id, month_number);
    CREATE INDEX IF NOT EXISTS idx_payments_chit ON payments (chit_id, month_number);
    CREATE INDEX IF NOT EXISTS idx_members_chit ON members (chit_id);
    CREATE INDEX IF NOT EXISTS idx_rules_chit ON chit_month_rules (chit_id);
    CREATE INDEX IF NOT EXISTS idx_sessions_token ON sessions (session_token_hash);
  `);

  // Safe columns migration for users table if columns are missing
  try {
    const tableInfo = db.prepare("PRAGMA table_info(users)").all() as any[];
    const colNames = tableInfo.map(col => col.name);
    if (!colNames.includes('login_id')) {
      db.exec("ALTER TABLE users ADD COLUMN login_id TEXT");
      db.exec("UPDATE users SET login_id = username WHERE login_id IS NULL");
    }
    if (!colNames.includes('recovery_email')) {
      db.exec("ALTER TABLE users ADD COLUMN recovery_email TEXT");
    }
    if (!colNames.includes('recovery_phone')) {
      db.exec("ALTER TABLE users ADD COLUMN recovery_phone TEXT");
    }
    if (!colNames.includes('is_active')) {
      db.exec("ALTER TABLE users ADD COLUMN is_active INTEGER DEFAULT 1");
    }
    if (!colNames.includes('failed_login_attempts')) {
      db.exec("ALTER TABLE users ADD COLUMN failed_login_attempts INTEGER DEFAULT 0");
    }
    if (!colNames.includes('locked_until')) {
      db.exec("ALTER TABLE users ADD COLUMN locked_until TEXT");
    }
    if (!colNames.includes('updated_at')) {
      db.exec("ALTER TABLE users ADD COLUMN updated_at TEXT");
    }
    if (!colNames.includes('last_login_at')) {
      db.exec("ALTER TABLE users ADD COLUMN last_login_at TEXT");
    }

    // Safe migration for lift_details (status, payment_method, reference_number, updated_at and unique index)
    const liftInfo = db.prepare("PRAGMA table_info(lift_details)").all() as any[];
    const liftCols = liftInfo.map(col => col.name);
    if (!liftCols.includes('status')) {
      db.exec("ALTER TABLE lift_details ADD COLUMN status TEXT DEFAULT 'Completed'");
    }
    if (!liftCols.includes('payment_method')) {
      db.exec("ALTER TABLE lift_details ADD COLUMN payment_method TEXT DEFAULT 'Cash'");
    }
    if (!liftCols.includes('reference_number')) {
      db.exec("ALTER TABLE lift_details ADD COLUMN reference_number TEXT");
    }
    if (!liftCols.includes('updated_at')) {
      db.exec("ALTER TABLE lift_details ADD COLUMN updated_at TEXT");
    }
    db.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_lift_chit_month ON lift_details(chit_id, lift_month)");

    // Safe migration for chits (current_month and monthly_chit_value)
    const chitInfo = db.prepare("PRAGMA table_info(chits)").all() as any[];
    const chitCols = chitInfo.map(col => col.name);
    if (!chitCols.includes('current_month')) {
      db.exec("ALTER TABLE chits ADD COLUMN current_month INTEGER DEFAULT 1");
    }
    // Fix legacy default 15 if set unintentionally
    try {
      db.exec("UPDATE chits SET current_month = 1 WHERE current_month = 15");
    } catch (_) {}
    if (!chitCols.includes('monthly_chit_value')) {
      db.exec("ALTER TABLE chits ADD COLUMN monthly_chit_value REAL DEFAULT 301500");
    }

    // Ensure no legacy UNIQUE index exists on members.phone
    try {
      db.exec("DROP INDEX IF EXISTS idx_members_phone");
      db.exec("DROP INDEX IF EXISTS idx_members_phone_unique");
      db.exec("DROP INDEX IF EXISTS members_phone_unique");
    } catch (_) {}
    // Safe migration for users table
    const userInfo = db.prepare("PRAGMA table_info(users)").all() as any[];
    const userCols = userInfo.map(col => col.name);
    if (!userCols.includes('password_changed_at')) {
      db.exec("ALTER TABLE users ADD COLUMN password_changed_at TEXT");
    }
    if (!userCols.includes('security_question')) {
      db.exec("ALTER TABLE users ADD COLUMN security_question TEXT");
    }
    if (!userCols.includes('security_answer_hash')) {
      db.exec("ALTER TABLE users ADD COLUMN security_answer_hash TEXT");
    }
    if (!userCols.includes('failed_recovery_attempts')) {
      db.exec("ALTER TABLE users ADD COLUMN failed_recovery_attempts INTEGER DEFAULT 0");
    }
    if (!userCols.includes('recovery_locked_until')) {
      db.exec("ALTER TABLE users ADD COLUMN recovery_locked_until TEXT");
    }
  } catch (err) {
    console.error('Migration note:', err);
  }

  // Ensure Initial Admin Account: Login ID 9640488507 with hashed password Saikiran@507
  const targetLoginId = '9640488507';
  const targetInitialPassword = 'Saikiran@507';
  const existingAdmin = db.prepare("SELECT * FROM users WHERE login_id = ? OR username = ?").get(targetLoginId, targetLoginId) as any;
  const now = new Date().toISOString();

  if (!existingAdmin) {
    const { hash, salt } = hashPassword(targetInitialPassword);
    const defaultAnswerHash = hashSecurityAnswer('9640488507');
    db.prepare(`
      INSERT INTO users (
        id, login_id, username, password_hash, salt, name, role,
        recovery_email, recovery_phone, is_active, failed_login_attempts,
        password_changed_at, security_question, security_answer_hash,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 0, ?, ?, ?, ?, ?)
    `).run(
      'admin-9640488507',
      targetLoginId,
      targetLoginId,
      hash,
      salt,
      'Administrator',
      'admin',
      'saikiran2cheryala@gmail.com',
      '9640488507',
      now,
      'What is your primary contact number?',
      defaultAnswerHash,
      now,
      now
    );
    console.log(`[AUTH] Production Admin account initialized for Login ID: ${targetLoginId}`);
  } else {
    // If existingAdmin password is not yet verified with Saikiran@507, update to the required production password
    const isCurrentValid = verifyPassword(targetInitialPassword, existingAdmin.password_hash, existingAdmin.salt);
    if (!isCurrentValid) {
      const { hash, salt } = hashPassword(targetInitialPassword);
      db.prepare(`
        UPDATE users SET 
          password_hash = ?, 
          salt = ?, 
          password_changed_at = COALESCE(password_changed_at, ?),
          is_active = 1, 
          failed_login_attempts = 0, 
          locked_until = NULL, 
          updated_at = ?
        WHERE id = ?
      `).run(hash, salt, now, now, existingAdmin.id);
      console.log(`[AUTH] Production Admin password hash synced for Login ID: ${targetLoginId}`);
    } else {
      // Ensure user is unlocked and active
      db.prepare(`
        UPDATE users SET 
          is_active = 1, 
          failed_login_attempts = 0, 
          locked_until = NULL,
          password_changed_at = COALESCE(password_changed_at, ?)
        WHERE id = ?
      `).run(now, existingAdmin.id);
    }

    // Ensure security question & answer hash exist
    if (!existingAdmin.security_question || !existingAdmin.security_answer_hash) {
      const defaultAnswerHash = hashSecurityAnswer('9640488507');
      db.prepare(`
        UPDATE users SET 
          security_question = COALESCE(security_question, 'What is your primary contact number?'),
          security_answer_hash = COALESCE(security_answer_hash, ?)
        WHERE id = ?
      `).run(defaultAnswerHash, existingAdmin.id);
    }

    // Ensure recovery email and phone are set for administrator accounts
    try {
      if (!existingAdmin.recovery_email) {
        db.prepare("UPDATE users SET recovery_email = ?, recovery_phone = ? WHERE id = ?")
          .run('saikiran2cheryala@gmail.com', '9640488507', existingAdmin.id);
      }
    } catch (_) {}
  }

  // Clean up any legacy or duplicate admin accounts to maintain strict production credential single-identity
  try {
    db.prepare("DELETE FROM users WHERE id = 'admin-1' OR (login_id != ? AND username != ? AND role = 'admin')").run(targetLoginId, targetLoginId);
    db.prepare("DELETE FROM sessions WHERE user_id = 'admin-1'").run();
  } catch (_) {}
}

const MONTH_NAMES = [
  'january', 'february', 'march', 'april', 'may', 'june',
  'july', 'august', 'september', 'october', 'november', 'december'
];

export function getCurrentKolkataYearMonth(): { year: number; month: number } {
  const now = new Date();
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: 'numeric',
  });
  const parts = formatter.formatToParts(now);
  let year = now.getFullYear();
  let month = now.getMonth() + 1; // 1-12
  for (const part of parts) {
    if (part.type === 'year') year = parseInt(part.value, 10);
    if (part.type === 'month') month = parseInt(part.value, 10);
  }
  return { year, month };
}

export function parseYearMonth(str: string): { year: number; month: number } | null {
  if (!str) return null;
  const s = str.trim().toLowerCase();

  // Format: 'YYYY-MM' or 'YYYY/MM'
  const isoMatch = s.match(/^(\d{4})[-\/](\d{1,2})$/);
  if (isoMatch) {
    return { year: parseInt(isoMatch[1], 10), month: parseInt(isoMatch[2], 10) };
  }

  // Format: 'MM/YYYY' or 'M/YYYY'
  const slashMatch = s.match(/^(\d{1,2})[-\/](\d{4})$/);
  if (slashMatch) {
    return { year: parseInt(slashMatch[2], 10), month: parseInt(slashMatch[1], 10) };
  }

  // Format: 'MonthName YYYY' or 'Mon YYYY' (e.g. 'February 2026', 'August 2026')
  const nameMatch = s.match(/([a-z]+)[\s,]+(\d{4})/i);
  if (nameMatch) {
    const monthName = nameMatch[1].toLowerCase();
    const year = parseInt(nameMatch[2], 10);
    const mIdx = MONTH_NAMES.findIndex(m => m.startsWith(monthName.substring(0, 3)));
    if (mIdx !== -1) {
      return { year, month: mIdx + 1 };
    }
  }

  // Format: 'YYYY MonthName'
  const reverseMatch = s.match(/(\d{4})[\s,]+([a-z]+)/i);
  if (reverseMatch) {
    const year = parseInt(reverseMatch[1], 10);
    const monthName = reverseMatch[2].toLowerCase();
    const mIdx = MONTH_NAMES.findIndex(m => m.startsWith(monthName.substring(0, 3)));
    if (mIdx !== -1) {
      return { year, month: mIdx + 1 };
    }
  }

  return null;
}

export function computeChitCurrentMonth(startMonthStr: string, totalMonths: number): number {
  if (!totalMonths || totalMonths < 1) return 1;
  const start = parseYearMonth(startMonthStr);
  if (!start) return 1;

  const current = getCurrentKolkataYearMonth();

  // Difference in months = (current.year - start.year) * 12 + (current.month - start.month)
  const diffMonths = (current.year - start.year) * 12 + (current.month - start.month);

  // If before chit start -> Month 1
  if (diffMonths < 0) {
    return 1;
  }

  const calculatedMonth = diffMonths + 1; // Month 1 is start month

  // If after final month -> final month (totalMonths)
  if (calculatedMonth > totalMonths) {
    return totalMonths;
  }

  return calculatedMonth;
}

// User Helpers
export function findUserByLoginId(loginId: string) {
  const trimmed = loginId.trim();
  return db.prepare(`
    SELECT * FROM users 
    WHERE (login_id = ? OR username = ? OR LOWER(recovery_email) = LOWER(?)) 
      AND is_active = 1
  `).get(trimmed, trimmed, trimmed) as any;
}

export function recordFailedLogin(userId: string) {
  const user = db.prepare("SELECT failed_login_attempts FROM users WHERE id = ?").get(userId) as any;
  const attempts = (user?.failed_login_attempts || 0) + 1;
  const now = Date.now();
  let lockedUntil: string | null = null;
  if (attempts >= 5) {
    // Lock for 15 minutes
    lockedUntil = new Date(now + 15 * 60 * 1000).toISOString();
  }
  db.prepare("UPDATE users SET failed_login_attempts = ?, locked_until = ? WHERE id = ?").run(attempts, lockedUntil, userId);
  return { attempts, isLocked: attempts >= 5, lockedUntil };
}

export function resetFailedLogins(userId: string) {
  const now = new Date().toISOString();
  db.prepare("UPDATE users SET failed_login_attempts = 0, locked_until = NULL, last_login_at = ? WHERE id = ?").run(now, userId);
}

// Session Management
export function createSession(
  userId: string,
  rawToken: string,
  ip?: string,
  ua?: string
) {
  // Make sure the user exists before creating the session.
  // This prevents SQLite FOREIGN KEY constraint errors.
  const user = db
    .prepare("SELECT id FROM users WHERE id = ? AND is_active = 1")
    .get(userId) as any;

  if (!user) {
    console.error(
      `SESSION ERROR: User not found or inactive. userId=${userId}`
    );
    throw new Error(
      `Cannot create session: user ${userId} does not exist or is inactive`
    );
  }

  const tokenHash = hashToken(rawToken);

  const id =
    "sess-" +
    Date.now() +
    "-" +
    crypto.randomBytes(8).toString("hex");

  const now = new Date().toISOString();

  // Session expires after 7 days.
  const expiresAt = new Date(
    Date.now() + 7 * 24 * 60 * 60 * 1000
  ).toISOString();

  try {
    db.prepare(`
      INSERT INTO sessions (
        id,
        user_id,
        session_token_hash,
        expires_at,
        created_at,
        last_used_at,
        ip_address,
        user_agent
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      user.id,
      tokenHash,
      expiresAt,
      now,
      now,
      ip || null,
      ua || null
    );
  } catch (error) {
    console.error("SESSION INSERT ERROR:", error);
    console.error("Session user ID:", user.id);
    throw error;
  }

  return {
    id,
    expiresAt,
  };
}

export function recordFailedRecovery(userId: string) {
  const user = db.prepare("SELECT failed_recovery_attempts FROM users WHERE id = ?").get(userId) as any;
  const attempts = (user?.failed_recovery_attempts || 0) + 1;
  const now = Date.now();
  let recoveryLockedUntil: string | null = null;
  if (attempts >= 5) {
    // Lock recovery attempts for 15 minutes
    recoveryLockedUntil = new Date(now + 15 * 60 * 1000).toISOString();
  }
  db.prepare("UPDATE users SET failed_recovery_attempts = ?, recovery_locked_until = ? WHERE id = ?").run(attempts, recoveryLockedUntil, userId);
  return { attempts, isLocked: attempts >= 5, recoveryLockedUntil };
}

export function resetFailedRecovery(userId: string) {
  db.prepare("UPDATE users SET failed_recovery_attempts = 0, recovery_locked_until = NULL WHERE id = ?").run(userId);
}

export function verifySessionToken(rawToken: string) {
  if (!rawToken) return null;
  const tokenHash = hashToken(rawToken);
  const now = new Date().toISOString();

  const session = db.prepare(`
    SELECT 
      u.id as id,
      s.id as session_id,
      u.login_id,
      u.username,
      u.name,
      u.role,
      u.recovery_email,
      u.recovery_phone,
      u.is_active,
      u.password_changed_at,
      u.security_question,
      u.created_at,
      u.updated_at,
      u.last_login_at
    FROM sessions s
    JOIN users u ON s.user_id = u.id
    WHERE s.session_token_hash = ? AND s.expires_at > ? AND u.is_active = 1
  `).get(tokenHash, now) as any;

  if (!session) return null;

  // Touch last_used_at
  try {
    db.prepare("UPDATE sessions SET last_used_at = ? WHERE id = ?").run(now, session.session_id);
  } catch (e) {
    // Non-critical
  }

  return sanitizeUser(session);
}

export function destroySession(rawToken: string) {
  if (!rawToken) return;
  const tokenHash = hashToken(rawToken);
  db.prepare("DELETE FROM sessions WHERE session_token_hash = ?").run(tokenHash);
}

export function destroyAllUserSessions(userId: string) {
  db.prepare("DELETE FROM sessions WHERE user_id = ?").run(userId);
}

// Password Recovery Helpers
export function createPasswordReset(userId: string) {
  const recoveryCode = Math.floor(100000 + Math.random() * 900000).toString(); // 6 digits
  const resetToken = crypto.randomBytes(32).toString('hex');
  const id = 'reset-' + Date.now() + '-' + crypto.randomBytes(8).toString('hex');
  const now = new Date().toISOString();
  // Expires in 15 minutes
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();

  db.prepare(`
    INSERT INTO password_resets (id, user_id, recovery_code, reset_token, expires_at, used, created_at)
    VALUES (?, ?, ?, ?, ?, 0, ?)
  `).run(id, userId, recoveryCode, resetToken, expiresAt, now);

  return { recoveryCode, resetToken, expiresAt };
}

export function createSecurityResetToken(userId: string) {
  const resetToken = crypto.randomBytes(32).toString('hex');
  const id = 'sec-reset-' + Date.now() + '-' + crypto.randomBytes(8).toString('hex');
  const now = new Date().toISOString();
  // Expires in 15 minutes
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();

  db.prepare(`
    INSERT INTO password_resets (id, user_id, recovery_code, reset_token, expires_at, used, created_at)
    VALUES (?, ?, 'SECURITY_ANSWER', ?, ?, 0, ?)
  `).run(id, userId, resetToken, expiresAt, now);

  return { resetToken, expiresAt };
}

export function createTempChangePasswordToken(userId: string) {
  const tempToken = 'temp_' + crypto.randomBytes(32).toString('hex');
  const id = 'reset-temp-' + Date.now() + '-' + crypto.randomBytes(8).toString('hex');
  const now = new Date().toISOString();
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();

  db.prepare(`
    INSERT INTO password_resets (id, user_id, recovery_code, reset_token, expires_at, used, created_at)
    VALUES (?, ?, 'TEMP_EXPIRED_PASS', ?, ?, 0, ?)
  `).run(id, userId, tempToken, expiresAt, now);

  return tempToken;
}

export function verifyTempChangePasswordToken(tempToken: string) {
  const now = new Date().toISOString();
  const row = db.prepare(`
    SELECT r.*, u.id as user_id, u.login_id, u.username, u.name, u.password_hash, u.salt
    FROM password_resets r
    JOIN users u ON r.user_id = u.id
    WHERE r.reset_token = ? AND r.expires_at > ? AND r.used = 0 AND u.is_active = 1
  `).get(tempToken, now) as any;
  return row || null;
}

export function verifyPasswordResetCode(loginId: string, code: string) {
  const user = findUserByLoginId(loginId);
  if (!user) return null;
  const now = new Date().toISOString();
  const resetRow = db.prepare(`
    SELECT * FROM password_resets
    WHERE user_id = ? AND recovery_code = ? AND used = 0 AND expires_at > ?
    ORDER BY created_at DESC LIMIT 1
  `).get(user.id, code.trim(), now) as any;

  if (!resetRow) return null;
  return { user, resetToken: resetRow.reset_token };
}

export function resetUserPasswordWithToken(resetToken: string, newPlainPassword: string) {
  const now = new Date().toISOString();
  const resetRow = db.prepare(`
    SELECT * FROM password_resets
    WHERE reset_token = ? AND used = 0 AND expires_at > ?
  `).get(resetToken, now) as any;

  if (!resetRow) {
    throw new Error('Reset link or token has expired or is invalid.');
  }

  const validation = validatePasswordStrength(newPlainPassword);
  if (!validation.isValid) {
    throw new Error(validation.error || 'Password does not meet security requirements.');
  }

  const { hash, salt } = hashPassword(newPlainPassword);
  db.prepare(`
    UPDATE users
    SET password_hash = ?, salt = ?, password_changed_at = ?, failed_login_attempts = 0, locked_until = NULL, updated_at = ?
    WHERE id = ?
  `).run(hash, salt, now, now, resetRow.user_id);

  // Invalidate reset token
  db.prepare("UPDATE password_resets SET used = 1 WHERE id = ?").run(resetRow.id);

  // Invalidate all existing sessions
  destroyAllUserSessions(resetRow.user_id);

  return true;
}

export function changeUserPassword(
  userId: string,
  currentPlainPassword: string | null,
  newPlainPassword: string,
  skipCurrentCheck = false
) {
  const user = db.prepare("SELECT * FROM users WHERE id = ?").get(userId) as any;
  if (!user) {
    throw new Error('User not found.');
  }

  if (!skipCurrentCheck) {
    if (!currentPlainPassword) {
      throw new Error('Current password is required.');
    }
    if (!verifyPassword(currentPlainPassword, user.password_hash, user.salt)) {
      throw new Error('Current password does not match.');
    }
  }

  if (currentPlainPassword && currentPlainPassword === newPlainPassword) {
    throw new Error('New password cannot be the same as your current password.');
  }

  const validation = validatePasswordStrength(newPlainPassword);
  if (!validation.isValid) {
    throw new Error(validation.error || 'Password does not meet security requirements.');
  }

  const { hash, salt } = hashPassword(newPlainPassword);
  const now = new Date().toISOString();
  db.prepare(`
    UPDATE users
    SET password_hash = ?, salt = ?, password_changed_at = ?, failed_login_attempts = 0, locked_until = NULL, updated_at = ?
    WHERE id = ?
  `).run(hash, salt, now, now, userId);

  // Invalidate all active sessions for this user to enforce fresh session
  destroyAllUserSessions(userId);

  const updatedUser = db.prepare("SELECT * FROM users WHERE id = ?").get(userId) as any;
  return { success: true, password_changed_at: now, user: sanitizeUser(updatedUser) };
}

export function updateUserSecurityQuestion(
  userId: string,
  currentPlainPassword: string,
  securityQuestion: string,
  securityAnswer: string
) {
  const user = db.prepare("SELECT * FROM users WHERE id = ?").get(userId) as any;
  if (!user) throw new Error('User not found.');

  if (!verifyPassword(currentPlainPassword, user.password_hash, user.salt)) {
    throw new Error('Current password is incorrect.');
  }

  const trimmedQ = (securityQuestion || '').trim();
  const trimmedA = (securityAnswer || '').trim();
  if (!trimmedQ || trimmedQ.length < 5) {
    throw new Error('Security question must be at least 5 characters long.');
  }
  if (!trimmedA || trimmedA.length < 2) {
    throw new Error('Security answer must be at least 2 characters long.');
  }

  const answerHash = hashSecurityAnswer(trimmedA);
  const now = new Date().toISOString();

  db.prepare(`
    UPDATE users
    SET security_question = ?, security_answer_hash = ?, updated_at = ?
    WHERE id = ?
  `).run(trimmedQ, answerHash, now, userId);

  return { success: true, security_question: trimmedQ };
}

export function updateUserSettings(userId: string, data: { name?: string; recovery_email?: string; recovery_phone?: string }) {
  const user = db.prepare("SELECT * FROM users WHERE id = ?").get(userId) as any;
  if (!user) throw new Error('User not found.');
  const now = new Date().toISOString();
  db.prepare(`
    UPDATE users
    SET name = COALESCE(?, name),
        recovery_email = COALESCE(?, recovery_email),
        recovery_phone = COALESCE(?, recovery_phone),
        updated_at = ?
    WHERE id = ?
  `).run(data.name || null, data.recovery_email || null, data.recovery_phone || null, now, userId);

  const updated = db.prepare("SELECT * FROM users WHERE id = ?").get(userId) as any;
  return sanitizeUser(updated);
}

/**
 * Generate or ensure monthly dues exist for a given chit and month.
 * Strictly idempotent: NEVER overwrites existing payments or resets paid amounts.
 * Uses `payments` table as the ultimate source of truth.
 */
export function ensureMonthlyDuesForChitAndMonth(chitId: string, monthNumber: number) {
  const chit = db.prepare('SELECT * FROM chits WHERE id = ?').get(chitId) as any;
  if (!chit) return;

  const rule = db.prepare('SELECT * FROM chit_month_rules WHERE chit_id = ? AND month_number = ?').get(chitId, monthNumber) as any;
  if (!rule) return;

  const members = db.prepare("SELECT * FROM members WHERE chit_id = ? AND status = 'active'").all(chitId) as any[];
  const existingDues = db.prepare('SELECT * FROM monthly_dues WHERE chit_id = ? AND month_number = ?').all(chitId, monthNumber) as any[];
  const duesMap = new Map(existingDues.map(d => [d.member_id, d]));

  const insertStmt = db.prepare(`
    INSERT INTO monthly_dues (id, chit_id, member_id, month_number, month_name, due_amount, paid_amount, balance_amount, status, due_date, generated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const syncDueStmt = db.prepare(`
    UPDATE monthly_dues
    SET paid_amount = ?, balance_amount = ?, status = ?
    WHERE id = ?
  `);

  const now = new Date().toISOString();
  const tx = db.transaction(() => {
    for (const member of members) {
      const existingDue = duesMap.get(member.id);

      if (!existingDue) {
        // Check if member lifted
        const lift = db.prepare('SELECT * FROM lift_details WHERE member_id = ?').get(member.id) as any;
        let dueAmount = rule.pre_lift_payment;
        if (lift && monthNumber > lift.lift_month) {
          dueAmount = rule.post_lift_payment;
        }

        const dueId = `due-${chitId}-${member.id}-m${monthNumber}`;

        // Check if any payment was previously recorded in payments table for this member/month
        const paymentSumRow = db.prepare(
          'SELECT COALESCE(SUM(amount), 0) as total FROM payments WHERE (monthly_due_id = ? OR (chit_id = ? AND member_id = ? AND month_number = ?))'
        ).get(dueId, chitId, member.id, monthNumber) as any;
        const recordedPaid = paymentSumRow ? Number(paymentSumRow.total) : 0;
        const finalBalance = Math.max(0, dueAmount - recordedPaid);
        const finalStatus = recordedPaid >= dueAmount ? 'PAID' : (recordedPaid > 0 ? 'PARTIAL' : 'PENDING');

        insertStmt.run(
          dueId,
          chitId,
          member.id,
          monthNumber,
          rule.month_name,
          dueAmount,
          recordedPaid,
          finalBalance,
          finalStatus,
          now,
          now
        );
      } else {
        // Self-heal: ensure paid_amount on due matches actual sum of recorded payments
        const paymentSumRow = db.prepare(
          'SELECT COALESCE(SUM(amount), 0) as total FROM payments WHERE monthly_due_id = ?'
        ).get(existingDue.id) as any;
        const totalPaidInPayments = paymentSumRow ? Number(paymentSumRow.total) : 0;

        if (totalPaidInPayments > 0 && Number(existingDue.paid_amount) !== totalPaidInPayments) {
          const correctedBalance = Math.max(0, Number(existingDue.due_amount) - totalPaidInPayments);
          const correctedStatus = totalPaidInPayments >= Number(existingDue.due_amount) ? 'PAID' : (totalPaidInPayments > 0 ? 'PARTIAL' : 'PENDING');
          syncDueStmt.run(totalPaidInPayments, correctedBalance, correctedStatus, existingDue.id);
        }
      }
    }
  });

  tx();
}

/**
 * When a member lifts in month L:
 * Future months (month > L) with 0 payments should be updated to post_lift_payment.
 * Historical and paid months are NEVER changed.
 */
export function syncDuesOnLift(chitId: string, memberId: string, liftMonth: number) {
  const rules = db.prepare('SELECT * FROM chit_month_rules WHERE chit_id = ? ORDER BY month_number ASC').all(chitId) as any[];
  const rulesMap = new Map(rules.map(r => [r.month_number, r]));

  const updateStmt = db.prepare(`
    UPDATE monthly_dues
    SET due_amount = ?, balance_amount = ? - paid_amount,
        status = CASE 
          WHEN (? - paid_amount) <= 0 THEN 'PAID'
          WHEN paid_amount > 0 THEN 'PARTIAL'
          ELSE 'PENDING'
        END
    WHERE chit_id = ? AND member_id = ? AND month_number = ? AND paid_amount = 0
  `);

  const tx = db.transaction(() => {
    for (const [mNum, rule] of rulesMap.entries()) {
      if (mNum <= liftMonth) {
        // Month 1 to liftMonth: PRE-LIFT PAYMENT for unpaid dues
        updateStmt.run(
          rule.pre_lift_payment,
          rule.pre_lift_payment,
          rule.pre_lift_payment,
          chitId,
          memberId,
          mNum
        );
      } else {
        // Future months (mNum > liftMonth): POST-LIFT PAYMENT for unpaid dues
        updateStmt.run(
          rule.post_lift_payment,
          rule.post_lift_payment,
          rule.post_lift_payment,
          chitId,
          memberId,
          mNum
        );
      }
    }
  });

  tx();
}
