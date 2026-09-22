import React, { useState } from 'react';
import {
  X,
  ShieldCheck,
  Key,
  Lock,
  Eye,
  EyeOff,
  Smartphone,
  Mail,
  AlertCircle,
  CheckCircle2,
  HelpCircle,
  Clock,
  Check,
} from 'lucide-react';
import { api } from '../services/api';
import { User as UserType } from '../types';

interface SecuritySettingsModalProps {
  isOpen: boolean;
  user: UserType | null;
  onClose: () => void;
  onPasswordChanged: (updatedUser?: UserType, newToken?: string) => void;
  onProfileUpdated: (updatedUser: UserType) => void;
}

const COMMON_QUESTIONS = [
  'What is your primary contact number?',
  "What is your mother's maiden name?",
  'What city were you born in?',
  'What was the name of your first school?',
  'What is the name of your first pet?',
];

function checkPasswordRules(pwd: string) {
  return {
    minLength: pwd.length >= 8,
    hasUpper: /[A-Z]/.test(pwd),
    hasLower: /[a-z]/.test(pwd),
    hasDigit: /[0-9]/.test(pwd),
    hasSpecial: /[^A-Za-z0-9]/.test(pwd),
  };
}

export const SecuritySettingsModal: React.FC<SecuritySettingsModalProps> = ({
  isOpen,
  user,
  onClose,
  onPasswordChanged,
  onProfileUpdated,
}) => {
  const [activeTab, setActiveTab] = useState<'password' | 'security-question' | 'recovery'>('password');

  // Change password fields
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [passwordLoading, setPasswordLoading] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordSuccess, setPasswordSuccess] = useState<string | null>(null);

  // Security Question fields
  const [sqCurrentPassword, setSqCurrentPassword] = useState('');
  const [selectedQuestion, setSelectedQuestion] = useState(user?.security_question || COMMON_QUESTIONS[0]);
  const [isCustomQuestion, setIsCustomQuestion] = useState(false);
  const [customQuestionText, setCustomQuestionText] = useState('');
  const [securityAnswer, setSecurityAnswer] = useState('');
  const [sqLoading, setSqLoading] = useState(false);
  const [sqError, setSqError] = useState<string | null>(null);
  const [sqSuccess, setSqSuccess] = useState<string | null>(null);

  // Recovery fields
  const [name, setName] = useState(user?.name || '');
  const [recoveryPhone, setRecoveryPhone] = useState(user?.recovery_phone || user?.login_id || '');
  const [recoveryEmail, setRecoveryEmail] = useState(user?.recovery_email || '');
  const [recoveryLoading, setRecoveryLoading] = useState(false);
  const [recoveryError, setRecoveryError] = useState<string | null>(null);
  const [recoverySuccess, setRecoverySuccess] = useState<string | null>(null);

  // Sync state if user changes
  React.useEffect(() => {
    if (user) {
      setName(user.name || '');
      setRecoveryPhone(user.recovery_phone || user.login_id || '');
      setRecoveryEmail(user.recovery_email || '');
      if (user.security_question) {
        if (COMMON_QUESTIONS.includes(user.security_question)) {
          setSelectedQuestion(user.security_question);
          setIsCustomQuestion(false);
        } else {
          setIsCustomQuestion(true);
          setCustomQuestionText(user.security_question);
        }
      }
    }
  }, [user]);

  if (!isOpen) return null;

  const passwordRules = checkPasswordRules(newPassword);
  const isPasswordValid =
    passwordRules.minLength &&
    passwordRules.hasUpper &&
    passwordRules.hasLower &&
    passwordRules.hasDigit &&
    passwordRules.hasSpecial;

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordError(null);
    setPasswordSuccess(null);

    if (!isPasswordValid) {
      setPasswordError('New password must satisfy all 5 complexity requirements.');
      return;
    }

    if (newPassword !== confirmPassword) {
      setPasswordError('Confirm password does not match new password.');
      return;
    }

    setPasswordLoading(true);
    try {
      const res = await api.auth.changePassword({
        currentPassword,
        newPassword,
        confirmPassword,
      });

      setPasswordSuccess(res.message || 'Password changed successfully!');
      setTimeout(() => {
        onPasswordChanged(res.user, res.token);
      }, 1200);
    } catch (err: any) {
      setPasswordError(err.message || 'Failed to change password. Please verify current password.');
    } finally {
      setPasswordLoading(false);
    }
  };

  const handleUpdateSecurityQuestion = async (e: React.FormEvent) => {
    e.preventDefault();
    setSqError(null);
    setSqSuccess(null);

    const questionToSave = isCustomQuestion ? customQuestionText.trim() : selectedQuestion.trim();
    if (!questionToSave) {
      setSqError('Please select or specify a security question.');
      return;
    }
    if (!securityAnswer.trim()) {
      setSqError('Please provide an answer to your security question.');
      return;
    }
    if (!sqCurrentPassword) {
      setSqError('Please enter your current account password to confirm this security change.');
      return;
    }

    setSqLoading(true);
    try {
      const res = await api.auth.updateSecurityQuestion({
        currentPassword: sqCurrentPassword,
        securityQuestion: questionToSave,
        securityAnswer: securityAnswer.trim(),
      });
      setSqSuccess(res.message || 'Security question updated successfully!');
      setSqCurrentPassword('');
      setSecurityAnswer('');
      if (user) {
        onProfileUpdated({
          ...user,
          security_question: res.security_question,
        });
      }
    } catch (err: any) {
      setSqError(err.message || 'Failed to update security question.');
    } finally {
      setSqLoading(false);
    }
  };

  const handleUpdateRecovery = async (e: React.FormEvent) => {
    e.preventDefault();
    setRecoveryError(null);
    setRecoverySuccess(null);
    setRecoveryLoading(true);

    try {
      const res = await api.auth.updateSecuritySettings({
        name,
        recovery_phone: recoveryPhone,
        recovery_email: recoveryEmail,
      });
      setRecoverySuccess('Security recovery details updated successfully!');
      onProfileUpdated(res.user);
    } catch (err: any) {
      setRecoveryError(err.message || 'Failed to update recovery contact details.');
    } finally {
      setRecoveryLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 backdrop-blur-xs p-4">
      <div className="bg-white rounded-3xl shadow-2xl max-w-lg w-full overflow-hidden border border-slate-200 animate-in fade-in zoom-in-95 duration-200">
        {/* Modal Header */}
        <div className="bg-slate-900 p-5 text-white flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-600/30 border border-blue-400/30 flex items-center justify-center text-blue-400">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white">Settings & Security</h2>
              <p className="text-xs text-slate-400">Manage credentials, recovery question, and contacts</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-xl transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex border-b border-slate-200 bg-slate-50 px-6 overflow-x-auto">
          <button
            onClick={() => setActiveTab('password')}
            className={`py-3 px-4 text-xs font-bold border-b-2 flex items-center gap-2 whitespace-nowrap cursor-pointer transition-colors ${
              activeTab === 'password'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <Key className="w-3.5 h-3.5" />
            <span>Change Password</span>
          </button>
          <button
            onClick={() => setActiveTab('security-question')}
            className={`py-3 px-4 text-xs font-bold border-b-2 flex items-center gap-2 whitespace-nowrap cursor-pointer transition-colors ${
              activeTab === 'security-question'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <HelpCircle className="w-3.5 h-3.5" />
            <span>Security Question</span>
          </button>
          <button
            onClick={() => setActiveTab('recovery')}
            className={`py-3 px-4 text-xs font-bold border-b-2 flex items-center gap-2 whitespace-nowrap cursor-pointer transition-colors ${
              activeTab === 'recovery'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <Smartphone className="w-3.5 h-3.5" />
            <span>Recovery Contacts</span>
          </button>
        </div>

        {/* Tab Content */}
        <div className="p-6 max-h-[75vh] overflow-y-auto">
          {/* TAB 1: CHANGE PASSWORD */}
          {activeTab === 'password' && (
            <form onSubmit={handleChangePassword} className="space-y-4">
              {passwordError && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-xl flex items-center gap-2.5 text-xs text-red-700">
                  <AlertCircle className="w-4 h-4 shrink-0 text-red-600" />
                  <span>{passwordError}</span>
                </div>
              )}

              {passwordSuccess && (
                <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center gap-2.5 text-xs text-emerald-700">
                  <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
                  <span>{passwordSuccess}</span>
                </div>
              )}

              {/* Password Expiration Info */}
              <div className="p-3 bg-blue-50 border border-blue-200 rounded-xl flex items-start gap-2.5 text-xs text-blue-900">
                <Clock className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
                <div>
                  <span className="font-bold block">3-Month Password Expiration Policy</span>
                  <span className="text-[11px] text-blue-800">
                    Passwords automatically expire 90 days after being changed to ensure system security.
                  </span>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                  Current Password
                </label>
                <div className="relative">
                  <input
                    id="security-current-password"
                    type={showCurrent ? 'text' : 'password'}
                    required
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    placeholder="Enter existing password"
                    className="w-full pl-3.5 pr-10 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-sm font-medium text-slate-900 focus:ring-2 focus:ring-blue-600 focus:bg-white"
                  />
                  <button
                    type="button"
                    onClick={() => setShowCurrent(!showCurrent)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                  >
                    {showCurrent ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                  New Password
                </label>
                <div className="relative">
                  <input
                    id="security-new-password"
                    type={showNew ? 'text' : 'password'}
                    required
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="Minimum 8 characters with symbols"
                    className="w-full pl-3.5 pr-10 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-sm font-medium text-slate-900 focus:ring-2 focus:ring-blue-600 focus:bg-white"
                  />
                  <button
                    type="button"
                    onClick={() => setShowNew(!showNew)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                  >
                    {showNew ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                  Confirm New Password
                </label>
                <div className="relative">
                  <input
                    id="security-confirm-password"
                    type={showConfirm ? 'text' : 'password'}
                    required
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Re-enter new password"
                    className="w-full pl-3.5 pr-10 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-sm font-medium text-slate-900 focus:ring-2 focus:ring-blue-600 focus:bg-white"
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirm(!showConfirm)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                  >
                    {showConfirm ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {/* Password strength breakdown */}
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs space-y-1">
                <span className="font-bold text-slate-700 block mb-1">Password Requirements:</span>
                <div className="grid grid-cols-2 gap-1 text-[11px]">
                  <div className={`flex items-center gap-1.5 ${passwordRules.minLength ? 'text-emerald-700 font-semibold' : 'text-slate-500'}`}>
                    {passwordRules.minLength ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <X className="w-3.5 h-3.5 text-slate-400" />}
                    8+ characters
                  </div>
                  <div className={`flex items-center gap-1.5 ${passwordRules.hasUpper ? 'text-emerald-700 font-semibold' : 'text-slate-500'}`}>
                    {passwordRules.hasUpper ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <X className="w-3.5 h-3.5 text-slate-400" />}
                    Uppercase (A-Z)
                  </div>
                  <div className={`flex items-center gap-1.5 ${passwordRules.hasLower ? 'text-emerald-700 font-semibold' : 'text-slate-500'}`}>
                    {passwordRules.hasLower ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <X className="w-3.5 h-3.5 text-slate-400" />}
                    Lowercase (a-z)
                  </div>
                  <div className={`flex items-center gap-1.5 ${passwordRules.hasDigit ? 'text-emerald-700 font-semibold' : 'text-slate-500'}`}>
                    {passwordRules.hasDigit ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <X className="w-3.5 h-3.5 text-slate-400" />}
                    Number (0-9)
                  </div>
                  <div className={`flex items-center gap-1.5 ${passwordRules.hasSpecial ? 'text-emerald-700 font-semibold' : 'text-slate-500'} col-span-2`}>
                    {passwordRules.hasSpecial ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <X className="w-3.5 h-3.5 text-slate-400" />}
                    Special symbol (@, #, $, %, etc.)
                  </div>
                </div>
              </div>

              <div className="pt-2 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={passwordLoading || !isPasswordValid || newPassword !== confirmPassword}
                  className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white rounded-xl text-xs font-bold shadow-md shadow-blue-600/20 transition-all cursor-pointer disabled:opacity-50"
                >
                  {passwordLoading ? 'Updating...' : 'Change Password'}
                </button>
              </div>
            </form>
          )}

          {/* TAB 2: SECURITY QUESTION */}
          {activeTab === 'security-question' && (
            <form onSubmit={handleUpdateSecurityQuestion} className="space-y-4">
              {sqError && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-xl flex items-center gap-2.5 text-xs text-red-700">
                  <AlertCircle className="w-4 h-4 shrink-0 text-red-600" />
                  <span>{sqError}</span>
                </div>
              )}

              {sqSuccess && (
                <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center gap-2.5 text-xs text-emerald-700">
                  <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
                  <span>{sqSuccess}</span>
                </div>
              )}

              <p className="text-xs text-slate-500">
                Your security question allows you to quickly recover access to your account if you ever forget your password.
              </p>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                  Choose Security Question
                </label>
                <select
                  value={isCustomQuestion ? 'custom' : selectedQuestion}
                  onChange={(e) => {
                    if (e.target.value === 'custom') {
                      setIsCustomQuestion(true);
                    } else {
                      setIsCustomQuestion(false);
                      setSelectedQuestion(e.target.value);
                    }
                  }}
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-sm font-medium text-slate-900 focus:ring-2 focus:ring-blue-600 focus:bg-white"
                >
                  {COMMON_QUESTIONS.map((q) => (
                    <option key={q} value={q}>
                      {q}
                    </option>
                  ))}
                  <option value="custom">Write custom question...</option>
                </select>
              </div>

              {isCustomQuestion && (
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                    Custom Security Question
                  </label>
                  <input
                    type="text"
                    required
                    value={customQuestionText}
                    onChange={(e) => setCustomQuestionText(e.target.value)}
                    placeholder="Enter your custom question"
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-sm font-medium text-slate-900 focus:ring-2 focus:ring-blue-600 focus:bg-white"
                  />
                </div>
              )}

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                  Security Answer
                </label>
                <input
                  type="text"
                  required
                  value={securityAnswer}
                  onChange={(e) => setSecurityAnswer(e.target.value)}
                  placeholder="Enter the secret answer"
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-sm font-medium text-slate-900 focus:ring-2 focus:ring-blue-600 focus:bg-white"
                />
                <p className="text-[11px] text-slate-400 mt-1">
                  Answers are case-insensitive and hashed securely in the database.
                </p>
              </div>

              <div className="pt-2 border-t border-slate-200">
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                  Confirm With Current Password
                </label>
                <input
                  type="password"
                  required
                  value={sqCurrentPassword}
                  onChange={(e) => setSqCurrentPassword(e.target.value)}
                  placeholder="Enter current password to authorize changes"
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-sm font-medium text-slate-900 focus:ring-2 focus:ring-blue-600 focus:bg-white"
                />
              </div>

              <div className="pt-2 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={sqLoading}
                  className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white rounded-xl text-xs font-bold shadow-md shadow-blue-600/20 transition-all cursor-pointer disabled:opacity-50"
                >
                  {sqLoading ? 'Saving...' : 'Save Security Question'}
                </button>
              </div>
            </form>
          )}

          {/* TAB 3: RECOVERY CONTACTS */}
          {activeTab === 'recovery' && (
            <form onSubmit={handleUpdateRecovery} className="space-y-4">
              {recoveryError && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-xl flex items-center gap-2.5 text-xs text-red-700">
                  <AlertCircle className="w-4 h-4 shrink-0 text-red-600" />
                  <span>{recoveryError}</span>
                </div>
              )}

              {recoverySuccess && (
                <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center gap-2.5 text-xs text-emerald-700">
                  <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
                  <span>{recoverySuccess}</span>
                </div>
              )}

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                  Administrator Display Name
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Administrator"
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-sm font-medium text-slate-900 focus:ring-2 focus:ring-blue-600 focus:bg-white"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                  Verified Recovery Phone
                </label>
                <input
                  type="text"
                  value={recoveryPhone}
                  onChange={(e) => setRecoveryPhone(e.target.value)}
                  placeholder="e.g. 9640488507"
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-sm font-medium text-slate-900 focus:ring-2 focus:ring-blue-600 focus:bg-white"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                  Verified Recovery Email
                </label>
                <input
                  type="email"
                  value={recoveryEmail}
                  onChange={(e) => setRecoveryEmail(e.target.value)}
                  placeholder="e.g. saikiran2cheryala@gmail.com"
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-sm font-medium text-slate-900 focus:ring-2 focus:ring-blue-600 focus:bg-white"
                />
              </div>

              <div className="pt-2 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={recoveryLoading}
                  className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white rounded-xl text-xs font-bold shadow-md shadow-blue-600/20 transition-all cursor-pointer disabled:opacity-50"
                >
                  {recoveryLoading ? 'Saving...' : 'Save Settings'}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};
