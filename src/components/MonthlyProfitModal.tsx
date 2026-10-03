import React, { useState } from 'react';
import {
  X,
  TrendingUp,
  TrendingDown,
  Calculator,
  AlertTriangle,
  CheckCircle2,
  DollarSign,
  Layers,
  Sparkles,
  Info,
} from 'lucide-react';
import { MonthlyProfitDetails, ChitMonthRule, Chit } from '../types';
import { formatINR, formatProfitINR } from '../utils/formatters';

interface MonthlyProfitModalProps {
  isOpen: boolean;
  onClose: () => void;
  profitDetails: MonthlyProfitDetails | null | undefined;
  monthNumber: number;
  monthName?: string;
  expectedLiftPayout?: number;
  rule?: ChitMonthRule;
  stats?: { total_due: number; total_paid: number };
  chit?: Chit | any;
}

export const MonthlyProfitModal: React.FC<MonthlyProfitModalProps> = ({
  isOpen,
  onClose,
  profitDetails,
  monthNumber,
  monthName,
  expectedLiftPayout,
  rule,
  stats,
  chit,
}) => {
  const [activeTab, setActiveTab] = useState<'projected' | 'actual'>('projected');

  if (!isOpen) return null;

  const displayName = monthName || `Month ${monthNumber}`;
  const hasLift = Boolean(profitDetails?.has_lift);

  // Members & Rules calculations
  const totalMembers = profitDetails?.total_members || chit?.total_members || chit?.members?.length || 25;
  const preAmount = profitDetails?.pre_lift_payment ?? (rule?.pre_lift_payment || 13500);
  const postAmount = profitDetails?.post_lift_payment ?? (rule?.post_lift_payment || 13500);

  const postLiftCount = profitDetails?.post_lift_count !== undefined
    ? profitDetails.post_lift_count
    : Math.max(0, Math.min(monthNumber - 1, totalMembers));
  const preLiftCount = profitDetails?.pre_lift_count !== undefined
    ? profitDetails.pre_lift_count
    : Math.max(0, totalMembers - postLiftCount);

  // 1. PROJECTED METRICS (Configured Rules, Independent of Customer Payments)
  const projectedCollection = profitDetails?.projected_collection !== undefined
    ? profitDetails.projected_collection
    : ((preLiftCount * preAmount) + (postLiftCount * postAmount));

  const configuredLiftPayout = profitDetails?.configured_lift_payout !== undefined
    ? profitDetails.configured_lift_payout
    : (Number(rule?.expected_lift_payout) || Number(rule?.monthly_chit_value) || expectedLiftPayout || Number(chit?.chit_value) || 0);

  const projectedProfit = profitDetails?.projected_profit !== undefined
    ? profitDetails.projected_profit
    : (projectedCollection - configuredLiftPayout);

  const isProjectedLoss = projectedProfit < 0;
  const managerAddRequired = isProjectedLoss ? Math.abs(projectedProfit) : 0;

  // 2. ACTUAL METRICS (Based on money received)
  const actualCollection = profitDetails?.actual_collection !== undefined
    ? profitDetails.actual_collection
    : Number(stats?.total_paid || 0);

  const actualLiftPayout = profitDetails?.actual_lift_payout !== undefined
    ? profitDetails.actual_lift_payout
    : (profitDetails?.lift_payout ?? configuredLiftPayout);

  const actualProfit = profitDetails?.actual_profit !== undefined
    ? profitDetails.actual_profit
    : (actualCollection - actualLiftPayout);

  const isActualLoss = actualProfit < 0;
  const actualManagerAddRequired = isActualLoss ? Math.abs(actualProfit) : 0;

  return (
    <div
      id="monthly-profit-modal-backdrop"
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs"
    >
      <div
        id="monthly-profit-modal-card"
        className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-lg w-full overflow-hidden animate-in fade-in zoom-in-95 duration-150 flex flex-col max-h-[92vh]"
        role="dialog"
        aria-modal="true"
        aria-labelledby="monthly-profit-title"
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/80">
          <div className="flex items-center gap-3">
            <div
              className={`w-10 h-10 rounded-xl flex items-center justify-center shadow-xs ${
                isProjectedLoss
                  ? 'bg-red-100 text-red-700'
                  : 'bg-emerald-100 text-emerald-800'
              }`}
            >
              <Calculator className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 id="monthly-profit-title" className="text-sm sm:text-base font-black text-slate-900 uppercase tracking-wide">
                  Monthly Profit Analysis
                </h3>
                <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-slate-200 text-slate-700">
                  {displayName}
                </span>
              </div>
              <p className="text-xs text-slate-500 font-medium">
                Chit Duration Month {monthNumber} • {totalMembers} Total Members
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
            title="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Switcher: Projected vs Actual */}
        <div className="flex border-b border-slate-200 bg-slate-100/70 p-1 text-xs font-bold">
          <button
            type="button"
            onClick={() => setActiveTab('projected')}
            className={`flex-1 py-2 px-3 rounded-xl transition-all flex items-center justify-center gap-1.5 ${
              activeTab === 'projected'
                ? 'bg-white text-emerald-900 shadow-xs border border-slate-200/80'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5 text-emerald-600" />
            <span>PROJECTED PROFIT (Configured Rules)</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('actual')}
            className={`flex-1 py-2 px-3 rounded-xl transition-all flex items-center justify-center gap-1.5 ${
              activeTab === 'actual'
                ? 'bg-white text-blue-900 shadow-xs border border-slate-200/80'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <DollarSign className="w-3.5 h-3.5 text-blue-600" />
            <span>ACTUAL PROFIT (Money Received)</span>
          </button>
        </div>

        {/* Body */}
        <div className="p-5 overflow-y-auto space-y-4 flex-1">
          {activeTab === 'projected' ? (
            /* ================= PROJECTED PROFIT VIEW ================= */
            <div className="space-y-4 animate-in fade-in duration-150">
              {/* Highlight Banner */}
              <div
                className={`p-4 rounded-xl border flex items-center justify-between gap-3 ${
                  isProjectedLoss
                    ? 'bg-red-50 border-red-200 text-red-950'
                    : 'bg-emerald-50 border-emerald-200 text-emerald-950'
                }`}
              >
                <div>
                  <span className="text-[11px] font-bold uppercase tracking-wider block opacity-75">
                    Projected Monthly Outcome
                  </span>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span
                      className={`text-2xl font-black font-mono ${
                        isProjectedLoss ? 'text-red-600' : 'text-emerald-700'
                      }`}
                    >
                      {formatProfitINR(projectedProfit)}
                    </span>
                    <span
                      className={`text-[10px] font-extrabold px-2 py-0.5 rounded-full ${
                        isProjectedLoss
                          ? 'bg-red-200/80 text-red-800'
                          : 'bg-emerald-200/80 text-emerald-800'
                      }`}
                    >
                      {isProjectedLoss ? 'MANAGER LOSS' : 'MANAGER PROFIT'}
                    </span>
                  </div>
                </div>

                {isProjectedLoss && (
                  <div className="text-right">
                    <span className="text-[10px] font-bold text-red-700 block uppercase">
                      Manager Add Required
                    </span>
                    <span className="text-base font-black font-mono text-red-700">
                      {formatINR(managerAddRequired)}
                    </span>
                  </div>
                )}
              </div>

              {/* Formula Card */}
              <div className="p-4 rounded-xl border border-blue-200 bg-blue-50/50 space-y-2">
                <div className="flex items-center gap-1.5 text-xs font-bold text-blue-900 uppercase tracking-wide">
                  <Calculator className="w-3.5 h-3.5" /> Formula
                </div>
                <div className="font-mono text-xs sm:text-sm font-bold text-slate-900 bg-white p-3 rounded-xl border border-blue-200 text-center shadow-2xs">
                  <span className="text-emerald-700">{formatINR(projectedCollection)}</span>
                  <span className="mx-2 text-slate-400">−</span>
                  <span className="text-amber-800">{formatINR(configuredLiftPayout)}</span>
                  <span className="mx-2 text-slate-400">=</span>
                  <span className={isProjectedLoss ? 'text-red-600' : 'text-emerald-700'}>
                    {formatProfitINR(projectedProfit)}
                  </span>
                </div>
                <p className="text-[11px] text-slate-500 text-center">
                  Expected Monthly Collection − Configured Monthly Lift Payout = Projected Profit
                </p>
              </div>

              {/* Step-by-Step Breakdown */}
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3 text-xs">
                <div className="font-bold text-slate-800 uppercase tracking-wide text-[11px] pb-1 border-b border-slate-200">
                  Calculation Breakdown (Configured Rules)
                </div>

                {/* Pre-lift members contribution */}
                <div className="flex items-center justify-between text-slate-700">
                  <span>
                    Pre-Lift Members ({preLiftCount} members × {formatINR(preAmount)}):
                  </span>
                  <span className="font-mono font-bold text-slate-900">
                    {formatINR(preLiftCount * preAmount)}
                  </span>
                </div>

                {/* Post-lift members contribution */}
                {postLiftCount > 0 && (
                  <div className="flex items-center justify-between text-slate-700">
                    <span>
                      Post-Lift Members ({postLiftCount} member{postLiftCount > 1 ? 's' : ''} × {formatINR(postAmount)}):
                    </span>
                    <span className="font-mono font-bold text-slate-900">
                      {formatINR(postLiftCount * postAmount)}
                    </span>
                  </div>
                )}

                {/* Total Expected Monthly Collection */}
                <div className="flex items-center justify-between pt-1.5 border-t border-slate-200 font-bold text-slate-900">
                  <span>Expected Monthly Collection ({totalMembers} members):</span>
                  <span className="font-mono text-emerald-700 text-sm">
                    {formatINR(projectedCollection)}
                  </span>
                </div>

                {/* Configured Lift Payout */}
                <div className="flex items-center justify-between text-slate-800">
                  <span>Configured Lift Payout:</span>
                  <span className="font-mono font-bold text-amber-800 text-sm">
                    − {formatINR(configuredLiftPayout)}
                  </span>
                </div>

                {/* Projected Profit / Loss */}
                <div className="flex items-center justify-between pt-2 border-t-2 border-slate-300 font-black text-sm">
                  <span>Projected Monthly Profit:</span>
                  <span
                    className={`font-mono ${
                      isProjectedLoss ? 'text-red-600' : 'text-emerald-700'
                    }`}
                  >
                    {formatProfitINR(projectedProfit)}
                  </span>
                </div>
              </div>

              {/* Payment-Independent Callout */}
              <div className="p-3 bg-emerald-50/70 border border-emerald-200 rounded-xl text-xs text-emerald-950 space-y-1">
                <div className="flex items-center gap-1.5 font-bold text-emerald-900">
                  <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0" />
                  <span>Payment-Independent Guarantee</span>
                </div>
                <p className="text-[11px] text-emerald-900/90 leading-relaxed">
                  This projected monthly profit remains fixed at{' '}
                  <strong className="font-mono font-bold">
                    {formatProfitINR(projectedProfit)}
                  </strong>{' '}
                  whether actual customer collections are ₹0, partially received, or fully settled. It is computed strictly from the configured chit rules.
                </p>
              </div>
            </div>
          ) : (
            /* ================= ACTUAL PROFIT VIEW ================= */
            <div className="space-y-4 animate-in fade-in duration-150">
              {/* Highlight Banner */}
              <div
                className={`p-4 rounded-xl border flex items-center justify-between gap-3 ${
                  isActualLoss
                    ? 'bg-amber-50 border-amber-200 text-amber-950'
                    : 'bg-blue-50 border-blue-200 text-blue-950'
                }`}
              >
                <div>
                  <span className="text-[11px] font-bold uppercase tracking-wider block opacity-75">
                    Actual Cash Balance
                  </span>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span
                      className={`text-2xl font-black font-mono ${
                        isActualLoss ? 'text-red-600' : 'text-blue-900'
                      }`}
                    >
                      {formatProfitINR(actualProfit)}
                    </span>
                    <span
                      className={`text-[10px] font-extrabold px-2 py-0.5 rounded-full ${
                        isActualLoss
                          ? 'bg-amber-200 text-amber-900'
                          : 'bg-blue-200 text-blue-900'
                      }`}
                    >
                      {isActualLoss ? 'CASH DEFICIT' : 'CASH SURPLUS'}
                    </span>
                  </div>
                </div>

                {isActualLoss && (
                  <div className="text-right">
                    <span className="text-[10px] font-bold text-amber-800 block uppercase">
                      Deficit Amount
                    </span>
                    <span className="text-base font-black font-mono text-red-600">
                      {formatINR(actualManagerAddRequired)}
                    </span>
                  </div>
                )}
              </div>

              {/* Actual Breakdown */}
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3 text-xs">
                <div className="font-bold text-slate-800 uppercase tracking-wide text-[11px] pb-1 border-b border-slate-200">
                  Actual Cash Inflow & Outflow
                </div>

                <div className="flex items-center justify-between text-slate-700">
                  <span>Actual Customer Payments Collected:</span>
                  <span className="font-mono font-bold text-emerald-700 text-sm">
                    {formatINR(actualCollection)}
                  </span>
                </div>

                <div className="flex items-center justify-between text-slate-700">
                  <span>
                    {hasLift ? 'Lift Payout (Disbursed):' : 'Lift Payout (Scheduled):'}
                  </span>
                  <span className="font-mono font-bold text-amber-800 text-sm">
                    − {formatINR(actualLiftPayout)}
                  </span>
                </div>

                {hasLift && profitDetails?.lifted_member_name && (
                  <div className="p-2 bg-purple-50 rounded-lg border border-purple-200 text-[11px] text-purple-900 flex items-center justify-between">
                    <span>Lifted Customer:</span>
                    <span className="font-bold">
                      {profitDetails.lifted_member_name} (#{profitDetails.ticket_number})
                    </span>
                  </div>
                )}

                <div className="flex items-center justify-between pt-2 border-t-2 border-slate-300 font-black text-sm">
                  <span>Actual Monthly Profit / Cashflow:</span>
                  <span className={`font-mono ${isActualLoss ? 'text-red-600' : 'text-blue-900'}`}>
                    {formatProfitINR(actualProfit)}
                  </span>
                </div>
              </div>

              <div className="p-3 bg-blue-50/80 border border-blue-200 rounded-xl text-xs text-blue-950 space-y-1">
                <div className="flex items-center gap-1.5 font-bold text-blue-900">
                  <Info className="w-4 h-4 text-blue-700 shrink-0" />
                  <span>Real-Time Cash Collection Metric</span>
                </div>
                <p className="text-[11px] text-blue-900/90 leading-relaxed">
                  Actual Monthly Profit reflects verified money collected in hand from customer payments minus the lift payout disbursed. As customer payments are recorded, this metric automatically updates.
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-slate-100 bg-slate-50 flex items-center justify-between">
          <span className="text-[11px] text-slate-500 font-medium">
            SAIKIRAN CHITS • Monthly Profit System
          </span>
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
