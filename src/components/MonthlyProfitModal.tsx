import React from 'react';
import { X, TrendingUp, TrendingDown, HelpCircle, Calculator, CheckCircle2, AlertTriangle } from 'lucide-react';
import { MonthlyProfitDetails } from '../types';
import { formatINR, formatProfitINR } from '../utils/formatters';

interface MonthlyProfitModalProps {
  isOpen: boolean;
  onClose: () => void;
  profitDetails: MonthlyProfitDetails | null | undefined;
  monthNumber: number;
  monthName?: string;
  expectedLiftPayout?: number;
}

export const MonthlyProfitModal: React.FC<MonthlyProfitModalProps> = ({
  isOpen,
  onClose,
  profitDetails,
  monthNumber,
  monthName,
  expectedLiftPayout,
}) => {
  if (!isOpen) return null;

  const displayName = monthName || `Month ${monthNumber}`;
  const hasLift = Boolean(profitDetails?.has_lift);
  const totalCollection = profitDetails?.total_collection ?? 0;
  const liftPayout = hasLift ? (profitDetails?.lift_payout ?? 0) : null;
  const profit = hasLift ? (profitDetails?.profit ?? 0) : null;
  const isNegative = profit !== null && profit < 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
      <div
        className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-md w-full overflow-hidden animate-in fade-in zoom-in-95 duration-150"
        role="dialog"
        aria-modal="true"
        aria-labelledby="monthly-profit-title"
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/70">
          <div className="flex items-center gap-2.5">
            <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${
              !hasLift
                ? 'bg-slate-100 text-slate-600'
                : isNegative
                ? 'bg-red-50 text-red-600'
                : 'bg-emerald-50 text-emerald-600'
            }`}>
              {isNegative ? (
                <TrendingDown className="w-5 h-5" />
              ) : (
                <TrendingUp className="w-5 h-5" />
              )}
            </div>
            <div>
              <h3 id="monthly-profit-title" className="text-sm font-black text-slate-900 uppercase tracking-wide">
                Monthly Profit Details
              </h3>
              <p className="text-xs text-slate-500 font-medium">
                {displayName}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
            title="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 space-y-4">
          {/* Key Metrics Breakdown */}
          <div className="space-y-2.5 bg-slate-50/90 p-4 rounded-xl border border-slate-200/80">
            <div className="flex items-center justify-between text-xs sm:text-sm">
              <span className="font-semibold text-slate-600">Month:</span>
              <span className="font-bold text-slate-900">{displayName}</span>
            </div>

            {hasLift && profitDetails?.lifted_member_name && (
              <div className="flex items-center justify-between text-xs sm:text-sm">
                <span className="font-semibold text-slate-600">Lifted Customer:</span>
                <span className="font-bold text-purple-900">
                  {profitDetails.lifted_member_name}
                  {profitDetails.ticket_number ? ` (#${profitDetails.ticket_number})` : ''}
                </span>
              </div>
            )}

            <div className="flex items-center justify-between text-xs sm:text-sm pt-1 border-t border-slate-200/60">
              <span className="font-semibold text-slate-600">Total Collection:</span>
              <span className="font-mono font-bold text-emerald-700 text-sm sm:text-base">
                {formatINR(totalCollection)}
              </span>
            </div>

            <div className="flex items-center justify-between text-xs sm:text-sm">
              <span className="font-semibold text-slate-600">Lift Payout:</span>
              <span className={`font-mono font-bold text-sm sm:text-base ${
                hasLift ? 'text-amber-800' : 'text-slate-400 font-sans'
              }`}>
                {hasLift ? formatINR(liftPayout) : 'Not Available'}
              </span>
            </div>

            <div className="flex items-center justify-between text-xs sm:text-sm pt-2 border-t border-slate-300">
              <span className="font-black text-slate-800 uppercase tracking-wider text-xs">
                Profit:
              </span>
              <span className={`font-mono font-extrabold text-base sm:text-lg ${
                !hasLift
                  ? 'text-slate-400 font-sans text-sm'
                  : isNegative
                  ? 'text-red-600'
                  : 'text-emerald-700'
              }`}>
                {hasLift ? formatProfitINR(profit) : 'Not Available'}
              </span>
            </div>
          </div>

          {/* Formula Card */}
          <div className="p-3.5 rounded-xl border border-blue-100 bg-blue-50/60 text-xs text-blue-950 space-y-1.5">
            <div className="flex items-center gap-1.5 font-bold text-blue-900 uppercase text-[11px] tracking-wider">
              <Calculator className="w-3.5 h-3.5" /> Formula
            </div>
            {hasLift ? (
              <div className="font-mono font-bold text-sm text-slate-900 bg-white/80 p-2 rounded-lg border border-blue-200 text-center">
                <span>{formatINR(totalCollection)}</span>
                <span className="mx-2 text-slate-500">-</span>
                <span>{formatINR(liftPayout)}</span>
                <span className="mx-2 text-slate-500">=</span>
                <span className={isNegative ? 'text-red-600' : 'text-emerald-700'}>
                  {formatProfitINR(profit)}
                </span>
              </div>
            ) : (
              <div className="text-xs text-slate-600 bg-white/80 p-2.5 rounded-lg border border-blue-200 leading-relaxed">
                <span className="font-semibold text-slate-700">Monthly Profit = Current Month Total Collection - Current Month Lift Payout</span>
                <p className="mt-1 text-slate-500 text-[11px]">
                  No member has lifted the chit in {displayName} yet. Once a lift is confirmed, the monthly profit will calculate automatically.
                </p>
              </div>
            )}
          </div>

          {/* Notes / Explanation */}
          <div className="text-[11px] text-slate-500 leading-normal bg-slate-50 p-2.5 rounded-lg border border-slate-100">
            {hasLift ? (
              <p>
                Calculated strictly for <strong className="text-slate-700">{displayName}</strong> using actual member payments collected minus the amount paid to the lifted customer.
              </p>
            ) : (
              <p>
                Rule expected lift payout is <strong className="text-slate-700">{formatINR(expectedLiftPayout || 0)}</strong>. Actual profit will lock to the exact amount disbursed upon lift confirmation.
              </p>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-slate-100 bg-slate-50 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold transition-colors shadow-xs"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
