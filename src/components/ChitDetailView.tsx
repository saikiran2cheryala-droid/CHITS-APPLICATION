import React, { useState, useEffect } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Calendar,
  Users,
  Award,
  CreditCard,
  FileSpreadsheet,
  Settings,
  Search,
  CheckCircle,
  Clock,
  AlertCircle,
  Plus,
  Printer,
  Download,
  Phone,
  Layers,
  Edit2,
  Trash2,
  Filter,
  Eye,
  EyeOff,
  UploadCloud,
} from 'lucide-react';
import { Chit, ChitMonthRule, Member, MonthlyDue, Payment, MonthlyProfitDetails } from '../types';
import { api } from '../services/api';
import { formatINR, formatProfitINR, formatDate, formatDateTime, formatDDMMYYYY, getMonthLabel } from '../utils/formatters';
import { LiftDetailsModal } from './LiftDetailsModal';
import { MonthlyProfitModal } from './MonthlyProfitModal';
import { EditChitModal } from './EditChitModal';
import { DeleteChitModal } from './DeleteChitModal';
import { ImportCustomersModal } from './ImportCustomersModal';
import { ImportLiftPayoutModal } from './ImportLiftPayoutModal';
import { EditPaymentModal } from './EditPaymentModal';
import { downloadLiftPayoutTemplate } from '../utils/payoutExcelImport';

interface ChitDetailViewProps {
  chitId: string;
  onBack: () => void;
  onOpenPaymentModal: (due: MonthlyDue) => void;
  onOpenLiftModal: (chit: Chit, defaultMonth: number, memberId?: string) => void;
  onOpenCustomerProfile: (memberId: string) => void;
  refreshKey: number;
  triggerRefresh: () => void;
}

