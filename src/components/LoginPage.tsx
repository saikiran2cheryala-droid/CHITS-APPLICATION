import React, { useState } from 'react';
import { ShieldCheck, Lock, Eye, EyeOff, KeyRound, AlertCircle, CheckCircle2, ArrowRight, ArrowLeft, Smartphone, Mail, HelpCircle } from 'lucide-react';
import { api } from '../services/api';
import { User } from '../types';

interface LoginPageProps {
  onLoginSuccess: (user: User) => void;
}

type AuthView = 'login' | 'forgot-id' | 'verify-code' | 'reset-password';

export const LoginPage: React.FC<LoginPageProps> = ({ onLoginSuccess }) => {
  const [view, setView] = useState<AuthView>('login');

  // Login form state
  const [loginId, setLoginId] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loginLoading, setLoginLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Recovery & Reset state
  const [recoveryLoginId, setRecoveryLoginId] = useState('');
  const [recoveryCode, setRecoveryCode] = useState('');
  const [resetToken, setResetToken] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [maskedPhone, setMaskedPhone] = useState<string | null>(null);
  const [maskedEmail, setMaskedEmail] = useState<string | null>(null);
  const [devCode, setDevCode] = useState<string | null>(null);
  const [recoveryLoading, setRecoveryLoading] = useState(false);

  // Handle Login submission
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
      onLoginSuccess(res.user);
    } catch (err: any) {
      setErrorMessage(err.message || 'Invalid Login ID or password.');
    } finally {
      setLoginLoading(false);
    }
  };

  // Step 1: Request Password Recovery Code
  const handleRequestRecovery = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setRecoveryLoading(true);

    try {
      const res = await api.auth.forgotPassword(recoveryLoginId.trim());
      setMaskedPhone(res.maskedPhone || null);
      setMaskedEmail(res.maskedEmail || null);
      if (res.devCode) {
        setDevCode(res.devCode);
        setRecoveryCode(res.devCode); // Pre-fill for instant testability
      }
      setView('verify-code');
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to initiate password recovery.');
    } finally {
      setRecoveryLoading(false);
    }
  };

  // Step 2: Verify Recovery Code
  const handleVerifyCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setRecoveryLoading(true);

    try {
      const res = await api.auth.verifyRecovery(recoveryLoginId.trim(), recoveryCode.trim());
      setResetToken(res.resetToken);
      setView('reset-password');
    } catch (err: any) {
      setErrorMessage(err.message || 'Invalid or expired recovery code.');
    } finally {
      setRecoveryLoading(false);
    }
  };

  // Step 3: Reset Password
  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (newPassword.length < 8) {
      setErrorMessage('New password must be at least 8 characters.');
      return;
    }

    if (newPassword !== confirmPassword) {
      setErrorMessage('Confirm password does not match new password.');
      return;
    }

    setRecoveryLoading(true);
    try {
      const res = await api.auth.resetPassword({
        resetToken,
        newPassword,
        confirmPassword,
      });

      // Reset state and redirect to login
      setView('login');
      setPassword('');
      setSuccessMessage(res.message || 'Password reset successfully. Please login again.');
      setNewPassword('');
      setConfirmPassword('');
      setResetToken('');
      setRecoveryCode('');
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to reset password.');
    } finally {
      setRecoveryLoading(false);
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
            Secure Account Login
          </p>
        </div>

        {/* Card Container */}
        <div className="bg-white rounded-3xl shadow-2xl border border-slate-200/80 p-6 sm:p-8 backdrop-blur-sm">
          {/* Notifications / Alerts */}
          {errorMessage && (
            <div className="mb-5 p-3.5 bg-red-50 border border-red-200 rounded-2xl flex items-start gap-3 text-xs text-red-800 animate-in fade-in">
              <AlertCircle className="w-4 h-4 shrink-0 text-red-600 mt-0.5" />
              <div className="flex-1 font-semibold">{errorMessage}</div>
            </div>
          )}

          {successMessage && (
            <div className="mb-5 p-3.5 bg-emerald-50 border border-emerald-200 rounded-2xl flex items-start gap-3 text-xs text-emerald-800 animate-in fade-in">
              <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600 mt-0.5" />
              <div className="flex-1 font-semibold">{successMessage}</div>
            </div>
          )}

          {/* VIEW: LOGIN */}
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
                    value={loginId}
                    onChange={(e) => setLoginId(e.target.value)}
                    placeholder="Enter Login ID (e.g. 9640488507)"
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
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter account password"
                    className="w-full pl-3.5 pr-11 py-3 bg-slate-50 border border-slate-300 rounded-xl text-sm font-semibold text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:bg-white transition-all"
                  />
                  <button
                    type="button"
                    id="login-toggle-password-btn"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-1"
                    title={showPassword ? 'Hide Password' : 'Show Password'}
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {/* Login Button */}
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
                      Verifying Credentials...
                    </span>
                  ) : (
                    <>
                      <span>LOGIN</span>
                      <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </button>
              </div>

              {/* Forgot Password Link */}
              <div className="text-center pt-2">
                <button
                  type="button"
                  id="forgot-password-link-btn"
                  onClick={() => {
                    setView('forgot-id');
                    setErrorMessage(null);
                    setSuccessMessage(null);
                    setRecoveryLoginId(loginId || '9640488507');
                  }}
                  className="text-xs font-semibold text-blue-600 hover:text-blue-700 hover:underline cursor-pointer"
                >
                  Forgot Password?
                </button>
              </div>

              {/* Quick Credentials Card */}
              <div className="mt-4 p-3 bg-slate-50 border border-slate-200 rounded-2xl text-[11px] text-slate-600">
                <div className="flex items-center justify-between font-bold text-slate-800 mb-1">
                  <span>Initial Admin Credentials</span>
                  <span className="text-[10px] bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded font-mono">Role: ADMIN</span>
                </div>
                <div className="space-y-1 font-mono text-slate-700">
                  <div>Login ID: <strong className="text-slate-900">9640488507</strong></div>
                  <div>Password: <strong className="text-slate-900">saikiran@123</strong></div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setLoginId('9640488507');
                    setPassword('saikiran@123');
                    setErrorMessage(null);
                  }}
                  className="mt-2 text-[10px] text-blue-600 hover:text-blue-800 font-bold underline cursor-pointer"
                >
                  Auto-fill initial admin credentials
                </button>
              </div>
            </form>
          )}

          {/* VIEW: FORGOT PASSWORD - STEP 1 */}
          {view === 'forgot-id' && (
            <form onSubmit={handleRequestRecovery} className="space-y-4">
              <div className="flex items-center gap-2 mb-2">
                <button
                  type="button"
                  onClick={() => {
                    setView('login');
                    setErrorMessage(null);
                  }}
                  className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100"
                >
                  <ArrowLeft className="w-4 h-4" />
                </button>
                <h3 className="text-base font-bold text-slate-900">Password Recovery</h3>
              </div>
              <p className="text-xs text-slate-500">
                Enter your Login ID. If the account exists, secure recovery instructions will be provided.
              </p>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                  Login ID
                </label>
                <input
                  id="recovery-login-id-input"
                  type="text"
                  required
                  value={recoveryLoginId}
                  onChange={(e) => setRecoveryLoginId(e.target.value)}
                  placeholder="e.g. 9640488507"
                  className="w-full px-3.5 py-3 bg-slate-50 border border-slate-300 rounded-xl text-sm font-semibold text-slate-900 focus:ring-2 focus:ring-blue-600 focus:bg-white"
                />
              </div>

              <div className="pt-2">
                <button
                  type="submit"
                  disabled={recoveryLoading}
                  className="w-full py-3 px-4 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-bold shadow-md shadow-blue-600/20 transition-all flex items-center justify-center gap-2"
                >
                  {recoveryLoading ? 'Searching...' : 'Send Recovery Code'}
                </button>
              </div>
            </form>
          )}

          {/* VIEW: FORGOT PASSWORD - STEP 2: VERIFY CODE */}
          {view === 'verify-code' && (
            <form onSubmit={handleVerifyCode} className="space-y-4">
              <div className="flex items-center gap-2 mb-2">
                <button
                  type="button"
                  onClick={() => setView('forgot-id')}
                  className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100"
                >
                  <ArrowLeft className="w-4 h-4" />
                </button>
                <h3 className="text-base font-bold text-slate-900">Enter Recovery Code</h3>
              </div>

              <div className="p-3 bg-blue-50 border border-blue-200 rounded-xl text-xs text-blue-900 space-y-1">
                <p className="font-semibold">If the account exists, recovery instructions have been sent.</p>
                {maskedPhone && <p className="text-[11px] text-blue-700">Sent to phone: <strong className="font-mono">{maskedPhone}</strong></p>}
                {maskedEmail && <p className="text-[11px] text-blue-700">Sent to email: <strong className="font-mono">{maskedEmail}</strong></p>}
                {devCode && (
                  <div className="pt-1 mt-1 border-t border-blue-200 flex items-center justify-between">
                    <span className="text-[11px] text-blue-800">Verification Code:</span>
                    <span className="font-mono font-bold bg-white px-2 py-0.5 rounded border border-blue-300 text-blue-950 text-xs">
                      {devCode}
                    </span>
                  </div>
                )}
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                  6-Digit Recovery Code
                </label>
                <input
                  id="recovery-code-input"
                  type="text"
                  required
                  maxLength={6}
                  value={recoveryCode}
                  onChange={(e) => setRecoveryCode(e.target.value.replace(/\D/g, ''))}
                  placeholder="e.g. 123456"
                  className="w-full text-center tracking-widest text-lg font-mono font-bold py-3 bg-slate-50 border border-slate-300 rounded-xl text-slate-900 focus:ring-2 focus:ring-blue-600 focus:bg-white"
                />
              </div>

              <div className="pt-2">
                <button
                  type="submit"
                  disabled={recoveryLoading || recoveryCode.length < 6}
                  className="w-full py-3 px-4 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-bold shadow-md shadow-blue-600/20 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {recoveryLoading ? 'Verifying...' : 'Verify Code'}
                </button>
              </div>
            </form>
          )}

          {/* VIEW: FORGOT PASSWORD - STEP 3: RESET PASSWORD */}
          {view === 'reset-password' && (
            <form onSubmit={handleResetPassword} className="space-y-4">
              <h3 className="text-base font-bold text-slate-900 mb-1">Set New Password</h3>
              <p className="text-xs text-slate-500 mb-2">
                Create a strong new password for Login ID <strong className="font-mono">{recoveryLoginId}</strong>.
              </p>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                  New Password
                </label>
                <div className="relative">
                  <input
                    id="new-password-input"
                    type={showNewPassword ? 'text' : 'password'}
                    required
                    minLength={8}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="Minimum 8 characters"
                    className="w-full pl-3.5 pr-10 py-3 bg-slate-50 border border-slate-300 rounded-xl text-sm font-semibold text-slate-900 focus:ring-2 focus:ring-blue-600 focus:bg-white"
                  />
                  <button
                    type="button"
                    onClick={() => setShowNewPassword(!showNewPassword)}
                    className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-1"
                  >
                    {showNewPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                  Confirm New Password
                </label>
                <input
                  id="confirm-password-input"
                  type={showNewPassword ? 'text' : 'password'}
                  required
                  minLength={8}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Re-enter new password"
                  className="w-full px-3.5 py-3 bg-slate-50 border border-slate-300 rounded-xl text-sm font-semibold text-slate-900 focus:ring-2 focus:ring-blue-600 focus:bg-white"
                />
              </div>

              <div className="pt-2">
                <button
                  type="submit"
                  disabled={recoveryLoading}
                  className="w-full py-3 px-4 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-sm font-bold shadow-md shadow-emerald-600/20 transition-all flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer"
                >
                  {recoveryLoading ? 'Updating...' : 'RESET PASSWORD'}
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
