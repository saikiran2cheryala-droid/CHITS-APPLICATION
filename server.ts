import express from 'express';
import path from 'path';
import crypto from 'crypto';
import cookieParser from 'cookie-parser';
import { createServer as createViteServer } from 'vite';
import {
  db,
  initDatabase,
  findUserByLoginId,
  verifyPassword,
  recordFailedLogin,
  resetFailedLogins,
  createSession,
  verifySessionToken,
  destroySession,
  destroyAllUserSessions,
  createPasswordReset,
  verifyPasswordResetCode,
  resetUserPasswordWithToken,
  changeUserPassword,
  updateUserSettings,
  sanitizeUser,
  ensureMonthlyDuesForChitAndMonth,
  syncDuesOnLift,
  isPasswordExpired,
  createTempChangePasswordToken,
  verifyTempChangePasswordToken,
  createSecurityResetToken,
  verifySecurityAnswer,
  recordFailedRecovery,
  resetFailedRecovery,
  updateUserSecurityQuestion,
  validatePasswordStrength,
  computeChitCurrentMonth,
} from './server/db.ts';
import { sendPasswordRecoveryEmail } from './server/email.ts';

// Initialize SQLite DB & ensure initial admin exists
initDatabase();

const app = express();
app.set('trust proxy', 1);
const PORT = Number(process.env.PORT || 3000);

app.use(express.json());
app.use(cookieParser());

// Helper to extract session token from HTTP-only Cookie or Bearer header
function extractToken(req: express.Request): string | null {
  if (req.cookies && req.cookies.chit_session) {
    return req.cookies.chit_session;
  }
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.split(' ')[1];
  }
  return null;
}

// Authentication middleware to protect endpoints
function authMiddleware(req: express.Request, res: express.Response, next: express.NextFunction) {
  const token = extractToken(req);
  if (!token) {
    return res.status(401).json({ error: 'Unauthorized. Please login.' });
  }

  const user = verifySessionToken(token);
  if (!user) {
    return res.status(401).json({ error: 'Unauthorized. Please login.' });
  }

  // Password expired check: block access to business data until password renewed
  if (
    user.is_password_expired &&
    !req.originalUrl.includes('/api/auth/change-password') &&
    !req.originalUrl.includes('/api/auth/logout') &&
    !req.originalUrl.includes('/api/auth/me')
  ) {
    return res.status(403).json({ error: 'PASSWORD_EXPIRED', message: 'Your password has expired. Please renew your password.' });
  }

  (req as any).user = user;
  (req as any).token = token;
  next();
}

// ----------------- PUBLIC AUTH ROUTES -----------------

