import React, { useState, useEffect } from 'react';
import {
  ShieldCheck,
  Lock,
  Eye,
  EyeOff,
  KeyRound,
  AlertCircle,
  CheckCircle2,
  ArrowRight,
  ArrowLeft,
  Smartphone,
  Mail,
  HelpCircle,
  Clock,
  Check,
  X,
  ExternalLink,
  RefreshCw,
} from 'lucide-react';
import { api } from '../services/api';
import { User } from '../types';

interface LoginPageProps {
  onLoginSuccess: (user: User) => void;
  initialExpiredUser?: User | null;
}

type AuthView =
  | 'login'
  | 'expired-password'
  | 'forgot-question'
  | 'forgot-email'
  | 'verify-email-code'
  | 'reset-password';

// Helper to check password strength rules
function checkPasswordRules(pwd: string) {
  return {
    minLength: pwd.length >= 8,
    hasUpper: /[A-Z]/.test(pwd),
    hasLower: /[a-z]/.test(pwd),
    hasDigit: /[0-9]/.test(pwd),
    hasSpecial: /[^A-Za-z0-9]/.test(pwd),
  };
}

export const LoginPage: React.FC<LoginPageProps> = ({ onLoginSuccess, initialExpiredUser }) => {
  const [view, setView] = useState<AuthView>(() => (initialExpiredUser ? 'expired-password' : 'login'));

  // Login form state
  const [loginId, setLoginId] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loginLoading, setLoginLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(() =>
    initialExpiredUser ? 'Your password has expired (3-month policy). Please set a new password.' : null
  );
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Expired password handling state
  const [tempToken, setTempToken] = useState<string | null>(null);
  const [expiredLoginId, setExpiredLoginId] = useState<string>(() =>
    initialExpiredUser ? initialExpiredUser.login_id || initialExpiredUser.username || '' : ''
  );

  // Security Question Recovery state
  const [recoveryLoginId, setRecoveryLoginId] = useState('');
  const [securityQuestion, setSecurityQuestion] = useState<string | null>(null);
  const [securityAnswer, setSecurityAnswer] = useState('');
  const [questionLoading, setQuestionLoading] = useState(false);
  const [remainingAttempts, setRemainingAttempts] = useState<number | null>(null);

  // Email recovery state
  const [recoveryCode, setRecoveryCode] = useState('');
  const [resetToken, setResetToken] = useState('');
  const [maskedEmail, setMaskedEmail] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [devCode, setDevCode] = useState<string | null>(null);

  // New Password State (used for both reset and expired password)
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);

  // Check URL hash for direct email reset link (#reset?token=...&loginId=...)
  useEffect(() => {
    try {
      const hash = window.location.hash;
      if (hash && hash.includes('reset?')) {
        const queryStr = hash.split('reset?')[1];
        const params = new URLSearchParams(queryStr);
        const token = params.get('token');
        const userParam = params.get('loginId');
        if (token) {
          setResetToken(token);
          if (userParam) {
            setRecoveryLoginId(decodeURIComponent(userParam));
          }
          setView('reset-password');
          setSuccessMessage('Password reset link verified. Please set a new password.');
        }
      }
    } catch (_) {}
  }, []);

  const passwordRules = checkPasswordRules(newPassword);
  const isPasswordValid =
    passwordRules.minLength &&
    passwordRules.hasUpper &&
    passwordRules.hasLower &&
    passwordRules.hasDigit &&
    passwordRules.hasSpecial;

  // Handle Standard Login
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);

    const cleanId = loginId.trim();
    if (!cleanId || !password) {
      setErrorMessage('Please enter both Login ID and Password.');
      return;
    }

    setLoginLoading(true);
    try {
      const res = await api.auth.login(cleanId, password);

      if (res.status === 'PASSWORD_EXPIRED') {
        // Switch seamlessly to expired password change view
        setTempToken(res.tempToken || null);
        setExpiredLoginId(cleanId);
        setNewPassword('');
        setConfirmPassword('');
        setView('expired-password');
        setSuccessMessage('Your password has expired (3-month policy). Please set a new password.');
        return;
      }

      if (res.user) {
        onLoginSuccess(res.user);
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Invalid Login ID or password.');
    } finally {
      setLoginLoading(false);
    }
  };

  // Handle Expired Password Update
  const handleUpdateExpiredPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);

    if (!isPasswordValid) {
      setErrorMessage('New password must satisfy all security requirements.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setErrorMessage('Confirm password does not match new password.');
      return;
    }

    setActionLoading(true);
    try {
      const res = await api.auth.changePassword({
        newPassword,
        confirmPassword,
        tempToken: tempToken || undefined,
        loginId: expiredLoginId || loginId || undefined,
        currentPassword: password || undefined,
      });

      if (res.user) {
        onLoginSuccess(res.user);
      } else {
        setView('login');
        setPassword('');
        setSuccessMessage('Password updated successfully! Please login with your new password.');
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to update expired password.');
    } finally {
      setActionLoading(false);
    }
  };

  // Step 1 of Security Question: Load Question
  const handleFetchQuestion = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const cleanId = recoveryLoginId.trim();
    if (!cleanId) {
      setErrorMessage('Please enter your Login ID.');
      return;
    }

    setQuestionLoading(true);
    setErrorMessage(null);
    setRemainingAttempts(null);

    try {
      const res = await api.auth.getSecurityQuestion(cleanId);
      setSecurityQuestion(res.security_question);
      setSecurityAnswer('');
    } catch (err: any) {
      setErrorMessage(err.message || 'Could not find an account with this Login ID.');
    } finally {
      setQuestionLoading(false);
    }
  };

  // Step 2 of Security Question: Verify Answer
  const handleVerifySecurityAnswer = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanId = recoveryLoginId.trim();
    const cleanAnswer = securityAnswer.trim();

    if (!cleanAnswer) {
      setErrorMessage('Please enter your answer to the security question.');
      return;
    }

    setActionLoading(true);
    setErrorMessage(null);

    try {
      const res = await api.auth.verifySecurityAnswer(cleanId, cleanAnswer);
      setResetToken(res.resetToken);
      setView('reset-password');
      setSuccessMessage('Security answer verified! Please set your new password.');
    } catch (err: any) {
      setErrorMessage(err.message || 'Incorrect security answer.');
    } finally {
      setActionLoading(false);
    }
  };

  // Email-based Recovery: Request Code
  const handleRequestEmailRecovery = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const cleanId = recoveryLoginId.trim();
    if (!cleanId) {
      setErrorMessage('Please enter your Login ID or registered email.');
      return;
    }

    setActionLoading(true);
    setErrorMessage(null);

    try {
      const res = await api.auth.forgotPassword(cleanId);
      setMaskedEmail(res.maskedEmail || null);
      setPreviewUrl(res.previewUrl || null);
      if (res.devCode) {
        setDevCode(res.devCode);
        setRecoveryCode(res.devCode);
      }
      if (res.resetToken) {
        setResetToken(res.resetToken);
      }
      setView('verify-email-code');
      setSuccessMessage(res.message || 'Verification instructions sent to your email.');
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to dispatch email instructions.');
    } finally {
      setActionLoading(false);
    }
  };

  // Email-based Recovery: Verify 6-digit Code
  const handleVerifyEmailCode = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanCode = recoveryCode.trim();
    if (cleanCode.length < 6) {
      setErrorMessage('Please enter the full 6-digit code.');
      return;
    }

    setActionLoading(true);
    setErrorMessage(null);

    try {
      const res = await api.auth.verifyRecovery(recoveryLoginId.trim(), cleanCode);
      setResetToken(res.resetToken);
      setView('reset-password');
      setSuccessMessage('Code verified successfully! Please enter your new password.');
    } catch (err: any) {
      setErrorMessage(err.message || 'Invalid or expired verification code.');
    } finally {
      setActionLoading(false);
    }
  };

  // Set New Password (Final Step for Reset)
  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (!isPasswordValid) {
      setErrorMessage('Password must satisfy all security requirements.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setErrorMessage('Confirm password does not match new password.');
      return;
    }

    setActionLoading(true);
    try {
      const res = await api.auth.resetPassword({
        resetToken,
        newPassword,
        confirmPassword,
      });

      // Clear state and return to login
      setView('login');
      setPassword('');
      setSuccessMessage(res.message || 'Password reset successfully! Please sign in with your new password.');
      setNewPassword('');
      setConfirmPassword('');
      setResetToken('');
      setRecoveryCode('');
      setSecurityQuestion(null);
      setSecurityAnswer('');
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to reset password.');
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-900 flex flex-col justify-center items-center p-4 sm:p-6 lg:p-8 selection:bg-blue-600 selection:text-white">
      {/* Background radial highlight */}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_var(--tw-gradient-stops))] from-blue-900/30 via-slate-900/50 to-slate-950 pointer-events-none" />

      <div className="relative w-full max-w-md mx-auto z-10">
        {/* Brand Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-blue-600 text-white shadow-xl shadow-blue-600/30 mb-4 border border-blue-400/30">
            <ShieldCheck className="w-9 h-9" />
          </div>
          <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-white">
            CHIT MANAGER
          </h1>
          <p className="text-sm font-medium text-slate-400 mt-1">
            Secure Account Authentication
          </p>
        </div>

        {/* Card Container */}
        <div className="bg-white rounded-3xl shadow-2xl border border-slate-200/80 p-6 sm:p-8 backdrop-blur-sm">
          {/* Error Message */}
          {errorMessage && (
            <div className="mb-5 p-3.5 bg-red-50 border border-red-200 rounded-2xl flex items-start gap-3 text-xs text-red-800 animate-in fade-in">
              <AlertCircle className="w-4 h-4 shrink-0 text-red-600 mt-0.5" />
              <div className="flex-1 font-semibold">{errorMessage}</div>
            </div>
          )}

          {/* Success Message */}
          {successMessage && (
            <div className="mb-5 p-3.5 bg-emerald-50 border border-emerald-200 rounded-2xl flex items-start gap-3 text-xs text-emerald-800 animate-in fade-in">
              <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600 mt-0.5" />
              <div className="flex-1 font-semibold">{successMessage}</div>
            </div>
          )}

          {/* ===================== VIEW 1: LOGIN ===================== */}
          {view === 'login' && (
            <form onSubmit={handleLogin} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                  Login ID
                </label>
                <div className="relative">
                  <input
                    id="login-id-input"
                    type="text"
                    required
                    autoComplete="username"
                    value={loginId}
                    onChange={(e) => setLoginId(e.target.value)}
                    placeholder="Enter your Login ID"
                    className="w-full pl-3.5 pr-10 py-3 bg-slate-50 border border-slate-300 rounded-xl text-sm font-semibold text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:bg-white transition-all"
                  />
                  <Smartphone className="w-4 h-4 text-slate-400 absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                  Password
                </label>
                <div className="relative">
                  <input
                    id="login-password-input"
                    type={showPassword ? 'text' : 'password'}
                    required
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter your password"
                    className="w-full pl-3.5 pr-11 py-3 bg-slate-50 border border-slate-300 rounded-xl text-sm font-semibold text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:bg-white transition-all"
                  />
                  <button
                    type="button"
                    id="login-toggle-password-btn"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-1 cursor-pointer"
                    title={showPassword ? 'Hide Password' : 'Show Password'}
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div className="pt-2">
                <button
                  id="login-submit-btn"
                  type="submit"
                  disabled={loginLoading}
                  className="w-full py-3.5 px-4 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white rounded-xl text-sm font-bold shadow-lg shadow-blue-600/20 transition-all flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer"
                >
                  {loginLoading ? (
                    <span className="inline-flex items-center gap-2">
                      <svg className="animate-spin h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                      </svg>
                      Authenticating...
                    </span>
                  ) : (
                    <>
                      <span>SIGN IN</span>
                      <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </button>
              </div>

              <div className="text-center pt-2">
                <button
                  type="button"
                  id="forgot-password-link-btn"
                  onClick={() => {
                    setView('forgot-question');
                    setErrorMessage(null);
                    setSuccessMessage(null);
                    setRecoveryLoginId(loginId || '');
                    setSecurityQuestion(null);
                    setSecurityAnswer('');
                  }}
                  className="text-xs font-semibold text-blue-600 hover:text-blue-700 hover:underline cursor-pointer"
                >
                  Forgot Password?
                </button>
              </div>
            </form>
          )}

          {/* ===================== VIEW 2: EXPIRED PASSWORD ===================== */}
          {view === 'expired-password' && (
            <form onSubmit={handleUpdateExpiredPassword} className="space-y-4">
              <div className="flex items-center gap-2 mb-1">
                <div className="p-1.5 rounded-lg bg-amber-100 text-amber-800">
                  <Clock className="w-4 h-4 text-amber-700" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">Password Expired</h3>
                  <p className="text-xs text-slate-500">
                    Your password has reached the 3-month security limit. Create a new password to proceed.
                  </p>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                  New Password
                </label>
                <div className="relative">
                  <input
                    id="expired-new-password-input"
                    type={showNewPassword ? 'text' : 'password'}
                    required
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="Enter strong new password"
                    className="w-full pl-3.5 pr-10 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-sm font-medium text-slate-900 focus:ring-2 focus:ring-blue-600 focus:bg-white"
                  />
                  <button
                    type="button"
                    onClick={() => setShowNewPassword(!showNewPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-1 cursor-pointer"
                  >
                    {showNewPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                  Confirm New Password
                </label>
                <div className="relative">
                  <input
                    id="expired-confirm-password-input"
                    type={showConfirmPassword ? 'text' : 'password'}
                    required
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Confirm new password"
                    className="w-full pl-3.5 pr-10 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-sm font-medium text-slate-900 focus:ring-2 focus:ring-blue-600 focus:bg-white"
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-1 cursor-pointer"
                  >
                    {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {/* Password Strength Checklist */}
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs space-y-1">
                <span className="font-bold text-slate-700 block mb-1">Password Requirements:</span>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-1 text-[11px]">
                  <div className={`flex items-center gap-1.5 ${passwordRules.minLength ? 'text-emerald-700 font-semibold' : 'text-slate-500'}`}>
                    {passwordRules.minLength ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <X className="w-3.5 h-3.5 text-slate-400" />}
                    At least 8 characters
                  </div>
                  <div className={`flex items-center gap-1.5 ${passwordRules.hasUpper ? 'text-emerald-700 font-semibold' : 'text-slate-500'}`}>
                    {passwordRules.hasUpper ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <X className="w-3.5 h-3.5 text-slate-400" />}
                    Uppercase letter (A-Z)
                  </div>
                  <div className={`flex items-center gap-1.5 ${passwordRules.hasLower ? 'text-emerald-700 font-semibold' : 'text-slate-500'}`}>
                    {passwordRules.hasLower ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <X className="w-3.5 h-3.5 text-slate-400" />}
                    Lowercase letter (a-z)
                  </div>
                  <div className={`flex items-center gap-1.5 ${passwordRules.hasDigit ? 'text-emerald-700 font-semibold' : 'text-slate-500'}`}>
                    {passwordRules.hasDigit ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <X className="w-3.5 h-3.5 text-slate-400" />}
                    Number (0-9)
                  </div>
                  <div className={`flex items-center gap-1.5 ${passwordRules.hasSpecial ? 'text-emerald-700 font-semibold' : 'text-slate-500'} sm:col-span-2`}>
                    {passwordRules.hasSpecial ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <X className="w-3.5 h-3.5 text-slate-400" />}
                    Special symbol (@, #, $, %, etc.)
                  </div>
                </div>
              </div>

              <div className="pt-2 flex flex-col gap-2">
                <button
                  type="submit"
                  disabled={actionLoading || !isPasswordValid || newPassword !== confirmPassword}
                  className="w-full py-3.5 px-4 bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white rounded-xl text-sm font-bold shadow-md shadow-emerald-600/20 transition-all cursor-pointer disabled:opacity-50"
                >
                  {actionLoading ? 'Updating Password...' : 'Save New Password & Continue'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setView('login');
                    setErrorMessage(null);
                  }}
                  className="text-xs text-slate-500 hover:text-slate-700 py-1.5 cursor-pointer text-center"
                >
                  Cancel and return to Login
                </button>
              </div>
            </form>
          )}

          {/* ===================== VIEW 3: FORGOT PASSWORD VIA SECURITY QUESTION ===================== */}
          {view === 'forgot-question' && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 mb-1">
                <button
                  type="button"
                  onClick={() => {
                    setView('login');
                    setErrorMessage(null);
                  }}
                  className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 cursor-pointer"
                >
                  <ArrowLeft className="w-4 h-4" />
                </button>
                <h3 className="text-base font-bold text-slate-900">Account Recovery</h3>
              </div>

              {!securityQuestion ? (
                <form onSubmit={handleFetchQuestion} className="space-y-4">
                  <p className="text-xs text-slate-500">
                    Enter your registered Login ID to retrieve your account security recovery question.
                  </p>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                      Login ID
                    </label>
                    <div className="relative">
                      <input
                        id="recovery-login-id-input"
                        type="text"
                        required
                        value={recoveryLoginId}
                        onChange={(e) => setRecoveryLoginId(e.target.value)}
                        placeholder="Enter your registered Login ID"
                        className="w-full pl-3.5 pr-10 py-3 bg-slate-50 border border-slate-300 rounded-xl text-sm font-semibold text-slate-900 focus:ring-2 focus:ring-blue-600 focus:bg-white"
                      />
                      <Smartphone className="w-4 h-4 text-slate-400 absolute right-3.5 top-1/2 -translate-y-1/2" />
                    </div>
                  </div>

                  <div className="pt-2">
                    <button
                      type="submit"
                      disabled={questionLoading || !recoveryLoginId.trim()}
                      className="w-full py-3.5 px-4 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-bold shadow-md shadow-blue-600/20 transition-all flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer"
                    >
                      {questionLoading ? 'Checking Account...' : 'Continue to Security Question'}
                      <ArrowRight className="w-4 h-4" />
                    </button>
                  </div>
                </form>
              ) : (
                <form onSubmit={handleVerifySecurityAnswer} className="space-y-4">
                  <div className="p-3.5 bg-blue-50 border border-blue-200 rounded-xl text-xs text-blue-900">
                    <div className="flex items-center gap-1.5 font-bold text-blue-950 mb-1">
                      <HelpCircle className="w-4 h-4 text-blue-600" />
                      Security Question:
                    </div>
                    <div className="text-sm font-semibold text-blue-900">
                      {securityQuestion}
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                      Your Answer
                    </label>
                    <input
                      id="security-answer-input"
                      type="text"
                      required
                      autoFocus
                      value={securityAnswer}
                      onChange={(e) => setSecurityAnswer(e.target.value)}
                      placeholder="Enter the answer you previously configured"
                      className="w-full px-3.5 py-3 bg-slate-50 border border-slate-300 rounded-xl text-sm font-semibold text-slate-900 focus:ring-2 focus:ring-blue-600 focus:bg-white"
                    />
                  </div>

                  <div className="pt-2 flex flex-col gap-2">
                    <button
                      type="submit"
                      disabled={actionLoading || !securityAnswer.trim()}
                      className="w-full py-3.5 px-4 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-bold shadow-md shadow-blue-600/20 transition-all cursor-pointer disabled:opacity-50"
                    >
                      {actionLoading ? 'Verifying...' : 'Verify Answer & Reset Password'}
                    </button>

                    <button
                      type="button"
                      onClick={() => setSecurityQuestion(null)}
                      className="text-xs text-slate-500 hover:text-slate-700 py-1 cursor-pointer text-center"
                    >
                      Try a different Login ID
                    </button>
                  </div>
                </form>
              )}

              {/* Alternative Email Recovery option */}
              <div className="pt-3 border-t border-slate-200 text-center">
                <button
                  type="button"
                  onClick={() => {
                    setView('forgot-email');
                    setErrorMessage(null);
                  }}
                  className="text-xs text-slate-600 hover:text-blue-600 inline-flex items-center gap-1 font-semibold cursor-pointer"
                >
                  <Mail className="w-3.5 h-3.5" />
                  Prefer recovery via Email? Click here
                </button>
              </div>
            </div>
          )}

          {/* ===================== VIEW 4: FORGOT PASSWORD VIA EMAIL ===================== */}
          {view === 'forgot-email' && (
            <form onSubmit={handleRequestEmailRecovery} className="space-y-4">
              <div className="flex items-center gap-2 mb-1">
                <button
                  type="button"
                  onClick={() => {
                    setView('forgot-question');
                    setErrorMessage(null);
                  }}
                  className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 cursor-pointer"
                >
                  <ArrowLeft className="w-4 h-4" />
                </button>
                <h3 className="text-base font-bold text-slate-900">Email Recovery</h3>
              </div>
              <p className="text-xs text-slate-500">
                Enter your Login ID or registered email address. We will dispatch a 6-digit verification code.
              </p>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                  Login ID or Email
                </label>
                <div className="relative">
                  <input
                    type="text"
                    required
                    value={recoveryLoginId}
                    onChange={(e) => setRecoveryLoginId(e.target.value)}
                    placeholder="Enter Login ID or email"
                    className="w-full pl-3.5 pr-10 py-3 bg-slate-50 border border-slate-300 rounded-xl text-sm font-semibold text-slate-900 focus:ring-2 focus:ring-blue-600 focus:bg-white"
                  />
                  <Mail className="w-4 h-4 text-slate-400 absolute right-3.5 top-1/2 -translate-y-1/2" />
                </div>
              </div>

              <div className="pt-2">
                <button
                  type="submit"
                  disabled={actionLoading || !recoveryLoginId.trim()}
                  className="w-full py-3.5 px-4 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-bold shadow-md shadow-blue-600/20 transition-all cursor-pointer disabled:opacity-50"
                >
                  {actionLoading ? 'Dispatching...' : 'Send Recovery Code to Email'}
                </button>
              </div>

              <div className="text-center pt-1">
                <button
                  type="button"
                  onClick={() => setView('forgot-question')}
                  className="text-xs text-slate-500 hover:text-slate-800 cursor-pointer"
                >
                  Back to Security Question
                </button>
              </div>
            </form>
          )}

          {/* ===================== VIEW 5: VERIFY EMAIL CODE ===================== */}
          {view === 'verify-email-code' && (
            <form onSubmit={handleVerifyEmailCode} className="space-y-4">
              <div className="flex items-center gap-2 mb-1">
                <button
                  type="button"
                  onClick={() => setView('forgot-email')}
                  className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 cursor-pointer"
                >
                  <ArrowLeft className="w-4 h-4" />
                </button>
                <h3 className="text-base font-bold text-slate-900">Check Your Email</h3>
              </div>

              <div className="p-3.5 bg-blue-50 border border-blue-200 rounded-xl text-xs text-blue-900 space-y-2">
                <p className="text-[12px] text-blue-800">
                  We have dispatched a 6-digit verification code to:
                </p>
                <div className="font-mono font-bold text-blue-950 bg-white py-1.5 px-3 rounded-lg border border-blue-200 text-xs">
                  {maskedEmail || 'registered email address'}
                </div>

                {previewUrl && (
                  <div className="pt-1.5 border-t border-blue-200">
                    <a
                      href={previewUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1.5 text-xs text-blue-700 hover:text-blue-900 font-bold underline cursor-pointer"
                    >
                      <Mail className="w-3.5 h-3.5" />
                      Open Sent Mail in Webmail Preview
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  </div>
                )}

                {devCode && (
                  <div className="pt-1.5 border-t border-blue-200 flex items-center justify-between">
                    <span className="text-[11px] text-blue-800">Verification Code:</span>
                    <span className="font-mono font-bold bg-white px-2 py-0.5 rounded border border-blue-300 text-blue-950 text-xs">
                      {devCode}
                    </span>
                  </div>
                )}
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                  Enter 6-Digit Code
                </label>
                <input
                  id="recovery-code-input"
                  type="text"
                  required
                  maxLength={6}
                  value={recoveryCode}
                  onChange={(e) => setRecoveryCode(e.target.value.replace(/\D/g, ''))}
                  placeholder="e.g. 123456"
                  className="w-full text-center tracking-widest text-xl font-mono font-bold py-3 bg-slate-50 border border-slate-300 rounded-xl text-slate-900 focus:ring-2 focus:ring-blue-600 focus:bg-white"
                />
              </div>

              <div className="pt-2 space-y-2">
                <button
                  type="submit"
                  disabled={actionLoading || recoveryCode.length < 6}
                  className="w-full py-3.5 px-4 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-bold shadow-md shadow-blue-600/20 transition-all cursor-pointer disabled:opacity-50"
                >
                  {actionLoading ? 'Verifying...' : 'Verify Code & Set Password'}
                </button>

                <div className="text-center">
                  <button
                    type="button"
                    onClick={() => handleRequestEmailRecovery()}
                    disabled={actionLoading}
                    className="inline-flex items-center gap-1 text-xs font-semibold text-blue-600 hover:text-blue-800 cursor-pointer disabled:opacity-50"
                  >
                    <RefreshCw className={`w-3 h-3 ${actionLoading ? 'animate-spin' : ''}`} />
                    Resend Code
                  </button>
                </div>
              </div>
            </form>
          )}

          {/* ===================== VIEW 6: RESET PASSWORD ===================== */}
          {view === 'reset-password' && (
            <form onSubmit={handleResetPassword} className="space-y-4">
              <div>
                <h3 className="text-base font-bold text-slate-900 mb-1">Set New Password</h3>
                <p className="text-xs text-slate-500">
                  Create a new secure password for your account.
                </p>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                  New Password
                </label>
                <div className="relative">
                  <input
                    id="new-password-input"
                    type={showNewPassword ? 'text' : 'password'}
                    required
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="Enter new password"
                    className="w-full pl-3.5 pr-10 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-sm font-medium text-slate-900 focus:ring-2 focus:ring-blue-600 focus:bg-white"
                  />
                  <button
                    type="button"
                    onClick={() => setShowNewPassword(!showNewPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-1 cursor-pointer"
                  >
                    {showNewPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                  Confirm New Password
                </label>
                <div className="relative">
                  <input
                    id="confirm-password-input"
                    type={showConfirmPassword ? 'text' : 'password'}
                    required
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Re-enter new password"
                    className="w-full pl-3.5 pr-10 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-sm font-medium text-slate-900 focus:ring-2 focus:ring-blue-600 focus:bg-white"
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-1 cursor-pointer"
                  >
                    {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {/* Password Strength Checklist */}
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs space-y-1">
                <span className="font-bold text-slate-700 block mb-1">Password Requirements:</span>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-1 text-[11px]">
                  <div className={`flex items-center gap-1.5 ${passwordRules.minLength ? 'text-emerald-700 font-semibold' : 'text-slate-500'}`}>
                    {passwordRules.minLength ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <X className="w-3.5 h-3.5 text-slate-400" />}
                    At least 8 characters
                  </div>
                  <div className={`flex items-center gap-1.5 ${passwordRules.hasUpper ? 'text-emerald-700 font-semibold' : 'text-slate-500'}`}>
                    {passwordRules.hasUpper ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <X className="w-3.5 h-3.5 text-slate-400" />}
                    Uppercase letter (A-Z)
                  </div>
                  <div className={`flex items-center gap-1.5 ${passwordRules.hasLower ? 'text-emerald-700 font-semibold' : 'text-slate-500'}`}>
                    {passwordRules.hasLower ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <X className="w-3.5 h-3.5 text-slate-400" />}
                    Lowercase letter (a-z)
                  </div>
                  <div className={`flex items-center gap-1.5 ${passwordRules.hasDigit ? 'text-emerald-700 font-semibold' : 'text-slate-500'}`}>
                    {passwordRules.hasDigit ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <X className="w-3.5 h-3.5 text-slate-400" />}
                    Number (0-9)
                  </div>
                  <div className={`flex items-center gap-1.5 ${passwordRules.hasSpecial ? 'text-emerald-700 font-semibold' : 'text-slate-500'} sm:col-span-2`}>
                    {passwordRules.hasSpecial ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <X className="w-3.5 h-3.5 text-slate-400" />}
                    Special symbol (@, #, $, %, etc.)
                  </div>
                </div>
              </div>

              <div className="pt-2">
                <button
                  type="submit"
                  disabled={actionLoading || !isPasswordValid || newPassword !== confirmPassword}
                  className="w-full py-3.5 px-4 bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white rounded-xl text-sm font-bold shadow-md shadow-emerald-600/20 transition-all cursor-pointer disabled:opacity-50"
                >
                  {actionLoading ? 'Saving Password...' : 'Save New Password & Sign In'}
                </button>
              </div>
            </form>
          )}
        </div>

        {/* Footer info */}
        <div className="text-center mt-6 text-xs text-slate-400">
          Chit Fund Multi-Ledger Management Platform • Protected by End-to-End Hash Authentication
        </div>
      </div>
    </div>
  );
};
