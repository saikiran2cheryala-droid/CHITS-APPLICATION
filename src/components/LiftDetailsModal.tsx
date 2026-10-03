import React, { useState, useEffect } from 'react';
import {
  X,
  Award,
  Calendar,
  CreditCard,
  Hash,
  FileText,
  CheckCircle2,
  Edit2,
  PlusCircle,
  Clock,
  AlertCircle,
  Receipt,
  ArrowRight,
  TrendingDown,
} from 'lucide-react';
import { Member, Chit, LiftPayoutTransaction, PaymentMethod } from '../types';
import { formatINR, formatDDMMYYYY, formatDateTime } from '../utils/formatters';
import { api } from '../services/api';

interface LiftDetailsModalProps {
  isOpen: boolean;
  member: Member | null;
  chit: Chit | null;
  onClose: () => void;
  onEditLift: (member: Member) => void;
  onPayoutSuccess?: () => void;
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

export const LiftDetailsModal: React.FC<LiftDetailsModalProps> = ({
  isOpen,
  member,
  chit,
  onClose,
  onEditLift,
  onPayoutSuccess,
}) => {
  // Local state for lift data to allow live updates without closing modal
  const [currentMember, setCurrentMember] = useState<Member | null>(member);
  const [transactions, setTransactions] = useState<LiftPayoutTransaction[]>([]);
  const [isLoadingTx, setIsLoadingTx] = useState(false);

  // Receive Payout form state
  const [isReceivingPayout, setIsReceivingPayout] = useState(false);
  const [payoutAmount, setPayoutAmount] = useState<number | string>('');
  const [payoutDate, setPayoutDate] = useState<string>(() => new Date().toISOString().split('T')[0]);
  const [payoutMethod, setPayoutMethod] = useState<PaymentMethod | string>('Bank Transfer');
  const [payoutReference, setPayoutReference] = useState('');
  const [payoutNotes, setPayoutNotes] = useState('');
  const [isSavingPayout, setIsSavingPayout] = useState(false);
  const [payoutError, setPayoutError] = useState<string | null>(null);
  const [payoutSuccessMsg, setPayoutSuccessMsg] = useState<string | null>(null);

  // Keep currentMember in sync with prop
  useEffect(() => {
    setCurrentMember(member);
    setIsReceivingPayout(false);
    setPayoutError(null);
    setPayoutSuccessMsg(null);
  }, [member]);

  // Fetch payout transactions whenever member changes or modal opens
  useEffect(() => {
    if (!isOpen || !member || !chit) return;

    if (member.transactions && member.transactions.length > 0) {
      setTransactions(member.transactions);
    } else {
      setIsLoadingTx(true);
      api.lift
        .getTransactions(chit.id, member.id)
        .then((res) => {
          if (res.transactions) {
            setTransactions(res.transactions);
          }
          if (res.lift) {
            setCurrentMember((prev) =>
              prev
                ? {
                    ...prev,
                    lift_amount: res.lift.lift_amount,
                    lift_amount_received: res.lift.lift_amount_received,
                    remaining_payout: res.lift.remaining_payout,
                    payout_status: res.lift.payout_status,
                  }
                : prev
            );
          }
        })
        .catch((err) => {
          console.error('Failed to load lift payout transactions:', err);
        })
        .finally(() => {
          setIsLoadingTx(false);
        });
    }
  }, [isOpen, member, chit]);

  if (!isOpen || !currentMember) return null;

  const configuredPayout = currentMember.lift_amount ?? chit?.chit_value ?? 0;
  const totalPaid = currentMember.lift_amount_received ?? 0;
  const remainingPayout = currentMember.remaining_payout !== undefined && currentMember.remaining_payout !== null
    ? currentMember.remaining_payout
    : Math.max(0, configuredPayout - totalPaid);

  const payoutStatus: 'PAID' | 'PARTIAL' = remainingPayout <= 0 ? 'PAID' : 'PARTIAL';
  const formattedDate = formatDDMMYYYY(currentMember.lift_date);

  const handleOpenReceivePayout = () => {
    setPayoutAmount(remainingPayout > 0 ? remainingPayout : '');
    setPayoutDate(new Date().toISOString().split('T')[0]);
    setPayoutMethod('Bank Transfer');
    setPayoutReference('');
    setPayoutNotes('');
    setPayoutError(null);
    setPayoutSuccessMsg(null);
    setIsReceivingPayout(true);
  };

  const handleSavePayout = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSavingPayout || !chit) return;
    setPayoutError(null);
    setPayoutSuccessMsg(null);

