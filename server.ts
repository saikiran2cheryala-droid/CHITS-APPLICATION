import express from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import cookieParser from 'cookie-parser';
import { createServer as createViteServer } from 'vite';
import {
  initPostgresDatabase,
  findUserByLoginId,
  verifyPassword,
  recordFailedLogin,
  resetFailedLogins,
  createSession,
  verifySessionToken,
  destroySession,
  createPasswordReset,
  verifyPasswordResetCode,
  resetUserPasswordWithToken,
  changeUserPassword,
  updateUserSettings,
  sanitizeUser,
  isPasswordExpired,
  createTempChangePasswordToken,
  verifyTempChangePasswordToken,
  createSecurityResetToken,
  verifySecurityAnswer,
  recordFailedRecovery,
  resetFailedRecovery,
  updateUserSecurityQuestion,
  validatePasswordStrength,
  syncChitsCurrentMonth,
  getDashboardStats,
  getAllChitsWithStats,
  getChitByIdWithDetails,
  createChitFull,
  updateChit,
  deleteChitFull,
  updateChitRules,
  updateMonthRulePayouts,
  getMonthViewData,
  getMembersByChit,
  addMemberToChit,
  importMembersToChit,
  updateMember,
  deleteMember,
  getMemberProfile,
  saveLiftAuction,
  deleteLiftAuction,
  recordLiftPayoutPayment,
  getLiftPayoutTransactions,
  createPaymentRecord,
  getAllPayments,
  getPaymentsByDueId,
  updatePaymentRecord,
  deletePaymentRecord,
  getPendingDues,
  getChitReports,
  globalSearch,
} from './server/prismaRepository.ts';
import { hasPostgresConnection } from './server/prisma.ts';
import { sendPasswordRecoveryEmail } from './server/email.ts';
import { realtimeManager } from './server/realtime.ts';

const app = express();
app.set('trust proxy', 1);

// Configure CORS for production and development
const allowedOrigins = process.env.CORS_ORIGIN
  ? process.env.CORS_ORIGIN.split(',').map(o => o.trim())
  : ['http://localhost:3000', 'http://localhost:5173'];

