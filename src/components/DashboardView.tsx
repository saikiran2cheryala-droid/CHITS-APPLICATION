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
  Download,
  FileSpreadsheet,
  Eye,
  EyeOff,
  Sparkles,
  Receipt,
  Calculator,
} from 'lucide-react';
import { DashboardStats, Chit, MonthlyDue } from '../types';
import { formatINR, formatProfitINR } from '../utils/formatters';
import { exportDashboardToCSV } from '../utils/dashboardExport';
import { QuickActionsFloatingMenu } from './QuickActionsFloatingMenu';
import { DueMembersModal } from './DueMembersModal';
import { QuickPaymentSelectModal } from './QuickPaymentSelectModal';
import { AssumedProfitModal } from './AssumedProfitModal';

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
  const [exportSuccessMessage, setExportSuccessMessage] = useState<string | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [showProjectedProfit, setShowProjectedProfit] = useState(false);
  const [showProfitBreakdownModal, setShowProfitBreakdownModal] = useState(false);

  const activeChitsCount = stats?.totalActiveChits ?? chits.filter((c) => c.status === 'active').length;
  const totalDue = stats?.totalDue ?? chits.filter((c) => c.status === 'active').reduce((sum, c) => sum + (c.total_due || 0), 0);
  const totalCollection = stats?.totalCollection ?? stats?.totalCollected ?? chits.filter((c) => c.status === 'active').reduce((sum, c) => sum + (c.total_collected || 0), 0);
  const totalPending = stats?.totalPending ?? stats?.totalOutstanding ?? chits.filter((c) => c.status === 'active').reduce((sum, c) => sum + (c.total_pending || 0), 0);
  
  // TOTAL PROJECTED CHIT PROFIT: Complete full-term projected profit across active chits
  // Customer payments received or pending dues DO NOT change this value!
  const totalProjectedProfit = stats?.totalProjectedChitProfit !== undefined
    ? stats.totalProjectedChitProfit
    : chits.filter((c) => c.status === 'active').reduce((sum, c) => sum + (c.total_projected_profit || 0), 0);
  const totalProjectedCollection = stats?.totalProjectedCollection ?? chits.filter((c) => c.status === 'active').reduce((sum, c) => sum + (c.total_projected_collection || 0), 0);
  const totalProjectedPayout = stats?.totalProjectedLiftPayout ?? chits.filter((c) => c.status === 'active').reduce((sum, c) => sum + (c.total_projected_payout || 0), 0);

  const filteredChits = chits.filter((chit) => {
    const matchesStatus = filterStatus === 'ALL' || chit.status === filterStatus;
    const matchesSearch =
      !chitSearch.trim() || chit.name.toLowerCase().includes(chitSearch.toLowerCase());
    return matchesStatus && matchesSearch;
  });

  const handleExportReport = (exportAll = false) => {
    setIsExporting(true);
    try {
      const result = exportDashboardToCSV({
        stats,
        chits,
        filteredChits: exportAll ? chits : filteredChits,
        filterStatus: exportAll ? undefined : filterStatus,
        searchTerm: exportAll ? undefined : chitSearch,
      });
      setExportSuccessMessage(
        `Report successfully downloaded: ${result.filename} (${result.count} chit${result.count === 1 ? '' : 's'} included)`
      );
      setTimeout(() => {
        setExportSuccessMessage(null);
      }, 5000);
    } catch (err) {
      console.error('Failed to export CSV report:', err);
    } finally {
      setIsExporting(false);
    }
  };

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

        <div className="flex flex-wrap items-center gap-2.5 self-start sm:self-auto">
          <button
            id="dashboard-export-report-btn"
            onClick={() => handleExportReport(false)}
            disabled={isExporting}
            className="flex items-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 text-white text-xs sm:text-sm font-bold rounded-2xl shadow-lg shadow-emerald-950/20 transition-all transform active:scale-95 disabled:opacity-50 cursor-pointer"
            title="Export complete dashboard stats, financial KPIs, and chit portfolio as a CSV file"
          >
            <Download className="w-4 h-4 text-emerald-100" />
            <span>{isExporting ? 'Exporting...' : 'Export Report (CSV)'}</span>
          </button>

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

      {/* Export Success Notification Banner */}
      {exportSuccessMessage && (
        <div className="bg-emerald-50 border border-emerald-200 text-emerald-900 px-4 py-3 rounded-2xl flex items-center justify-between text-xs sm:text-sm shadow-xs transition-all">
          <div className="flex items-center gap-2.5">
            <CheckCircle className="w-4.5 h-4.5 text-emerald-600 shrink-0" />
            <span className="font-semibold">{exportSuccessMessage}</span>
          </div>
          <button
            onClick={() => setExportSuccessMessage(null)}
            className="text-emerald-700 hover:text-emerald-900 font-bold ml-2 text-xs p-1"
            title="Dismiss"
          >
            ✕
          </button>
        </div>
      )}

      {/* Executive Financial Summary Card: Active Chits Overview */}
      <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden p-5 sm:p-6 space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center font-black">
              <Layers className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-base sm:text-lg font-black text-slate-900 tracking-tight">
                  Active Chits Financial Overview
                </h2>
                <span className="px-3 py-0.5 rounded-full text-xs font-black bg-blue-50 text-blue-800 border border-blue-200">
                  Active Chits: {activeChitsCount}
                </span>
              </div>
              <p className="text-xs text-slate-500 font-medium">
                Current month aggregated dues, verified collections, and assumed profit
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-500 font-medium">
              {stats?.totalMembers ?? 0} Total Enrolled Members
            </span>
          </div>
        </div>

        {/* Financial Overview Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 sm:gap-4">
          {/* 1. Total Collection */}
          <div className="bg-slate-50/80 border border-emerald-200/80 rounded-2xl p-4 sm:p-5 flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-emerald-800 uppercase tracking-wider">
                Total Collection
              </span>
              <span className="w-8 h-8 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center">
                <TrendingUp className="w-4 h-4" />
              </span>
            </div>
            <div className="mt-3">
              <span className="text-2xl sm:text-3xl font-black text-emerald-700 font-mono tracking-tight block truncate">
                {formatINR(totalCollection)}
              </span>
              <span className="text-[11px] text-emerald-700 mt-1 block font-medium">
                Verified Paid Receipts
              </span>
            </div>
          </div>

          {/* 3. Total Pending */}
          <div
            onClick={() => setIsDueMembersOpen(true)}
            title="Click to view all pending due customers"
            className="bg-slate-50/80 border border-red-200/80 hover:border-red-400 rounded-2xl p-4 sm:p-5 flex flex-col justify-between cursor-pointer transition-all group hover:shadow-xs"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-bold text-red-800 uppercase tracking-wider">
                  Total Pending
                </span>
                <span className="text-[10px] text-red-600 font-bold opacity-0 group-hover:opacity-100 transition-opacity">
                  View →
                </span>
              </div>
              <span className="w-8 h-8 rounded-xl bg-red-100 text-red-700 flex items-center justify-center group-hover:scale-105 transition-transform">
                <AlertCircle className="w-4 h-4" />
              </span>
            </div>
            <div className="mt-3">
              <span className="text-2xl sm:text-3xl font-black text-red-600 font-mono tracking-tight block truncate">
                {formatINR(totalPending)}
              </span>
              <span className="text-[11px] text-red-700 mt-1 block font-medium">
                Current Month Outstanding
              </span>
            </div>
          </div>

          {/* 4. TOTAL PROJECTED CHIT PROFIT with **** 👁 */}
          <div className="bg-slate-900 text-white rounded-2xl p-4 sm:p-5 flex flex-col justify-between shadow-xs relative overflow-hidden border border-slate-800">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-emerald-400 uppercase tracking-wider flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
                <span>TOTAL PROJECTED CHIT PROFIT</span>
              </span>
              <div className="flex items-center gap-1">
                <button
                  id="dashboard-profit-eye-toggle-btn"
                  type="button"
                  onClick={() => setShowProjectedProfit((prev) => !prev)}
                  className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors cursor-pointer"
                  title={showProjectedProfit ? 'Hide Profit' : 'Show Profit'}
                  aria-label={showProjectedProfit ? 'Hide Profit' : 'Show Profit'}
                >
                  {showProjectedProfit ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <div className="mt-3">
              <div className="flex items-baseline gap-2">
                {showProjectedProfit ? (
                  <span
                    className={`text-2xl sm:text-3xl font-black font-mono tracking-tight block truncate ${
                      totalProjectedProfit >= 0 ? 'text-emerald-400' : 'text-red-400'
                    }`}
                  >
                    {totalProjectedProfit >= 0
                      ? `+${formatINR(totalProjectedProfit)}`
                      : `-${formatINR(Math.abs(totalProjectedProfit))}`}
                  </span>
                ) : (
                  <span className="text-2xl sm:text-3xl font-black font-mono tracking-widest text-slate-400 select-none block">
                    ****
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => setShowProjectedProfit((prev) => !prev)}
                  className="text-xs text-slate-400 hover:text-white transition-colors cursor-pointer focus:outline-none"
                  title={showProjectedProfit ? 'Click to hide' : 'Click to view profit'}
                >
                  {showProjectedProfit ? '' : '👁'}
                </button>
              </div>

              <div className="flex items-center justify-between mt-1 text-[11px] text-slate-400">
                <span>Full-term profit of {activeChitsCount} active chits</span>
                {stats?.projectedProfitBreakdown && stats.projectedProfitBreakdown.length > 0 && (
                  <button
                    id="dashboard-profit-details-btn"
                    type="button"
                    onClick={() => setShowProfitBreakdownModal(true)}
                    className="text-emerald-400 hover:text-emerald-300 font-bold underline cursor-pointer ml-1"
                  >
                    [ Details ]
                  </button>
                )}
              </div>
            </div>
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

            {/* Export List button */}
            <button
              id="export-chits-csv-btn"
              onClick={() => handleExportReport(false)}
              disabled={isExporting}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold bg-white hover:bg-slate-50 active:bg-slate-100 text-slate-700 hover:text-slate-900 border border-slate-300 rounded-xl transition-all shadow-2xs cursor-pointer disabled:opacity-50"
              title="Export current filtered chits and stats as CSV"
            >
              <Download className="w-3.5 h-3.5 text-emerald-600" />
              <span className="hidden sm:inline">Export CSV</span>
            </button>
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
                      <div className="grid grid-cols-3 gap-2 bg-slate-50/80 p-2.5 rounded-xl border border-slate-100">
                        <div>
                          <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider block">
                            TOTAL DUE
                          </span>
                          <span className="font-mono font-bold text-slate-900 text-sm block">
                            {formatINR(chit.total_due ?? 0)}
                          </span>
                          <span className="text-[10px] text-slate-400 block mt-0.5">
                            Month {chit.current_month || 1}
                          </span>
                        </div>
                        <div>
                          <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider block">
                            COLLECTION
                          </span>
                          <span className="font-mono font-bold text-emerald-600 text-sm block">
                            {formatINR(collected)}
                          </span>
                          <span className="text-[10px] text-slate-400 block mt-0.5">
                            Collected
                          </span>
                        </div>
                        <div>
                          <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider block">
                            PENDING
                          </span>
                          <span className="font-mono font-bold text-red-600 text-sm block">
                            {formatINR(pending)}
                          </span>
                          <span className="text-[10px] text-slate-400 block mt-0.5">
                            Outstanding
                          </span>
                        </div>
                      </div>
                      <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-emerald-500 rounded-full transition-all"
                          style={{ width: `${Math.min(progressPct, 100)}%` }}
                        />
                      </div>

                      {/* Full-Term Projected Total Profit Badge */}
                      <div className="flex items-center justify-between bg-slate-50 px-3 py-1.5 rounded-xl border border-slate-200/80 text-xs">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                          PROJECTED TOTAL PROFIT:
                        </span>
                        <span
                          className={`font-mono font-black text-xs ${
                            (chit.total_projected_profit ?? 0) >= 0 ? 'text-emerald-700' : 'text-red-600'
                          }`}
                        >
                          {(chit.total_projected_profit ?? 0) >= 0
                            ? `+${formatINR(chit.total_projected_profit ?? 0)}`
                            : `-${formatINR(Math.abs(chit.total_projected_profit ?? 0))}`}
                        </span>
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
        onExportCSV={() => handleExportReport(false)}
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

      {/* Total Projected Chit Profit Breakdown Modal */}
      <AssumedProfitModal
        isOpen={showProfitBreakdownModal}
        onClose={() => setShowProfitBreakdownModal(false)}
        totalProjectedProfit={totalProjectedProfit}
        totalProjectedCollection={totalProjectedCollection}
        totalProjectedPayout={totalProjectedPayout}
        activeChitsCount={activeChitsCount}
        breakdown={stats?.projectedProfitBreakdown}
      />
    </div>
  );
};
