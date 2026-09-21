import * as XLSX from 'xlsx';

export interface ParsedPayoutRow {
  rowNumber: number;
  monthNumber: number;
  liftPayout: number;
  isValid: boolean;
  isDuplicate?: boolean;
  isOutsideRange?: boolean;
  errorMessage?: string;
}

export interface ParsePayoutResult {
  totalRows: number;
  validPayouts: { month_number: number; lift_payout: number }[];
  allRows: ParsedPayoutRow[];
  duplicateMonths: number[];
  outsideRangeMonths: ParsedPayoutRow[];
  missingMonths: number[];
  missingMonthsMessage?: string;
  detectedColumns: { monthCol: string | null; payoutCol: string | null };
  error?: string;
}

// Supported column variations for Month (case-insensitive)
const MONTH_HEADER_KEYWORDS = [
  'month',
  'month number',
  'month no',
  'month no.',
  'month_number',
  'month_no',
  'month#',
  'month num',
  'm',
];

// Supported column variations for Lift Payout (case-insensitive)
const PAYOUT_HEADER_KEYWORDS = [
  'lift payout',
  'payout amount',
  'lift amount',
  'chit lift amount',
  'customer lift amount',
  'amount received',
  'amount received after chit lifting',
  'amount received after lifting',
  'lift_payout',
  'lift_amount',
  'payout_amount',
  'payout',
  'chit lift payout',
  'chit payout',
  'amount',
];

/**
 * Clean a header string for comparison
 */
