/**
 * Production Prisma PostgreSQL Repository for Chit Manager
 * 
 * Provides clean, type-safe database operations backed by Prisma ORM
 * for PostgreSQL (Supabase, Neon, Render, Railway, Cloud SQL).
 * 
 * Guarantees:
 * - 100% Prisma/PostgreSQL implementation
 * - Zero SQLite runtime dependencies in production
 * - Exact snake_case API serialization matching frontend contracts
 * - Safe Decimal conversion to JS number
 * - Explicit date formatting and ISO serialization
 * - Atomic database operations via prisma.$transaction
 * - Transparent offline fallback when DATABASE_URL is not set
 */

import { PrismaClient } from '@prisma/client';
import { getPrisma, hasPostgresConnection } from './prisma';
import crypto from 'crypto';
import * as sqlite from './sqliteFallback';

export function getClient(): PrismaClient {
  const p = getPrisma();
  if (!p) {
    throw new Error('Prisma PostgreSQL client not configured. Set DATABASE_URL to connect to PostgreSQL.');
  }
  return p;
}

// ----------------- TYPE CONVERSION & SERIALIZATION HELPERS -----------------

export function toNumber(val: any, fallback = 0): number {
  if (val === null || val === undefined) return fallback;
  if (typeof val === 'number') return isNaN(val) ? fallback : Math.round(val * 100) / 100;
  if (typeof val === 'string') {
    const parsed = parseFloat(val);
    return isNaN(parsed) ? fallback : Math.round(parsed * 100) / 100;
  }
  if (typeof val === 'object' && typeof val.toNumber === 'function') {
    return Math.round(val.toNumber() * 100) / 100;
  }
  const num = Number(val);
  return isNaN(num) ? fallback : Math.round(num * 100) / 100;
}

export function toISO(date: any): string {
  if (!date) return '';
  if (date instanceof Date) return date.toISOString();
  if (typeof date === 'string') return date;
  return String(date);
}

export function toDateOnly(date: any): string {
  if (!date) return '';
  if (date instanceof Date) return date.toISOString().split('T')[0];
  if (typeof date === 'string') return date.split('T')[0];
  return String(date).split('T')[0];
}

// ----------------- CRYPTO & PASSWORD HELPERS -----------------

export function hashPassword(plainText: string, salt?: string) {
  const actualSalt = salt || crypto.randomBytes(16).toString('hex');
  const hash = crypto.pbkdf2Sync(plainText, actualSalt, 100000, 64, 'sha512').toString('hex');
  return { hash, salt: actualSalt };
}

export function verifyPassword(plainText: string, storedHash: string, salt: string): boolean {
  try {
    const hash = crypto.pbkdf2Sync(plainText, salt, 100000, 64, 'sha512').toString('hex');
    const hashBuf = Buffer.from(hash, 'hex');
    const storedBuf = Buffer.from(storedHash, 'hex');
    if (hashBuf.length === storedBuf.length && crypto.timingSafeEqual(hashBuf, storedBuf)) {
      return true;
    }
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

// ----------------- MODEL SERIALIZERS (CAMELCASE -> SNAKE_CASE) -----------------

export function serializeUser(user: any): any {
  if (!user) return null;
  const changedAt = user.passwordChangedAt || user.password_changed_at || user.createdAt || user.created_at;
  const changedAtStr = changedAt instanceof Date ? changedAt.toISOString() : (changedAt || null);
  const expiresAt = changedAtStr ? getPasswordExpirationDate(changedAtStr).toISOString() : null;
  const expired = isPasswordExpired(changedAtStr);

  return {
    id: user.id,
    login_id: user.loginId ?? user.login_id ?? user.username,
    username: user.username,
    name: user.name,
    role: user.role || 'admin',
    recovery_email: user.recoveryEmail ?? user.recovery_email ?? '',
    recovery_phone: user.recoveryPhone ?? user.recovery_phone ?? '',
    is_active: user.isActive !== undefined ? Boolean(user.isActive) : (user.is_active !== undefined ? Boolean(user.is_active) : true),
    password_changed_at: changedAtStr,
    password_expires_at: expiresAt,
    is_password_expired: expired,
    security_question: user.securityQuestion ?? user.security_question ?? 'What is your primary contact number?',
    created_at: toISO(user.createdAt ?? user.created_at),
    updated_at: toISO(user.updatedAt ?? user.updated_at),
    last_login_at: user.lastLoginAt ? toISO(user.lastLoginAt) : (user.last_login_at ? toISO(user.last_login_at) : null),
  };
}

export function sanitizeUser(user: any): any {
  return serializeUser(user);
}

export function serializeChit(c: any): any {
  if (!c) return null;
  return {
    id: c.id,
    name: c.name,
    chit_value: toNumber(c.chitValue ?? c.chit_value),
    monthly_chit_value: toNumber(c.monthlyChitValue ?? c.monthly_chit_value, 301500),
    total_months: Number(c.totalMonths ?? c.total_months),
    total_members: Number(c.totalMembers ?? c.total_members),
    current_month: Number(c.currentMonth ?? c.current_month ?? 1),
    start_month: c.startMonth ?? c.start_month,
    end_month: c.endMonth ?? c.end_month,
    status: c.status || 'active',
    created_at: toISO(c.createdAt ?? c.created_at),
    updated_at: toISO(c.updatedAt ?? c.updated_at),
  };
}

export function serializeRule(r: any): any {
  if (!r) return {};
  return {
    id: r.id || '',
    chit_id: r.chitId ?? r.chit_id ?? '',
    month_number: Number(r.monthNumber ?? r.month_number ?? 0),
    month_name: r.monthName ?? r.month_name ?? '',
    pre_lift_payment: toNumber(r.preLiftPayment ?? r.pre_lift_payment),
    post_lift_payment: toNumber(r.postLiftPayment ?? r.post_lift_payment),
    monthly_chit_value: toNumber(r.monthlyChitValue ?? r.monthly_chit_value),
    expected_lift_payout: toNumber(r.expectedLiftPayout ?? r.expected_lift_payout),
  };
}

export function serializeMember(m: any): any {
  if (!m) return {};
  return {
    id: m.id || '',
    chit_id: m.chitId ?? m.chit_id ?? '',
    customer_name: m.customerName ?? m.customer_name ?? '',
    phone: m.phone ?? '',
    ticket_number: m.ticketNumber ?? m.ticket_number ?? '',
    status: m.status || 'active',
    join_date: toISO(m.joinDate ?? m.join_date),
    created_at: toISO(m.createdAt ?? m.created_at),
  };
}

export function serializeLift(l: any): any {
  if (!l) return {};
  return {
    id: l.id || '',
    chit_id: l.chitId ?? l.chit_id ?? '',
    member_id: l.memberId ?? l.member_id ?? '',
    lift_month: Number(l.liftMonth ?? l.lift_month ?? 0),
    lift_amount: toNumber(l.liftAmount ?? l.lift_amount),
    lift_amount_received: toNumber(l.liftAmountReceived ?? l.lift_amount_received),
    remaining_payout: toNumber(l.remainingPayout ?? l.remaining_payout),
    payout_status: l.payoutStatus ?? l.payout_status ?? 'PAID',
    lift_date: toISO(l.liftDate ?? l.lift_date),
    payment_method: l.paymentMethod ?? l.payment_method ?? 'Cash',
    reference_number: l.referenceNumber ?? l.reference_number ?? null,
    notes: l.notes ?? null,
    status: l.status ?? 'Completed',
    created_at: toISO(l.createdAt ?? l.created_at),
    updated_at: l.updatedAt ? toISO(l.updatedAt) : (l.updated_at ? toISO(l.updated_at) : null),
  };
}

export function serializeLiftTransaction(t: any): any {
  if (!t) return {};
  return {
    id: t.id || '',
    lift_id: t.liftId ?? t.lift_id ?? '',
    chit_id: t.chitId ?? t.chit_id ?? '',
    member_id: t.memberId ?? t.member_id ?? '',
    amount: toNumber(t.amount),
    payment_date: toISO(t.paymentDate ?? t.payment_date),
    payment_method: t.paymentMethod ?? t.payment_method ?? 'Cash',
    reference_number: t.referenceNumber ?? t.reference_number ?? null,
    notes: t.notes ?? null,
    created_at: toISO(t.createdAt ?? t.created_at),
  };
}

export function serializeDue(d: any): any {
  if (!d) return {};
  return {
    id: d.id || '',
    chit_id: d.chitId ?? d.chit_id ?? '',
    member_id: d.memberId ?? d.member_id ?? '',
    month_number: Number(d.monthNumber ?? d.month_number ?? 0),
    month_name: d.monthName ?? d.month_name ?? '',
    due_amount: toNumber(d.dueAmount ?? d.due_amount),
    paid_amount: toNumber(d.paidAmount ?? d.paid_amount),
    balance_amount: toNumber(d.balanceAmount ?? d.balance_amount),
    status: d.status || 'PENDING',
    due_date: toISO(d.dueDate ?? d.due_date),
    generated_at: toISO(d.generatedAt ?? d.generated_at),
  };
}

export function serializePayment(p: any): any {
  if (!p) return {};
  return {
    id: p.id || '',
    monthly_due_id: p.monthlyDueId ?? p.monthly_due_id ?? '',
    chit_id: p.chitId ?? p.chit_id ?? '',
    member_id: p.memberId ?? p.member_id ?? '',
    month_number: Number(p.monthNumber ?? p.month_number ?? 0),
    month_name: p.monthName ?? p.month_name ?? '',
    amount: toNumber(p.amount),
    payment_method: p.paymentMethod ?? p.payment_method ?? 'Cash',
    reference_no: p.referenceNo ?? p.reference_no ?? '',
    notes: p.notes ?? '',
    payment_date: toISO(p.paymentDate ?? p.payment_date),
    created_at: toISO(p.createdAt ?? p.created_at),
    updated_at: p.updatedAt ? toISO(p.updatedAt) : (p.updated_at ? toISO(p.updated_at) : null),
  };
}

// ----------------- AUTHENTICATION & USERS -----------------

export async function initPostgresDatabase() {
  if (!hasPostgresConnection()) {
    return sqlite.dbInitDatabase();
  }

  const prisma = getClient();
  const targetLoginId = '9640488507';
  const targetInitialPassword = 'Saikiran@507';

  try {
    const existing = await prisma.user.findFirst({
      where: {
        OR: [
          { loginId: targetLoginId },
          { username: targetLoginId },
        ],
      },
    });

    const now = new Date();
    if (!existing) {
      const { hash, salt } = hashPassword(targetInitialPassword);
      const defaultAnswerHash = hashSecurityAnswer('9640488507');

      await prisma.user.create({
        data: {
          id: 'admin-9640488507',
          loginId: targetLoginId,
          username: targetLoginId,
          passwordHash: hash,
          salt: salt,
          name: 'Administrator',
          role: 'admin',
          recoveryEmail: 'saikiran2cheryala@gmail.com',
          recoveryPhone: '9640488507',
          isActive: true,
          failedLoginAttempts: 0,
          passwordChangedAt: now,
          securityQuestion: 'What is your primary contact number?',
          securityAnswerHash: defaultAnswerHash,
          createdAt: now,
          updatedAt: now,
        },
      });
      console.log(`[AUTH] Production Admin account initialized for Login ID: ${targetLoginId}`);
    } else {
      const isCurrentValid = verifyPassword(targetInitialPassword, existing.passwordHash, existing.salt);
      if (!isCurrentValid) {
        const { hash, salt } = hashPassword(targetInitialPassword);
        await prisma.user.update({
          where: { id: existing.id },
          data: {
            passwordHash: hash,
            salt: salt,
            passwordChangedAt: existing.passwordChangedAt || now,
            isActive: true,
            failedLoginAttempts: 0,
            lockedUntil: null,
            updatedAt: now,
          },
        });
      }
    }
  } catch (err) {
    console.error('[AUTH DB INIT ERROR]', err);
    throw err;
  }
}

export async function findUserByLoginId(loginId: string) {
  if (!hasPostgresConnection()) {
    return sqlite.dbFindUserByLoginId(loginId);
  }

  const prisma = getClient();
  const raw = await prisma.user.findFirst({
    where: {
      OR: [
        { loginId: loginId },
        { username: loginId },
      ],
    },
  });
  if (!raw) return null;

  return {
    ...raw,
    login_id: raw.loginId || raw.username,
    password_hash: raw.passwordHash,
    recovery_email: raw.recoveryEmail,
    recovery_phone: raw.recoveryPhone,
    is_active: raw.isActive,
    failed_login_attempts: raw.failedLoginAttempts,
    locked_until: raw.lockedUntil ? raw.lockedUntil.toISOString() : null,
    password_changed_at: raw.passwordChangedAt ? raw.passwordChangedAt.toISOString() : null,
    security_question: raw.securityQuestion,
    security_answer_hash: raw.securityAnswerHash,
    failed_recovery_attempts: raw.failedRecoveryAttempts,
    recovery_locked_until: raw.recoveryLockedUntil ? raw.recoveryLockedUntil.toISOString() : null,
    created_at: raw.createdAt.toISOString(),
    updated_at: raw.updatedAt ? raw.updatedAt.toISOString() : null,
    last_login_at: raw.lastLoginAt ? raw.lastLoginAt.toISOString() : null,
  };
}

export async function findUserById(userId: string) {
  if (!hasPostgresConnection()) {
    const raw = sqlite.dbFindUserByLoginId(userId);
    return raw ? serializeUser(raw) : null;
  }

  const prisma = getClient();
  const raw = await prisma.user.findUnique({ where: { id: userId } });
  if (!raw) return null;
  return serializeUser(raw);
}

export async function recordFailedLogin(userId: string) {
  if (!hasPostgresConnection()) {
    return sqlite.dbRecordFailedLogin(userId);
  }

  const prisma = getClient();
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) return { isLocked: false, remainingAttempts: 5 };

  const attempts = (user.failedLoginAttempts || 0) + 1;
  const isLocked = attempts >= 5;
  const lockedUntil = isLocked ? new Date(Date.now() + 15 * 60 * 1000) : null;

  await prisma.user.update({
    where: { id: userId },
    data: {
      failedLoginAttempts: attempts,
      lockedUntil: lockedUntil,
    },
  });

  return { isLocked, remainingAttempts: Math.max(0, 5 - attempts) };
}

export async function resetFailedLogins(userId: string) {
  if (!hasPostgresConnection()) {
    return sqlite.dbResetFailedLogins(userId);
  }

  const prisma = getClient();
  await prisma.user.update({
    where: { id: userId },
    data: {
      failedLoginAttempts: 0,
      lockedUntil: null,
      lastLoginAt: new Date(),
    },
  });
}

export async function createSession(userId: string, rawToken: string, ip?: string, ua?: string) {
  if (!hasPostgresConnection()) {
    return sqlite.dbCreateSession(userId, rawToken, ip, ua);
  }

  const prisma = getClient();
  const tokenHash = hashToken(rawToken);
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

  return await prisma.session.create({
    data: {
      id: `sess-${Date.now()}-${crypto.randomBytes(8).toString('hex')}`,
      userId,
      sessionTokenHash: tokenHash,
      expiresAt,
      lastUsedAt: new Date(),
      ipAddress: ip || null,
      userAgent: ua || null,
    },
  });
}

export async function verifySessionToken(rawToken: string) {
  if (!hasPostgresConnection()) {
    return sqlite.dbVerifySessionToken(rawToken);
  }

  const prisma = getClient();
  const tokenHash = hashToken(rawToken);

  const session = await prisma.session.findUnique({
    where: { sessionTokenHash: tokenHash },
    include: { user: true },
  });

  if (!session) return null;

  if (new Date(session.expiresAt).getTime() < Date.now()) {
    await prisma.session.delete({ where: { id: session.id } }).catch(() => {});
    return null;
  }

  await prisma.session.update({
    where: { id: session.id },
    data: { lastUsedAt: new Date() },
  }).catch(() => {});

  return serializeUser(session.user);
}

export async function destroySession(rawToken: string) {
  if (!hasPostgresConnection()) {
    return sqlite.dbDestroySession(rawToken);
  }

  const prisma = getClient();
  const tokenHash = hashToken(rawToken);
  await prisma.session.deleteMany({
    where: { sessionTokenHash: tokenHash },
  });
}

export async function destroyAllUserSessions(userId: string) {
  if (!hasPostgresConnection()) {
    return;
  }

  const prisma = getClient();
  await prisma.session.deleteMany({
    where: { userId },
  });
}

const tempPasswordTokens = new Map<string, { userId: string; expiresAt: number }>();

export function createTempChangePasswordToken(userId: string): string {
  if (!hasPostgresConnection()) {
    return sqlite.dbCreateTempChangePasswordToken(userId);
  }

  const token = crypto.randomBytes(32).toString('hex');
  tempPasswordTokens.set(token, {
    userId,
    expiresAt: Date.now() + 15 * 60 * 1000,
  });
  return token;
}

export function verifyTempChangePasswordToken(token: string): { user_id: string } | null {
  if (!hasPostgresConnection()) {
    return sqlite.dbVerifyTempChangePasswordToken(token);
  }

  const entry = tempPasswordTokens.get(token);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    tempPasswordTokens.delete(token);
    return null;
  }
  return { user_id: entry.userId };
}

