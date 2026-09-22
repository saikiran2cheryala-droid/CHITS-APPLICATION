import React, { useState, useEffect } from 'react';
import { X, CheckCircle, AlertCircle, CreditCard, Banknote, Smartphone, FileText } from 'lucide-react';
import { MonthlyDue, PaymentMethod } from '../types';
import { formatINR } from '../utils/formatters';

interface PaymentModalProps {
  due: MonthlyDue | null;
  onClose: () => void;
  onSuccess: () => void;
  onSubmit: (payload: {
    monthly_due_id: string;
    amount: number;
    payment_method: PaymentMethod;
    reference_no?: string;
    notes?: string;
    payment_date?: string;
  }) => Promise<any>;
}

export const PaymentModal: React.FC<PaymentModalProps> = ({ due, onClose, onSuccess, onSubmit }) => {
  const [amount, setAmount] = useState<number>(due?.balance_amount ?? 0);
  const [method, setMethod] = useState<PaymentMethod>('Cash');
  const [referenceNo, setReferenceNo] = useState('');
  const [notes, setNotes] = useState('');
  const [paymentDate, setPaymentDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (due) {
      setAmount(due.balance_amount);
      setError(null);
    }
  }, [due]);

  if (!due) return null;

  const handleAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value) || 0;
    setAmount(val);
    if (val > due.balance_amount) {
      setError(`Amount exceeds outstanding balance (${formatINR(due.balance_amount)})`);
    } else {
      setError(null);
    }
  };

  const handleQuickPay = (full: boolean) => {
    if (full) {
      setAmount(due.balance_amount);
      setError(null);
    } else {
      setAmount(Math.round(due.balance_amount / 2));
      setError(null);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (amount <= 0) {
      setError('Please enter a payment amount greater than zero.');
      return;
    }

    if (amount > due.balance_amount) {
      setError(`Cannot exceed remaining balance of ${formatINR(due.balance_amount)}.`);
      return;
    }

    try {
      setIsSubmitting(true);
      setError(null);
      await onSubmit({
        monthly_due_id: due.id,
        amount,
        payment_method: method,
        reference_no: referenceNo.trim() || undefined,
        notes: notes.trim() || undefined,
        payment_date: paymentDate ? new Date(paymentDate).toISOString() : new Date().toISOString(),
      });
      onSuccess();
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to record payment');
    } finally {
      setIsSubmitting(false);
    }
  };

  const remainingAfterPayment = Math.max(0, due.balance_amount - amount);

  return (
    <div id="payment-modal-backdrop" className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 overflow-y-auto">
      <div id="payment-modal-container" className="bg-white rounded-2xl shadow-2xl max-w-lg w-full overflow-hidden border border-slate-200 animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="bg-slate-900 text-white px-6 py-5 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-emerald-600/30 border border-emerald-400/40 flex items-center justify-center text-emerald-400">
              <CreditCard className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-lg font-bold">Receive Payment</h3>
              <p className="text-xs text-slate-300 mt-0.5">
                Month {due.month_number} ({due.month_name}) • {due.customer_name}
              </p>
            </div>
          </div>
          <button
            id="close-payment-modal-btn"
            onClick={onClose}
            className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-xl flex items-center gap-2.5 text-sm text-red-700">
              <AlertCircle className="w-5 h-5 shrink-0 text-red-600" />
              <span>{error}</span>
            </div>
          )}

          {/* Member Card Summary */}
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
            <div className="flex items-center justify-between">
              <div>
                <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Customer</span>
                <h4 className="text-base font-bold text-slate-900">{due.customer_name}</h4>
                <p className="text-xs text-slate-500">Ticket #{due.ticket_number} • {due.phone}</p>
              </div>
              <span className={`text-xs px-2.5 py-1 rounded-full font-bold ${
                due.status === 'PAID' ? 'bg-emerald-100 text-emerald-800' :
                due.status === 'PARTIAL' ? 'bg-amber-100 text-amber-800' : 'bg-red-100 text-red-800'
              }`}>
                {due.status}
              </span>
            </div>

            <div className="grid grid-cols-3 gap-2 mt-4 pt-3 border-t border-slate-200 text-center">
              <div>
                <p className="text-xs text-slate-500">Total Due</p>
                <p className="text-sm font-bold text-slate-900">{formatINR(due.due_amount)}</p>
              </div>
              <div>
                <p className="text-xs text-slate-500">Already Paid</p>
                <p className="text-sm font-bold text-emerald-600">{formatINR(due.paid_amount)}</p>
              </div>
              <div>
                <p className="text-xs text-slate-500">Remaining</p>
                <p className="text-sm font-bold text-red-600">{formatINR(due.balance_amount)}</p>
              </div>
            </div>
          </div>

          {/* Payment Amount Input */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-sm font-semibold text-slate-800">
                Payment Amount (₹) <span className="text-red-500">*</span>
              </label>
              <div className="flex gap-2 text-xs">
                <button
                  type="button"
                  onClick={() => handleQuickPay(true)}
                  className="text-blue-600 hover:text-blue-800 font-semibold underline underline-offset-2"
                >
                  Pay Full ({formatINR(due.balance_amount)})
                </button>
              </div>
            </div>
            <div className="relative">
              <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500 font-bold text-base">₹</span>
              <input
                id="payment-amount-input"
                type="number"
                min="1"
                max={due.balance_amount}
                step="1"
                required
                value={amount || ''}
                onChange={handleAmountChange}
                className="w-full pl-8 pr-4 py-2.5 bg-white border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 font-mono text-lg font-bold text-slate-900"
                placeholder="Enter amount"
              />
            </div>
            <div className="flex items-center justify-between mt-1 text-xs text-slate-500">
              <span>Status after payment:</span>
              <span className="font-semibold text-slate-700">
                {remainingAfterPayment === 0 ? (
                  <span className="text-emerald-600 font-bold">PAID (₹0 remaining)</span>
                ) : (
                  <span className="text-amber-600 font-bold">PARTIAL ({formatINR(remainingAfterPayment)} remaining)</span>
                )}
              </span>
            </div>
          </div>

          {/* Payment Method */}
          <div>
            <label className="block text-sm font-semibold text-slate-800 mb-2">Payment Method</label>
            <div className="grid grid-cols-3 gap-2">
              {[
                { id: 'Cash', label: 'Cash', icon: Banknote },
                { id: 'UPI', label: 'UPI / GPay', icon: Smartphone },
                { id: 'Bank Transfer', label: 'Bank (NEFT)', icon: CreditCard },
                { id: 'Cheque', label: 'Cheque', icon: FileText },
                { id: 'Other', label: 'Other', icon: CreditCard },
              ].map(opt => {
                const Icon = opt.icon;
                const isSelected = method === opt.id;
                return (
                  <button
                    type="button"
                    key={opt.id}
                    onClick={() => setMethod(opt.id as PaymentMethod)}
                    className={`flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl border text-xs font-semibold transition-all ${
                      isSelected
                        ? 'border-blue-600 bg-blue-50 text-blue-700 ring-2 ring-blue-500/20'
                        : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    <Icon className="w-3.5 h-3.5 shrink-0" />
                    <span className="truncate">{opt.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Reference & Date */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Ref / Txn ID / Cheque #
              </label>
              <input
                id="payment-ref-input"
                type="text"
                value={referenceNo}
                onChange={(e) => setReferenceNo(e.target.value)}
                placeholder="e.g. UPI-129487"
                className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Payment Date</label>
              <input
                id="payment-date-input"
                type="date"
                value={paymentDate}
                onChange={(e) => setPaymentDate(e.target.value)}
                className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Notes (Optional)</label>
            <input
              id="payment-notes-input"
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. Paid in office / receipt given"
              className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>

          {/* Actions */}
          <div className="pt-2 flex items-center justify-end gap-3 border-t border-slate-200">
            <button
              id="cancel-payment-btn"
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100 rounded-xl transition-colors"
            >
              Cancel
            </button>
            <button
              id="save-payment-btn"
              type="submit"
              disabled={isSubmitting || amount <= 0}
              className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white text-sm font-bold rounded-xl shadow-sm hover:shadow transition-all disabled:opacity-50 flex items-center gap-2 cursor-pointer"
            >
              {isSubmitting ? (
                <span>Receiving...</span>
              ) : (
                <>
                  <CheckCircle className="w-4 h-4" />
                  <span>RECEIVE PAYMENT ({formatINR(amount)})</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
