import React, { useState, useEffect, useCallback } from 'react';
import {
  Layers,
  Search,
  Plus,
  LogOut,
  Database,
  ShieldCheck,
  ShieldAlert,
  Settings,
  Award,
  CreditCard,
  Menu,
  X,
  RefreshCw,
} from 'lucide-react';
import { api, setAuthSession, clearAuthSession } from './services/api';
import { User, Chit, DashboardStats, MonthlyDue, ChitMonthRule, Member } from './types';
import { DashboardView } from './components/DashboardView';
import { ChitDetailView } from './components/ChitDetailView';
import { NewChitWizard } from './components/NewChitWizard';
import { PaymentModal } from './components/PaymentModal';
import { LiftModal } from './components/LiftModal';
import { CustomerProfileModal } from './components/CustomerProfileModal';
import { GlobalSearchModal } from './components/GlobalSearchModal';
import { LoginPage } from './components/LoginPage';
import { SecuritySettingsModal } from './components/SecuritySettingsModal';
import { EditChitModal } from './components/EditChitModal';
import { DeleteChitModal } from './components/DeleteChitModal';

export default function App() {
  // Authentication State
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [authChecking, setAuthChecking] = useState(true);
  const [isSecuritySettingsOpen, setIsSecuritySettingsOpen] = useState(false);
  const [showSecurityNotice, setShowSecurityNotice] = useState(true);

  // App Navigation & Selected View
  const [selectedChitId, setSelectedChitId] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  // Dashboard Data
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [chits, setChits] = useState<Chit[]>([]);
  const [dataLoading, setDataLoading] = useState(false);

  // Modals State
  const [isNewChitOpen, setIsNewChitOpen] = useState(false);
  const [paymentDue, setPaymentDue] = useState<MonthlyDue | null>(null);
  const [customerProfileId, setCustomerProfileId] = useState<string | null>(null);
  const [isGlobalSearchOpen, setIsGlobalSearchOpen] = useState(false);
  const [editingChit, setEditingChit] = useState<Chit | null>(null);
  const [deletingChit, setDeletingChit] = useState<Chit | null>(null);

  const [liftState, setLiftState] = useState<{
    isOpen: boolean;
    chit: Chit | null;
    rules: ChitMonthRule[];
    members: Member[];
    defaultMonth: number;
    memberId?: string;
  }>({
    isOpen: false,
    chit: null,
    rules: [],
    members: [],
    defaultMonth: 1,
  });

  const triggerRefresh = useCallback(() => {
    setRefreshKey((k) => k + 1);
  }, []);

  // Check auth session on startup
  useEffect(() => {
    api.auth
      .me()
      .then((res: any) => {
        if (res?.user) {
          if (res.token) {
            setAuthSession(res.token, res.user);
          }
          setCurrentUser(res.user);
        }
      })
      .catch(() => {
        // Session not found, modal will prompt
        setCurrentUser(null);
      })
      .finally(() => {
        setAuthChecking(false);
      });
  }, []);

  // Fetch Dashboard stats & chits
  useEffect(() => {
    if (!currentUser) return;
    setDataLoading(true);
    Promise.all([api.dashboard.getStats(), api.chits.list()])
      .then(([statsRes, chitsRes]) => {
        setStats(statsRes.stats);
        setChits(chitsRes);
      })
      .catch((err) => {
        console.error('Failed to load dashboard data', err);
      })
      .finally(() => {
        setDataLoading(false);
      });
  }, [currentUser, refreshKey]);

  // Handler for opening Lift modal
  const handleOpenLiftModal = async (chit: Chit, defaultMonth: number, memberId?: string) => {
    try {
      const fullChit = await api.chits.get(chit.id);
      setLiftState({
        isOpen: true,
        chit: fullChit,
        rules: fullChit.rules || [],
        members: fullChit.members || [],
        defaultMonth,
        memberId,
      });
    } catch (err: any) {
      alert(err.message || 'Failed to load chit rules for lift');
    }
  };

  const handleLogout = async () => {
    try {
      await api.auth.logout();
    } catch (e) {
      // ignore
    }
    clearAuthSession();
    setCurrentUser(null);
    setSelectedChitId(null);
    setStats(null);
    setChits([]);
  };

  if (authChecking) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center text-white">
        <div className="text-center space-y-3">
          <div className="w-10 h-10 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto"></div>
          <p className="text-sm font-medium text-slate-300">Connecting to Chit Fund Database...</p>
        </div>
      </div>
    );
  }

  // If not authenticated, render the dedicated Login Page
  if (!currentUser) {
    return (
      <LoginPage
        onLoginSuccess={(user) => {
          setCurrentUser(user);
          triggerRefresh();
        }}
      />
    );
  }

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col text-slate-900 font-sans antialiased selection:bg-blue-600 selection:text-white">
      {/* Top Navigation Bar */}
      <header className="bg-slate-900 text-white sticky top-0 z-40 shadow-md border-b border-slate-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          {/* Logo & Brand Title */}
          <div
            onClick={() => setSelectedChitId(null)}
            className="flex items-center gap-3 cursor-pointer group"
          >
            <div className="w-10 h-10 rounded-xl bg-blue-600 flex items-center justify-center text-white font-black shadow-md group-hover:bg-blue-500 transition-colors">
              <Layers className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-base sm:text-lg font-black tracking-tight text-white group-hover:text-blue-300 transition-colors">
                  CHIT MANAGER
                </span>
                <span className="hidden sm:inline-flex items-center gap-1 text-[10px] font-bold bg-slate-800 text-emerald-400 px-2 py-0.5 rounded-full border border-slate-700">
                  <Database className="w-2.5 h-2.5" />
                  SQLite Persistent
                </span>
              </div>
              <p className="text-[11px] text-slate-400 hidden sm:block">
                Fund Administration & Multi-Chit Ledger
              </p>
            </div>
          </div>

          {/* Navigation Controls */}
          <div className="flex items-center gap-2 sm:gap-3">
            <button
              id="header-search-btn"
              onClick={() => setIsGlobalSearchOpen(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition-colors border border-slate-700 cursor-pointer"
            >
              <Search className="w-3.5 h-3.5 text-blue-400" />
              <span className="hidden md:inline">Search (Ctrl+K)</span>
            </button>

            <button
              id="header-new-chit-btn"
              onClick={() => setIsNewChitOpen(true)}
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold shadow-xs transition-colors cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>+ New Chit</span>
            </button>

            <button
              id="header-settings-btn"
              onClick={() => setIsSecuritySettingsOpen(true)}
              title="Security & Account Settings"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition-colors border border-slate-700 cursor-pointer"
            >
              <Settings className="w-3.5 h-3.5 text-blue-400" />
              <span className="hidden md:inline">Settings</span>
            </button>

            <button
              onClick={triggerRefresh}
              title="Refresh Database Data"
              className="p-1.5 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
            >
              <RefreshCw className="w-4 h-4" />
            </button>

            <div className="hidden sm:flex items-center gap-2 pl-2 border-l border-slate-700">
              <div className="w-8 h-8 rounded-full bg-blue-900/80 border border-blue-400/30 flex items-center justify-center text-xs font-bold text-blue-300">
                {(currentUser.name || currentUser.username || 'A')[0].toUpperCase()}
              </div>
              <div className="text-left text-xs">
                <span className="font-bold text-slate-200 block">{currentUser.name || currentUser.username}</span>
                <span className="text-[10px] text-slate-400 block capitalize">{currentUser.role}</span>
              </div>
            </div>

            <button
              id="header-logout-btn"
              onClick={handleLogout}
              title="Sign out of Chit Manager"
              className="p-1.5 text-slate-400 hover:text-red-400 hover:bg-slate-800 rounded-xl transition-colors cursor-pointer"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* Security Recommendation Banner */}
        {showSecurityNotice && (
          <div className="mb-5 bg-amber-50 border border-amber-200 rounded-2xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-xs">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-amber-100 text-amber-800 flex items-center justify-center shrink-0 border border-amber-200">
                <ShieldAlert className="w-5 h-5 text-amber-700" />
              </div>
              <div>
                <h4 className="text-xs font-bold text-amber-900">Security Recommendation</h4>
                <p className="text-xs text-amber-800">
                  For security, change your initial password from <strong>Settings → Security</strong>.
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 self-end sm:self-auto">
              <button
                onClick={() => setIsSecuritySettingsOpen(true)}
                className="px-3.5 py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-bold transition-colors cursor-pointer"
              >
                Change Password
              </button>
              <button
                onClick={() => setShowSecurityNotice(false)}
                className="p-1.5 text-amber-600 hover:text-amber-800 rounded-lg cursor-pointer"
                title="Dismiss"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {selectedChitId ? (
          <ChitDetailView
            chitId={selectedChitId}
            onBack={() => setSelectedChitId(null)}
            onOpenPaymentModal={(due) => setPaymentDue(due)}
            onOpenLiftModal={handleOpenLiftModal}
            onOpenCustomerProfile={(memberId) => setCustomerProfileId(memberId)}
            refreshKey={refreshKey}
            triggerRefresh={triggerRefresh}
          />
        ) : (
          <DashboardView
            stats={stats}
            chits={chits}
            onOpenNewChitWizard={() => setIsNewChitOpen(true)}
            onSelectChit={(chitId) => setSelectedChitId(chitId)}
            onOpenCustomerProfile={(memberId) => setCustomerProfileId(memberId)}
            onGlobalSearchClick={() => setIsGlobalSearchOpen(true)}
            onEditChit={(chit) => setEditingChit(chit)}
            onDeleteChit={(chit) => setDeletingChit(chit)}
          />
        )}
      </main>

      {/* Footer */}
      <footer className="bg-white border-t border-slate-200 py-4 text-xs text-slate-500">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-2 text-center sm:text-left">
          <p>
            <strong>CHIT MANAGER</strong> — Production Chit Fund Management System with persistent SQLite storage.
          </p>
          <div className="flex items-center gap-4 text-slate-400">
            <span>Pre-Lift & Post-Lift Dues</span>
            <span>•</span>
            <span>Historical Ledger Protection</span>
            <span>•</span>
            <span>Multi-Chit Independent Rules</span>
          </div>
        </div>
      </footer>

      {/* Modals & Dialogs */}
      {/* 1. Security Settings Modal */}
      <SecuritySettingsModal
        isOpen={isSecuritySettingsOpen}
        user={currentUser}
        onClose={() => setIsSecuritySettingsOpen(false)}
        onPasswordChanged={() => {
          setIsSecuritySettingsOpen(false);
          handleLogout();
        }}
        onProfileUpdated={(updated) => {
          setCurrentUser(updated);
        }}
      />

      {/* 2. New Chit Wizard */}
      <NewChitWizard
        isOpen={isNewChitOpen}
        onClose={() => setIsNewChitOpen(false)}
        onSuccess={(newChitId) => {
          triggerRefresh();
          setSelectedChitId(newChitId);
        }}
        onSubmit={api.chits.create}
      />

      {/* 3. Payment Modal */}
      {paymentDue && (
        <PaymentModal
          due={paymentDue}
          onClose={() => setPaymentDue(null)}
          onSuccess={() => {
            triggerRefresh();
            setPaymentDue(null);
          }}
          onSubmit={async (payload) => {
            await api.payments.record(payload);
          }}
        />
      )}

      {/* 4. Lift Modal */}
      {liftState.isOpen && liftState.chit && (
        <LiftModal
          chit={liftState.chit}
          chitId={liftState.chit.id}
          chitName={liftState.chit.name}
          members={liftState.members}
          rules={liftState.rules}
          defaultMonth={liftState.defaultMonth}
          selectedMemberId={liftState.memberId}
          onClose={() => setLiftState((prev) => ({ ...prev, isOpen: false }))}
          onSuccess={() => {
            triggerRefresh();
          }}
          onSubmit={async (payload) => {
            await api.lift.record(liftState.chit!.id, payload);
          }}
        />
      )}

      {/* 5. Customer Profile Modal */}
      <CustomerProfileModal
        memberId={customerProfileId}
        onClose={() => setCustomerProfileId(null)}
        onRecordPaymentClick={(due) => setPaymentDue(due)}
        onOpenLift={async (chitId, memberId, isLifted, liftMonth) => {
          setCustomerProfileId(null);
          try {
            const chit = await api.chits.get(chitId);
            handleOpenLiftModal(chit, liftMonth || chit.current_month || 1, memberId);
          } catch (e) {
            console.error('Failed to open lift modal from profile', e);
          }
        }}
      />

      {/* 6. Global Search Modal */}
      <GlobalSearchModal
        isOpen={isGlobalSearchOpen}
        onClose={() => setIsGlobalSearchOpen(false)}
        onSelectMember={(memberId) => {
          setCustomerProfileId(memberId);
        }}
      />

      {/* 7. Edit Chit Modal (Dashboard Level) */}
      <EditChitModal
        isOpen={!!editingChit}
        onClose={() => setEditingChit(null)}
        chit={editingChit}
        onSave={async (updatedData) => {
          if (!editingChit) return;
          await api.chits.update(editingChit.id, updatedData);
          triggerRefresh();
        }}
      />

      {/* 8. Delete Chit Modal (Dashboard Level) */}
      <DeleteChitModal
        isOpen={!!deletingChit}
        onClose={() => setDeletingChit(null)}
        chit={deletingChit}
        onConfirmDelete={async (chitId) => {
          await api.chits.delete(chitId);
          triggerRefresh();
        }}
      />
    </div>
  );
}