    const numericAmount = Number(payoutAmount);
    if (isNaN(numericAmount) || numericAmount <= 0) {
      setPayoutError('Please enter a valid payout payment amount greater than zero.');
      return;
    }

    if (numericAmount > remainingPayout) {
      setPayoutError(
        `Payment cannot exceed the remaining lift payout of ${formatINR(remainingPayout)}.`
      );
      return;
    }

    if (!payoutMethod || String(payoutMethod).trim() === '') {
      setPayoutError('Please select a payment method.');
      return;
    }

    try {
      setIsSavingPayout(true);
      const res = await api.lift.recordPayout(chit.id, currentMember.id, {
        amount: numericAmount,
        payment_date: formatDDMMYYYY(payoutDate),
        payment_method: String(payoutMethod).trim(),
        reference_number: payoutReference.trim() || undefined,
        notes: payoutNotes.trim() || undefined,
      });

      if (res.lift) {
        setCurrentMember((prev) =>
          prev
            ? {
                ...prev,
                lift_amount: res.lift.lift_amount,
                lift_amount_received: res.lift.lift_amount_received,
                remaining_payout: res.lift.remaining_payout,
                payout_status: res.lift.payout_status,
              }
            : prev
        );
      }
      if (res.transactions) {
        setTransactions(res.transactions);
      }

      setIsReceivingPayout(false);
      setPayoutSuccessMsg(res.message || 'Lift payout payment recorded successfully.');
      onPayoutSuccess?.();
    } catch (err: any) {
      setPayoutError(err.message || 'Failed to record lift payout payment.');
    } finally {
      setIsSavingPayout(false);
    }
  };

  return (
    <div
      id="lift-details-modal-backdrop"
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 overflow-y-auto"
      onClick={(e) => {
        if (e.target === e.currentTarget && !isSavingPayout) onClose();
      }}
    >
      <div
        id="lift-details-modal-container"
        className="bg-white rounded-2xl shadow-2xl max-w-xl w-full overflow-hidden border border-slate-200 my-8 animate-in fade-in zoom-in-95 duration-150"
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-purple-50/70">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-purple-100 flex items-center justify-center text-purple-700 shadow-2xs">
              <Award className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-purple-950 tracking-tight">
                  CHIT LIFT DETAILS
                </h3>
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-purple-200 text-purple-900">
                  LIFTED
                </span>
                <span
                  className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold ${
                    payoutStatus === 'PAID'
                      ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                      : 'bg-amber-100 text-amber-800 border border-amber-200'
                  }`}
                >
                  PAYOUT: {payoutStatus}
                </span>
              </div>
              <p className="text-xs text-purple-700 mt-0.5">
                Ticket #{currentMember.ticket_number} &bull; {currentMember.customer_name}
              </p>
            </div>
          </div>
          <button
            id="close-lift-details-x-btn"
            type="button"
            onClick={onClose}
            disabled={isSavingPayout}
            className="text-slate-400 hover:text-slate-700 p-1.5 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 space-y-5 max-h-[80vh] overflow-y-auto">
          {payoutSuccessMsg && (
            <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center justify-between text-xs font-bold text-emerald-800 animate-in fade-in duration-150">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>{payoutSuccessMsg}</span>
              </div>
              <button
                type="button"
                onClick={() => setPayoutSuccessMsg(null)}
                className="text-emerald-700 hover:text-emerald-900 cursor-pointer text-xs"
              >
                &times;
              </button>
            </div>
          )}

          {/* Customer & Chit Info Banner */}
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 divide-y divide-slate-200/70 space-y-3">
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <div>
                <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider block">
                  Customer
                </span>
                <span className="text-sm font-bold text-slate-900 block mt-0.5">
                  {currentMember.customer_name}
                </span>
              </div>
              <div>
                <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider block">
                  Ticket Number
                </span>
                <span className="text-sm font-mono font-bold text-purple-900 block mt-0.5">
                  #{currentMember.ticket_number}
                </span>
              </div>
              <div>
                <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider block">
                  Phone
                </span>
                <span className="text-xs font-mono font-medium text-slate-700 block mt-0.5">
                  {currentMember.phone}
                </span>
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 pt-3">
              <div>
                <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider block">
                  Chit Fund
                </span>
                <span className="text-xs font-semibold text-slate-900 block mt-0.5">
                  {chit?.name || 'Chit Fund'}
                </span>
              </div>
              <div>
                <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider block">
                  Lift Month
                </span>
                <span className="text-xs font-bold text-purple-950 block mt-0.5">
                  Month {currentMember.lift_month || '—'}
                </span>
              </div>
              <div>
                <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider block">
                  Lift Date
                </span>
                <span className="text-xs font-mono font-bold text-slate-800 block mt-0.5">
                  {formattedDate}
                </span>
              </div>
            </div>
          </div>

          {/* Lift Payout Financial Breakdown Card */}
          <div className="bg-purple-50/50 border border-purple-200/80 rounded-2xl p-4 space-y-3 shadow-xs">
            <div className="flex items-center justify-between">
              <span className="text-xs font-black uppercase tracking-wider text-purple-900">
                Lift Payout Financials
              </span>
              <span
                className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-black ${
                  payoutStatus === 'PAID'
                    ? 'bg-emerald-100 text-emerald-800'
                    : 'bg-amber-100 text-amber-800'
                }`}
              >
                {payoutStatus === 'PAID' ? 'FULLY PAID' : 'PARTIAL PAYOUT'}
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="bg-white p-3 rounded-xl border border-purple-100">
                <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider block">
                  Configured Lift Payout
                </span>
                <span className="text-base font-black font-mono text-purple-900 block mt-1">
                  {formatINR(configuredPayout)}
                </span>
                <span className="text-[10px] text-slate-400 block mt-0.5">Agreed disbursement</span>
              </div>

              <div className="bg-white p-3 rounded-xl border border-purple-100">
                <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider block">
                  Paid to Customer
                </span>
                <span className="text-base font-black font-mono text-emerald-700 block mt-1">
                  {formatINR(totalPaid)}
                </span>
                <span className="text-[10px] text-slate-400 block mt-0.5">Actual disbursed</span>
              </div>

              <div className="bg-white p-3 rounded-xl border border-purple-100">
                <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider block">
                  Remaining Lift Payout
                </span>
                <span className="text-base font-black font-mono text-amber-700 block mt-1">
                  {formatINR(remainingPayout)}
                </span>
                <span className="text-[10px] text-slate-400 block mt-0.5">Pending payout</span>
              </div>
            </div>

            {/* Receive Lift Payout Action */}
            {remainingPayout > 0 && !isReceivingPayout && (
              <div className="pt-2 flex items-center justify-between">
                <span className="text-xs text-amber-900 font-medium">
                  ₹{new Intl.NumberFormat('en-IN').format(remainingPayout)} is remaining to be disbursed.
                </span>
                <button
                  id="open-receive-lift-payout-btn"
                  type="button"
                  onClick={handleOpenReceivePayout}
                  className="inline-flex items-center gap-1.5 px-4 py-2 bg-purple-700 hover:bg-purple-800 text-white rounded-xl text-xs font-bold shadow-xs transition-colors cursor-pointer"
                >
                  <PlusCircle className="w-4 h-4" />
                  <span>Receive Lift Payout</span>
                </button>
              </div>
            )}

            {remainingPayout <= 0 && (
              <div className="p-2.5 bg-emerald-100/70 border border-emerald-200 rounded-xl flex items-center gap-2 text-xs font-bold text-emerald-900">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>Full configured lift payout of {formatINR(configuredPayout)} has been disbursed.</span>
              </div>
            )}
          </div>

          {/* Sub-form: Receive Lift Payout */}
          {isReceivingPayout && (
            <form
              onSubmit={handleSavePayout}
              className="bg-white border-2 border-purple-400/80 rounded-2xl p-4 space-y-3.5 shadow-md animate-in fade-in zoom-in-95 duration-150"
            >
              <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                <div className="flex items-center gap-2">
                  <Receipt className="w-4 h-4 text-purple-700" />
                  <h4 className="text-xs font-extrabold text-slate-900 uppercase tracking-wide">
                    Record Payout Payment to Customer
                  </h4>
                </div>
                <span className="text-xs font-mono font-bold text-amber-700">
                  Max: {formatINR(remainingPayout)}
                </span>
              </div>

              {payoutError && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-xl flex items-center gap-2 text-xs font-bold text-red-700">
                  <AlertCircle className="w-4 h-4 shrink-0 text-red-600" />
                  <span>{payoutError}</span>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {/* Amount */}
                <div>
                  <label htmlFor="payout-amount-input" className="block text-xs font-bold text-slate-800 mb-1">
                    Amount Paid (₹) <span className="text-red-500">*</span>
                  </label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-bold text-slate-500">
                      ₹
                    </span>
                    <input
                      id="payout-amount-input"
                      type="number"
                      min="1"
                      max={remainingPayout}
                      step="1"
                      placeholder="e.g. 100000"
                      value={payoutAmount}
                      onChange={(e) => {
                        setPayoutAmount(e.target.value);
                        setPayoutError(null);
                      }}
                      className="w-full pl-8 pr-3 py-2 bg-white border border-slate-300 rounded-xl text-sm font-mono font-bold text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-purple-500"
                    />
                  </div>
                  <div className="flex items-center justify-between text-[11px] mt-1">
                    {payoutAmount && !isNaN(Number(payoutAmount)) ? (
                      <span className="text-emerald-700 font-semibold">{formatINR(Number(payoutAmount))}</span>
                    ) : (
                      <span className="text-slate-400">Enter disbursement amount</span>
                    )}
                    <button
                      type="button"
                      onClick={() => setPayoutAmount(remainingPayout)}
                      className="text-[10px] font-bold text-purple-700 hover:underline cursor-pointer"
                    >
                      Pay Full Remaining
                    </button>
                  </div>
                </div>

                {/* Payment Date */}
                <div>
                  <label htmlFor="payout-date-input" className="block text-xs font-bold text-slate-800 mb-1">
                    Payment Date <span className="text-red-500">*</span>
                  </label>
                  <input
                    id="payout-date-input"
                    type="date"
                    value={payoutDate}
                    onChange={(e) => {
                      setPayoutDate(e.target.value);
                      setPayoutError(null);
                    }}
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-sm font-medium text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-purple-500"
                  />
                  <p className="text-[10px] text-slate-500 mt-0.5 font-mono">
                    Formatted: {formatDDMMYYYY(payoutDate)}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {/* Payment Method */}
                <div>
                  <label htmlFor="payout-method-select" className="block text-xs font-bold text-slate-800 mb-1">
                    Payment Method <span className="text-red-500">*</span>
                  </label>
                  <select
                    id="payout-method-select"
                    value={payoutMethod}
                    onChange={(e) => {
                      setPayoutMethod(e.target.value);
                      setPayoutError(null);
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
                  <label htmlFor="payout-ref-input" className="block text-xs font-bold text-slate-800 mb-1">
                    Reference Number <span className="text-slate-400 font-normal">(Optional)</span>
                  </label>
                  <div className="relative">
                    <Hash className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      id="payout-ref-input"
                      type="text"
                      placeholder="e.g. NEFT12345 / UPI ref"
                      value={payoutReference}
                      onChange={(e) => setPayoutReference(e.target.value)}
                      className="w-full pl-9 pr-3 py-2 bg-white border border-slate-300 rounded-xl text-sm font-mono text-slate-900 placeholder:text-slate-400 focus:outline-hidden focus:ring-2 focus:ring-purple-500"
                    />
                  </div>
                </div>
              </div>

              {/* Notes */}
              <div>
                <label htmlFor="payout-notes-input" className="block text-xs font-bold text-slate-800 mb-1">
                  Notes <span className="text-slate-400 font-normal">(Optional)</span>
                </label>
                <textarea
                  id="payout-notes-input"
                  rows={2}
                  placeholder="e.g. Second partial lift payout / Bank transfer via SBI"
                  value={payoutNotes}
                  onChange={(e) => setPayoutNotes(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-sm text-slate-900 placeholder:text-slate-400 focus:outline-hidden focus:ring-2 focus:ring-purple-500 resize-none"
                />
              </div>

              {/* Action buttons inside form */}
              <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsReceivingPayout(false)}
                  disabled={isSavingPayout}
                  className="px-3.5 py-1.5 text-xs font-semibold text-slate-600 hover:text-slate-800 hover:bg-slate-100 rounded-xl cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  id="submit-lift-payout-btn"
                  type="submit"
                  disabled={isSavingPayout}
                  className="px-4 py-2 bg-purple-700 hover:bg-purple-800 disabled:opacity-50 text-white rounded-xl text-xs font-bold shadow-xs transition-colors cursor-pointer inline-flex items-center gap-1.5"
                >
                  {isSavingPayout ? (
                    <>
                      <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      <span>Saving Payout...</span>
                    </>
                  ) : (
                    <span>Confirm &amp; Save Payout</span>
                  )}
                </button>
              </div>
            </form>
          )}

          {/* Payment History Audit Trail */}
          <div className="space-y-2.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <Clock className="w-4 h-4 text-purple-700" />
                <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wide">
                  Lift Payout Payment History ({transactions.length})
                </h4>
              </div>
              <span className="text-[11px] font-mono font-bold text-slate-500">
                Disbursed: {formatINR(totalPaid)} / {formatINR(configuredPayout)}
              </span>
            </div>

            {isLoadingTx ? (
              <div className="p-4 text-center text-xs text-slate-400 bg-slate-50 rounded-xl border border-slate-200">
                Loading payout history...
              </div>
            ) : transactions.length > 0 ? (
              <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-2xs">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead className="bg-slate-50 text-slate-600 font-bold border-b border-slate-200 uppercase text-[10px]">
                      <tr>
                        <th className="py-2.5 px-3">Date</th>
                        <th className="py-2.5 px-3 text-right">Amount Paid</th>
                        <th className="py-2.5 px-3">Method</th>
                        <th className="py-2.5 px-3">Reference</th>
                        <th className="py-2.5 px-3">Notes</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {transactions.map((tx, idx) => (
                        <tr key={tx.id || idx} className="hover:bg-slate-50/70">
                          <td className="py-2.5 px-3 font-mono font-bold text-slate-800 whitespace-nowrap">
                            {formatDDMMYYYY(tx.payment_date)}
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono font-bold text-emerald-700 whitespace-nowrap">
                            {formatINR(tx.amount)}
                          </td>
                          <td className="py-2.5 px-3">
                            <span className="inline-block px-2 py-0.5 rounded-md font-semibold text-[10px] bg-slate-100 text-slate-800 border border-slate-200">
                              {tx.payment_method}
                            </span>
                          </td>
                          <td className="py-2.5 px-3 font-mono text-slate-600">
                            {tx.reference_number || '—'}
                          </td>
                          <td className="py-2.5 px-3 text-slate-700 max-w-xs truncate">
                            {tx.notes || '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : (
              <div className="p-4 text-center text-xs text-slate-500 bg-slate-50 rounded-xl border border-slate-200">
                No lift payout transactions recorded yet. Click "Receive Lift Payout" above to record disbursement.
              </div>
            )}
          </div>
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-3.5 border-t border-slate-200 flex items-center justify-between bg-slate-50/60">
          <span className="text-[11px] text-slate-400">
            Manager &rarr; Customer Lift Payout (Separate from customer monthly dues)
          </span>

          <div className="flex items-center gap-2">
            <button
              id="close-lift-details-btn"
              type="button"
              onClick={onClose}
              disabled={isSavingPayout}
              className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-800 hover:bg-slate-200/60 rounded-xl transition-colors cursor-pointer"
            >
              Close
            </button>
            <button
              id="edit-lift-details-btn"
              type="button"
              onClick={() => onEditLift(currentMember)}
              disabled={isSavingPayout}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white rounded-xl shadow-xs transition-colors cursor-pointer"
            >
              <Edit2 className="w-3.5 h-3.5" />
              <span>Edit Lift</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
