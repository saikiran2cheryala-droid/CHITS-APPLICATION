import React, { useState } from 'react';
import { X, TrendingUp, TrendingDown, Sparkles, Calculator, Layers, ChevronDown, ChevronUp, Info } from 'lucide-react';
import { formatINR } from '../utils/formatters';

interface ProjectedProfitBreakdownModalProps {
  isOpen: boolean;
  onClose: () => void;
  totalProjectedProfit: number;
  totalProjectedCollection?: number;
  totalProjectedPayout?: number;
  activeChitsCount: number;
  breakdown?: Array<{
    chit_id: string;
    chit_name: string;
    chit_value: number;
    total_months: number;
    total_members: number;
    status: string;
    total_projected_profit: number;
    total_projected_collection: number;
    total_projected_payout: number;
    monthly_projections?: Array<{
      month_number: number;
      month_name: string;
      projected_collection: number;
      lift_payout: number;
      profit_or_loss: number;
      is_profit: boolean;
    }>;
  }>;
}

export const AssumedProfitModal: React.FC<ProjectedProfitBreakdownModalProps> = ({
  isOpen,
  onClose,
  totalProjectedProfit,
  totalProjectedCollection = 0,
  totalProjectedPayout = 0,
  activeChitsCount,
  breakdown = [],
}) => {
  const [expandedChitId, setExpandedChitId] = useState<string | null>(null);

  if (!isOpen) return null;

  const isProfit = totalProjectedProfit >= 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150">
      <div
        className="bg-white rounded-3xl border border-slate-200 shadow-2xl max-w-3xl w-full max-h-[92vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-150"
        role="dialog"
        aria-modal="true"
        aria-labelledby="projected-profit-modal-title"
      >
        {/* Header */}
        <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/80">
          <div className="flex items-center gap-3">
            <div
              className={`w-10 h-10 rounded-2xl flex items-center justify-center font-bold ${
                isProfit ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-800'
              }`}
            >
              <Calculator className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h3 id="projected-profit-modal-title" className="text-base font-black text-slate-900 uppercase tracking-wide">
                  TOTAL PROJECTED CHIT PROFIT
                </h3>
                <span className="px-2.5 py-0.5 rounded-full text-[11px] font-black bg-blue-100 text-blue-800">
                  {activeChitsCount} Active Chits
                </span>
              </div>
              <p className="text-xs text-slate-500 font-medium mt-0.5">
                Complete full-term projected profit calculated from configured monthly rules
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
            title="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 overflow-y-auto space-y-5">
          {/* Executive KPI Summary */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="bg-slate-50 border border-slate-200/80 rounded-2xl p-4">
              <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">
                Total Projected Collection
              </span>
              <span className="text-xl sm:text-2xl font-black font-mono text-slate-900 mt-1 block truncate">
                {formatINR(totalProjectedCollection)}
              </span>
              <span className="text-[11px] text-slate-400 mt-0.5 block">
                Full-term expected receipts
              </span>
            </div>

            <div className="bg-slate-50 border border-slate-200/80 rounded-2xl p-4">
              <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">
                Total Projected Lift Payout
              </span>
              <span className="text-xl sm:text-2xl font-black font-mono text-purple-900 mt-1 block truncate">
                {formatINR(totalProjectedPayout)}
              </span>
              <span className="text-[11px] text-purple-600 mt-0.5 block">
                Scheduled customer payouts
              </span>
            </div>

            <div
              className={`border rounded-2xl p-4 ${
                isProfit
                  ? 'bg-emerald-50/80 border-emerald-200 text-emerald-950'
                  : 'bg-red-50/80 border-red-200 text-red-950'
              }`}
            >
              <span className="text-[11px] font-bold uppercase tracking-wider block opacity-80">
                TOTAL PROJECTED CHIT PROFIT
              </span>
              <span
                className={`text-xl sm:text-2xl font-black font-mono mt-1 block truncate ${
                  isProfit ? 'text-emerald-700' : 'text-red-600'
                }`}
              >
                {isProfit ? `+${formatINR(totalProjectedProfit)}` : `-${formatINR(Math.abs(totalProjectedProfit))}`}
              </span>
              <span className="text-[11px] opacity-75 mt-0.5 block font-medium">
                {isProfit ? 'Combined Net Profit (Green)' : 'Combined Net Loss (Red)'}
              </span>
            </div>
          </div>

          {/* Principle Notice */}
          <div className="p-3.5 rounded-2xl border border-blue-100 bg-blue-50/70 text-xs text-blue-950 flex items-start gap-2.5">
            <Info className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <span className="font-bold text-blue-900 block">
                Full-Term Rule Projection Formula:
              </span>
              <p className="text-slate-600 text-[11px] leading-relaxed">
                For every active chit, the projected profit of each month is calculated as <strong>Projected Monthly Collection − Configured Monthly Lift Payout</strong>.
                The <strong>Total Projected Chit Profit</strong> is the sum of all monthly projections across the complete chit duration.
                Actual customer payments received or pending dues do <strong>not</strong> change this total projected profit.
              </p>
            </div>
          </div>

          {/* Per Chit Breakdown */}
          <div className="space-y-3">
            <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
              <Layers className="w-3.5 h-3.5 text-blue-600" />
              <span>Active Chits Projection Breakdown</span>
            </h4>

            {breakdown.length === 0 ? (
              <div className="p-6 text-center text-xs text-slate-400 bg-slate-50 rounded-2xl border border-slate-200">
                No active chits currently available.
              </div>
            ) : (
              <div className="space-y-2.5">
                {breakdown.map((chit) => {
                  const chitProfit = chit.total_projected_profit;
                  const chitIsProfit = chitProfit >= 0;
                  const isExpanded = expandedChitId === chit.chit_id;

                  return (
                    <div
                      key={chit.chit_id}
                      className="border border-slate-200 rounded-2xl overflow-hidden bg-white shadow-2xs"
                    >
                      <div
                        onClick={() => setExpandedChitId(isExpanded ? null : chit.chit_id)}
                        className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 cursor-pointer hover:bg-slate-50 transition-colors"
                      >
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-slate-900 text-sm">{chit.chit_name}</span>
                            <span className="px-2 py-0.5 rounded text-[10px] font-black bg-blue-50 text-blue-700 border border-blue-200 font-mono">
                              {chit.total_months} Months
                            </span>
                            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-600">
                              {chit.total_members} Members
                            </span>
                          </div>
                          <span className="text-[11px] text-slate-500 block mt-0.5 font-medium">
                            Chit Value: {formatINR(chit.chit_value)}
                          </span>
                        </div>

                        <div className="flex items-center gap-4 text-xs">
                          <div>
                            <span className="text-[10px] text-slate-400 block uppercase">Projected Collection</span>
                            <span className="font-mono font-bold text-slate-900">
                              {formatINR(chit.total_projected_collection)}
                            </span>
                          </div>
                          <div>
                            <span className="text-[10px] text-slate-400 block uppercase">Lift Payout</span>
                            <span className="font-mono font-bold text-purple-900">
                              {formatINR(chit.total_projected_payout)}
                            </span>
                          </div>
                          <div className="text-right">
                            <span className="text-[10px] text-slate-400 block uppercase">Projected Profit</span>
                            <span
                              className={`font-mono font-black text-sm block ${
                                chitIsProfit ? 'text-emerald-700' : 'text-red-600'
                              }`}
                            >
                              {chitIsProfit
                                ? `+${formatINR(chitProfit)}`
                                : `-${formatINR(Math.abs(chitProfit))}`}
                            </span>
                          </div>
                          <div className="text-slate-400 pl-1">
                            {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                          </div>
                        </div>
                      </div>

                      {/* Expandable Month-by-Month Table */}
                      {isExpanded && chit.monthly_projections && chit.monthly_projections.length > 0 && (
                        <div className="p-4 bg-slate-50/70 border-t border-slate-200 space-y-2 animate-in fade-in duration-100">
                          <div className="flex items-center justify-between text-xs font-bold text-slate-700">
                            <span>Month-by-Month Schedule ({chit.total_months} Months)</span>
                            <span className="text-[11px] font-normal text-slate-500">
                              Sum of monthly profit/loss = {formatINR(chitProfit)}
                            </span>
                          </div>
                          <div className="max-h-60 overflow-y-auto border border-slate-200 rounded-xl bg-white">
                            <table className="w-full text-xs text-left">
                              <thead className="bg-slate-100 text-slate-700 font-semibold sticky top-0 border-b border-slate-200">
                                <tr>
                                  <th className="py-2 px-3">Month</th>
                                  <th className="py-2 px-3 text-right">Projected Collection</th>
                                  <th className="py-2 px-3 text-right">Lift Payout</th>
                                  <th className="py-2 px-3 text-right">Profit / Loss</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-100">
                                {chit.monthly_projections.map((m) => {
                                  const mProfit = m.profit_or_loss;
                                  const mIsProfit = mProfit >= 0;
                                  return (
                                    <tr key={m.month_number} className="hover:bg-slate-50">
                                      <td className="py-1.5 px-3 font-bold text-slate-800">
                                        Month {m.month_number} <span className="text-slate-400 font-normal">({m.month_name})</span>
                                      </td>
                                      <td className="py-1.5 px-3 text-right font-mono text-slate-900">
                                        {formatINR(m.projected_collection)}
                                      </td>
                                      <td className="py-1.5 px-3 text-right font-mono text-purple-900">
                                        {formatINR(m.lift_payout)}
                                      </td>
                                      <td className="py-1.5 px-3 text-right font-mono font-bold">
                                        <span className={mIsProfit ? 'text-emerald-700' : 'text-red-600'}>
                                          {mIsProfit ? `+${formatINR(mProfit)}` : `-${formatINR(Math.abs(mProfit))}`}
                                        </span>
                                      </td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-100 bg-slate-50 flex items-center justify-between">
          <div className="text-xs text-slate-500 font-medium">
            Sum of full-term projected profits for all active chits
          </div>
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold transition-colors cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
