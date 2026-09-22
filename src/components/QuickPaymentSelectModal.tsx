import React, { useState, useEffect } from 'react';
import {
  X,
  Search,
  CreditCard,
  AlertCircle,
  Clock,
  ArrowRight,
  Filter,
  CheckCircle2,
  RefreshCw,
} from 'lucide-react';
import { MonthlyDue, Chit } from '../types';
import { formatINR } from '../utils/formatters';
import { api } from '../services/api';

interface QuickPaymentSelectModalProps {
  isOpen: boolean;
  onClose: () => void;
  chits: Chit[];
  onSelectDue: (due: MonthlyDue) => void;
}

export const QuickPaymentSelectModal: React.FC<QuickPaymentSelectModalProps> = ({
  isOpen,
  onClose,
  chits,
  onSelectDue,
}) => {
  const [dues, setDues] = useState<MonthlyDue[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedChitId, setSelectedChitId] = useState<string>('ALL');

  const fetchDues = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.dues.getPending({
        chit_id: selectedChitId === 'ALL' ? undefined : selectedChitId,
        current_only: false, // Allow recording for any unpaid month
      });
      setDues(res.dues || []);
    } catch (err: any) {
      console.error('Failed to load pending dues for payment selection:', err);
      setError(err.message || 'Failed to load pending dues');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchDues();
    }
  }, [isOpen, selectedChitId]);

  if (!isOpen) return null;

  const filteredDues = dues.filter((due) => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return true;
    const nameMatch = (due.customer_name || '').toLowerCase().includes(q);
    const phoneMatch = (due.phone || '').includes(q);
    const ticketMatch = (due.ticket_number || '').toLowerCase().includes(q);
    const chitMatch = (due.chit_name || '').toLowerCase().includes(q);
    return nameMatch || phoneMatch || ticketMatch || chitMatch;
  });

  const activeChits = chits.filter((c) => c.status === 'active');

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/70 backdrop-blur-xs animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-3xl shadow-2xl border border-slate-200 w-full max-w-2xl max-h-[88vh] flex flex-col overflow-hidden text-slate-900"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-5 sm:p-6 bg-slate-900 text-white flex items-center justify-between border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
              <CreditCard className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg sm:text-xl font-black text-white tracking-tight">
                Quick Record Payment
              </h2>
              <p className="text-xs text-slate-300 mt-0.5">
                Select any member with outstanding dues to log collection
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Search & Chit Selector */}
        <div className="bg-slate-50 border-b border-slate-200 p-4 space-y-3">
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              autoFocus
              placeholder="Search member name, ticket #, phone, or chit..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-4 py-2.5 bg-white rounded-xl border border-slate-200 text-xs sm:text-sm text-slate-900 placeholder:text-slate-400 focus:outline-hidden focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 transition-all shadow-2xs"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400 hover:text-slate-600"
              >
                Clear
              </button>
            )}
          </div>

          <div className="flex items-center gap-2 overflow-x-auto pb-1 text-xs no-scrollbar">
            <button
              onClick={() => setSelectedChitId('ALL')}
              className={`px-3 py-1.5 rounded-xl font-bold transition-colors shrink-0 cursor-pointer border ${
                selectedChitId === 'ALL'
                  ? 'bg-slate-900 text-white border-slate-900'
                  : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-100'
              }`}
            >
              All Chits ({dues.length})
            </button>
            {activeChits.map((c) => (
              <button
                key={c.id}
                onClick={() => setSelectedChitId(c.id)}
                className={`px-3 py-1.5 rounded-xl font-bold transition-colors shrink-0 cursor-pointer border ${
                  selectedChitId === c.id
                    ? 'bg-emerald-600 text-white border-emerald-600'
                    : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-100'
                }`}
              >
                {c.name}
              </button>
            ))}
          </div>
        </div>

        {/* Members Due List */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-2.5 min-h-[280px]">
          {loading ? (
            <div className="py-16 text-center space-y-3">
              <div className="w-8 h-8 border-3 border-emerald-600 border-t-transparent rounded-full animate-spin mx-auto" />
              <p className="text-xs font-semibold text-slate-500">Finding pending members...</p>
            </div>
          ) : error ? (
            <div className="py-12 text-center space-y-2">
              <AlertCircle className="w-8 h-8 text-rose-500 mx-auto" />
              <p className="text-sm font-bold text-slate-800">{error}</p>
              <button
                onClick={fetchDues}
                className="text-xs text-emerald-600 hover:underline font-semibold"
              >
                Try Again
              </button>
            </div>
          ) : filteredDues.length === 0 ? (
            <div className="py-16 text-center space-y-3">
              <div className="w-12 h-12 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center mx-auto border border-emerald-100">
                <CheckCircle2 className="w-6 h-6" />
              </div>
              <h3 className="text-base font-bold text-slate-900">No Pending Dues Found</h3>
              <p className="text-xs text-slate-500 max-w-sm mx-auto">
                {searchQuery
                  ? 'No members match the search query.'
                  : 'All members for this selection are fully paid!'}
              </p>
            </div>
          ) : (
            filteredDues.map((due) => (
              <div
                key={due.id}
                onClick={() => {
                  onClose();
                  onSelectDue(due);
                }}
                className="group bg-white rounded-2xl border border-slate-200 hover:border-emerald-500 hover:bg-emerald-50/20 p-3.5 sm:p-4 shadow-2xs hover:shadow-xs transition-all flex items-center justify-between cursor-pointer"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-slate-100 group-hover:bg-emerald-100 group-hover:text-emerald-800 text-slate-700 flex items-center justify-center font-black text-sm shrink-0 border border-slate-200 transition-colors">
                    {due.ticket_number || (due.customer_name || 'M')[0]}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-sm text-slate-900 group-hover:text-emerald-950 transition-colors">
                        {due.customer_name || 'Member'}
                      </span>
                      {due.ticket_number && (
                        <span className="text-[10px] font-bold bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded font-mono">
                          T-{due.ticket_number}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 text-xs text-slate-500 mt-0.5">
                      <span className="font-medium text-slate-700">{due.chit_name}</span>
                      <span>•</span>
                      <span className="text-blue-600 font-semibold">Month {due.month_number}</span>
                      {due.phone && (
                        <>
                          <span>•</span>
                          <span className="font-mono">{due.phone}</span>
                        </>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <div className="text-right">
                    <span className="text-[10px] font-semibold text-slate-400 uppercase block">
                      Balance Due
                    </span>
                    <span className="text-sm sm:text-base font-black font-mono text-rose-600 block">
                      {formatINR(due.balance_amount)}
                    </span>
                  </div>
                  <div className="w-8 h-8 rounded-xl bg-slate-100 group-hover:bg-emerald-600 group-hover:text-white text-slate-400 flex items-center justify-center transition-colors">
                    <ArrowRight className="w-4 h-4" />
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        <div className="p-3.5 bg-slate-50 border-t border-slate-200 flex items-center justify-between text-xs text-slate-500">
          <span>Click any member row to open the Payment Modal</span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-white hover:bg-slate-100 border border-slate-200 text-slate-700 font-semibold rounded-xl transition-colors cursor-pointer"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
};