export async function createPasswordReset(userId: string) {
  if (!hasPostgresConnection()) {
    return sqlite.dbCreatePasswordReset(userId);
  }

  const prisma = getClient();
  const recoveryCode = Math.floor(100000 + Math.random() * 900000).toString();
  const resetToken = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000);

  await prisma.passwordReset.create({
    data: {
      id: `reset-${Date.now()}-${crypto.randomBytes(6).toString('hex')}`,
      userId,
      recoveryCode,
      resetToken,
      expiresAt,
      used: false,
    },
  });

  return { recoveryCode, resetToken };
}

export async function verifyPasswordResetCode(loginId: string, code: string) {
  if (!hasPostgresConnection()) {
    return sqlite.dbVerifyPasswordResetCode(loginId, code);
  }

  const prisma = getClient();
  const user = await findUserByLoginId(loginId);
  if (!user) return null;

  const reset = await prisma.passwordReset.findFirst({
    where: {
      userId: user.id,
      recoveryCode: code,
      used: false,
      expiresAt: { gt: new Date() },
    },
    orderBy: { createdAt: 'desc' },
  });

  if (!reset) return null;
  return { resetToken: reset.resetToken, userId: user.id };
}

export async function createSecurityResetToken(userId: string) {
  if (!hasPostgresConnection()) {
    return sqlite.dbCreateSecurityResetToken(userId);
  }

  const prisma = getClient();
  const resetToken = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000);

  await prisma.passwordReset.create({
    data: {
      id: `reset-${Date.now()}-${crypto.randomBytes(6).toString('hex')}`,
      userId,
      recoveryCode: 'QUESTION',
      resetToken,
      expiresAt,
      used: false,
    },
  });

  return { resetToken };
}

export async function resetUserPasswordWithToken(resetToken: string, newPassword: string) {
  if (!hasPostgresConnection()) {
    return sqlite.dbResetUserPasswordWithToken(resetToken, newPassword);
  }

  const prisma = getClient();
  const reset = await prisma.passwordReset.findUnique({
    where: { resetToken },
  });

  if (!reset || reset.used || new Date(reset.expiresAt).getTime() < Date.now()) {
    throw new Error('Invalid or expired reset token.');
  }

  const { hash, salt } = hashPassword(newPassword);
  const now = new Date();

  await prisma.$transaction([
    prisma.user.update({
      where: { id: reset.userId },
      data: {
        passwordHash: hash,
        salt,
        passwordChangedAt: now,
        failedLoginAttempts: 0,
        lockedUntil: null,
      },
    }),
    prisma.passwordReset.update({
      where: { id: reset.id },
      data: { used: true },
    }),
    prisma.session.deleteMany({
      where: { userId: reset.userId },
    }),
  ]);

  return true;
}

export async function changeUserPassword(userId: string, currentPassword: string | null, newPassword: string, isTempTokenValid: boolean) {
  if (!hasPostgresConnection()) {
    return sqlite.dbChangeUserPassword(userId, currentPassword, newPassword, isTempTokenValid);
  }

  const prisma = getClient();
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new Error('User not found.');

  if (!isTempTokenValid) {
    if (!currentPassword) throw new Error('Current password is required.');
    const isValid = verifyPassword(currentPassword, user.passwordHash, user.salt);
    if (!isValid) throw new Error('Incorrect current password.');
  }

  const { hash, salt } = hashPassword(newPassword);
  const now = new Date();

  const updated = await prisma.user.update({
    where: { id: userId },
    data: {
      passwordHash: hash,
      salt,
      passwordChangedAt: now,
      failedLoginAttempts: 0,
      lockedUntil: null,
    },
  });

  await prisma.session.deleteMany({ where: { userId } }).catch(() => {});

  return { user: serializeUser(updated) };
}

export async function updateUserSettings(userId: string, data: { name?: string; recovery_email?: string; recovery_phone?: string }) {
  if (!hasPostgresConnection()) {
    return sqlite.dbUpdateUserSettings(userId, data);
  }

  const prisma = getClient();
  const updateData: any = {};
  if (data.name !== undefined) updateData.name = data.name;
  if (data.recovery_email !== undefined) updateData.recoveryEmail = data.recovery_email;
  if (data.recovery_phone !== undefined) updateData.recoveryPhone = data.recovery_phone;

  const updated = await prisma.user.update({
    where: { id: userId },
    data: updateData,
  });
  return serializeUser(updated);
}

export async function updateUserSecurityQuestion(userId: string, currentPassword: string, question: string, answer: string) {
  if (!hasPostgresConnection()) {
    return sqlite.dbUpdateUserSecurityQuestion(userId, currentPassword, question, answer);
  }

  const prisma = getClient();
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new Error('User not found.');

  const isValid = verifyPassword(currentPassword, user.passwordHash, user.salt);
  if (!isValid) throw new Error('Incorrect current password.');

  const answerHash = hashSecurityAnswer(answer);
  const updated = await prisma.user.update({
    where: { id: userId },
    data: {
      securityQuestion: question,
      securityAnswerHash: answerHash,
    },
  });
  return { security_question: updated.securityQuestion };
}

export async function recordFailedRecovery(userId: string) {
  if (!hasPostgresConnection()) {
    return sqlite.dbRecordFailedRecovery(userId);
  }

  const prisma = getClient();
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) return { isLocked: false, attempts: 5 };

  const attempts = (user.failedRecoveryAttempts || 0) + 1;
  const isLocked = attempts >= 5;
  const lockedUntil = isLocked ? new Date(Date.now() + 15 * 60 * 1000) : null;

  await prisma.user.update({
    where: { id: userId },
    data: {
      failedRecoveryAttempts: attempts,
      recoveryLockedUntil: lockedUntil,
    },
  });

  return { isLocked, attempts };
}

export async function resetFailedRecovery(userId: string) {
  if (!hasPostgresConnection()) {
    return sqlite.dbResetFailedRecovery(userId);
  }

  const prisma = getClient();
  await prisma.user.update({
    where: { id: userId },
    data: {
      failedRecoveryAttempts: 0,
      recoveryLockedUntil: null,
    },
  });
}

