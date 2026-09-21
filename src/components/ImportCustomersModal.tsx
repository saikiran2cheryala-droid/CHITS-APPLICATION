import React, { useState, useRef } from 'react';
import {
  UploadCloud,
  FileSpreadsheet,
  Download,
  AlertCircle,
  CheckCircle2,
  X,
  Users,
  AlertTriangle,
  FileCheck,
  RefreshCw,
} from 'lucide-react';
import {
  parseExcelOrCsvFile,
  ParsedCustomerRow,
  ParseExcelResult,
  downloadSampleExcelTemplate,
} from '../utils/excelImport';
import { Member } from '../types';

interface ImportCustomersModalProps {
  isOpen: boolean;
  onClose: () => void;
  chitId?: string;
  chitName?: string;
  totalMembersLimit: number;
  existingMembers?: Member[];
  onImportSuccess?: (importedCount: number) => void;
  /**
   * If provided, used for wizard mode where members are imported into local wizard state
   */
  onImportToState?: (
    imported: { customer_name: string; phone: string; ticket_number: string }[]
  ) => void;
  /**
   * Real backend import function (used when importing into an existing chit)
   */
  onImportToBackend?: (
    customers: { customer_name: string; phone: string; ticket_number?: string }[]
  ) => Promise<{
    imported_count: number;
    skipped_count: number;
    duplicates_count: number;
    invalid_count: number;
    limit_skipped_count: number;
  }>;
}

