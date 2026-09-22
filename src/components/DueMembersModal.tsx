import React, { useState, useEffect } from 'react';
import {
  X,
  Search,
  Filter,
  CreditCard,
  User,
  Phone,
  MessageCircle,
  AlertCircle,
  CheckCircle2,
  Clock,
  Layers,
  RefreshCw,
  ExternalLink,
} from 'lucide-react';
import { MonthlyDue, Chit } from '../types';
import { formatINR } from '../utils/formatters';
import { api } from '../services/api';

interface DueMembersModalProps {
  isOpen: boolean;
  onClose: () => void;
  chits: Chit[];
  onRecordPayment: (due: MonthlyDue) => void;
  onOpenCustomerProfile?: (memberId: string) => void;
  onSelectChit?: (chitId: string) => void;
}

export const DueMembersModal: React.FC<DueMembersModalProps> = ({
  isOpen,
  onClose,
  chits,
  onRecordPayment,
  onOpenCustomerProfile,
  onSelectChit,
}) => {
  const [dues, setDues] = useState<MonthlyDue[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [selectedChitId, setSelectedChitId] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [currentOnly, setCurrentOnly] = useState<boolean>(true);

  const fetchDueMembers = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.dues.getPending({
        chit_id: selectedChitId === 'ALL' ? undefined : selectedChitId,
        current_only: currentOnly,
      });
      setDues(res.dues || []);
    } catch (err: any) {
      console.error('Failed to fetch due members:', err);
      setError(err.message || 'Failed to load due members');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchDueMembers();
    }
  }, [isOpen, selectedChitId, currentOnly]);

  if (!isOpen) return null;

  // Filter dues by client-side search query
  const filteredDues = dues.filter((due) => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return true;
    const nameMatch = (due.customer_name || '').toLowerCase().includes(q);
    const phoneMatch = (due.phone || '').includes(q);
    const ticketMatch = (due.ticket_number || '').toLowerCase().includes(q);
    const chitMatch = (due.chit_name || '').toLowerCase().includes(q);
    return nameMatch || phoneMatch || ticketMatch || chitMatch;
  });

  const totalFilteredPending = filteredDues.reduce((sum, d) => sum + (d.balance_amount || 0), 0);
  const activeChits = chits.filter((c) => c.status === 'active');

  const handleWhatsAppReminder = (due: MonthlyDue) => {
    const cleanPhone = (due.phone || '').replace(/\D/g, '');
    const phoneWithCountry = cleanPhone.length === 10 ? `91${cleanPhone}` : cleanPhone;
    const chitName = due.chit_name || 'Chit Fund';
    const amountStr = formatINR(due.balance_amount);
    const message = encodeURIComponent(
      `Namaste ${due.customer_name || 'Member'}, this is a gentle reminder regarding your chit instalment for *${chitName}* (Month ${due.month_number}).\n\nPending Due: *${amountStr}*.\n\nPlease clear the instalment at your earliest convenience. Thank you!`
    );
    window.open(`https://wa.me/${phoneWithCountry}?text=${message}`, '_blank');
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/70 backdrop-blur-xs animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-3xl shadow-2xl border border-slate-200 w-full max-w-4xl max-h-[92vh] flex flex-col overflow-hidden text-slate-900"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="p-5 sm:p-6 bg-slate-900 text-white flex items-center justify-between border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-amber-500/20 border border-amber-500/30 flex items-center justify-center text-amber-400">
              <AlertCircle className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg sm:text-xl font-black text-white tracking-tight">
                  Due Members Overview
                </h2>
                <span className="text-[11px] font-bold bg-amber-500/20 text-amber-300 px-2.5 py-0.5 rounded-full border border-amber-500/30">
                  {filteredDues.length} Pending
                </span>
              </div>
              <p className="text-xs text-slate-300 mt-0.5">
                Outstanding instalments across active chit groups with 1-click collection
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={fetchDueMembers}
              disabled={loading}
              title="Refresh Dues List"
              className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors disabled:opacity-50 cursor-pointer"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
            <button
              onClick={onClose}
              className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Quick KPI Bar & Filters */}
        <div className="bg-slate-50 border-b border-slate-200 p-4 sm:p-5 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="bg-white p-3 rounded-2xl border border-slate-200 shadow-2xs flex items-center justify-between">
              <div>
                <span className="text-[11px] font-semibold text-slate-500 uppercase block">
                  Pending Balance
                </span>
                <span className="text-lg font-black font-mono text-rose-600">
                  {formatINR(totalFilteredPending)}
                </span>
              </div>
              <div className="w-9 h-9 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center font-bold">
                ₹
              </div>
            </div>

            <div className="bg-white p-3 rounded-2xl border border-slate-200 shadow-2xs flex items-center justify-between">
              <div>
                <span className="text-[11px] font-semibold text-slate-500 uppercase block">
                  Due Members Count
                </span>
                <span className="text-lg font-black font-mono text-slate-900">
                  {filteredDues.length}
                </span>
              </div>
              <div className="w-9 h-9 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
                <Clock className="w-4 h-4" />
              </div>
            </div>

            <div className="bg-white p-3 rounded-2xl border border-slate-200 shadow-2xs flex items-center justify-between">
              <div>
                <span className="text-[11px] font-semibold text-slate-500 uppercase block">
                  Chit Scope
                </span>
                <span className="text-sm font-bold text-slate-800 truncate block">
                  {selectedChitId === 'ALL'
                    ? 'All Active Chits'
                    : chits.find((c) => c.id === selectedChitId)?.name || 'Filtered Chit'}
                </span>
              </div>
              <div className="w-9 h-9 rounded-xl bg-slate-100 text-slate-600 flex items-center justify-center">
                <Layers className="w-4 h-4" />
              </div>
            </div>
          </div>

          {/* Search and Filters row */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Search by customer name, phone, ticket #, or chit..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-4 py-2 bg-white rounded-xl border border-slate-200 text-xs sm:text-sm text-slate-900 placeholder:text-slate-400 focus:outline-hidden focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all shadow-2xs"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-xs"
                >
                  Clear
                </button>
              )}
            </div>

            <div className="flex items-center gap-2">
              <div className="relative">
                <select
                  value={selectedChitId}
                  onChange={(e) => setSelectedChitId(e.target.value)}
                  className="bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-semibold text-slate-700 focus:outline-hidden focus:ring-2 focus:ring-blue-500 shadow-2xs cursor-pointer"
                >
                  <option value="ALL">All Active Chits ({activeChits.length})</option>
                  {activeChits.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} (M{c.current_month || 1})
                    </option>
                  ))}
                </select>
              </div>

              <button
                type="button"
                onClick={() => setCurrentOnly(!currentOnly)}
                className={`px-3 py-2 rounded-xl text-xs font-bold transition-colors cursor-pointer border ${
                  currentOnly
                    ? 'bg-blue-50 border-blue-200 text-blue-700'
                    : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                }`}
                title={currentOnly ? 'Showing Current Month only' : 'Showing all unpaid months'}
              >
                {currentOnly ? 'Current Month' : 'All Months'}
              </button>
            </div>
          </div>
        </div>

        {/* Content list */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-3 min-h-[300px]">
          {loading ? (
            <div className="py-16 text-center space-y-3">
              <div className="w-8 h-8 border-3 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto" />
              <p className="text-xs font-semibold text-slate-500">Loading pending due members...</p>
            </div>
          ) : error ? (
            <div className="py-12 text-center space-y-2">
              <AlertCircle className="w-8 h-8 text-rose-500 mx-auto" />
              <p className="text-sm font-bold text-slate-800">{error}</p>
              <button
                onClick={fetchDueMembers}
                className="text-xs text-blue-600 hover:underline font-semibold"
              >
                Try Again
              </button>
            </div>
          ) : filteredDues.length === 0 ? (
            <div className="py-16 text-center space-y-3">
              <div className="w-12 h-12 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center mx-auto border border-emerald-100">
                <CheckCircle2 className="w-6 h-6" />
              </div>
              <h3 className="text-base font-bold text-slate-900">All Caught Up!</h3>
              <p className="text-xs text-slate-500 max-w-sm mx-auto">
                {searchQuery
                  ? 'No due members match your search criteria.'
                  : 'There are no pending dues for the selected filter.'}
              </p>
            </div>
          ) : (
            <div className="space-y-2.5">
              {filteredDues.map((due) => (
                <div
                  key={due.id}
                  className="bg-white rounded-2xl border border-slate-200 hover:border-blue-300 p-3.5 sm:p-4 shadow-2xs hover:shadow-xs transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                >
                  {/* Member info */}
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 rounded-xl bg-slate-100 text-slate-700 flex items-center justify-center font-black text-sm shrink-0 border border-slate-200">
                      {due.ticket_number || (due.customer_name || 'M')[0]}
                    </div>
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-bold text-sm text-slate-900">
                          {due.customer_name || 'Member'}
                        </span>
                        {due.ticket_number && (
                          <span className="text-[10px] font-bold bg-slate-100 text-slate-600 px-2 py-0.5 rounded-md font-mono">
                            T-{due.ticket_number}
                          </span>
                        )}
                        <span
                          className={`text-[10px] font-bold px-2 py-0.5 rounded-md ${
                            due.status === 'PARTIAL'
                              ? 'bg-amber-50 text-amber-700 border border-amber-200'
                              : 'bg-rose-50 text-rose-700 border border-rose-200'
                          }`}
                        >
                          {due.status}
                        </span>
                      </div>

                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500 mt-1">
                        <span className="font-medium text-slate-700">
                          {due.chit_name || 'Chit Group'}
                        </span>
                        <span>•</span>
                        <span className="text-blue-600 font-semibold">
                          Month {due.month_number}
                        </span>
                        {due.phone && (
                          <>
                            <span>•</span>
                            <span className="font-mono text-slate-600">{due.phone}</span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Financial & Action Buttons */}
                  <div className="flex items-center justify-between sm:justify-end gap-3 pt-2 sm:pt-0 border-t sm:border-t-0 border-slate-100">
                    <div className="text-left sm:text-right">
                      <span className="text-[10px] font-semibold text-slate-400 uppercase block">
                        Outstanding Due
                      </span>
                      <span className="text-base font-black font-mono text-rose-600 block">
                        {formatINR(due.balance_amount)}
                      </span>
                      {due.paid_amount > 0 && (
                        <span className="text-[10px] text-emerald-600 font-medium">
                          {formatINR(due.paid_amount)} paid
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-1.5">
                      {/* WhatsApp Reminder */}
                      {due.phone && (
                        <button
                          type="button"
                          onClick={() => handleWhatsAppReminder(due)}
                          title="Send WhatsApp Payment Reminder"
                          className="p-2 rounded-xl text-emerald-600 hover:bg-emerald-50 border border-emerald-200 transition-colors cursor-pointer"
                        >
                          <MessageCircle className="w-4 h-4" />
                        </button>
                      )}

                      {/* Phone Call */}
                      {due.phone && (
                        <a
                          href={`tel:${due.phone}`}
                          title="Call Member"
                          className="p-2 rounded-xl text-slate-600 hover:bg-slate-100 border border-slate-200 transition-colors cursor-pointer"
                        >
                          <Phone className="w-4 h-4" />
                        </a>
                      )}

                      {/* Profile View */}
                      {onOpenCustomerProfile && (
                        <button
                          type="button"
                          onClick={() => onOpenCustomerProfile(due.member_id)}
                          title="View Customer Profile"
                          className="p-2 rounded-xl text-slate-600 hover:bg-slate-100 border border-slate-200 transition-colors cursor-pointer"
                        >
                          <User className="w-4 h-4" />
                        </button>
                      )}

                      {/* 1-Click Receive Payment */}
                      <button
                        type="button"
                        onClick={() => {
                          onClose();
                          onRecordPayment(due);
                        }}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold shadow-xs transition-colors cursor-pointer shrink-0"
                      >
                        <CreditCard className="w-3.5 h-3.5" />
                        <span>Receive Pay</span>
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="p-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between text-xs text-slate-500">
          <span>
            Showing {filteredDues.length} due {filteredDues.length === 1 ? 'record' : 'records'}
          </span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-white hover:bg-slate-100 border border-slate-200 text-slate-700 font-semibold rounded-xl transition-colors cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