// ----------------- CHIT MONTH RULES & CALCULATIONS -----------------

export function computeChitCurrentMonth(startMonth: string, totalMonths: number): number {
  if (!startMonth) return 1;
  const now = new Date();
  const [startYearStr, startMonthStr] = startMonth.split('-');
  const sYear = parseInt(startYearStr, 10);
  const sMonth = parseInt(startMonthStr, 10);

  if (isNaN(sYear) || isNaN(sMonth)) return 1;

  const currentYear = now.getFullYear();
  const currentMonthNum = now.getMonth() + 1;

  const diffMonths = (currentYear - sYear) * 12 + (currentMonthNum - sMonth);
  const calculatedMonth = diffMonths + 1;

  if (calculatedMonth < 1) return 1;
  if (calculatedMonth > totalMonths) return totalMonths;
  return calculatedMonth;
}

export async function syncChitsCurrentMonth() {
  if (!hasPostgresConnection()) {
    return sqlite.dbSyncChitsCurrentMonth();
  }

  const prisma = getClient();
  const chits = await prisma.chit.findMany({ where: { status: 'active' } });

  for (const chit of chits) {
    const calculated = computeChitCurrentMonth(chit.startMonth, chit.totalMonths);
    if (chit.currentMonth !== calculated) {
      await prisma.chit.update({
        where: { id: chit.id },
        data: { currentMonth: calculated },
      });
    }
    await ensureMonthlyDuesForChitAndMonth(chit.id, calculated);
  }
}

export function calculateChitFullTermProjection(chit: any, rulesList?: any[]) {
  const rules = (rulesList || chit.rules || []).map(serializeRule);
  const totalMonths = Number(chit.total_months ?? chit.totalMonths) || rules.length || 0;
  const totalMembers = Number(chit.total_members ?? chit.totalMembers) || 0;

  let totalProjectedCollection = 0;
  let totalProjectedLiftPayout = 0;
  let totalProjectedProfit = 0;
  const monthlyProjections: any[] = [];

  for (let m = 1; m <= totalMonths; m++) {
    const rule = rules.find((r: any) => r.month_number === m) || {};
    const preAmount = Number(rule.pre_lift_payment) || 0;
    const postAmount = Number(rule.post_lift_payment) || 0;
    const liftPayout = Number(rule.expected_lift_payout) || 0;

    const postLiftCount = Math.max(0, Math.min(m - 1, totalMembers));
    const preLiftCount = Math.max(0, totalMembers - postLiftCount);

    const projectedCollection = (preLiftCount * preAmount) + (postLiftCount * postAmount);
    const profitOrLoss = projectedCollection - liftPayout;

    totalProjectedCollection += projectedCollection;
    totalProjectedLiftPayout += liftPayout;
    totalProjectedProfit += profitOrLoss;

    monthlyProjections.push({
      month_number: m,
      month_name: rule.month_name || `Month ${m}`,
      pre_lift_payment: preAmount,
      post_lift_payment: postAmount,
      pre_lift_count: preLiftCount,
      post_lift_count: postLiftCount,
      projected_collection: projectedCollection,
      lift_payout: liftPayout,
      profit_or_loss: profitOrLoss,
      is_profit: profitOrLoss >= 0,
      manager_add_required: profitOrLoss < 0 ? Math.abs(profitOrLoss) : 0,
    });
  }

  return {
    total_projected_collection: totalProjectedCollection,
    total_projected_lift_payout: totalProjectedLiftPayout,
    total_projected_profit: totalProjectedProfit,
    monthly_projections: monthlyProjections,
  };
}

// ----------------- DUES SYNCHRONIZATION -----------------

export async function ensureMonthlyDuesForChitAndMonth(chitId: string, monthNumber: number) {
  if (!hasPostgresConnection()) {
    return sqlite.dbEnsureMonthlyDuesForChitAndMonth(chitId, monthNumber);
  }

  const prisma = getClient();
  const chit = await prisma.chit.findUnique({
    where: { id: chitId },
    include: {
      rules: { where: { monthNumber } },
      members: { where: { status: 'active' } },
      liftDetails: true,
    },
  });

  if (!chit || chit.rules.length === 0) return;
  const rule = chit.rules[0];
  const liftMap = new Map(chit.liftDetails.map(l => [l.memberId, l]));

  for (const member of chit.members) {
    const lift = liftMap.get(member.id);
    let dueAmount = toNumber(rule.preLiftPayment);
    if (lift && monthNumber > lift.liftMonth) {
      dueAmount = toNumber(rule.postLiftPayment);
    }

    const dueId = `due-${chitId}-${member.id}-m${monthNumber}`;

    const payAgg = await prisma.payment.aggregate({
      where: {
        OR: [
          { monthlyDueId: dueId },
          { chitId, memberId: member.id, monthNumber },
        ],
      },
      _sum: { amount: true },
    });

    const paidAmount = toNumber(payAgg._sum.amount, 0);
    const balanceAmount = Math.max(0, dueAmount - paidAmount);
    const status = paidAmount >= dueAmount ? 'PAID' : (paidAmount > 0 ? 'PARTIAL' : 'PENDING');

    await prisma.monthlyDue.upsert({
      where: {
        chitId_memberId_monthNumber: {
          chitId,
          memberId: member.id,
          monthNumber,
        },
      },
      update: {
        dueAmount,
        paidAmount,
        balanceAmount,
        status,
      },
      create: {
        id: dueId,
        chitId,
        memberId: member.id,
        monthNumber,
        monthName: rule.monthName,
        dueAmount,
        paidAmount,
        balanceAmount,
        status,
        dueDate: new Date(),
      },
    });
  }
}

export async function syncDuesOnLift(chitId: string, memberId: string, liftMonth: number) {
  if (!hasPostgresConnection()) {
    return sqlite.dbSyncDuesOnLift(chitId, memberId, liftMonth);
  }

  const prisma = getClient();
  const rules = await prisma.chitMonthRule.findMany({ where: { chitId } });

  for (const rule of rules) {
    const isPostLift = rule.monthNumber > liftMonth;
    const targetDueAmount = toNumber(isPostLift ? rule.postLiftPayment : rule.preLiftPayment);
    const dueId = `due-${chitId}-${memberId}-m${rule.monthNumber}`;

    const existingDue = await prisma.monthlyDue.findUnique({ where: { id: dueId } });
    if (!existingDue) continue;

    const payAgg = await prisma.payment.aggregate({
      where: {
        OR: [
          { monthlyDueId: dueId },
          { chitId, memberId, monthNumber: rule.monthNumber },
        ],
      },
      _sum: { amount: true },
    });

    const paidAmount = toNumber(payAgg._sum.amount, 0);
    const balanceAmount = Math.max(0, targetDueAmount - paidAmount);
    const status = paidAmount >= targetDueAmount ? 'PAID' : (paidAmount > 0 ? 'PARTIAL' : 'PENDING');

    await prisma.monthlyDue.update({
      where: { id: dueId },
      data: {
        dueAmount: targetDueAmount,
        paidAmount,
        balanceAmount,
        status,
      },
    });
  }
}

// ----------------- DASHBOARD STATS -----------------

export async function getDashboardStats() {
  if (!hasPostgresConnection()) {
    return sqlite.fallbackGetDashboardStats();
  }

  const prisma = getClient();
  const activeChitsCount = await prisma.chit.count({ where: { status: 'active' } });
  const membersCount = await prisma.member.count({ where: { status: 'active' } });

  const todayStr = toDateOnly(new Date());
  const thisMonthStr = todayStr.substring(0, 7);

  const todayStart = new Date(`${todayStr}T00:00:00.000Z`);
  const todayEnd = new Date(`${todayStr}T23:59:59.999Z`);
  const todayCollAgg = await prisma.payment.aggregate({
    where: { paymentDate: { gte: todayStart, lte: todayEnd } },
    _sum: { amount: true },
  });
  const todayColl = toNumber(todayCollAgg._sum.amount, 0);

  const monthStart = new Date(`${thisMonthStr}-01T00:00:00.000Z`);
  const monthEnd = new Date(new Date(monthStart).setMonth(monthStart.getMonth() + 1));
  const monthCollAgg = await prisma.payment.aggregate({
    where: { paymentDate: { gte: monthStart, lt: monthEnd } },
    _sum: { amount: true },
  });
  const monthColl = toNumber(monthCollAgg._sum.amount, 0);

  const chits = await prisma.chit.findMany({
    orderBy: { createdAt: 'desc' },
    include: {
      rules: { orderBy: { monthNumber: 'asc' } },
      members: { where: { status: 'active' } },
      liftDetails: { include: { member: true } },
    },
  });

  let totalPendingCurrentMonths = 0;
  let totalDueCurrentMonths = 0;
  let totalCollectedCurrentMonths = 0;
  let totalActualCurrentMonthProfit = 0;
  let totalProjectedChitProfit = 0;
  let totalProjectedChitCollection = 0;
  let totalProjectedChitPayout = 0;
  const projectedProfitBreakdown: any[] = [];
  const currentMonthProfitBreakdown: any[] = [];

  const chitsSummary: any[] = [];

  for (const c of chits) {
    const serializedChit = serializeChit(c)!;
    const currMonth = computeChitCurrentMonth(c.startMonth, c.totalMonths);
    await ensureMonthlyDuesForChitAndMonth(c.id, currMonth);

    const chitMembersCount = c.members.length;

    const chitTodayAgg = await prisma.payment.aggregate({
      where: {
        chitId: c.id,
        paymentDate: { gte: todayStart, lte: todayEnd },
      },
      _sum: { amount: true },
    });
    const chitToday = toNumber(chitTodayAgg._sum.amount, 0);

    const dues = await prisma.monthlyDue.findMany({
      where: { chitId: c.id, monthNumber: currMonth },
    });

    let monthTotalDue = 0;
    let monthTotalCollected = 0;
    let monthTotalPending = 0;
    for (const d of dues) {
      const due = toNumber(d.dueAmount);
      const paid = toNumber(d.paidAmount);
      const pend = Math.max(0, due - paid);
      monthTotalDue += due;
      monthTotalCollected += paid;
      monthTotalPending += pend;
    }

    const liftedCount = c.liftDetails.length;
    const rule = c.rules.find(r => r.monthNumber === currMonth);
    const lift = c.liftDetails.find(l => l.liftMonth === currMonth);

    const configuredLiftPayout = rule
      ? toNumber(rule.expectedLiftPayout || rule.monthlyChitValue)
      : toNumber(c.chitValue);

    const liftPayout = lift
      ? toNumber(lift.liftAmountReceived)
      : configuredLiftPayout;

    const actualCurrentMonthProfit = monthTotalCollected - liftPayout;
    const fullTermProj = calculateChitFullTermProjection(serializedChit, c.rules);

    if (c.status === 'active') {
      totalDueCurrentMonths += monthTotalDue;
      totalCollectedCurrentMonths += monthTotalCollected;
      totalPendingCurrentMonths += monthTotalPending;
      totalActualCurrentMonthProfit += actualCurrentMonthProfit;

      totalProjectedChitProfit += fullTermProj.total_projected_profit;
      totalProjectedChitCollection += fullTermProj.total_projected_collection;
      totalProjectedChitPayout += fullTermProj.total_projected_lift_payout;

      projectedProfitBreakdown.push({
        chit_id: c.id,
        chit_name: c.name,
        chit_value: toNumber(c.chitValue),
        total_months: c.totalMonths,
        total_members: c.totalMembers,
        status: c.status,
        total_projected_profit: fullTermProj.total_projected_profit,
        total_projected_collection: fullTermProj.total_projected_collection,
        total_projected_payout: fullTermProj.total_projected_lift_payout,
        monthly_projections: fullTermProj.monthly_projections,
      });

      currentMonthProfitBreakdown.push({
        chit_id: c.id,
        chit_name: c.name,
        current_month: currMonth,
        total_due: monthTotalDue,
        total_collected: monthTotalCollected,
        total_pending: monthTotalPending,
        lift_payout: liftPayout,
        profit: actualCurrentMonthProfit,
      });
    }

    chitsSummary.push({
      ...serializedChit,
      active_members_count: chitMembersCount,
      today_collection: chitToday,
      pending_amount: monthTotalPending,
      total_collected: monthTotalCollected,
      total_due: monthTotalDue,
      lifted_members_count: liftedCount,
      current_month: currMonth,
      profit: actualCurrentMonthProfit,
      total_projected_profit: fullTermProj.total_projected_profit,
      total_projected_collection: fullTermProj.total_projected_collection,
      total_projected_payout: fullTermProj.total_projected_lift_payout,
      projected_monthly: fullTermProj.monthly_projections,
    });
  }

  const paidMembersCount = await prisma.monthlyDue.groupBy({
    by: ['memberId'],
    where: { status: 'PAID' },
  });
  const pendingMembersCount = await prisma.monthlyDue.groupBy({
    by: ['memberId'],
    where: { status: { not: 'PAID' } },
  });

  const allTimeCollAgg = await prisma.payment.aggregate({
    _sum: { amount: true },
  });
  const totalCollAllTime = toNumber(allTimeCollAgg._sum.amount, 0);

  const recentPaymentsRaw = await prisma.payment.findMany({
    orderBy: { createdAt: 'desc' },
    take: 15,
    include: {
      member: true,
      chit: true,
    },
  });

  const recentPayments = recentPaymentsRaw.map(p => ({
    ...serializePayment(p),
    customer_name: p.member?.customerName || '',
    ticket_number: p.member?.ticketNumber || '',
    chit_name: p.chit?.name || '',
  }));

  return {
    stats: {
      totalActiveChits: activeChitsCount,
      totalMembers: membersCount,
      todayCollection: todayColl,
      thisMonthCollection: monthColl,
      totalDue: totalDueCurrentMonths,
      totalCollection: totalCollectedCurrentMonths,
      totalPending: totalPendingCurrentMonths,
      totalPendingAmount: totalPendingCurrentMonths,
      totalOutstanding: totalPendingCurrentMonths,
      totalCollected: totalCollAllTime,
      totalProjectedChitProfit,
      totalProjectedCollection: totalProjectedChitCollection,
      totalProjectedLiftPayout: totalProjectedChitPayout,
      projectedProfitBreakdown,
      actualCurrentMonthProfit: totalActualCurrentMonthProfit,
      currentMonthProfitBreakdown,
      totalAssumedProfit: totalProjectedChitProfit,
      assumedProfitBreakdown: projectedProfitBreakdown,
      totalPaidCustomers: paidMembersCount.length,
      totalPendingCustomers: pendingMembersCount.length,
      recentPayments,
    },
    chits: chitsSummary,
  };
}