export const ImportCustomersModal: React.FC<ImportCustomersModalProps> = ({
  isOpen,
  onClose,
  chitId,
  chitName,
  totalMembersLimit,
  existingMembers = [],
  onImportSuccess,
  onImportToState,
  onImportToBackend,
}) => {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isParsing, setIsParsing] = useState(false);
  const [parseResult, setParseResult] = useState<ParseExcelResult | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [importSummary, setImportSummary] = useState<{
    imported: number;
    skipped: number;
    duplicates: number;
    invalid: number;
    limitSkipped: number;
  } | null>(null);
  const [showInvalidList, setShowInvalidList] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const existingCount = existingMembers.length;
  const remainingSlots = Math.max(0, totalMembersLimit - existingCount);

  const handleFileChange = async (file: File) => {
    // Check file extension
    const validExtensions = ['.xlsx', '.xls', '.csv'];
    const fileNameLower = file.name.toLowerCase();
    const isValidExt = validExtensions.some((ext) => fileNameLower.endsWith(ext));

    if (!isValidExt) {
      setParseResult({
        totalRows: 0,
        validRows: [],
        invalidRows: [],
        allRows: [],
        detectedColumns: { nameCol: null, phoneCol: null },
        error: 'Please upload an Excel (.xlsx / .xls) or CSV (.csv) file.',
      });
      setSelectedFile(file);
      return;
    }

    setSelectedFile(file);
    setIsParsing(true);
    setImportSummary(null);

    try {
      const result = await parseExcelOrCsvFile(
        file,
        undefined,
        totalMembersLimit,
        existingCount
      );
      setParseResult(result);
    } catch (err: any) {
      setParseResult({
        totalRows: 0,
        validRows: [],
        invalidRows: [],
        allRows: [],
        detectedColumns: { nameCol: null, phoneCol: null },
        error: err.message || 'Failed to parse Excel file.',
      });
    } finally {
      setIsParsing(false);
    }
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileChange(e.dataTransfer.files[0]);
    }
  };

  const handleConfirmImport = async () => {
    if (!parseResult || parseResult.validRows.length === 0) return;

    setIsImporting(true);
    try {
      const customersToImport = parseResult.validRows.map((r, idx) => ({
        customer_name: r.customer_name,
        phone: r.phone,
        ticket_number: r.ticket_number || String(existingCount + idx + 1),
      }));

      if (onImportToBackend) {
        // Direct Database Import
        const res = await onImportToBackend(customersToImport);
        setImportSummary({
          imported: res.imported_count,
          skipped: res.skipped_count,
          duplicates: res.duplicates_count,
          invalid: res.invalid_count,
          limitSkipped: res.limit_skipped_count,
        });
        if (onImportSuccess) {
          onImportSuccess(res.imported_count);
        }
      } else if (onImportToState) {
        // Wizard State Import
        onImportToState(customersToImport);
        setImportSummary({
          imported: customersToImport.length,
          skipped: parseResult.invalidRows.length,
          duplicates: 0,
          invalid: parseResult.invalidRows.filter((r) => !r.isOverCapacity).length,
          limitSkipped: parseResult.invalidRows.filter((r) => r.isOverCapacity).length,
        });
        if (onImportSuccess) {
          onImportSuccess(customersToImport.length);
        }
      }
    } catch (err: any) {
      alert(err.message || 'Error occurred while importing customers.');
    } finally {
      setIsImporting(false);
    }
  };

  const handleReset = () => {
    setSelectedFile(null);
    setParseResult(null);
    setImportSummary(null);
    setShowInvalidList(false);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto"
      onClick={onClose}
    >
      <div
        className="bg-white w-full max-w-2xl rounded-2xl shadow-2xl border border-slate-200 overflow-hidden my-auto animate-in fade-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="bg-slate-900 px-5 py-4 text-white flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-blue-600/30 border border-blue-500/40 flex items-center justify-center text-blue-300">
              <FileSpreadsheet className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-base font-bold">Import Customers from Excel</h3>
              <p className="text-xs text-slate-400">
                {chitName ? `Chit: ${chitName}` : 'Add members via spreadsheet'}
                {' • '}
                Capacity: {existingCount} / {totalMembersLimit}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white rounded-lg transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body Content */}
        <div className="p-5 sm:p-6 space-y-5 max-h-[75vh] overflow-y-auto">
          {/* STEP A: Import Completed Summary */}
          {importSummary ? (
            <div className="space-y-4 py-2">
              <div className="p-5 bg-emerald-50 border border-emerald-200 rounded-2xl text-center space-y-2">
                <div className="w-12 h-12 rounded-full bg-emerald-100 border border-emerald-300 flex items-center justify-center mx-auto text-emerald-600">
                  <CheckCircle2 className="w-6 h-6" />
                </div>
                <h4 className="text-lg font-extrabold text-emerald-900">
                  IMPORT COMPLETE
                </h4>
                <p className="text-xs text-emerald-700 font-medium">
                  ✓ {importSummary.imported} customers imported successfully into database with assigned ticket numbers and [NOT LIFTED] status.
                </p>
              </div>

              {/* Stat breakdown */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-center">
                <div className="p-3 bg-emerald-50/70 border border-emerald-200 rounded-xl">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-700 block">
                    Imported
                  </span>
                  <span className="text-xl font-extrabold text-emerald-900 font-mono">
                    {importSummary.imported}
                  </span>
                </div>
                <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block">
                    Skipped
                  </span>
                  <span className="text-xl font-extrabold text-slate-700 font-mono">
                    {importSummary.skipped}
                  </span>
                </div>
                <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-amber-700 block">
                    Duplicates
                  </span>
                  <span className="text-xl font-extrabold text-amber-900 font-mono">
                    {importSummary.duplicates}
                  </span>
                </div>
                <div className="p-3 bg-red-50 border border-red-200 rounded-xl">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-red-700 block">
                    Invalid / Over Limit
                  </span>
                  <span className="text-xl font-extrabold text-red-900 font-mono">
                    {importSummary.invalid + importSummary.limitSkipped}
                  </span>
                </div>
              </div>

              <div className="pt-3 flex justify-end">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-5 py-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold shadow-xs transition-colors cursor-pointer"
                >
                  Done
                </button>
              </div>
            </div>
          ) : !parseResult ? (
            /* STEP B: Upload Zone & Download Sample */
            <div className="space-y-4">
              {/* Template Download Prompt */}
              <div className="p-4 bg-blue-50/70 border border-blue-200 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="space-y-0.5">
                  <span className="text-xs font-bold text-blue-900 block">
                    Need a ready-to-use template?
                  </span>
                  <p className="text-xs text-slate-600">
                    Download sample Excel file containing column headers <strong>Name</strong> and <strong>Phone Number</strong>.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={downloadSampleExcelTemplate}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white border border-blue-300 text-blue-700 hover:bg-blue-100 rounded-lg text-xs font-bold transition-colors shadow-2xs self-start sm:self-auto cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Download Sample Excel</span>
                </button>
              </div>

              {/* Drag & Drop Box */}
              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setIsDragOver(true);
                }}
                onDragLeave={() => setIsDragOver(false)}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className={`border-2 border-dashed rounded-2xl p-6 sm:p-8 text-center transition-all cursor-pointer ${
                  isDragOver
                    ? 'border-blue-500 bg-blue-50/60 scale-[0.99]'
                    : 'border-slate-300 hover:border-blue-400 bg-slate-50/50 hover:bg-slate-50'
                }`}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".xlsx, .xls, .csv, application/vnd.openxmlformats-officedocument.spreadsheetml.sheet, application/vnd.ms-excel, text/csv"
                  className="hidden"
                  onChange={(e) => {
                    if (e.target.files && e.target.files[0]) {
                      handleFileChange(e.target.files[0]);
                    }
                  }}
                />

                <div className="w-12 h-12 rounded-2xl bg-blue-100 text-blue-600 flex items-center justify-center mx-auto mb-3 shadow-xs">
                  <UploadCloud className="w-6 h-6" />
                </div>

                <h4 className="text-sm font-bold text-slate-900">
                  Upload Excel / CSV
                </h4>
                <p className="text-xs text-slate-500 mt-1">
                  Drag & drop your file here, or click to browse
                </p>

                <div className="mt-4 flex flex-wrap items-center justify-center gap-2 text-[11px] text-slate-500">
                  <span className="px-2 py-0.5 bg-slate-200/80 rounded font-mono font-medium">.xlsx</span>
                  <span className="px-2 py-0.5 bg-slate-200/80 rounded font-mono font-medium">.xls</span>
                  <span className="px-2 py-0.5 bg-slate-200/80 rounded font-mono font-medium">.csv</span>
                </div>

                <div className="mt-4">
                  <button
                    type="button"
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition-all shadow-xs inline-flex items-center gap-1.5 cursor-pointer"
                  >
                    <FileSpreadsheet className="w-4 h-4" />
                    <span>Choose File</span>
                  </button>
                </div>
              </div>

              {/* Supported Columns Guide */}
              <div className="bg-slate-50 rounded-xl p-3.5 border border-slate-200 text-xs space-y-1 text-slate-600">
                <span className="font-bold text-slate-800 block text-[11px] uppercase tracking-wider">
                  Supported Column Names:
                </span>
                <p>
                  <strong>Name:</strong> Name, Customer Name, Customer, Member Name
                </p>
                <p>
                  <strong>Phone:</strong> Phone, Phone Number, Mobile, Mobile Number
                </p>
                <p className="text-[11px] text-slate-500 pt-1">
                  Indian mobile numbers (10 digits) are formatted automatically. Multiple members can share the same phone number (family/multiple chits) and will receive unique member IDs and ticket numbers.
                </p>
              </div>
            </div>
          ) : (
            /* STEP C: Preview & Validation Table */
            <div className="space-y-4">
              {/* File Info Bar */}
              <div className="flex items-center justify-between bg-slate-50 p-3 rounded-xl border border-slate-200 text-xs">
                <div className="flex items-center gap-2 truncate">
                  <FileCheck className="w-4 h-4 text-blue-600 shrink-0" />
                  <span className="font-bold text-slate-800 truncate">
                    {selectedFile?.name}
                  </span>
                  <span className="text-slate-400">
                    ({(selectedFile?.size ? (selectedFile.size / 1024).toFixed(1) : 0)} KB)
                  </span>
                </div>
                <button
                  type="button"
                  onClick={handleReset}
                  className="text-slate-500 hover:text-slate-800 font-bold ml-2 underline text-[11px] cursor-pointer"
                >
                  Change File
                </button>
              </div>

              {/* Parsing Error if any */}
              {parseResult.error && (
                <div className="p-4 bg-red-50 border border-red-200 rounded-xl flex items-start gap-3 text-xs text-red-800">
                  <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-bold block">Import Validation Error</span>
                    <span>{parseResult.error}</span>
                  </div>
                </div>
              )}

              {/* Overview Counters */}
              {!parseResult.error && (
                <div className="space-y-3">
                  <div className="grid grid-cols-3 gap-2.5 text-center">
                    <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl">
                      <span className="text-[10px] font-bold uppercase text-slate-500 block">
                        Detected Rows
                      </span>
                      <span className="text-lg font-bold text-slate-900 font-mono">
                        {parseResult.totalRows}
                      </span>
                    </div>
                    <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl">
                      <span className="text-[10px] font-bold uppercase text-emerald-700 block">
                        Ready To Import
                      </span>
                      <span className="text-lg font-bold text-emerald-700 font-mono">
                        {parseResult.validRows.length} valid
                      </span>
                    </div>
                    <div className="p-3 bg-red-50 border border-red-200 rounded-xl">
                      <span className="text-[10px] font-bold uppercase text-red-700 block">
                        Issues / Skipped
                      </span>
                      <span className="text-lg font-bold text-red-700 font-mono">
                        {parseResult.invalidRows.length} rows
                      </span>
                    </div>
                  </div>

                  {/* Chit capacity warning if file contains more than allowed */}
                  {parseResult.invalidRows.some((r) => r.isOverCapacity) && (
                    <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl flex items-start gap-2.5 text-xs text-amber-900">
                      <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                      <div>
                        <span className="font-bold block">Chit Member Limit Notice</span>
                        <span>
                          This chit allows a maximum of <strong>{totalMembersLimit} members</strong> ({existingCount} currently enrolled).
                          Only the first <strong>{remainingSlots} valid customer{remainingSlots === 1 ? '' : 's'}</strong> can be imported.
                          The remaining excess rows will be safely excluded.
                        </span>
                      </div>
                    </div>
                  )}

                  {/* Preview Table of Valid Customers */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <h5 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                        Customer Preview ({parseResult.validRows.length})
                      </h5>
                      {parseResult.invalidRows.length > 0 && (
                        <button
                          type="button"
                          onClick={() => setShowInvalidList((prev) => !prev)}
                          className="text-xs font-bold text-red-600 hover:underline flex items-center gap-1 cursor-pointer"
                        >
                          <span>{showInvalidList ? 'Hide Issues' : `View ${parseResult.invalidRows.length} Invalid Rows`}</span>
                        </button>
                      )}
                    </div>

                    <div className="border border-slate-200 rounded-xl overflow-hidden max-h-56 overflow-y-auto">
                      <table className="w-full text-left text-xs border-collapse">
                        <thead className="bg-slate-100 text-slate-700 font-bold sticky top-0 uppercase text-[10px]">
                          <tr>
                            <th className="py-2 px-3 w-12 text-center">#</th>
                            <th className="py-2 px-3">Customer Name</th>
                            <th className="py-2 px-3 font-mono">Phone Number</th>
                            <th className="py-2 px-3 text-center">Ticket</th>
                            <th className="py-2 px-3 text-center">Status</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {parseResult.validRows.length === 0 ? (
                            <tr>
                              <td colSpan={5} className="py-6 text-center text-slate-400">
                                No valid customer rows found to import.
                              </td>
                            </tr>
                          ) : (
                            parseResult.validRows.map((r, idx) => (
                              <tr key={idx} className="hover:bg-slate-50 transition-colors">
                                <td className="py-2 px-3 font-mono text-slate-400 text-center">
                                  {idx + 1}
                                </td>
                                <td className="py-2 px-3 font-semibold text-slate-900">
                                  {r.customer_name}
                                </td>
                                <td className="py-2 px-3 font-mono text-slate-700">
                                  {r.phone}
                                </td>
                                <td className="py-2 px-3 font-mono text-slate-600 text-center font-bold">
                                  #{existingCount + idx + 1}
                                </td>
                                <td className="py-2 px-3 text-center">
                                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-700">
                                    NOT LIFTED
                                  </span>
                                </td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* Invalid / Skipped rows drawer */}
                  {showInvalidList && parseResult.invalidRows.length > 0 && (
                    <div className="p-3 bg-red-50/70 border border-red-200 rounded-xl space-y-2 animate-in fade-in duration-150">
                      <span className="text-xs font-bold text-red-900 block">
                        Issues Detected in File:
                      </span>
                      <div className="space-y-1 max-h-32 overflow-y-auto text-xs pr-1">
                        {parseResult.invalidRows.map((inv, idx) => (
                          <div
                            key={idx}
                            className="flex items-center justify-between gap-2 p-1.5 bg-white/80 rounded border border-red-200 text-[11px]"
                          >
                            <span className="font-bold text-slate-800">
                              Row {inv.rowNumber}: {inv.customer_name || '(No Name)'} ({inv.phone || 'No Phone'})
                            </span>
                            <span className="text-red-600 font-semibold shrink-0">
                              {inv.errorMessage}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer Actions */}
        {!importSummary && (
          <div className="bg-slate-50 px-5 py-3.5 border-t border-slate-200 flex items-center justify-between">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-200 rounded-xl transition-colors cursor-pointer"
            >
              Cancel
            </button>

            {parseResult && !parseResult.error && parseResult.validRows.length > 0 && (
              <button
                type="button"
                disabled={isImporting}
                onClick={handleConfirmImport}
                className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold shadow-xs transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                {isImporting ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Importing...</span>
                  </>
                ) : (
                  <>
                    <FileCheck className="w-3.5 h-3.5" />
                    <span>
                      Import {parseResult.validRows.length} Customer
                      {parseResult.validRows.length === 1 ? '' : 's'}
                    </span>
                  </>
                )}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