function normalizeHeader(header: any): string {
  return String(header ?? '')
    .trim()
    .toLowerCase()
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/[^\w\s#]/g, ' ') // replace punctuation with spaces
    .replace(/\s+/g, ' ');
}

/**
 * Format an array of month numbers into human-readable ranges,
 * e.g. [21, 22, 23, 24, 25] -> "Months 21–25"
 * or [3, 7] -> "Months 3, 7"
 */
export function formatMonthRanges(months: number[]): string {
  if (!months || months.length === 0) return '';
  const sorted = [...months].sort((a, b) => a - b);
  const ranges: string[] = [];

  let start = sorted[0];
  let prev = sorted[0];

  for (let i = 1; i < sorted.length; i++) {
    const curr = sorted[i];
    if (curr === prev + 1) {
      prev = curr;
    } else {
      ranges.push(start === prev ? `Month ${start}` : `Months ${start}–${prev}`);
      start = curr;
      prev = curr;
    }
  }
  ranges.push(start === prev ? `Month ${start}` : `Months ${start}–${prev}`);

  return ranges.join(', ');
}

/**
 * Parse an Excel (.xlsx, .xls) or CSV file containing Month and Lift Payout
 */
export async function parsePayoutExcelOrCsvFile(
  file: File,
  totalMonths: number = 25
): Promise<ParsePayoutResult> {
  return new Promise((resolve) => {
    const reader = new FileReader();

    reader.onload = (e) => {
      try {
        const data = e.target?.result;
        if (!data) {
          resolve({
            totalRows: 0,
            validPayouts: [],
            allRows: [],
            duplicateMonths: [],
            outsideRangeMonths: [],
            missingMonths: [],
            detectedColumns: { monthCol: null, payoutCol: null },
            error: 'Empty or unreadable file.',
          });
          return;
        }

        const workbook = XLSX.read(data, { type: 'binary' });
        const firstSheetName = workbook.SheetNames[0];
        if (!firstSheetName) {
          resolve({
            totalRows: 0,
            validPayouts: [],
            allRows: [],
            duplicateMonths: [],
            outsideRangeMonths: [],
            missingMonths: [],
            detectedColumns: { monthCol: null, payoutCol: null },
            error: 'The uploaded Excel file does not contain any sheets.',
          });
          return;
        }

        const worksheet = workbook.Sheets[firstSheetName];
        const rawJson: any[] = XLSX.utils.sheet_to_json(worksheet, {
          defval: '',
          raw: false,
        });

        if (!rawJson || rawJson.length === 0) {
          resolve({
            totalRows: 0,
            validPayouts: [],
            allRows: [],
            duplicateMonths: [],
            outsideRangeMonths: [],
            missingMonths: [],
            detectedColumns: { monthCol: null, payoutCol: null },
            error: 'The uploaded file contains no data rows.',
          });
          return;
        }

        // Detect column names from the first row keys
        const firstRow = rawJson[0];
        const keys = Object.keys(firstRow);

        let monthColKey: string | null = null;
        let payoutColKey: string | null = null;

        for (const k of keys) {
          const norm = normalizeHeader(k);
          if (!monthColKey) {
            for (const pattern of MONTH_HEADER_KEYWORDS) {
              if (norm === pattern || norm.startsWith(pattern + ' ') || norm.endsWith(' ' + pattern)) {
                monthColKey = k;
                break;
              }
            }
          }
          if (!payoutColKey) {
            for (const pattern of PAYOUT_HEADER_KEYWORDS) {
              if (norm === pattern || norm.startsWith(pattern + ' ') || norm.endsWith(' ' + pattern)) {
                payoutColKey = k;
                break;
              }
            }
          }
        }

        // Fallback: If only 2 columns exist and headers couldn't match strictly
        if (!monthColKey && keys.length >= 1) {
          const matched = keys.find((k) => normalizeHeader(k).includes('month') || normalizeHeader(k) === 'm');
          if (matched) monthColKey = matched;
        }
        if (!payoutColKey && keys.length >= 2) {
          const matched = keys.find(
            (k) =>
              normalizeHeader(k).includes('payout') ||
              normalizeHeader(k).includes('lift') ||
              normalizeHeader(k).includes('amount')
          );
          if (matched) payoutColKey = matched;
        }

        // If still not detected and exactly 2 columns
        if (keys.length === 2) {
          if (!monthColKey && !payoutColKey) {
            monthColKey = keys[0];
            payoutColKey = keys[1];
          } else if (!monthColKey) {
            monthColKey = keys.find((k) => k !== payoutColKey) || null;
          } else if (!payoutColKey) {
            payoutColKey = keys.find((k) => k !== monthColKey) || null;
          }
        }

        if (!monthColKey || !payoutColKey) {
          resolve({
            totalRows: rawJson.length,
            validPayouts: [],
            allRows: [],
            duplicateMonths: [],
            outsideRangeMonths: [],
            missingMonths: [],
            detectedColumns: { monthCol: monthColKey, payoutCol: payoutColKey },
            error: `Could not recognize required columns. Expected "Month" and "Lift Payout" (or Lift Amount). Detected headers: ${keys.join(', ')}`,
          });
          return;
        }

        const allRows: ParsedPayoutRow[] = [];
        const monthCounts = new Map<number, number>();
        const outsideRangeMonths: ParsedPayoutRow[] = [];

        for (let idx = 0; idx < rawJson.length; idx++) {
          const row = rawJson[idx];
          const rowNum = idx + 2; // Row 1 is header

          const rawMonth = row[monthColKey];
          const rawPayout = row[payoutColKey];

          // Skip completely empty rows
          if (String(rawMonth).trim() === '' && String(rawPayout).trim() === '') {
            continue;
          }

          // Parse Month Number
          // Extract digits (e.g. "Month 15" -> 15, "M1" -> 1, "1" -> 1)
          const monthClean = String(rawMonth).trim().replace(/[^0-9]/g, '');
          const parsedMonth = parseInt(monthClean, 10);

          // Parse Payout Amount (strip currency symbols ₹, commas, spaces, etc.)
          const payoutClean = String(rawPayout)
            .trim()
            .replace(/[^0-9.-]/g, '');
          const parsedPayout = parseFloat(payoutClean);

          const item: ParsedPayoutRow = {
            rowNumber: rowNum,
            monthNumber: parsedMonth,
            liftPayout: parsedPayout,
            isValid: true,
          };

          // Validation 1: Month number exists & is valid
          if (isNaN(parsedMonth) || parsedMonth < 1) {
            item.isValid = false;
            item.errorMessage = `Invalid month number "${rawMonth}". Must be a positive integer.`;
            allRows.push(item);
            continue;
          }

          // Validation 2: Lift payout amount exists & is >= 0
          if (isNaN(parsedPayout) || parsedPayout < 0) {
            item.isValid = false;
            item.errorMessage = `Invalid lift payout amount "${rawPayout}". Amount must be greater than or equal to 0.`;
            allRows.push(item);
            continue;
          }

          // Validation 3: Month within chit duration
          if (parsedMonth > totalMonths) {
            item.isValid = false;
            item.isOutsideRange = true;
            item.errorMessage = `Month ${parsedMonth} is outside this chit duration (${totalMonths} months).`;
            outsideRangeMonths.push(item);
            allRows.push(item);
            continue;
          }

          // Track occurrences for duplicate check
          const count = (monthCounts.get(parsedMonth) || 0) + 1;
          monthCounts.set(parsedMonth, count);

          allRows.push(item);
        }

        // Identify duplicate months
        const duplicateMonths: number[] = [];
        monthCounts.forEach((count, month) => {
          if (count > 1) {
            duplicateMonths.push(month);
          }
        });
        duplicateMonths.sort((a, b) => a - b);

        // Mark duplicate rows
        for (const item of allRows) {
          if (item.isValid && !item.isOutsideRange && duplicateMonths.includes(item.monthNumber)) {
            item.isDuplicate = true;
            item.isValid = false;
            item.errorMessage = `Duplicate Month ${item.monthNumber} found in Excel.`;
          }
        }

        // Valid payouts list (only if NOT duplicate and within range)
        const validPayouts: { month_number: number; lift_payout: number }[] = [];
        if (duplicateMonths.length === 0) {
          for (const item of allRows) {
            if (item.isValid && !item.isOutsideRange) {
              validPayouts.push({
                month_number: item.monthNumber,
                lift_payout: item.liftPayout,
              });
            }
          }
        }

        // Sort valid payouts by month number ascending
        validPayouts.sort((a, b) => a.month_number - b.month_number);

        // Check for missing months within 1..totalMonths
        const importedMonthNumbers = new Set(validPayouts.map((p) => p.month_number));
        const missingMonths: number[] = [];
        for (let m = 1; m <= totalMonths; m++) {
          if (!importedMonthNumbers.has(m)) {
            missingMonths.push(m);
          }
        }

        let missingMonthsMessage: string | undefined;
        if (missingMonths.length > 0 && validPayouts.length > 0) {
          const count = missingMonths.length;
          const monthsList = missingMonths.map((m) => `Month ${m}`).join(', ');
          missingMonthsMessage = `${count} monthly payout${count > 1 ? 's are' : ' is'} missing:\n${monthsList}`;
        }

        resolve({
          totalRows: allRows.length,
          validPayouts,
          allRows,
          duplicateMonths,
          outsideRangeMonths,
          missingMonths,
          missingMonthsMessage,
          detectedColumns: { monthCol: monthColKey, payoutCol: payoutColKey },
        });
      } catch (err: any) {
        resolve({
          totalRows: 0,
          validPayouts: [],
          allRows: [],
          duplicateMonths: [],
          outsideRangeMonths: [],
          missingMonths: [],
          detectedColumns: { monthCol: null, payoutCol: null },
          error: `Failed to parse Excel file: ${err.message || 'Unknown format'}`,
        });
      }
    };

    reader.onerror = () => {
      resolve({
        totalRows: 0,
        validPayouts: [],
        allRows: [],
        duplicateMonths: [],
        outsideRangeMonths: [],
        missingMonths: [],
        detectedColumns: { monthCol: null, payoutCol: null },
        error: 'Failed to read uploaded file.',
      });
    };

    reader.readAsBinaryString(file);
  });
}

/**
 * Downloads an Excel template file: lift_payout_template.xlsx
 * Automatically matches the chit duration (e.g. Month 1..20, 1..25, 1..30).
 * Columns: Month | Lift Payout
 */
export function downloadLiftPayoutTemplate(
  totalMonths: number = 25,
  existingRules?: { month_number: number; expected_lift_payout?: number }[] | number[]
) {
  const headers = ['Month', 'Lift Payout'];
  const rows: any[][] = [headers];

  const rulesMap = new Map<number, number>();
  if (existingRules && Array.isArray(existingRules)) {
    existingRules.forEach((r: any, idx: number) => {
      if (typeof r === 'number') {
        if (r > 0) rulesMap.set(idx + 1, r);
      } else if (r && typeof r.month_number === 'number' && r.expected_lift_payout && r.expected_lift_payout > 0) {
        rulesMap.set(r.month_number, r.expected_lift_payout);
      }
    });
  }

  // Generate rows for 1..totalMonths (matches chit duration)
  for (let m = 1; m <= totalMonths; m++) {
    const configured = rulesMap.get(m);
    // If configured amount exists, use it; otherwise leave blank for user entry as required
    rows.push([m, configured !== undefined ? configured : '']);
  }

  const ws = XLSX.utils.aoa_to_sheet(rows);

  // Set column widths
  ws['!cols'] = [{ wch: 14 }, { wch: 22 }];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Lift Payouts');

  XLSX.writeFile(wb, 'lift_payout_template.xlsx');
}