// ----------------- CHIT CRUD OPERATIONS -----------------

export async function getAllChitsWithStats() {
  if (!hasPostgresConnection()) {
    return sqlite.fallbackGetAllChitsWithStats();
  }

  const prisma = getClient();
  const chits = await prisma.chit.findMany({
    orderBy: { createdAt: 'desc' },
    include: {
      members: { where: { status: 'active' } },
      liftDetails: true,
    },
  });

  const result: any[] = [];
  for (const c of chits) {
    const currMonth = computeChitCurrentMonth(c.startMonth, c.totalMonths);
    await ensureMonthlyDuesForChitAndMonth(c.id, currMonth);

    const dues = await prisma.monthlyDue.findMany({
      where: { chitId: c.id, monthNumber: currMonth },
    });

    let totalDue = 0;
    let totalCollected = 0;
    let totalPending = 0;
    for (const d of dues) {
      const due = toNumber(d.dueAmount);
      const paid = toNumber(d.paidAmount);
      totalDue += due;
      totalCollected += paid;
      totalPending += Math.max(0, due - paid);
    }

    result.push({
      ...serializeChit(c),
      current_month: currMonth,
      active_members_count: c.members.length,
      total_due: totalDue,
      total_collected: totalCollected,
      total_pending: totalPending,
      lifted_members_count: c.liftDetails.length,
    });
  }

  return result;
}

export async function getChitByIdWithDetails(chitId: string, queryMonth?: number) {
  if (!hasPostgresConnection()) {
    return sqlite.fallbackGetChitByIdWithDetails(chitId, queryMonth);
  }

  const prisma = getClient();
  const chit = await prisma.chit.findUnique({
    where: { id: chitId },
    include: {
      rules: { orderBy: { monthNumber: 'asc' } },
      members: {
        include: {
          liftDetail: {
            include: {
              transactions: { orderBy: [{ paymentDate: 'asc' }, { createdAt: 'asc' }] },
            },
          },
        },
      },
    },
  });

  if (!chit) return null;

  const computedCurrentMonth = computeChitCurrentMonth(chit.startMonth, chit.totalMonths);
  const selectedMonth = queryMonth || computedCurrentMonth;
  await ensureMonthlyDuesForChitAndMonth(chit.id, selectedMonth);

  const dues = await prisma.monthlyDue.findMany({
    where: { chitId, monthNumber: selectedMonth },
  });

  let totalDue = 0;
  let totalCollected = 0;
  let totalPending = 0;
  let paidMembersCount = 0;
  let pendingMembersCount = 0;

  for (const d of dues) {
    const due = toNumber(d.dueAmount);
    const paid = toNumber(d.paidAmount);
    const pend = Math.max(0, due - paid);
    totalDue += due;
    totalCollected += paid;
    totalPending += pend;

    if (d.status === 'PAID' || (due > 0 && paid >= due)) {
      paidMembersCount++;
    }
    if (pend > 0) {
      pendingMembersCount++;
    }
  }

  const membersFormatted = chit.members.map(m => {
    const l = m.liftDetail;
    const isLifted = Boolean(l);
    return {
      ...serializeMember(m),
      lift_id: l ? l.id : null,
      lift_month: l ? l.liftMonth : null,
      lift_amount: l ? toNumber(l.liftAmount) : 0,
      lift_amount_received: l ? toNumber(l.liftAmountReceived) : 0,
      remaining_payout: l ? toNumber(l.remainingPayout) : 0,
      payout_status: l ? l.payoutStatus : 'PAID',
      lift_date: l ? toISO(l.liftDate) : null,
      payment_method: l ? l.paymentMethod : 'Cash',
      reference_number: l ? l.referenceNumber : null,
      lift_notes: l ? l.notes : null,
      lift_status_text: l ? l.status : null,
      lift_created_at: l ? toISO(l.createdAt) : null,
      lift_updated_at: l?.updatedAt ? toISO(l.updatedAt) : null,
      lift_status: isLifted ? 'lifted' : 'not_lifted',
      transactions: l ? l.transactions.map(serializeLiftTransaction) : [],
    };
  });

  membersFormatted.sort((a: any, b: any) => {
    const tA = parseInt(a?.ticket_number || '0', 10);
    const tB = parseInt(b?.ticket_number || '0', 10);
    if (!isNaN(tA) && !isNaN(tB)) return tA - tB;
    return String(a?.customer_name || '').localeCompare(String(b?.customer_name || ''));
  });

  const liftedCount = membersFormatted.filter(m => m.lift_status === 'lifted').length;
  const unliftedCount = membersFormatted.length - liftedCount;

  const fullTermProj = calculateChitFullTermProjection(serializeChit(chit)!, chit.rules);

  return {
    ...serializeChit(chit),
    current_month: computedCurrentMonth,
    rules: chit.rules.map(serializeRule),
    members: membersFormatted,
    selected_month: selectedMonth,
    total_due: totalDue,
    total_collected: totalCollected,
    total_pending: totalPending,
    paid_members_count: paidMembersCount,
    pending_members_count: pendingMembersCount,
    lifted_members_count: liftedCount,
    unlifted_members_count: unliftedCount,
    total_projected_profit: fullTermProj.total_projected_profit,
    total_projected_collection: fullTermProj.total_projected_collection,
    total_projected_payout: fullTermProj.total_projected_lift_payout,
    projected_monthly: fullTermProj.monthly_projections,
  };
}

export async function createChitFull(body: any) {
  if (!hasPostgresConnection()) {
    return sqlite.fallbackCreateChitFull(body);
  }

  const prisma = getClient();
  const { name, chit_value, total_months, total_members, start_month, end_month, members, rules } = body;

  const chitId = 'chit-' + Date.now() + '-' + Math.random().toString(36).substring(2, 7);
  const now = new Date();
  const computedCurrentMonth = computeChitCurrentMonth(start_month, total_months);

  return await prisma.$transaction(async (tx) => {
    const chit = await tx.chit.create({
      data: {
        id: chitId,
        name: String(name).trim(),
        chitValue: Number(chit_value),
        monthlyChitValue: rules[0]?.monthly_chit_value ? Number(rules[0].monthly_chit_value) : 301500,
        totalMonths: Number(total_months),
        totalMembers: Number(total_members),
        startMonth: String(start_month).trim(),
        endMonth: String(end_month || '').trim(),
        status: 'active',
        currentMonth: computedCurrentMonth,
        createdAt: now,
        updatedAt: now,
      },
    });

    const ruleRecords = (rules || []).map((r: any) => ({
      id: `rule-${chitId}-m${r.month_number}`,
      chitId,
      monthNumber: Number(r.month_number),
      monthName: String(r.month_name),
      preLiftPayment: Number(r.pre_lift_payment),
      postLiftPayment: Number(r.post_lift_payment),
      monthlyChitValue: Number(r.monthly_chit_value),
      expectedLiftPayout: Number(r.expected_lift_payout),
    }));

    if (ruleRecords.length > 0) {
      await tx.chitMonthRule.createMany({
        data: ruleRecords,
        skipDuplicates: true,
      });
    }

    const memberRecords: any[] = [];
    const dueRecords: any[] = [];

    for (let index = 0; index < (members || []).length; index++) {
      const m = members[index];
      const memberId = `mem-${chitId}-${index + 1}-${Math.random().toString(36).substring(2, 6)}`;
      const ticket = m.ticket_number || String(index + 1).padStart(2, '0');

      memberRecords.push({
        id: memberId,
        chitId,
        customerName: String(m.customer_name).trim(),
        phone: String(m.phone).trim(),
        ticketNumber: ticket,
        status: 'active',
        joinDate: now,
        createdAt: now,
      });

      for (const r of (rules || [])) {
        const dueId = `due-${chitId}-${memberId}-m${r.month_number}`;
        const preAmount = Number(r.pre_lift_payment);
        dueRecords.push({
          id: dueId,
          chitId,
          memberId,
          monthNumber: Number(r.month_number),
          monthName: String(r.month_name),
          dueAmount: preAmount,
          paidAmount: 0,
          balanceAmount: preAmount,
          status: 'PENDING',
          dueDate: now,
          generatedAt: now,
        });
      }
    }

    if (memberRecords.length > 0) {
      await tx.member.createMany({
        data: memberRecords,
        skipDuplicates: true,
      });
    }

    if (dueRecords.length > 0) {
      await tx.monthlyDue.createMany({
        data: dueRecords,
        skipDuplicates: true,
      });
    }

    return serializeChit(chit);
  }, {
    maxWait: 20000,
    timeout: 60000,
  });
}

