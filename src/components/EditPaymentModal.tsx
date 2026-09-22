import React, { useState, useEffect } from 'react';
import {
  X,
  AlertCircle,
  CreditCard,
  Trash2,
  Save,
  Calendar,
  CheckCircle2,
  Clock,
  ArrowRight,
} from 'lucide-react';
import { MonthlyDue, Payment, PaymentMethod } from '../types';
import { formatINR, formatDateTime } from '../utils/formatters';
import { api } from '../services/api';

interface EditPaymentModalProps {
  due: MonthlyDue | null;
  initialPayment?: Payment | null;
  onClose: () => void;
  onSuccess: () => void;
}

export const EditPaymentModal: React.FC<EditPaymentModalProps> = ({
  due,
  initialPayment,
  onClose,
  onSuccess,
}) => {
  const [payments, setPayments] = useState<Payment[]>([]);
  const [selectedPayment, setSelectedPayment] = useState<Payment | null>(initialPayment || null);
  const [loading, setLoading] = useState<boolean>(true);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [isDeleting, setIsDeleting] = useState<boolean>(false);
  const [confirmDelete, setConfirmDelete] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Form states for selected payment
  const [amount, setAmount] = useState<number>(0);
  const [method, setMethod] = useState<PaymentMethod>('Cash');
  const [referenceNo, setReferenceNo] = useState<string>('');
  const [notes, setNotes] = useState<string>('');
  const [paymentDate, setPaymentDate] = useState<string>('');

  // Load payments for this due
  useEffect(() => {
    if (!due) return;
    setLoading(true);
    setError(null);
    api.payments
      .getByDueId(due.id)
      .then((data) => {
        setPayments(data);
        if (data.length > 0) {
          const target = initialPayment
            ? data.find((p) => p.id === initialPayment.id) || data[0]
            : data[0];
          selectPaymentForEdit(target);
        } else {
          setSelectedPayment(null);
        }
      })
      .catch((err) => {
        console.error('Failed to fetch payments for due', err);
        setError('Failed to load received payment records.');
      })
      .finally(() => {
        setLoading(false);
      });
  }, [due, initialPayment]);

  const selectPaymentForEdit = (payment: Payment) => {
    setSelectedPayment(payment);
    setAmount(payment.amount);
    setMethod(payment.payment_method as PaymentMethod);
    setReferenceNo(payment.reference_no || '');
    setNotes(payment.notes || '');
    setPaymentDate(
      payment.payment_date ? payment.payment_date.split('T')[0] : new Date().toISOString().split('T')[0]
    );
    setConfirmDelete(false);
    setError(null);
  };

  if (!due) return null;

  // Calculate sum of OTHER payments for this due (excluding currently selected payment)
  const otherPaymentsSum = payments
    .filter((p) => selectedPayment && p.id !== selectedPayment.id)
    .reduce((sum, p) => sum + Number(p.amount), 0);

  const maxAllowedAmount = Math.max(0, due.due_amount - otherPaymentsSum);
  const projectedPaid = otherPaymentsSum + (Number(amount) || 0);
  const projectedBalance = Math.max(0, due.due_amount - projectedPaid);
  const projectedStatus =
    projectedPaid >= due.due_amount ? 'PAID' : projectedPaid > 0 ? 'PARTIAL' : 'PENDING';

  const handleAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value) || 0;
    setAmount(val);
    if (val > maxAllowedAmount) {
      setError(`Amount exceeds due balance limit. Maximum allowed is ${formatINR(maxAllowedAmount)}.`);
    } else {
      setError(null);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPayment) return;

    if (amount <= 0) {
      setError('Payment amount must be greater than zero.');
      return;
    }

    if (amount > maxAllowedAmount) {
      setError(`Payment amount cannot exceed ${formatINR(maxAllowedAmount)}.`);
      return;
    }

    try {
      setIsSubmitting(true);
      setError(null);
      await api.payments.update(selectedPayment.id, {
        amount,
        payment_method: method,
        reference_no: referenceNo.trim() || '',
        notes: notes.trim() || '',
        payment_date: paymentDate ? new Date(paymentDate).toISOString() : new Date().toISOString(),
      });
      onSuccess();
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to update payment');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!selectedPayment) return;
    try {
      setIsDeleting(true);
      setError(null);
      await api.payments.delete(selectedPayment.id);
      onSuccess();
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to delete payment');
    } finally {
      setIsDeleting(false);
      setConfirmDelete(false);
    }
  };

  return (
    <div
      id="edit-payment-modal-backdrop"
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 overflow-y-auto"
    >
      <div
        id="edit-payment-modal-container"
        className="bg-white rounded-2xl shadow-2xl max-w-lg w-full overflow-hidden border border-slate-200 animate-in fade-in zoom-in-95 duration-200"
      >
        {/* Header */}
        <div className="bg-slate-900 text-white px-6 py-5 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-blue-600/30 border border-blue-400/40 flex items-center justify-center text-blue-400">
              <CreditCard className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-base font-bold">Edit Received Payment</h3>
              <p className="text-xs text-slate-300">
                Month {due.month_number} ({due.month_name}) • {due.customer_name}
              </p>
            </div>
          </div>
          <button
            id="close-edit-payment-modal-btn"
            onClick={onClose}
            className="text-slate-400 hover:text-white p-1.5 rounded-lg hover:bg-slate-800 transition-colors cursor-pointer"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-5">
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-xl flex items-center gap-2.5 text-xs text-red-700">
              <AlertCircle className="w-4 h-4 shrink-0 text-red-600" />
              <span>{error}</span>
            </div>
          )}

          {/* Customer & Due Summary Card */}
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5">
            <div className="flex items-center justify-between text-xs">
              <div>
                <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">
                  Customer
                </span>
                <p className="font-bold text-slate-900 text-sm">{due.customer_name}</p>
                <p className="text-slate-500 text-[11px]">
                  Ticket #{due.ticket_number || '00'} • {due.phone}
                </p>
              </div>
              <div className="text-right">
                <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">
                  Current Status
                </span>
                <p
                  className={`font-bold text-xs px-2 py-0.5 rounded-md mt-0.5 ${
                    due.status === 'PAID'
                      ? 'bg-emerald-100 text-emerald-800'
                      : due.status === 'PARTIAL'
                      ? 'bg-amber-100 text-amber-800'
                      : 'bg-red-100 text-red-800'
                  }`}
                >
                  {due.status}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2 mt-3 pt-2.5 border-t border-slate-200 text-center text-xs">
              <div>
                <span className="text-slate-400 text-[11px] block">Month Due</span>
                <span className="font-bold text-slate-900">{formatINR(due.due_amount)}</span>
              </div>
              <div>
                <span className="text-slate-400 text-[11px] block">Total Paid</span>
                <span className="font-bold text-emerald-600">{formatINR(due.paid_amount)}</span>
              </div>
              <div>
                <span className="text-slate-400 text-[11px] block">Current Balance</span>
                <span className="font-bold text-red-600">{formatINR(due.balance_amount)}</span>
              </div>
            </div>
          </div>

          {loading ? (
            <div className="p-8 text-center text-slate-500 text-xs">
              <div className="inline-block w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin mb-2"></div>
              <p>Loading received payment records...</p>
            </div>
          ) : payments.length === 0 ? (
            <div className="p-6 text-center bg-slate-50 border border-slate-200 rounded-xl space-y-2">
              <p className="text-xs text-slate-600">
                No payment transactions currently recorded for this month.
              </p>
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-1.5 text-xs font-bold bg-slate-200 hover:bg-slate-300 rounded-lg text-slate-800 transition-colors"
              >
                Close
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Payment Selector if multiple payments exist */}
              {payments.length > 1 && (
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">
                    Select Transaction to Edit ({payments.length} Payments):
                  </label>
                  <div className="space-y-1.5 max-h-36 overflow-y-auto pr-1">
                    {payments.map((p) => {
                      const isSelected = selectedPayment?.id === p.id;
                      return (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() => selectPaymentForEdit(p)}
                          className={`w-full text-left p-2.5 rounded-xl border text-xs flex items-center justify-between transition-colors ${
                            isSelected
                              ? 'border-blue-600 bg-blue-50/70 text-blue-900 font-bold'
                              : 'border-slate-200 hover:bg-slate-50 text-slate-700'
                          }`}
                        >
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-sm font-bold">{formatINR(p.amount)}</span>
                            <span className="px-1.5 py-0.5 rounded text-[10px] bg-slate-100 text-slate-600">
                              {p.payment_method}
                            </span>
                          </div>
                          <span className="text-[11px] text-slate-400">
                            {formatDateTime(p.payment_date)}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {selectedPayment && (
                <form onSubmit={handleSave} className="space-y-4">
                  {/* Amount Input */}
                  <div>
                    <div className="flex justify-between items-center mb-1">
                      <label className="text-xs font-bold text-slate-700">
                        Received Amount (₹) <span className="text-red-500">*</span>
                      </label>
                      <span className="text-[11px] text-slate-500">
                        Max: {formatINR(maxAllowedAmount)}
                      </span>
                    </div>
                    <div className="relative">
                      <span className="absolute left-3 top-2.5 text-slate-400 font-bold">₹</span>
                      <input
                        id="edit-payment-amount-input"
                        type="number"
                        min="1"
                        max={maxAllowedAmount}
                        step="any"
                        value={amount || ''}
                        onChange={handleAmountChange}
                        className="w-full pl-8 pr-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-sm font-mono font-bold text-slate-900 focus:bg-white focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                        required
                      />
                    </div>
                  </div>

                  {/* Payment Method */}
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1.5">
                      Payment Mode
                    </label>
                    <div className="grid grid-cols-4 gap-1.5">
                      {(['Cash', 'UPI', 'Bank Transfer', 'Cheque'] as PaymentMethod[]).map((m) => (
                        <button
                          key={m}
                          type="button"
                          onClick={() => setMethod(m)}
                          className={`py-1.5 px-2 text-xs font-bold rounded-lg border text-center transition-colors ${
                            method === m
                              ? 'bg-blue-600 text-white border-blue-600 shadow-2xs'
                              : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                          }`}
                        >
                          {m}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Payment Date & Reference */}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">
                        Payment Date
                      </label>
                      <div className="relative">
                        <input
                          id="edit-payment-date-input"
                          type="date"
                          value={paymentDate}
                          onChange={(e) => setPaymentDate(e.target.value)}
                          className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs text-slate-800 font-medium focus:bg-white focus:ring-2 focus:ring-blue-500 outline-none"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">
                        Ref / Trx ID
                      </label>
                      <input
                        id="edit-payment-reference-input"
                        type="text"
                        placeholder="e.g. UPI-987654"
                        value={referenceNo}
                        onChange={(e) => setReferenceNo(e.target.value)}
                        className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs text-slate-800 focus:bg-white focus:ring-2 focus:ring-blue-500 outline-none"
                      />
                    </div>
                  </div>

                  {/* Notes */}
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Notes / Remarks
                    </label>
                    <input
                      id="edit-payment-notes-input"
                      type="text"
                      placeholder="Optional remarks"
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs text-slate-800 focus:bg-white focus:ring-2 focus:ring-blue-500 outline-none"
                    />
                  </div>

                  {/* Projected Balance Preview */}
                  <div className="bg-blue-50/70 border border-blue-200 rounded-xl p-3 flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2">
                      <ArrowRight className="w-3.5 h-3.5 text-blue-600" />
                      <span className="text-slate-600 font-medium">After this update:</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-slate-700">
                        Balance:{' '}
                        <strong
                          className={projectedBalance > 0 ? 'text-red-600' : 'text-emerald-600'}
                        >
                          {formatINR(projectedBalance)}
                        </strong>
                      </span>
                      <span
                        className={`px-2 py-0.5 rounded-full font-extrabold text-[10px] ${
                          projectedStatus === 'PAID'
                            ? 'bg-emerald-100 text-emerald-800'
                            : projectedStatus === 'PARTIAL'
                            ? 'bg-amber-100 text-amber-800'
                            : 'bg-red-100 text-red-800'
                        }`}
                      >
                        {projectedStatus}
                      </span>
                    </div>
                  </div>

                  {/* Action Buttons */}
                  <div className="pt-2 flex items-center justify-between gap-3">
                    {/* Delete Option with Confirmation */}
                    <div>
                      {confirmDelete ? (
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={handleDelete}
                            disabled={isDeleting}
                            className="px-3 py-2 bg-red-600 hover:bg-red-700 text-white rounded-xl text-xs font-bold transition-colors disabled:opacity-50"
                          >
                            {isDeleting ? 'Deleting...' : 'Confirm Revert'}
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmDelete(false)}
                            className="px-2.5 py-2 bg-slate-100 text-slate-600 rounded-xl text-xs font-medium hover:bg-slate-200"
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setConfirmDelete(true)}
                          className="px-3 py-2 text-red-600 hover:bg-red-50 border border-red-200 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer"
                          title="Revert / Delete this payment record"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          <span>Delete Payment</span>
                        </button>
                      )}
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={onClose}
                        className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-xl text-xs font-bold transition-colors cursor-pointer"
                      >
                        Cancel
                      </button>
                      <button
                        id="save-edit-payment-btn"
                        type="submit"
                        disabled={isSubmitting || amount <= 0 || amount > maxAllowedAmount}
                        className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-xs transition-colors cursor-pointer disabled:opacity-50"
                      >
                        <Save className="w-3.5 h-3.5" />
                        <span>{isSubmitting ? 'Saving...' : 'Save Changes'}</span>
                      </button>
                    </div>
                  </div>
                </form>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
