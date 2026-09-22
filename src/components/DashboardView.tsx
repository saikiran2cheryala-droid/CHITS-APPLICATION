import React, { useState } from 'react';
import {
  Layers,
  Plus,
  Users,
  CreditCard,
  DollarSign,
  AlertCircle,
  TrendingUp,
  Search,
  ChevronRight,
  Calendar,
  CheckCircle,
  Clock,
  ArrowUpRight,
  Award,
  Edit2,
  Trash2,
} from 'lucide-react';
import { DashboardStats, Chit, MonthlyDue } from '../types';
import { formatINR } from '../utils/formatters';
import { QuickActionsFloatingMenu } from './QuickActionsFloatingMenu';
import { DueMembersModal } from './DueMembersModal';
import { QuickPaymentSelectModal } from './QuickPaymentSelectModal';

interface DashboardViewProps {
  stats: DashboardStats | null;
  chits: (Chit & { total_collected?: number; total_pending?: number; active_members_count?: number })[];
  onOpenNewChitWizard: () => void;
  onSelectChit: (chitId: string) => void;
  onOpenCustomerProfile: (memberId: string) => void;
  onGlobalSearchClick: () => void;
  onOpenPaymentModal?: (due: MonthlyDue) => void;
  onEditChit?: (chit: Chit) => void;
  onDeleteChit?: (chit: Chit) => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  stats,
  chits,
  onOpenNewChitWizard,
  onSelectChit,
  onOpenCustomerProfile,
  onGlobalSearchClick,
  onOpenPaymentModal,
  onEditChit,
  onDeleteChit,
}) => {
  const [filterStatus, setFilterStatus] = useState<'ALL' | 'active' | 'completed'>('ALL');
  const [chitSearch, setChitSearch] = useState('');
  const [isDueMembersOpen, setIsDueMembersOpen] = useState(false);
  const [isQuickPaySelectOpen, setIsQuickPaySelectOpen] = useState(false);

  const filteredChits = chits.filter((chit) => {
    const matchesStatus = filterStatus === 'ALL' || chit.status === filterStatus;
    const matchesSearch =
      !chitSearch.trim() || chit.name.toLowerCase().includes(chitSearch.toLowerCase());
    return matchesStatus && matchesSearch;
  });

  return (
    <div className="space-y-6">
      {/* Top Banner & Quick Action */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-gradient-to-r from-slate-900 via-blue-950 to-slate-900 text-white p-6 sm:p-7 rounded-3xl shadow-md border border-slate-800">
        <div>
          <span className="text-xs font-bold uppercase tracking-wider text-blue-400 bg-blue-900/60 px-2.5 py-1 rounded-full border border-blue-700/50">
            CHIT FUND MANAGEMENT SYSTEM
          </span>
          <h1 className="text-2xl sm:text-3xl font-black mt-2 tracking-tight text-white">
            Chit Manager Dashboard
          </h1>
          <p className="text-xs sm:text-sm text-slate-300 mt-1 max-w-xl">
            Multi-chit tracking, automated pre-lift & post-lift calculation, and month-by-month payment ledger with persistent SQLite database storage.
          </p>
        </div>

        <div className="flex items-center gap-2.5 self-start sm:self-auto">
          <button
            id="dashboard-search-trigger-btn"
            onClick={onGlobalSearchClick}
            className="flex items-center gap-2 px-4 py-2.5 bg-slate-800/80 hover:bg-slate-700 text-slate-200 text-xs sm:text-sm font-semibold rounded-2xl border border-slate-700 transition-all hover:text-white"
          >
            <Search className="w-4 h-4 text-blue-400" />
            <span>Search All Customers</span>
          </button>

          <button
            id="dashboard-new-chit-btn"
            onClick={onOpenNewChitWizard}
            className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-500 active:bg-blue-700 text-white text-xs sm:text-sm font-bold rounded-2xl shadow-lg shadow-blue-900/30 transition-all transform active:scale-95"
          >
            <Plus className="w-4 h-4" />
            <span>+ NEW CHIT</span>
          </button>
        </div>
      </div>

      {/* KPI Stats Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {/* Total Active Chits */}
        <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200 shadow-xs flex items-center justify-between">
          <div>
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider block">
              Active Chits
            </span>
            <span className="text-2xl sm:text-3xl font-black text-slate-900 font-mono mt-1 block">
              {stats?.totalActiveChits ?? chits.length}
            </span>
            <span className="text-[11px] text-slate-400 mt-0.5 block">
              {chits.length} Total created
            </span>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center">
            <Layers className="w-6 h-6" />
          </div>
        </div>

        {/* Total Members */}
        <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200 shadow-xs flex items-center justify-between">
          <div>
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider block">
              Total Members
            </span>
            <span className="text-2xl sm:text-3xl font-black text-slate-900 font-mono mt-1 block">
              {stats?.totalMembers ?? 0}
            </span>
            <span className="text-[11px] text-slate-400 mt-0.5 block">
              Enrolled across all groups
            </span>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
            <Users className="w-6 h-6" />
          </div>
        </div>

        {/* Total Collections */}
        <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200 shadow-xs flex items-center justify-between">
          <div>
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider block">
              Total Collections
            </span>
            <span className="text-xl sm:text-2xl font-black text-emerald-600 font-mono mt-1 block truncate">
              {formatINR(stats?.totalCollected ?? stats?.todayCollection ?? 0)}
            </span>
            <span className="text-[11px] text-emerald-700 mt-0.5 block font-medium">
              Verified paid receipts
            </span>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
            <TrendingUp className="w-6 h-6" />
          </div>
        </div>

        {/* Total Pending Dues */}
        <div
          onClick={() => setIsDueMembersOpen(true)}
          title="Click to view all due members"
          className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200 hover:border-red-300 hover:shadow-xs shadow-xs flex items-center justify-between cursor-pointer transition-all group"
        >
          <div>
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider block">
                Pending Outstanding
              </span>
              <span className="text-[10px] text-red-600 font-bold opacity-0 group-hover:opacity-100 transition-opacity">
                View List →
              </span>
            </div>
            <span className="text-xl sm:text-2xl font-black text-red-600 font-mono mt-1 block truncate">
              {formatINR(stats?.totalOutstanding ?? stats?.totalPendingAmount ?? 0)}
            </span>
            <span className="text-[11px] text-red-700 mt-0.5 block font-medium">
              Current Month Dues
            </span>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-red-50 text-red-600 flex items-center justify-center group-hover:scale-105 transition-transform">
            <AlertCircle className="w-6 h-6" />
          </div>
        </div>
      </div>

      {/* Chit Groups Section */}
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-slate-900 tracking-tight">Active Chit Groups</h2>
            <p className="text-xs text-slate-500">
              Each chit operates with independent monthly rules and payment schedules.
            </p>
          </div>

          <div className="flex items-center gap-2 self-start sm:self-auto">
            {/* Search Chits */}
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={chitSearch}
                onChange={(e) => setChitSearch(e.target.value)}
                placeholder="Search chits..."
                className="pl-8 pr-3 py-1.5 text-xs bg-white border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {/* Filter by status */}
            <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl text-xs">
              {(['ALL', 'active', 'completed'] as const).map((st) => (
                <button
                  key={st}
                  onClick={() => setFilterStatus(st)}
                  className={`px-2.5 py-1 font-bold rounded-lg transition-colors uppercase ${
                    filterStatus === st
                      ? 'bg-white text-slate-900 shadow-2xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {st}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Chits Grid */}
        {filteredChits.length === 0 ? (
          <div className="bg-white rounded-3xl border border-slate-200 p-12 text-center space-y-4 shadow-xs">
            <div className="w-16 h-16 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center mx-auto">
              <Layers className="w-8 h-8" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900">No Chit Groups Found</h3>
              <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
                {chitSearch
                  ? 'No chits matched your filter.'
                  : 'Get started by creating your first chit group with custom rules and members.'}
              </p>
            </div>
            <button
              onClick={onOpenNewChitWizard}
              className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold shadow-xs inline-flex items-center gap-2"
            >
              <Plus className="w-4 h-4" />
              <span>+ Create First Chit</span>
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredChits.map((chit) => {
              const collected = chit.total_collected || 0;
              const pending = chit.total_pending || 0;
              const totalPool = collected + pending;
              const progressPct = totalPool > 0 ? Math.round((collected / totalPool) * 100) : 0;

              return (
                <div
                  key={chit.id}
                  onClick={() => onSelectChit(chit.id)}
                  className="bg-white rounded-2xl border border-slate-200 hover:border-blue-400 p-5 shadow-xs hover:shadow-md transition-all cursor-pointer group flex flex-col justify-between"
                >
                  <div className="space-y-3">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <span className="text-[10px] font-bold uppercase tracking-wider text-blue-600 bg-blue-50 px-2 py-0.5 rounded border border-blue-200">
                          {chit.total_months} Months
                        </span>
                        <h3 className="text-lg font-bold text-slate-900 group-hover:text-blue-600 transition-colors mt-1">
                          {chit.name}
                        </h3>
                      </div>
                      <span
                        className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${
                          chit.status === 'active'
                            ? 'bg-emerald-100 text-emerald-800'
                            : 'bg-slate-100 text-slate-700'
                        }`}
                      >
                        {chit.status}
                      </span>
                    </div>

                    <div className="bg-slate-50 rounded-xl p-3 grid grid-cols-2 gap-2 text-xs">
                      <div>
                        <span className="text-slate-500 block text-[10px] uppercase">Chit Value</span>
                        <span className="font-mono font-bold text-slate-900 text-sm">
                          {formatINR(chit.chit_value)}
                        </span>
                      </div>
                      <div>
                        <span className="text-slate-500 block text-[10px] uppercase">Members</span>
                        <span className="font-mono font-bold text-slate-900 text-sm">
                          {chit.active_members_count ?? chit.total_members} Members
                        </span>
                      </div>
                      <div className="col-span-2 pt-1 border-t border-slate-200/60 text-slate-600 flex items-center justify-between text-[11px]">
                        <span>{chit.start_month}</span>
                        <span>&rarr;</span>
                        <span>{chit.end_month}</span>
                      </div>
                    </div>

                    {/* Collection & Outstanding Display */}
                    <div className="space-y-2">
                      <div className="grid grid-cols-2 gap-2 bg-slate-50/80 p-2.5 rounded-xl border border-slate-100">
                        <div>
                          <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider block">
                            TOTAL COLLECTION
                          </span>
                          <span className="font-mono font-bold text-emerald-600 text-sm block">
                            {formatINR(collected)}
                          </span>
                          <span className="text-[10px] text-slate-400 block mt-0.5">
                            Month {chit.current_month || 1} Collection
                          </span>
                        </div>
                        <div>
                          <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider block">
                            PENDING OUTSTANDING
                          </span>
                          <span className="font-mono font-bold text-red-600 text-sm block">
                            {formatINR(pending)}
                          </span>
                          <span className="text-[10px] text-slate-400 block mt-0.5">
                            Month {chit.current_month || 1} Outstanding
                          </span>
                        </div>
                      </div>
                      <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-emerald-500 rounded-full transition-all"
                          style={{ width: `${Math.min(progressPct, 100)}%` }}
                        />
                      </div>
                    </div>
                  </div>

                  <div className="pt-3 border-t border-slate-100 flex items-center justify-between text-xs mt-3">
                    <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                      {onEditChit && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onEditChit(chit);
                          }}
                          className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors cursor-pointer"
                          title="Edit Chit Details"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                      {onDeleteChit && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onDeleteChit(chit);
                          }}
                          className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors cursor-pointer"
                          title="Delete Chit"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                    <div className="flex items-center gap-1 font-bold text-blue-600 group-hover:text-blue-700">
                      <span>Open Sheet</span>
                      <ChevronRight className="w-4 h-4 transform group-hover:translate-x-1 transition-transform" />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Global Recent Activity & Outstanding Quick Links */}
      {stats?.recentPayments && stats.recentPayments.length > 0 && (
        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <CreditCard className="w-4 h-4 text-emerald-600" />
              <span>Recent Payments Across All Chits</span>
            </h3>
            <span className="text-xs text-slate-400">Real-time ledger updates</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {stats.recentPayments.slice(0, 6).map((p: any) => (
              <div
                key={p.id}
                onClick={() => onOpenCustomerProfile(p.member_id)}
                className="p-3 bg-slate-50 hover:bg-blue-50/50 rounded-xl border border-slate-200 transition-colors cursor-pointer space-y-1"
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-900">{p.customer_name}</span>
                  <span className="font-mono text-xs font-extrabold text-emerald-700">
                    {formatINR(p.amount)}
                  </span>
                </div>
                <div className="text-[11px] text-slate-500 flex items-center justify-between">
                  <span>{p.chit_name} (M{p.month_number})</span>
                  <span className="bg-white px-1.5 py-0.5 rounded text-[10px] font-mono border border-slate-200">
                    {p.payment_method}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Floating Quick Actions Menu */}
      <QuickActionsFloatingMenu
        onOpenRecordPayment={() => setIsQuickPaySelectOpen(true)}
        onOpenDueMembers={() => setIsDueMembersOpen(true)}
        onOpenNewChit={onOpenNewChitWizard}
        onOpenSearch={onGlobalSearchClick}
        pendingDueCount={stats?.totalPendingCustomers}
      />

      {/* Due Members Overview Modal */}
      <DueMembersModal
        isOpen={isDueMembersOpen}
        onClose={() => setIsDueMembersOpen(false)}
        chits={chits}
        onRecordPayment={(due) => {
          if (onOpenPaymentModal) {
            onOpenPaymentModal(due);
          }
        }}
        onOpenCustomerProfile={onOpenCustomerProfile}
        onSelectChit={onSelectChit}
      />

      {/* Quick Record Payment Selector Modal */}
      <QuickPaymentSelectModal
        isOpen={isQuickPaySelectOpen}
        onClose={() => setIsQuickPaySelectOpen(false)}
        chits={chits}
        onSelectDue={(due) => {
          if (onOpenPaymentModal) {
            onOpenPaymentModal(due);
          }
        }}
      />
    </div>
  );
};