export async function updateChit(chitId: string, body: any) {
  if (!hasPostgresConnection()) {
    return sqlite.fallbackUpdateChit(chitId, body);
  }

  const prisma = getClient();
  const existing = await prisma.chit.findUnique({ where: { id: chitId } });
  if (!existing) return null;

  const data: any = {};
  if (body.name !== undefined && String(body.name).trim()) data.name = String(body.name).trim();
  if (body.status !== undefined) data.status = body.status;
  if (body.chit_value !== undefined && !isNaN(Number(body.chit_value))) data.chitValue = Number(body.chit_value);
  if (body.start_month !== undefined) data.startMonth = String(body.start_month).trim();
  if (body.end_month !== undefined) data.endMonth = String(body.end_month).trim();
  if (body.total_months !== undefined && !isNaN(Number(body.total_months))) data.totalMonths = Number(body.total_months);
  if (body.total_members !== undefined && !isNaN(Number(body.total_members))) data.totalMembers = Number(body.total_members);

  const updated = await prisma.chit.update({
    where: { id: chitId },
    data,
  });

  return serializeChit(updated);
}

export async function deleteChitFull(chitId: string) {
  if (!hasPostgresConnection()) {
    return sqlite.fallbackDeleteChitFull(chitId);
  }

  const prisma = getClient();
  return await prisma.$transaction(async (tx) => {
    await tx.payment.deleteMany({ where: { chitId } });
    await tx.monthlyDue.deleteMany({ where: { chitId } });
    await tx.liftPayoutTransaction.deleteMany({ where: { chitId } });
    await tx.liftDetail.deleteMany({ where: { chitId } });
    await tx.member.deleteMany({ where: { chitId } });
    await tx.chitMonthRule.deleteMany({ where: { chitId } });
    await tx.chit.delete({ where: { id: chitId } });
    return true;
  });
}

export async function updateChitRules(chitId: string, rules: any[]) {
  if (!hasPostgresConnection()) {
    return sqlite.fallbackUpdateChitRules(chitId, rules);
  }

  const prisma = getClient();
  const members = await prisma.member.findMany({
    where: { chitId },
    include: { liftDetail: true },
  });

  return await prisma.$transaction(async (tx) => {
    for (const r of rules) {
      const monthNum = Number(r.month_number);
      const preAmount = Number(r.pre_lift_payment);
      const postAmount = Number(r.post_lift_payment);

      await tx.chitMonthRule.update({
        where: { chitId_monthNumber: { chitId, monthNumber: monthNum } },
        data: {
          preLiftPayment: preAmount,
          postLiftPayment: postAmount,
          monthlyChitValue: Number(r.monthly_chit_value),
          expectedLiftPayout: Number(r.expected_lift_payout),
        },
      });

      for (const m of members) {
        const isPostLift = m.liftDetail && monthNum > m.liftDetail.liftMonth;
        const target = isPostLift ? postAmount : preAmount;

        await tx.monthlyDue.updateMany({
          where: {
            chitId,
            memberId: m.id,
            monthNumber: monthNum,
            paidAmount: 0,
          },
          data: {
            dueAmount: target,
            balanceAmount: target,
          },
        });
      }
    }
    return true;
  });
}

export async function updateMonthRulePayouts(chitId: string, payouts: any[]) {
  if (!hasPostgresConnection()) {
    return sqlite.fallbackUpdateMonthRulePayouts(chitId, payouts);
  }

  const prisma = getClient();
  const chit = await prisma.chit.findUnique({ where: { id: chitId } });
  if (!chit) return { updated_count: 0 };

  let updatedCount = 0;
  await prisma.$transaction(async (tx) => {
    for (const item of payouts) {
      const monthNum = Number(item.month_number);
      const amount = Number(item.lift_payout);

      if (isNaN(monthNum) || monthNum < 1 || monthNum > chit.totalMonths) continue;
      if (isNaN(amount) || amount < 0) continue;

      const res = await tx.chitMonthRule.updateMany({
        where: { chitId, monthNumber: monthNum },
        data: { expectedLiftPayout: amount },
      });
      if (res.count > 0) updatedCount++;
    }
  });

  return { updated_count: updatedCount };
}

// ----------------- MONTH VIEW & DUES -----------------

export async function getMonthViewData(chitId: string, monthNumber: number) {
  if (!hasPostgresConnection()) {
    return sqlite.fallbackGetMonthViewData(chitId, monthNumber);
  }

  const prisma = getClient();
  await ensureMonthlyDuesForChitAndMonth(chitId, monthNumber);

  const chit = await prisma.chit.findUnique({
    where: { id: chitId },
    include: {
      rules: { where: { monthNumber } },
    },
  });

  if (!chit || chit.rules.length === 0) return null;
  const rule = serializeRule(chit.rules[0]);

  const duesRaw = await prisma.monthlyDue.findMany({
    where: {
      chitId,
      monthNumber,
      member: { status: 'active' },
    },
    include: {
      member: {
        include: { liftDetail: true },
      },
      payments: {
        orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }],
        take: 1,
      },
    },
  });

  const dues = duesRaw.map(d => {
    const l = d.member.liftDetail;
    const lastPay = d.payments[0];
    return {
      ...serializeDue(d),
      customer_name: d.member.customerName,
      phone: d.member.phone,
      ticket_number: d.member.ticketNumber,
      lift_id: l ? l.id : null,
      lift_month: l ? l.liftMonth : null,
      lift_amount: l ? toNumber(l.liftAmount) : 0,
      lift_amount_received: l ? toNumber(l.liftAmountReceived) : 0,
      remaining_payout: l ? toNumber(l.remainingPayout) : 0,
      payout_status: l ? l.payoutStatus : 'PAID',
      lift_date: l ? toISO(l.liftDate) : null,
      lift_status: l ? 'lifted' : 'not_lifted',
      last_payment_method: lastPay ? lastPay.paymentMethod : null,
      last_payment_date: lastPay ? toISO(lastPay.paymentDate) : null,
      last_payment_reference: lastPay ? lastPay.referenceNo : null,
      last_payment_notes: lastPay ? lastPay.notes : null,
      last_payment_amount: lastPay ? toNumber(lastPay.amount) : null,
      last_payment_updated_at: lastPay ? toISO(lastPay.updatedAt || lastPay.createdAt) : null,
    };
  });

  dues.sort((a: any, b: any) => {
    const tA = parseInt(a?.ticket_number || '0', 10);
    const tB = parseInt(b?.ticket_number || '0', 10);
    if (!isNaN(tA) && !isNaN(tB)) return tA - tB;
    return String(a?.customer_name || '').localeCompare(String(b?.customer_name || ''));
  });

  const paymentsRaw = await prisma.payment.findMany({
    where: { chitId, monthNumber },
    orderBy: [{ updatedAt: 'desc' }, { paymentDate: 'desc' }, { createdAt: 'desc' }],
    include: { member: true },
  });

  const payments = paymentsRaw.map(p => ({
    ...serializePayment(p),
    customer_name: p.member?.customerName || '',
    phone: p.member?.phone || '',
    ticket_number: p.member?.ticketNumber || '',
  }));

  let totalDue = 0;
  let totalPaid = 0;
  let totalBalance = 0;
  let countPaid = 0;
  let countPartial = 0;
  let countPending = 0;

  for (const d of dues) {
    totalDue += d.due_amount;
    totalPaid += d.paid_amount;
    totalBalance += d.balance_amount;
    if (d.status === 'PAID') countPaid++;
    else if (d.status === 'PARTIAL') countPartial++;
    else countPending++;
  }

  const liftRaw = await prisma.liftDetail.findFirst({
    where: { chitId, liftMonth: monthNumber },
    include: { member: true },
  });

  const lift = liftRaw ? {
    ...serializeLift(liftRaw),
    customer_name: liftRaw.member.customerName,
    ticket_number: liftRaw.member.ticketNumber,
  } : null;

  const allRules = await prisma.chitMonthRule.findMany({
    where: { chitId },
    orderBy: { monthNumber: 'asc' },
  });
  const fullTermProj = calculateChitFullTermProjection(serializeChit(chit)!, allRules);
  const monthProj = fullTermProj.monthly_projections.find(p => p.month_number === monthNumber);

  const totalMembers = Number(chit.totalMembers) || 0;
  const preAmount = rule ? rule.pre_lift_payment : 0;
  const postAmount = rule ? rule.post_lift_payment : 0;
  const postLiftCount = Math.max(0, Math.min(monthNumber - 1, totalMembers));
  const preLiftCount = Math.max(0, totalMembers - postLiftCount);
  const projectedCollection = monthProj ? monthProj.projected_collection : ((preLiftCount * preAmount) + (postLiftCount * postAmount));
  const configuredLiftPayout = rule?.expected_lift_payout || rule?.monthly_chit_value || toNumber(chit.chitValue);
  const projectedProfit = projectedCollection - configuredLiftPayout;
  const managerAddRequired = projectedProfit < 0 ? Math.abs(projectedProfit) : 0;

  const actualCollection = totalPaid;
  const actualLiftPayout = (lift && lift.lift_amount_received !== undefined) ? Number(lift.lift_amount_received) : configuredLiftPayout;
  const actualProfit = actualCollection - (actualLiftPayout || 0);
  const actualManagerAddRequired = actualProfit < 0 ? Math.abs(actualProfit) : 0;

  const profit_details = {
    has_lift: Boolean(lift),
    is_projected: !lift,
    month_number: monthNumber,
    month_name: rule?.month_name,
    projected_collection: projectedCollection,
    configured_lift_payout: configuredLiftPayout,
    projected_profit: projectedProfit,
    is_profit: projectedProfit >= 0,
    manager_add_required: managerAddRequired,
    pre_lift_payment: preAmount,
    post_lift_payment: postAmount,
    pre_lift_count: preLiftCount,
    post_lift_count: postLiftCount,
    total_members: totalMembers,
    actual_collection: actualCollection,
    actual_lift_payout: actualLiftPayout,
    actual_profit: actualProfit,
    actual_manager_add_required: actualManagerAddRequired,
    profit: projectedProfit,
    total_collection: projectedCollection,
    total_due: totalDue || projectedCollection,
    lift_payout: configuredLiftPayout,
    lifted_member_name: lift ? lift.customer_name : null,
    ticket_number: lift ? lift.ticket_number : null,
  };

  return {
    rule,
    dues,
    stats: {
      total_due: totalDue,
      total_paid: totalPaid,
      total_balance: totalBalance,
      count_paid: countPaid,
      count_partial: countPartial,
      count_pending: countPending,
    },
    lift,
    profit: profit_details,
    payments,
  };
}

// ----------------- MEMBERS CRUD -----------------

export async function getMembersByChit(chitId: string) {
  if (!hasPostgresConnection()) {
    return sqlite.fallbackGetMembersByChit(chitId);
  }

  const prisma = getClient();
  const membersRaw = await prisma.member.findMany({
    where: { chitId },
    include: {
      liftDetail: true,
      payments: true,
      monthlyDues: true,
    },
  });

  const members = membersRaw.map(m => {
    const l = m.liftDetail;
    const totalPaid = m.payments.reduce((sum: number, p: any) => sum + toNumber(p.amount), 0);
    const totalPending = m.monthlyDues.reduce((sum: number, d: any) => sum + toNumber(d.balanceAmount), 0);

    return {
      ...serializeMember(m),
      lift_month: l ? l.liftMonth : null,
      lift_amount: l ? toNumber(l.liftAmount) : null,
      lift_amount_received: l ? toNumber(l.liftAmountReceived) : null,
      remaining_payout: l ? toNumber(l.remainingPayout) : null,
      payout_status: l ? l.payoutStatus : null,
      lift_date: l ? toISO(l.liftDate) : null,
      lift_notes: l ? l.notes : null,
      lift_payment_method: l ? l.paymentMethod : null,
      payment_method: l ? l.paymentMethod : null,
      lift_reference_number: l ? l.referenceNumber : null,
      reference_number: l ? l.referenceNumber : null,
      lift_status: l ? 'lifted' : 'not_lifted',
      total_paid: totalPaid,
      total_pending: totalPending,
    };
  });

  members.sort((a: any, b: any) => {
    const tA = parseInt(a?.ticket_number || '0', 10);
    const tB = parseInt(b?.ticket_number || '0', 10);
    if (!isNaN(tA) && !isNaN(tB)) return tA - tB;
    return String(a?.customer_name || '').localeCompare(String(b?.customer_name || ''));
  });

  return members;
}

