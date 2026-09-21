import React, { useState, useId, useEffect, useRef } from 'react';
import {
  X,
  ChevronRight,
  ChevronLeft,
  CheckCircle,
  AlertCircle,
  Users,
  Calendar,
  IndianRupee,
  Layers,
  ArrowRight,
  Copy,
  Sparkles,
  UploadCloud,
  FileSpreadsheet,
  Upload,
  RotateCcw,
  AlertTriangle,
} from 'lucide-react';
import { MONTH_NAMES, calculateEndMonth, getMonthLabel, formatINR } from '../utils/formatters';
import { ChitMonthRule } from '../types';
import { ImportCustomersModal } from './ImportCustomersModal';
import {
  parsePayoutExcelOrCsvFile,
  downloadLiftPayoutTemplate,
  ParsePayoutResult,
} from '../utils/payoutExcelImport';
import { WizardPayoutImportModal } from './WizardPayoutImportModal';

interface NewChitWizardProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (chitId: string) => void;
  onSubmit: (payload: any) => Promise<any>;
}

export const NewChitWizard: React.FC<NewChitWizardProps> = ({
  isOpen,
  onClose,
  onSuccess,
  onSubmit,
}) => {
  // Step Tracker: 1 = Basic, 2 = Members, 3 = Pre-Lift, 4 = Post-Lift, 5 = Chit Value & Lift Payout, 6 = Review
  const [step, setStep] = useState(1);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // STEP 1 State
  const [chitName, setChitName] = useState('');
  const [chitValue, setChitValue] = useState<number>(500000);
  const [totalMonths, setTotalMonths] = useState<number>(25);
  const [totalMembers, setTotalMembers] = useState<number>(25);

  const currentYear = new Date().getFullYear();
  const [startMonthName, setStartMonthName] = useState(MONTH_NAMES[0]); // January
  const [startYear, setStartYear] = useState<number>(currentYear);

  const startMonthStr = `${startMonthName} ${startYear}`;
  // Automatically calculate end month: Start Month + Total Months - 1
  const endMonthStr = calculateEndMonth(startMonthStr, totalMonths);

  // STEP 2 State: Members
  const [members, setMembers] = useState<
    { customer_name: string; phone: string; ticket_number: string }[]
  >([]);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);

  // STEP 3 State: Pre-lift
  const [preLiftSame, setPreLiftSame] = useState<boolean>(true);
  const [preLiftDefaultAmount, setPreLiftDefaultAmount] = useState<number>(16000);
  const [preLiftMonthly, setPreLiftMonthly] = useState<number[]>([]);

  // STEP 4 State: Post-lift
  const [postLiftSame, setPostLiftSame] = useState<boolean>(true);
  const [postLiftDefaultAmount, setPostLiftDefaultAmount] = useState<number>(16000);
  const [postLiftMonthly, setPostLiftMonthly] = useState<number[]>([]);

  // STEP 5 State: Monthly Chit Value & Lift Payout
  const [chitValueSame, setChitValueSame] = useState<boolean>(true);
  const [chitValueDefaultAmount, setChitValueDefaultAmount] = useState<number>(500000);
  const [chitValueMonthly, setChitValueMonthly] = useState<number[]>([]);

  const [liftPayoutSame, setLiftPayoutSame] = useState<boolean>(false);
  const [liftPayoutDefaultAmount, setLiftPayoutDefaultAmount] = useState<number>(350000);
  const [liftPayoutMonthly, setLiftPayoutMonthly] = useState<number[]>([]);

  // Excel Payout Import state for Step 5
  const [importedPayoutFileName, setImportedPayoutFileName] = useState<string | null>(null);
  const [showReplacePayoutConfirm, setShowReplacePayoutConfirm] = useState<boolean>(false);
  const [isPayoutImportModalOpen, setIsPayoutImportModalOpen] = useState<boolean>(false);
  const [payoutParseResult, setPayoutParseResult] = useState<ParsePayoutResult | null>(null);
  const [selectedPayoutFile, setSelectedPayoutFile] = useState<File | null>(null);
  const [isParsingPayoutExcel, setIsParsingPayoutExcel] = useState<boolean>(false);
  const payoutFileInputRef = useRef<HTMLInputElement>(null);

  const handlePayoutImportClick = () => {
    // Check if user already imported or has configured custom non-default amounts
    const hasExistingCustomValues = liftPayoutMonthly.some((val) => val > 0 && val !== liftPayoutDefaultAmount);
    if (importedPayoutFileName || hasExistingCustomValues) {
      setShowReplacePayoutConfirm(true);
    } else {
      payoutFileInputRef.current?.click();
    }
  };

  const handlePayoutFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    await processPayoutFile(file);
    e.target.value = '';
  };

  const processPayoutFile = async (file: File) => {
    setSelectedPayoutFile(file);
    setIsParsingPayoutExcel(true);
    try {
      const res = await parsePayoutExcelOrCsvFile(file, totalMonths);
      setPayoutParseResult(res);
      setIsPayoutImportModalOpen(true);
    } catch (err: any) {
      setError(`Failed to read file: ${err.message || 'Unknown error'}`);
    } finally {
      setIsParsingPayoutExcel(false);
    }
  };

  const handleConfirmPayoutImport = (
    validPayouts: { month_number: number; lift_payout: number }[],
    fileName: string
  ) => {
    setLiftPayoutMonthly((prev) => {
      const next = [...prev];
      validPayouts.forEach((p) => {
        const idx = p.month_number - 1;
        if (idx >= 0 && idx < totalMonths) {
          next[idx] = p.lift_payout;
        }
      });
      return next;
    });
    setImportedPayoutFileName(fileName);
    setLiftPayoutSame(false); // Ensure different payout mode is active
    setIsPayoutImportModalOpen(false);
  };

  const handleDownloadPayoutTemplate = () => {
    downloadLiftPayoutTemplate(totalMonths, liftPayoutMonthly);
  };

  // Sync members list when totalMembers changes
  useEffect(() => {
    setMembers((prev) => {
      const next = [...prev];
      if (next.length < totalMembers) {
        for (let i = next.length; i < totalMembers; i++) {
          next.push({
            customer_name: '',
            phone: '',
            ticket_number: String(i + 1).padStart(2, '0'),
          });
        }
      } else if (next.length > totalMembers) {
        return next.slice(0, totalMembers);
      }
      return next;
    });
  }, [totalMembers]);

  // Sync arrays length when totalMonths changes
  useEffect(() => {
    setPreLiftMonthly((prev) => {
      const arr = new Array(totalMonths).fill(preLiftDefaultAmount);
      for (let i = 0; i < Math.min(prev.length, totalMonths); i++) {
        if (prev[i] !== undefined) arr[i] = prev[i];
      }
      return arr;
    });

    setPostLiftMonthly((prev) => {
      const arr = new Array(totalMonths).fill(postLiftDefaultAmount);
      for (let i = 0; i < Math.min(prev.length, totalMonths); i++) {
        if (prev[i] !== undefined) arr[i] = prev[i];
      }
      return arr;
    });

    setChitValueMonthly((prev) => {
      const arr = new Array(totalMonths).fill(chitValueDefaultAmount);
      for (let i = 0; i < Math.min(prev.length, totalMonths); i++) {
        if (prev[i] !== undefined) arr[i] = prev[i];
      }
      return arr;
    });

    setLiftPayoutMonthly((prev) => {
      const arr = new Array(totalMonths).fill(liftPayoutDefaultAmount);
      for (let i = 0; i < Math.min(prev.length, totalMonths); i++) {
        if (prev[i] !== undefined) arr[i] = prev[i];
      }
      return arr;
    });
  }, [totalMonths]);

  // When default amounts change and "same" is true, sync array
  useEffect(() => {
    if (preLiftSame) {
      setPreLiftMonthly(new Array(totalMonths).fill(preLiftDefaultAmount));
    }
  }, [preLiftSame, preLiftDefaultAmount, totalMonths]);

  useEffect(() => {
    if (postLiftSame) {
      setPostLiftMonthly(new Array(totalMonths).fill(postLiftDefaultAmount));
    }
  }, [postLiftSame, postLiftDefaultAmount, totalMonths]);

  useEffect(() => {
    if (chitValueSame) {
      setChitValueMonthly(new Array(totalMonths).fill(chitValueDefaultAmount));
    }
  }, [chitValueSame, chitValueDefaultAmount, totalMonths]);

  useEffect(() => {
    if (liftPayoutSame) {
      setLiftPayoutMonthly(new Array(totalMonths).fill(liftPayoutDefaultAmount));
    }
  }, [liftPayoutSame, liftPayoutDefaultAmount, totalMonths]);

  // Keep chit value default matched with overall chit value
  useEffect(() => {
    setChitValueDefaultAmount(chitValue);
  }, [chitValue]);

  // Quick preset loader for the prompt's examples (5 Lakhs, 2.5 Lakhs, 3.015 Lakhs)
  const handleLoadExample = (exampleType: '5L' | '2.5L' | '3.015L') => {
    if (exampleType === '5L') {
      setChitName('5 Lakhs Chit');
      setChitValue(500000);
      setTotalMonths(25);
      setTotalMembers(25);
      setPreLiftSame(true);
      setPreLiftDefaultAmount(16000);
      setPostLiftSame(true);
      setPostLiftDefaultAmount(16000);
      setChitValueSame(true);
      setChitValueDefaultAmount(500000);
      // Lift payout schedule graduated
      setLiftPayoutSame(false);
      const graduated = [];
      const basePayout = 310000;
      const step = (500000 - basePayout) / 24;
      for (let i = 0; i < 25; i++) {
        graduated.push(Math.round(basePayout + i * step));
      }
      setLiftPayoutMonthly(graduated);
    } else if (exampleType === '2.5L') {
      setChitName('₹2,50,000 Chit');
      setChitValue(250000);
      setTotalMonths(20);
      setTotalMembers(20);
      setPreLiftSame(false);
      // Example 10: 16000, 15210, 14420... down to 1000
      const preVals = [
        16000, 15210, 14420, 13630, 12840, 12050, 11260, 10470, 9680, 8890,
        8100, 7310, 6520, 5730, 4940, 4150, 3360, 2570, 1780, 1000,
      ];
      setPreLiftMonthly(preVals);
      setPostLiftSame(true);
      setPostLiftDefaultAmount(16000);
      setChitValueSame(true);
      setChitValueDefaultAmount(250000);
      setLiftPayoutSame(false);
      setLiftPayoutMonthly(new Array(20).fill(200000));
    } else if (exampleType === '3.015L') {
      setChitName('₹3,01,500 Chit');
      setChitValue(301500);
      setTotalMonths(25);
      setTotalMembers(25);
      setPreLiftSame(false);
      // Example 11 exact values from user prompt:
      const exactPre = [
        13500, 13000, 12850, 12700, 12550, 12400, 12250, 12100, 11950, 11800,
        11500, 11200, 10900, 10600, 10300, 9850, 9400, 8950, 8500, 8050,
        7600, 7100, 6600, 6100, 5500,
      ];
      setPreLiftMonthly(exactPre);
      setPostLiftSame(true);
      setPostLiftDefaultAmount(13500);
      setChitValueSame(true);
      setChitValueDefaultAmount(301500);
      setLiftPayoutSame(false);
      setLiftPayoutMonthly(new Array(25).fill(240000));
    }
  };

  // Helper to quick-populate demo member names for testing convenience
  const handleQuickPopulateSampleMembers = () => {
    const sampleNames = [
      'Ramesh Kumar', 'Suresh Reddy', 'Venkatesh Rao', 'Anil Sharma', 'Mahesh Varma',
      'Prakash Chandra', 'Rajesh Patel', 'Kiran Cheryala', 'Sunil Joshi', 'Vijay Kumar',
      'Srinivas Murthy', 'Naveen Kumar', 'Satish Babu', 'Ravi Teja', 'Manoj Gowda',
      'Ganesh Hegde', 'Pradeep Shenoy', 'Deepak Nair', 'Mohan Das', 'Kalyan Chakravarthy',
      'Sanjay Gupta', 'Raghuveer Singh', 'Arun Prasad', 'Vinod Nayak', 'Shankar Iyer'
    ];
    setMembers((prev) =>
      prev.map((m, idx) => ({
        ...m,
        customer_name: m.customer_name || sampleNames[idx % sampleNames.length],
        phone: m.phone || `98${String(10000000 + idx * 3719).substring(0, 8)}`,
        ticket_number: String(idx + 1).padStart(2, '0'),
      }))
    );
  };

  // Validation
  const validateStep1 = () => {
    if (!chitName.trim()) {
      setError('Please enter a Chit Name.');
      return false;
    }
    if (chitValue <= 0) {
      setError('Please enter a valid Chit Value.');
      return false;
    }
    if (totalMonths < 1 || totalMonths > 120) {
      setError('Total months must be between 1 and 120.');
      return false;
    }
    if (totalMembers < 1 || totalMembers > 500) {
      setError('Total members must be between 1 and 500.');
      return false;
    }
    setError(null);
    return true;
  };

  const validateStep2 = () => {
    for (let i = 0; i < members.length; i++) {
      if (!members[i].customer_name.trim()) {
        setError(`Member #${i + 1}: Customer Name is mandatory.`);
        return false;
      }
      if (!members[i].phone.trim()) {
        setError(`Member #${i + 1} (${members[i].customer_name}): Phone Number is mandatory.`);
        return false;
      }
    }
    setError(null);
    return true;
  };

  const nextStep = () => {
    if (step === 1 && !validateStep1()) return;
    if (step === 2 && !validateStep2()) return;
    setError(null);
    setStep((s) => Math.min(s + 1, 6));
  };

  const prevStep = () => {
    setError(null);
    setStep((s) => Math.max(s - 1, 1));
  };

  const handleSubmit = async () => {
    try {
      setIsSubmitting(true);
      setError(null);

      // Build Rules array for all months 1..totalMonths
      const rules: ChitMonthRule[] = [];
      for (let m = 1; m <= totalMonths; m++) {
        const idx = m - 1;
        rules.push({
          month_number: m,
          month_name: getMonthLabel(startMonthStr, m),
          pre_lift_payment: preLiftSame ? preLiftDefaultAmount : (preLiftMonthly[idx] || 0),
          post_lift_payment: postLiftSame ? postLiftDefaultAmount : (postLiftMonthly[idx] || 0),
          monthly_chit_value: chitValueSame ? chitValueDefaultAmount : (chitValueMonthly[idx] || chitValue),
          expected_lift_payout: liftPayoutSame ? liftPayoutDefaultAmount : (liftPayoutMonthly[idx] || 0),
        });
      }

      const payload = {
        name: chitName.trim(),
        chit_value: chitValue,
        total_months: totalMonths,
        total_members: totalMembers,
        start_month: startMonthStr,
        end_month: endMonthStr,
        members: members.map((m, idx) => ({
          customer_name: m.customer_name.trim(),
          phone: m.phone.trim(),
          ticket_number: m.ticket_number.trim() || String(idx + 1).padStart(2, '0'),
        })),
        rules,
      };

      const result = await onSubmit(payload);
      onSuccess(result.id);
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to create chit');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div id="new-chit-wizard-backdrop" className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-3 sm:p-4 overflow-y-auto">
      <div id="new-chit-wizard-container" className="bg-white rounded-2xl shadow-2xl max-w-4xl w-full max-h-[92vh] flex flex-col overflow-hidden border border-slate-200 animate-in fade-in zoom-in-95 duration-200">
        {/* Wizard Header */}
        <div className="bg-slate-900 text-white px-6 py-4 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-600 flex items-center justify-center text-white font-bold">
              <Layers className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base sm:text-lg font-bold">New Chit Setup Wizard</h3>
              <p className="text-xs text-slate-300">
                Step {step} of 6: {
                  step === 1 ? 'Basic Details & Auto-End Month' :
                  step === 2 ? `Member Roster (${totalMembers} Members)` :
                  step === 3 ? 'Pre-Lift Monthly Payment' :
                  step === 4 ? 'Post-Lift Monthly Payment' :
                  step === 5 ? 'Monthly Chit Value & Lift Payout Schedule' : 'Review & Confirm'
                }
              </p>
            </div>
          </div>
          <button
            id="close-wizard-btn"
            onClick={onClose}
            className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Wizard Stepper Progress Bar */}
        <div className="bg-slate-100 px-6 py-2.5 border-b border-slate-200 flex items-center justify-between text-xs overflow-x-auto shrink-0">
          {[
            { num: 1, label: 'Basic' },
            { num: 2, label: 'Members' },
            { num: 3, label: 'Pre-Lift' },
            { num: 4, label: 'Post-Lift' },
            { num: 5, label: 'Rules' },
            { num: 6, label: 'Review' },
          ].map((s) => (
            <div key={s.num} className="flex items-center gap-1.5 shrink-0 px-2 py-1">
              <div
                className={`w-6 h-6 rounded-full flex items-center justify-center font-bold text-[11px] ${
                  step === s.num
                    ? 'bg-blue-600 text-white'
                    : step > s.num
                    ? 'bg-emerald-600 text-white'
                    : 'bg-slate-300 text-slate-700'
                }`}
              >
                {step > s.num ? '✓' : s.num}
              </div>
              <span className={`font-semibold ${step === s.num ? 'text-blue-700' : 'text-slate-600'}`}>
                {s.label}
              </span>
            </div>
          ))}
        </div>

        {/* Wizard Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-xl flex items-center gap-2.5 text-sm text-red-700">
              <AlertCircle className="w-5 h-5 shrink-0 text-red-600" />
              <span>{error}</span>
            </div>
          )}

          {/* ---------------- STEP 1: BASIC CHIT DETAILS ---------------- */}
          {step === 1 && (
            <div className="space-y-5 animate-in fade-in duration-150">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-200">
                <div>
                  <h4 className="text-base font-bold text-slate-900">Step 1 — Basic Chit Details</h4>
                  <p className="text-xs text-slate-500">Configure core chit parameters. End month is automatically calculated.</p>
                </div>
                {/* Preset quick templates */}
                <div className="flex items-center gap-1.5 self-start sm:self-auto">
                  <span className="text-[11px] font-semibold text-slate-500">Quick Template:</span>
                  <button
                    type="button"
                    onClick={() => handleLoadExample('5L')}
                    className="px-2 py-1 text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200 rounded-lg hover:bg-blue-100"
                  >
                    5 Lakhs
                  </button>
                  <button
                    type="button"
                    onClick={() => handleLoadExample('2.5L')}
                    className="px-2 py-1 text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-lg hover:bg-emerald-100"
                  >
                    ₹2.5 Lakhs
                  </button>
                  <button
                    type="button"
                    onClick={() => handleLoadExample('3.015L')}
                    className="px-2 py-1 text-xs font-semibold bg-purple-50 text-purple-700 border border-purple-200 rounded-lg hover:bg-purple-100"
                  >
                    ₹3.015L
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* 1. Chit Name */}
                <div className="sm:col-span-2">
                  <label className="block text-sm font-semibold text-slate-800 mb-1">
                    1. Chit Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    id="wizard-chit-name"
                    type="text"
                    required
                    value={chitName}
                    onChange={(e) => setChitName(e.target.value)}
                    placeholder="e.g. 5 Lakhs Chit, Premium Monthly 25"
                    className="w-full px-3.5 py-2.5 bg-white border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 font-medium text-slate-900"
                  />
                </div>

                {/* 2. Chit Value */}
                <div>
                  <label className="block text-sm font-semibold text-slate-800 mb-1">
                    2. Chit Value (₹) <span className="text-red-500">*</span>
                  </label>
                  <div className="relative">
                    <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500 font-bold">₹</span>
                    <input
                      id="wizard-chit-value"
                      type="number"
                      min="1000"
                      step="1000"
                      required
                      value={chitValue}
                      onChange={(e) => setChitValue(parseFloat(e.target.value) || 0)}
                      className="w-full pl-8 pr-4 py-2.5 bg-white border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 font-mono font-bold text-slate-900"
                      placeholder="500000"
                    />
                  </div>
                  <p className="text-xs text-slate-500 mt-1">Formatted: <strong className="text-slate-700">{formatINR(chitValue)}</strong></p>
                </div>

                {/* 3. Total Months */}
                <div>
                  <label className="block text-sm font-semibold text-slate-800 mb-1">
                    3. Total Months <span className="text-red-500">*</span>
                  </label>
                  <input
                    id="wizard-total-months"
                    type="number"
                    min="1"
                    max="120"
                    required
                    value={totalMonths}
                    onChange={(e) => setTotalMonths(parseInt(e.target.value, 10) || 1)}
                    className="w-full px-3.5 py-2.5 bg-white border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 font-bold text-slate-900"
                    placeholder="25"
                  />
                  <p className="text-xs text-slate-500 mt-1">Duration: {totalMonths} monthly cycles</p>
                </div>

                {/* 4. Total Members */}
                <div>
                  <label className="block text-sm font-semibold text-slate-800 mb-1">
                    4. Total Members <span className="text-red-500">*</span>
                  </label>
                  <input
                    id="wizard-total-members"
                    type="number"
                    min="1"
                    max="500"
                    required
                    value={totalMembers}
                    onChange={(e) => setTotalMembers(parseInt(e.target.value, 10) || 1)}
                    className="w-full px-3.5 py-2.5 bg-white border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 font-bold text-slate-900"
                    placeholder="25"
                  />
                  <p className="text-xs text-slate-500 mt-1">Will generate {totalMembers} member slots in Step 2</p>
                </div>

                {/* 5. Start Month */}
                <div>
                  <label className="block text-sm font-semibold text-slate-800 mb-1">
                    5. Start Month <span className="text-red-500">*</span>
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <select
                      id="wizard-start-month"
                      value={startMonthName}
                      onChange={(e) => setStartMonthName(e.target.value)}
                      className="px-3 py-2.5 bg-white border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 font-medium text-slate-900 text-sm"
                    >
                      {MONTH_NAMES.map((m) => (
                        <option key={m} value={m}>
                          {m}
                        </option>
                      ))}
                    </select>
                    <input
                      id="wizard-start-year"
                      type="number"
                      min="2020"
                      max="2050"
                      value={startYear}
                      onChange={(e) => setStartYear(parseInt(e.target.value, 10) || currentYear)}
                      className="px-3 py-2.5 bg-white border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 font-medium text-slate-900 text-sm font-mono"
                    />
                  </div>
                </div>
              </div>

              {/* Automatic End Month Calculation Display */}
              <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="space-y-1">
                  <span className="text-xs font-bold text-blue-900 uppercase tracking-wider flex items-center gap-1.5">
                    <Calendar className="w-4 h-4 text-blue-700" />
                    Automatic End Month Calculation
                  </span>
                  <p className="text-xs text-slate-600">
                    Formula: <code>Start Month ({startMonthStr}) + Total Months ({totalMonths}) - 1</code>
                  </p>
                </div>
                <div className="bg-white px-4 py-2 rounded-xl border border-blue-200 text-right self-start sm:self-auto shadow-xs">
                  <span className="text-[11px] text-slate-500 block">End Month</span>
                  <span className="text-base font-extrabold text-blue-950 font-mono">{endMonthStr}</span>
                </div>
              </div>
            </div>
          )}

          {/* ---------------- STEP 2: MEMBER SETUP ---------------- */}
          {step === 2 && (
            <div className="space-y-4 animate-in fade-in duration-150">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-slate-200">
                <div>
                  <h4 className="text-base font-bold text-slate-900">
                    Step 2 — Member Setup ({members.length} Members)
                  </h4>
                  <p className="text-xs text-slate-500">
                    Customer Name and Phone Number are mandatory. Ticket number is optional.
                  </p>
                </div>
                <div className="flex items-center gap-2 self-start sm:self-auto flex-wrap">
                  <button
                    type="button"
                    id="wizard-import-customers-btn"
                    onClick={() => setIsImportModalOpen(true)}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-50 border border-emerald-300 text-emerald-700 rounded-xl text-xs font-bold hover:bg-emerald-100 transition-colors cursor-pointer shadow-2xs"
                  >
                    <UploadCloud className="w-3.5 h-3.5 text-emerald-600" />
                    <span>Import Customers from Excel</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleQuickPopulateSampleMembers}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-50 border border-indigo-200 text-indigo-700 rounded-xl text-xs font-bold hover:bg-indigo-100 transition-colors"
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>Auto-Fill Names (For Testing)</span>
                  </button>
                </div>
              </div>

              <div className="max-h-[50vh] overflow-y-auto space-y-2 pr-1">
                {members.map((m, idx) => (
                  <div
                    key={idx}
                    className="p-3 bg-slate-50 border border-slate-200 rounded-xl grid grid-cols-1 sm:grid-cols-12 gap-2.5 items-center hover:bg-slate-100/60 transition-colors"
                  >
                    <div className="sm:col-span-1 text-xs font-bold text-slate-500 flex items-center gap-1">
                      <span className="w-6 h-6 rounded-full bg-slate-200 flex items-center justify-center text-[11px]">
                        {idx + 1}
                      </span>
                    </div>
                    <div className="sm:col-span-5">
                      <label className="block text-[11px] font-semibold text-slate-600 sm:hidden">Customer Name *</label>
                      <input
                        type="text"
                        required
                        value={m.customer_name}
                        onChange={(e) => {
                          const val = e.target.value;
                          setMembers((prev) => {
                            const next = [...prev];
                            next[idx].customer_name = val;
                            return next;
                          });
                        }}
                        placeholder={`Member ${idx + 1} Name *`}
                        className="w-full px-3 py-1.5 bg-white border border-slate-300 rounded-lg text-sm font-medium focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                    <div className="sm:col-span-4">
                      <label className="block text-[11px] font-semibold text-slate-600 sm:hidden">Phone *</label>
                      <input
                        type="text"
                        required
                        value={m.phone}
                        onChange={(e) => {
                          const val = e.target.value;
                          setMembers((prev) => {
                            const next = [...prev];
                            next[idx].phone = val;
                            return next;
                          });
                        }}
                        placeholder="Phone Number *"
                        className="w-full px-3 py-1.5 bg-white border border-slate-300 rounded-lg text-sm font-medium focus:ring-2 focus:ring-blue-500 font-mono"
                      />
                    </div>
                    <div className="sm:col-span-2">
                      <label className="block text-[11px] font-semibold text-slate-600 sm:hidden">Ticket #</label>
                      <input
                        type="text"
                        value={m.ticket_number}
                        onChange={(e) => {
                          const val = e.target.value;
                          setMembers((prev) => {
                            const next = [...prev];
                            next[idx].ticket_number = val;
                            return next;
                          });
                        }}
                        placeholder="Ticket #"
                        className="w-full px-3 py-1.5 bg-white border border-slate-300 rounded-lg text-sm font-mono text-center focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ---------------- STEP 3: PRE-LIFT PAYMENT SETUP ---------------- */}
          {step === 3 && (
            <div className="space-y-5 animate-in fade-in duration-150">
              <div className="pb-3 border-b border-slate-200">
                <h4 className="text-base font-bold text-slate-900">Step 3 — Pre-Lift Monthly Payment</h4>
                <p className="text-xs text-slate-500">
                  Amount paid monthly by customers who have not yet lifted the chit.
                </p>
              </div>

              {/* Mode Selector */}
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <label className="block text-sm font-bold text-slate-900 mb-1">
                      Pre-Lift Monthly Payment Amount
                    </label>
                    <p className="text-xs text-slate-500">
                      Standard monthly contribution prior to lifting
                    </p>
                  </div>
                  <div className="relative w-full sm:w-56">
                    <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500 font-bold">₹</span>
                    <input
                      type="number"
                      min="1"
                      step="50"
                      value={preLiftDefaultAmount}
                      onChange={(e) => setPreLiftDefaultAmount(parseFloat(e.target.value) || 0)}
                      className="w-full pl-8 pr-4 py-2 bg-white border border-slate-300 rounded-xl font-mono font-bold text-slate-900 text-base"
                    />
                  </div>
                </div>

                <div className="flex items-center gap-3 pt-2 border-t border-slate-200">
                  <button
                    type="button"
                    onClick={() => setPreLiftSame(!preLiftSame)}
                    className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all ${
                      preLiftSame
                        ? 'bg-blue-600 text-white shadow-xs'
                        : 'bg-white border border-slate-300 text-slate-700 hover:bg-slate-100'
                    }`}
                  >
                    <CheckCircle className={`w-4 h-4 ${preLiftSame ? 'text-white' : 'text-slate-400'}`} />
                    <span>[ USE SAME AMOUNT FOR ALL MONTHS ({formatINR(preLiftDefaultAmount)}) ]</span>
                  </button>
                  <span className="text-xs text-slate-500">or configure month-by-month below</span>
                </div>
              </div>

              {/* Manual Month-by-Month Table */}
              {!preLiftSame ? (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-700 uppercase">
                      Manual Month-Wise Pre-Lift Payment Table
                    </span>
                    <span className="text-xs text-slate-500">{totalMonths} Months</span>
                  </div>
                  <div className="max-h-[45vh] overflow-y-auto border border-slate-200 rounded-xl">
                    <table className="w-full text-xs text-left">
                      <thead className="bg-slate-100 text-slate-700 font-semibold sticky top-0 border-b border-slate-200">
                        <tr>
                          <th className="py-2.5 px-4 w-24">Month</th>
                          <th className="py-2.5 px-4">Month Name</th>
                          <th className="py-2.5 px-4 text-right">Pre-Lift Payment (₹)</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {Array.from({ length: totalMonths }).map((_, idx) => (
                          <tr key={idx} className="hover:bg-slate-50">
                            <td className="py-2 px-4 font-bold text-slate-700">Month {idx + 1}</td>
                            <td className="py-2 px-4 text-slate-600">{getMonthLabel(startMonthStr, idx + 1)}</td>
                            <td className="py-2 px-4 text-right">
                              <input
                                type="number"
                                min="0"
                                value={preLiftMonthly[idx] !== undefined ? preLiftMonthly[idx] : preLiftDefaultAmount}
                                onChange={(e) => {
                                  const val = parseFloat(e.target.value) || 0;
                                  setPreLiftMonthly((prev) => {
                                    const next = [...prev];
                                    next[idx] = val;
                                    return next;
                                  });
                                }}
                                className="w-36 px-2.5 py-1 text-right font-mono font-bold text-slate-900 bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                              />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : (
                <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3.5 text-xs text-emerald-900 flex items-center gap-2">
                  <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>
                    All {totalMonths} months will automatically use <strong>{formatINR(preLiftDefaultAmount)}</strong> as pre-lift payment.
                  </span>
                </div>
              )}
            </div>
          )}

          {/* ---------------- STEP 4: POST-LIFT PAYMENT SETUP ---------------- */}
          {step === 4 && (
            <div className="space-y-5 animate-in fade-in duration-150">
              <div className="pb-3 border-b border-slate-200">
                <h4 className="text-base font-bold text-slate-900">Step 4 — Post-Lift Monthly Payment</h4>
                <p className="text-xs text-slate-500">
                  Amount paid monthly by customers after they have lifted their chit.
                </p>
              </div>

              {/* Mode Selector */}
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <label className="block text-sm font-bold text-slate-900 mb-1">
                      Post-Lift Monthly Payment Amount
                    </label>
                    <p className="text-xs text-slate-500">
                      Standard monthly contribution applied from the month following the lift
                    </p>
                  </div>
                  <div className="relative w-full sm:w-56">
                    <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500 font-bold">₹</span>
                    <input
                      type="number"
                      min="1"
                      step="50"
                      value={postLiftDefaultAmount}
                      onChange={(e) => setPostLiftDefaultAmount(parseFloat(e.target.value) || 0)}
                      className="w-full pl-8 pr-4 py-2 bg-white border border-slate-300 rounded-xl font-mono font-bold text-slate-900 text-base"
                    />
                  </div>
                </div>

                <div className="flex items-center gap-3 pt-2 border-t border-slate-200">
                  <button
                    type="button"
                    onClick={() => setPostLiftSame(!postLiftSame)}
                    className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all ${
                      postLiftSame
                        ? 'bg-blue-600 text-white shadow-xs'
                        : 'bg-white border border-slate-300 text-slate-700 hover:bg-slate-100'
                    }`}
                  >
                    <CheckCircle className={`w-4 h-4 ${postLiftSame ? 'text-white' : 'text-slate-400'}`} />
                    <span>[ USE SAME AMOUNT FOR ALL MONTHS ({formatINR(postLiftDefaultAmount)}) ]</span>
                  </button>
                  <span className="text-xs text-slate-500">or configure month-by-month</span>
                </div>
              </div>

              {/* Manual Month-by-Month Table */}
              {!postLiftSame ? (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-700 uppercase">
                      Manual Month-Wise Post-Lift Payment Table
                    </span>
                    <span className="text-xs text-slate-500">{totalMonths} Months</span>
                  </div>
                  <div className="max-h-[45vh] overflow-y-auto border border-slate-200 rounded-xl">
                    <table className="w-full text-xs text-left">
                      <thead className="bg-slate-100 text-slate-700 font-semibold sticky top-0 border-b border-slate-200">
                        <tr>
                          <th className="py-2.5 px-4 w-24">Month</th>
                          <th className="py-2.5 px-4">Month Name</th>
                          <th className="py-2.5 px-4 text-right">Post-Lift Payment (₹)</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {Array.from({ length: totalMonths }).map((_, idx) => (
                          <tr key={idx} className="hover:bg-slate-50">
                            <td className="py-2 px-4 font-bold text-slate-700">Month {idx + 1}</td>
                            <td className="py-2 px-4 text-slate-600">{getMonthLabel(startMonthStr, idx + 1)}</td>
                            <td className="py-2 px-4 text-right">
                              <input
                                type="number"
                                min="0"
                                value={postLiftMonthly[idx] !== undefined ? postLiftMonthly[idx] : postLiftDefaultAmount}
                                onChange={(e) => {
                                  const val = parseFloat(e.target.value) || 0;
                                  setPostLiftMonthly((prev) => {
                                    const next = [...prev];
                                    next[idx] = val;
                                    return next;
                                  });
                                }}
                                className="w-36 px-2.5 py-1 text-right font-mono font-bold text-slate-900 bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                              />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : (
                <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3.5 text-xs text-emerald-900 flex items-center gap-2">
                  <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>
                    All {totalMonths} months will use <strong>{formatINR(postLiftDefaultAmount)}</strong> for post-lift members.
                  </span>
                </div>
              )}
            </div>
          )}

          {/* ---------------- STEP 5: MONTHLY CHIT VALUE & LIFT PAYOUT SCHEDULE ---------------- */}
          {step === 5 && (
            <div className="space-y-6 animate-in fade-in duration-150">
              <div className="pb-3 border-b border-slate-200">
                <h4 className="text-base font-bold text-slate-900">
                  Step 5 — Monthly Chit Value & Lift Payout Schedule
                </h4>
                <p className="text-xs text-slate-500">
                  Configure the total Chit Pool Value and Expected Lift Disbursal per month.
                </p>
              </div>

              {/* SECTION A: Monthly Chit Value */}
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <h5 className="text-sm font-bold text-slate-900">MONTHLY CHIT VALUE</h5>
                    <p className="text-xs text-slate-500">Gross chit fund value for each month</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setChitValueSame(!chitValueSame)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                        chitValueSame
                          ? 'bg-blue-600 text-white'
                          : 'bg-white border border-slate-300 text-slate-700'
                      }`}
                    >
                      [ SAME CHIT VALUE FOR ALL MONTHS ({formatINR(chitValueDefaultAmount)}) ]
                    </button>
                  </div>
                </div>

                {!chitValueSame && (
                  <div className="max-h-40 overflow-y-auto border border-slate-200 rounded-lg">
                    <table className="w-full text-xs text-left">
                      <thead className="bg-slate-100 sticky top-0">
                        <tr>
                          <th className="p-2">Month</th>
                          <th className="p-2 text-right">Chit Value (₹)</th>
                        </tr>
                      </thead>
                      <tbody>
                        {Array.from({ length: totalMonths }).map((_, idx) => (
                          <tr key={idx} className="border-t border-slate-100">
                            <td className="p-2 font-medium">Month {idx + 1} ({getMonthLabel(startMonthStr, idx + 1)})</td>
                            <td className="p-2 text-right">
                              <input
                                type="number"
                                value={chitValueMonthly[idx] || chitValueDefaultAmount}
                                onChange={(e) => {
                                  const val = parseFloat(e.target.value) || 0;
                                  setChitValueMonthly((prev) => {
                                    const next = [...prev];
                                    next[idx] = val;
                                    return next;
                                  });
                                }}
                                className="w-32 px-2 py-1 text-right font-mono bg-white border border-slate-300 rounded"
                              />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* SECTION B: Lift Payout Schedule */}
              <div className="bg-purple-50/60 border border-purple-200 rounded-xl p-4 sm:p-5 space-y-4">
                {/* Section Header */}
                <div>
                  <h5 className="text-sm font-bold text-purple-950 uppercase tracking-wide">
                    AMOUNT RECEIVED AFTER CHIT LIFTING (LIFT PAYOUT)
                  </h5>
                  <p className="text-xs text-purple-800 mt-0.5">
                    Disbursal amount received by the customer lifting the chit in each month
                  </p>
                </div>

                {/* Radio Options: SAME PAYOUT FOR ALL MONTHS vs DIFFERENT PAYOUT FOR EVERY MONTH */}
                <div className="flex flex-col sm:flex-row sm:items-center gap-4 sm:gap-6 bg-white/90 p-3.5 rounded-xl border border-purple-200 shadow-xs">
                  <label className="flex items-center gap-2.5 cursor-pointer text-xs font-bold text-slate-800 hover:text-purple-900 transition-colors">
                    <input
                      type="radio"
                      name="liftPayoutOption"
                      checked={liftPayoutSame}
                      onChange={() => setLiftPayoutSame(true)}
                      className="w-4 h-4 text-purple-600 focus:ring-purple-500 border-slate-300"
                    />
                    <span>SAME PAYOUT FOR ALL MONTHS</span>
                  </label>

                  <label className="flex items-center gap-2.5 cursor-pointer text-xs font-bold text-slate-800 hover:text-purple-900 transition-colors">
                    <input
                      type="radio"
                      name="liftPayoutOption"
                      checked={!liftPayoutSame}
                      onChange={() => setLiftPayoutSame(false)}
                      className="w-4 h-4 text-purple-600 focus:ring-purple-500 border-slate-300"
                    />
                    <span>DIFFERENT PAYOUT FOR EVERY MONTH</span>
                  </label>
                </div>

                {/* Option 1: SAME PAYOUT FOR ALL MONTHS */}
                {liftPayoutSame ? (
                  <div className="bg-white/90 border border-purple-200 rounded-xl p-4 space-y-3 shadow-xs">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div>
                        <label className="block text-xs font-bold text-slate-800 mb-0.5">
                          Standard Lift Payout Amount
                        </label>
                        <p className="text-[11px] text-slate-500">
                          Applied uniformly to all {totalMonths} months
                        </p>
                      </div>
                      <div className="relative w-full sm:w-56">
                        <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500 font-bold">₹</span>
                        <input
                          type="number"
                          min="0"
                          value={liftPayoutDefaultAmount}
                          onChange={(e) => setLiftPayoutDefaultAmount(parseFloat(e.target.value) || 0)}
                          className="w-full pl-8 pr-4 py-2 bg-white border border-purple-300 rounded-xl font-mono font-bold text-purple-950 text-base focus:ring-2 focus:ring-purple-500"
                        />
                      </div>
                    </div>
                    <div className="text-xs text-purple-800 flex items-center gap-2 pt-1 border-t border-purple-100">
                      <CheckCircle className="w-4 h-4 text-purple-600 shrink-0" />
                      <span>
                        All {totalMonths} months will automatically use <strong>{formatINR(liftPayoutDefaultAmount)}</strong> as the lift payout amount.
                      </span>
                    </div>
                  </div>
                ) : (
                  /* Option 2: DIFFERENT PAYOUT FOR EVERY MONTH */
                  <div className="space-y-4">
                    {/* Excel Import & Download Template Panel */}
                    <div className="bg-white/95 border border-purple-200 rounded-xl p-4 space-y-3 shadow-xs">
                      <div className="flex flex-wrap items-center gap-3">
                        <button
                          id="wizard-import-lift-payouts-btn"
                          type="button"
                          onClick={handlePayoutImportClick}
                          disabled={isParsingPayoutExcel}
                          className="flex items-center gap-2 px-4 py-2.5 bg-purple-700 hover:bg-purple-800 active:bg-purple-900 text-white rounded-xl text-xs font-bold shadow-xs hover:shadow transition-all disabled:opacity-50"
                        >
                          {importedPayoutFileName ? (
                            <>
                              <RotateCcw className="w-4 h-4" />
                              <span>RE-IMPORT EXCEL</span>
                            </>
                          ) : (
                            <>
                              <Upload className="w-4 h-4" />
                              <span>📥 IMPORT PAYOUTS FROM EXCEL</span>
                            </>
                          )}
                        </button>

                        <button
                          id="wizard-download-lift-template-btn"
                          type="button"
                          onClick={handleDownloadPayoutTemplate}
                          className="flex items-center gap-2 px-4 py-2.5 bg-white hover:bg-purple-50 text-purple-900 border border-purple-300 rounded-xl text-xs font-bold transition-all shadow-xs"
                        >
                          <FileSpreadsheet className="w-4 h-4 text-purple-700" />
                          <span>📄 DOWNLOAD EXCEL TEMPLATE</span>
                        </button>
                      </div>

                      {/* Required Explanatory text */}
                      <p className="text-xs text-slate-600 leading-relaxed">
                        Import different lift payout amounts for each month from Excel.
                        <br />
                        <span className="text-slate-500 italic">
                          Example: Month 1 ₹3,49,999, Month 2 ₹3,50,000, Month 3 ₹3,48,500...
                        </span>
                      </p>

                      {/* Status indicator if file was imported */}
                      {importedPayoutFileName && (
                        <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-900 flex flex-col sm:flex-row sm:items-center justify-between gap-1.5">
                          <span className="flex items-center gap-2 font-medium">
                            <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0" />
                            <span>
                              Imported from: <strong className="text-emerald-950">{importedPayoutFileName}</strong> ({totalMonths} months populated)
                            </span>
                          </span>
                          <span className="text-[11px] text-emerald-700 font-semibold bg-emerald-100/70 px-2 py-0.5 rounded-md self-start sm:self-auto">
                            All amounts remain editable below
                          </span>
                        </div>
                      )}
                    </div>

                    {/* Month-by-Month Editable Table */}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between px-1">
                        <span className="text-xs font-bold text-slate-700 uppercase tracking-wide">
                          Month-by-Month Payout Table ({totalMonths} Months)
                        </span>
                        <span className="text-xs text-slate-500">
                          Editable inputs • Exact values saved to rules
                        </span>
                      </div>

                      <div className="max-h-64 overflow-y-auto border border-purple-200 bg-white rounded-xl shadow-xs">
                        <table className="w-full text-xs text-left">
                          <thead className="bg-purple-100/70 text-purple-950 font-semibold sticky top-0 border-b border-purple-200 z-10">
                            <tr>
                              <th className="py-2.5 px-4 w-24">Month</th>
                              <th className="py-2.5 px-4">Calendar Month</th>
                              <th className="py-2.5 px-4 text-right">Configured Lift Payout (₹)</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-purple-50">
                            {Array.from({ length: totalMonths }).map((_, idx) => {
                              const val = liftPayoutMonthly[idx] !== undefined ? liftPayoutMonthly[idx] : 0;
                              return (
                                <tr key={idx} className="hover:bg-purple-50/40 transition-colors">
                                  <td className="py-2 px-4 font-bold text-slate-800">Month {idx + 1}</td>
                                  <td className="py-2 px-4 text-slate-600 font-medium">
                                    {getMonthLabel(startMonthStr, idx + 1)}
                                  </td>
                                  <td className="py-2 px-4 text-right">
                                    <div className="inline-flex items-center gap-2">
                                      <span className="text-[11px] text-slate-400 font-mono hidden sm:inline">
                                        {val > 0 ? formatINR(val) : '—'}
                                      </span>
                                      <div className="relative">
                                        <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-purple-700 text-xs font-bold">₹</span>
                                        <input
                                          id={`wizard-lift-payout-month-${idx + 1}`}
                                          type="number"
                                          min="0"
                                          value={val}
                                          onChange={(e) => {
                                            const num = parseFloat(e.target.value) || 0;
                                            setLiftPayoutMonthly((prev) => {
                                              const next = [...prev];
                                              next[idx] = num;
                                              return next;
                                            });
                                          }}
                                          className="w-36 pl-6 pr-2.5 py-1 text-right font-mono font-bold text-purple-950 bg-purple-50/20 border border-purple-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:bg-white"
                                        />
                                      </div>
                                    </div>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ---------------- STEP 6: REVIEW & CONFIRM ---------------- */}
          {step === 6 && (
            <div className="space-y-5 animate-in fade-in duration-150">
              <div className="pb-3 border-b border-slate-200">
                <h4 className="text-base font-bold text-slate-900">Step 6 — Review & Confirm Chit Setup</h4>
                <p className="text-xs text-slate-500">
                  Verify the configuration before creating. All monthly dues schedules will be securely initialized in the database.
                </p>
              </div>

              {/* Core Chit Summary Card */}
              <div className="bg-slate-900 text-white rounded-xl p-5 grid grid-cols-2 sm:grid-cols-4 gap-4">
                <div>
                  <span className="text-xs text-slate-400 block uppercase">Chit Name</span>
                  <span className="text-base font-bold">{chitName}</span>
                </div>
                <div>
                  <span className="text-xs text-slate-400 block uppercase">Chit Value</span>
                  <span className="text-base font-bold font-mono text-emerald-400">{formatINR(chitValue)}</span>
                </div>
                <div>
                  <span className="text-xs text-slate-400 block uppercase">Duration</span>
                  <span className="text-sm font-semibold">{totalMonths} Months</span>
                  <span className="text-[11px] text-slate-400 block">{startMonthStr} – {endMonthStr}</span>
                </div>
                <div>
                  <span className="text-xs text-slate-400 block uppercase">Total Members</span>
                  <span className="text-base font-bold">{members.length} Members</span>
                </div>
              </div>

              {/* Monthly Rule Snapshot Preview */}
              <div>
                <h5 className="text-xs font-bold text-slate-700 uppercase mb-2">Month-by-Month Rules Preview</h5>
                <div className="max-h-48 overflow-y-auto border border-slate-200 rounded-xl">
                  <table className="w-full text-xs text-left">
                    <thead className="bg-slate-100 text-slate-700 font-semibold sticky top-0">
                      <tr>
                        <th className="py-2 px-3">Month</th>
                        <th className="py-2 px-3">Calendar Month</th>
                        <th className="py-2 px-3 text-right">Pre-Lift Due</th>
                        <th className="py-2 px-3 text-right">Post-Lift Due</th>
                        <th className="py-2 px-3 text-right">Chit Value</th>
                        <th className="py-2 px-3 text-right">Lift Payout</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {Array.from({ length: totalMonths }).map((_, idx) => {
                        const pre = preLiftSame ? preLiftDefaultAmount : (preLiftMonthly[idx] || 0);
                        const post = postLiftSame ? postLiftDefaultAmount : (postLiftMonthly[idx] || 0);
                        const cv = chitValueSame ? chitValueDefaultAmount : (chitValueMonthly[idx] || chitValue);
                        const lp = liftPayoutSame ? liftPayoutDefaultAmount : (liftPayoutMonthly[idx] || 0);

                        return (
                          <tr key={idx} className="hover:bg-slate-50">
                            <td className="py-1.5 px-3 font-bold text-slate-800">Month {idx + 1}</td>
                            <td className="py-1.5 px-3 text-slate-600">{getMonthLabel(startMonthStr, idx + 1)}</td>
                            <td className="py-1.5 px-3 text-right font-mono font-medium text-slate-900">{formatINR(pre)}</td>
                            <td className="py-1.5 px-3 text-right font-mono font-medium text-purple-900">{formatINR(post)}</td>
                            <td className="py-1.5 px-3 text-right font-mono text-slate-700">{formatINR(cv)}</td>
                            <td className="py-1.5 px-3 text-right font-mono text-slate-700">{formatINR(lp)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Wizard Footer Controls */}
        <div className="bg-slate-50 px-6 py-4 border-t border-slate-200 flex items-center justify-between shrink-0">
          <div>
            {step > 1 ? (
              <button
                id="wizard-prev-btn"
                type="button"
                onClick={prevStep}
                disabled={isSubmitting}
                className="px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-200 rounded-xl transition-colors flex items-center gap-1.5"
              >
                <ChevronLeft className="w-4 h-4" />
                Previous
              </button>
            ) : (
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-sm font-semibold text-slate-500 hover:bg-slate-200 rounded-xl transition-colors"
              >
                Cancel
              </button>
            )}
          </div>

          <div>
            {step < 6 ? (
              <button
                id="wizard-next-btn"
                type="button"
                onClick={nextStep}
                className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white text-sm font-bold rounded-xl shadow-xs transition-colors flex items-center gap-2"
              >
                <span>Continue</span>
                <ChevronRight className="w-4 h-4" />
              </button>
            ) : (
              <button
                id="wizard-submit-btn"
                type="button"
                onClick={handleSubmit}
                disabled={isSubmitting}
                className="px-7 py-2.5 bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white text-sm font-bold rounded-xl shadow-sm hover:shadow transition-all flex items-center gap-2 disabled:opacity-50"
              >
                {isSubmitting ? (
                  <span>Initializing Chit & Dues...</span>
                ) : (
                  <>
                    <CheckCircle className="w-4 h-4" />
                    <span>CREATE CHIT FUND NOW</span>
                  </>
                )}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Excel Customer Import Modal for New Chit Wizard */}
      <ImportCustomersModal
        isOpen={isImportModalOpen}
        onClose={() => setIsImportModalOpen(false)}
        chitName={chitName || 'New Chit'}
        totalMembersLimit={totalMembers}
        existingMembers={[]}
        onImportToState={(importedList) => {
          setMembers((prev) => {
            const next = [...prev];
            importedList.forEach((imp, idx) => {
              if (idx < next.length) {
                next[idx] = {
                  customer_name: imp.customer_name,
                  phone: imp.phone,
                  ticket_number: imp.ticket_number || String(idx + 1).padStart(2, '0'),
                };
              }
            });
            return next;
          });
        }}
      />

      {/* Hidden File Input for Excel Lift Payout Import */}
      <input
        type="file"
        ref={payoutFileInputRef}
        accept=".xlsx,.xls,.csv"
        onChange={handlePayoutFileSelected}
        className="hidden"
      />

      {/* Replace Confirmation Modal */}
      {showReplacePayoutConfirm && (
        <div
          id="wizard-replace-payout-confirm-modal"
          className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in duration-150"
        >
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200 space-y-4">
            <div className="flex items-center gap-3 text-amber-600">
              <div className="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center shrink-0">
                <AlertTriangle className="w-5 h-5 text-amber-700" />
              </div>
              <h4 className="text-base font-bold text-slate-900">Replace existing payout schedule?</h4>
            </div>
            <p className="text-xs text-slate-600 leading-relaxed">
              You already have configured payout amounts for this chit. Importing another Excel file will replace the current payout values.
            </p>
            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setShowReplacePayoutConfirm(false)}
                className="px-4 py-2 border border-slate-300 rounded-xl text-xs font-bold text-slate-700 hover:bg-slate-100 transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowReplacePayoutConfirm(false);
                  payoutFileInputRef.current?.click();
                }}
                className="px-4 py-2 bg-purple-700 hover:bg-purple-800 text-white rounded-xl text-xs font-bold shadow-xs transition-colors"
              >
                Replace
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Wizard Payout Import & Preview Modal */}
      {isPayoutImportModalOpen && payoutParseResult && selectedPayoutFile && (
        <WizardPayoutImportModal
          isOpen={isPayoutImportModalOpen}
          onClose={() => setIsPayoutImportModalOpen(false)}
          fileName={selectedPayoutFile.name}
          parseResult={payoutParseResult}
          totalMonths={totalMonths}
          startMonthStr={startMonthStr}
          onConfirmImport={handleConfirmPayoutImport}
          onSelectDifferentFile={processPayoutFile}
        />
      )}
    </div>
  );
};
