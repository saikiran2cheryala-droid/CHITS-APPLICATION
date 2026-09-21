export const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December'
];

/**
 * Format currency with Indian grouping: e.g. ₹5,00,000 or ₹16,000
 */
export function formatINR(amount: number | null | undefined): string {
  if (amount === null || amount === undefined || isNaN(amount)) {
    return '₹0';
  }
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0
  }).format(amount);
}

/**
 * Format integer with Indian grouping (without currency sign)
 */
export function formatIndianNumber(num: number | null | undefined): string {
  if (num === null || num === undefined || isNaN(num)) {
    return '0';
  }
  return new Intl.NumberFormat('en-IN', {
    maximumFractionDigits: 0
  }).format(num);
}

/**
 * Format Monthly Profit with Indian grouping and proper sign.
 * Positive: ₹54,000
 * Zero: ₹0
 * Negative: -₹2,000 (preserves negative sign)
 */
export function formatProfitINR(amount: number | null | undefined): string {
  if (amount === null || amount === undefined || isNaN(amount)) {
    return 'Not Available';
  }
  if (amount === 0) {
    return '₹0';
  }
  if (amount < 0) {
    return `-₹${formatIndianNumber(Math.abs(amount))}`;
  }
  return `₹${formatIndianNumber(amount)}`;
}

/**
 * Parse string like "January 2026" or "2026-01" or Date
 */
export function parseMonthString(str: string): { monthIndex: number; year: number } {
  if (!str) {
    const now = new Date();
    return { monthIndex: now.getMonth(), year: now.getFullYear() };
  }

  const parts = str.trim().split(/\s+/);
  if (parts.length >= 2) {
    const monthName = parts[0];
    const year = parseInt(parts[1], 10);
    const mIdx = MONTH_NAMES.findIndex(m => m.toLowerCase().startsWith(monthName.toLowerCase()));
    if (mIdx !== -1 && !isNaN(year)) {
      return { monthIndex: mIdx, year };
    }
  }

  // Handle YYYY-MM
  if (str.includes('-')) {
    const [y, m] = str.split('-');
    const year = parseInt(y, 10);
    const mIdx = parseInt(m, 10) - 1;
    if (!isNaN(year) && !isNaN(mIdx) && mIdx >= 0 && mIdx < 12) {
      return { monthIndex: mIdx, year };
    }
  }

  const now = new Date();
  return { monthIndex: now.getMonth(), year: now.getFullYear() };
}

/**
 * Calculates End Month automatically based on:
 * Start Month + Total Months - 1
 * e.g. Start Month: January 2026, 25 months -> January 2028
 */
export function calculateEndMonth(startMonthStr: string, totalMonths: number): string {
  if (!startMonthStr || totalMonths < 1) return startMonthStr || '';
  const { monthIndex, year } = parseMonthString(startMonthStr);
  const targetIndex = monthIndex + totalMonths - 1;
  const endMonthIndex = ((targetIndex % 12) + 12) % 12;
  const endYear = year + Math.floor(targetIndex / 12);
  return `${MONTH_NAMES[endMonthIndex]} ${endYear}`;
}

/**
 * Get human readable month name for monthNumber (1-based: 1..totalMonths)
 * e.g. start: "January 2026", monthNumber: 1 -> "January 2026"
 * monthNumber: 2 -> "February 2026"
 * monthNumber: 25 -> "January 2028"
 */
export function getMonthLabel(startMonthStr: string, monthNumber: number): string {
  const { monthIndex, year } = parseMonthString(startMonthStr);
  const targetIndex = monthIndex + (monthNumber - 1);
  const mIndex = ((targetIndex % 12) + 12) % 12;
  const targetYear = year + Math.floor(targetIndex / 12);
  return `${MONTH_NAMES[mIndex]} ${targetYear}`;
}

/**
 * Format timestamp into standard Indian date & time display
 */
export function formatDateTime(isoString: string | null | undefined): string {
  if (!isoString) return '-';
  try {
    const date = new Date(isoString);
    if (isNaN(date.getTime())) return isoString;
    return date.toLocaleDateString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true
    });
  } catch {
    return isoString;
  }
}

/**
 * Format date only (e.g. 15 Jan 2026)
 */
export function formatDate(isoString: string | null | undefined): string {
  if (!isoString) return '-';
  try {
    const date = new Date(isoString);
    if (isNaN(date.getTime())) return isoString;
    return date.toLocaleDateString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric'
    });
  } catch {
    return isoString;
  }
}

/**
 * Format date strictly as DD/MM/YYYY (e.g. 15/04/2026)
 */
export function formatDDMMYYYY(dateInput: string | Date | null | undefined): string {
  if (!dateInput) return '-';
  if (typeof dateInput === 'string') {
    const trimmed = dateInput.trim();
    // If already DD/MM/YYYY
    if (/^\d{2}\/\d{2}\/\d{4}$/.test(trimmed)) {
      return trimmed;
    }
    // If YYYY-MM-DD
    if (/^\d{4}-\d{2}-\d{2}/.test(trimmed)) {
      const [y, m, d] = trimmed.split('T')[0].split('-');
      return `${d.padStart(2, '0')}/${m.padStart(2, '0')}/${y}`;
    }
  }
  try {
    const d = new Date(dateInput);
    if (isNaN(d.getTime())) return String(dateInput);
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    return `${day}/${month}/${year}`;
  } catch {
    return String(dateInput);
  }
}

/**
 * Convert any date string to YYYY-MM-DD for HTML <input type="date">
 */
export function toISODateInput(val: string | null | undefined): string {
  if (!val) {
    const today = new Date();
    return today.toISOString().split('T')[0];
  }
  const trimmed = val.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return trimmed;
  }
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(trimmed)) {
    const [d, m, y] = trimmed.split('/');
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }
  try {
    const parsed = new Date(trimmed);
    if (!isNaN(parsed.getTime())) {
      return parsed.toISOString().split('T')[0];
    }
  } catch {}
  return new Date().toISOString().split('T')[0];
}

