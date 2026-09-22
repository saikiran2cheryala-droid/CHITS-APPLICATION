import React, { useState, useEffect, useRef } from 'react';
import {
  Zap,
  X,
  CreditCard,
  Users,
  Plus,
  Search,
  ChevronRight,
  AlertCircle,
  Sparkles,
} from 'lucide-react';

interface QuickActionsFloatingMenuProps {
  onOpenRecordPayment: () => void;
  onOpenDueMembers: () => void;
  onOpenNewChit: () => void;
  onOpenSearch: () => void;
  pendingDueCount?: number;
}

export const QuickActionsFloatingMenu: React.FC<QuickActionsFloatingMenuProps> = ({
  onOpenRecordPayment,
  onOpenDueMembers,
  onOpenNewChit,
  onOpenSearch,
  pendingDueCount,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close when clicking outside or pressing Escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        setIsOpen(false);
      }
      // If menu is open, handle single letter shortcuts
      if (isOpen) {
        if (e.key.toLowerCase() === 'p' || e.key === '1') {
          e.preventDefault();
          setIsOpen(false);
          onOpenRecordPayment();
        } else if (e.key.toLowerCase() === 'd' || e.key === '2') {
          e.preventDefault();
          setIsOpen(false);
          onOpenDueMembers();
        } else if (e.key.toLowerCase() === 'n' || e.key === '3') {
          e.preventDefault();
          setIsOpen(false);
          onOpenNewChit();
        } else if (e.key.toLowerCase() === 's' || e.key === '4') {
          e.preventDefault();
          setIsOpen(false);
          onOpenSearch();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onOpenRecordPayment, onOpenDueMembers, onOpenNewChit, onOpenSearch]);

  const actions = [
    {
      id: 'record-payment',
      title: 'Record Payment',
      subtitle: 'Fast log collection for any member',
      icon: CreditCard,
      badge: 'Fast',
      badgeColor: 'bg-emerald-50 text-emerald-700 border-emerald-200',
      iconBg: 'bg-emerald-500 text-white',
      accentHover: 'hover:border-emerald-400 hover:bg-emerald-50/30',
      shortcut: 'P',
      onClick: () => {
        setIsOpen(false);
        onOpenRecordPayment();
      },
    },
    {
      id: 'view-due-members',
      title: 'View Due Members',
      subtitle: 'Inspect unpaid instalments & send reminders',
      icon: Users,
      badge: pendingDueCount ? `${pendingDueCount} Due` : 'Overdue',
      badgeColor: 'bg-amber-50 text-amber-700 border-amber-200',
      iconBg: 'bg-amber-500 text-white',
      accentHover: 'hover:border-amber-400 hover:bg-amber-50/30',
      shortcut: 'D',
      onClick: () => {
        setIsOpen(false);
        onOpenDueMembers();
      },
    },
    {
      id: 'new-chit',
      title: 'Create New Chit',
      subtitle: 'Start group with automated rule calculation',
      icon: Plus,
      badge: 'Wizard',
      badgeColor: 'bg-blue-50 text-blue-700 border-blue-200',
      iconBg: 'bg-blue-600 text-white',
      accentHover: 'hover:border-blue-400 hover:bg-blue-50/30',
      shortcut: 'N',
      onClick: () => {
        setIsOpen(false);
        onOpenNewChit();
      },
    },
    {
      id: 'global-search',
      title: 'Search All Customers',
      subtitle: 'Find member by ticket, name, or phone',
      icon: Search,
      badge: 'Ctrl+K',
      badgeColor: 'bg-indigo-50 text-indigo-700 border-indigo-200',
      iconBg: 'bg-indigo-600 text-white',
      accentHover: 'hover:border-indigo-400 hover:bg-indigo-50/30',
      shortcut: 'S',
      onClick: () => {
        setIsOpen(false);
        onOpenSearch();
      },
    },
  ];

  return (
    <>
      {/* Dimmed backdrop when menu is open */}
      {isOpen && (
        <div
          className="fixed inset-0 z-40 bg-slate-900/40 backdrop-blur-2xs transition-opacity animate-in fade-in duration-150"
          onClick={() => setIsOpen(false)}
        />
      )}

      {/* Floating Container */}
      <div
        ref={menuRef}
        className="fixed bottom-6 right-6 z-40 flex flex-col items-end select-none"
      >
        {/* Speed-dial Menu Popover */}
        {isOpen && (
          <div className="mb-3 w-80 sm:w-92 bg-white rounded-3xl shadow-2xl border border-slate-200 overflow-hidden animate-in fade-in slide-in-from-bottom-5 duration-200">
            {/* Popover Header */}
            <div className="bg-slate-900 text-white px-5 py-3.5 flex items-center justify-between border-b border-slate-800">
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded-lg bg-blue-500/20 text-blue-400 flex items-center justify-center">
                  <Zap className="w-3.5 h-3.5" />
                </div>
                <span className="text-xs font-black uppercase tracking-wider text-slate-200">
                  Quick Actions
                </span>
              </div>
              <span className="text-[10px] text-slate-400 font-medium">Hotkeys enabled</span>
            </div>

            {/* Menu Items List */}
            <div className="p-2 space-y-1.5">
              {actions.map((action) => {
                const IconComponent = action.icon;
                return (
                  <button
                    key={action.id}
                    id={`quick-action-${action.id}`}
                    onClick={action.onClick}
                    className={`w-full text-left p-3 rounded-2xl border border-transparent ${action.accentHover} hover:shadow-2xs transition-all flex items-center justify-between group cursor-pointer`}
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className={`w-10 h-10 rounded-xl ${action.iconBg} flex items-center justify-center shadow-xs shrink-0 group-hover:scale-105 transition-transform`}
                      >
                        <IconComponent className="w-5 h-5" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-bold text-slate-900 group-hover:text-blue-900 transition-colors">
                            {action.title}
                          </span>
                          <span
                            className={`text-[9px] font-bold px-1.5 py-0.5 rounded-md border ${action.badgeColor}`}
                          >
                            {action.badge}
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-500 leading-tight mt-0.5">
                          {action.subtitle}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0 pl-2">
                      <kbd className="hidden sm:inline-block px-1.5 py-0.5 text-[10px] font-bold text-slate-400 bg-slate-100 border border-slate-200 rounded font-mono">
                        {action.shortcut}
                      </kbd>
                      <ChevronRight className="w-4 h-4 text-slate-400 group-hover:text-slate-700 group-hover:translate-x-0.5 transition-all" />
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Popover Footer Info */}
            <div className="px-4 py-2.5 bg-slate-50 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-400">
              <span>Press [Esc] to dismiss</span>
              <span className="text-blue-600 font-semibold cursor-pointer" onClick={() => setIsOpen(false)}>
                Close Menu
              </span>
            </div>
          </div>
        )}

        {/* Main Floating Trigger Button */}
        <button
          id="quick-actions-fab-btn"
          onClick={() => setIsOpen(!isOpen)}
          aria-expanded={isOpen}
          aria-label="Open Quick Actions floating menu"
          className={`flex items-center gap-2.5 px-4 py-3 sm:px-5 sm:py-3.5 rounded-full shadow-xl transition-all transform active:scale-95 cursor-pointer font-bold text-xs sm:text-sm ${
            isOpen
              ? 'bg-slate-800 text-white hover:bg-slate-700 shadow-slate-900/30'
              : 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white hover:from-blue-500 hover:to-indigo-500 shadow-blue-900/40 hover:shadow-2xl hover:scale-102 ring-2 ring-white/20'
          }`}
        >
          {isOpen ? (
            <>
              <X className="w-5 h-5 text-white animate-in spin-in-90 duration-150" />
              <span>Close Menu</span>
            </>
          ) : (
            <>
              <div className="relative">
                <Zap className="w-5 h-5 text-yellow-300 animate-pulse fill-yellow-300" />
                {pendingDueCount && pendingDueCount > 0 ? (
                  <span className="absolute -top-1.5 -right-2 w-2.5 h-2.5 bg-rose-500 rounded-full ring-2 ring-white" />
                ) : null}
              </div>
              <span className="tracking-wide">Quick Actions</span>
            </>
          )}
        </button>
      </div>
    </>
  );
};
