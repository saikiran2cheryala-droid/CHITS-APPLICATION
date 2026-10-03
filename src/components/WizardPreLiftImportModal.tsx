import React from 'react';
import {
  X,
  FileSpreadsheet,
  CheckCircle2,
  AlertTriangle,
  AlertCircle,
  Upload,
} from 'lucide-react';
import {
  ParsePreLiftResult,
  formatMonthList,
} from '../utils/preLiftExcelImport';
import { formatINR, getMonthLabel } from '../utils/formatters';

interface WizardPreLiftImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  fileName: string;
  parseResult: ParsePreLiftResult;
  totalMonths: number;
  startMonthStr: string;
  onConfirmImport: (
    validPayments: { month_number: number; pre_lift_payment: number }[],
    fileName: string
  ) => void;
  onSelectDifferentFile: (file: File) => void;
}

export const WizardPreLiftImportModal: React.FC<WizardPreLiftImportModalProps> = ({
  isOpen,
  onClose,
  fileName,
  parseResult,
  totalMonths,
  startMonthStr,
  onConfirmImport,
  onSelectDifferentFile,
}) => {
  if (!isOpen) return null;

  const validCount = parseResult.validPayments.length;
  const hasDuplicates = parseResult.duplicateMonths.length > 0;
  const hasMissing = parseResult.missingMonths.length > 0;
  const hasOutsideRange = parseResult.outsideRangeMonths.length > 0;
  const hasInvalidAmounts = parseResult.invalidAmountRows.length > 0;
  const hasCriticalError = parseResult.hasError || validCount !== totalMonths;

  // Build a lookup for valid payments by month
  const paymentMap = new Map<number, number>();
  parseResult.validPayments.forEach((p) => {
    paymentMap.set(p.month_number, p.pre_lift_payment);
  });

  const handleFileInputChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      onSelectDifferentFile(e.target.files[0]);
    }
  };

  return (
    <div
      id="wizard-pre-lift-import-modal-backdrop"
      className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in duration-150"
    >
      <div
        id="wizard-pre-lift-import-modal-card"
        className="bg-white rounded-2xl max-w-2xl w-full shadow-2xl border border-slate-200 flex flex-col max-h-[90vh] overflow-hidden"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-blue-50/50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-100 text-blue-700 flex items-center justify-center shadow-xs">
              <FileSpreadsheet className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900">IMPORT PRE-LIFT PAYMENTS PREVIEW</h3>
              <p className="text-xs text-slate-500 truncate max-w-sm sm:max-w-md">
                File: <span className="font-semibold text-slate-700">{fileName}</span>
              </p>
            </div>
          </div>
          <button
            id="close-wizard-pre-lift-modal-btn"
            type="button"
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-white rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Area */}
        <div className="p-6 overflow-y-auto space-y-4 flex-1">
          {/* Status Banner */}
          {hasCriticalError ? (
            <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-xs text-red-800 space-y-2">
              <div className="flex items-center gap-2 font-bold text-red-900 text-sm">
                <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
                <span>Cannot import file — Validation errors detected</span>
              </div>

              {parseResult.error && (
                <p className="font-medium text-red-800">{parseResult.error}</p>
              )}

              {hasMissing && (
                <div className="bg-white/80 p-2.5 rounded-lg border border-red-200 text-red-900 space-y-1">
                  <span className="font-bold">Missing Months ({parseResult.missingMonths.length}): </span>
                  <span className="font-mono font-medium">{formatMonthList(parseResult.missingMonths)}</span>
                  <p className="text-[11px] text-red-700 mt-1">
                    Excel must contain all Month 1 through Month {totalMonths}. Please ensure every month has a valid amount.
                  </p>
                </div>
              )}

              {hasDuplicates && (
                <div className="bg-white/80 p-2.5 rounded-lg border border-red-200 text-red-900">
                  <span className="font-bold">Duplicate Months: </span>
                  <span className="font-mono font-medium">{parseResult.duplicateMonths.map((m) => `Month ${m}`).join(', ')}</span>
                </div>
              )}

              {hasInvalidAmounts && (
                <div className="bg-white/80 p-2.5 rounded-lg border border-red-200 text-red-900">
                  <span className="font-bold">Invalid Amount: </span>
                  <span>Every month must have a numeric amount greater than 0. Missing or zero amounts are not permitted.</span>
                </div>
              )}

              {hasOutsideRange && (
                <div className="bg-white/80 p-2.5 rounded-lg border border-red-200 text-red-900">
                  <span className="font-bold">Outside Range: </span>
                  <span>Found rows for months outside configured chit duration (1 to {totalMonths}).</span>
                </div>
              )}
            </div>
          ) : (
            <div className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-900 flex items-center justify-between">
              <div className="flex items-center gap-2 font-bold">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>
                  ✓ All {validCount} of {totalMonths} months detected and validated
                </span>
              </div>
              <span className="text-[11px] text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-md font-semibold">
                Ready to import
              </span>
            </div>
          )}

          {/* Import Preview Schedule Table */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs text-slate-500 font-medium px-1">
              <span>Preview: Month-by-Month Pre-Lift Amounts</span>
              <span>{validCount} of {totalMonths} valid</span>
            </div>
            <div className="border border-slate-200 rounded-xl max-h-64 overflow-y-auto bg-white shadow-xs">
              <table className="w-full text-xs text-left">
                <thead className="bg-slate-100 text-slate-700 font-semibold sticky top-0 border-b border-slate-200 z-10">
                  <tr>
                    <th className="py-2.5 px-4 w-24">Month</th>
                    <th className="py-2.5 px-4">Month Name</th>
                    <th className="py-2.5 px-4 text-right">Pre-Lift Payment</th>
                    <th className="py-2.5 px-4 text-center w-28">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {Array.from({ length: totalMonths }).map((_, idx) => {
                    const monthNum = idx + 1;
                    const payment = paymentMap.get(monthNum);
                    const monthLabel = getMonthLabel(startMonthStr, monthNum);
                    const isConfigured = payment !== undefined && payment > 0;

                    return (
                      <tr
                        key={monthNum}
                        className={isConfigured ? 'hover:bg-slate-50' : 'bg-red-50/50 text-red-900'}
                      >
                        <td className="py-2 px-4 font-bold text-slate-700">Month {monthNum}</td>
                        <td className="py-2 px-4 text-slate-600">{monthLabel}</td>
                        <td className="py-2 px-4 text-right font-mono font-bold">
                          {isConfigured ? (
                            <span className="text-blue-900">{formatINR(payment)}</span>
                          ) : (
                            <span className="text-red-600 italic font-normal">Missing / Invalid</span>
                          )}
                        </td>
                        <td className="py-2 px-4 text-center">
                          {isConfigured ? (
                            <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 bg-emerald-100/70 px-2 py-0.5 rounded-full">
                              <CheckCircle2 className="w-3 h-3" /> Valid
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-red-700 bg-red-100 px-2 py-0.5 rounded-full">
                              <AlertTriangle className="w-3 h-3" /> Error
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Quick Option to Choose Another File */}
          <div className="pt-1 flex items-center justify-between text-xs text-slate-500">
            <span>Need to upload a corrected file?</span>
            <label className="text-blue-700 hover:text-blue-900 font-bold cursor-pointer underline flex items-center gap-1">
              <Upload className="w-3.5 h-3.5" />
              <span>Choose different file</span>
              <input
                type="file"
                accept=".xlsx,.xls,.csv"
                onChange={handleFileInputChange}
                className="hidden"
              />
            </label>
          </div>
        </div>

        {/* Footer Buttons */}
        <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex items-center justify-end gap-3">
          <button
            id="cancel-wizard-pre-lift-import-btn"
            type="button"
            onClick={onClose}
            className="px-4 py-2 border border-slate-300 rounded-xl text-xs font-bold text-slate-700 hover:bg-slate-100 transition-colors"
          >
            Cancel
          </button>

          <button
            id="confirm-wizard-pre-lift-import-btn"
            type="button"
            disabled={hasCriticalError}
            onClick={() => onConfirmImport(parseResult.validPayments, fileName)}
            className="px-5 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-xl text-xs font-bold shadow-sm transition-colors flex items-center gap-1.5"
          >
            <CheckCircle2 className="w-4 h-4" />
            <span>
              {hasCriticalError
                ? 'Fix Errors in Excel to Import'
                : `Import ${validCount} Monthly Payments`}
            </span>
          </button>
        </div>
      </div>
    </div>
  );
};