export const ChitDetailView: React.FC<ChitDetailViewProps> = ({
  chitId,
  onBack,
  onOpenPaymentModal,
  onOpenLiftModal,
  onOpenCustomerProfile,
  refreshKey,
  triggerRefresh,
}) => {
  const [chit, setChit] = useState<(Chit & { rules: ChitMonthRule[]; members: Member[]; total_collected: number; total_pending: number }) | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Active Tab
  const [activeTab, setActiveTab] = useState<'sheet' | 'members' | 'rules' | 'lift' | 'reports'>('sheet');

  // Month selector state for Monthly Sheet
  const [selectedMonth, setSelectedMonth] = useState<number>(1);
  const hasInitializedMonth = React.useRef(false);

  useEffect(() => {
    hasInitializedMonth.current = false;
  }, [chitId]);

  // Edit and Delete Chit modals state
  const [isEditChitOpen, setIsEditChitOpen] = useState(false);
  const [isDeleteChitOpen, setIsDeleteChitOpen] = useState(false);

  // Lift details modal state for already lifted customers
  const [liftDetailsMember, setLiftDetailsMember] = useState<Member | null>(null);
  const [isLiftDetailsOpen, setIsLiftDetailsOpen] = useState(false);
  const [liftViewMode, setLiftViewMode] = useState<'list' | 'report'>('list');

  // Handlers for Lift Status Badges
  const handleNotLiftedClick = (memberId: string) => {
    if (!chit) return;
    onOpenLiftModal(chit, chit.current_month || selectedMonth, memberId);
  };

  const handleLiftedClick = (memberId: string, memberLiftMonth?: number | null) => {
    if (!chit) return;
    const member = chit.members?.find((m) => m.id === memberId);
    if (member) {
      setLiftDetailsMember(member);
      setIsLiftDetailsOpen(true);
    } else {
      // Fallback if not found in list directly
      onOpenCustomerProfile(memberId);
    }
  };

  const [monthData, setMonthData] = useState<{
    rule: ChitMonthRule;
    dues: MonthlyDue[];
    stats: {
      total_due: number;
      total_paid: number;
      total_balance: number;
      count_paid: number;
      count_partial: number;
      count_pending: number;
    };
    lift: { id: string; lift_month: number; lift_amount_received: number; lift_date: string; notes?: string; customer_name: string; ticket_number: string } | null;
    profit?: MonthlyProfitDetails;
  } | null>(null);
  const [monthLoading, setMonthLoading] = useState(false);

  // Profit visibility state (hidden by default as required)
  const [showProfit, setShowProfit] = useState(false);
  const [showProfitDetailsModal, setShowProfitDetailsModal] = useState(false);

  // Filter & Search inside Monthly Sheet
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'PENDING' | 'PARTIAL' | 'PAID'>('ALL');
  const [editingPaymentDue, setEditingPaymentDue] = useState<MonthlyDue | null>(null);

  // Reports state
  const [reportsData, setReportsData] = useState<any | null>(null);
  const [reportsLoading, setReportsLoading] = useState(false);
  const [reportSubTab, setReportSubTab] = useState<'monthly' | 'customers' | 'pending' | 'lifted'>('monthly');

  // Edit Rules modal state
  const [isEditingRules, setIsEditingRules] = useState(false);
  const [editableRules, setEditableRules] = useState<ChitMonthRule[]>([]);
  const [isSavingRules, setIsSavingRules] = useState(false);

  // Add Member state
  const [isAddingMember, setIsAddingMember] = useState(false);
  const [newMemberName, setNewMemberName] = useState('');
  const [newMemberPhone, setNewMemberPhone] = useState('');
  const [newMemberTicket, setNewMemberTicket] = useState('');
  const [isSavingMember, setIsSavingMember] = useState(false);
  const [isImportCustomersOpen, setIsImportCustomersOpen] = useState(false);

  // Month-wise Lift Payout Excel Import & Edit state
  const [isImportLiftPayoutsOpen, setIsImportLiftPayoutsOpen] = useState(false);
  const [isEditingPayouts, setIsEditingPayouts] = useState(false);
  const [editablePayouts, setEditablePayouts] = useState<{ month_number: number; lift_payout: number }[]>([]);
  const [isSavingPayouts, setIsSavingPayouts] = useState(false);

  // Load Chit
  useEffect(() => {
    setLoading(true);
    api.chits
      .get(chitId)
      .then((data) => {
        setChit(data);
        setEditableRules(data.rules || []);
        if (data.rules) {
          setEditablePayouts(
            data.rules.map((r) => ({
              month_number: r.month_number,
              lift_payout: r.expected_lift_payout || 0,
            }))
          );
        }
        if (data.current_month && !hasInitializedMonth.current) {
          setSelectedMonth(data.current_month);
          hasInitializedMonth.current = true;
        }
        setError(null);
      })
      .catch((err) => setError(err.message || 'Failed to load chit'))
      .finally(() => setLoading(false));
  }, [chitId, refreshKey]);

  // Load Month Data
  const fetchMonthData = (m = selectedMonth) => {
    if (!chitId) return;
    setMonthLoading(true);
    api.monthView
      .getData(chitId, m)
      .then((data) => {
        setMonthData(data);
      })
      .catch((err) => {
        console.error('Failed to load month data', err);
      })
      .finally(() => setMonthLoading(false));
  };

  useEffect(() => {
    // Reset profit visibility to hidden whenever selected month changes
    setShowProfit(false);
    fetchMonthData(selectedMonth);
  }, [chitId, selectedMonth, refreshKey]);

  // Load Reports when reports tab is clicked
  useEffect(() => {
    if (activeTab === 'reports' && chitId) {
      setReportsLoading(true);
      api.reports
        .get(chitId)
        .then((res) => setReportsData(res))
        .catch((err) => console.error(err))
        .finally(() => setReportsLoading(false));
    }
  }, [activeTab, chitId, refreshKey]);

  if (loading) {
    return (
      <div className="p-12 text-center text-slate-500">
        <div className="inline-block w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mb-3"></div>
        <p className="text-sm font-medium">Loading chit fund details...</p>
      </div>
    );
  }

  if (error || !chit) {
    return (
      <div className="p-8 text-center text-red-600">
        <AlertCircle className="w-8 h-8 mx-auto mb-2 text-red-500" />
        <p className="text-base font-bold">{error || 'Chit not found'}</p>
        <button
          onClick={onBack}
          className="mt-4 px-4 py-2 bg-slate-800 text-white rounded-xl text-sm font-semibold hover:bg-slate-700"
        >
          Back to Dashboard
        </button>
      </div>
    );
  }

  // Filter dues list
  const filteredDues = (monthData?.dues || []).filter((due) => {
    const matchesSearch =
      !searchQuery.trim() ||
      due.customer_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      due.phone?.includes(searchQuery) ||
      due.ticket_number?.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesStatus = statusFilter === 'ALL' || due.status === statusFilter;

    return matchesSearch && matchesStatus;
  });

  const handleNextMonth = () => {
    if (selectedMonth < chit.total_months) {
      setSelectedMonth((m) => m + 1);
    }
  };

  const handlePrevMonth = () => {
    if (selectedMonth > 1) {
      setSelectedMonth((m) => m - 1);
    }
  };

  const handleSaveEditedRules = async () => {
    try {
      setIsSavingRules(true);
      await api.chits.updateRules(chit.id, editableRules);
      setIsEditingRules(false);
      triggerRefresh();
      alert('Chit rules updated successfully! Unpaid future dues have been updated; historical paid records remain securely preserved.');
    } catch (err: any) {
      alert(err.message || 'Failed to update rules');
    } finally {
      setIsSavingRules(false);
    }
  };

  const handleSaveEditedPayouts = async () => {
    try {
      setIsSavingPayouts(true);
      await api.chits.updateLiftPayouts(chit.id, editablePayouts);
      setIsEditingPayouts(false);
      triggerRefresh();
    } catch (err: any) {
      alert(err.message || 'Failed to update lift payouts');
    } finally {
      setIsSavingPayouts(false);
    }
  };

  const handleUpdateChitDetails = async (updatedData: {
    name: string;
    status: string;
    chit_value: number;
    start_month: string;
    end_month: string;
    total_months: number;
    total_members: number;
  }) => {
    if (!chit) return;
    await api.chits.update(chit.id, updatedData);
    triggerRefresh();
  };

  const handleDeleteChit = async (chitId: string) => {
    await api.chits.delete(chitId);
    triggerRefresh();
    onBack();
  };

  const handleAddMember = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMemberName.trim() || !newMemberPhone.trim()) {
      alert('Customer Name and Phone Number are required');
      return;
    }
    try {
      setIsSavingMember(true);
      await api.members.create(chit.id, {
        customer_name: newMemberName.trim(),
        phone: newMemberPhone.trim(),
        ticket_number: newMemberTicket.trim() || String((chit.members?.length || 0) + 1).padStart(2, '0'),
      });
      setIsAddingMember(false);
      setNewMemberName('');
      setNewMemberPhone('');
      setNewMemberTicket('');
      triggerRefresh();
    } catch (err: any) {
      alert(err.message || 'Failed to add member');
    } finally {
      setIsSavingMember(false);
    }
  };

  const exportCSV = (data: any[], filename: string) => {
    if (!data || !data.length) return;
    const headers = Object.keys(data[0]).join(',');
    const rows = data.map((obj) => Object.values(obj).map((val) => `"${String(val ?? '').replace(/"/g, '""')}"`).join(','));
    const csvContent = 'data:text/csv;charset=utf-8,' + [headers, ...rows].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `${filename}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Month-specific calculated values
  const currentMonthDue = monthData?.stats?.total_due ?? chit.total_due ?? 0;
  const currentMonthPaid = monthData?.stats?.total_paid ?? chit.total_collected ?? 0;

  // Formula: Pending Outstanding = SUM(Current Month Due Amount - Current Month Paid Amount)
  // Only include positive balances.
  const currentMonthPending = monthData?.dues && monthData.dues.length > 0
    ? monthData.dues.reduce((sum, d) => sum + Math.max(0, (Number(d.due_amount) || 0) - (Number(d.paid_amount) || 0)), 0)
    : (monthData?.stats?.total_balance ?? chit.total_pending ?? 0);

  const totalMembersCount = chit.members?.length || chit.total_members || (monthData?.dues?.length || 0);
  const paidMembersCount = monthData?.dues && monthData.dues.length > 0
    ? monthData.dues.filter((d) => (d.status === 'PAID') || (Number(d.due_amount) > 0 && Number(d.paid_amount) >= Number(d.due_amount))).length
    : (monthData?.stats?.count_paid ?? chit.paid_members_count ?? 0);
  const pendingMembersCount = Math.max(0, totalMembersCount - paidMembersCount);
  const liftedMembersCount = chit.members?.filter((m) => m.lift_status === 'lifted').length || chit.lifted_members_count || 0;
  const unliftedMembersCount = Math.max(0, totalMembersCount - liftedMembersCount);

  return (
    <div className="space-y-6">
      {/* Top Breadcrumb & Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
        <div className="flex items-center gap-3">
          <button
            id="back-to-chits-btn"
            onClick={onBack}
            className="p-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 transition-colors"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <div>
            <div className="flex items-center gap-2.5">
              <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">{chit.name}</h1>
              <span className="text-xs font-bold px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-200 uppercase">
                {chit.status}
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-1 flex flex-wrap items-center gap-2">
              <span className="font-mono font-bold text-slate-900">{formatINR(chit.chit_value)}</span>
              <span>•</span>
              <span>{chit.total_months} Months ({chit.start_month} – {chit.end_month})</span>
              <span>•</span>
              <span>{chit.members?.length || chit.total_members} Members</span>
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3 self-start sm:self-auto flex-wrap">
          {/* Top Month Selector */}
          <div className="flex items-center gap-2 bg-slate-50 border border-slate-300 px-3 py-1.5 rounded-xl shadow-2xs">
            <label htmlFor="top-current-month-select" className="text-xs font-black text-slate-700 uppercase tracking-wider whitespace-nowrap">
              CURRENT MONTH:
            </label>
            <select
              id="top-current-month-select"
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(parseInt(e.target.value, 10))}
              className="bg-white border border-slate-300 text-slate-900 font-bold text-sm px-2.5 py-1 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer"
            >
              {chit.rules && chit.rules.length > 0
                ? chit.rules.map((r) => (
                    <option key={r.month_number} value={r.month_number}>
                      Month {r.month_number}
                    </option>
                  ))
                : Array.from({ length: chit.total_months || 20 }, (_, i) => i + 1).map((mNum) => (
                    <option key={mNum} value={mNum}>
                      Month {mNum}
                    </option>
                  ))}
            </select>
          </div>

          <button
            id="quick-lift-btn"
            onClick={() => onOpenLiftModal(chit, selectedMonth)}
            className="flex items-center gap-1.5 px-3.5 py-2 bg-purple-700 hover:bg-purple-800 text-white rounded-xl text-xs font-bold shadow-xs transition-colors cursor-pointer"
          >
            <Award className="w-4 h-4" />
            <span>Lift Chit</span>
          </button>

          {/* Edit Chit Details Button */}
          <button
            id="edit-chit-btn"
            onClick={() => setIsEditChitOpen(true)}
            className="flex items-center gap-1.5 px-3.5 py-2 bg-slate-100 hover:bg-blue-50 text-slate-700 hover:text-blue-700 border border-slate-300 hover:border-blue-300 rounded-xl text-xs font-bold shadow-2xs transition-colors cursor-pointer"
            title="Edit Chit Details"
          >
            <Edit2 className="w-3.5 h-3.5 text-blue-600" />
            <span>Edit Chit</span>
          </button>

          {/* Delete Chit Option Button */}
          <button
            id="delete-chit-btn"
            onClick={() => setIsDeleteChitOpen(true)}
            className="flex items-center gap-1.5 px-3.5 py-2 bg-slate-100 hover:bg-red-50 text-slate-700 hover:text-red-700 border border-slate-300 hover:border-red-300 rounded-xl text-xs font-bold shadow-2xs transition-colors cursor-pointer"
            title="Delete this Chit"
          >
            <Trash2 className="w-3.5 h-3.5 text-red-600" />
            <span>Delete</span>
          </button>
        </div>
      </div>

      {/* Primary KPI Mini-bar: strictly calculated for selectedMonth */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {/* Card 1: Total Collection */}
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 block">Total Collection</span>
          <span className="text-xl font-bold font-mono text-emerald-600 block mt-1">
            {formatINR(currentMonthPaid)}
          </span>
          <span className="text-[11px] text-slate-400 mt-1 block">
            Month {selectedMonth} Collection
          </span>
        </div>

        {/* Card 2: Pending Outstanding */}
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 block">Pending Outstanding</span>
          <span className="text-xl font-bold font-mono text-red-600 block mt-1">
            {formatINR(currentMonthPending)}
          </span>
          <span className="text-[11px] text-slate-400 mt-1 block">
            Month {selectedMonth} Outstanding
          </span>
        </div>

        {/* Card 3: Total Due & Members Status */}
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 block">Total Due</span>
          <span className="text-xl font-bold font-mono text-slate-900 block mt-1">
            {formatINR(currentMonthDue)}
          </span>
          <div className="text-[11px] font-semibold text-slate-500 mt-1 flex items-center gap-2">
            <span className="text-emerald-700">Paid: <strong className="font-mono font-bold">{paidMembersCount} / {totalMembersCount}</strong></span>
            <span>•</span>
            <span className="text-red-700">Pending: <strong className="font-mono font-bold">{pendingMembersCount} / {totalMembersCount}</strong></span>
          </div>
        </div>

        {/* Card 4: Lifted Members (Cumulative) */}
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 block">Lifted Members</span>
          <div className="flex items-baseline justify-between mt-1">
            <span className="text-xl font-bold font-mono text-purple-700 block">
              {liftedMembersCount} / {chit.total_months}
            </span>
            <span className="text-xs font-semibold text-slate-500">
              Not Lifted: <strong className="text-slate-800 font-mono">{unliftedMembersCount}</strong>
            </span>
          </div>
          <span className="text-[11px] text-slate-400 mt-1 block">
            Cumulative Lifted
          </span>
        </div>
      </div>

      {/* Main Tabs Navigation */}
      <div className="border-b border-slate-200 flex items-center gap-2 overflow-x-auto">
        {[
          { id: 'sheet', label: 'Customer Monthly Sheet', icon: Calendar },
          { id: 'members', label: `Customer List (${chit.members?.length || 0})`, icon: Users },
          { id: 'rules', label: 'Monthly Payment Rules', icon: Settings },
          { id: 'lift', label: 'Lift Management', icon: Award },
          { id: 'reports', label: 'Chit Reports', icon: FileSpreadsheet },
        ].map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              id={`chit-tab-${tab.id}`}
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`flex items-center gap-2 px-4 py-3 text-xs sm:text-sm font-bold border-b-2 whitespace-nowrap transition-colors ${
                isActive
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-slate-600 hover:text-slate-900 hover:border-slate-300'
              }`}
            >
              <Icon className="w-4 h-4" />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* ---------------- TAB 1: CUSTOMER MONTHLY SHEET ---------------- */}
      {activeTab === 'sheet' && (
        <div className="space-y-4">
          {/* Month Selector Bar (Section 14) */}
          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <button
                id="prev-month-btn"
                onClick={handlePrevMonth}
                disabled={selectedMonth <= 1}
                className="p-2 rounded-xl border border-slate-300 text-slate-700 hover:bg-slate-100 disabled:opacity-30 disabled:pointer-events-none transition-colors"
                title="Previous Month"
              >
                <ChevronLeft className="w-5 h-5" />
              </button>

              <div className="flex items-center gap-2">
                <select
                  id="month-dropdown-select"
                  value={selectedMonth}
                  onChange={(e) => setSelectedMonth(parseInt(e.target.value, 10))}
                  className="px-3.5 py-2 text-sm sm:text-base font-extrabold text-slate-900 bg-slate-50 border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 cursor-pointer"
                >
                  {chit.rules?.map((r) => (
                    <option key={r.month_number} value={r.month_number}>
                      Month {r.month_number} — {r.month_name}
                    </option>
                  ))}
                </select>

                <button
                  id="next-month-btn"
                  onClick={handleNextMonth}
                  disabled={selectedMonth >= chit.total_months}
                  className="p-2 rounded-xl border border-slate-300 text-slate-700 hover:bg-slate-100 disabled:opacity-30 disabled:pointer-events-none transition-colors"
                  title="Next Month"
                >
                  <ChevronRight className="w-5 h-5" />
                </button>
              </div>

              {/* Month Rule Badges & Monthly Chit Profit */}
              {monthData?.rule && (
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <span className="px-2.5 py-1 rounded-lg bg-slate-100 text-slate-700 font-mono shadow-2xs">
                    Pre-Lift: <strong>{formatINR(monthData.rule.pre_lift_payment)}</strong>
                  </span>
                  <span className="px-2.5 py-1 rounded-lg bg-purple-50 text-purple-800 font-mono shadow-2xs">
                    Post-Lift: <strong>{formatINR(monthData.rule.post_lift_payment)}</strong>
                  </span>
                  {monthData.rule.expected_lift_payout > 0 && (
                    <span className="px-2.5 py-1 rounded-lg bg-amber-50 text-amber-800 font-mono shadow-2xs">
                      Lift Payout: <strong>{formatINR(monthData.rule.expected_lift_payout)}</strong>
                    </span>
                  )}

                  {/* Monthly Profit Badge: Hidden by default, toggles on eye click */}
                  <div
                    id="month-profit-header-badge"
                    className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-950 font-mono text-xs shadow-2xs"
                  >
                    <span className="font-semibold text-emerald-800">Profit:</span>
                    <button
                      type="button"
                      onClick={() => setShowProfitDetailsModal(true)}
                      className={`font-bold hover:underline transition-colors focus:outline-none ${
                        showProfit
                          ? (monthData.profit?.has_lift
                              ? (monthData.profit.profit! < 0 ? 'text-red-600' : 'text-emerald-900')
                              : 'text-slate-500 font-sans')
                          : 'text-slate-700 tracking-wider'
                      }`}
                      title="Click to view profit calculation details"
                    >
                      {showProfit
                        ? (monthData.profit?.has_lift
                            ? formatProfitINR(monthData.profit.profit)
                            : 'Not Available')
                        : '****'}
                    </button>

                    <button
                      id="toggle-profit-eye-btn"
                      type="button"
                      onClick={() => setShowProfit((prev) => !prev)}
                      className="p-0.5 text-emerald-700 hover:text-emerald-950 hover:bg-emerald-100 rounded transition-colors focus:outline-none"
                      title={showProfit ? 'Hide Profit' : 'Show Profit'}
                      aria-label={showProfit ? 'Hide Profit' : 'Show Profit'}
                    >
                      {showProfit ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                    </button>

                    <button
                      id="open-profit-details-btn"
                      type="button"
                      onClick={() => setShowProfitDetailsModal(true)}
                      className="text-[10px] font-sans font-semibold text-emerald-700 hover:text-emerald-950 underline ml-0.5"
                      title="View Monthly Profit Breakdown"
                    >
                      [ Details ]
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Month Lift Banner if someone lifted this month */}
          {monthData?.lift && (
            <div className="bg-purple-50 border border-purple-200 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-sm">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-purple-200/80 flex items-center justify-center text-purple-900 font-bold">
                  <Award className="w-5 h-5 text-purple-700" />
                </div>
                <div>
                  <h4 className="font-bold text-purple-950">
                    Chit Lifted by: {monthData.lift.customer_name} (#{monthData.lift.ticket_number})
                  </h4>
                  <p className="text-xs text-purple-800">
                    Payout Disbursed: <strong className="font-mono text-purple-950">{formatINR(monthData.lift.lift_amount_received)}</strong>
                    {monthData.lift.lift_date && ` • On ${formatDate(monthData.lift.lift_date)}`}
                  </p>
                </div>
              </div>
              <span className="text-xs font-semibold px-2.5 py-1 rounded-lg bg-white border border-purple-200 text-purple-800 self-start sm:self-auto">
                Customer pays Post-Lift amount from Month {selectedMonth + 1}
              </span>
            </div>
          )}

          {/* Search & Filter Bar */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="relative flex-1 max-w-md">
              <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                id="search-customer-sheet"
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search customer by name, phone, ticket #..."
                className="w-full pl-9 pr-4 py-2 bg-white border border-slate-300 rounded-xl text-xs sm:text-sm font-medium focus:ring-2 focus:ring-blue-500 shadow-xs"
              />
            </div>

            <div className="flex items-center gap-1.5 self-start sm:self-auto">
              <span className="text-xs font-semibold text-slate-500 flex items-center gap-1">
                <Filter className="w-3.5 h-3.5" /> Status:
              </span>
              {(['ALL', 'PENDING', 'PARTIAL', 'PAID'] as const).map((st) => (
                <button
                  key={st}
                  onClick={() => setStatusFilter(st)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-colors ${
                    statusFilter === st
                      ? 'bg-blue-600 text-white'
                      : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  {st}
                </button>
              ))}
            </div>
          </div>

          {/* Desktop Table View (Section 13) */}
          <div className="hidden md:block bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-xs">
            <table className="w-full text-left text-xs border-collapse">
              <thead className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200 uppercase tracking-wider text-[11px]">
                <tr>
                  <th className="py-3 px-3.5 w-14">Ticket</th>
                  <th className="py-3 px-3.5">Customer Name</th>
                  <th className="py-3 px-3.5">Phone</th>
                  <th className="py-3 px-3.5">Lift Status</th>
                  <th className="py-3 px-3.5 text-right">Current Due</th>
                  <th className="py-3 px-3.5 text-right">Paid</th>
                  <th className="py-3 px-3.5 text-right">Balance</th>
                  <th className="py-3 px-3.5 text-center">Status</th>
                  <th className="py-3 px-3.5 text-right min-w-[200px]">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {monthLoading ? (
                  <tr>
                    <td colSpan={9} className="py-12 text-center text-slate-500">
                      Loading monthly dues...
                    </td>
                  </tr>
                ) : filteredDues.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="py-12 text-center text-slate-500">
                      No customer records match your search/filter for Month {selectedMonth}.
                    </td>
                  </tr>
                ) : (
                  filteredDues.map((due) => {
                    const isLifted = due.lift_status === 'lifted';
                    const isLiftMonth = due.lift_month === selectedMonth;

                    return (
                      <tr key={due.id} className="hover:bg-slate-50/80 transition-colors">
                        <td className="py-3 px-3.5 font-mono font-bold text-slate-700">
                          #{due.ticket_number || '00'}
                        </td>
                        <td className="py-3 px-3.5">
                          <button
                            type="button"
                            onClick={() => onOpenCustomerProfile(due.member_id)}
                            className="font-bold text-slate-900 hover:text-blue-600 hover:underline text-left block"
                          >
                            {due.customer_name}
                          </button>
                        </td>
                        <td className="py-3 px-3.5 font-mono text-slate-600">{due.phone}</td>
                        <td className="py-3 px-3.5">
                          {isLifted ? (
                            <button
                              type="button"
                              id={`sheet-lifted-btn-${due.member_id}`}
                              onClick={() => handleLiftedClick(due.member_id, due.lift_month)}
                              className="inline-flex items-center gap-1.5 text-[11px] px-3 py-1.5 rounded-xl font-bold bg-purple-100 text-purple-800 border border-purple-200 hover:bg-purple-200 hover:border-purple-300 transition-all cursor-pointer shadow-2xs group active:scale-95 whitespace-nowrap"
                              title="Click to view Lift Details"
                            >
                              <span>LIFTED</span>
                            </button>
                          ) : (
                            <button
                              type="button"
                              id={`sheet-not-lifted-btn-${due.member_id}`}
                              onClick={() => handleNotLiftedClick(due.member_id)}
                              className="inline-flex items-center gap-1 text-[11px] px-3 py-1.5 rounded-xl font-bold bg-slate-100 text-slate-700 border border-slate-200 hover:bg-slate-200 hover:border-slate-300 transition-all cursor-pointer shadow-2xs group active:scale-95 whitespace-nowrap"
                              title="Click to Mark Chit as Lifted"
                            >
                              <span>NOT LIFTED</span>
                            </button>
                          )}
                        </td>
                        <td className="py-3 px-3.5 text-right font-mono font-bold text-slate-900">
                          {formatINR(due.due_amount)}
                        </td>
                        <td className="py-3 px-3.5 text-right font-mono font-bold text-emerald-600">
                          {formatINR(due.paid_amount)}
                        </td>
                        <td className="py-3 px-3.5 text-right font-mono font-bold text-red-600">
                          {formatINR(due.balance_amount)}
                        </td>
                        <td className="py-3 px-3.5 text-center">
                          <span
                            className={`inline-block px-2.5 py-1 text-[11px] font-extrabold rounded-full ${
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
                        <td className="py-3 px-3.5 text-right">
                          <div className="flex items-center justify-end gap-1.5 flex-nowrap">
                            {/* Option 1: Receive Payment (if due has outstanding balance) */}
                            {due.status !== 'PAID' && (
                              <button
                                type="button"
                                id={`action-receive-payment-btn-${due.member_id}`}
                                onClick={() => onOpenPaymentModal(due)}
                                className="px-2.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold shadow-xs transition-colors flex items-center gap-1 whitespace-nowrap cursor-pointer"
                                title="Receive payment for this month"
                              >
                                <CreditCard className="w-3.5 h-3.5" />
                                <span>Receive Pay</span>
                              </button>
                            )}

                            {/* Option 2: Edit Payment (if any payment has been received for this due) */}
                            {due.paid_amount > 0 && (
                              <button
                                type="button"
                                id={`action-edit-payment-btn-${due.member_id}`}
                                onClick={() => setEditingPaymentDue(due)}
                                className="px-2.5 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 hover:border-blue-300 rounded-lg text-xs font-bold transition-all flex items-center gap-1 whitespace-nowrap cursor-pointer shadow-2xs"
                                title="Edit received payment details (amount, mode, date, remarks, or delete)"
                              >
                                <Edit2 className="w-3 h-3" />
                                <span>Edit Pay</span>
                              </button>
                            )}

                            {/* Option 3: View Customer Profile */}
                            <button
                              type="button"
                              id={`action-view-btn-${due.member_id}`}
                              onClick={() => onOpenCustomerProfile(due.member_id)}
                              className="px-2.5 py-1.5 text-slate-600 hover:text-slate-900 rounded-lg text-xs font-semibold bg-slate-100 hover:bg-slate-200 transition-colors whitespace-nowrap cursor-pointer"
                              title="View Customer Profile & History"
                            >
                              View
                            </button>

                            {/* Option 4: Lift Chit Award button if not yet lifted */}
                            {!isLifted && (
                              <button
                                type="button"
                                onClick={() => onOpenLiftModal(chit, selectedMonth, due.member_id)}
                                title="Lift Chit for this member"
                                className="p-1.5 text-purple-700 hover:bg-purple-100 rounded-lg transition-colors cursor-pointer"
                              >
                                <Award className="w-4 h-4" />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Mobile Cards View (Section 24: Mobile UI) */}
          <div className="block md:hidden space-y-3">
            {monthLoading ? (
              <div className="p-8 text-center text-slate-500">Loading dues...</div>
            ) : filteredDues.length === 0 ? (
              <div className="p-8 text-center text-slate-500 bg-white rounded-2xl border border-slate-200">
                No customer records found.
              </div>
            ) : (
              filteredDues.map((due) => (
                <div
                  key={due.id}
                  className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs space-y-3"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-1.5">
                        <span className="font-mono text-xs font-bold bg-slate-100 text-slate-700 px-1.5 py-0.5 rounded">
                          #{due.ticket_number || '00'}
                        </span>
                        <h4
                          onClick={() => onOpenCustomerProfile(due.member_id)}
                          className="font-bold text-slate-900 text-sm hover:text-blue-600"
                        >
                          {due.customer_name}
                        </h4>
                      </div>
                      <p className="text-xs text-slate-500 mt-0.5 flex items-center gap-1">
                        <Phone className="w-3 h-3" />
                        {due.phone}
                      </p>
                    </div>

                    <span
                      className={`text-xs px-2.5 py-0.5 font-bold rounded-full ${
                        due.status === 'PAID'
                          ? 'bg-emerald-100 text-emerald-800'
                          : due.status === 'PARTIAL'
                          ? 'bg-amber-100 text-amber-800'
                          : 'bg-red-100 text-red-800'
                      }`}
                    >
                      {due.status}
                    </span>
                  </div>

                  <div className="grid grid-cols-3 gap-2 bg-slate-50 p-2.5 rounded-xl text-center text-xs">
                    <div>
                      <span className="text-slate-500 block text-[10px]">Due</span>
                      <span className="font-bold text-slate-900 font-mono">{formatINR(due.due_amount)}</span>
                    </div>
                    <div>
                      <span className="text-slate-500 block text-[10px]">Paid</span>
                      <span className="font-bold text-emerald-600 font-mono">{formatINR(due.paid_amount)}</span>
                    </div>
                    <div>
                      <span className="text-slate-500 block text-[10px]">Balance</span>
                      <span className="font-bold text-red-600 font-mono">{formatINR(due.balance_amount)}</span>
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-1">
                    <div>
                      {due.lift_status === 'lifted' ? (
                        <button
                          type="button"
                          onClick={() => handleLiftedClick(due.member_id, due.lift_month)}
                          className="min-h-[40px] px-4 py-1.5 text-xs font-bold text-purple-800 bg-purple-100 border border-purple-200 rounded-xl inline-flex items-center hover:bg-purple-200 cursor-pointer active:scale-95 transition-all shadow-2xs whitespace-nowrap"
                          title="Click to view Lift Details"
                        >
                          <span>LIFTED</span>
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => handleNotLiftedClick(due.member_id)}
                          className="min-h-[40px] px-4 py-1.5 text-xs font-bold text-slate-700 bg-slate-100 border border-slate-200 rounded-xl inline-flex items-center hover:bg-slate-200 cursor-pointer active:scale-95 transition-all shadow-2xs whitespace-nowrap"
                          title="Click to Mark Chit as Lifted"
                        >
                          <span>NOT LIFTED</span>
                        </button>
                      )}
                    </div>

                    <div className="flex items-center gap-2 flex-wrap pt-1">
                      {due.status !== 'PAID' && (
                        <button
                          type="button"
                          onClick={() => onOpenPaymentModal(due)}
                          className="flex-1 py-2 px-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-xs flex items-center justify-center gap-1.5 cursor-pointer"
                        >
                          <CreditCard className="w-3.5 h-3.5" />
                          <span>Receive Pay ({formatINR(due.balance_amount)})</span>
                        </button>
                      )}
                      {due.paid_amount > 0 && (
                        <button
                          type="button"
                          onClick={() => setEditingPaymentDue(due)}
                          className="py-2 px-3 bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 rounded-xl text-xs font-bold flex items-center justify-center gap-1 cursor-pointer"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                          <span>Edit Pay</span>
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => onOpenCustomerProfile(due.member_id)}
                        className="py-2 px-3 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl cursor-pointer"
                      >
                        Profile
                      </button>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* ---------------- TAB 2: MEMBERS ROSTER ---------------- */}
      {activeTab === 'members' && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h3 className="text-base font-bold text-slate-900">Members Roster</h3>
              <p className="text-xs text-slate-500">
                Manage participants, contact details, ticket numbers, and lifetime contributions.
              </p>
            </div>
            <div className="flex items-center gap-2 self-start sm:self-auto flex-wrap">
              <button
                type="button"
                id="chit-import-customers-btn"
                onClick={() => setIsImportCustomersOpen(true)}
                className="flex items-center gap-1.5 px-3.5 py-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-300 rounded-xl text-xs font-bold shadow-2xs transition-colors cursor-pointer"
              >
                <UploadCloud className="w-4 h-4 text-emerald-600" />
                <span>Import Customers from Excel</span>
              </button>
              <button
                onClick={() => setIsAddingMember(true)}
                className="flex items-center gap-1.5 px-3.5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold shadow-xs transition-colors cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>Add Member</span>
              </button>
            </div>
          </div>

          {/* Add member inline modal */}
          {isAddingMember && (
            <form
              onSubmit={handleAddMember}
              className="bg-blue-50/70 border border-blue-200 rounded-2xl p-4 space-y-3 animate-in fade-in duration-150"
            >
              <h4 className="text-sm font-bold text-blue-950">Add New Member to {chit.name}</h4>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Customer Name *</label>
                  <input
                    type="text"
                    required
                    value={newMemberName}
                    onChange={(e) => setNewMemberName(e.target.value)}
                    placeholder="Full Name"
                    className="w-full px-3 py-1.5 text-sm bg-white border border-slate-300 rounded-xl"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Phone Number *</label>
                  <input
                    type="text"
                    required
                    value={newMemberPhone}
                    onChange={(e) => setNewMemberPhone(e.target.value)}
                    placeholder="9876543210"
                    className="w-full px-3 py-1.5 text-sm bg-white border border-slate-300 rounded-xl font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Ticket # (Optional)</label>
                  <input
                    type="text"
                    value={newMemberTicket}
                    onChange={(e) => setNewMemberTicket(e.target.value)}
                    placeholder="e.g. 26"
                    className="w-full px-3 py-1.5 text-sm bg-white border border-slate-300 rounded-xl font-mono"
                  />
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setIsAddingMember(false)}
                  className="px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-200 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSavingMember}
                  className="px-4 py-1.5 text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white rounded-lg shadow-xs"
                >
                  {isSavingMember ? 'Saving...' : 'Save Member'}
                </button>
              </div>
            </form>
          )}

          {/* Summary Box */}
          <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs">
            <div className="grid grid-cols-1 sm:grid-cols-3 divide-y sm:divide-y-0 sm:divide-x divide-slate-100 gap-4 sm:gap-0 text-center sm:text-left">
              <div className="sm:pr-4">
                <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">
                  CURRENT MONTH
                </span>
                <span className="text-xl font-extrabold text-slate-900 block mt-1">
                  Month {selectedMonth || chit.current_month || 1} / {chit.total_months || 20}
                </span>
              </div>
              <div className="sm:px-6 pt-4 sm:pt-0">
                <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">
                  LIFTED
                </span>
                <span className="text-xl font-extrabold text-purple-700 block mt-1">
                  {chit.members?.filter((m) => m.lift_status === 'lifted').length || 0} / {chit.total_months || 20}
                </span>
              </div>
              <div className="sm:pl-6 pt-4 sm:pt-0">
                <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">
                  REMAINING
                </span>
                <span className="text-xl font-extrabold text-slate-900 block mt-1">
                  {(chit.members?.length || chit.total_months || 20) - (chit.members?.filter((m) => m.lift_status === 'lifted').length || 0)}
                </span>
              </div>
            </div>
          </div>

          {/* Simple Clean Customer List */}
          <div className="bg-white rounded-2xl border border-slate-200 divide-y divide-slate-100 shadow-xs overflow-hidden">
            {chit.members?.map((m) => {
              const isLifted = m.lift_status === 'lifted';
              return (
                <div
                  key={m.id}
                  className="p-4 sm:px-6 flex items-center justify-between gap-4 hover:bg-slate-50/70 transition-colors"
                >
                  <div>
                    <h4 className="text-base font-bold text-slate-900">
                      {m.customer_name}
                    </h4>
                    <p className="text-sm font-mono text-slate-500 mt-0.5">
                      {m.phone}
                    </p>
                  </div>

                  <div>
                    {isLifted ? (
                      <button
                        type="button"
                        id={`customer-lifted-btn-${m.id}`}
                        onClick={() => handleLiftedClick(m.id, m.lift_month)}
                        className="min-h-[40px] px-5 py-2 text-xs font-bold rounded-xl bg-purple-100 text-purple-800 border border-purple-200 hover:bg-purple-200 active:scale-95 transition-all cursor-pointer shadow-2xs whitespace-nowrap"
                      >
                        LIFTED
                      </button>
                    ) : (
                      <button
                        type="button"
                        id={`customer-not-lifted-btn-${m.id}`}
                        onClick={() => handleNotLiftedClick(m.id)}
                        className="min-h-[40px] px-5 py-2 text-xs font-bold rounded-xl bg-slate-100 text-slate-700 border border-slate-200 hover:bg-slate-200 active:scale-95 transition-all cursor-pointer shadow-2xs whitespace-nowrap"
                      >
                        NOT LIFTED
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ---------------- TAB 3: MONTHLY PAYMENT RULES ---------------- */}
      {activeTab === 'rules' && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h3 className="text-base font-bold text-slate-900">Monthly Chit Rules & Schedules</h3>
              <p className="text-xs text-slate-500">
                Independent rules per month. Historical paid dues remain completely unchanged if rules are edited.
              </p>
            </div>
            {!isEditingRules ? (
              <button
                onClick={() => setIsEditingRules(true)}
                className="flex items-center gap-1.5 px-3.5 py-2 bg-slate-800 hover:bg-slate-900 text-white rounded-xl text-xs font-bold transition-colors self-start sm:self-auto"
              >
                <Edit2 className="w-3.5 h-3.5" />
                <span>Edit Rules</span>
              </button>
            ) : (
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setIsEditingRules(false)}
                  className="px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-200 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSaveEditedRules}
                  disabled={isSavingRules}
                  className="px-4 py-1.5 text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg"
                >
                  {isSavingRules ? 'Saving...' : 'Save & Preserve History'}
                </button>
              </div>
            )}
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-xs">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200 uppercase text-[11px]">
                  <tr>
                    <th className="p-3 w-16">Month</th>
                    <th className="p-3">Month Name</th>
                    <th className="p-3 text-right">Pre-Lift Due (₹)</th>
                    <th className="p-3 text-right">Post-Lift Due (₹)</th>
                    <th className="p-3 text-right">Monthly Chit Value (₹)</th>
                    <th className="p-3 text-right">Configured Lift Payout (₹)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {(isEditingRules ? editableRules : chit.rules)?.map((rule, idx) => (
                    <tr key={rule.month_number} className="hover:bg-slate-50 transition-colors">
                      <td className="p-3 font-bold text-slate-800">Month {rule.month_number}</td>
                      <td className="p-3 font-medium text-slate-700">{rule.month_name}</td>
                      <td className="p-3 text-right font-mono font-bold text-slate-900">
                        {isEditingRules ? (
                          <input
                            type="number"
                            value={rule.pre_lift_payment}
                            onChange={(e) => {
                              const val = parseFloat(e.target.value) || 0;
                              setEditableRules((prev) => {
                                const next = [...prev];
                                next[idx] = { ...next[idx], pre_lift_payment: val };
                                return next;
                              });
                            }}
                            className="w-28 px-2 py-1 text-right bg-white border border-slate-300 rounded font-mono"
                          />
                        ) : (
                          formatINR(rule.pre_lift_payment)
                        )}
                      </td>
                      <td className="p-3 text-right font-mono font-bold text-purple-900">
                        {isEditingRules ? (
                          <input
                            type="number"
                            value={rule.post_lift_payment}
                            onChange={(e) => {
                              const val = parseFloat(e.target.value) || 0;
                              setEditableRules((prev) => {
                                const next = [...prev];
                                next[idx] = { ...next[idx], post_lift_payment: val };
                                return next;
                              });
                            }}
                            className="w-28 px-2 py-1 text-right bg-white border border-slate-300 rounded font-mono"
                          />
                        ) : (
                          formatINR(rule.post_lift_payment)
                        )}
                      </td>
                      <td className="p-3 text-right font-mono text-slate-700">
                        {isEditingRules ? (
                          <input
                            type="number"
                            value={rule.monthly_chit_value}
                            onChange={(e) => {
                              const val = parseFloat(e.target.value) || 0;
                              setEditableRules((prev) => {
                                const next = [...prev];
                                next[idx] = { ...next[idx], monthly_chit_value: val };
                                return next;
                              });
                            }}
                            className="w-28 px-2 py-1 text-right bg-white border border-slate-300 rounded font-mono"
                          />
                        ) : (
                          formatINR(rule.monthly_chit_value)
                        )}
                      </td>
                      <td className="p-3 text-right font-mono text-slate-700">
                        {isEditingRules ? (
                          <input
                            type="number"
                            value={rule.expected_lift_payout}
                            onChange={(e) => {
                              const val = parseFloat(e.target.value) || 0;
                              setEditableRules((prev) => {
                                const next = [...prev];
                                next[idx] = { ...next[idx], expected_lift_payout: val };
                                return next;
                              });
                            }}
                            className="w-28 px-2 py-1 text-right bg-white border border-slate-300 rounded font-mono"
                          />
                        ) : (
                          formatINR(rule.expected_lift_payout)
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* ---------------- SECTION 12: MONTHLY LIFT PAYOUT ---------------- */}
          <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h3 className="text-base font-black text-slate-900 tracking-tight uppercase">
                  MONTHLY LIFT PAYOUT
                </h3>
                <p className="text-xs text-slate-500">
                  Month-wise expected lift payouts. These serve as the default amount when a customer lifts each month.
                </p>
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                <button
                  id="import-lift-payouts-excel-btn"
                  type="button"
                  onClick={() => setIsImportLiftPayoutsOpen(true)}
                  className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-purple-600 hover:bg-purple-700 text-white rounded-xl text-xs font-bold shadow-2xs transition-colors cursor-pointer"
                >
                  <UploadCloud className="w-3.5 h-3.5" />
                  <span>Import from Excel</span>
                </button>

                <button
                  id="download-lift-payout-template-btn"
                  type="button"
                  onClick={() => downloadLiftPayoutTemplate(chit.total_months, chit.rules)}
                  className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 rounded-xl text-xs font-bold shadow-2xs transition-colors cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Download Template</span>
                </button>

                {!isEditingPayouts ? (
                  <button
                    id="edit-lift-payouts-btn"
                    type="button"
                    onClick={() => {
                      if (chit.rules) {
                        setEditablePayouts(
                          chit.rules.map((r) => ({
                            month_number: r.month_number,
                            lift_payout: r.expected_lift_payout || 0,
                          }))
                        );
                      }
                      setIsEditingPayouts(true);
                    }}
                    className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-slate-800 hover:bg-slate-900 text-white rounded-xl text-xs font-bold transition-colors cursor-pointer"
                  >
                    <Edit2 className="w-3.5 h-3.5" />
                    <span>Edit</span>
                  </button>
                ) : (
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setIsEditingPayouts(false)}
                      className="px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-200 rounded-lg cursor-pointer"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={handleSaveEditedPayouts}
                      disabled={isSavingPayouts}
                      className="px-4 py-1.5 text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg cursor-pointer disabled:opacity-50"
                    >
                      {isSavingPayouts ? 'Saving...' : 'Save Changes'}
                    </button>
                  </div>
                )}
              </div>
            </div>

            <div className="border border-slate-200 rounded-xl overflow-hidden shadow-2xs">
              <table className="w-full text-left text-xs border-collapse">
                <thead className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200 uppercase text-[11px]">
                  <tr>
                    <th className="p-3 w-28">Month</th>
                    <th className="p-3 text-right">Lift Payout</th>
                    <th className="p-3 text-center w-36">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-mono">
                  {(chit.rules || []).map((rule, idx) => {
                    const currentVal = isEditingPayouts
                      ? (editablePayouts[idx]?.lift_payout ?? rule.expected_lift_payout ?? 0)
                      : (rule.expected_lift_payout ?? 0);
                    const isConfigured = currentVal > 0;

                    return (
                      <tr key={rule.month_number} className="hover:bg-slate-50 transition-colors">
                        <td className="p-3 font-bold text-slate-900 font-sans">
                          Month {rule.month_number}
                        </td>
                        <td className="p-3 text-right font-bold text-purple-900">
                          {isEditingPayouts ? (
                            <input
                              type="number"
                              min="0"
                              step="1"
                              value={editablePayouts[idx]?.lift_payout ?? 0}
                              onChange={(e) => {
                                const val = parseFloat(e.target.value) || 0;
                                setEditablePayouts((prev) => {
                                  const next = [...prev];
                                  next[idx] = { ...next[idx], lift_payout: val };
                                  return next;
                                });
                              }}
                              className="w-36 px-2.5 py-1 text-right bg-white border border-slate-300 rounded-lg font-mono font-bold text-purple-950 focus:ring-2 focus:ring-purple-500"
                            />
                          ) : (
                            formatINR(rule.expected_lift_payout)
                          )}
                        </td>
                        <td className="p-3 text-center font-sans">
                          {isConfigured ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                              <CheckCircle className="w-3 h-3 text-emerald-600" />
                              Configured
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-slate-100 text-slate-600 border border-slate-200">
                              Not Configured
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ---------------- TAB 4: LIFT MANAGEMENT ---------------- */}
      {activeTab === 'lift' && (
        <div className="space-y-4">
          {/* Summary Box */}
          <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs">
            <div className="grid grid-cols-1 sm:grid-cols-3 divide-y sm:divide-y-0 sm:divide-x divide-slate-100 gap-4 sm:gap-0 text-center sm:text-left">
              <div className="sm:pr-4">
                <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">
                  CURRENT MONTH
                </span>
                <span className="text-xl font-extrabold text-slate-900 block mt-1">
                  Month {chit.current_month || selectedMonth || 1} / {chit.total_months || 25}
                </span>
              </div>
              <div className="sm:px-6 pt-4 sm:pt-0">
                <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">
                  LIFTED
                </span>
                <span className="text-xl font-extrabold text-purple-700 block mt-1">
                  {chit.members?.filter((m) => m.lift_status === 'lifted').length || 0} / {chit.total_months || 25}
                </span>
              </div>
              <div className="sm:pl-6 pt-4 sm:pt-0">
                <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">
                  REMAINING
                </span>
                <span className="text-xl font-extrabold text-slate-900 block mt-1">
                  {(chit.members?.length || chit.total_months || 25) - (chit.members?.filter((m) => m.lift_status === 'lifted').length || 0)}
                </span>
              </div>
            </div>
          </div>

          {/* View Mode Toggle: [ Customer List ] [ Lift Management Report ] */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-1.5 bg-slate-100 p-1 rounded-xl self-start sm:self-auto">
              <button
                type="button"
                id="lift-view-list-btn"
                onClick={() => setLiftViewMode('list')}
                className={`px-3.5 py-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                  liftViewMode === 'list'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Customer List
              </button>
              <button
                type="button"
                id="lift-view-report-btn"
                onClick={() => setLiftViewMode('report')}
                className={`px-3.5 py-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                  liftViewMode === 'report'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Lift Management Report
              </button>
            </div>

            <div className="flex items-center gap-2 self-start sm:self-auto flex-wrap">
              <button
                id="lift-tab-import-payout-btn"
                type="button"
                onClick={() => setIsImportLiftPayoutsOpen(true)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-purple-50 hover:bg-purple-100 text-purple-700 border border-purple-300 rounded-xl text-xs font-bold shadow-2xs transition-colors cursor-pointer"
              >
                <UploadCloud className="w-3.5 h-3.5" />
                <span>Import Lift Payouts from Excel</span>
              </button>

              <button
                id="lift-tab-download-template-btn"
                type="button"
                onClick={() => downloadLiftPayoutTemplate(chit.total_months, chit.rules)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 rounded-xl text-xs font-bold shadow-2xs transition-colors cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Download Lift Payout Template</span>
              </button>

              <button
                type="button"
                onClick={() => setIsImportCustomersOpen(true)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-300 rounded-xl text-xs font-bold shadow-2xs transition-colors cursor-pointer"
              >
                <UploadCloud className="w-3.5 h-3.5 text-emerald-600" />
                <span>Import Customers from Excel</span>
              </button>
            </div>
          </div>

          {/* 1. Main Clean Customer List */}
          {liftViewMode === 'list' && (
            <div className="bg-white rounded-2xl border border-slate-200 divide-y divide-slate-100 shadow-xs overflow-hidden">
              {chit.members?.map((m) => {
                const isLifted = m.lift_status === 'lifted';
                return (
                  <div
                    key={m.id}
                    className="p-4 sm:px-6 flex items-center justify-between gap-4 hover:bg-slate-50/70 transition-colors"
                  >
                    <div>
                      <h4 className="text-base font-bold text-slate-900">
                        {m.customer_name}
                      </h4>
                      <p className="text-sm font-mono text-slate-500 mt-0.5">
                        {m.phone}
                      </p>
                    </div>

                    <div>
                      {isLifted ? (
                        <button
                          type="button"
                          id={`lift-tab-lifted-btn-${m.id}`}
                          onClick={() => handleLiftedClick(m.id, m.lift_month)}
                          className="min-h-[40px] px-5 py-2 text-xs font-bold rounded-xl bg-purple-100 text-purple-800 border border-purple-200 hover:bg-purple-200 active:scale-95 transition-all cursor-pointer shadow-2xs whitespace-nowrap"
                        >
                          LIFTED
                        </button>
                      ) : (
                        <button
                          type="button"
                          id={`lift-tab-not-lifted-btn-${m.id}`}
                          onClick={() => handleNotLiftedClick(m.id)}
                          className="min-h-[40px] px-5 py-2 text-xs font-bold rounded-xl bg-slate-100 text-slate-700 border border-slate-200 hover:bg-slate-200 active:scale-95 transition-all cursor-pointer shadow-2xs whitespace-nowrap"
                        >
                          NOT LIFTED
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* 2. Comprehensive Lift Management Report Table */}
          {liftViewMode === 'report' && (
            <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead className="bg-slate-50 text-slate-700 font-bold border-b border-slate-200 uppercase text-[11px]">
                    <tr>
                      <th className="py-3 px-4">Lift Month</th>
                      <th className="py-3 px-4">Customer Name</th>
                      <th className="py-3 px-4">Phone</th>
                      <th className="py-3 px-4">Lift Date</th>
                      <th className="py-3 px-4 text-right">Lift Amount</th>
                      <th className="py-3 px-4">Payment Method</th>
                      <th className="py-3 px-4">Reference No.</th>
                      <th className="py-3 px-4 text-center">Status</th>
                      <th className="py-3 px-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {chit.members?.map((m) => {
                      const isLifted = m.lift_status === 'lifted';
                      const liftAmount = m.lift_amount_received ?? m.lift_amount;
                      const paymentMethod = m.payment_method || m.lift_payment_method || (isLifted ? 'Cash' : '—');
                      const reference = m.reference_number || m.lift_reference_number || '—';

                      return (
                        <tr key={m.id} className="hover:bg-slate-50/80 transition-colors">
                          <td className="py-3 px-4 font-bold text-slate-900">
                            {isLifted ? `Month ${m.lift_month}` : '—'}
                          </td>
                          <td className="py-3 px-4 font-semibold text-slate-900">
                            {m.customer_name}
                          </td>
                          <td className="py-3 px-4 font-mono text-slate-600">
                            {m.phone}
                          </td>
                          <td className="py-3 px-4 font-mono text-slate-700">
                            {isLifted && m.lift_date ? formatDDMMYYYY(m.lift_date) : '—'}
                          </td>
                          <td className="py-3 px-4 text-right font-mono font-bold text-purple-700">
                            {isLifted && liftAmount !== undefined ? formatINR(liftAmount) : '—'}
                          </td>
                          <td className="py-3 px-4">
                            {isLifted ? (
                              <span className="inline-block bg-slate-100 border border-slate-200 px-2 py-0.5 rounded text-[11px] font-semibold text-slate-800">
                                {paymentMethod}
                              </span>
                            ) : (
                              '—'
                            )}
                          </td>
                          <td className="py-3 px-4 font-mono text-slate-600">
                            {reference}
                          </td>
                          <td className="py-3 px-4 text-center">
                            {isLifted ? (
                              <span className="inline-block px-2.5 py-0.5 rounded-full font-bold text-[10px] bg-purple-100 text-purple-800 border border-purple-200">
                                LIFTED
                              </span>
                            ) : (
                              <span className="inline-block px-2.5 py-0.5 rounded-full font-bold text-[10px] bg-slate-100 text-slate-700 border border-slate-200">
                                NOT LIFTED
                              </span>
                            )}
                          </td>
                          <td className="py-3 px-4 text-right">
                            {isLifted ? (
                              <div className="flex items-center justify-end gap-1.5">
                                <button
                                  type="button"
                                  onClick={() => handleLiftedClick(m.id, m.lift_month)}
                                  className="px-2 py-1 text-[11px] font-bold text-purple-700 hover:bg-purple-50 rounded-lg transition-colors cursor-pointer"
                                >
                                  Details
                                </button>
                                <button
                                  type="button"
                                  onClick={() => onOpenLiftModal(chit, m.lift_month || selectedMonth, m.id)}
                                  className="px-2 py-1 text-[11px] font-bold text-blue-600 hover:bg-blue-50 rounded-lg transition-colors cursor-pointer"
                                >
                                  Edit
                                </button>
                              </div>
                            ) : (
                              <button
                                type="button"
                                onClick={() => handleNotLiftedClick(m.id)}
                                className="px-2.5 py-1 text-[11px] font-bold text-slate-700 bg-slate-100 hover:bg-purple-50 hover:text-purple-700 rounded-lg transition-colors cursor-pointer"
                              >
                                Mark Lifted
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ---------------- TAB 5: REPORTS ---------------- */}
      {activeTab === 'reports' && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h3 className="text-base font-bold text-slate-900">Chit Fund Analytical Reports</h3>
              <p className="text-xs text-slate-500">
                Detailed breakdowns, collection audit, pending dues, and CSV export.
              </p>
            </div>
            <div className="flex items-center gap-2 self-start sm:self-auto">
              <button
                onClick={() => window.print()}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition-colors"
              >
                <Printer className="w-3.5 h-3.5" />
                <span>Print</span>
              </button>
              <button
                onClick={() => {
                  if (reportSubTab === 'monthly') exportCSV(reportsData?.monthlyCollection || [], `${chit.name}_monthly_report`);
                  else if (reportSubTab === 'customers') exportCSV(reportsData?.customerWise || [], `${chit.name}_customers_report`);
                }}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-xs transition-colors"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Export CSV</span>
              </button>
            </div>
          </div>

          {/* Subtabs for reports */}
          <div className="flex items-center gap-2 border-b border-slate-200 pb-2">
            {[
              { id: 'monthly', label: 'Monthly Collection' },
              { id: 'customers', label: 'Customer-Wise Report' },
              { id: 'pending', label: 'Pending Dues' },
              { id: 'lifted', label: 'Lifted Members Report' },
            ].map((st) => (
              <button
                key={st.id}
                onClick={() => setReportSubTab(st.id as any)}
                className={`px-3 py-1.5 text-xs font-bold rounded-xl transition-all ${
                  reportSubTab === st.id
                    ? 'bg-blue-600 text-white'
                    : 'text-slate-600 hover:bg-slate-100'
                }`}
              >
                {st.label}
              </button>
            ))}
          </div>

          {reportsLoading || !reportsData ? (
            <div className="p-8 text-center text-slate-500">Generating report...</div>
          ) : (
            <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-xs">
              {reportSubTab === 'monthly' && (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200 uppercase text-[11px]">
                      <tr>
                        <th className="p-3">Month</th>
                        <th className="p-3">Month Name</th>
                        <th className="p-3 text-right">Total Due</th>
                        <th className="p-3 text-right">Total Collected</th>
                        <th className="p-3 text-right">Pending Balance</th>
                        <th className="p-3 text-center">Paid / Members</th>
                        <th className="p-3">Lifted By</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {reportsData.monthlyCollection?.map((m: any) => (
                        <tr key={m.month_number} className="hover:bg-slate-50">
                          <td className="p-3 font-bold text-slate-800">Month {m.month_number}</td>
                          <td className="p-3 text-slate-600">{m.month_name}</td>
                          <td className="p-3 text-right font-mono font-medium text-slate-900">{formatINR(m.total_due)}</td>
                          <td className="p-3 text-right font-mono font-bold text-emerald-600">{formatINR(m.total_paid)}</td>
                          <td className="p-3 text-right font-mono font-bold text-red-600">{formatINR(m.total_balance)}</td>
                          <td className="p-3 text-center font-mono">
                            {m.count_paid} / {m.total_members_count}
                          </td>
                          <td className="p-3 font-medium text-purple-900">
                            {m.lifted_by ? `${m.lifted_by} (${formatINR(m.lift_amount_received)})` : '-'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {reportSubTab === 'customers' && (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200 uppercase text-[11px]">
                      <tr>
                        <th className="p-3">Ticket</th>
                        <th className="p-3">Customer</th>
                        <th className="p-3">Phone</th>
                        <th className="p-3">Lift Status</th>
                        <th className="p-3 text-right">Total Due</th>
                        <th className="p-3 text-right">Total Paid</th>
                        <th className="p-3 text-right">Outstanding</th>
                        <th className="p-3 text-center">Paid Months</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {reportsData.customerWise?.map((c: any) => (
                        <tr key={c.id} className="hover:bg-slate-50">
                          <td className="p-3 font-mono font-bold">#{c.ticket_number}</td>
                          <td className="p-3 font-bold text-slate-900">{c.customer_name}</td>
                          <td className="p-3 font-mono text-slate-600">{c.phone}</td>
                          <td className="p-3">
                            {c.lift_status === 'lifted' ? (
                              <button
                                type="button"
                                onClick={() => handleLiftedClick(c.id, c.lift_month)}
                                className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full font-bold bg-purple-100 text-purple-800 hover:bg-purple-200 cursor-pointer"
                              >
                                <span>🏆</span> LIFTED (M{c.lift_month})
                              </button>
                            ) : (
                              <button
                                type="button"
                                onClick={() => handleNotLiftedClick(c.id)}
                                className="text-[11px] px-2 py-0.5 rounded-full font-bold bg-slate-100 text-slate-700 hover:bg-purple-50 hover:text-purple-700 cursor-pointer"
                              >
                                NOT LIFTED
                              </button>
                            )}
                          </td>
                          <td className="p-3 text-right font-mono">{formatINR(c.total_due)}</td>
                          <td className="p-3 text-right font-mono font-bold text-emerald-600">{formatINR(c.total_paid)}</td>
                          <td className="p-3 text-right font-mono font-bold text-red-600">{formatINR(c.total_balance)}</td>
                          <td className="p-3 text-center font-mono">{c.paid_months_count} / {chit.total_months}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {reportSubTab === 'pending' && (
                <div className="p-4 space-y-3">
                  <h4 className="text-sm font-bold text-slate-900">
                    Customers with Outstanding Payments ({reportsData.customerWise?.filter((c: any) => c.total_balance > 0).length || 0})
                  </h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                    {reportsData.customerWise
                      ?.filter((c: any) => c.total_balance > 0)
                      .map((c: any) => (
                        <div key={c.id} className="p-3 bg-red-50/50 border border-red-200 rounded-xl space-y-1">
                          <div className="flex items-center justify-between">
                            <span className="font-bold text-slate-900">{c.customer_name}</span>
                            <span className="text-xs font-mono font-bold text-red-700">{formatINR(c.total_balance)}</span>
                          </div>
                          <p className="text-xs text-slate-500">Ticket #{c.ticket_number} • {c.phone}</p>
                          <div className="pt-2 flex justify-end">
                            <button
                              type="button"
                              onClick={() => onOpenCustomerProfile(c.id)}
                              className="text-xs font-bold text-blue-600 hover:underline"
                            >
                              Open Profile &rarr;
                            </button>
                          </div>
                        </div>
                      ))}
                  </div>
                </div>
              )}

              {reportSubTab === 'lifted' && (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead className="bg-purple-100 text-purple-950 font-bold border-b border-purple-200 uppercase text-[11px]">
                      <tr>
                        <th className="p-3">Lift Month</th>
                        <th className="p-3">Ticket</th>
                        <th className="p-3">Member Name</th>
                        <th className="p-3">Phone</th>
                        <th className="p-3 text-right">Disbursed Amount</th>
                        <th className="p-3">Disbursal Date</th>
                        <th className="p-3">Payment Method</th>
                        <th className="p-3">Reference No.</th>
                        <th className="p-3">Notes</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-purple-50">
                      {reportsData.liftedMembers?.map((l: any) => (
                        <tr key={l.id} className="hover:bg-purple-50/50">
                          <td className="p-3 font-bold text-purple-950">Month {l.lift_month}</td>
                          <td className="p-3 font-mono font-bold">#{l.ticket_number}</td>
                          <td className="p-3 font-bold text-slate-900">{l.customer_name}</td>
                          <td className="p-3 font-mono text-slate-600">{l.phone}</td>
                          <td className="p-3 text-right font-mono font-bold text-purple-900">
                            {formatINR(l.lift_amount_received ?? l.lift_amount ?? 0)}
                          </td>
                          <td className="p-3 text-slate-700 font-mono">{formatDDMMYYYY(l.lift_date)}</td>
                          <td className="p-3 font-semibold text-slate-800">{l.payment_method || 'Cash'}</td>
                          <td className="p-3 font-mono text-slate-600">{l.reference_number || '-'}</td>
                          <td className="p-3 text-slate-500 italic">{l.notes || '-'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>
      )}
      {/* Lift Details Modal for already lifted customers */}
      <LiftDetailsModal
        isOpen={isLiftDetailsOpen}
        member={liftDetailsMember}
        chit={chit}
        onClose={() => {
          setIsLiftDetailsOpen(false);
          setLiftDetailsMember(null);
        }}
        onEditLift={(member) => {
          setIsLiftDetailsOpen(false);
          setLiftDetailsMember(null);
          if (chit) {
            onOpenLiftModal(chit, member.lift_month || selectedMonth, member.id);
          }
        }}
      />

      {/* Monthly Profit Details Modal */}
      <MonthlyProfitModal
        isOpen={showProfitDetailsModal}
        onClose={() => setShowProfitDetailsModal(false)}
        profitDetails={monthData?.profit}
        monthNumber={selectedMonth}
        monthName={monthData?.rule?.month_name}
        expectedLiftPayout={monthData?.rule?.expected_lift_payout}
      />

      {/* Edit Chit Details Modal */}
      <EditChitModal
        isOpen={isEditChitOpen}
        onClose={() => setIsEditChitOpen(false)}
        chit={chit}
        onSave={handleUpdateChitDetails}
      />

      {/* Delete Chit Option Modal */}
      <DeleteChitModal
        isOpen={isDeleteChitOpen}
        onClose={() => setIsDeleteChitOpen(false)}
        chit={chit}
        onConfirmDelete={handleDeleteChit}
      />

      {/* Import Customers from Excel Modal */}
      <ImportCustomersModal
        isOpen={isImportCustomersOpen}
        onClose={() => setIsImportCustomersOpen(false)}
        chitId={chit.id}
        chitName={chit.name}
        totalMembersLimit={chit.total_members}
        existingMembers={chit.members || []}
        onImportSuccess={() => {
          triggerRefresh();
        }}
        onImportToBackend={async (customers) => {
          const res = await api.members.importBatch(chit.id, customers);
          triggerRefresh();
          return res;
        }}
      />

      {/* Import Lift Payouts from Excel Modal */}
      <ImportLiftPayoutModal
        isOpen={isImportLiftPayoutsOpen}
        onClose={() => setIsImportLiftPayoutsOpen(false)}
        chitId={chit.id}
        chitName={chit.name}
        totalMonths={chit.total_months}
        existingRules={chit.rules}
        onImportSuccess={() => {
          triggerRefresh();
        }}
        onImportToBackend={async (payouts) => {
          const res = await api.chits.updateLiftPayouts(chit.id, payouts);
          triggerRefresh();
          return res;
        }}
      />

      {/* Edit Received Payment Modal */}
      {editingPaymentDue && (
        <EditPaymentModal
          due={editingPaymentDue}
          onClose={() => setEditingPaymentDue(null)}
          onSuccess={() => {
            fetchMonthData(selectedMonth);
            triggerRefresh();
            setEditingPaymentDue(null);
          }}
        />
      )}
    </div>
  );
};
