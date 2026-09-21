import React, { useState, useEffect } from 'react';
import {
  X,
  Edit,
  Save,
  AlertCircle,
  Calendar,
  Layers,
  IndianRupee,
  Users,
} from 'lucide-react';
import { Chit } from '../types';
import { MONTH_NAMES, calculateEndMonth, parseMonthString, formatINR } from '../utils/formatters';

interface EditChitModalProps {
  isOpen: boolean;
  onClose: () => void;
  chit: Chit | null;
  onSave: (updatedData: {
    name: string;
    status: string;
    chit_value: number;
    start_month: string;
    end_month: string;
    total_months: number;
    total_members: number;
  }) => Promise<void>;
}

export const EditChitModal: React.FC<EditChitModalProps> = ({
  isOpen,
  onClose,
  chit,
  onSave,
}) => {
  const [name, setName] = useState('');
  const [status, setStatus] = useState<'active' | 'completed' | 'draft'>('active');
  const [chitValue, setChitValue] = useState<number>(0);
  const [totalMonths, setTotalMonths] = useState<number>(20);
  const [totalMembers, setTotalMembers] = useState<number>(20);

  const currentYear = new Date().getFullYear();
  const [startMonthName, setStartMonthName] = useState(MONTH_NAMES[0]);
  const [startYear, setStartYear] = useState<number>(currentYear);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Initialize form when modal opens with chit
  useEffect(() => {
    if (chit && isOpen) {
      setName(chit.name || '');
      setStatus((chit.status as any) || 'active');
      setChitValue(chit.chit_value || 0);
      setTotalMonths(chit.total_months || 20);
      setTotalMembers(chit.members?.length || chit.total_members || 20);

      if (chit.start_month) {
        const parsed = parseMonthString(chit.start_month);
        setStartMonthName(MONTH_NAMES[parsed.monthIndex] || MONTH_NAMES[0]);
        setStartYear(parsed.year || currentYear);
      }
      setError(null);
    }
  }, [chit, isOpen]);

  if (!isOpen || !chit) return null;

  const startMonthStr = `${startMonthName} ${startYear}`;
  const calculatedEndMonth = calculateEndMonth(startMonthStr, totalMonths);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('Chit name is required.');
      return;
    }
    if (chitValue <= 0) {
      setError('Please provide a valid Chit Value.');
      return;
    }
    if (totalMonths < 1) {
      setError('Total months must be at least 1.');
      return;
    }
    if (totalMembers < 1) {
      setError('Total members must be at least 1.');
      return;
    }

    try {
      setIsSubmitting(true);
      setError(null);
      await onSave({
        name: name.trim(),
        status,
        chit_value: chitValue,
        start_month: startMonthStr,
        end_month: calculatedEndMonth,
        total_months: totalMonths,
        total_members: totalMembers,
      });
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to update chit details.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="bg-white w-full max-w-xl rounded-3xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="px-6 py-5 bg-gradient-to-r from-slate-900 via-blue-950 to-slate-900 text-white flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-blue-600/80 border border-blue-400/30 flex items-center justify-center text-white shadow-xs">
              <Edit className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-lg font-black tracking-tight text-white">Edit Chit Details</h3>
              <p className="text-xs text-slate-300">Update general properties, timeline, and status</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-white hover:bg-white/10 rounded-xl transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 overflow-y-auto space-y-5">
          {error && (
            <div className="p-3.5 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 text-red-600" />
              <span>{error}</span>
            </div>
          )}

          {/* Chit Name */}
          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
              Chit Name <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <Layers className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g., 5 Lakhs Chit Group"
                required
                className="w-full pl-10 pr-4 py-2.5 bg-white border border-slate-300 rounded-xl text-sm font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all"
              />
            </div>
          </div>

          {/* Status & Chit Value */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                Chit Status
              </label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as any)}
                className="w-full px-3.5 py-2.5 bg-white border border-slate-300 rounded-xl text-sm font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer"
              >
                <option value="active">Active (Ongoing)</option>
                <option value="completed">Completed (Closed)</option>
                <option value="draft">Draft (Upcoming)</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                Chit Total Value (₹) <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <IndianRupee className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="number"
                  min="1000"
                  step="1000"
                  value={chitValue || ''}
                  onChange={(e) => setChitValue(Number(e.target.value))}
                  placeholder="500000"
                  required
                  className="w-full pl-10 pr-4 py-2.5 bg-white border border-slate-300 rounded-xl text-sm font-mono font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <span className="text-[11px] text-slate-400 mt-1 block">
                Formatted: {formatINR(chitValue)}
              </span>
            </div>
          </div>

          {/* Duration & Members */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                Total Duration (Months)
              </label>
              <div className="relative">
                <Calendar className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="number"
                  min="1"
                  max="120"
                  value={totalMonths}
                  onChange={(e) => setTotalMonths(Math.max(1, parseInt(e.target.value, 10) || 1))}
                  className="w-full pl-10 pr-4 py-2.5 bg-white border border-slate-300 rounded-xl text-sm font-mono font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                Total Member Capacity
              </label>
              <div className="relative">
                <Users className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="number"
                  min="1"
                  max="500"
                  value={totalMembers}
                  onChange={(e) => setTotalMembers(Math.max(1, parseInt(e.target.value, 10) || 1))}
                  className="w-full pl-10 pr-4 py-2.5 bg-white border border-slate-300 rounded-xl text-sm font-mono font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
          </div>

          {/* Start Month & End Month Preview */}
          <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 space-y-3">
            <span className="text-xs font-bold text-slate-700 uppercase tracking-wider block">
              Timeline & Schedule
            </span>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                  Start Month
                </label>
                <select
                  value={startMonthName}
                  onChange={(e) => setStartMonthName(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  {MONTH_NAMES.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                  Start Year
                </label>
                <input
                  type="number"
                  value={startYear}
                  onChange={(e) => setStartYear(parseInt(e.target.value, 10) || currentYear)}
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs font-mono font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>

            <div className="pt-2 border-t border-slate-200/80 flex items-center justify-between text-xs">
              <span className="text-slate-500">Calculated Completion Month:</span>
              <span className="font-bold text-slate-900 font-mono bg-white px-2.5 py-1 rounded-lg border border-slate-200">
                {calculatedEndMonth}
              </span>
            </div>
          </div>

          {/* Notice about Monthly Rules */}
          <div className="p-3 bg-blue-50 border border-blue-200 rounded-xl text-xs text-blue-800">
            <strong>Note:</strong> To modify per-month payout or installment schedules, use the{' '}
            <strong>Monthly Rules</strong> tab in the chit sheet.
          </div>

          {/* Buttons */}
          <div className="pt-2 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 active:scale-98 text-white rounded-xl text-xs font-bold shadow-xs transition-all flex items-center gap-2 cursor-pointer disabled:opacity-50"
            >
              <Save className="w-4 h-4" />
              <span>{isSubmitting ? 'Saving Changes...' : 'Save Chit Details'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