app.use(cors({
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);
    if (process.env.NODE_ENV !== 'production' || allowedOrigins.includes('*') || allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    return callback(null, true); // Permissive for production web clients
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

// Determine port: Cloud Run sets PORT (e.g. 8080); local dev server runs on port 3000
const args = process.argv.slice(2);
const portArgIndex = args.indexOf('--port');
const portFromArgs = portArgIndex !== -1 && args[portArgIndex + 1] ? Number(args[portArgIndex + 1]) : null;
const PORT = Number(process.env.PORT) || portFromArgs || 3000;

app.use(express.json());
app.use(cookieParser(process.env.SESSION_SECRET));

// Helper to extract session token strictly from HTTP-only Cookie or Bearer header
function extractToken(req: express.Request): string | null {
  if (req.signedCookies && req.signedCookies.chit_session) {
    return req.signedCookies.chit_session;
  }
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
async function authMiddleware(req: express.Request, res: express.Response, next: express.NextFunction) {
  try {
    const token = extractToken(req);
    if (!token) {
      return res.status(401).json({ error: 'Unauthorized. Please login.' });
    }

    const user = await verifySessionToken(token);
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
  } catch (err) {
    next(err);
  }
}

// ----------------- PUBLIC AUTH ROUTES -----------------

// POST /api/auth/login
app.post('/api/auth/login', async (req, res) => {
  try {
    const loginId = (req.body.loginId || req.body.username || '').toString().trim();
    const password = (req.body.password || '').toString();

    if (!loginId || !password) {
      return res.status(400).json({ error: 'Login ID and password are required.' });
    }

    const user = await findUserByLoginId(loginId);
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
      const failInfo = await recordFailedLogin(user.id);
      if (failInfo.isLocked) {
        return res.status(429).json({ error: 'Account locked due to 5 consecutive failed login attempts. Please try again in 15 minutes or use Forgot Password.' });
      }
      return res.status(401).json({ error: 'Invalid Login ID or password.' });
    }

    // Successful password match -> reset failed attempts
    await resetFailedLogins(user.id);

    // Check 3-month calendar password expiration policy
    const isExpired = isPasswordExpired(user.password_changed_at || user.created_at);
    if (isExpired) {
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
    await createSession(user.id, rawToken, ip, ua);

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
app.get('/api/auth/me', async (req, res) => {
  try {
    const token = extractToken(req);
    if (!token) {
      return res.status(401).json({ error: 'UNAUTHORIZED', message: 'Authentication required. Please login.' });
    }

    const user = await verifySessionToken(token);
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
app.post('/api/auth/logout', async (req, res) => {
  try {
    const token = extractToken(req);
    if (token) {
      await destroySession(token);
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
      return res.status(400).json({ error: 'Login ID or Username is required.' });
    }

    const user = await findUserByLoginId(loginId);
    if (!user) {
      return res.status(404).json({ error: 'Account not found matching this Login ID or Username.' });
    }

    if (user.recovery_locked_until) {
      const lockedUntilTime = new Date(user.recovery_locked_until).getTime();
      if (lockedUntilTime > Date.now()) {
        return res.status(429).json({ error: 'Too many recovery attempts. Account recovery is temporarily locked for 15 minutes.' });
      }
    }

    if (!user.recovery_email) {
      return res.status(400).json({
        error: 'No registered recovery email configured for this account. Please contact your system administrator.',
      });
    }

    const { recoveryCode, resetToken } = await createPasswordReset(user.id);

    const origin = req.headers.origin || `${req.protocol}://${req.get('host')}`;
    const resetLink = `${origin}/#reset?token=${resetToken}&loginId=${encodeURIComponent(user.login_id || user.username)}`;

    const emailRes = await sendPasswordRecoveryEmail({
      to: user.recovery_email,
      name: user.name,
      loginId: user.login_id || user.username,
      recoveryCode,
      resetLink,
      expiresInMinutes: 10,
    });

    const [local, domain] = user.recovery_email.split('@');
    const maskedEmail = (local.length > 2 ? local[0] + '***' + local[local.length - 1] : local[0] + '***') + '@' + (domain || '');

    return res.json({
      success: true,
      message: 'A 6-digit verification code has been sent to your registered recovery email.',
      maskedEmail,
      emailSent: emailRes.sent,
      previewUrl: process.env.NODE_ENV !== 'production' ? emailRes.previewUrl : undefined,
    });
  } catch (error: any) {
    console.error('[AUTH FORGOT PASSWORD EMAIL ERROR]', error);
    return res.status(500).json({ error: 'Failed to process recovery request. Please try again later.' });
  }
});

// POST /api/auth/verify-recovery (Verify 6-digit recovery code)
app.post('/api/auth/verify-recovery', async (req, res) => {
  try {
    const loginId = (req.body.loginId || req.body.username || '').toString().trim();
    const code = (req.body.code || req.body.recoveryCode || '').toString().trim();

    if (!loginId || !code) {
      return res.status(400).json({ error: 'Login ID and 6-digit verification code are required.' });
    }

    if (!/^\d{6}$/.test(code)) {
      return res.status(400).json({ error: 'Verification code must be exactly 6 digits.' });
    }

    const result = await verifyPasswordResetCode(loginId, code);
    if (!result) {
      return res.status(400).json({ error: 'Invalid or expired verification code. Please request a new code.' });
    }

    return res.json({
      success: true,
      resetToken: result.resetToken,
      message: 'Verification code verified successfully.',
    });
  } catch (error: any) {
    console.error('[AUTH VERIFY RECOVERY ERROR]', error);
    if (error.message && error.message.includes('locked')) {
      return res.status(429).json({ error: error.message });
    }
    return res.status(500).json({ error: 'Failed to verify verification code.' });
  }
});

// POST /api/auth/forgot-password/question (Step 1 of security question recovery)
app.post('/api/auth/forgot-password/question', async (req, res) => {
  try {
    const loginId = (req.body.loginId || req.body.username || '').toString().trim();
    if (!loginId) {
      return res.status(400).json({ error: 'MISSING_LOGIN_ID', message: 'Please enter your Login ID.' });
    }

    const user = await findUserByLoginId(loginId);
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
app.post('/api/auth/forgot-password/verify-answer', async (req, res) => {
  try {
    const loginId = (req.body.loginId || '').toString().trim();
    const answer = (req.body.answer || '').toString();

    if (!loginId || !answer) {
      return res.status(400).json({ error: 'MISSING_FIELDS', message: 'Login ID and security answer are required.' });
    }

    const user = await findUserByLoginId(loginId);
    if (!user) {
      return res.status(404).json({ error: 'USER_NOT_FOUND', message: 'Account not found.' });
    }

    if (user.recovery_locked_until) {
      const lockedUntilTime = new Date(user.recovery_locked_until).getTime();
      if (lockedUntilTime > Date.now()) {
        return res.status(429).json({ error: 'TOO_MANY_ATTEMPTS', message: 'Too many failed recovery attempts. Account recovery locked for 15 minutes.' });
      }
    }

    const isAnswerCorrect = user.security_answer_hash
      ? verifySecurityAnswer(answer, user.security_answer_hash)
      : answer.trim().toLowerCase() === (user.login_id || '').toLowerCase();

    if (!isAnswerCorrect) {
      const failInfo = await recordFailedRecovery(user.id);
      if (failInfo.isLocked) {
        return res.status(429).json({ error: 'TOO_MANY_ATTEMPTS', message: 'Maximum 5 attempts reached. Recovery is locked for 15 minutes.' });
      }
      return res.status(401).json({
        error: 'INCORRECT_ANSWER',
        message: 'Security answer is incorrect.',
        remainingAttempts: Math.max(0, 5 - failInfo.attempts),
      });
    }

    await resetFailedRecovery(user.id);
    const { resetToken } = await createSecurityResetToken(user.id);

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
app.post('/api/auth/reset-password', async (req, res) => {
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

    await resetUserPasswordWithToken(resetToken, newPassword);
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
app.post('/api/auth/change-password', async (req, res) => {
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

    if (tempToken) {
      const tempRow = verifyTempChangePasswordToken(tempToken);
      if (tempRow) {
        targetUserId = tempRow.user_id;
        isTempTokenValid = true;
      }
    }

    if (!targetUserId) {
      const token = extractToken(req);
      if (token) {
        const sessionUser = await verifySessionToken(token);
        if (sessionUser) {
          targetUserId = sessionUser.id;
        }
      }
    }

    if (!targetUserId && loginId) {
      const user = await findUserByLoginId(loginId);
      if (user) {
        targetUserId = user.id;
      }
    }

    if (!targetUserId) {
      return res.status(401).json({ error: 'UNAUTHORIZED', message: 'Authentication required to change password.' });
    }

    const result = await changeUserPassword(targetUserId, currentPassword || null, newPassword, isTempTokenValid);

    const rawToken = crypto.randomBytes(32).toString('hex');
    const ip = (req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress;
    const ua = req.headers['user-agent'];
    await createSession(targetUserId, rawToken, ip, ua);

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
app.post('/api/auth/security-question', authMiddleware, async (req, res) => {
  try {
    const user = (req as any).user;
    const { currentPassword, securityQuestion, securityAnswer } = req.body;

    if (!currentPassword || !securityQuestion || !securityAnswer) {
      return res.status(400).json({ error: 'MISSING_FIELDS', message: 'Current password, security question, and answer are required.' });
    }

    const result = await updateUserSecurityQuestion(user.id, currentPassword, securityQuestion, securityAnswer);
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
app.post('/api/auth/update-security-settings', authMiddleware, async (req, res) => {
  try {
    const user = (req as any).user;
    const { name, recovery_email, recovery_phone } = req.body;

    const updated = await updateUserSettings(user.id, { name, recovery_email, recovery_phone });
    return res.json({ success: true, user: updated });
  } catch (error: any) {
    console.error('[AUTH UPDATE SETTINGS ERROR]', error);
    return res.status(400).json({ error: 'UPDATE_FAILED', message: error.message || 'Failed to update settings.' });
  }
});

// ----------------- PROTECT ALL APPLICATION API ROUTES -----------------
app.use('/api', authMiddleware);

// ----------------- DASHBOARD STATS -----------------
app.get('/api/dashboard/stats', async (req, res) => {
  try {
    const result = await getDashboardStats();
    res.json(result);
  } catch (err: any) {
    console.error('Stats error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ----------------- SERVER-SENT EVENTS (SSE) REAL-TIME STREAM -----------------
app.get('/api/events', authMiddleware, (req, res) => {
  // Set standard SSE response headers
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  if (typeof (res as any).flushHeaders === 'function') {
    (res as any).flushHeaders();
  }

  const user = (req as any).user;
  const ip = (req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress;
  const ua = req.headers['user-agent'];

  const clientId = realtimeManager.addClient(user.id, res, { ip, userAgent: ua });

  req.on('close', () => {
    realtimeManager.removeClient(clientId);
  });
});

// ----------------- CHITS CRUD -----------------
app.get('/api/chits', async (req, res) => {
  try {
    const result = await getAllChitsWithStats();
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/chits', async (req, res) => {
  try {
    const { name, chit_value, total_months, total_members, start_month, members, rules } = req.body;

    if (!name || !chit_value || !total_months || !total_members || !start_month) {
      return res.status(400).json({ error: 'Please provide all required basic chit fields.' });
    }

    if (!Array.isArray(members) || members.length === 0) {
      return res.status(400).json({ error: 'Please provide at least one member.' });
    }

    if (!Array.isArray(rules) || rules.length !== total_months) {
      return res.status(400).json({ error: `Rules must be provided for all ${total_months} months.` });
    }

    const created = await createChitFull(req.body);
    realtimeManager.broadcast({
      type: 'data_changed',
      chitId: created.id,
      entity: 'chit',
      action: 'created',
    });
    res.status(201).json(created);
  } catch (err: any) {
    console.error('Create chit error:', err);
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/chits/:id', async (req, res) => {
  try {
    const selectedMonth = req.query.month ? parseInt(req.query.month as string, 10) : undefined;
    const chit = await getChitByIdWithDetails(req.params.id, selectedMonth);
    if (!chit) return res.status(404).json({ error: 'Chit not found' });
    res.json(chit);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/chits/:id/projection', async (req, res) => {
  try {
    const chit = await getChitByIdWithDetails(req.params.id);
    if (!chit) return res.status(404).json({ error: 'Chit not found' });
    res.json({
      chit_id: chit.id,
      chit_name: chit.name,
      chit_value: chit.chit_value,
      total_months: chit.total_months,
      total_members: chit.total_members,
      status: chit.status,
      total_projected_collection: chit.total_projected_collection,
      total_projected_lift_payout: chit.total_projected_payout,
      total_projected_profit: chit.total_projected_profit,
      monthly_projections: chit.projected_monthly,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/chits/:id', async (req, res) => {
  try {
    const updated = await updateChit(req.params.id, req.body);
    if (!updated) return res.status(404).json({ error: 'Chit not found' });
    realtimeManager.broadcast({
      type: 'data_changed',
      chitId: req.params.id,
      entity: 'chit',
      action: 'updated',
    });
    res.json(updated);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/chits/:id', async (req, res) => {
  try {
    await deleteChitFull(req.params.id);
    realtimeManager.broadcast({
      type: 'data_changed',
      chitId: req.params.id,
      entity: 'chit',
      action: 'deleted',
    });
    res.json({ success: true, message: 'Chit and all associated records deleted successfully.' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Update chit rules (protects historical payments)
app.put('/api/chits/:id/rules', async (req, res) => {
  try {
    const { rules } = req.body;
    if (!Array.isArray(rules)) {
      return res.status(400).json({ error: 'Rules array is required' });
    }
    await updateChitRules(req.params.id, rules);
    realtimeManager.broadcast({
      type: 'data_changed',
      chitId: req.params.id,
      entity: 'rule',
      action: 'updated',
    });
    res.json({ success: true, message: 'Rules updated successfully. Historical paid dues were preserved.' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Update Month-Wise Lift Payouts (from Excel or manual update)
app.put('/api/chits/:id/rules/lift-payouts', async (req, res) => {
  try {
    const { payouts } = req.body;
    if (!Array.isArray(payouts) || payouts.length === 0) {
      return res.status(400).json({ error: 'Payouts array is required and must not be empty.' });
    }
    const result = await updateMonthRulePayouts(req.params.id, payouts);
    realtimeManager.broadcast({
      type: 'data_changed',
      chitId: req.params.id,
      entity: 'rule',
      action: 'updated',
    });
    res.json({
      success: true,
      message: `Successfully updated lift payouts for ${result.updated_count} month${result.updated_count === 1 ? '' : 's'}.`,
      updated_count: result.updated_count,
    });
  } catch (err: any) {
    res.status(500).json({ error: `Failed to update lift payouts: ${err.message}` });
  }
});

// ----------------- MONTH VIEW & DUES -----------------
app.get('/api/chits/:id/months/:monthNumber', async (req, res) => {
  try {
    const monthNumber = parseInt(req.params.monthNumber, 10);
    const data = await getMonthViewData(req.params.id, monthNumber);
    if (!data) return res.status(404).json({ error: 'Rule for requested month not found' });
    res.json(data);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Dedicated monthly profit calculation endpoint
app.get('/api/chits/:id/months/:monthNumber/profit', async (req, res) => {
  try {
    const monthNumber = parseInt(req.params.monthNumber, 10);
    const data = await getMonthViewData(req.params.id, monthNumber);
    if (!data) return res.status(404).json({ error: 'Chit not found' });
    res.json(data.profit);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ----------------- MEMBERS CRUD -----------------
app.get('/api/chits/:id/members', async (req, res) => {
  try {
    const members = await getMembersByChit(req.params.id);
    res.json(members);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/chits/:id/members', async (req, res) => {
  try {
    const { customer_name, phone } = req.body;
    if (!customer_name || !phone) {
      return res.status(400).json({ error: 'Customer name and phone number are required' });
    }
    const created = await addMemberToChit(req.params.id, req.body);
    if (!created) return res.status(404).json({ error: 'Chit not found' });
    realtimeManager.broadcast({
      type: 'data_changed',
      chitId: req.params.id,
      entity: 'member',
      action: 'created',
    });
    res.status(201).json(created);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Batch import members into a chit
app.post('/api/chits/:id/members/import', async (req, res) => {
  try {
    const { customers } = req.body;
    if (!Array.isArray(customers) || customers.length === 0) {
      return res.status(400).json({ error: 'Customers array is required and cannot be empty' });
    }
    const result = await importMembersToChit(req.params.id, customers);
    realtimeManager.broadcast({
      type: 'data_changed',
      chitId: req.params.id,
      entity: 'member',
      action: 'created',
    });
    res.json(result);
  } catch (err: any) {
    console.error('Import members error:', err);
    res.status(500).json({ error: err.message || 'Failed to import members' });
  }
});

app.put('/api/members/:id', async (req, res) => {
  try {
    const updated = await updateMember(req.params.id, req.body);
    if (updated && updated.chit_id) {
      realtimeManager.broadcast({
        type: 'data_changed',
        chitId: updated.chit_id,
        entity: 'member',
        action: 'updated',
      });
    }
    res.json(updated);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/members/:id', async (req, res) => {
  try {
    const memberId = req.params.id;
    const profile = await getMemberProfile(memberId);
    const chitId = profile?.member?.chit_id || (profile?.member as any)?.chitId;
    const result = await deleteMember(memberId);
    if (chitId) {
      realtimeManager.broadcast({
        type: 'data_changed',
        chitId,
        entity: 'member',
        action: 'deleted',
      });
    }
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Customer Profile view
app.get('/api/members/:id/profile', async (req, res) => {
  try {
    const profile = await getMemberProfile(req.params.id);
    if (!profile) return res.status(404).json({ error: 'Customer not found' });
    res.json(profile);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ----------------- LIFT MANAGEMENT -----------------
app.post('/api/chits/:id/lift', async (req, res) => {
  try {
    const chitId = req.params.id;
    const memberId = req.body.member_id || req.body.memberId;
    const lift = await saveLiftAuction(chitId, memberId, req.body);
    realtimeManager.broadcast({
      type: 'data_changed',
      chitId,
      entity: 'lift',
      action: 'created',
    });
    res.json({
      success: true,
      message: `Member marked as lifted in Month ${req.body.lift_month}.`,
      lift,
    });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

app.put('/api/chits/:id/lift/:memberId', async (req, res) => {
  try {
    const chitId = req.params.id;
    const memberId = req.params.memberId || req.body.member_id;
    const lift = await saveLiftAuction(chitId, memberId, req.body);
    realtimeManager.broadcast({
      type: 'data_changed',
      chitId,
      entity: 'lift',
      action: 'updated',
    });
    res.json({
      success: true,
      message: `Member marked as lifted in Month ${req.body.lift_month}.`,
      lift,
    });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

app.delete('/api/chits/:id/lift/:memberId', async (req, res) => {
  try {
    await deleteLiftAuction(req.params.id, req.params.memberId);
    realtimeManager.broadcast({
      type: 'data_changed',
      chitId: req.params.id,
      entity: 'lift',
      action: 'deleted',
    });
    res.json({ success: true, message: 'Lift cancelled and dues reverted to pre-lift amounts.' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Receive partial or remaining lift payout payment from manager to customer
app.post('/api/chits/:id/lift/:memberId/payout', async (req, res) => {
  try {
    const result = await recordLiftPayoutPayment(req.params.id, req.params.memberId, req.body);
    realtimeManager.broadcast({
      type: 'data_changed',
      chitId: req.params.id,
      entity: 'lift_payout',
      action: 'created',
    });
    return res.json({
      success: true,
      message: `Lift payout payment of ₹${new Intl.NumberFormat('en-IN').format(Number(req.body.amount))} recorded successfully.`,
      lift: result.lift,
      transactions: result.transactions,
    });
  } catch (err: any) {
    return res.status(400).json({ error: err.message });
  }
});

// Get all lift payout transactions for a member
app.get('/api/chits/:id/lift/:memberId/transactions', async (req, res) => {
  try {
    const result = await getLiftPayoutTransactions(req.params.id, req.params.memberId);
    if (!result) return res.status(404).json({ error: 'Lift record not found for this customer.' });
    return res.json(result);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// ----------------- PAYMENTS -----------------
app.post('/api/payments', async (req, res) => {
  try {
    const result = await createPaymentRecord(req.body);
    const chitId = result.payment?.chit_id || result.updatedDue?.chit_id;
    if (chitId) {
      realtimeManager.broadcast({
        type: 'data_changed',
        chitId,
        entity: 'payment',
        action: 'created',
      });
    }
    res.status(201).json({ ...result, success: true });
  } catch (err: any) {
    console.error('[PAYMENT ERROR]', err);
    res.status(400).json({ error: err.message });
  }
});

app.get('/api/payments', async (req, res) => {
  try {
    const { chit_id, member_id, limit } = req.query;
    const list = await getAllPayments({
      chit_id: chit_id as string,
      member_id: member_id as string,
      limit: limit ? Number(limit) : 50,
    });
    res.json(list);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET all payments for a specific monthly due
app.get('/api/dues/:dueId/payments', async (req, res) => {
  try {
    const payments = await getPaymentsByDueId(req.params.dueId);
    res.json(payments);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// UPDATE an existing payment
app.put('/api/payments/:id', async (req, res) => {
  try {
    const result = await updatePaymentRecord(req.params.id, req.body);
    const chitId = result.payment?.chit_id || result.updatedDue?.chit_id;
    if (chitId) {
      realtimeManager.broadcast({
        type: 'data_changed',
        chitId,
        entity: 'payment',
        action: 'updated',
      });
    }
    res.json({ success: true, ...result });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// DELETE / REVERT an existing payment
app.delete('/api/payments/:id', async (req, res) => {
  try {
    const result = await deletePaymentRecord(req.params.id);
    const chitId = result.updatedDue?.chit_id;
    if (chitId) {
      realtimeManager.broadcast({
        type: 'data_changed',
        chitId,
        entity: 'payment',
        action: 'deleted',
      });
    }
    res.json({ success: true, message: 'Payment record removed and due balance updated.', ...result });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// ----------------- PENDING DUES ROUTE -----------------
app.get('/api/dues/pending', async (req, res) => {
  try {
    const { chit_id, current_only } = req.query;
    const isCurrentOnly = current_only !== 'false';
    const result = await getPendingDues(chit_id as string, isCurrentOnly);
    res.json(result);
  } catch (err: any) {
    console.error('Pending dues error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ----------------- REPORTS -----------------
app.get('/api/chits/:id/reports', async (req, res) => {
  try {
    const reports = await getChitReports(req.params.id);
    if (!reports) return res.status(404).json({ error: 'Chit not found' });
    res.json(reports);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ----------------- GLOBAL SEARCH -----------------
app.get('/api/search', async (req, res) => {
  try {
    const query = (req.query.q as string || '').trim();
    if (!query) return res.json([]);
    const results = await globalSearch(query);
    res.json(results);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
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
  if (hasPostgresConnection()) {
    console.log('[DATABASE] Connecting to PostgreSQL via Prisma...');
    try {
      const { execSync } = await import('child_process');
      console.log('[DATABASE] Checking and applying any pending Prisma migrations...');
      execSync('npx prisma migrate deploy', { stdio: 'inherit' });
    } catch (migErr: any) {
      console.warn('[DATABASE] Note on migration deploy:', migErr.message || migErr);
    }
    await initPostgresDatabase();
    await syncChitsCurrentMonth();
    console.log('[DATABASE] PostgreSQL initialized and synchronized successfully.');
  } else {
    console.warn('[DATABASE] DATABASE_URL not set! Falling back to offline development mode.');
    const { initDatabase, syncChitsCurrentMonth: syncSqlite } = await import('./server/db.ts');
    initDatabase();
    syncSqlite();
  }

  const distPath = path.join(process.cwd(), 'dist');
  const hasBuiltAssets = fs.existsSync(path.join(distPath, 'index.html'));
  const isProduction = process.env.NODE_ENV === 'production' || hasBuiltAssets;

  if (!isProduction) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
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