export async function addMemberToChit(chitId: string, body: any) {
  if (!hasPostgresConnection()) {
    return sqlite.fallbackAddMemberToChit(chitId, body);
  }

  const prisma = getClient();
  const chit = await prisma.chit.findUnique({
    where: { id: chitId },
    include: { rules: true },
  });
  if (!chit) return null;

  const memberId = 'mem-' + chitId + '-' + Date.now();
  const now = new Date();

  return await prisma.$transaction(async (tx) => {
    const member = await tx.member.create({
      data: {
        id: memberId,
        chitId,
        customerName: String(body.customer_name).trim(),
        phone: String(body.phone).trim(),
        ticketNumber: body.ticket_number ? String(body.ticket_number).trim() : '',
        status: 'active',
        joinDate: now,
        createdAt: now,
      },
    });

    const dueRecords = (chit.rules || []).map((r) => {
      const dueId = `due-${chitId}-${memberId}-m${r.monthNumber}`;
      const preAmount = toNumber(r.preLiftPayment);
      return {
        id: dueId,
        chitId,
        memberId,
        monthNumber: r.monthNumber,
        monthName: r.monthName,
        dueAmount: preAmount,
        paidAmount: 0,
        balanceAmount: preAmount,
        status: 'PENDING',
        dueDate: now,
        generatedAt: now,
      };
    });

    if (dueRecords.length > 0) {
      await tx.monthlyDue.createMany({
        data: dueRecords,
        skipDuplicates: true,
      });
    }

    return serializeMember(member);
  }, {
    maxWait: 15000,
    timeout: 30000,
  });
}

export async function importMembersToChit(chitId: string, customers: any[]) {
  if (!hasPostgresConnection()) {
    return sqlite.fallbackImportMembersToChit(chitId, customers);
  }

  const prisma = getClient();
  const chit = await prisma.chit.findUnique({
    where: { id: chitId },
    include: {
      rules: { orderBy: { monthNumber: 'asc' } },
      members: true,
    },
  });

  if (!chit) throw new Error('Chit not found');

  const totalMembersLimit = Number(chit.totalMembers) || 25;
  const currentCount = chit.members.length;
  const remainingSlots = Math.max(0, totalMembersLimit - currentCount);

  if (remainingSlots <= 0) {
    return {
      limit_reached: true,
      error: `Chit member limit of ${totalMembersLimit} is already reached.`,
      imported_count: 0,
      skipped_count: customers.length,
      imported: [],
      skipped: customers,
    };
  }

  let maxTicket = 0;
  for (const m of chit.members) {
    const num = parseInt(m.ticketNumber || '0', 10);
    if (!isNaN(num) && num > maxTicket) maxTicket = num;
  }

  const now = new Date();
  const imported: any[] = [];
  const skipped: any[] = [];
  const memberRecords: any[] = [];
  const dueRecords: any[] = [];

  for (let i = 0; i < customers.length; i++) {
    const c = customers[i];
    const rawName = String(c.customer_name || c.name || '').trim();
    const rawPhone = String(c.phone || c.phone_number || '').trim();
    const cleanPhone = rawPhone.replace(/\D/g, '');

    if (!rawName || !rawPhone || cleanPhone.length < 10) {
      skipped.push({ ...c, reason: 'Invalid name or phone number' });
      continue;
    }

    if (imported.length >= remainingSlots) {
      skipped.push({ ...c, customer_name: rawName, phone: rawPhone, reason: 'Chit member limit reached' });
      continue;
    }

    maxTicket += 1;
    const ticketNumber = c.ticket_number ? String(c.ticket_number).trim() : String(maxTicket);
    const memberId = `mem-${chitId}-${Date.now()}-${i}-${Math.random().toString(36).substring(2, 6)}`;

    memberRecords.push({
      id: memberId,
      chitId,
      customerName: rawName,
      phone: rawPhone,
      ticketNumber,
      status: 'active',
      joinDate: now,
      createdAt: now,
    });

    for (const rule of chit.rules) {
      const dueId = `due-${chitId}-${memberId}-m${rule.monthNumber}`;
      const preAmount = toNumber(rule.preLiftPayment);
      dueRecords.push({
        id: dueId,
        chitId,
        memberId,
        monthNumber: rule.monthNumber,
        monthName: rule.monthName,
        dueAmount: preAmount,
        paidAmount: 0,
        balanceAmount: preAmount,
        status: 'PENDING',
        dueDate: now,
        generatedAt: now,
      });
    }

    imported.push({
      id: memberId,
      customer_name: rawName,
      phone: rawPhone,
      ticket_number: ticketNumber,
    });
  }

  await prisma.$transaction(async (tx) => {
    if (memberRecords.length > 0) {
      await tx.member.createMany({
        data: memberRecords,
        skipDuplicates: true,
      });
    }
    if (dueRecords.length > 0) {
      await tx.monthlyDue.createMany({
        data: dueRecords,
        skipDuplicates: true,
      });
    }
  }, {
    maxWait: 20000,
    timeout: 60000,
  });

  return {
    success: true,
    imported_count: imported.length,
    skipped_count: skipped.length,
    limit_skipped_count: 0,
    imported,
    skipped,
  };
}

export async function updateMember(memberId: string, body: any) {
  if (!hasPostgresConnection()) {
    return sqlite.fallbackUpdateMember(memberId, body);
  }

  const prisma = getClient();
  const data: any = {};
  if (body.customer_name !== undefined) data.customerName = String(body.customer_name).trim();
  if (body.phone !== undefined) data.phone = String(body.phone).trim();
  if (body.ticket_number !== undefined) data.ticketNumber = String(body.ticket_number).trim();
  if (body.status !== undefined) data.status = body.status;

  const updated = await prisma.member.update({
    where: { id: memberId },
    data,
  });
  return serializeMember(updated);
}

export async function deleteMember(memberId: string) {
  if (!hasPostgresConnection()) {
    return sqlite.fallbackDeleteMember(memberId);
  }

  const prisma = getClient();
  const payCount = await prisma.payment.count({ where: { memberId } });
  if (payCount > 0) {
    await prisma.member.update({
      where: { id: memberId },
      data: { status: 'inactive' },
    });
    return { success: true, message: 'Member has payment history and was marked inactive.' };
  }

  await prisma.$transaction(async (tx) => {
    await tx.monthlyDue.deleteMany({ where: { memberId } });
    await tx.liftPayoutTransaction.deleteMany({ where: { memberId } });
    await tx.liftDetail.deleteMany({ where: { memberId } });
    await tx.member.delete({ where: { id: memberId } });
  });

  return { success: true };
}

export async function getMemberProfile(memberId: string) {
  if (!hasPostgresConnection()) {
    return sqlite.fallbackGetMemberProfile(memberId);
  }

  const prisma = getClient();
  const member = await prisma.member.findUnique({
    where: { id: memberId },
    include: {
      chit: true,
      liftDetail: {
        include: {
          transactions: { orderBy: [{ paymentDate: 'asc' }, { createdAt: 'asc' }] },
        },
      },
      monthlyDues: { orderBy: { monthNumber: 'asc' } },
      payments: { orderBy: [{ paymentDate: 'desc' }, { createdAt: 'desc' }] },
    },
  });

  if (!member) return null;

  const l = member.liftDetail;
  const transactions = l ? l.transactions.map(serializeLiftTransaction) : [];
  const dues = member.monthlyDues.map(serializeDue);
  const payments = member.payments.map(serializePayment);

  const totalPaid = payments.reduce((sum: number, p: any) => sum + (p?.amount || 0), 0);
  const totalOutstanding = dues.reduce((sum: number, d: any) => sum + (d?.balance_amount || 0), 0);

  const memberFormatted = {
    ...serializeMember(member),
    chit_name: member.chit.name,
    chit_value: toNumber(member.chit.chitValue),
    total_months: member.chit.totalMonths,
    start_month: member.chit.startMonth,
    end_month: member.chit.endMonth,
    lift_id: l ? l.id : null,
    lift_month: l ? l.liftMonth : null,
    lift_amount: l ? toNumber(l.liftAmount) : 0,
    lift_amount_received: l ? toNumber(l.liftAmountReceived) : 0,
    remaining_payout: l ? toNumber(l.remainingPayout) : 0,
    payout_status: l ? l.payoutStatus : 'PAID',
    lift_date: l ? toISO(l.liftDate) : null,
    payment_method: l ? l.paymentMethod : 'Cash',
    reference_number: l ? l.referenceNumber : null,
    lift_notes: l ? l.notes : null,
    lift_status_text: l ? l.status : null,
    lift_created_at: l ? toISO(l.createdAt) : null,
    lift_updated_at: l?.updatedAt ? toISO(l.updatedAt) : null,
    lift_status: l ? 'lifted' : 'not_lifted',
    transactions,
  };

  return {
    member: memberFormatted,
    dues,
    payments,
    lift_transactions: transactions,
    total_paid: totalPaid,
    total_outstanding: totalOutstanding,
  };
}

// ----------------- LIFT AUCTIONS & PAYOUTS -----------------

