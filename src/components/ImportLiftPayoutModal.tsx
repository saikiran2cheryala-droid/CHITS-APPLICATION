import React, { useState, useRef } from 'react';
import {
  X,
  Upload,
  FileSpreadsheet,
  AlertTriangle,
  CheckCircle2,
  AlertCircle,
  Download,
  Calendar,
  RotateCcw,
} from 'lucide-react';
import {
  parsePayoutExcelOrCsvFile,
  downloadLiftPayoutTemplate,
  ParsePayoutResult,
} from '../utils/payoutExcelImport';
import { formatINR } from '../utils/formatters';

interface ImportLiftPayoutModalProps {
  isOpen: boolean;
  onClose: () => void;
  chitId: string;
  chitName: string;
  totalMonths: number;
  existingRules?: { month_number: number; expected_lift_payout?: number }[];
  onImportSuccess: () => void;
  onImportToBackend: (
    payouts: { month_number: number; lift_payout: number }[]
  ) => Promise<{ success: boolean; message: string; updated_count: number }>;
}

export const ImportLiftPayoutModal: React.FC<ImportLiftPayoutModalProps> = ({
  isOpen,
  onClose,
  chitId,
  chitName,
  totalMonths,
  existingRules = [],
  onImportSuccess,
  onImportToBackend,
}) => {
  const [file, setFile] = useState<File | null>(null);
  const [isParsing, setIsParsing] = useState(false);
  const [parseResult, setParseResult] = useState<ParsePayoutResult | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const handleReset = () => {
    setFile(null);
    setParseResult(null);
    setStatusMessage(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleFileChange = async (selectedFile: File | null) => {
    if (!selectedFile) return;
    setStatusMessage(null);
    setFile(selectedFile);
    setIsParsing(true);

    try {
      const res = await parsePayoutExcelOrCsvFile(selectedFile, totalMonths);
      setParseResult(res);
      if (res.error) {
        setStatusMessage({ type: 'error', text: res.error });
      }
    } catch (err: any) {
      setStatusMessage({
        type: 'error',
        text: `Failed to process file: ${err.message || 'Unknown error'}`,
      });
    } finally {
      setIsParsing(false);
    }
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFileChange(e.dataTransfer.files[0]);
    }
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleConfirmImport = async () => {
    if (!parseResult || parseResult.validPayouts.length === 0) return;
    if (parseResult.duplicateMonths.length > 0) return;

    try {
      setIsUploading(true);
      setStatusMessage(null);

      const res = await onImportToBackend(parseResult.validPayouts);
      setStatusMessage({
        type: 'success',
        text: res.message || `Successfully imported ${res.updated_count} monthly lift payouts!`,
      });

      setTimeout(() => {
        onImportSuccess();
        onClose();
        handleReset();
      }, 1200);
    } catch (err: any) {
      setStatusMessage({
        type: 'error',
        text: err.message || 'Failed to import lift payouts to database.',
      });
    } finally {
      setIsUploading(false);
    }
  };

  const hasDuplicates = parseResult && parseResult.duplicateMonths.length > 0;
  const validCount = parseResult?.validPayouts.length || 0;
  const isMissingMonths = Boolean(parseResult && parseResult.missingMonths.length > 0 && validCount > 0);
  const canImport = Boolean(parseResult && validCount > 0 && !hasDuplicates && !isUploading);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
      <div
        className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-2xl w-full max-h-[90vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150"
        role="dialog"
        aria-modal="true"
        aria-labelledby="import-payout-modal-title"
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/70">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl bg-purple-50 border border-purple-200/60 flex items-center justify-center text-purple-600">
              <FileSpreadsheet className="w-5 h-5" />
            </div>
            <div>
              <h2 id="import-payout-modal-title" className="text-base font-black text-slate-900 tracking-tight">
                IMPORT LIFT PAYOUTS
              </h2>
              <p className="text-xs text-slate-500 font-medium">
                {chitName} • {totalMonths} Months Duration
              </p>
            </div>
          </div>
          <button
            id="close-import-payout-modal-btn"
            onClick={() => {
              onClose();
              handleReset();
            }}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
            title="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 overflow-y-auto space-y-5 flex-1">
          {/* Instructions & Template Download Bar */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 bg-purple-50/60 border border-purple-200/70 rounded-xl text-xs">
            <div>
              <span className="font-bold text-purple-950 block">Excel Format: Month & Lift Payout</span>
              <span className="text-purple-800 text-[11px]">
                Supported columns: <strong>Month</strong> (1 to {totalMonths}) and <strong>Lift Payout</strong> (exact amount).
              </span>
            </div>
            <button
              id="download-payout-template-modal-btn"
              type="button"
              onClick={() => downloadLiftPayoutTemplate(totalMonths, existingRules)}
              className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 bg-white hover:bg-purple-100 text-purple-800 border border-purple-300 rounded-lg font-bold shadow-2xs transition-colors shrink-0 cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Download Template</span>
            </button>
          </div>

          {/* Upload Area / File Dropzone */}
          {!parseResult ? (
            <div
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              onClick={() => fileInputRef.current?.click()}
              className="border-2 border-dashed border-slate-300 hover:border-purple-500 bg-slate-50/50 hover:bg-purple-50/20 rounded-2xl p-8 text-center cursor-pointer transition-all group"
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx, .xls, .csv"
                onChange={(e) => handleFileChange(e.target.files ? e.target.files[0] : null)}
                className="hidden"
                id="excel-payout-file-input"
              />
              <div className="w-12 h-12 rounded-2xl bg-purple-100/80 text-purple-700 flex items-center justify-center mx-auto mb-3 group-hover:scale-110 transition-transform">
                <Upload className="w-6 h-6" />
              </div>
              <p className="text-sm font-bold text-slate-800">
                Click to upload or drag & drop your Excel / CSV file
              </p>
              <p className="text-xs text-slate-500 mt-1 font-medium">
                Supports .xlsx, .xls, and .csv files
              </p>
            </div>
          ) : (
            /* Uploaded File Bar */
            <div className="flex items-center justify-between p-3.5 bg-slate-100/80 border border-slate-200 rounded-xl">
              <div className="flex items-center gap-2.5 truncate">
                <FileSpreadsheet className="w-5 h-5 text-purple-600 shrink-0" />
                <div className="truncate">
                  <span className="text-xs font-bold text-slate-900 block truncate">{file?.name}</span>
                  <span className="text-[11px] text-slate-500 font-mono">
                    Detected: {validCount} valid month{validCount === 1 ? '' : 's'} / {totalMonths}
                  </span>
                </div>
              </div>
              <button
                id="reupload-payout-file-btn"
                type="button"
                onClick={handleReset}
                className="flex items-center gap-1 text-xs font-bold text-slate-600 hover:text-slate-900 bg-white border border-slate-200 px-2.5 py-1 rounded-lg transition-colors cursor-pointer shrink-0"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Change File</span>
              </button>
            </div>
          )}

          {isParsing && (
            <div className="text-center py-6">
              <div className="inline-block w-6 h-6 border-2 border-purple-600 border-t-transparent rounded-full animate-spin mb-2" />
              <p className="text-xs font-bold text-slate-600">Analyzing Excel lift payouts...</p>
            </div>
          )}

          {/* Validation Alerts */}
          {parseResult && (
            <div className="space-y-3">
              {/* 1. Duplicate Months (Blocks Import) */}
              {hasDuplicates && (
                <div className="p-3.5 bg-red-50 border border-red-200 rounded-xl text-xs flex items-start gap-2.5 text-red-900">
                  <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-bold block">
                      Duplicate {parseResult.duplicateMonths.length === 1 ? 'Month' : 'Months'} Found
                    </span>
                    <p className="mt-0.5 text-red-800">
                      {parseResult.duplicateMonths.map((m) => `Duplicate Month ${m} found.`).join(' ')}{' '}
                      Please correct the Excel file before importing.
                    </p>
                  </div>
                </div>
              )}

              {/* 2. Outside Range Months (Ignored / Excluded) */}
              {parseResult.outsideRangeMonths.length > 0 && (
                <div className="p-3.5 bg-amber-50 border border-amber-200 rounded-xl text-xs flex items-start gap-2.5 text-amber-900">
                  <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-bold block">Months Outside Duration Excluded</span>
                    <p className="mt-0.5 text-amber-800">
                      {parseResult.outsideRangeMonths.map((o) => o.errorMessage).join(' ')} (These rows will not be imported).
                    </p>
                  </div>
                </div>
              )}

              {/* 3. Missing Months Alert */}
              {isMissingMonths && !hasDuplicates && (
                <div className="p-3.5 bg-blue-50 border border-blue-200 rounded-xl text-xs flex items-start gap-2.5 text-blue-900">
                  <Calendar className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-bold block">Partial Lift Schedule Detected</span>
                    <p className="mt-0.5 text-blue-800">
                      {parseResult.missingMonthsMessage ||
                        `Lift payout amounts are missing for ${parseResult.missingMonths.length} months.`}
                    </p>
                    <p className="mt-1 text-[11px] text-blue-700">
                      You can import the available {validCount} months now and configure the rest later.
                    </p>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Status Message (Success / Backend Error) */}
          {statusMessage && (
            <div
              className={`p-3.5 rounded-xl text-xs flex items-center gap-2.5 ${
                statusMessage.type === 'success'
                  ? 'bg-emerald-50 border border-emerald-200 text-emerald-900 font-bold'
                  : 'bg-red-50 border border-red-200 text-red-900 font-medium'
              }`}
            >
              {statusMessage.type === 'success' ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              ) : (
                <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
              )}
              <span>{statusMessage.text}</span>
            </div>
          )}

          {/* Preview Table */}
          {parseResult && validCount > 0 && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-black text-slate-800 uppercase tracking-wider">
                  PREVIEW: {validCount} MONTHS DETECTED
                </span>
                <span className="text-[11px] text-slate-500 font-medium">
                  Exact amounts as provided in Excel
                </span>
              </div>
              <div className="border border-slate-200 rounded-xl overflow-hidden max-h-60 overflow-y-auto">
                <table className="w-full text-xs text-left">
                  <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold uppercase sticky top-0">
                    <tr>
                      <th className="px-4 py-2.5">Month</th>
                      <th className="px-4 py-2.5 text-right">Lift Payout</th>
                      <th className="px-4 py-2.5 text-center">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {parseResult.validPayouts.map((row) => (
                      <tr key={row.month_number} className="hover:bg-slate-50/70">
                        <td className="px-4 py-2 font-bold text-slate-900 font-mono">
                          Month {row.month_number}
                        </td>
                        <td className="px-4 py-2 text-right font-mono font-bold text-purple-900">
                          {formatINR(row.lift_payout)}
                        </td>
                        <td className="px-4 py-2 text-center">
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                            <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                            Valid
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="px-6 py-4 border-t border-slate-100 bg-slate-50/70 flex items-center justify-end gap-3">
          <button
            id="cancel-payout-import-btn"
            type="button"
            onClick={() => {
              onClose();
              handleReset();
            }}
            disabled={isUploading}
            className="px-4 py-2 rounded-xl border border-slate-300 text-slate-700 hover:bg-slate-100 font-bold text-xs transition-colors cursor-pointer disabled:opacity-50"
          >
            Cancel
          </button>

          {canImport && (
            <button
              id="confirm-payout-import-btn"
              type="button"
              onClick={handleConfirmImport}
              disabled={isUploading}
              className="inline-flex items-center gap-1.5 px-5 py-2 rounded-xl bg-purple-600 hover:bg-purple-700 text-white font-bold text-xs shadow-xs transition-colors cursor-pointer disabled:opacity-50"
            >
              {isUploading ? (
                <>
                  <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  <span>Saving Payouts...</span>
                </>
              ) : isMissingMonths ? (
                <span>Import Available Months ({validCount})</span>
              ) : (
                <span>Import {validCount} Months</span>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
