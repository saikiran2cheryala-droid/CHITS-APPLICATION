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
 * Safe date-only parser that strictly handles:
 * - DD-MM-YYYY (e.g. "22-08-2026", "01-08-2024")
 * - DD/MM/YYYY (e.g. "22/08/2026", "01/08/2024")
 * - YYYY-MM-DD (e.g. "2024-08-01", "2026-08-22")
 * - ISO-8601 strings (e.g. "2026-08-22T00:00:00.000Z")
 * - Valid Date objects
 * 
 * Never returns "Invalid Date". Returns null for invalid or empty inputs.
 * Avoids any timezone-related date shifting by using UTC midnight representation.
 */
export function parseDateOnly(input: string | Date | null | undefined): Date | null {
  if (input === null || input === undefined) return null;

  if (input instanceof Date || Object.prototype.toString.call(input) === '[object Date]') {
    const d = input as Date;
    if (isNaN(d.getTime())) return null;
    return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 0, 0, 0, 0));
  }

  const str = String(input).trim();
  if (!str || str.toLowerCase() === 'invalid date' || str === 'null' || str === 'undefined' || str === '-') {
    return null;
  }

  let year: number | null = null;
  let month: number | null = null; // 1-12
  let day: number | null = null;

  // 1. DD-MM-YYYY, DD/MM/YYYY, DD.MM.YYYY (e.g. "22-08-2026", "01-08-2024", "1-8-2024", "22.08.2026", "22/08/2026")
  const dmyMatch = /^(\d{1,2})[-./](\d{1,2})[-./](\d{4})$/.exec(str);
  if (dmyMatch) {
    day = parseInt(dmyMatch[1], 10);
    month = parseInt(dmyMatch[2], 10);
    year = parseInt(dmyMatch[3], 10);
  } else {
    // 2. YYYY-MM-DD or YYYY-MM-DDTHH:mm:ss (e.g. "2024-08-01", "2026-08-22T00:00:00.000Z", "2025/01/15")
    const isoMatch = /^(\d{4})[-./](\d{1,2})[-./](\d{1,2})(?:[T\s].*)?$/.exec(str);
    if (isoMatch) {
      year = parseInt(isoMatch[1], 10);
      month = parseInt(isoMatch[2], 10);
      day = parseInt(isoMatch[3], 10);
    } else {
      // Fallback: try Date constructor only if valid
      const fallback = new Date(str);
      if (isNaN(fallback.getTime())) return null;
      year = fallback.getUTCFullYear();
      month = fallback.getUTCMonth() + 1;
      day = fallback.getUTCDate();
    }
  }

  if (year === null || month === null || day === null) return null;
  if (isNaN(year) || isNaN(month) || isNaN(day)) return null;
  if (year < 1900 || year > 2100) return null;
  if (month < 1 || month > 12) return null;
  if (day < 1 || day > 31) return null;

  // Validate exact days in month (handles leap years correctly)
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  if (day > daysInMonth) return null;

  return new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0));
}

/**
 * Calculates default lift date from historical chit start month & lift month number
 * e.g. startMonth = "August 2024", liftMonth = 1 -> "2024-08-01"
 * e.g. startMonth = "August 2024", liftMonth = 2 -> "2024-09-01"
 */
export function getDefaultLiftDate(startMonthStr: string | null | undefined, liftMonthNumber: number = 1): string {
  if (!startMonthStr) {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    return `${y}-${m}-01`;
  }
  const { monthIndex, year } = parseMonthString(startMonthStr);
  const targetIndex = monthIndex + (Math.max(1, liftMonthNumber) - 1);
  const mIndex = ((targetIndex % 12) + 12) % 12;
  const targetYear = year + Math.floor(targetIndex / 12);
  const mStr = String(mIndex + 1).padStart(2, '0');
  return `${targetYear}-${mStr}-01`;
}

/**
 * Format timestamp into standard Indian date & time display
 */
export function formatDateTime(isoString: string | null | undefined): string {
  if (!isoString) return '-';
  const parsed = parseDateOnly(isoString);
  if (!parsed) return String(isoString);
  try {
    const d = String(parsed.getUTCDate()).padStart(2, '0');
    const m = MONTH_NAMES[parsed.getUTCMonth()].substring(0, 3);
    const y = parsed.getUTCFullYear();
    return `${d} ${m} ${y}`;
  } catch {
    return String(isoString);
  }
}

/**
 * Format date only without timezone shift (e.g. 15 Jan 2026, 01 Aug 2024)
 */
export function formatDate(isoString: string | null | undefined): string {
  if (!isoString) return '-';
  const parsed = parseDateOnly(isoString);
  if (!parsed) return String(isoString);
  const d = String(parsed.getUTCDate()).padStart(2, '0');
  const m = MONTH_NAMES[parsed.getUTCMonth()].substring(0, 3);
  const y = parsed.getUTCFullYear();
  return `${d} ${m} ${y}`;
}

/**
 * Format date strictly as DD-MM-YYYY (e.g. 22-08-2026, 01-08-2024)
 */
export function formatDDMMYYYY(dateInput: string | Date | null | undefined): string {
  if (!dateInput) return '-';
  const parsed = parseDateOnly(dateInput);
  if (!parsed) return typeof dateInput === 'string' ? dateInput : '-';
  const day = String(parsed.getUTCDate()).padStart(2, '0');
  const month = String(parsed.getUTCMonth() + 1).padStart(2, '0');
  const year = parsed.getUTCFullYear();
  return `${day}-${month}-${year}`;
}

/**
 * Convert any date string to YYYY-MM-DD for HTML <input type="date">
 * Never replaces with today's date if invalid or empty.
 */
export function toISODateInput(val: string | Date | null | undefined): string {
  if (!val) return '';
  const parsed = parseDateOnly(val);
  if (!parsed) return '';
  const y = parsed.getUTCFullYear();
  const m = String(parsed.getUTCMonth() + 1).padStart(2, '0');
  const d = String(parsed.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