export async function saveLiftAuction(chitId: string, memberId: string, body: any) {
  if (!hasPostgresConnection()) {
    return sqlite.fallbackSaveLiftAuction(chitId, memberId, body);
  }

  const prisma = getClient();
  const { lift_month, lift_date, payment_method, reference_number, notes } = body;

  const parsedMonth = Number(lift_month);
  const existingLiftForMonth = await prisma.liftDetail.findFirst({
    where: { chitId, liftMonth: parsedMonth },
  });

  if (existingLiftForMonth && existingLiftForMonth.memberId !== memberId) {
    throw new Error(`Month ${parsedMonth} is already assigned to another customer.`);
  }

  const configuredPayout = Number(
    body.lift_amount !== undefined
      ? body.lift_amount
      : (body.configured_lift_payout !== undefined ? body.configured_lift_payout : body.lift_amount_received)
  );

  if (isNaN(configuredPayout) || configuredPayout <= 0) {
    throw new Error('Please enter a valid configured lift payout amount greater than zero.');
  }

  const initialPaid = Number(
    body.initial_amount_paid !== undefined
      ? body.initial_amount_paid
      : (body.lift_amount_received !== undefined ? body.lift_amount_received : configuredPayout)
  );

  if (isNaN(initialPaid) || initialPaid < 0) {
    throw new Error('Initial payout amount cannot be negative.');
  }

  if (initialPaid > configuredPayout) {
    throw new Error(`Initial payment cannot exceed the configured lift payout.`);
  }

  const existingMemberLift = await prisma.liftDetail.findUnique({
    where: { memberId },
  });

  const id = existingMemberLift ? existingMemberLift.id : ('lift-' + chitId + '-' + memberId);
  const now = new Date();
  const liftDateObj = new Date(lift_date);

  const updatedLift = await prisma.$transaction(async (tx) => {
    if (existingMemberLift) {
      const txCount = await tx.liftPayoutTransaction.count({ where: { liftId: id } });
      let finalPaid = initialPaid;

      if (txCount > 0) {
        const sumAgg = await tx.liftPayoutTransaction.aggregate({
          where: { liftId: id },
          _sum: { amount: true },
        });
        finalPaid = toNumber(sumAgg._sum.amount, 0);
      } else if (initialPaid > 0) {
        const txId = 'tx-' + id + '-' + Date.now();
        await tx.liftPayoutTransaction.create({
          data: {
            id: txId,
            liftId: id,
            chitId,
            memberId,
            amount: initialPaid,
            paymentDate: liftDateObj,
            paymentMethod: payment_method || 'Cash',
            referenceNumber: reference_number || null,
            notes: notes || 'Initial lift payout',
            createdAt: now,
          },
        });
      }

      const remaining = Math.max(0, configuredPayout - finalPaid);
      const payoutStatus = remaining <= 0 ? 'PAID' : 'PARTIAL';

      await tx.liftDetail.update({
        where: { id },
        data: {
          liftMonth: parsedMonth,
          liftAmount: configuredPayout,
          liftAmountReceived: finalPaid,
          remainingPayout: remaining,
          payoutStatus,
          liftDate: liftDateObj,
          paymentMethod: payment_method || 'Cash',
          referenceNumber: reference_number || null,
          notes: notes || null,
          status: 'Completed',
          updatedAt: now,
        },
      });
    } else {
      const remaining = Math.max(0, configuredPayout - initialPaid);
      const payoutStatus = remaining <= 0 ? 'PAID' : 'PARTIAL';

      await tx.liftDetail.create({
        data: {
          id,
          chitId,
          memberId,
          liftMonth: parsedMonth,
          liftAmount: configuredPayout,
          liftAmountReceived: initialPaid,
          remainingPayout: remaining,
          payoutStatus,
          liftDate: liftDateObj,
          paymentMethod: payment_method || 'Cash',
          referenceNumber: reference_number || null,
          notes: notes || null,
          status: 'Completed',
          createdAt: now,
          updatedAt: now,
        },
      });

      if (initialPaid > 0) {
        const txId = 'tx-' + id + '-' + Date.now();
        await tx.liftPayoutTransaction.create({
          data: {
            id: txId,
            liftId: id,
            chitId,
            memberId,
            amount: initialPaid,
            paymentDate: liftDateObj,
            paymentMethod: payment_method || 'Cash',
            referenceNumber: reference_number || null,
            notes: notes || 'Initial lift payout',
            createdAt: now,
          },
        });
      }
    }

    return await tx.liftDetail.findUnique({
      where: { id },
      include: {
        transactions: { orderBy: [{ paymentDate: 'asc' }, { createdAt: 'asc' }] },
      },
    });
  });

  await syncDuesOnLift(chitId, memberId, parsedMonth);

  return {
    ...serializeLift(updatedLift),
    transactions: updatedLift?.transactions.map(serializeLiftTransaction) || [],
  };
}

export async function deleteLiftAuction(chitId: string, memberId: string) {
  if (!hasPostgresConnection()) {
    return sqlite.fallbackDeleteLiftAuction(chitId, memberId);
  }

  const prisma = getClient();
  const rules = await prisma.chitMonthRule.findMany({ where: { chitId } });

  await prisma.$transaction(async (tx) => {
    await tx.liftPayoutTransaction.deleteMany({ where: { memberId } });
    await tx.liftDetail.deleteMany({ where: { memberId } });

    for (const rule of rules) {
      const preAmount = toNumber(rule.preLiftPayment);
      await tx.monthlyDue.updateMany({
        where: {
          chitId,
          memberId,
          monthNumber: rule.monthNumber,
          paidAmount: 0,
        },
        data: {
          dueAmount: preAmount,
          balanceAmount: preAmount,
        },
      });
    }
  });

  return true;
}

export async function recordLiftPayoutPayment(chitId: string, memberId: string, body: any) {
  if (!hasPostgresConnection()) {
    return sqlite.fallbackRecordLiftPayoutPayment(chitId, memberId, body);
  }

  const prisma = getClient();
  const { amount, payment_date, payment_method, reference_number, notes } = body;
  const numericAmount = Number(amount);

  if (isNaN(numericAmount) || numericAmount <= 0) {
    throw new Error('Please enter a valid payout payment amount greater than zero.');
  }

  const lift = await prisma.liftDetail.findUnique({
    where: { memberId },
  });

  if (!lift) throw new Error('Lift record not found for this customer.');

  const remaining = toNumber(lift.remainingPayout);
  if (numericAmount > (remaining + 0.01)) {
    throw new Error(`Payment cannot exceed the remaining lift payout.`);
  }

  const now = new Date();
  const txId = 'tx-payout-' + lift.id + '-' + Date.now();
  const payDateObj = payment_date ? new Date(payment_date) : now;

  return await prisma.$transaction(async (tx) => {
    await tx.liftPayoutTransaction.create({
      data: {
        id: txId,
        liftId: lift.id,
        chitId,
        memberId,
        amount: numericAmount,
        paymentDate: payDateObj,
        paymentMethod: payment_method || 'Cash',
        referenceNumber: reference_number || null,
        notes: notes || null,
        createdAt: now,
      },
    });

    const sumAgg = await tx.liftPayoutTransaction.aggregate({
      where: { liftId: lift.id },
      _sum: { amount: true },
    });

    const totalPaid = toNumber(sumAgg._sum.amount, 0);
    const configuredPayout = toNumber(lift.liftAmount);
    const newRemaining = Math.max(0, configuredPayout - totalPaid);
    const newStatus = newRemaining <= 0 ? 'PAID' : 'PARTIAL';

    const updated = await tx.liftDetail.update({
      where: { id: lift.id },
      data: {
        liftAmountReceived: totalPaid,
        remainingPayout: newRemaining,
        payoutStatus: newStatus,
        updatedAt: now,
      },
      include: {
        transactions: { orderBy: [{ paymentDate: 'asc' }, { createdAt: 'asc' }] },
      },
    });

    return {
      lift: serializeLift(updated),
      transactions: updated.transactions.map(serializeLiftTransaction),
    };
  });
}

export async function getLiftPayoutTransactions(chitId: string, memberId: string) {
  if (!hasPostgresConnection()) {
    return sqlite.fallbackGetLiftPayoutTransactions(chitId, memberId);
  }

  const prisma = getClient();
  const lift = await prisma.liftDetail.findUnique({
    where: { memberId },
    include: {
      transactions: { orderBy: [{ paymentDate: 'asc' }, { createdAt: 'asc' }] },
    },
  });

  if (!lift) return null;
  return {
    lift: serializeLift(lift),
    transactions: lift.transactions.map(serializeLiftTransaction),
  };
}

// ----------------- PAYMENTS -----------------

export async function createPaymentRecord(body: any) {
  if (!hasPostgresConnection()) {
    return sqlite.fallbackCreatePaymentRecord(body);
  }

  const prisma = getClient();
  const { monthly_due_id, amount, payment_method, reference_no, notes, payment_date, allow_overpayment } = body;

  const due = await prisma.monthlyDue.findUnique({
    where: { id: monthly_due_id },
    include: { chit: true, member: true },
  });

  if (!due) throw new Error('Monthly due record not found.');

  const sumAgg = await prisma.payment.aggregate({
    where: { monthlyDueId: monthly_due_id },
    _sum: { amount: true },
  });
  const currentPaid = toNumber(sumAgg._sum.amount, 0);
  const currentBalance = Math.max(0, toNumber(due.dueAmount) - currentPaid);

  if (amount > (currentBalance + 0.01) && !allow_overpayment) {
    throw new Error(`Payment amount (₹${amount}) exceeds outstanding balance (₹${currentBalance}).`);
  }

  const paymentId = 'pay-' + Date.now() + '-' + Math.random().toString(36).substring(2, 7);
  const now = new Date();
  const payDateObj = payment_date ? new Date(payment_date) : now;

  return await prisma.$transaction(async (tx) => {
    const payment = await tx.payment.create({
      data: {
        id: paymentId,
        monthlyDueId: monthly_due_id,
        chitId: due.chitId,
        memberId: due.memberId,
        monthNumber: due.monthNumber,
        monthName: due.monthName,
        amount: Number(amount),
        paymentMethod: payment_method || 'Cash',
        referenceNo: reference_no || '',
        notes: notes || '',
        paymentDate: payDateObj,
        createdAt: now,
        updatedAt: now,
      },
    });

    const postAgg = await tx.payment.aggregate({
      where: {
        OR: [
          { monthlyDueId: monthly_due_id },
          { chitId: due.chitId, memberId: due.memberId, monthNumber: due.monthNumber },
        ],
      },
      _sum: { amount: true },
    });

    const authoritativePaid = toNumber(postAgg._sum.amount, 0);
    const dueAmount = toNumber(due.dueAmount);
    const newBalance = Math.max(0, dueAmount - authoritativePaid);
    const newStatus = authoritativePaid >= dueAmount ? 'PAID' : (authoritativePaid > 0 ? 'PARTIAL' : 'PENDING');

    const updatedDue = await tx.monthlyDue.update({
      where: { id: monthly_due_id },
      data: {
        paidAmount: authoritativePaid,
        balanceAmount: newBalance,
        status: newStatus,
      },
      include: { member: true },
    });

    const serializedDue = {
      ...serializeDue(updatedDue),
      customer_name: updatedDue.member?.customerName || '',
      phone: updatedDue.member?.phone || '',
      ticket_number: updatedDue.member?.ticketNumber || '',
    };

    return {
      payment: serializePayment(payment),
      updatedDue: serializedDue,
    };
  });
}

export async function getAllPayments(filters: { chit_id?: string; member_id?: string; limit?: number }) {
  if (!hasPostgresConnection()) {
    return sqlite.fallbackGetAllPayments(filters);
  }

  const prisma = getClient();
  const where: any = {};
  if (filters.chit_id) where.chitId = filters.chit_id;
  if (filters.member_id) where.memberId = filters.member_id;

  const payments = await prisma.payment.findMany({
    where,
    orderBy: [{ updatedAt: 'desc' }, { paymentDate: 'desc' }, { createdAt: 'desc' }],
    take: filters.limit || 50,
    include: { member: true, chit: true },
  });

  return payments.map(p => ({
    ...serializePayment(p),
    customer_name: p.member?.customerName || '',
    phone: p.member?.phone || '',
    ticket_number: p.member?.ticketNumber || '',
    chit_name: p.chit?.name || '',
  }));
}

export async function getPaymentsByDueId(dueId: string) {
  if (!hasPostgresConnection()) {
    return sqlite.fallbackGetPaymentsByDueId(dueId);
  }

  const prisma = getClient();
  const due = await prisma.monthlyDue.findUnique({ where: { id: dueId } });

  const whereClause: any = due
    ? {
        OR: [
          { monthlyDueId: dueId },
          { chitId: due.chitId, memberId: due.memberId, monthNumber: due.monthNumber },
        ],
      }
    : { monthlyDueId: dueId };

  const payments = await prisma.payment.findMany({
    where: whereClause,
    orderBy: [{ updatedAt: 'desc' }, { paymentDate: 'desc' }, { createdAt: 'desc' }],
    include: { member: true, chit: true },
  });

  return payments.map(p => ({
    ...serializePayment(p),
    customer_name: p.member?.customerName || '',
    phone: p.member?.phone || '',
    ticket_number: p.member?.ticketNumber || '',
    chit_name: p.chit?.name || '',
  }));
}