// POST /api/auth/login
app.post('/api/auth/login', (req, res) => {
  try {
    const loginId = (req.body.loginId || req.body.username || '').toString().trim();
    const password = (req.body.password || '').toString();

    if (!loginId || !password) {
      return res.status(400).json({ error: 'Login ID and password are required.' });
    }

    const user = findUserByLoginId(loginId);
    if (!user) {
      return res.status(401).json({ error: 'Invalid Login ID or password.' });
    }

    // Check rate limiting / lock status
    if (user.locked_until) {
      const lockedUntilTime = new Date(user.locked_until).getTime();
      if (lockedUntilTime > Date.now()) {
        return res.status(429).json({ error: 'Too many failed login attempts. Please try again after 15 minutes.' });
      }
    }

    // Verify password using secure constant-time PBKDF2 hash
    const isValid = verifyPassword(password, user.password_hash, user.salt);
    if (!isValid) {
      const failInfo = recordFailedLogin(user.id);
      if (failInfo.isLocked) {
        return res.status(429).json({ error: 'Account locked due to 5 consecutive failed login attempts. Please try again in 15 minutes or use Forgot Password.' });
      }
      return res.status(401).json({ error: 'Invalid Login ID or password.' });
    }

    // Successful password match -> reset failed attempts
    resetFailedLogins(user.id);

    // Check 3-month calendar password expiration policy
    const isExpired = isPasswordExpired(user.password_changed_at || user.created_at);
    if (isExpired) {
      // Issue a secure temporary token for password reset
      const tempToken = createTempChangePasswordToken(user.id);
      return res.json({
        status: 'PASSWORD_EXPIRED',
        error: 'PASSWORD_EXPIRED',
        message: 'Your password has expired. Please create a new password to continue.',
        tempToken,
        user: sanitizeUser(user),
      });
    }

    // Generate authenticated session
    const rawToken = crypto.randomBytes(32).toString('hex');
    const ip = (req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress;
    const ua = req.headers['user-agent'];
    createSession(user.id, rawToken, ip, ua);

    // Set secure HTTP-only cookie
    const isHttps = req.secure || (req.headers['x-forwarded-proto'] as string || '').toLowerCase() === 'https';
    res.cookie('chit_session', rawToken, {
      httpOnly: true,
      secure: isHttps,
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
      path: '/',
    });

    return res.json({
      status: 'SUCCESS',
      user: sanitizeUser(user),
      token: rawToken,
    });
  } catch (error: any) {
    console.error('[AUTH LOGIN ERROR]', error);
    return res.status(500).json({ error: 'Authentication service temporarily unavailable.' });
  }
});

// GET /api/auth/me
app.get('/api/auth/me', (req, res) => {
  try {
    const token = extractToken(req);
    if (!token) {
      return res.status(401).json({ error: 'UNAUTHORIZED', message: 'Authentication required. Please login.' });
    }

    const user = verifySessionToken(token);
    if (!user) {
      return res.status(401).json({ error: 'UNAUTHORIZED', message: 'Session expired. Please login again.' });
    }

    if (user.is_password_expired) {
      return res.json({
        status: 'PASSWORD_EXPIRED',
        message: 'Your password has expired. Please create a new password to continue.',
        user,
        token,
      });
    }

    return res.json({
      status: 'SUCCESS',
      user,
      token,
    });
  } catch (error: any) {
    console.error('[AUTH ME ERROR]', error);
    return res.status(500).json({ error: 'INTERNAL_SERVER_ERROR', message: 'An error occurred checking authentication.' });
  }
});

// POST /api/auth/logout
app.post('/api/auth/logout', (req, res) => {
  try {
    const token = extractToken(req);
    if (token) {
      destroySession(token);
    }
    res.clearCookie('chit_session', { path: '/' });
    return res.json({ success: true, message: 'Logged out successfully.' });
  } catch (error: any) {
    console.error('[AUTH LOGOUT ERROR]', error);
    return res.json({ success: true, message: 'Logged out.' });
  }
});

// POST /api/auth/forgot-password (Email-based recovery)
app.post('/api/auth/forgot-password', async (req, res) => {
  try {
    const loginId = (req.body.loginId || req.body.username || '').toString().trim();
    if (!loginId) {
      return res.status(400).json({ error: 'Login ID is required.' });
    }

    const user = findUserByLoginId(loginId);
    if (!user) {
      return res.status(404).json({ error: 'Account not found matching this Login ID.' });
    }

    if (user.recovery_locked_until) {
      const lockedUntilTime = new Date(user.recovery_locked_until).getTime();
      if (lockedUntilTime > Date.now()) {
        return res.status(429).json({ error: 'Too many recovery attempts. Please try again after 15 minutes.' });
      }
    }

    if (!user.recovery_email) {
      return res.status(400).json({
        error: 'No recovery email configured for this account. Please use Security Question recovery.',
      });
    }

    const { recoveryCode, resetToken } = createPasswordReset(user.id);

    const origin = req.headers.origin || `${req.protocol}://${req.get('host')}`;
    const resetLink = `${origin}/#reset?token=${resetToken}&loginId=${encodeURIComponent(user.login_id || user.username)}`;

    const emailRes = await sendPasswordRecoveryEmail({
      to: user.recovery_email,
      name: user.name,
      loginId: user.login_id || user.username,
      recoveryCode,
      resetLink,
      expiresInMinutes: 15,
    });

    const [local, domain] = user.recovery_email.split('@');
    const maskedEmail = (local.length > 2 ? local[0] + '***' + local[local.length - 1] : local[0] + '***') + '@' + (domain || '');

    return res.json({
      success: true,
      message: 'Recovery code sent successfully to registered email.',
      maskedEmail,
      emailSent: emailRes.sent,
      previewUrl: emailRes.previewUrl,
    });
  } catch (error: any) {
    console.error('[AUTH FORGOT PASSWORD EMAIL ERROR]', error);
    return res.status(500).json({ error: 'Failed to process recovery request. Please try again later.' });
  }
});

// POST /api/auth/verify-recovery (Verify 6-digit recovery code)
app.post('/api/auth/verify-recovery', (req, res) => {
  try {
    const loginId = (req.body.loginId || '').toString().trim();
    const code = (req.body.code || req.body.recoveryCode || '').toString().trim();

    if (!loginId || !code) {
      return res.status(400).json({ error: 'Login ID and 6-digit recovery code are required.' });
    }

    const result = verifyPasswordResetCode(loginId, code);
    if (!result) {
      return res.status(400).json({ error: 'Invalid or expired recovery code. Please request a new code.' });
    }

    return res.json({
      success: true,
      resetToken: result.resetToken,
      message: 'Recovery code verified successfully.',
    });
  } catch (error: any) {
    console.error('[AUTH VERIFY RECOVERY ERROR]', error);
    return res.status(500).json({ error: 'Failed to verify recovery code.' });
  }
});

// POST /api/auth/forgot-password/question (Step 1 of security question recovery)
app.post('/api/auth/forgot-password/question', (req, res) => {
  try {
    const loginId = (req.body.loginId || req.body.username || '').toString().trim();
    if (!loginId) {
      return res.status(400).json({ error: 'MISSING_LOGIN_ID', message: 'Please enter your Login ID.' });
    }

    const user = findUserByLoginId(loginId);
    if (!user) {
      return res.status(404).json({ error: 'USER_NOT_FOUND', message: 'No registered account found matching this Login ID.' });
    }

    if (user.recovery_locked_until) {
      const lockedUntilTime = new Date(user.recovery_locked_until).getTime();
      if (lockedUntilTime > Date.now()) {
        return res.status(429).json({ error: 'TOO_MANY_ATTEMPTS', message: 'Too many failed recovery attempts. Please try again after 15 minutes.' });
      }
    }

    return res.json({
      success: true,
      loginId: user.login_id || user.username,
      security_question: user.security_question || 'What is your primary contact number?',
    });
  } catch (error: any) {
    console.error('[AUTH FORGOT QUESTION ERROR]', error);
    return res.status(500).json({ error: 'INTERNAL_SERVER_ERROR', message: 'Failed to retrieve recovery question.' });
  }
});

// POST /api/auth/forgot-password/verify-answer (Step 2 of security question recovery)
app.post('/api/auth/forgot-password/verify-answer', (req, res) => {
  try {
    const loginId = (req.body.loginId || '').toString().trim();
    const answer = (req.body.answer || '').toString();

    if (!loginId || !answer) {
      return res.status(400).json({ error: 'MISSING_FIELDS', message: 'Login ID and security answer are required.' });
    }

    const user = findUserByLoginId(loginId);
    if (!user) {
      return res.status(404).json({ error: 'USER_NOT_FOUND', message: 'Account not found.' });
    }

    // Rate limiting check
    if (user.recovery_locked_until) {
      const lockedUntilTime = new Date(user.recovery_locked_until).getTime();
      if (lockedUntilTime > Date.now()) {
        return res.status(429).json({ error: 'TOO_MANY_ATTEMPTS', message: 'Too many failed recovery attempts. Account recovery locked for 15 minutes.' });
      }
    }

    // Check answer against secure hash
    const isAnswerCorrect = user.security_answer_hash
      ? verifySecurityAnswer(answer, user.security_answer_hash)
      : answer.trim().toLowerCase() === (user.login_id || '').toLowerCase(); // fallback

    if (!isAnswerCorrect) {
      const failInfo = recordFailedRecovery(user.id);
      if (failInfo.isLocked) {
        return res.status(429).json({ error: 'TOO_MANY_ATTEMPTS', message: 'Maximum 5 attempts reached. Recovery is locked for 15 minutes.' });
      }
      return res.status(401).json({
        error: 'INCORRECT_ANSWER',
        message: 'Security answer is incorrect.',
        remainingAttempts: Math.max(0, 5 - failInfo.attempts),
      });
    }

    // Answer is correct! Reset recovery rate limiter
    resetFailedRecovery(user.id);

    // Issue secure reset token
    const { resetToken } = createSecurityResetToken(user.id);

    return res.json({
      success: true,
      resetToken,
      message: 'Security answer verified successfully. You can now set a new password.',
    });
  } catch (error: any) {
    console.error('[AUTH VERIFY ANSWER ERROR]', error);
    return res.status(500).json({ error: 'INTERNAL_SERVER_ERROR', message: 'Failed to verify security answer.' });
  }
});

// POST /api/auth/reset-password (Step 3: sets new password without requiring old password)
app.post('/api/auth/reset-password', (req, res) => {
  try {
    const { resetToken, newPassword, confirmPassword } = req.body;

    if (!resetToken) {
      return res.status(400).json({ error: 'MISSING_TOKEN', message: 'Reset token is required.' });
    }
    if (!newPassword || newPassword.length < 8) {
      return res.status(400).json({ error: 'WEAK_PASSWORD', message: 'New password must be at least 8 characters long.' });
    }
    if (newPassword !== confirmPassword) {
      return res.status(400).json({ error: 'MISMATCH', message: 'Confirm password does not match new password.' });
    }

    const strength = validatePasswordStrength(newPassword);
    if (!strength.isValid) {
      return res.status(400).json({ error: 'WEAK_PASSWORD', message: strength.error });
    }

    resetUserPasswordWithToken(resetToken, newPassword);
    res.clearCookie('chit_session', { path: '/' });
    return res.json({
      success: true,
      message: 'Password reset successfully. Please login with your new password.',
    });
  } catch (error: any) {
    console.error('[AUTH RESET PASSWORD ERROR]', error);
    return res.status(400).json({ error: 'RESET_FAILED', message: error.message || 'Failed to reset password.' });
  }
});

// POST /api/auth/change-password
// Can be called:
// A) By authenticated session user
// B) By user with tempToken after password expiration
// C) With loginId + currentPassword
app.post('/api/auth/change-password', (req, res) => {
  try {
    const { currentPassword, newPassword, confirmPassword, tempToken, loginId } = req.body;

    if (!newPassword || !confirmPassword) {
      return res.status(400).json({ error: 'MISSING_FIELDS', message: 'New password and confirmation are required.' });
    }
    if (newPassword !== confirmPassword) {
      return res.status(400).json({ error: 'MISMATCH', message: 'Confirm password does not match new password.' });
    }

    const strength = validatePasswordStrength(newPassword);
    if (!strength.isValid) {
      return res.status(400).json({ error: 'WEAK_PASSWORD', message: strength.error });
    }

    let targetUserId: string | null = null;
    let isTempTokenValid = false;

    // Check tempToken
    if (tempToken) {
      const tempRow = verifyTempChangePasswordToken(tempToken);
      if (tempRow) {
        targetUserId = tempRow.user_id;
        isTempTokenValid = true;
      }
    }

    // Check active session
    if (!targetUserId) {
      const token = extractToken(req);
      if (token) {
        const sessionUser = verifySessionToken(token);
        if (sessionUser) {
          targetUserId = sessionUser.id;
        }
      }
    }

    // Check loginId + currentPassword
    if (!targetUserId && loginId) {
      const user = findUserByLoginId(loginId);
      if (user) {
        targetUserId = user.id;
      }
    }

    if (!targetUserId) {
      return res.status(401).json({ error: 'UNAUTHORIZED', message: 'Authentication required to change password.' });
    }

    // If not verified via tempToken, currentPassword is required and verified
    const result = changeUserPassword(targetUserId, currentPassword || null, newPassword, isTempTokenValid);

    // Create a fresh session for the user so they are immediately logged in
    const rawToken = crypto.randomBytes(32).toString('hex');
    const ip = (req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress;
    const ua = req.headers['user-agent'];
    createSession(targetUserId, rawToken, ip, ua);

    const isHttps = req.secure || (req.headers['x-forwarded-proto'] as string || '').toLowerCase() === 'https';
    res.cookie('chit_session', rawToken, {
      httpOnly: true,
      secure: isHttps,
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000,
      path: '/',
    });

    return res.json({
      success: true,
      message: 'Password changed successfully. Welcome to Chit Manager!',
      user: result.user,
      token: rawToken,
    });
  } catch (error: any) {
    console.error('[AUTH CHANGE PASSWORD ERROR]', error);
    return res.status(400).json({ error: 'CHANGE_FAILED', message: error.message || 'Failed to change password.' });
  }
});

// POST /api/auth/security-question (Settings -> Security)
app.post('/api/auth/security-question', authMiddleware, (req, res) => {
  try {
    const user = (req as any).user;
    const { currentPassword, securityQuestion, securityAnswer } = req.body;

    if (!currentPassword || !securityQuestion || !securityAnswer) {
      return res.status(400).json({ error: 'MISSING_FIELDS', message: 'Current password, security question, and answer are required.' });
    }

    const result = updateUserSecurityQuestion(user.id, currentPassword, securityQuestion, securityAnswer);
    return res.json({
      success: true,
      message: 'Security question configured successfully.',
      security_question: result.security_question,
    });
  } catch (error: any) {
    console.error('[AUTH SECURITY QUESTION ERROR]', error);
    return res.status(400).json({ error: 'UPDATE_FAILED', message: error.message || 'Failed to update security question.' });
  }
});

// POST /api/auth/update-security-settings (Settings -> Contact Details)
app.post('/api/auth/update-security-settings', authMiddleware, (req, res) => {
  try {
    const user = (req as any).user;
    const { name, recovery_email, recovery_phone } = req.body;

    const updated = updateUserSettings(user.id, { name, recovery_email, recovery_phone });
    return res.json({ success: true, user: updated });
  } catch (error: any) {
    console.error('[AUTH UPDATE SETTINGS ERROR]', error);
    return res.status(400).json({ error: 'UPDATE_FAILED', message: error.message || 'Failed to update settings.' });
  }
});

// ----------------- PROTECT ALL APPLICATION API ROUTES -----------------
app.use('/api', authMiddleware);

// ----------------- DASHBOARD STATS -----------------
app.get('/api/dashboard/stats', (req, res) => {
  try {
    const activeChitsCount = db.prepare("SELECT COUNT(*) as count FROM chits WHERE status = 'active'").get() as { count: number };
    const membersCount = db.prepare("SELECT COUNT(*) as count FROM members WHERE status = 'active'").get() as { count: number };

    // Today's collection: payment_date like today YYYY-MM-DD
    const todayStr = new Date().toISOString().split('T')[0];
    const todayColl = db.prepare(`
      SELECT COALESCE(SUM(amount), 0) as total FROM payments WHERE payment_date LIKE ?
    `).get(`${todayStr}%`) as { total: number };

    // This month's collection: current calendar month
    const thisMonthStr = todayStr.substring(0, 7);
    const monthColl = db.prepare(`
      SELECT COALESCE(SUM(amount), 0) as total FROM payments WHERE payment_date LIKE ?
    `).get(`${thisMonthStr}%`) as { total: number };

    // Chit summary cards (calculated strictly for each chit's current month)
    const chits = db.prepare('SELECT * FROM chits ORDER BY created_at DESC').all() as any[];
    let totalPendingCurrentMonths = 0;
    const chitsSummary = chits.map(chit => {
      const currMonth = computeChitCurrentMonth(chit.start_month, chit.total_months);
      ensureMonthlyDuesForChitAndMonth(chit.id, currMonth);

      const chitMembersCount = db.prepare("SELECT COUNT(*) as count FROM members WHERE chit_id = ? AND status = 'active'").get(chit.id) as { count: number };
      const chitToday = db.prepare('SELECT COALESCE(SUM(amount), 0) as total FROM payments WHERE chit_id = ? AND payment_date LIKE ?').get(chit.id, `${todayStr}%`) as { total: number };
      
      // Calculate CURRENT MONTH ONLY
      const monthStats = db.prepare(`
        SELECT 
          COALESCE(SUM(due_amount), 0) as total_due,
          COALESCE(SUM(paid_amount), 0) as total_collected,
          COALESCE(SUM(CASE WHEN (due_amount - paid_amount) > 0 THEN (due_amount - paid_amount) ELSE 0 END), 0) as total_pending
        FROM monthly_dues 
        WHERE chit_id = ? AND month_number = ?
      `).get(chit.id, currMonth) as { total_due: number; total_collected: number; total_pending: number };

      const liftedCount = db.prepare('SELECT COUNT(*) as count FROM lift_details WHERE chit_id = ?').get(chit.id) as { count: number };

      if (chit.status === 'active') {
        totalPendingCurrentMonths += monthStats.total_pending;
      }

      return {
        ...chit,
        active_members_count: chitMembersCount.count,
        today_collection: chitToday.total,
        pending_amount: monthStats.total_pending,
        total_collected: monthStats.total_collected,
        total_due: monthStats.total_due,
        lifted_members_count: liftedCount.count,
        current_month: currMonth
      };
    });

    // Total pending balance across active chits for current month
    const totalOutstanding = totalPendingCurrentMonths;

    // Distinct customer counts
    const paidCust = db.prepare(`
      SELECT COUNT(DISTINCT member_id) as count FROM monthly_dues WHERE status = 'PAID'
    `).get() as { count: number };

    const pendingCust = db.prepare(`
      SELECT COUNT(DISTINCT member_id) as count FROM monthly_dues WHERE status != 'PAID'
    `).get() as { count: number };

    // Total collected all-time
    const totalCollAllTime = db.prepare(`
      SELECT COALESCE(SUM(amount), 0) as total FROM payments
    `).get() as { total: number };

    // Recent payments
    const recentPayments = db.prepare(`
      SELECT p.*, m.customer_name, m.ticket_number, c.name as chit_name
      FROM payments p
      JOIN members m ON p.member_id = m.id
      JOIN chits c ON p.chit_id = c.id
      ORDER BY p.payment_date DESC, p.created_at DESC
      LIMIT 10
    `).all();

    res.json({
      stats: {
        totalActiveChits: activeChitsCount.count,
        totalMembers: membersCount.count,
        todayCollection: todayColl.total,
        thisMonthCollection: monthColl.total,
        totalPendingAmount: totalPendingCurrentMonths,
        totalOutstanding,
        totalCollected: totalCollAllTime.total,
        totalPaidCustomers: paidCust.count,
        totalPendingCustomers: pendingCust.count,
        recentPayments
      },
      chits: chitsSummary
    });
  } catch (err: any) {
    console.error('Stats error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ----------------- CHITS CRUD -----------------
app.get('/api/chits', (req, res) => {
  try {
    const chits = db.prepare('SELECT * FROM chits ORDER BY created_at DESC').all() as any[];
    const result = chits.map(chit => {
      const currMonth = computeChitCurrentMonth(chit.start_month, chit.total_months);
      ensureMonthlyDuesForChitAndMonth(chit.id, currMonth);

      const memberCount = db.prepare('SELECT COUNT(*) as count FROM members WHERE chit_id = ?').get(chit.id) as { count: number };
      const monthStats = db.prepare(`
        SELECT 
          COALESCE(SUM(due_amount), 0) as total_due,
          COALESCE(SUM(paid_amount), 0) as total_collected,
          COALESCE(SUM(CASE WHEN (due_amount - paid_amount) > 0 THEN (due_amount - paid_amount) ELSE 0 END), 0) as total_pending
        FROM monthly_dues 
        WHERE chit_id = ? AND month_number = ?
      `).get(chit.id, currMonth) as { total_due: number; total_collected: number; total_pending: number };

      const lifted = db.prepare('SELECT COUNT(*) as count FROM lift_details WHERE chit_id = ?').get(chit.id) as { count: number };
      return {
        ...chit,
        current_month: currMonth,
        active_members_count: memberCount.count,
        total_due: monthStats.total_due,
        total_collected: monthStats.total_collected,
        total_pending: monthStats.total_pending,
        lifted_members_count: lifted.count
      };
    });
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/chits', (req, res) => {
  const { name, chit_value, total_months, total_members, start_month, end_month, members, rules } = req.body;

  if (!name || !chit_value || !total_months || !total_members || !start_month) {
    return res.status(400).json({ error: 'Please provide all required basic chit fields.' });
  }

  if (!Array.isArray(members) || members.length === 0) {
    return res.status(400).json({ error: 'Please provide at least one member.' });
  }

  if (!Array.isArray(rules) || rules.length !== total_months) {
    return res.status(400).json({ error: `Rules must be provided for all ${total_months} months.` });
  }

  const chitId = 'chit-' + Date.now() + '-' + Math.random().toString(36).substring(2, 7);
  const now = new Date().toISOString();

  const insertChit = db.prepare(`
    INSERT INTO chits (id, name, chit_value, total_months, total_members, start_month, end_month, status, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, 'active', ?, ?)
  `);

  const insertRule = db.prepare(`
    INSERT INTO chit_month_rules (id, chit_id, month_number, month_name, pre_lift_payment, post_lift_payment, monthly_chit_value, expected_lift_payout)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const insertMember = db.prepare(`
    INSERT INTO members (id, chit_id, customer_name, phone, ticket_number, status, join_date, created_at)
    VALUES (?, ?, ?, ?, ?, 'active', ?, ?)
  `);

  const insertDue = db.prepare(`
    INSERT INTO monthly_dues (id, chit_id, member_id, month_number, month_name, due_amount, paid_amount, balance_amount, status, due_date, generated_at)
    VALUES (?, ?, ?, ?, ?, ?, 0, ?, 'PENDING', ?, ?)
  `);

  const tx = db.transaction(() => {
    // 1. Insert Chit
    insertChit.run(chitId, name, chit_value, total_months, total_members, start_month, end_month, now, now);

    // 2. Insert Month Rules
    for (const rule of rules) {
      const ruleId = `rule-${chitId}-m${rule.month_number}`;
      insertRule.run(
        ruleId,
        chitId,
        rule.month_number,
        rule.month_name,
        rule.pre_lift_payment,
        rule.post_lift_payment,
        rule.monthly_chit_value,
        rule.expected_lift_payout
      );
    }

    // 3. Insert Members & Pre-generate all Month Dues
    const createdMemberIds: string[] = [];
    members.forEach((m: any, index: number) => {
      const memberId = `mem-${chitId}-${index + 1}-${Math.random().toString(36).substring(2, 6)}`;
      const ticket = m.ticket_number || String(index + 1).padStart(2, '0');
      insertMember.run(memberId, chitId, m.customer_name, m.phone, ticket, now, now);
      createdMemberIds.push(memberId);

      // Generate all monthly dues for this member based on initial pre-lift rule
      for (const rule of rules) {
        const dueId = `due-${chitId}-${memberId}-m${rule.month_number}`;
        insertDue.run(
          dueId,
          chitId,
          memberId,
          rule.month_number,
          rule.month_name,
          rule.pre_lift_payment,
          rule.pre_lift_payment,
          now,
          now
        );
      }
    });
  });

  try {
    tx();
    const created = db.prepare('SELECT * FROM chits WHERE id = ?').get(chitId);
    res.status(201).json(created);
  } catch (err: any) {
    console.error('Create chit error:', err);
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/chits/:id', (req, res) => {
  const chit = db.prepare('SELECT * FROM chits WHERE id = ?').get(req.params.id) as any;
  if (!chit) return res.status(404).json({ error: 'Chit not found' });

  const rules = db.prepare('SELECT * FROM chit_month_rules WHERE chit_id = ? ORDER BY month_number ASC').all(chit.id);
  const members = db.prepare(`
    SELECT m.*, l.id as lift_id, l.lift_month, l.lift_amount_received, l.lift_amount_received as lift_amount,
           l.lift_date, l.payment_method, l.reference_number, l.notes as lift_notes, l.status as lift_status_text,
           l.created_at as lift_created_at, l.updated_at as lift_updated_at,
           CASE WHEN l.id IS NOT NULL THEN 'lifted' ELSE 'not_lifted' END as lift_status
    FROM members m
    LEFT JOIN lift_details l ON m.id = l.member_id
    WHERE m.chit_id = ?
    ORDER BY CAST(m.ticket_number AS INTEGER) ASC, m.customer_name ASC
  `).all(chit.id) as any[];

  const computedCurrentMonth = computeChitCurrentMonth(chit.start_month, chit.total_months);
  // Selected month from query parameter or default to computed current month
  const selectedMonth = req.query.month
    ? parseInt(req.query.month as string, 10)
    : computedCurrentMonth;

  ensureMonthlyDuesForChitAndMonth(chit.id, selectedMonth);

  // CURRENT MONTH ONLY metrics
  const monthStats = db.prepare(`
    SELECT 
      COALESCE(SUM(due_amount), 0) as total_due,
      COALESCE(SUM(paid_amount), 0) as total_collected,
      COALESCE(SUM(CASE WHEN (due_amount - paid_amount) > 0 THEN (due_amount - paid_amount) ELSE 0 END), 0) as total_pending,
      SUM(CASE WHEN status = 'PAID' OR (due_amount > 0 AND paid_amount >= due_amount) THEN 1 ELSE 0 END) as paid_members_count,
      SUM(CASE WHEN (due_amount - paid_amount) > 0 THEN 1 ELSE 0 END) as pending_members_count
    FROM monthly_dues
    WHERE chit_id = ? AND month_number = ?
  `).get(chit.id, selectedMonth) as any;

  // Lifted count remains cumulative across the chit
  const liftedCount = members.filter((m: any) => m.lift_status === 'lifted').length;
  const unliftedCount = members.length - liftedCount;

  res.json({
    ...chit,
    current_month: computedCurrentMonth,
    rules,
    members,
    selected_month: selectedMonth,
    total_due: monthStats.total_due,
    total_collected: monthStats.total_collected,
    total_pending: monthStats.total_pending,
    paid_members_count: monthStats.paid_members_count,
    pending_members_count: monthStats.pending_members_count,
    lifted_members_count: liftedCount,
    unlifted_members_count: unliftedCount,
  });
});

app.put('/api/chits/:id', (req, res) => {
  const { name, status, chit_value, start_month, end_month, total_months, total_members } = req.body;
  const now = new Date().toISOString();
  
  const existing = db.prepare('SELECT * FROM chits WHERE id = ?').get(req.params.id) as any;
  if (!existing) {
    return res.status(404).json({ error: 'Chit not found' });
  }

  const newName = name !== undefined && String(name).trim() ? String(name).trim() : existing.name;
  const newStatus = status !== undefined ? status : existing.status;
  const newChitValue = chit_value !== undefined && !isNaN(Number(chit_value)) ? Number(chit_value) : existing.chit_value;
  const newStartMonth = start_month !== undefined && String(start_month).trim() ? String(start_month).trim() : existing.start_month;
  const newEndMonth = end_month !== undefined && String(end_month).trim() ? String(end_month).trim() : existing.end_month;
  const newTotalMonths = total_months !== undefined && !isNaN(Number(total_months)) ? Number(total_months) : existing.total_months;
  const newTotalMembers = total_members !== undefined && !isNaN(Number(total_members)) ? Number(total_members) : existing.total_members;

  db.prepare(`
    UPDATE chits
    SET name = ?,
        status = ?,
        chit_value = ?,
        start_month = ?,
        end_month = ?,
        total_months = ?,
        total_members = ?,
        updated_at = ?
    WHERE id = ?
  `).run(
    newName,
    newStatus,
    newChitValue,
    newStartMonth,
    newEndMonth,
    newTotalMonths,
    newTotalMembers,
    now,
    req.params.id
  );

  const updated = db.prepare('SELECT * FROM chits WHERE id = ?').get(req.params.id);
  res.json(updated);
});

app.delete('/api/chits/:id', (req, res) => {
  const chitId = req.params.id;
  const existing = db.prepare('SELECT * FROM chits WHERE id = ?').get(chitId) as any;
  if (!existing) {
    return res.status(404).json({ error: 'Chit not found' });
  }

  // Explicitly delete in transaction to guarantee complete cascade cleanup even if foreign_keys pragma is affected
  const tx = db.transaction(() => {
    db.prepare('DELETE FROM payments WHERE chit_id = ?').run(chitId);
    db.prepare('DELETE FROM monthly_dues WHERE chit_id = ?').run(chitId);
    db.prepare('DELETE FROM lift_details WHERE chit_id = ?').run(chitId);
    db.prepare('DELETE FROM members WHERE chit_id = ?').run(chitId);
    db.prepare('DELETE FROM chit_month_rules WHERE chit_id = ?').run(chitId);
    db.prepare('DELETE FROM chits WHERE id = ?').run(chitId);
  });

  tx();
  res.json({ success: true, message: `Chit "${existing.name}" and all associated records deleted successfully.` });
});

// Update chit rules (protects historical payments)
app.put('/api/chits/:id/rules', (req, res) => {
  const { rules } = req.body;
  if (!Array.isArray(rules)) {
    return res.status(400).json({ error: 'Rules array is required' });
  }

  const chitId = req.params.id;
  const updateRuleStmt = db.prepare(`
    UPDATE chit_month_rules
    SET pre_lift_payment = ?, post_lift_payment = ?, monthly_chit_value = ?, expected_lift_payout = ?
    WHERE chit_id = ? AND month_number = ?
  `);

  // Protect historical records: only update dues that have 0 paid amount!
  const updateDueStmt = db.prepare(`
    UPDATE monthly_dues
    SET due_amount = ?, balance_amount = ?
    WHERE chit_id = ? AND member_id = ? AND month_number = ? AND paid_amount = 0
  `);

  const members = db.prepare(`
    SELECT m.id, l.lift_month FROM members m
    LEFT JOIN lift_details l ON m.id = l.member_id
    WHERE m.chit_id = ?
  `).all(chitId) as any[];

  const tx = db.transaction(() => {
    for (const r of rules) {
      updateRuleStmt.run(r.pre_lift_payment, r.post_lift_payment, r.monthly_chit_value, r.expected_lift_payout, chitId, r.month_number);

      // Update future unpaid dues for members
      for (const m of members) {
        const isPostLift = m.lift_month && r.month_number > m.lift_month;
        const targetAmount = isPostLift ? r.post_lift_payment : r.pre_lift_payment;
        updateDueStmt.run(targetAmount, targetAmount, chitId, m.id, r.month_number);
      }
    }
  });

  tx();
  res.json({ success: true, message: 'Rules updated successfully. Historical paid dues were preserved.' });
});

// Update Month-Wise Lift Payouts (from Excel or manual update)
app.put('/api/chits/:id/rules/lift-payouts', (req, res) => {
  const chitId = req.params.id;
  const { payouts } = req.body;

  if (!Array.isArray(payouts) || payouts.length === 0) {
    return res.status(400).json({ error: 'Payouts array is required and must not be empty.' });
  }

  const chit = db.prepare('SELECT id, total_months FROM chits WHERE id = ?').get(chitId) as { id: string; total_months: number } | undefined;
  if (!chit) {
    return res.status(404).json({ error: 'Chit not found.' });
  }

  const updatePayoutStmt = db.prepare(`
    UPDATE chit_month_rules
    SET expected_lift_payout = ?
    WHERE chit_id = ? AND month_number = ?
  `);

  let updatedCount = 0;
  const tx = db.transaction(() => {
    for (const item of payouts) {
      const monthNum = Number(item.month_number);
      const amount = Number(item.lift_payout);

      if (isNaN(monthNum) || monthNum < 1 || monthNum > chit.total_months) {
        continue;
      }
      if (isNaN(amount) || amount < 0) {
        continue;
      }

      const result = updatePayoutStmt.run(amount, chitId, monthNum);
      if (result.changes > 0) {
        updatedCount++;
      }
    }
  });

  try {
    tx();
    res.json({
      success: true,
      message: `Successfully updated lift payouts for ${updatedCount} month${updatedCount === 1 ? '' : 's'}.`,
      updated_count: updatedCount,
    });
  } catch (err: any) {
    res.status(500).json({ error: `Failed to update lift payouts: ${err.message}` });
  }
});

// ----------------- MONTH VIEW & DUES -----------------
app.get('/api/chits/:id/months/:monthNumber', (req, res) => {
  const chitId = req.params.id;
  const monthNumber = parseInt(req.params.monthNumber, 10);

  // Ensure dues exist for this month
  ensureMonthlyDuesForChitAndMonth(chitId, monthNumber);

  const rule = db.prepare('SELECT * FROM chit_month_rules WHERE chit_id = ? AND month_number = ?').get(chitId, monthNumber) as any;
  if (!rule) {
    return res.status(404).json({ error: 'Rule for requested month not found' });
  }

  const dues = db.prepare(`
    SELECT d.*, m.customer_name, m.phone, m.ticket_number,
           l.lift_month, l.lift_amount_received,
           CASE WHEN l.id IS NOT NULL THEN 'lifted' ELSE 'not_lifted' END as lift_status
    FROM monthly_dues d
    JOIN members m ON d.member_id = m.id
    LEFT JOIN lift_details l ON m.id = l.member_id
    WHERE d.chit_id = ? AND d.month_number = ? AND m.status = 'active'
    ORDER BY CAST(m.ticket_number AS INTEGER) ASC, m.customer_name ASC
  `).all(chitId, monthNumber) as any[];

  const stats = db.prepare(`
    SELECT 
      COALESCE(SUM(due_amount), 0) as total_due,
      COALESCE(SUM(paid_amount), 0) as total_paid,
      COALESCE(SUM(CASE WHEN (due_amount - paid_amount) > 0 THEN (due_amount - paid_amount) ELSE 0 END), 0) as total_balance,
      SUM(CASE WHEN status = 'PAID' OR (due_amount > 0 AND paid_amount >= due_amount) THEN 1 ELSE 0 END) as count_paid,
      SUM(CASE WHEN status = 'PARTIAL' OR (paid_amount > 0 AND paid_amount < due_amount) THEN 1 ELSE 0 END) as count_partial,
      SUM(CASE WHEN (due_amount - paid_amount) > 0 THEN 1 ELSE 0 END) as count_pending
    FROM monthly_dues
    WHERE chit_id = ? AND month_number = ?
  `).get(chitId, monthNumber) as any;

  const lift = db.prepare(`
    SELECT l.*, m.customer_name, m.ticket_number
    FROM lift_details l
    JOIN members m ON l.member_id = m.id
    WHERE l.chit_id = ? AND l.lift_month = ?
  `).get(chitId, monthNumber) as any;

  // Monthly Profit calculation: Total actual collection for month minus actual lift payout for month
  const total_collection = Number(stats.total_paid) || 0;
  const profit_details = lift ? {
    has_lift: true,
    month_number: monthNumber,
    month_name: rule.month_name,
    total_collection,
    lift_payout: Number(lift.lift_amount_received) || 0,
    profit: total_collection - (Number(lift.lift_amount_received) || 0),
    lifted_member_name: lift.customer_name,
    ticket_number: lift.ticket_number
  } : {
    has_lift: false,
    month_number: monthNumber,
    month_name: rule.month_name,
    total_collection,
    lift_payout: null,
    profit: null,
    lifted_member_name: null,
    ticket_number: null
  };

  res.json({
    rule,
    dues,
    stats,
    lift: lift || null,
    profit: profit_details
  });
});

// Dedicated monthly profit calculation endpoint
app.get('/api/chits/:id/months/:monthNumber/profit', (req, res) => {
  const chitId = req.params.id;
  const monthNumber = parseInt(req.params.monthNumber, 10);

  ensureMonthlyDuesForChitAndMonth(chitId, monthNumber);

  const rule = db.prepare('SELECT * FROM chit_month_rules WHERE chit_id = ? AND month_number = ?').get(chitId, monthNumber) as any;
  const monthName = rule ? rule.month_name : `Month ${monthNumber}`;

  // Actual payments collected from all members for that month
  const collectionRow = db.prepare(`
    SELECT COALESCE(SUM(paid_amount), 0) as total_collection
    FROM monthly_dues
    WHERE chit_id = ? AND month_number = ?
  `).get(chitId, monthNumber) as { total_collection: number };

  const total_collection = collectionRow ? Number(collectionRow.total_collection) : 0;

  // Lifted customer for that month
  const lift = db.prepare(`
    SELECT l.*, m.customer_name, m.ticket_number
    FROM lift_details l
    JOIN members m ON l.member_id = m.id
    WHERE l.chit_id = ? AND l.lift_month = ?
  `).get(chitId, monthNumber) as any;

  if (!lift) {
    return res.json({
      month_number: monthNumber,
      month_name: monthName,
      total_collection,
      lift_payout: null,
      profit: null,
      has_lift: false,
      lifted_member_name: null,
      ticket_number: null
    });
  }

  const lift_payout = Number(lift.lift_amount_received) || 0;
  const profit = total_collection - lift_payout;

  return res.json({
    month_number: monthNumber,
    month_name: monthName,
    total_collection,
    lift_payout,
    profit,
    has_lift: true,
    lifted_member_name: lift.customer_name,
    ticket_number: lift.ticket_number
  });
});

// ----------------- MEMBERS CRUD -----------------
app.get('/api/chits/:id/members', (req, res) => {
  const members = db.prepare(`
    SELECT m.*, l.lift_month, l.lift_amount_received, l.lift_date, l.notes as lift_notes,
           CASE WHEN l.id IS NOT NULL THEN 'lifted' ELSE 'not_lifted' END as lift_status,
           (SELECT COALESCE(SUM(amount), 0) FROM payments WHERE member_id = m.id) as total_paid,
           (SELECT COALESCE(SUM(balance_amount), 0) FROM monthly_dues WHERE member_id = m.id) as total_pending
    FROM members m
    LEFT JOIN lift_details l ON m.id = l.member_id
    WHERE m.chit_id = ?
    ORDER BY CAST(m.ticket_number AS INTEGER) ASC, m.customer_name ASC
  `).all(req.params.id);
  res.json(members);
});

app.post('/api/chits/:id/members', (req, res) => {
  const chitId = req.params.id;
  const { customer_name, phone, ticket_number } = req.body;
  if (!customer_name || !phone) {
    return res.status(400).json({ error: 'Customer name and phone number are required' });
  }

  const chit = db.prepare('SELECT * FROM chits WHERE id = ?').get(chitId) as any;
  if (!chit) return res.status(404).json({ error: 'Chit not found' });

  const memberId = 'mem-' + chitId + '-' + Date.now();
  const now = new Date().toISOString();

  const rules = db.prepare('SELECT * FROM chit_month_rules WHERE chit_id = ? ORDER BY month_number ASC').all(chitId) as any[];

  const insertMember = db.prepare(`
    INSERT INTO members (id, chit_id, customer_name, phone, ticket_number, status, join_date, created_at)
    VALUES (?, ?, ?, ?, ?, 'active', ?, ?)
  `);

  const insertDue = db.prepare(`
    INSERT INTO monthly_dues (id, chit_id, member_id, month_number, month_name, due_amount, paid_amount, balance_amount, status, due_date, generated_at)
    VALUES (?, ?, ?, ?, ?, ?, 0, ?, 'PENDING', ?, ?)
  `);

  const tx = db.transaction(() => {
    insertMember.run(memberId, chitId, customer_name, phone, ticket_number || '', now, now);
    for (const rule of rules) {
      const dueId = `due-${chitId}-${memberId}-m${rule.month_number}`;
      insertDue.run(dueId, chitId, memberId, rule.month_number, rule.month_name, rule.pre_lift_payment, rule.pre_lift_payment, now, now);
    }
  });

  tx();
  const created = db.prepare('SELECT * FROM members WHERE id = ?').get(memberId);
  res.status(201).json(created);
});

// Batch import members into a chit
app.post('/api/chits/:id/members/import', (req, res) => {
  const chitId = req.params.id;
  const { customers, skipDuplicates = true } = req.body;

  if (!Array.isArray(customers) || customers.length === 0) {
    return res.status(400).json({ error: 'Customers array is required and cannot be empty' });
  }

  const chit = db.prepare('SELECT * FROM chits WHERE id = ?').get(chitId) as any;
  if (!chit) return res.status(404).json({ error: 'Chit not found' });

  // Get existing members to check capacity and determine next ticket number
  const existingMembers = db.prepare('SELECT * FROM members WHERE chit_id = ?').all(chitId) as any[];

  const totalMembersLimit = Number(chit.total_members) || 25;
  const currentCount = existingMembers.length;
  const remainingSlots = Math.max(0, totalMembersLimit - currentCount);

  if (remainingSlots <= 0) {
    return res.status(400).json({
      error: `Chit member limit of ${totalMembersLimit} is already reached. No more members can be imported.`,
      imported_count: 0,
      skipped_count: customers.length,
      limit_reached: true,
    });
  }

  // Find max numeric ticket number currently in use
  let maxTicket = 0;
  for (const m of existingMembers) {
    const num = parseInt(m.ticket_number, 10);
    if (!isNaN(num) && num > maxTicket) {
      maxTicket = num;
    }
  }

  const rules = db.prepare('SELECT * FROM chit_month_rules WHERE chit_id = ? ORDER BY month_number ASC').all(chitId) as any[];
  const now = new Date().toISOString();

  const insertMember = db.prepare(`
    INSERT INTO members (id, chit_id, customer_name, phone, ticket_number, status, join_date, created_at)
    VALUES (?, ?, ?, ?, ?, 'active', ?, ?)
  `);

  const insertDue = db.prepare(`
    INSERT INTO monthly_dues (id, chit_id, member_id, month_number, month_name, due_amount, paid_amount, balance_amount, status, due_date, generated_at)
    VALUES (?, ?, ?, ?, ?, ?, 0, ?, 'PENDING', ?, ?)
  `);

  const imported: any[] = [];
  const skipped: any[] = [];
  let duplicatesCount = 0;
  let invalidCount = 0;
  let limitSkippedCount = 0;

  const tx = db.transaction(() => {
    for (let i = 0; i < customers.length; i++) {
      const c = customers[i];
      const rawName = String(c.customer_name || c.name || '').trim();
      const rawPhone = String(c.phone || c.phone_number || '').trim();
      const cleanPhone = rawPhone.replace(/\D/g, '');

      // Validation
      if (!rawName || !rawPhone || cleanPhone.length < 10) {
        invalidCount++;
        skipped.push({ ...c, reason: 'Invalid name or phone number' });
        continue;
      }

      // Check remaining capacity limit
      if (imported.length >= remainingSlots) {
        limitSkippedCount++;
        skipped.push({ ...c, customer_name: rawName, phone: rawPhone, reason: 'Chit member limit reached' });
        continue;
      }

      maxTicket += 1;
      const ticketNumber = c.ticket_number ? String(c.ticket_number).trim() : String(maxTicket);
      const memberId = `mem-${chitId}-${Date.now()}-${i}-${Math.random().toString(36).substring(2, 6)}`;

      insertMember.run(memberId, chitId, rawName, rawPhone, ticketNumber, now, now);

      // Generate all monthly dues for this member based on initial pre-lift rule
      for (const rule of rules) {
        const dueId = `due-${chitId}-${memberId}-m${rule.month_number}`;
        insertDue.run(dueId, chitId, memberId, rule.month_number, rule.month_name, rule.pre_lift_payment, rule.pre_lift_payment, now, now);
      }

      imported.push({
        id: memberId,
        customer_name: rawName,
        phone: rawPhone,
        ticket_number: ticketNumber,
      });
    }
  });

  try {
    tx();
    res.json({
      success: true,
      imported_count: imported.length,
      skipped_count: skipped.length,
      duplicates_count: duplicatesCount,
      invalid_count: invalidCount,
      limit_skipped_count: limitSkippedCount,
      imported,
      skipped,
    });
  } catch (err: any) {
    console.error('Import members error:', err);
    res.status(500).json({ error: err.message || 'Failed to import members' });
  }
});

app.put('/api/members/:id', (req, res) => {
  const { customer_name, phone, ticket_number, status } = req.body;
  db.prepare(`
    UPDATE members
    SET customer_name = COALESCE(?, customer_name),
        phone = COALESCE(?, phone),
        ticket_number = COALESCE(?, ticket_number),
        status = COALESCE(?, status)
    WHERE id = ?
  `).run(customer_name, phone, ticket_number, status, req.params.id);

  const updated = db.prepare('SELECT * FROM members WHERE id = ?').get(req.params.id);
  res.json(updated);
});

app.delete('/api/members/:id', (req, res) => {
  // Check if member has payments
  const hasPayments = db.prepare('SELECT COUNT(*) as count FROM payments WHERE member_id = ?').get(req.params.id) as { count: number };
  if (hasPayments.count > 0) {
    // Soft deactivate to keep audit trail
    db.prepare("UPDATE members SET status = 'inactive' WHERE id = ?").run(req.params.id);
    return res.json({ success: true, message: 'Member has payment history and was marked inactive.' });
  }
  db.prepare('DELETE FROM members WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

// Customer Profile view
app.get('/api/members/:id/profile', (req, res) => {
  const member = db.prepare(`
    SELECT m.*, c.name as chit_name, c.chit_value, c.total_months, c.start_month, c.end_month,
           l.id as lift_id, l.lift_month, l.lift_amount_received, l.lift_amount_received as lift_amount,
           l.lift_date, l.payment_method as lift_payment_method, l.payment_method,
           l.reference_number as lift_reference_number, l.reference_number,
           l.notes as lift_notes, l.status as lift_status_text,
           l.created_at as lift_created_at, l.updated_at as lift_updated_at,
           CASE WHEN l.id IS NOT NULL THEN 'lifted' ELSE 'not_lifted' END as lift_status
    FROM members m
    JOIN chits c ON m.chit_id = c.id
    LEFT JOIN lift_details l ON m.id = l.member_id
    WHERE m.id = ?
  `).get(req.params.id) as any;

  if (!member) return res.status(404).json({ error: 'Customer not found' });

  const dues = db.prepare(`
    SELECT * FROM monthly_dues WHERE member_id = ? ORDER BY month_number ASC
  `).all(member.id);

  const payments = db.prepare(`
    SELECT * FROM payments WHERE member_id = ? ORDER BY payment_date DESC, created_at DESC
  `).all(member.id);

  const totalPaid = db.prepare('SELECT COALESCE(SUM(amount), 0) as total FROM payments WHERE member_id = ?').get(member.id) as { total: number };
  const totalOutstanding = db.prepare('SELECT COALESCE(SUM(balance_amount), 0) as total FROM monthly_dues WHERE member_id = ?').get(member.id) as { total: number };

  res.json({
    member,
    dues,
    payments,
    total_paid: totalPaid.total,
    total_outstanding: totalOutstanding.total
  });
});

// Helper for saving or updating lift details
function handleSaveLift(chitId: string, memberId: string, body: any, res: any) {
  const { lift_month, lift_amount_received, lift_amount, lift_date, payment_method, reference_number, notes } = body;
  const rawAmount = lift_amount !== undefined ? lift_amount : lift_amount_received;
  const finalAmount = Number(rawAmount);

  if (!memberId) {
    return res.status(400).json({ error: 'Please select a customer.' });
  }
  if (!lift_month || isNaN(Number(lift_month)) || Number(lift_month) < 1) {
    return res.status(400).json({ error: 'Please select a lift month.' });
  }
  if (!lift_date || String(lift_date).trim() === '') {
    return res.status(400).json({ error: 'Please select lift date.' });
  }
  if (isNaN(finalAmount) || finalAmount <= 0) {
    return res.status(400).json({ error: 'Please enter a valid lift amount.' });
  }
  if (!payment_method || String(payment_method).trim() === '') {
    return res.status(400).json({ error: 'Please select payment method.' });
  }

  const parsedMonth = Number(lift_month);
  const existingLift = db.prepare('SELECT * FROM lift_details WHERE chit_id = ? AND lift_month = ?').get(chitId, parsedMonth) as any;
  if (existingLift && existingLift.member_id !== memberId) {
    return res.status(400).json({ error: `Month ${parsedMonth} is already assigned to another customer.` });
  }

  const existingMemberLift = db.prepare('SELECT * FROM lift_details WHERE member_id = ?').get(memberId) as any;
  const id = existingMemberLift ? existingMemberLift.id : ('lift-' + chitId + '-' + memberId);
  const now = new Date().toISOString();
  const dateValue = String(lift_date).trim();
  const methodValue = String(payment_method).trim();
  const refValue = reference_number ? String(reference_number).trim() : null;
  const notesValue = notes ? String(notes).trim() : '';

  const tx = db.transaction(() => {
    if (existingMemberLift) {
      db.prepare(`
        UPDATE lift_details
        SET lift_month = ?, lift_amount_received = ?, lift_date = ?, payment_method = ?, reference_number = ?, notes = ?, status = 'Completed', updated_at = ?
        WHERE id = ?
      `).run(parsedMonth, finalAmount, dateValue, methodValue, refValue, notesValue, now, id);
    } else {
      db.prepare(`
        INSERT INTO lift_details (id, chit_id, member_id, lift_month, lift_amount_received, lift_date, payment_method, reference_number, notes, status, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'Completed', ?, ?)
      `).run(id, chitId, memberId, parsedMonth, finalAmount, dateValue, methodValue, refValue, notesValue, now, now);
    }

    // Sync dues on lift (pre-lift vs post-lift payment transition)
    syncDuesOnLift(chitId, memberId, parsedMonth);
  });

  try {
    tx();
    const updatedLift = db.prepare('SELECT * FROM lift_details WHERE id = ?').get(id) as any;
    res.json({
      success: true,
      message: `Member marked as lifted in Month ${parsedMonth}.`,
      lift: updatedLift
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
}

// ----------------- LIFT MANAGEMENT -----------------
app.post('/api/chits/:id/lift', (req, res) => {
  const chitId = req.params.id;
  const memberId = req.body.member_id || req.body.memberId;
  return handleSaveLift(chitId, memberId, req.body, res);
});

app.put('/api/chits/:id/lift/:memberId', (req, res) => {
  const chitId = req.params.id;
  const memberId = req.params.memberId || req.body.member_id;
  return handleSaveLift(chitId, memberId, req.body, res);
});

app.delete('/api/chits/:id/lift/:memberId', (req, res) => {
  const chitId = req.params.id;
  const memberId = req.params.memberId;

  const rules = db.prepare('SELECT * FROM chit_month_rules WHERE chit_id = ?').all(chitId) as any[];
  const rulesMap = new Map(rules.map(r => [r.month_number, r]));

  const tx = db.transaction(() => {
    db.prepare('DELETE FROM lift_details WHERE member_id = ?').run(memberId);

    // Reset unpaid dues to pre_lift_payment
    const updateStmt = db.prepare(`
      UPDATE monthly_dues
      SET due_amount = ?, balance_amount = ?
      WHERE chit_id = ? AND member_id = ? AND month_number = ? AND paid_amount = 0
    `);

    for (const [mNum, rule] of rulesMap.entries()) {
      updateStmt.run(rule.pre_lift_payment, rule.pre_lift_payment, chitId, memberId, mNum);
    }
  });

  tx();
  res.json({ success: true, message: 'Lift cancelled and dues reverted to pre-lift amounts.' });
});

// ----------------- PAYMENTS -----------------
app.post('/api/payments', (req, res) => {
  const { monthly_due_id, amount, payment_method, reference_no, notes, payment_date, allow_overpayment } = req.body;

  console.log(`[PAYMENT] Received payment request: monthly_due_id=${monthly_due_id}, amount=${amount}, method=${payment_method}`);

  if (!monthly_due_id || typeof amount !== 'number' || amount <= 0 || isNaN(amount)) {
    return res.status(400).json({ error: 'Valid payment amount and due reference are required.' });
  }

  // 1. Verify authenticated user
  const user = (req as any).user;
  if (!user) {
    return res.status(401).json({ error: 'Unauthorized. Please login.' });
  }

  // 2. Read monthly due record
  const due = db.prepare('SELECT * FROM monthly_dues WHERE id = ?').get(monthly_due_id) as any;
  if (!due) {
    return res.status(404).json({ error: 'Monthly due record not found.' });
  }

  // 3. Verify chit exists
  const chit = db.prepare('SELECT * FROM chits WHERE id = ?').get(due.chit_id) as any;
  if (!chit) {
    return res.status(404).json({ error: 'Chit fund not found.' });
  }

  // 4. Verify member belongs to chit
  const member = db.prepare('SELECT * FROM members WHERE id = ? AND chit_id = ?').get(due.member_id, due.chit_id) as any;
  if (!member) {
    return res.status(404).json({ error: 'Member does not belong to this chit fund.' });
  }

  // 5. Verify month rule exists
  const rule = db.prepare('SELECT * FROM chit_month_rules WHERE chit_id = ? AND month_number = ?').get(due.chit_id, due.month_number) as any;
  if (!rule) {
    return res.status(404).json({ error: 'Month rule not found.' });
  }

  // 6. Current outstanding calculation
  const currentPaymentsTotalRow = db.prepare('SELECT COALESCE(SUM(amount), 0) as total FROM payments WHERE monthly_due_id = ?').get(monthly_due_id) as any;
  const currentPaymentsTotal = currentPaymentsTotalRow ? Number(currentPaymentsTotalRow.total) : 0;
  const currentBalance = Math.max(0, Number(due.due_amount) - currentPaymentsTotal);

  if (amount > currentBalance && !allow_overpayment) {
    return res.status(400).json({
      error: `Payment amount (₹${amount.toLocaleString('en-IN')}) exceeds outstanding balance (₹${currentBalance.toLocaleString('en-IN')}).`
    });
  }

  const paymentId = 'pay-' + Date.now() + '-' + Math.random().toString(36).substring(2, 7);
  const now = new Date().toISOString();
  const payDate = payment_date || now;

  console.log(`[PAYMENT] Starting DB transaction for paymentId=${paymentId}...`);

  const tx = db.transaction(() => {
    // 7. Insert payment record into payments table
    db.prepare(`
      INSERT INTO payments (id, monthly_due_id, chit_id, member_id, month_number, month_name, amount, payment_method, reference_no, notes, payment_date, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      paymentId,
      monthly_due_id,
      due.chit_id,
      due.member_id,
      due.month_number,
      due.month_name,
      amount,
      payment_method || 'Cash',
      reference_no || '',
      notes || '',
      payDate,
      now
    );

    // 8. Re-aggregate authoritative total paid from payments table
    const postPaymentRow = db.prepare('SELECT COALESCE(SUM(amount), 0) as total FROM payments WHERE monthly_due_id = ?').get(monthly_due_id) as any;
    const authoritativePaid = postPaymentRow ? Number(postPaymentRow.total) : amount;
    const newBalance = Math.max(0, Number(due.due_amount) - authoritativePaid);
    const newStatus = authoritativePaid >= Number(due.due_amount) ? 'PAID' : (authoritativePaid > 0 ? 'PARTIAL' : 'PENDING');

    // 9. Update monthly dues balance & status
    db.prepare(`
      UPDATE monthly_dues
      SET paid_amount = ?, balance_amount = ?, status = ?
      WHERE id = ?
    `).run(authoritativePaid, newBalance, newStatus, monthly_due_id);

    console.log(`[PAYMENT] DB transaction updated monthly_dues ${monthly_due_id}: paid=${authoritativePaid}, balance=${newBalance}, status=${newStatus}`);
  });

  try {
    tx();
    console.log(`[PAYMENT] DB transaction committed successfully for paymentId=${paymentId}.`);
    const updatedDue = db.prepare(`
      SELECT d.*, m.customer_name, m.phone, m.ticket_number
      FROM monthly_dues d
      JOIN members m ON d.member_id = m.id
      WHERE d.id = ?
    `).get(monthly_due_id);
    const payment = db.prepare('SELECT * FROM payments WHERE id = ?').get(paymentId);
    res.status(201).json({ payment, updatedDue, success: true });
  } catch (err: any) {
    console.error(`[PAYMENT ERROR] Transaction failed for paymentId=${paymentId}:`, err);
    res.status(500).json({ error: 'Failed to record payment in database: ' + err.message });
  }
});

app.get('/api/payments', (req, res) => {
  const { chit_id, member_id, limit = 50 } = req.query;
  let query = `
    SELECT p.*, m.customer_name, m.phone, m.ticket_number, c.name as chit_name
    FROM payments p
    JOIN members m ON p.member_id = m.id
    JOIN chits c ON p.chit_id = c.id
    WHERE 1=1
  `;
  const params: any[] = [];
  if (chit_id) {
    query += ' AND p.chit_id = ?';
    params.push(chit_id);
  }
  if (member_id) {
    query += ' AND p.member_id = ?';
    params.push(member_id);
  }
  query += ' ORDER BY p.payment_date DESC, p.created_at DESC LIMIT ?';
  params.push(Number(limit));

  const list = db.prepare(query).all(...params);
  res.json(list);
});

// GET all payments for a specific monthly due
app.get('/api/dues/:dueId/payments', (req, res) => {
  const { dueId } = req.params;
  const payments = db.prepare(`
    SELECT p.*, m.customer_name, m.phone, m.ticket_number, c.name as chit_name
    FROM payments p
    LEFT JOIN members m ON p.member_id = m.id
    LEFT JOIN chits c ON p.chit_id = c.id
    WHERE p.monthly_due_id = ?
    ORDER BY p.payment_date DESC, p.created_at DESC
  `).all(dueId);
  res.json(payments);
});

// UPDATE an existing payment
app.put('/api/payments/:id', (req, res) => {
  const { id } = req.params;
  const { amount, payment_method, reference_no, notes, payment_date } = req.body;

  const payment = db.prepare('SELECT * FROM payments WHERE id = ?').get(id) as any;
  if (!payment) {
    return res.status(404).json({ error: 'Payment record not found.' });
  }

  const due = db.prepare('SELECT * FROM monthly_dues WHERE id = ?').get(payment.monthly_due_id) as any;
  if (!due) {
    return res.status(404).json({ error: 'Associated monthly due record not found.' });
  }

  const newAmount = amount !== undefined ? Number(amount) : payment.amount;
  if (isNaN(newAmount) || newAmount <= 0) {
    return res.status(400).json({ error: 'Valid payment amount greater than 0 is required.' });
  }

  const oldAmount = Number(payment.amount);
  const diff = newAmount - oldAmount;
  const newPaidAmount = Math.max(0, Number(due.paid_amount) + diff);

  if (newPaidAmount > due.due_amount && !req.body.allow_overpayment) {
    const maxAllowed = Number(due.due_amount) - (Number(due.paid_amount) - oldAmount);
    return res.status(400).json({
      error: `New payment amount exceeds due balance. Maximum allowed amount is ${maxAllowed}.`
    });
  }

  const newBalanceAmount = Math.max(0, Number(due.due_amount) - newPaidAmount);
  const newStatus = newPaidAmount >= due.due_amount ? 'PAID' : (newPaidAmount > 0 ? 'PARTIAL' : 'PENDING');

  const newMethod = payment_method || payment.payment_method || 'Cash';
  const newRef = reference_no !== undefined ? reference_no : payment.reference_no;
  const newNotes = notes !== undefined ? notes : payment.notes;
  const newDate = payment_date || payment.payment_date;

  const tx = db.transaction(() => {
    db.prepare(`
      UPDATE payments
      SET amount = ?, payment_method = ?, reference_no = ?, notes = ?, payment_date = ?
      WHERE id = ?
    `).run(newAmount, newMethod, newRef, newNotes, newDate, id);

    // Re-aggregate authoritative sum from payments table
    const postRow = db.prepare('SELECT COALESCE(SUM(amount), 0) as total FROM payments WHERE monthly_due_id = ?').get(due.id) as any;
    const authoritativePaid = postRow ? Number(postRow.total) : newPaidAmount;
    const finalBalance = Math.max(0, Number(due.due_amount) - authoritativePaid);
    const finalStatus = authoritativePaid >= Number(due.due_amount) ? 'PAID' : (authoritativePaid > 0 ? 'PARTIAL' : 'PENDING');

    db.prepare(`
      UPDATE monthly_dues
      SET paid_amount = ?, balance_amount = ?, status = ?
      WHERE id = ?
    `).run(authoritativePaid, finalBalance, finalStatus, due.id);
  });

  try {
    tx();
    const updatedPayment = db.prepare('SELECT * FROM payments WHERE id = ?').get(id);
    const updatedDue = db.prepare('SELECT * FROM monthly_dues WHERE id = ?').get(due.id);
    console.log(`[PAYMENT EDIT] Successfully updated payment ${id} and monthly_dues ${due.id}`);
    res.json({ success: true, payment: updatedPayment, updatedDue });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE / REVERT an existing payment
app.delete('/api/payments/:id', (req, res) => {
  const { id } = req.params;

  const payment = db.prepare('SELECT * FROM payments WHERE id = ?').get(id) as any;
  if (!payment) {
    return res.status(404).json({ error: 'Payment record not found.' });
  }

  const due = db.prepare('SELECT * FROM monthly_dues WHERE id = ?').get(payment.monthly_due_id) as any;
  if (!due) {
    return res.status(404).json({ error: 'Associated monthly due record not found.' });
  }

  const tx = db.transaction(() => {
    db.prepare('DELETE FROM payments WHERE id = ?').run(id);

    // Re-aggregate authoritative sum from payments table
    const postRow = db.prepare('SELECT COALESCE(SUM(amount), 0) as total FROM payments WHERE monthly_due_id = ?').get(due.id) as any;
    const authoritativePaid = postRow ? Number(postRow.total) : 0;
    const finalBalance = Math.max(0, Number(due.due_amount) - authoritativePaid);
    const finalStatus = authoritativePaid >= Number(due.due_amount) ? 'PAID' : (authoritativePaid > 0 ? 'PARTIAL' : 'PENDING');

    db.prepare(`
      UPDATE monthly_dues
      SET paid_amount = ?, balance_amount = ?, status = ?
      WHERE id = ?
    `).run(authoritativePaid, finalBalance, finalStatus, due.id);
  });

  try {
    tx();
    const updatedDue = db.prepare('SELECT * FROM monthly_dues WHERE id = ?').get(due.id);
    console.log(`[PAYMENT DELETE] Successfully deleted payment ${id} and synced monthly_dues ${due.id}`);
    res.json({ success: true, message: 'Payment record removed and due balance updated.', updatedDue });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ----------------- PENDING DUES ROUTE -----------------
app.get('/api/dues/pending', (req, res) => {
  try {
    const { chit_id, current_only } = req.query;
    const isCurrentOnly = current_only !== 'false';

    // Ensure monthly dues are generated for active chits
    const activeChits = db.prepare("SELECT id, current_month FROM chits WHERE status = 'active'").all() as any[];
    for (const c of activeChits) {
      ensureMonthlyDuesForChitAndMonth(c.id, c.current_month || 1);
    }

    let sql = `
      SELECT 
        d.*,
        c.name as chit_name,
        c.current_month as chit_current_month,
        m.customer_name,
        m.phone,
        m.ticket_number,
        l.lift_month,
        CASE WHEN l.id IS NOT NULL THEN 'lifted' ELSE 'not_lifted' END as lift_status
      FROM monthly_dues d
      JOIN chits c ON d.chit_id = c.id
      JOIN members m ON d.member_id = m.id
      LEFT JOIN lift_details l ON d.member_id = l.member_id
      WHERE d.balance_amount > 0 AND c.status = 'active'
    `;

    const params: any[] = [];
    if (chit_id) {
      sql += ' AND d.chit_id = ?';
      params.push(chit_id);
    }

    if (isCurrentOnly) {
      sql += ' AND d.month_number = c.current_month';
    }

    sql += ' ORDER BY c.name ASC, CAST(m.ticket_number AS INTEGER) ASC, m.customer_name ASC';

    const dues = db.prepare(sql).all(...params) as any[];

    const totalPendingAmount = dues.reduce((sum, d) => sum + (d.balance_amount || 0), 0);
    const totalPendingMembers = dues.length;

    res.json({
      dues,
      summary: {
        totalPendingMembers,
        totalPendingAmount
      }
    });
  } catch (err: any) {
    console.error('Pending dues error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ----------------- REPORTS -----------------
app.get('/api/chits/:id/reports', (req, res) => {
  const chitId = req.params.id;
  const chit = db.prepare('SELECT * FROM chits WHERE id = ?').get(chitId) as any;
  if (!chit) return res.status(404).json({ error: 'Chit not found' });

  // 1. Monthly collection report
  const monthlyCollection = db.prepare(`
    SELECT r.month_number, r.month_name, r.pre_lift_payment, r.post_lift_payment, r.monthly_chit_value, r.expected_lift_payout,
           COALESCE(SUM(d.due_amount), 0) as total_due,
           COALESCE(SUM(d.paid_amount), 0) as total_paid,
           COALESCE(SUM(d.balance_amount), 0) as total_balance,
           COUNT(d.id) as total_members_count,
           SUM(CASE WHEN d.status = 'PAID' THEN 1 ELSE 0 END) as count_paid,
           SUM(CASE WHEN d.status = 'PARTIAL' THEN 1 ELSE 0 END) as count_partial,
           SUM(CASE WHEN d.status = 'PENDING' THEN 1 ELSE 0 END) as count_pending,
           l.lift_amount_received, m.customer_name as lifted_by
    FROM chit_month_rules r
    LEFT JOIN monthly_dues d ON r.chit_id = d.chit_id AND r.month_number = d.month_number
    LEFT JOIN lift_details l ON r.chit_id = l.chit_id AND r.month_number = l.lift_month
    LEFT JOIN members m ON l.member_id = m.id
    WHERE r.chit_id = ?
    GROUP BY r.month_number
    ORDER BY r.month_number ASC
  `).all(chitId);

  // 2. Customer-wise report
  const customerWise = db.prepare(`
    SELECT m.id, m.customer_name, m.phone, m.ticket_number, m.status,
           l.id as lift_id, l.lift_month, l.lift_amount_received, l.lift_amount_received as lift_amount, l.lift_date,
           l.payment_method, l.reference_number, l.notes as lift_notes, l.status as lift_status_text,
           CASE WHEN l.id IS NOT NULL THEN 'lifted' ELSE 'not_lifted' END as lift_status,
           COALESCE(SUM(d.due_amount), 0) as total_due,
           COALESCE(SUM(d.paid_amount), 0) as total_paid,
           COALESCE(SUM(d.balance_amount), 0) as total_balance,
           SUM(CASE WHEN d.status = 'PAID' THEN 1 ELSE 0 END) as paid_months_count,
           SUM(CASE WHEN d.status != 'PAID' THEN 1 ELSE 0 END) as pending_months_count
    FROM members m
    LEFT JOIN lift_details l ON m.id = l.member_id
    LEFT JOIN monthly_dues d ON m.id = d.member_id
    WHERE m.chit_id = ?
    GROUP BY m.id
    ORDER BY CAST(m.ticket_number AS INTEGER) ASC, m.customer_name ASC
  `).all(chitId);

  // 3. Lifted members
  const liftedMembers = db.prepare(`
    SELECT l.*, m.customer_name, m.phone, m.ticket_number
    FROM lift_details l
    JOIN members m ON l.member_id = m.id
    WHERE l.chit_id = ?
    ORDER BY l.lift_month ASC
  `).all(chitId);

  // 4. Unlifted members
  const unliftedMembers = db.prepare(`
    SELECT m.*
    FROM members m
    LEFT JOIN lift_details l ON m.id = l.member_id
    WHERE m.chit_id = ? AND l.id IS NULL AND m.status = 'active'
    ORDER BY CAST(m.ticket_number AS INTEGER) ASC
  `).all(chitId);

  // Overall totals
  const totals = db.prepare(`
    SELECT 
      COALESCE(SUM(due_amount), 0) as grand_total_due,
      COALESCE(SUM(paid_amount), 0) as grand_total_collected,
      COALESCE(SUM(balance_amount), 0) as grand_total_outstanding
    FROM monthly_dues
    WHERE chit_id = ?
  `).get(chitId) as any;

  res.json({
    chit,
    monthlyCollection,
    customerWise,
    liftedMembers,
    unliftedMembers,
    totals
  });
});

// ----------------- GLOBAL SEARCH -----------------
app.get('/api/search', (req, res) => {
  const query = (req.query.q as string || '').trim();
  if (!query) return res.json([]);

  const results = db.prepare(`
    SELECT m.id, m.customer_name, m.phone, m.ticket_number, m.chit_id,
           c.name as chit_name, c.chit_value,
           l.lift_month,
           CASE WHEN l.id IS NOT NULL THEN 'lifted' ELSE 'not_lifted' END as lift_status
    FROM members m
    JOIN chits c ON m.chit_id = c.id
    LEFT JOIN lift_details l ON m.id = l.member_id
    WHERE m.customer_name LIKE ? OR m.phone LIKE ? OR m.ticket_number LIKE ? OR c.name LIKE ?
    LIMIT 20
  `).all(`%${query}%`, `%${query}%`, `%${query}%`, `%${query}%`);

  res.json(results);
});

// 404 handler for unrecognized API endpoints
app.all('/api/*', (req, res) => {
  res.status(404).json({ error: 'Endpoint not found.' });
});

// Global unhandled error handler for API requests
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('[UNHANDLED ERROR]', err);
  if (res.headersSent) {
    return next(err);
  }
  if (req.path.startsWith('/api/')) {
    return res.status(err.status || 500).json({
      error: 'An unexpected server error occurred. Please try again.',
    });
  }
  next(err);
});

// ----------------- VITE MIDDLEWARE / STATIC ASSETS -----------------
async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`CHIT MANAGER server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
