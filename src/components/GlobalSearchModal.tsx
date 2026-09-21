import React, { useState, useEffect } from 'react';
import { Search, X, User, Phone, Award, DollarSign, ChevronRight, Layers } from 'lucide-react';
import { api } from '../services/api';
import { formatINR } from '../utils/formatters';

interface GlobalSearchModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectMember: (memberId: string) => void;
}

export const GlobalSearchModal: React.FC<GlobalSearchModalProps> = ({
  isOpen,
  onClose,
  onSelectMember,
}) => {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!isOpen) {
      setQuery('');
      setResults([]);
      return;
    }
  }, [isOpen]);

  useEffect(() => {
    if (!query.trim()) {
      setResults([]);
      return;
    }

    const timer = setTimeout(() => {
      setLoading(true);
      api.search
        .query(query.trim())
        .then((res: any[]) => setResults(res))
        .catch((err: any) => console.error(err))
        .finally(() => setLoading(false));
    }, 250);

    return () => clearTimeout(timer);
  }, [query]);

  if (!isOpen) return null;

  return (
    <div id="global-search-backdrop" className="fixed inset-0 z-50 flex items-start justify-center bg-slate-900/60 backdrop-blur-xs p-4 pt-16 sm:pt-24 overflow-y-auto">
      <div id="global-search-container" className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full overflow-hidden border border-slate-200 animate-in fade-in zoom-in-95 duration-150">
        {/* Search Input Bar */}
        <div className="p-4 border-b border-slate-200 flex items-center gap-3">
          <Search className="w-5 h-5 text-blue-600 shrink-0" />
          <input
            id="global-search-input"
            autoFocus
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by customer name, phone number, ticket #, or chit name..."
            className="w-full text-base bg-transparent border-none focus:outline-hidden text-slate-900 placeholder:text-slate-400 font-medium"
          />
          {query && (
            <button
              onClick={() => setQuery('')}
              className="text-slate-400 hover:text-slate-600 p-1 rounded-lg"
            >
              <X className="w-4 h-4" />
            </button>
          )}
          <button
            onClick={onClose}
            className="text-xs font-semibold text-slate-500 hover:bg-slate-100 px-2.5 py-1.5 rounded-lg border border-slate-200"
          >
            ESC
          </button>
        </div>

        {/* Results Body */}
        <div className="max-h-[60vh] overflow-y-auto p-2">
          {loading ? (
            <div className="p-8 text-center text-slate-400 text-sm">Searching records across all chits...</div>
          ) : query.trim() && results.length === 0 ? (
            <div className="p-8 text-center text-slate-500 text-sm">
              No matching customers found for "{query}".
            </div>
          ) : !query.trim() ? (
            <div className="p-8 text-center text-slate-400 text-xs">
              Type at least one character to search across all active and completed chit groups.
            </div>
          ) : (
            <div className="space-y-1.5">
              {results.map((r) => (
                <div
                  key={r.id}
                  onClick={() => {
                    onSelectMember(r.id);
                    onClose();
                  }}
                  className="p-3.5 hover:bg-blue-50/70 rounded-xl border border-slate-100 hover:border-blue-200 transition-all cursor-pointer flex items-center justify-between group"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-slate-900 group-hover:text-blue-600 text-sm">
                        {r.customer_name}
                      </span>
                      {r.ticket_number && (
                        <span className="text-[11px] font-mono bg-slate-100 text-slate-700 px-1.5 py-0.2 rounded">
                          #{r.ticket_number}
                        </span>
                      )}
                      {r.lift_status === 'lifted' && (
                        <span className="text-[10px] font-bold bg-purple-100 text-purple-800 px-2 py-0.2 rounded-full inline-flex items-center gap-1">
                          <Award className="w-3 h-3" /> Lifted (M{r.lift_month})
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-slate-500 flex items-center gap-3">
                      <span className="font-mono">{r.phone}</span>
                      <span>•</span>
                      <span className="font-semibold text-slate-700">{r.chit_name}</span>
                    </div>
                  </div>

                  <div className="text-right flex items-center gap-3">
                    <div>
                      <span className="text-xs font-mono font-bold text-emerald-700 block">
                        Paid: {formatINR(r.total_paid)}
                      </span>
                      <span className="text-[11px] font-mono font-bold text-red-600 block">
                        Pending: {formatINR(r.total_pending)}
                      </span>
                    </div>
                    <ChevronRight className="w-4 h-4 text-slate-300 group-hover:text-blue-600 transform group-hover:translate-x-0.5 transition-transform" />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
