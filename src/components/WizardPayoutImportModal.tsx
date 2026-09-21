import React, { useState } from 'react';
import {
  X,
  FileSpreadsheet,
  CheckCircle2,
  AlertTriangle,
  AlertCircle,
  Upload,
} from 'lucide-react';
import {
  ParsePayoutResult,
  parsePayoutExcelOrCsvFile,
} from '../utils/payoutExcelImport';
import { formatINR, getMonthLabel } from '../utils/formatters';

interface WizardPayoutImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  fileName: string;
  parseResult: ParsePayoutResult;
  totalMonths: number;
  startMonthStr: string;
  onConfirmImport: (
    validPayouts: { month_number: number; lift_payout: number }[],
    fileName: string
  ) => void;
  onSelectDifferentFile: (file: File) => void;
}

export const WizardPayoutImportModal: React.FC<WizardPayoutImportModalProps> = ({
  isOpen,
  onClose,
  fileName,
  parseResult,
  totalMonths,
  startMonthStr,
  onConfirmImport,
  onSelectDifferentFile,
}) => {
  const [isReuploading, setIsReuploading] = useState(false);

  if (!isOpen) return null;

  const validCount = parseResult.validPayouts.length;
  const hasDuplicates = parseResult.duplicateMonths.length > 0;
  const hasMissing = parseResult.missingMonths.length > 0 && validCount > 0;
  const hasOutsideRange = parseResult.outsideRangeMonths.length > 0;
  const hasCriticalError = !!parseResult.error || hasDuplicates || validCount === 0;

  // Build a lookup for valid payouts by month
  const payoutMap = new Map<number, number>();
  parseResult.validPayouts.forEach((p) => {
    payoutMap.set(p.month_number, p.lift_payout);
  });

  const handleFileInputChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      onSelectDifferentFile(e.target.files[0]);
    }
  };

  return (
    <div
      id="wizard-payout-import-modal-backdrop"
      className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in duration-150"
    >
      <div
        id="wizard-payout-import-modal-card"
        className="bg-white rounded-2xl max-w-2xl w-full shadow-2xl border border-slate-200 flex flex-col max-h-[90vh] overflow-hidden"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-purple-50/40">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-purple-100 text-purple-700 flex items-center justify-center shadow-xs">
              <FileSpreadsheet className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900">IMPORT PAYOUT SCHEDULE</h3>
              <p className="text-xs text-slate-500 truncate max-w-sm sm:max-w-md">
                File: <span className="font-semibold text-slate-700">{fileName}</span>
              </p>
            </div>
          </div>
          <button
            id="close-wizard-import-modal-btn"
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
            <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-xs text-red-800 space-y-1.5">
              <div className="flex items-center gap-2 font-bold text-red-900">
                <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
                <span>Cannot import file due to errors</span>
              </div>
              {parseResult.error && <p>{parseResult.error}</p>}
              {hasDuplicates && (
                <div className="space-y-1 pt-1">
                  {parseResult.duplicateMonths.map((m) => (
                    <p key={m} className="font-semibold">
                      Duplicate Month {m} found in Excel.
                    </p>
                  ))}
                  <p className="text-red-700">Please correct duplicates in the file and upload again.</p>
                </div>
              )}
            </div>
          ) : (
            <div className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-900 flex items-center justify-between">
              <div className="flex items-center gap-2 font-bold">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>
                  ✓ {validCount} of {totalMonths} months detected
                </span>
              </div>
              <span className="text-[11px] text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-md font-semibold">
                Ready to import
              </span>
            </div>
          )}

          {/* Missing Months Warning */}
          {hasMissing && !hasDuplicates && (
            <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-900 space-y-2">
              <div className="flex items-center gap-2 font-bold text-amber-950">
                <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                <span>
                  {parseResult.missingMonths.length} monthly payout
                  {parseResult.missingMonths.length > 1 ? 's are' : ' is'} missing:
                </span>
              </div>
              <p className="font-mono text-amber-800 font-semibold bg-amber-100/60 p-2 rounded-lg break-words">
                {parseResult.missingMonths.map((m) => `Month ${m}`).join(', ')}
              </p>
              <p className="text-amber-800 leading-relaxed">
                You can cancel and fix your Excel, or continue with the incomplete schedule and manually enter missing amounts in Step 5.
              </p>
            </div>
          )}

          {/* Outside Range Rows Warning */}
          {hasOutsideRange && (
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-800 flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <div>
                <span className="font-bold">Notice: </span>
                {parseResult.outsideRangeMonths.length} row(s) outside the chit duration ({totalMonths} months) were rejected.
              </div>
            </div>
          )}

          {/* Preview Schedule Table */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs text-slate-500 font-medium px-1">
              <span>Schedule Preview (Months 1 to {totalMonths})</span>
              <span>{validCount} valid payout rows</span>
            </div>
            <div className="border border-slate-200 rounded-xl max-h-64 overflow-y-auto bg-white shadow-xs">
              <table className="w-full text-xs text-left">
                <thead className="bg-slate-100 text-slate-700 font-semibold sticky top-0 border-b border-slate-200 z-10">
                  <tr>
                    <th className="py-2.5 px-4 w-20">Month</th>
                    <th className="py-2.5 px-4">Month Name</th>
                    <th className="py-2.5 px-4 text-right">Lift Payout</th>
                    <th className="py-2.5 px-4 text-center w-28">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {Array.from({ length: totalMonths }).map((_, idx) => {
                    const monthNum = idx + 1;
                    const payout = payoutMap.get(monthNum);
                    const monthLabel = getMonthLabel(startMonthStr, monthNum);
                    const isConfigured = payout !== undefined;

                    return (
                      <tr
                        key={monthNum}
                        className={isConfigured ? 'hover:bg-slate-50' : 'bg-amber-50/40 text-amber-900'}
                      >
                        <td className="py-2 px-4 font-bold text-slate-700">Month {monthNum}</td>
                        <td className="py-2 px-4 text-slate-600">{monthLabel}</td>
                        <td className="py-2 px-4 text-right font-mono font-bold">
                          {isConfigured ? (
                            <span className="text-purple-950">{formatINR(payout)}</span>
                          ) : (
                            <span className="text-amber-600 italic font-normal">Not in Excel</span>
                          )}
                        </td>
                        <td className="py-2 px-4 text-center">
                          {isConfigured ? (
                            <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 bg-emerald-100/70 px-2 py-0.5 rounded-full">
                              <CheckCircle2 className="w-3 h-3" /> Valid
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-700 bg-amber-100 px-2 py-0.5 rounded-full">
                              <AlertTriangle className="w-3 h-3" /> Missing
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
            <span>Want to use a different file?</span>
            <label className="text-purple-700 hover:text-purple-900 font-bold cursor-pointer underline flex items-center gap-1">
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
            id="cancel-wizard-import-btn"
            type="button"
            onClick={onClose}
            className="px-4 py-2 border border-slate-300 rounded-xl text-xs font-bold text-slate-700 hover:bg-slate-100 transition-colors"
          >
            Cancel
          </button>

          {!hasCriticalError && (
            <button
              id="confirm-wizard-import-btn"
              type="button"
              onClick={() => onConfirmImport(parseResult.validPayouts, fileName)}
              className="px-5 py-2 bg-purple-700 hover:bg-purple-800 text-white rounded-xl text-xs font-bold shadow-sm transition-colors flex items-center gap-1.5"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>
                {hasMissing
                  ? `Continue with Incomplete Schedule (${validCount} Payouts)`
                  : `Import ${validCount} Payouts`}
              </span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
