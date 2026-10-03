import { DashboardStats, Chit } from '../types';
import { formatDate, formatDateTime, formatINR } from './formatters';

function escapeCSV(val: any): string {
  if (val === null || val === undefined) return '""';
  const str = String(val);
  return `"${str.replace(/"/g, '""')}"`;
}

export interface DashboardCSVExportOptions {
  stats: DashboardStats | null;
  chits: (Chit & { total_collected?: number; total_pending?: number; active_members_count?: number })[];
  filteredChits?: (Chit & { total_collected?: number; total_pending?: number; active_members_count?: number })[];
  filterStatus?: string;
  searchTerm?: string;
}

/**
 * Generates and downloads a comprehensive CSV report containing:
 * 1. Executive Dashboard KPIs & financial summary
 * 2. Chit Portfolio list (with members, collection, pending, and progress)
 * 3. Recent payment ledger entries (if available)
 */
export function exportDashboardToCSV(options: DashboardCSVExportOptions): { success: boolean; filename: string; count: number } {
  const { stats, chits, filteredChits, filterStatus, searchTerm } = options;
  const targetChits = filteredChits && filteredChits.length > 0 ? filteredChits : chits;
  const now = new Date();
  const dateStr = now.toISOString().slice(0, 10);
  const filename = `chit_dashboard_report_${dateStr}.csv`;

  const rows: string[] = [];

  // UTF-8 BOM for Microsoft Excel / Sheets compatibility
  const BOM = '\uFEFF';

  // 1. Report Header
  rows.push([escapeCSV('CHIT FUND MANAGEMENT SYSTEM - EXECUTIVE DASHBOARD REPORT')].join(','));
  rows.push([escapeCSV('Generated Date & Time'), escapeCSV(formatDateTime(now.toISOString()))].join(','));
  rows.push([escapeCSV('Total Chits in Report'), escapeCSV(targetChits.length.toString())].join(','));
  if (filterStatus && filterStatus !== 'ALL') {
    rows.push([escapeCSV('Status Filter Applied'), escapeCSV(filterStatus.toUpperCase())].join(','));
  }
  if (searchTerm && searchTerm.trim()) {
    rows.push([escapeCSV('Search Query Applied'), escapeCSV(searchTerm.trim())].join(','));
  }
  rows.push(''); // Blank separator line

  // 2. Executive Dashboard KPI Summary
  rows.push([escapeCSV('=== EXECUTIVE DASHBOARD FINANCIAL SUMMARY ===')].join(','));
  rows.push([escapeCSV('Metric / KPI'), escapeCSV('Value'), escapeCSV('Formatted Value'), escapeCSV('Description')].join(','));

  const totalActiveChits = stats?.totalActiveChits ?? chits.filter((c) => c.status === 'active').length;
  const totalCreatedChits = chits.length;
  const totalMembers = stats?.totalMembers ?? 0;
  const totalCollected = stats?.totalCollected ?? stats?.todayCollection ?? 0;
  const totalOutstanding = stats?.totalOutstanding ?? stats?.totalPendingAmount ?? 0;
  const todayCollection = stats?.todayCollection ?? 0;
  const totalDueAccounts = stats?.totalPendingCustomers ?? 0;
  const totalPaidAccounts = stats?.totalPaidCustomers ?? 0;

  rows.push([
    escapeCSV('Active Chit Groups'),
    escapeCSV(totalActiveChits),
    escapeCSV(`${totalActiveChits} Active`),
    escapeCSV('Currently ongoing chit groups in progress')
  ].join(','));

  rows.push([
    escapeCSV('Total Created Chit Groups'),
    escapeCSV(totalCreatedChits),
    escapeCSV(`${totalCreatedChits} Groups`),
    escapeCSV('Total chit groups registered in the system')
  ].join(','));

  rows.push([
    escapeCSV('Total Enrolled Members'),
    escapeCSV(totalMembers),
    escapeCSV(`${totalMembers} Members`),
    escapeCSV('Total customer slots enrolled across all chit groups')
  ].join(','));

  rows.push([
    escapeCSV('Total Verified Collections'),
    escapeCSV(totalCollected),
    escapeCSV(formatINR(totalCollected)),
    escapeCSV('Total realized payments collected from members')
  ].join(','));

  rows.push([
    escapeCSV('Total Pending Outstanding'),
    escapeCSV(totalOutstanding),
    escapeCSV(formatINR(totalOutstanding)),
    escapeCSV('Outstanding payment balance remaining for the current period')
  ].join(','));

  rows.push([
    escapeCSV("Today's Collection"),
    escapeCSV(todayCollection),
    escapeCSV(formatINR(todayCollection)),
    escapeCSV('Payments recorded on today\'s date')
  ].join(','));

  rows.push([
    escapeCSV('Pending Due Accounts'),
    escapeCSV(totalDueAccounts),
    escapeCSV(`${totalDueAccounts} Members Due`),
    escapeCSV('Members with outstanding payments pending')
  ].join(','));

  rows.push([
    escapeCSV('Cleared / Paid Accounts'),
    escapeCSV(totalPaidAccounts),
    escapeCSV(`${totalPaidAccounts} Members Paid`),
    escapeCSV('Members who have cleared current month dues')
  ].join(','));

  rows.push(''); // Blank separator line

  // 3. Chit Groups Portfolio Table
  rows.push([escapeCSV('=== CHIT GROUPS PORTFOLIO DIRECTORY ===')].join(','));
  const chitHeaders = [
    'Chit ID',
    'Chit Name',
    'Status',
    'Chit Value (INR)',
    'Duration (Months)',
    'Current Month',
    'Enrolled Members',
    'Start Month',
    'End Month',
    'Total Collection (INR)',
    'Pending Outstanding (INR)',
    'Collection Progress (%)',
    'Created Date'
  ];
  rows.push(chitHeaders.map(escapeCSV).join(','));

  targetChits.forEach((chit) => {
    const collected = chit.total_collected || 0;
    const pending = chit.total_pending || 0;
    const pool = collected + pending;
    const progress = pool > 0 ? Math.round((collected / pool) * 100) : 0;
    const membersCount = chit.active_members_count ?? chit.total_members;

    const row = [
      escapeCSV(chit.id),
      escapeCSV(chit.name),
      escapeCSV(chit.status.toUpperCase()),
      escapeCSV(chit.chit_value),
      escapeCSV(chit.total_months),
      escapeCSV(chit.current_month || 1),
      escapeCSV(membersCount),
      escapeCSV(chit.start_month),
      escapeCSV(chit.end_month),
      escapeCSV(collected),
      escapeCSV(pending),
      escapeCSV(`${progress}%`),
      escapeCSV(formatDate(chit.created_at))
    ];
    rows.push(row.join(','));
  });

  // 4. Recent Payment Transactions Log (if available)
  if (stats?.recentPayments && stats.recentPayments.length > 0) {
    rows.push(''); // Blank separator line
    rows.push([escapeCSV('=== RECENT PAYMENT TRANSACTIONS LOG ===')].join(','));
    const paymentHeaders = [
      'Transaction ID',
      'Date',
      'Customer Name',
      'Chit Group',
      'Month',
      'Amount (INR)',
      'Payment Method',
      'Notes'
    ];
    rows.push(paymentHeaders.map(escapeCSV).join(','));

    stats.recentPayments.forEach((p: any) => {
      const paymentDate = p.payment_date ? formatDate(p.payment_date) : formatDate(p.created_at);
      const row = [
        escapeCSV(p.id),
        escapeCSV(paymentDate),
        escapeCSV(p.customer_name || 'N/A'),
        escapeCSV(p.chit_name || 'N/A'),
        escapeCSV(`Month ${p.month_number || 1}`),
        escapeCSV(p.amount || 0),
        escapeCSV(p.payment_method || 'Cash'),
        escapeCSV(p.notes || '')
      ];
      rows.push(row.join(','));
    });
  }

  // Build CSV content
  const csvContent = BOM + rows.join('\r\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });

  // Trigger browser download via object URL
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);
  link.setAttribute('href', url);
  link.setAttribute('download', filename);
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);

  return {
    success: true,
    filename,
    count: targetChits.length,
  };
}
