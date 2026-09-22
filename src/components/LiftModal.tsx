import React, { useState, useEffect } from 'react';
import { X, AlertCircle, Calendar, CreditCard, FileText, Hash } from 'lucide-react';
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
    lift_date: string;
    payment_method: string;
    reference_number?: string;
    notes?: string;
  }) => Promise<void>;
}

const PAYMENT_METHODS: PaymentMethod[] = ['Cash', 'UPI', 'Bank Transfer', 'Cheque', 'Other'];

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
  
  // State for all lift fields
  const [liftMonth, setLiftMonth] = useState<number | ''>('');
  const [amountReceived, setAmountReceived] = useState<number | string>('');
  // Default lift date to today's date in YYYY-MM-DD
  const [liftDate, setLiftDate] = useState<string>(() => new Date().toISOString().split('T')[0]);
  const [paymentMethod, setPaymentMethod] = useState<string>('Cash');
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
      const existingAmount = selectedMember.lift_amount_received ?? selectedMember.lift_amount;
      if (existingAmount !== undefined && existingAmount !== null) {
        setAmountReceived(existingAmount);
      }
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
      // New lift: Lift Month initially blank - user must manually select Lift Month
      setLiftMonth('');
      setAmountReceived('');
      setLiftDate(new Date().toISOString().split('T')[0]);
      setPaymentMethod('Cash');
      setReferenceNumber('');
      setNotes('');
    }
  }, [selectedMember, defaultMonth, rules, totalMonths, memberId, members]);

  // Check if selected month is already assigned to another customer
  const occupyingMember =
    typeof liftMonth === 'number'
      ? members.find(
          (m) => m.lift_status === 'lifted' && m.lift_month === liftMonth && m.id !== memberId
        )
      : null;
  const isMonthOccupied = !!occupyingMember;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
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

    // 4. Validation for Lift Amount
    const trimmedAmount = String(amountReceived).trim();
    if (!trimmedAmount || trimmedAmount === '') {
      setError('Please enter a valid lift amount.');
      return;
    }
    const numericAmount = Number(amountReceived);
    if (isNaN(numericAmount) || numericAmount <= 0) {
      setError('Please enter a valid lift amount.');
      return;
    }

    // 5. Validation for Payment Method
    if (!paymentMethod || paymentMethod.trim() === '') {
      setError('Please select payment method.');
      return;
    }

    try {
      setIsSubmitting(true);
      setError(null);

      // Save formatted DD/MM/YYYY date
      const formattedDate = formatDDMMYYYY(liftDate);

      await onSubmit({
        member_id: memberId,
        lift_month: liftMonth,
        lift_amount_received: numericAmount,
        lift_amount: numericAmount,
        lift_date: formattedDate,
        payment_method: paymentMethod.trim(),
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
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        id="lift-modal-container"
        className="bg-white rounded-2xl shadow-xl max-w-lg w-full overflow-hidden border border-slate-200 my-8 animate-in fade-in zoom-in-95 duration-150"
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50/50">
          <div>
            <h3 className="text-base font-bold text-slate-900 tracking-tight">
              {isEditing ? 'EDIT CHIT LIFT' : 'MARK AS LIFTED'}
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              {chitName || chit?.name || 'Chit Fund'}
            </p>
          </div>
          <button
            id="close-lift-modal-btn"
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-slate-700 p-1.5 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer"
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
                  Customer
                </label>
                <select
                  id="lift-customer-select"
                  value={memberId}
                  onChange={(e) => {
                    setMemberId(e.target.value);
                    setError(null);
                  }}
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-sm font-semibold text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">Select Customer</option>
                  {members.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.customer_name} ({m.phone}) {m.lift_status === 'lifted' ? `(Lifted M${m.lift_month})` : ''}
                    </option>
                  ))}
                </select>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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
                onChange={(e) => {
                  const val = e.target.value;
                  if (val === '') {
                    setLiftMonth('');
                    setAmountReceived('');
                  } else {
                    const num = parseInt(val, 10);
                    setLiftMonth(num);
                    const currentRule = rules.find((r) => r.month_number === num);
                    if (currentRule && currentRule.expected_lift_payout > 0) {
                      setAmountReceived(currentRule.expected_lift_payout);
                    } else {
                      setAmountReceived('');
                    }
                  }
                  setError(null);
                }}
                className={`w-full px-3 py-2 bg-white border rounded-xl text-sm font-semibold transition-colors focus:outline-hidden ${
                  isMonthOccupied
                    ? 'border-red-400 text-red-700 focus:ring-2 focus:ring-red-400 bg-red-50/50'
                    : 'border-slate-300 text-slate-900 focus:ring-2 focus:ring-blue-500'
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
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-sm font-medium text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <p className="text-[10px] text-slate-500 mt-0.5 font-mono">
                Formatted: {formatDDMMYYYY(liftDate)}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* 3. Lift Amount */}
            <div>
              <label htmlFor="lift-amount-input" className="block text-xs font-bold text-slate-800 mb-1">
                Lift Amount <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-bold text-slate-500">
                  ₹
                </span>
                <input
                  id="lift-amount-input"
                  type="number"
                  min="1"
                  step="1"
                  placeholder="e.g. 250000"
                  value={amountReceived}
                  onChange={(e) => {
                    setAmountReceived(e.target.value);
                    setError(null);
                  }}
                  className="w-full pl-8 pr-3 py-2 bg-white border border-slate-300 rounded-xl text-sm font-mono font-bold text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div className="flex items-center justify-between text-[11px] mt-1">
                {amountReceived && !isNaN(Number(amountReceived)) ? (
                  <span className="text-purple-700 font-semibold">
                    {formatINR(Number(amountReceived))}
                  </span>
                ) : (
                  <span className="text-slate-400">Enter lift amount</span>
                )}
                {typeof liftMonth === 'number' && rules.find((r) => r.month_number === liftMonth)?.expected_lift_payout ? (
                  <span className="text-[10px] text-slate-500 font-medium bg-slate-100 px-1.5 py-0.5 rounded">
                    Default: {formatINR(rules.find((r) => r.month_number === liftMonth)?.expected_lift_payout)}
                  </span>
                ) : null}
              </div>
            </div>

            {/* 4. Payment Method */}
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
                className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-sm font-semibold text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-blue-500"
              >
                {PAYMENT_METHODS.map((pm) => (
                  <option key={pm} value={pm}>
                    {pm}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* 5. Reference Number */}
          <div>
            <label htmlFor="lift-reference-input" className="block text-xs font-bold text-slate-800 mb-1">
              Transaction / Reference Number <span className="text-slate-400 font-normal">(Optional)</span>
            </label>
            <div className="relative">
              <Hash className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                id="lift-reference-input"
                type="text"
                placeholder="e.g. UPI Ref 458721963852 / Cheque #102938"
                value={referenceNumber}
                onChange={(e) => setReferenceNumber(e.target.value)}
                className="w-full pl-9 pr-3 py-2 bg-white border border-slate-300 rounded-xl text-sm font-mono text-slate-900 placeholder:text-slate-400 focus:outline-hidden focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          {/* 6. Notes */}
          <div>
            <label htmlFor="lift-notes-input" className="block text-xs font-bold text-slate-800 mb-1">
              Notes <span className="text-slate-400 font-normal">(Optional)</span>
            </label>
            <textarea
              id="lift-notes-input"
              rows={3}
              placeholder="e.g. Paid through SBI UPI / Transferred directly to bank account"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-sm text-slate-900 placeholder:text-slate-400 focus:outline-hidden focus:ring-2 focus:ring-blue-500 resize-none"
            />
          </div>

          {/* Action Buttons */}
          <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
            <button
              id="cancel-lift-btn"
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-800 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              id="confirm-lift-btn"
              type="submit"
              disabled={isSubmitting || isMonthOccupied}
              className="px-5 py-2.5 text-xs font-bold bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-xl shadow-xs transition-colors cursor-pointer inline-flex items-center gap-2"
            >
              {isSubmitting ? (
                <span>Saving...</span>
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
