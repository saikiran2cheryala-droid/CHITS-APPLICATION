import React from 'react';
import { X, TrendingUp, TrendingDown, Calculator, Calendar, Info, Layers, CheckCircle } from 'lucide-react';
import { Chit } from '../types';
import { formatINR } from '../utils/formatters';

interface ChitProjectionModalProps {
  isOpen: boolean;
  onClose: () => void;
  chit: Chit | null | undefined;
}

export const ChitProjectionModal: React.FC<ChitProjectionModalProps> = ({
  isOpen,
  onClose,
  chit,
}) => {
  if (!isOpen || !chit) return null;

  const totalMonths = chit.total_months || 0;
  const totalMembers = chit.total_members || 0;
  const projectedMonthly = chit.projected_monthly || [];

  // Calculate or fallback
  const totalProfit = chit.total_projected_profit !== undefined
    ? chit.total_projected_profit
    : projectedMonthly.reduce((sum, r) => sum + (r.profit_or_loss ?? (r.projected_collection - r.lift_payout)), 0);

  const totalCollection = chit.total_projected_collection !== undefined
    ? chit.total_projected_collection
    : projectedMonthly.reduce((sum, r) => sum + (r.projected_collection || 0), 0);

  const totalPayout = chit.total_projected_payout !== undefined
    ? chit.total_projected_payout
    : projectedMonthly.reduce((sum, r) => sum + (r.lift_payout || 0), 0);

  const isProfit = totalProfit >= 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150">
      <div
        className="bg-white rounded-3xl border border-slate-200 shadow-2xl max-w-3xl w-full max-h-[92vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-150"
        role="dialog"
        aria-modal="true"
        aria-labelledby="chit-projection-modal-title"
      >
        {/* Modal Header */}
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
                <h3 id="chit-projection-modal-title" className="text-base font-black text-slate-900 uppercase tracking-wide">
                  TOTAL PROJECTED CHIT PROFIT
                </h3>
                <span
                  className={`px-2.5 py-0.5 rounded-full text-xs font-black ${
                    isProfit
                      ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                      : 'bg-red-100 text-red-800 border border-red-200'
                  }`}
                >
                  {isProfit ? 'PROJECTED PROFIT' : 'PROJECTED LOSS'}
                </span>
              </div>
              <p className="text-xs text-slate-500 font-medium mt-0.5">
                {chit.name} • {totalMonths} Months • {totalMembers} Members • Value: {formatINR(chit.chit_value)}
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

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto space-y-5">
          {/* Key Totals Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {/* Total Projected Collection */}
            <div className="bg-slate-50 border border-slate-200/80 rounded-2xl p-4">
              <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">
                Total Projected Collection
              </span>
              <span className="text-xl sm:text-2xl font-black font-mono text-slate-900 mt-1 block">
                {formatINR(totalCollection)}
              </span>
              <span className="text-[11px] text-slate-400 mt-0.5 block">
                All {totalMonths} months full term
              </span>
            </div>

            {/* Total Projected Lift Payout */}
            <div className="bg-slate-50 border border-slate-200/80 rounded-2xl p-4">
              <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">
                Total Projected Lift Payout
              </span>
              <span className="text-xl sm:text-2xl font-black font-mono text-purple-900 mt-1 block">
                {formatINR(totalPayout)}
              </span>
              <span className="text-[11px] text-purple-600 mt-0.5 block">
                Scheduled customer disbursements
              </span>
            </div>

            {/* Total Projected Profit / Loss */}
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
                className={`text-xl sm:text-2xl font-black font-mono mt-1 block ${
                  isProfit ? 'text-emerald-700' : 'text-red-600'
                }`}
              >
                {isProfit ? `+${formatINR(totalProfit)}` : `-${formatINR(Math.abs(totalProfit))}`}
              </span>
              <span className="text-[11px] opacity-75 mt-0.5 block font-medium">
                {isProfit ? 'Manager Full-Term Profit (Green)' : 'Manager Full-Term Loss (Red)'}
              </span>
            </div>
          </div>

          {/* Explanation Callout */}
          <div className="p-3.5 rounded-2xl border border-blue-100 bg-blue-50/70 text-xs text-blue-950 flex items-start gap-2.5">
            <Info className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <span className="font-bold text-blue-900 block">
                Configured Full-Term Rule Projection:
              </span>
              <p className="text-slate-600 text-[11px] leading-relaxed">
                This projection is computed across all <strong>{totalMonths} months</strong> directly from the configured chit rules.
                Customer payment status, current pending amounts, or daily collections do <strong>not</strong> change this total full-term projected profit.
              </p>
            </div>
          </div>

          {/* Month-by-Month Projection Table */}
          <div className="space-y-2">
            <div className="flex items-center justify-between px-1">
              <span className="text-xs font-bold text-slate-700 uppercase tracking-wide">
                Complete Month-by-Month Projection Table
              </span>
              <span className="text-xs text-slate-500 font-medium">
                Profit in <strong className="text-emerald-700">GREEN</strong> • Loss in <strong className="text-red-600">RED</strong>
              </span>
            </div>

            <div className="max-h-80 overflow-y-auto border border-slate-200 bg-white rounded-2xl shadow-xs">
              <table className="w-full text-xs text-left">
                <thead className="bg-slate-100 text-slate-800 font-bold sticky top-0 border-b border-slate-200 z-10">
                  <tr>
                    <th className="py-2.5 px-3">Month</th>
                    <th className="py-2.5 px-3 text-right">Projected Collection</th>
                    <th className="py-2.5 px-3 text-right">Lift Payout</th>
                    <th className="py-2.5 px-3 text-right">Profit / Loss</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {projectedMonthly.map((row) => {
                    const rowProfit = row.profit_or_loss !== undefined
                      ? row.profit_or_loss
                      : (row.projected_collection - row.lift_payout);
                    const rowIsProfit = rowProfit >= 0;

                    return (
                      <tr
                        key={row.month_number}
                        className={
                          rowIsProfit
                            ? 'hover:bg-slate-50/80 transition-colors'
                            : 'bg-red-50/30 hover:bg-red-50/60 transition-colors'
                        }
                      >
                        <td className="py-2.5 px-3 font-bold text-slate-800">
                          <div className="flex items-center gap-1.5">
                            <span>Month {row.month_number}</span>
                            <span className="text-[10px] text-slate-400 font-normal">
                              ({row.month_name})
                            </span>
                          </div>
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono font-medium text-slate-900">
                          {formatINR(row.projected_collection)}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono font-medium text-purple-900">
                          {formatINR(row.lift_payout)}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono font-black">
                          <span
                            className={`inline-block px-2.5 py-0.5 rounded text-xs ${
                              rowIsProfit
                                ? 'text-emerald-700 bg-emerald-100/70 border border-emerald-200'
                                : 'text-red-700 bg-red-100/70 border border-red-200'
                            }`}
                          >
                            {rowIsProfit
                              ? `+${formatINR(rowProfit)}`
                              : `-${formatINR(Math.abs(rowProfit))}`}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot className="bg-slate-100 text-slate-900 font-black border-t-2 border-slate-300 sticky bottom-0">
                  <tr>
                    <td className="py-3 px-3 uppercase text-xs">
                      TOTAL PROJECTED PROFIT
                    </td>
                    <td className="py-3 px-3 text-right font-mono text-xs">
                      {formatINR(totalCollection)}
                    </td>
                    <td className="py-3 px-3 text-right font-mono text-xs text-purple-900">
                      {formatINR(totalPayout)}
                    </td>
                    <td className="py-3 px-3 text-right font-mono text-xs">
                      <span className={isProfit ? 'text-emerald-700' : 'text-red-600'}>
                        {isProfit
                          ? `+${formatINR(totalProfit)}`
                          : `-${formatINR(Math.abs(totalProfit))}`}
                      </span>
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-4 border-t border-slate-100 bg-slate-50 flex items-center justify-between">
          <div className="text-xs text-slate-500 font-medium">
            Equals sum of all {totalMonths} monthly projections • Constant reference value
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
