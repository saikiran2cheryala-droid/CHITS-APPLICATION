import React from 'react';
import { X, Award, Phone, Calendar, CreditCard, Hash, FileText, CheckCircle2, Edit2 } from 'lucide-react';
import { Member, Chit } from '../types';
import { formatINR, formatDDMMYYYY } from '../utils/formatters';

interface LiftDetailsModalProps {
  isOpen: boolean;
  member: Member | null;
  chit: Chit | null;
  onClose: () => void;
  onEditLift: (member: Member) => void;
}

export const LiftDetailsModal: React.FC<LiftDetailsModalProps> = ({
  isOpen,
  member,
  chit,
  onClose,
  onEditLift,
}) => {
  if (!isOpen || !member) return null;

  const paymentMethod = member.payment_method || member.lift_payment_method || 'Cash';
  const referenceNumber = member.reference_number || member.lift_reference_number || '';
  const notes = member.lift_notes || (member as any).notes || '';
  const liftAmount = member.lift_amount_received ?? member.lift_amount ?? 0;
  const formattedDate = formatDDMMYYYY(member.lift_date);

  return (
    <div
      id="lift-details-modal-backdrop"
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        id="lift-details-modal-container"
        className="bg-white rounded-2xl shadow-xl max-w-md w-full overflow-hidden border border-slate-200 animate-in fade-in zoom-in-95 duration-150"
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-purple-50/60">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-purple-100 flex items-center justify-center text-purple-700">
              <Award className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-base font-bold text-purple-950 tracking-tight">
                CHIT LIFT DETAILS
              </h3>
              <p className="text-xs text-purple-700">
                Lift Status: <span className="font-bold text-purple-900">LIFTED</span>
              </p>
            </div>
          </div>
          <button
            id="close-lift-details-x-btn"
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-slate-700 p-1.5 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 space-y-4">
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 divide-y divide-slate-200/80 space-y-3">
            {/* Customer & Phone */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pb-1">
              <div>
                <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block">
                  Customer:
                </span>
                <span className="text-sm font-bold text-slate-900 block mt-0.5">
                  {member.customer_name}
                </span>
              </div>
              <div>
                <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block">
                  Phone:
                </span>
                <span className="text-xs font-mono font-medium text-slate-700 block mt-0.5">
                  {member.phone}
                </span>
              </div>
            </div>

            {/* Chit & Lift Month */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-3 pb-1">
              <div>
                <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block">
                  Chit:
                </span>
                <span className="text-sm font-semibold text-slate-900 block mt-0.5">
                  {chit?.name ? `${chit.name} (${formatINR(chit.chit_value)})` : (chit?.chit_value ? formatINR(chit.chit_value) : '—')}
                </span>
              </div>
              <div>
                <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block">
                  Lift Month:
                </span>
                <span className="text-sm font-bold text-purple-900 block mt-0.5">
                  Month {member.lift_month || '—'}
                </span>
              </div>
            </div>

            {/* Lift Date & Lift Amount */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-3 pb-1">
              <div>
                <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block">
                  Lift Date:
                </span>
                <span className="text-sm font-mono font-bold text-slate-800 block mt-0.5">
                  {formattedDate}
                </span>
              </div>
              <div>
                <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block">
                  Lift Amount:
                </span>
                <span className="text-base font-extrabold font-mono text-purple-700 block mt-0.5">
                  {formatINR(liftAmount)}
                </span>
              </div>
            </div>

            {/* Payment Method & Reference Number */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-3 pb-1">
              <div>
                <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block">
                  Payment Method:
                </span>
                <span className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-800 bg-white border border-slate-200 px-2.5 py-1 rounded-lg mt-0.5">
                  {paymentMethod}
                </span>
              </div>
              <div>
                <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block">
                  Reference Number:
                </span>
                <span className="text-xs font-mono font-medium text-slate-700 block mt-1 break-all">
                  {referenceNumber || '—'}
                </span>
              </div>
            </div>

            {/* Notes */}
            <div className="pt-3">
              <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block">
                Notes:
              </span>
              <p className="text-xs text-slate-700 mt-1 bg-white border border-slate-200 p-2.5 rounded-lg whitespace-pre-wrap">
                {notes || 'No notes entered by admin'}
              </p>
            </div>
          </div>

          {/* Action Buttons: [ Close ] [ Edit Lift ] */}
          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              id="close-lift-details-btn"
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-800 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
            >
              Close
            </button>
            <button
              id="edit-lift-details-btn"
              type="button"
              onClick={() => onEditLift(member)}
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