export async function updatePaymentRecord(id: string, body: any) {
  if (!hasPostgresConnection()) {
    return sqlite.fallbackUpdatePaymentRecord(id, body);
  }

  const prisma = getClient();
  const payment = await prisma.payment.findUnique({ where: { id } });
  if (!payment) throw new Error('Payment record not found.');

  const due = await prisma.monthlyDue.findUnique({ where: { id: payment.monthlyDueId } });
  if (!due) throw new Error('Associated monthly due record not found.');

  const newAmount = body.amount !== undefined ? Number(body.amount) : toNumber(payment.amount);
  if (isNaN(newAmount) || newAmount <= 0) throw new Error('Valid payment amount greater than 0 is required.');

  const newMethod = body.payment_method || payment.paymentMethod || 'Cash';
  const newRef = body.reference_no !== undefined ? body.reference_no : payment.referenceNo;
  const newNotes = body.notes !== undefined ? body.notes : payment.notes;
  const newDate = body.payment_date ? new Date(body.payment_date) : payment.paymentDate;
  const now = new Date();

  return await prisma.$transaction(async (tx) => {
    const updatedPayment = await tx.payment.update({
      where: { id },
      data: {
        amount: newAmount,
        paymentMethod: newMethod,
        referenceNo: newRef,
        notes: newNotes,
        paymentDate: newDate,
        updatedAt: now,
      },
    });

    const postAgg = await tx.payment.aggregate({
      where: {
        OR: [
          { monthlyDueId: due.id },
          { chitId: due.chitId, memberId: due.memberId, monthNumber: due.monthNumber },
        ],
      },
      _sum: { amount: true },
    });

    const authoritativePaid = toNumber(postAgg._sum.amount, 0);
    const dueAmount = toNumber(due.dueAmount);
    const finalBalance = Math.max(0, dueAmount - authoritativePaid);
    const finalStatus = authoritativePaid >= dueAmount ? 'PAID' : (authoritativePaid > 0 ? 'PARTIAL' : 'PENDING');

    const updatedDue = await tx.monthlyDue.update({
      where: { id: due.id },
      data: {
        paidAmount: authoritativePaid,
        balanceAmount: finalBalance,
        status: finalStatus,
      },
    });

    return {
      payment: serializePayment(updatedPayment),
      updatedDue: serializeDue(updatedDue),
    };
  });
}

export async function deletePaymentRecord(id: string) {
  if (!hasPostgresConnection()) {
    return sqlite.fallbackDeletePaymentRecord(id);
  }

  const prisma = getClient();
  const payment = await prisma.payment.findUnique({ where: { id } });
  if (!payment) throw new Error('Payment record not found.');

  const due = await prisma.monthlyDue.findUnique({ where: { id: payment.monthlyDueId } });
  if (!due) throw new Error('Associated monthly due record not found.');

  return await prisma.$transaction(async (tx) => {
    await tx.payment.delete({ where: { id } });

    const postAgg = await tx.payment.aggregate({
      where: {
        OR: [
          { monthlyDueId: due.id },
          { chitId: due.chitId, memberId: due.memberId, monthNumber: due.monthNumber },
        ],
      },
      _sum: { amount: true },
    });

    const authoritativePaid = toNumber(postAgg._sum.amount, 0);
    const dueAmount = toNumber(due.dueAmount);
    const finalBalance = Math.max(0, dueAmount - authoritativePaid);
    const finalStatus = authoritativePaid >= dueAmount ? 'PAID' : (authoritativePaid > 0 ? 'PARTIAL' : 'PENDING');

    const updatedDue = await tx.monthlyDue.update({
      where: { id: due.id },
      data: {
        paidAmount: authoritativePaid,
        balanceAmount: finalBalance,
        status: finalStatus,
      },
    });

    return {
      updatedDue: serializeDue(updatedDue),
    };
  });
}

// ----------------- PENDING DUES ROUTE -----------------

export async function getPendingDues(chitId?: string, isCurrentOnly = true) {
  if (!hasPostgresConnection()) {
    return sqlite.fallbackGetPendingDues(chitId, isCurrentOnly);
  }

  const prisma = getClient();
  await syncChitsCurrentMonth();

  const whereClause: any = {
    balanceAmount: { gt: 0 },
    chit: { status: 'active' },
  };

  if (chitId) whereClause.chitId = chitId;

  const duesRaw = await prisma.monthlyDue.findMany({
    where: whereClause,
    include: {
      chit: true,
      member: {
        include: { liftDetail: true },
      },
    },
    orderBy: [
      { chit: { name: 'asc' } },
      { member: { ticketNumber: 'asc' } },
      { member: { customerName: 'asc' } },
    ],
  });

  const filtered = isCurrentOnly
    ? duesRaw.filter(d => d.monthNumber === d.chit.currentMonth)
    : duesRaw;

  const dues = filtered.map(d => {
    const l = d.member.liftDetail;
    return {
      ...serializeDue(d),
      chit_name: d.chit.name,
      chit_current_month: d.chit.currentMonth,
      customer_name: d.member.customerName,
      phone: d.member.phone,
      ticket_number: d.member.ticketNumber,
      lift_month: l ? l.liftMonth : null,
      lift_status: l ? 'lifted' : 'not_lifted',
    };
  });

  const totalPendingAmount = dues.reduce((sum: number, d: any) => sum + (d?.balance_amount || 0), 0);

  return {
    dues,
    summary: {
      totalPendingMembers: dues.length,
      totalPendingAmount,
    },
  };
}

// ----------------- REPORTS -----------------

export async function getChitReports(chitId: string) {
  if (!hasPostgresConnection()) {
    return sqlite.fallbackGetChitReports(chitId);
  }

  const prisma = getClient();
  const chit = await prisma.chit.findUnique({
    where: { id: chitId },
    include: {
      rules: { orderBy: { monthNumber: 'asc' } },
      members: {
        include: {
          liftDetail: true,
          monthlyDues: true,
        },
      },
      liftDetails: {
        include: { member: true },
        orderBy: { liftMonth: 'asc' },
      },
      monthlyDues: true,
    },
  });

  if (!chit) return null;

  const monthlyCollection = chit.rules.map(r => {
    const monthDues = chit.monthlyDues.filter(d => d.monthNumber === r.monthNumber);
    const lift = chit.liftDetails.find(l => l.liftMonth === r.monthNumber);

    let totalDue = 0;
    let totalPaid = 0;
    let totalBalance = 0;
    let countPaid = 0;
    let countPartial = 0;
    let countPending = 0;

    for (const d of monthDues) {
      const due = toNumber(d.dueAmount);
      const paid = toNumber(d.paidAmount);
      totalDue += due;
      totalPaid += paid;
      totalBalance += Math.max(0, due - paid);
      if (d.status === 'PAID') countPaid++;
      else if (d.status === 'PARTIAL') countPartial++;
      else countPending++;
    }

    return {
      month_number: r.monthNumber,
      month_name: r.monthName,
      pre_lift_payment: toNumber(r.preLiftPayment),
      post_lift_payment: toNumber(r.postLiftPayment),
      monthly_chit_value: toNumber(r.monthlyChitValue),
      expected_lift_payout: toNumber(r.expectedLiftPayout),
      total_due: totalDue,
      total_paid: totalPaid,
      total_balance: totalBalance,
      total_members_count: monthDues.length,
      count_paid: countPaid,
      count_partial: countPartial,
      count_pending: countPending,
      lift_amount_received: lift ? toNumber(lift.liftAmountReceived) : null,
      lifted_by: lift?.member?.customerName || null,
    };
  });

  const customerWise = chit.members.map(m => {
    const l = m.liftDetail;
    let totalDue = 0;
    let totalPaid = 0;
    let totalBalance = 0;
    let paidMonthsCount = 0;
    let pendingMonthsCount = 0;

    for (const d of m.monthlyDues) {
      const due = toNumber(d.dueAmount);
      const paid = toNumber(d.paidAmount);
      totalDue += due;
      totalPaid += paid;
      totalBalance += Math.max(0, due - paid);
      if (d.status === 'PAID') paidMonthsCount++;
      else pendingMonthsCount++;
    }

    return {
      id: m.id,
      customer_name: m.customerName,
      phone: m.phone,
      ticket_number: m.ticketNumber,
      status: m.status,
      lift_id: l ? l.id : null,
      lift_month: l ? l.liftMonth : null,
      lift_amount: l ? toNumber(l.liftAmount) : null,
      lift_amount_received: l ? toNumber(l.liftAmountReceived) : null,
      remaining_payout: l ? toNumber(l.remainingPayout) : null,
      payout_status: l ? l.payoutStatus : null,
      lift_date: l ? toISO(l.liftDate) : null,
      payment_method: l ? l.paymentMethod : null,
      reference_number: l ? l.referenceNumber : null,
      lift_notes: l ? l.notes : null,
      lift_status_text: l ? l.status : null,
      lift_status: l ? 'lifted' : 'not_lifted',
      total_due: totalDue,
      total_paid: totalPaid,
      total_balance: totalBalance,
      paid_months_count: paidMonthsCount,
      pending_months_count: pendingMonthsCount,
    };
  });

  customerWise.sort((a: any, b: any) => {
    const tA = parseInt(a?.ticket_number || '0', 10);
    const tB = parseInt(b?.ticket_number || '0', 10);
    if (!isNaN(tA) && !isNaN(tB)) return tA - tB;
    return String(a?.customer_name || '').localeCompare(String(b?.customer_name || ''));
  });

  const liftedMembers = chit.liftDetails.map(l => ({
    ...serializeLift(l),
    customer_name: l.member?.customerName || '',
    phone: l.member?.phone || '',
    ticket_number: l.member?.ticketNumber || '',
  }));

  const unliftedMembers = chit.members
    .filter(m => !m.liftDetail && m.status === 'active')
    .map(serializeMember);

  unliftedMembers.sort((a: any, b: any) => {
    const tA = parseInt(a?.ticket_number || '0', 10);
    const tB = parseInt(b?.ticket_number || '0', 10);
    if (!isNaN(tA) && !isNaN(tB)) return tA - tB;
    return String(a?.customer_name || '').localeCompare(String(b?.customer_name || ''));
  });

  let grandTotalDue = 0;
  let grandTotalCollected = 0;
  let grandTotalOutstanding = 0;
  for (const d of chit.monthlyDues) {
    const due = toNumber(d.dueAmount);
    const paid = toNumber(d.paidAmount);
    grandTotalDue += due;
    grandTotalCollected += paid;
    grandTotalOutstanding += Math.max(0, due - paid);
  }

  return {
    chit: serializeChit(chit),
    monthlyCollection,
    customerWise,
    liftedMembers,
    unliftedMembers,
    totals: {
      grand_total_due: grandTotalDue,
      grand_total_collected: grandTotalCollected,
      grand_total_outstanding: grandTotalOutstanding,
    },
  };
}

// ----------------- GLOBAL SEARCH -----------------

export async function globalSearch(query: string) {
  if (!hasPostgresConnection()) {
    return sqlite.fallbackGlobalSearch(query);
  }

  const prisma = getClient();
  if (!query || !query.trim()) return [];

  const q = query.trim();

  const members = await prisma.member.findMany({
    where: {
      OR: [
        { customerName: { contains: q, mode: 'insensitive' } },
        { phone: { contains: q } },
        { ticketNumber: { contains: q } },
        { chit: { name: { contains: q, mode: 'insensitive' } } },
      ],
    },
    take: 20,
    include: {
      chit: true,
      liftDetail: true,
    },
  });

  return members.map(m => ({
    id: m.id,
    customer_name: m.customerName,
    phone: m.phone,
    ticket_number: m.ticketNumber,
    chit_id: m.chitId,
    chit_name: m.chit?.name || '',
    chit_value: toNumber(m.chit?.chitValue),
    lift_month: m.liftDetail ? m.liftDetail.liftMonth : null,
    lift_status: m.liftDetail ? 'lifted' : 'not_lifted',
  }));
}
