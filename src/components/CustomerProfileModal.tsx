import React, { useState, useEffect } from 'react';
import {
  X,
  User,
  Award,
  Calendar,
  CreditCard,
  Hash,
  FileText,
  AlertCircle,
  CheckCircle,
  Clock,
  Phone,
  Edit2
} from 'lucide-react';
import { Member, MonthlyDue, Payment } from '../types';
import { api } from '../services/api';
import { formatINR, formatDate, formatDateTime, formatDDMMYYYY } from '../utils/formatters';

interface CustomerProfileModalProps {
  memberId: string | null;
  onClose: () => void;
  onRecordPaymentClick?: (due: MonthlyDue) => void;
  onOpenLift?: (chitId: string, memberId: string, isLifted: boolean, liftMonth?: number | null) => void;
}

interface ProfileData {
  member: Member & {
    chit_name: string;
    chit_value: number;
    total_months: number;
    start_month: string;
    end_month: string;
    lift_payment_method?: string;
    lift_reference_number?: string;
    lift_status_text?: string;
  };
  dues: MonthlyDue[];
  payments: Payment[];
  total_paid: number;
  total_outstanding: number;
}

export const CustomerProfileModal: React.FC<CustomerProfileModalProps> = ({
  memberId,
  onClose,
  onRecordPaymentClick,
  onOpenLift,
}) => {
  const [data, setData] = useState<ProfileData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'schedule' | 'history'>('schedule');

  useEffect(() => {
    if (!memberId) return;
    setLoading(true);
    setError(null);
    api.members
      .getProfile(memberId)
      .then((res) => {
        setData(res as ProfileData);
      })
      .catch((err) => {
        setError(err.message || 'Failed to load customer profile');
      })
      .finally(() => {
        setLoading(false);
      });
  }, [memberId]);

  if (!memberId) return null;

  const isLifted = data?.member.lift_status === 'lifted';
  const liftAmount = data?.member.lift_amount_received ?? data?.member.lift_amount ?? 0;
  const paymentMethod = data?.member.payment_method || data?.member.lift_payment_method || 'Cash';
  const referenceNumber = data?.member.reference_number || data?.member.lift_reference_number || '';
  const liftNotes = data?.member.lift_notes || '';
  const formattedLiftDate = formatDDMMYYYY(data?.member.lift_date);

  return (
    <div
      id="customer-profile-backdrop"
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-3 sm:p-4 overflow-y-auto"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        id="customer-profile-container"
        className="bg-white rounded-2xl shadow-2xl max-w-3xl w-full max-h-[92vh] flex flex-col overflow-hidden border border-slate-200 animate-in fade-in zoom-in-95 duration-200 my-4"
      >
        {/* Header */}
        <div className="bg-slate-900 text-white px-6 py-4 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-600 flex items-center justify-center text-white font-bold text-base">
              {data?.member.customer_name ? data.member.customer_name[0].toUpperCase() : 'C'}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-white">{data?.member.customer_name || 'Customer Profile'}</h3>
                {data?.member.ticket_number && (
                  <span className="text-xs font-mono bg-slate-800 text-blue-300 px-2 py-0.5 rounded-full border border-slate-700">
                    Ticket #{data.member.ticket_number}
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-400 mt-0.5 flex items-center gap-2">
                <span>{data?.member.phone}</span>
                <span>•</span>
                <span>{data?.member.chit_name} ({formatINR(data?.member.chit_value)})</span>
              </p>
            </div>
          </div>
          <button
            id="close-profile-modal-btn"
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition-colors cursor-pointer"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {loading ? (
          <div className="p-12 text-center text-slate-500">
            <div className="inline-block w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mb-3"></div>
            <p className="text-sm font-medium">Loading customer profile...</p>
          </div>
        ) : error || !data ? (
          <div className="p-8 text-center text-red-600">
            <AlertCircle className="w-8 h-8 mx-auto mb-2 text-red-500" />
            <p className="text-sm">{error || 'Customer not found'}</p>
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto p-6 space-y-6">
            {/* Top Stat Overview */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5">
                <span className="text-[11px] text-slate-500 font-bold uppercase tracking-wider block">Total Paid</span>
                <span className="text-lg font-extrabold text-emerald-600 font-mono mt-1 block">
                  {formatINR(data.total_paid)}
                </span>
              </div>
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5">
                <span className="text-[11px] text-slate-500 font-bold uppercase tracking-wider block">Outstanding</span>
                <span className="text-lg font-extrabold text-red-600 font-mono mt-1 block">
                  {formatINR(data.total_outstanding)}
                </span>
              </div>
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5">
                <span className="text-[11px] text-slate-500 font-bold uppercase tracking-wider block">Lift Status</span>
                <div className="mt-1">
                  {isLifted ? (
                    <button
                      type="button"
                      onClick={() => onOpenLift?.(data.member.chit_id, data.member.id, true, data.member.lift_month)}
                      disabled={!onOpenLift}
                      className={`inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-full font-bold bg-purple-100 text-purple-800 border border-purple-200 ${onOpenLift ? 'hover:bg-purple-200 cursor-pointer active:scale-95' : ''} transition-all`}
                    >
                      <Award className="w-3 h-3" />
                      <span>LIFTED (M{data.member.lift_month})</span>
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => onOpenLift?.(data.member.chit_id, data.member.id, false, null)}
                      disabled={!onOpenLift}
                      className={`text-xs px-2.5 py-1 rounded-full font-bold bg-slate-100 text-slate-700 border border-slate-200 ${onOpenLift ? 'hover:bg-purple-50 hover:text-purple-700 hover:border-purple-300 cursor-pointer active:scale-95' : ''} transition-all`}
                    >
                      NOT LIFTED
                    </button>
                  )}
                </div>
              </div>
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5">
                <span className="text-[11px] text-slate-500 font-bold uppercase tracking-wider block">Duration</span>
                <span className="text-xs font-semibold text-slate-800 mt-1.5 block truncate">
                  {data.member.start_month} — {data.member.end_month}
                </span>
              </div>
            </div>

            {/* SECTION 1: BASIC DETAILS & SECTION 2: CHIT DETAILS */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* BASIC DETAILS */}
              <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-2xs">
                <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                  <User className="w-3.5 h-3.5 text-blue-600" />
                  <span>BASIC DETAILS</span>
                </h4>
                <div className="space-y-2.5 text-xs">
                  <div className="flex justify-between items-center py-1 border-b border-slate-100">
                    <span className="text-slate-500 font-medium">Customer Name</span>
                    <span className="font-bold text-slate-900">{data.member.customer_name}</span>
                  </div>
                  <div className="flex justify-between items-center py-1 border-b border-slate-100">
                    <span className="text-slate-500 font-medium">Phone</span>
                    <span className="font-mono font-bold text-slate-900">{data.member.phone}</span>
                  </div>
                  <div className="flex justify-between items-center py-1">
                    <span className="text-slate-500 font-medium">Ticket Number</span>
                    <span className="font-mono font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded-md">
                      #{data.member.ticket_number}
                    </span>
                  </div>
                </div>
              </div>

              {/* CHIT DETAILS */}
              <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-2xs">
                <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                  <CreditCard className="w-3.5 h-3.5 text-emerald-600" />
                  <span>CHIT DETAILS</span>
                </h4>
                <div className="space-y-2.5 text-xs">
                  <div className="flex justify-between items-center py-1 border-b border-slate-100">
                    <span className="text-slate-500 font-medium">Chit Name</span>
                    <span className="font-bold text-slate-900">{data.member.chit_name}</span>
                  </div>
                  <div className="flex justify-between items-center py-1 border-b border-slate-100">
                    <span className="text-slate-500 font-medium">Chit Value</span>
                    <span className="font-mono font-bold text-slate-900">{formatINR(data.member.chit_value)}</span>
                  </div>
                  <div className="flex justify-between items-center py-1 border-b border-slate-100">
                    <span className="text-slate-500 font-medium">Start Month</span>
                    <span className="font-semibold text-slate-800">{data.member.start_month}</span>
                  </div>
                  <div className="flex justify-between items-center py-1">
                    <span className="text-slate-500 font-medium">End Month</span>
                    <span className="font-semibold text-slate-800">{data.member.end_month}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* SECTION 3: CHIT LIFT DETAILS */}
            <div className="bg-white border border-purple-200 rounded-2xl p-5 shadow-2xs">
              <div className="flex items-center justify-between mb-4 border-b border-purple-100 pb-3">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-lg bg-purple-100 flex items-center justify-center text-purple-700">
                    <Award className="w-4 h-4" />
                  </div>
                  <h4 className="text-sm font-bold text-purple-950 uppercase tracking-wider">
                    CHIT LIFT DETAILS
                  </h4>
                </div>
                {isLifted ? (
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-purple-800 bg-purple-100 border border-purple-200 px-2.5 py-1 rounded-full">
                      LIFTED
                    </span>
                    {onOpenLift && (
                      <button
                        type="button"
                        id="profile-edit-lift-btn"
                        onClick={() => onOpenLift(data.member.chit_id, data.member.id, true, data.member.lift_month)}
                        className="inline-flex items-center gap-1 text-xs font-bold text-blue-700 bg-blue-50 border border-blue-200 hover:bg-blue-100 px-2.5 py-1 rounded-lg transition-colors cursor-pointer"
                      >
                        <Edit2 className="w-3 h-3" />
                        <span>Edit Lift</span>
                      </button>
                    )}
                  </div>
                ) : (
                  <span className="text-xs font-bold text-slate-600 bg-slate-100 border border-slate-200 px-2.5 py-1 rounded-full">
                    NOT LIFTED
                  </span>
                )}
              </div>

              {isLifted ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-y-3.5 gap-x-6 text-xs">
                  <div>
                    <span className="text-slate-500 font-semibold block uppercase tracking-wider text-[11px]">
                      Customer Name:
                    </span>
                    <span className="font-bold text-slate-900 text-sm block mt-0.5">
                      {data.member.customer_name}
                    </span>
                  </div>

                  <div>
                    <span className="text-slate-500 font-semibold block uppercase tracking-wider text-[11px]">
                      Phone:
                    </span>
                    <span className="font-mono font-bold text-slate-800 block mt-0.5">
                      {data.member.phone}
                    </span>
                  </div>

                  <div>
                    <span className="text-slate-500 font-semibold block uppercase tracking-wider text-[11px]">
                      Chit:
                    </span>
                    <span className="font-bold text-slate-900 block mt-0.5">
                      {formatINR(data.member.chit_value)} Chit
                    </span>
                  </div>

                  <div>
                    <span className="text-slate-500 font-semibold block uppercase tracking-wider text-[11px]">
                      Lift Status:
                    </span>
                    <span className="font-bold text-purple-800 block mt-0.5">
                      LIFTED
                    </span>
                  </div>

                  <div>
                    <span className="text-slate-500 font-semibold block uppercase tracking-wider text-[11px]">
                      Lift Month:
                    </span>
                    <span className="font-bold text-purple-900 text-sm block mt-0.5">
                      Month {data.member.lift_month}
                    </span>
                  </div>

                  <div>
                    <span className="text-slate-500 font-semibold block uppercase tracking-wider text-[11px]">
                      Lift Date:
                    </span>
                    <span className="font-mono font-bold text-slate-900 block mt-0.5">
                      {formattedLiftDate}
                    </span>
                  </div>

                  <div>
                    <span className="text-slate-500 font-semibold block uppercase tracking-wider text-[11px]">
                      Lift Amount:
                    </span>
                    <span className="font-mono font-extrabold text-purple-700 text-base block mt-0.5">
                      {formatINR(liftAmount)}
                    </span>
                  </div>

                  <div>
                    <span className="text-slate-500 font-semibold block uppercase tracking-wider text-[11px]">
                      Payment Method:
                    </span>
                    <span className="inline-block font-bold text-slate-800 bg-slate-100 border border-slate-200 px-2.5 py-1 rounded-md mt-0.5">
                      {paymentMethod}
                    </span>
                  </div>

                  <div className="sm:col-span-2">
                    <span className="text-slate-500 font-semibold block uppercase tracking-wider text-[11px]">
                      Reference Number:
                    </span>
                    <span className="font-mono font-medium text-slate-800 block mt-0.5">
                      {referenceNumber || '—'}
                    </span>
                  </div>

                  <div className="sm:col-span-2">
                    <span className="text-slate-500 font-semibold block uppercase tracking-wider text-[11px]">
                      Notes:
                    </span>
                    <p className="text-slate-700 mt-1 bg-slate-50 border border-slate-200 p-2.5 rounded-lg whitespace-pre-wrap">
                      {liftNotes || '—'}
                    </p>
                  </div>
                </div>
              ) : (
                <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl text-center space-y-2">
                  <p className="text-xs text-slate-600">
                    This customer has not lifted the chit yet.
                  </p>
                  {onOpenLift && (
                    <button
                      type="button"
                      onClick={() => onOpenLift(data.member.chit_id, data.member.id, false, null)}
                      className="px-4 py-2 text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white rounded-xl shadow-xs transition-colors cursor-pointer"
                    >
                      Mark as Lifted
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* SECTION 4: PAYMENT HISTORY / MONTHLY SCHEDULE */}
            <div className="space-y-3">
              {/* Tab buttons */}
              <div className="flex items-center gap-2 border-b border-slate-200 pb-2">
                <button
                  id="profile-tab-schedule-btn"
                  type="button"
                  onClick={() => setActiveTab('schedule')}
                  className={`px-4 py-2 text-xs font-bold rounded-xl transition-all cursor-pointer ${
                    activeTab === 'schedule'
                      ? 'bg-blue-600 text-white shadow-xs'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                  }`}
                >
                  Monthly Schedule ({data.dues.length})
                </button>
                <button
                  id="profile-tab-history-btn"
                  type="button"
                  onClick={() => setActiveTab('history')}
                  className={`px-4 py-2 text-xs font-bold rounded-xl transition-all cursor-pointer ${
                    activeTab === 'history'
                      ? 'bg-blue-600 text-white shadow-xs'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                  }`}
                >
                  Payment History ({data.payments.length})
                </button>
              </div>

              {/* Tab: Monthly Schedule */}
              {activeTab === 'schedule' && (
                <div className="overflow-x-auto border border-slate-200 rounded-xl">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead className="bg-slate-100 text-slate-700 font-semibold border-b border-slate-200">
                      <tr>
                        <th className="py-2.5 px-3">Month</th>
                        <th className="py-2.5 px-3 text-right">Due Amount</th>
                        <th className="py-2.5 px-3 text-right">Paid</th>
                        <th className="py-2.5 px-3 text-right">Balance</th>
                        <th className="py-2.5 px-3 text-center">Status</th>
                        <th className="py-2.5 px-3 text-right">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {data.dues.map((due) => {
                        const isLiftMonth = data.member.lift_month === due.month_number;
                        const isPostLift = data.member.lift_month && due.month_number > data.member.lift_month;

                        return (
                          <tr key={due.id} className="hover:bg-slate-50 transition-colors">
                            <td className="py-2.5 px-3 font-medium text-slate-800">
                              <span>Month {due.month_number}</span>
                              <span className="text-slate-500 block text-[11px]">{due.month_name}</span>
                              {isLiftMonth && (
                                <span className="inline-block text-[10px] text-purple-700 font-bold bg-purple-50 px-1.5 py-0.2 rounded mt-0.5">
                                  Lift Month
                                </span>
                              )}
                              {isPostLift && (
                                <span className="inline-block text-[10px] text-indigo-700 font-semibold bg-indigo-50 px-1.5 py-0.2 rounded mt-0.5">
                                  Post-Lift
                                </span>
                              )}
                            </td>
                            <td className="py-2.5 px-3 text-right font-mono font-medium text-slate-900">
                              {formatINR(due.due_amount)}
                            </td>
                            <td className="py-2.5 px-3 text-right font-mono font-bold text-emerald-600">
                              {formatINR(due.paid_amount)}
                            </td>
                            <td className="py-2.5 px-3 text-right font-mono font-bold text-red-600">
                              {formatINR(due.balance_amount)}
                            </td>
                            <td className="py-2.5 px-3 text-center">
                              <span
                                className={`inline-block px-2 py-0.5 text-[10px] font-bold rounded-full ${
                                  due.status === 'PAID'
                                    ? 'bg-emerald-100 text-emerald-800'
                                    : due.status === 'PARTIAL'
                                    ? 'bg-amber-100 text-amber-800'
                                    : 'bg-red-100 text-red-800'
                                }`}
                              >
                                {due.status}
                              </span>
                            </td>
                            <td className="py-2.5 px-3 text-right">
                              {due.status !== 'PAID' && onRecordPaymentClick && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    onRecordPaymentClick(due);
                                    onClose();
                                  }}
                                  className="px-2.5 py-1 text-[11px] font-bold bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg transition-colors cursor-pointer"
                                >
                                  Pay
                                </button>
                              )}
                              {due.status === 'PAID' && (
                                <span className="text-emerald-600 text-xs font-bold inline-flex items-center gap-1">
                                  <CheckCircle className="w-3.5 h-3.5" />
                                </span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Tab: Payment History */}
              {activeTab === 'history' && (
                <div>
                  {data.payments.length === 0 ? (
                    <div className="p-8 text-center bg-slate-50 border border-slate-200 rounded-xl text-slate-500 text-xs">
                      No payment transactions recorded yet for this customer.
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {data.payments.map((p) => (
                        <div
                          key={p.id}
                          className="bg-white border border-slate-200 rounded-xl p-3.5 shadow-xs hover:border-blue-300 transition-colors flex items-center justify-between"
                        >
                          <div className="space-y-1">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-bold text-slate-900 font-mono">
                                {formatINR(p.amount)}
                              </span>
                              <span className="text-xs px-2 py-0.5 rounded-full font-semibold bg-blue-50 text-blue-700 border border-blue-200">
                                {p.payment_method}
                              </span>
                              <span className="text-xs font-semibold text-slate-600">
                                Month {p.month_number} ({p.month_name})
                              </span>
                            </div>
                            <div className="text-xs text-slate-500 flex items-center gap-3">
                              <span className="flex items-center gap-1">
                                <Calendar className="w-3 h-3 text-slate-400" />
                                {formatDateTime(p.payment_date)}
                              </span>
                              {p.reference_no && (
                                <span className="font-mono text-slate-600">
                                  Ref: {p.reference_no}
                                </span>
                              )}
                            </div>
                            {p.notes && (
                              <p className="text-xs text-slate-500 italic mt-0.5">Note: {p.notes}</p>
                            )}
                          </div>
                          <div className="text-emerald-600 bg-emerald-50 px-2.5 py-1 rounded-lg text-xs font-bold border border-emerald-200 shrink-0">
                            Paid
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="bg-slate-50 px-6 py-3 border-t border-slate-200 flex justify-end shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2 text-xs font-bold text-slate-700 hover:bg-slate-200 rounded-xl transition-colors cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
