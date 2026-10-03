import React, { useState, useEffect } from 'react';
import { X, AlertCircle, Calendar, CreditCard, FileText, Hash, CheckCircle2, Clock, Award } from 'lucide-react';
import { Chit, Member, ChitMonthRule, PaymentMethod } from '../types';
import { formatDDMMYYYY, toISODateInput, formatINR } from '../utils/formatters';

interface LiftModalProps {
  chit?: Chit | null;
  chitId: string;
  chitName: string;
  members: Member[];
  rules: ChitMonthRule[];
  defaultMonth?: number;
  selectedMemberId?: string;
  onClose: () => void;
  onSuccess: () => void;
  onSubmit: (payload: {
    member_id: string;
    lift_month: number;
    lift_amount_received: number;
    lift_amount?: number;
    configured_lift_payout?: number;
    initial_amount_paid?: number;
    lift_date: string;
    payment_method: string;
    reference_number?: string;
    notes?: string;
  }) => Promise<void>;
}

const PAYMENT_METHODS: PaymentMethod[] = [
  'Cash',
  'UPI',
  'PhonePe',
  'Google Pay',
  'Bank Transfer',
  'Cheque',
  'Other',
];

export const LiftModal: React.FC<LiftModalProps> = ({
  chit,
  chitId,
  chitName,
  members,
  rules,
  defaultMonth = 1,
  selectedMemberId,
  onClose,
  onSuccess,
  onSubmit,
}) => {
  const [memberId, setMemberId] = useState(selectedMemberId || '');
  const totalMonths = chit?.total_months || (rules.length > 0 ? rules.length : 25);

  // Lift fields
  const [liftMonth, setLiftMonth] = useState<number | ''>('');
  const [configuredPayout, setConfiguredPayout] = useState<number | string>('');
  const [initialAmountPaid, setInitialAmountPaid] = useState<number | string>('');
  const [liftDate, setLiftDate] = useState<string>(() => new Date().toISOString().split('T')[0]);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod | string>('Cash');
  const [referenceNumber, setReferenceNumber] = useState<string>('');
  const [notes, setNotes] = useState<string>('');

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Sync member selection
  useEffect(() => {
    if (selectedMemberId) {
      setMemberId(selectedMemberId);
    } else if (!memberId && members.length > 0) {
      const unlifted = members.find((m) => m.lift_status !== 'lifted');
      setMemberId(unlifted ? unlifted.id : members[0].id);
    }
  }, [selectedMemberId, members, memberId]);

  const selectedMember = members.find((m) => m.id === memberId);
  const isEditing = selectedMember?.lift_status === 'lifted';

  // Initialize or pre-fill existing lift details if customer is ALREADY lifted (Edit Lift mode)
  useEffect(() => {
    if (selectedMember?.lift_status === 'lifted') {
      if (selectedMember.lift_month) {
        setLiftMonth(selectedMember.lift_month);
      }
      const existingConfigured = selectedMember.lift_amount ?? selectedMember.lift_amount_received ?? chit?.chit_value ?? 0;
      const existingPaid = selectedMember.lift_amount_received ?? existingConfigured;
      setConfiguredPayout(existingConfigured);
      setInitialAmountPaid(existingPaid);

      if (selectedMember.lift_date) {
        setLiftDate(toISODateInput(selectedMember.lift_date));
      } else {
        setLiftDate(new Date().toISOString().split('T')[0]);
      }
      const existingMethod = selectedMember.payment_method || selectedMember.lift_payment_method || 'Cash';
      setPaymentMethod(existingMethod);
      const existingRef = selectedMember.reference_number || selectedMember.lift_reference_number || '';
      setReferenceNumber(existingRef);
      const existingNotes = selectedMember.lift_notes || '';
      setNotes(existingNotes);
    } else {
      // New lift: Lift Month initially blank - user selects Lift Month
      setLiftMonth('');
      setConfiguredPayout('');
      setInitialAmountPaid('');
      setLiftDate(new Date().toISOString().split('T')[0]);
      setPaymentMethod('Cash');
      setReferenceNumber('');
      setNotes('');
    }
  }, [selectedMember, defaultMonth, rules, totalMonths, memberId, members, chit?.chit_value]);

  // When lift month changes, automatically suggest configured payout from rules or chit value
  const handleMonthChange = (monthVal: string) => {
    if (monthVal === '') {
      setLiftMonth('');
      if (!isEditing) {
        setConfiguredPayout('');
        setInitialAmountPaid('');
      }
    } else {
      const num = parseInt(monthVal, 10);
      setLiftMonth(num);
      const currentRule = rules.find((r) => r.month_number === num);
      const defaultPayout = currentRule && currentRule.expected_lift_payout > 0
        ? currentRule.expected_lift_payout
        : (chit?.chit_value || 0);

      if (!isEditing || !configuredPayout) {
        setConfiguredPayout(defaultPayout);
        setInitialAmountPaid(defaultPayout);
      }
    }
    setError(null);
  };

  // Check if selected month is already assigned to another customer
  const occupyingMember =
    typeof liftMonth === 'number'
      ? members.find(
          (m) => m.lift_status === 'lifted' && m.lift_month === liftMonth && m.id !== memberId
        )
      : null;
  const isMonthOccupied = !!occupyingMember;

  // Live calculations
  const numConfigured = Number(configuredPayout) || 0;
  const numInitialPaid = Number(initialAmountPaid) || 0;
  const numRemaining = Math.max(0, numConfigured - numInitialPaid);
  const payoutStatus: 'PAID' | 'PARTIAL' = numRemaining <= 0 ? 'PAID' : 'PARTIAL';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;
    setError(null);

    // 1. Validation for Customer
    if (!memberId) {
      setError('Please select a customer.');
      return;
    }

    // 2. Validation for Lift Month
    if (liftMonth === '' || typeof liftMonth !== 'number' || liftMonth < 1) {
      setError('Please select a lift month.');
      return;
    }
    if (isMonthOccupied) {
      setError(`Month ${liftMonth} is already assigned to ${occupyingMember?.customer_name || 'another customer'}.`);
      return;
    }

    // 3. Validation for Lift Date
    if (!liftDate || liftDate.trim() === '') {
      setError('Please select lift date.');
      return;
    }

    // 4. Validation for Configured Lift Payout
    if (numConfigured <= 0) {
      setError('Please enter a valid configured lift payout amount greater than zero.');
      return;
    }

    // 5. Validation for Initial Amount Paid
    if (numInitialPaid < 0) {
      setError('Initial payment cannot be negative.');
      return;
    }

    if (numInitialPaid > numConfigured) {
      setError(
        `Initial payment cannot exceed the configured lift payout of ${formatINR(numConfigured)}.`
      );
      return;
    }

    // 6. Validation for Payment Method
    if (numInitialPaid > 0 && (!paymentMethod || String(paymentMethod).trim() === '')) {
      setError('Please select payment method.');
      return;
    }

    try {
      setIsSubmitting(true);
      setError(null);

      const formattedDate = formatDDMMYYYY(liftDate);

      await onSubmit({
        member_id: memberId,
        lift_month: liftMonth,
        configured_lift_payout: numConfigured,
        lift_amount: numConfigured,
        initial_amount_paid: numInitialPaid,
        lift_amount_received: numInitialPaid,
        lift_date: formattedDate,
        payment_method: String(paymentMethod).trim(),
        reference_number: referenceNumber.trim() || undefined,
        notes: notes.trim() || undefined,
      });

      onSuccess();
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to save lift details');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      id="lift-modal-backdrop"
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 overflow-y-auto"
      onClick={(e) => {
        if (e.target === e.currentTarget && !isSubmitting) onClose();
      }}
    >
      <div
        id="lift-modal-container"
        className="bg-white rounded-2xl shadow-2xl max-w-lg w-full overflow-hidden border border-slate-200 my-8 animate-in fade-in zoom-in-95 duration-150"
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-purple-50/70">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-purple-100 flex items-center justify-center text-purple-700">
              <Award className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-base font-bold text-purple-950 tracking-tight">
                {isEditing ? 'EDIT CHIT LIFT' : 'MARK AS LIFTED'}
              </h3>
              <p className="text-xs text-purple-700 mt-0.5">
                {chitName || chit?.name || 'Chit Fund'} &bull; Chit Value: {formatINR(chit?.chit_value || 0)}
              </p>
            </div>
          </div>
          <button
            id="close-lift-modal-btn"
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="text-slate-400 hover:text-slate-700 p-1.5 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer disabled:opacity-50"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="p-3.5 bg-red-50 border border-red-200 rounded-xl flex items-center gap-2.5 text-xs font-bold text-red-700 animate-in fade-in duration-150">
              <AlertCircle className="w-4 h-4 shrink-0 text-red-600" />
              <span>{error}</span>
            </div>
          )}

          {/* Customer Details Box */}
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 space-y-2">
            {!selectedMemberId ? (
              <div>
                <label htmlFor="lift-customer-select" className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block mb-1">
                  Customer <span className="text-red-500">*</span>
                </label>
                <select
                  id="lift-customer-select"
                  value={memberId}
                  onChange={(e) => {
                    setMemberId(e.target.value);
                    setError(null);
                  }}
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-sm font-semibold text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-purple-500"
                >
                  <option value="">Select Customer</option>
                  {members.map((m) => (
                    <option key={m.id} value={m.id}>
                      #{m.ticket_number} - {m.customer_name} ({m.phone}) {m.lift_status === 'lifted' ? `(Lifted M${m.lift_month})` : ''}
                    </option>
                  ))}
                </select>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block">
                    Customer Name
                  </span>
                  <span className="text-sm font-bold text-slate-900 block mt-0.5">
                    {selectedMember?.customer_name || '—'}
                  </span>
                </div>
                <div>
                  <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block">
                    Ticket Number
                  </span>
                  <span className="text-sm font-mono font-bold text-purple-800 block mt-0.5">
                    #{selectedMember?.ticket_number || '—'}
                  </span>
                </div>
                <div>
                  <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block">
                    Customer Phone
                  </span>
                  <span className="text-xs font-mono font-medium text-slate-700 block mt-0.5">
                    {selectedMember?.phone || '—'}
                  </span>
                </div>
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* 1. Lift Month Dropdown */}
            <div>
              <label htmlFor="lift-month-select" className="block text-xs font-bold text-slate-800 mb-1">
                Lift Month <span className="text-red-500">*</span>
              </label>
              <select
                id="lift-month-select"
                value={liftMonth}
                onChange={(e) => handleMonthChange(e.target.value)}
                className={`w-full px-3 py-2 bg-white border rounded-xl text-sm font-semibold transition-colors focus:outline-hidden ${
                  isMonthOccupied
                    ? 'border-red-400 text-red-700 focus:ring-2 focus:ring-red-400 bg-red-50/50'
                    : 'border-slate-300 text-slate-900 focus:ring-2 focus:ring-purple-500'
                }`}
              >
                <option value="">Select Month</option>
                {Array.from({ length: totalMonths }, (_, i) => i + 1).map((mNum) => {
                  const isOccupied = members.some(
                    (m) => m.lift_status === 'lifted' && m.lift_month === mNum && m.id !== memberId
                  );
                  return (
                    <option key={mNum} value={mNum}>
                      Month {mNum} {isOccupied ? '(Already Assigned)' : ''}
                    </option>
                  );
                })}
              </select>
              {isMonthOccupied && (
                <p className="text-[11px] font-bold text-red-600 mt-1">
                  Month {liftMonth} is already assigned to {occupyingMember?.customer_name}.
                </p>
              )}
            </div>

            {/* 2. Lift Date */}
            <div>
              <label htmlFor="lift-date-input" className="block text-xs font-bold text-slate-800 mb-1">
                Lift Date <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <input
                  id="lift-date-input"
                  type="date"
                  value={liftDate}
                  onChange={(e) => {
                    setLiftDate(e.target.value);
                    setError(null);
                  }}
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-sm font-medium text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-purple-500"
                />
              </div>
              <p className="text-[10px] text-slate-500 mt-0.5 font-mono">
                Formatted: {formatDDMMYYYY(liftDate)}
              </p>
            </div>
          </div>

          {/* Configured Lift Payout & Initial Amount Paid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* 3. Configured Lift Payout */}
            <div>
              <label htmlFor="configured-payout-input" className="block text-xs font-bold text-slate-800 mb-1">
                Configured Lift Payout <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-bold text-slate-500">
                  ₹
                </span>
                <input
                  id="configured-payout-input"
                  type="number"
                  min="1"
                  step="1"
                  placeholder="e.g. 500000"
                  value={configuredPayout}
                  onChange={(e) => {
                    const val = e.target.value;
                    setConfiguredPayout(val);
                    setError(null);
                  }}
                  className="w-full pl-8 pr-3 py-2 bg-white border border-slate-300 rounded-xl text-sm font-mono font-bold text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-purple-500"
                />
              </div>
              <div className="flex items-center justify-between text-[11px] mt-1">
                {numConfigured > 0 ? (
                  <span className="text-purple-700 font-semibold">{formatINR(numConfigured)}</span>
                ) : (
                  <span className="text-slate-400">Total agreed payout</span>
                )}
                {typeof liftMonth === 'number' && rules.find((r) => r.month_number === liftMonth)?.expected_lift_payout ? (
                  <span className="text-[10px] text-slate-500 font-medium bg-slate-100 px-1.5 py-0.5 rounded">
                    Default: {formatINR(rules.find((r) => r.month_number === liftMonth)?.expected_lift_payout)}
                  </span>
                ) : null}
              </div>
            </div>

            {/* 4. Initial Amount Paid to Customer */}
            <div>
              <label htmlFor="initial-paid-input" className="block text-xs font-bold text-slate-800 mb-1">
                Initial Amount Paid to Customer <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-bold text-slate-500">
                  ₹
                </span>
                <input
                  id="initial-paid-input"
                  type="number"
                  min="0"
                  max={numConfigured || undefined}
                  step="1"
                  placeholder="e.g. 300000"
                  value={initialAmountPaid}
                  onChange={(e) => {
                    setInitialAmountPaid(e.target.value);
                    setError(null);
                  }}
                  className="w-full pl-8 pr-3 py-2 bg-white border border-slate-300 rounded-xl text-sm font-mono font-bold text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-purple-500"
                />
              </div>
              <div className="flex items-center justify-between text-[11px] mt-1">
                {numInitialPaid > 0 ? (
                  <span className="text-emerald-700 font-semibold">{formatINR(numInitialPaid)}</span>
                ) : (
                  <span className="text-slate-400">Enter amount paid today</span>
                )}
                {numConfigured > 0 && (
                  <button
                    type="button"
                    onClick={() => setInitialAmountPaid(numConfigured)}
                    className="text-[10px] font-bold text-purple-700 hover:underline cursor-pointer"
                  >
                    Pay Full
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Real-time Calculation Summary Card */}
          <div className="bg-purple-50/60 border border-purple-200/80 rounded-xl p-3.5 space-y-2">
            <div className="flex items-center justify-between text-xs font-bold text-purple-950 pb-1 border-b border-purple-200/60">
              <span className="uppercase tracking-wider text-[10px] text-purple-700">Live Payout Summary</span>
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-purple-200 text-purple-900">
                Lift Status: LIFTED
              </span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1 text-center">
              <div className="bg-white p-2 rounded-lg border border-purple-100">
                <span className="text-[10px] font-medium text-slate-500 block uppercase">Configured</span>
                <span className="text-xs font-bold font-mono text-slate-900 block mt-0.5">
                  {formatINR(numConfigured)}
                </span>
              </div>
              <div className="bg-white p-2 rounded-lg border border-purple-100">
                <span className="text-[10px] font-medium text-slate-500 block uppercase">Paid Now</span>
                <span className="text-xs font-bold font-mono text-emerald-700 block mt-0.5">
                  {formatINR(numInitialPaid)}
                </span>
              </div>
              <div className="bg-white p-2 rounded-lg border border-purple-100">
                <span className="text-[10px] font-medium text-slate-500 block uppercase">Remaining</span>
                <span className="text-xs font-bold font-mono text-amber-700 block mt-0.5">
                  {formatINR(numRemaining)}
                </span>
              </div>
              <div className="bg-white p-2 rounded-lg border border-purple-100 flex flex-col justify-center items-center">
                <span className="text-[10px] font-medium text-slate-500 block uppercase">Payout Status</span>
                <span
                  className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-extrabold mt-0.5 ${
                    payoutStatus === 'PAID'
                      ? 'bg-emerald-100 text-emerald-800'
                      : 'bg-amber-100 text-amber-800'
                  }`}
                >
                  {payoutStatus}
                </span>
              </div>
            </div>
          </div>

          {/* Payment Details (Only when initial amount paid > 0) */}
          {numInitialPaid > 0 && (
            <div className="space-y-3 pt-1 border-t border-slate-100">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Payment Method */}
                <div>
                  <label htmlFor="lift-payment-method-select" className="block text-xs font-bold text-slate-800 mb-1">
                    Payment Method <span className="text-red-500">*</span>
                  </label>
                  <select
                    id="lift-payment-method-select"
                    value={paymentMethod}
                    onChange={(e) => {
                      setPaymentMethod(e.target.value);
                      setError(null);
                    }}
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-sm font-semibold text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-purple-500"
                  >
                    {PAYMENT_METHODS.map((pm) => (
                      <option key={pm} value={pm}>
                        {pm}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Reference Number */}
                <div>
                  <label htmlFor="lift-reference-input" className="block text-xs font-bold text-slate-800 mb-1">
                    Reference / Transaction ID <span className="text-slate-400 font-normal">(Optional)</span>
                  </label>
                  <div className="relative">
                    <Hash className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      id="lift-reference-input"
                      type="text"
                      placeholder="e.g. NEFT12345 / UPI ref"
                      value={referenceNumber}
                      onChange={(e) => setReferenceNumber(e.target.value)}
                      className="w-full pl-9 pr-3 py-2 bg-white border border-slate-300 rounded-xl text-sm font-mono text-slate-900 placeholder:text-slate-400 focus:outline-hidden focus:ring-2 focus:ring-purple-500"
                    />
                  </div>
                </div>
              </div>

              {/* Notes */}
              <div>
                <label htmlFor="lift-notes-input" className="block text-xs font-bold text-slate-800 mb-1">
                  Notes <span className="text-slate-400 font-normal">(Optional)</span>
                </label>
                <textarea
                  id="lift-notes-input"
                  rows={2}
                  placeholder="e.g. First partial lift payout / Transferred via Bank NEFT"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-sm text-slate-900 placeholder:text-slate-400 focus:outline-hidden focus:ring-2 focus:ring-purple-500 resize-none"
                />
              </div>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
            <button
              id="cancel-lift-btn"
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-800 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              id="confirm-lift-btn"
              type="submit"
              disabled={isSubmitting || isMonthOccupied}
              className="px-5 py-2.5 text-xs font-bold bg-purple-700 hover:bg-purple-800 disabled:opacity-50 text-white rounded-xl shadow-xs transition-colors cursor-pointer inline-flex items-center gap-2"
            >
              {isSubmitting ? (
                <>
                  <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  <span>Saving...</span>
                </>
              ) : (
                <span>{isEditing ? 'Save Changes' : 'Confirm Lift'}</span>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
