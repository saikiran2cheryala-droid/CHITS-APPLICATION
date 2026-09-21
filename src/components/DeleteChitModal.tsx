import React, { useState } from 'react';
import {
  Trash2,
  AlertTriangle,
  X,
  Layers,
} from 'lucide-react';
import { Chit } from '../types';
import { formatINR } from '../utils/formatters';

interface DeleteChitModalProps {
  isOpen: boolean;
  onClose: () => void;
  chit: Chit | null;
  onConfirmDelete: (chitId: string) => Promise<void>;
}

export const DeleteChitModal: React.FC<DeleteChitModalProps> = ({
  isOpen,
  onClose,
  chit,
  onConfirmDelete,
}) => {
  const [confirmName, setConfirmName] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen || !chit) return null;

  const requiresTypingMatch = (chit.members?.length || chit.total_members || 0) > 0 || (chit.total_collected || 0) > 0;
  const isMatch = !requiresTypingMatch || confirmName.trim().toLowerCase() === chit.name.trim().toLowerCase();

  const handleDelete = async () => {
    if (!isMatch) {
      setError('Please type the exact Chit Name to confirm deletion.');
      return;
    }

    try {
      setIsDeleting(true);
      setError(null);
      await onConfirmDelete(chit.id);
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to delete chit.');
      setIsDeleting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="bg-white w-full max-w-md rounded-3xl shadow-2xl border border-red-100 overflow-hidden flex flex-col">
        {/* Header */}
        <div className="px-6 py-5 bg-gradient-to-r from-red-600 to-rose-700 text-white flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-white/20 flex items-center justify-center text-white shadow-xs">
              <Trash2 className="w-5 h-5 text-white" />
            </div>
            <div>
              <h3 className="text-lg font-black tracking-tight text-white">Delete Chit Group</h3>
              <p className="text-xs text-rose-100">Permanent and irreversible action</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 text-rose-200 hover:text-white hover:bg-white/10 rounded-xl transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 space-y-4">
          <div className="p-4 bg-amber-50 border border-amber-200 rounded-2xl flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
            <div className="text-xs text-amber-800 space-y-1">
              <p className="font-bold text-amber-900">Are you absolutely sure?</p>
              <p>
                Deleting <strong>{chit.name}</strong> will permanently remove all associated member registrations, monthly dues schedules, lift payout allocations, and recorded transaction receipts.
              </p>
            </div>
          </div>

          {/* Chit Summary Card */}
          <div className="bg-slate-50 p-3.5 rounded-2xl border border-slate-200 text-xs space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-slate-500">Chit Name:</span>
              <span className="font-bold text-slate-900">{chit.name}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-500">Chit Value:</span>
              <span className="font-mono font-bold text-slate-900">{formatINR(chit.chit_value)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-500">Duration:</span>
              <span className="font-semibold text-slate-800">{chit.total_months} Months ({chit.start_month} – {chit.end_month})</span>
            </div>
          </div>

          {/* Confirmation Input */}
          <div className="space-y-1.5">
            <label className="block text-xs font-semibold text-slate-700">
              Type <span className="font-mono font-bold text-red-600 select-all">{chit.name}</span> to confirm:
            </label>
            <input
              type="text"
              value={confirmName}
              onChange={(e) => {
                setConfirmName(e.target.value);
                setError(null);
              }}
              placeholder={`Type "${chit.name}"`}
              className="w-full px-3.5 py-2.5 bg-white border border-slate-300 rounded-xl text-xs font-mono focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-red-500"
            />
          </div>

          {error && (
            <p className="text-xs text-red-600 font-medium">{error}</p>
          )}

          {/* Action Buttons */}
          <div className="pt-2 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              disabled={isDeleting}
              className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleDelete}
              disabled={isDeleting || !isMatch}
              className="px-5 py-2.5 bg-red-600 hover:bg-red-700 active:scale-98 text-white rounded-xl text-xs font-bold shadow-xs transition-all flex items-center gap-2 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Trash2 className="w-4 h-4" />
              <span>{isDeleting ? 'Deleting...' : 'Permanently Delete Chit'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
