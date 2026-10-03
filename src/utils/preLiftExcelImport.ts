import * as XLSX from 'xlsx';

export interface ParsedPreLiftRow {
  rowNumber: number;
  monthNumber: number;
  preLiftPayment: number;
  rawAmount?: any;
  isValid: boolean;
  isDuplicate?: boolean;
  isOutsideRange?: boolean;
  isInvalidAmount?: boolean;
  errorMessage?: string;
}

export interface ParsePreLiftResult {
  totalRows: number;
  validPayments: { month_number: number; pre_lift_payment: number }[];
  allRows: ParsedPreLiftRow[];
  duplicateMonths: number[];
  outsideRangeMonths: ParsedPreLiftRow[];
  missingMonths: number[];
  invalidAmountRows: ParsedPreLiftRow[];
  hasError: boolean;
  error?: string;
  detectedColumns: { monthCol: string | null; paymentCol: string | null };
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
  'installment',
];

// Supported column variations for Pre-Lift Payment (case-insensitive)
const PRE_LIFT_HEADER_KEYWORDS = [
  'pre-lift payment',
  'pre lift payment',
  'pre_lift_payment',
  'pre-lift monthly payment',
  'pre lift monthly payment',
  'prelift payment',
  'prelift monthly payment',
  'pre-lift',
  'pre lift',
  'pre_lift',
  'prelift',
  'pre-lift amount',
  'pre lift amount',
  'pre_lift_amount',
  'payment amount',
  'monthly payment',
  'payment',
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
    .replace(/[^\w\s#]/g, ' ')
    .replace(/\s+/g, ' ');
}

/**
 * Format an array of month numbers into human-readable ranges
 */
export function formatMonthList(months: number[]): string {
  if (!months || months.length === 0) return '';
  const sorted = [...months].sort((a, b) => a - b);
  return sorted.map((m) => `Month ${m}`).join(', ');
}

/**
 * Parse an Excel (.xlsx, .xls) or CSV file containing Month and Pre-Lift Payment
 */
export async function parsePreLiftExcelOrCsvFile(
  file: File,
  totalMonths: number = 25
): Promise<ParsePreLiftResult> {
  return new Promise((resolve) => {
    const reader = new FileReader();

    reader.onload = (e) => {
      try {
        const data = e.target?.result;
        if (!data) {
          resolve({
            totalRows: 0,
            validPayments: [],
            allRows: [],
            duplicateMonths: [],
            outsideRangeMonths: [],
            missingMonths: Array.from({ length: totalMonths }, (_, i) => i + 1),
            invalidAmountRows: [],
            hasError: true,
            error: 'Empty or unreadable file.',
            detectedColumns: { monthCol: null, paymentCol: null },
          });
          return;
        }

        const workbook = XLSX.read(data, { type: 'binary' });
        const firstSheetName = workbook.SheetNames[0];
        if (!firstSheetName) {
          resolve({
            totalRows: 0,
            validPayments: [],
            allRows: [],
            duplicateMonths: [],
            outsideRangeMonths: [],
            missingMonths: Array.from({ length: totalMonths }, (_, i) => i + 1),
            invalidAmountRows: [],
            hasError: true,
            error: 'The uploaded file does not contain any sheets.',
            detectedColumns: { monthCol: null, paymentCol: null },
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
            validPayments: [],
            allRows: [],
            duplicateMonths: [],
            outsideRangeMonths: [],
            missingMonths: Array.from({ length: totalMonths }, (_, i) => i + 1),
            invalidAmountRows: [],
            hasError: true,
            error: 'The uploaded file contains no data rows.',
            detectedColumns: { monthCol: null, paymentCol: null },
          });
          return;
        }

        // Detect column names from the first row keys
        const firstRow = rawJson[0];
        const keys = Object.keys(firstRow);

        let detectedMonthCol: string | null = null;
        let detectedPaymentCol: string | null = null;

        // Try exact/keyword matches for Month
        for (const key of keys) {
          const norm = normalizeHeader(key);
          for (const kw of MONTH_HEADER_KEYWORDS) {
            if (norm === kw || norm.startsWith(kw) || norm.endsWith(kw)) {
              detectedMonthCol = key;
              break;
            }
          }
          if (detectedMonthCol) break;
        }

        // Try exact/keyword matches for Pre-Lift Payment
        for (const key of keys) {
          if (key === detectedMonthCol) continue;
          const norm = normalizeHeader(key);
          for (const kw of PRE_LIFT_HEADER_KEYWORDS) {
            if (norm === kw || norm.includes(kw)) {
              detectedPaymentCol = key;
              break;
            }
          }
          if (detectedPaymentCol) break;
        }

        // Fallbacks if columns are not named conventionally
        if (!detectedMonthCol && keys.length >= 1) {
          detectedMonthCol = keys[0];
        }
        if (!detectedPaymentCol && keys.length >= 2) {
          detectedPaymentCol = keys[1];
        }

        if (!detectedMonthCol || !detectedPaymentCol) {
          resolve({
            totalRows: rawJson.length,
            validPayments: [],
            allRows: [],
            duplicateMonths: [],
            outsideRangeMonths: [],
            missingMonths: Array.from({ length: totalMonths }, (_, i) => i + 1),
            invalidAmountRows: [],
            hasError: true,
            error: `Could not identify required columns. Expected "Month" and "Pre-Lift Payment". Found columns: ${keys.join(', ')}`,
            detectedColumns: { monthCol: detectedMonthCol, paymentCol: detectedPaymentCol },
          });
          return;
        }

        const allRows: ParsedPreLiftRow[] = [];
        const seenMonthMap = new Map<number, number>(); // monthNumber -> count
        const duplicateMonthsSet = new Set<number>();
        const outsideRangeRows: ParsedPreLiftRow[] = [];
        const invalidAmountRows: ParsedPreLiftRow[] = [];

        rawJson.forEach((row, idx) => {
          const rowNumber = idx + 2; // Row 1 is header in Excel
          const rawMonth = row[detectedMonthCol!];
          const rawPayment = row[detectedPaymentCol!];

          // Parse month number
          const cleanMonthStr = String(rawMonth ?? '').trim().replace(/[^\d]/g, '');
          const monthNum = parseInt(cleanMonthStr, 10);

          // Parse payment amount
          const cleanPayStr = String(rawPayment ?? '')
            .trim()
            .replace(/[₹,\s]/g, '');
          const payNum = parseFloat(cleanPayStr);

          const isMonthValidNum = !isNaN(monthNum);
          const isMonthInRange = isMonthValidNum && monthNum >= 1 && monthNum <= totalMonths;
          const isAmountValid = !isNaN(payNum) && payNum > 0;

          const parsedRow: ParsedPreLiftRow = {
            rowNumber,
            monthNumber: isMonthValidNum ? monthNum : 0,
            preLiftPayment: isAmountValid ? payNum : 0,
            rawAmount: rawPayment,
            isValid: true,
          };

          if (!isMonthValidNum || monthNum <= 0) {
            parsedRow.isValid = false;
            parsedRow.errorMessage = `Invalid Month "${rawMonth}"`;
            invalidAmountRows.push(parsedRow);
          } else if (!isMonthInRange) {
            parsedRow.isValid = false;
            parsedRow.isOutsideRange = true;
            parsedRow.errorMessage = `Month ${monthNum} is outside configured duration (1 to ${totalMonths})`;
            outsideRangeRows.push(parsedRow);
          } else {
            // Track duplicates
            const prevCount = seenMonthMap.get(monthNum) || 0;
            if (prevCount > 0) {
              duplicateMonthsSet.add(monthNum);
              parsedRow.isValid = false;
              parsedRow.isDuplicate = true;
              parsedRow.errorMessage = `Duplicate Month ${monthNum}`;
            }
            seenMonthMap.set(monthNum, prevCount + 1);
          }

          if (!isAmountValid) {
            parsedRow.isValid = false;
            parsedRow.isInvalidAmount = true;
            parsedRow.errorMessage = parsedRow.errorMessage
              ? `${parsedRow.errorMessage}; Amount must be numeric and > 0`
              : 'Amount must be numeric and greater than 0';
            invalidAmountRows.push(parsedRow);
          }

          allRows.push(parsedRow);
        });

        const duplicateMonths = Array.from(duplicateMonthsSet).sort((a, b) => a - b);

        // Check for missing months: Excel must contain all months 1 through totalMonths
        const missingMonths: number[] = [];
        for (let m = 1; m <= totalMonths; m++) {
          if (!seenMonthMap.has(m) || seenMonthMap.get(m) === 0) {
            missingMonths.push(m);
          }
        }

        // Collect valid payments (sorted by month_number)
        const validPaymentsMap = new Map<number, number>();
        allRows.forEach((r) => {
          if (r.isValid && r.monthNumber >= 1 && r.monthNumber <= totalMonths && r.preLiftPayment > 0) {
            validPaymentsMap.set(r.monthNumber, r.preLiftPayment);
          }
        });

        const validPayments = Array.from(validPaymentsMap.entries())
          .map(([m, p]) => ({ month_number: m, pre_lift_payment: p }))
          .sort((a, b) => a.month_number - b.month_number);

        // Determine if there is any error preventing import
        let hasError = false;
        let errorMessage = '';

        if (duplicateMonths.length > 0) {
          hasError = true;
          errorMessage = `Duplicate month numbers found in Excel: ${duplicateMonths.map((m) => `Month ${m}`).join(', ')}. Each month must appear exactly once.`;
        } else if (outsideRangeRows.length > 0) {
          hasError = true;
          errorMessage = `${outsideRangeRows.length} row(s) contain month numbers outside the configured duration of 1 to ${totalMonths}.`;
        } else if (invalidAmountRows.length > 0) {
          hasError = true;
          errorMessage = `Invalid amounts detected in ${invalidAmountRows.length} row(s). Every month must have a numeric amount greater than 0.`;
        } else if (missingMonths.length > 0) {
          hasError = true;
          errorMessage = `Missing ${missingMonths.length} month(s) in Excel: ${formatMonthList(missingMonths)}. The file must contain Month 1 through Month ${totalMonths}.`;
        } else if (validPayments.length !== totalMonths) {
          hasError = true;
          errorMessage = `Expected ${totalMonths} months of pre-lift payments, but found ${validPayments.length} valid rows.`;
        }

        resolve({
          totalRows: allRows.length,
          validPayments,
          allRows,
          duplicateMonths,
          outsideRangeMonths: outsideRangeRows,
          missingMonths,
          invalidAmountRows,
          hasError,
          error: errorMessage || undefined,
          detectedColumns: {
            monthCol: detectedMonthCol,
            paymentCol: detectedPaymentCol,
          },
        });
      } catch (err: any) {
        resolve({
          totalRows: 0,
          validPayments: [],
          allRows: [],
          duplicateMonths: [],
          outsideRangeMonths: [],
          missingMonths: Array.from({ length: totalMonths }, (_, i) => i + 1),
          invalidAmountRows: [],
          hasError: true,
          error: `Failed to parse file: ${err.message || 'Invalid format'}`,
          detectedColumns: { monthCol: null, paymentCol: null },
        });
      }
    };

    reader.onerror = () => {
      resolve({
        totalRows: 0,
        validPayments: [],
        allRows: [],
        duplicateMonths: [],
        outsideRangeMonths: [],
        missingMonths: Array.from({ length: totalMonths }, (_, i) => i + 1),
        invalidAmountRows: [],
        hasError: true,
        error: 'Error reading file.',
        detectedColumns: { monthCol: null, paymentCol: null },
      });
    };

    reader.readAsBinaryString(file);
  });
}

/**
 * Downloads an Excel sample template file: pre_lift_payment_sample.xlsx
 * Columns: Month | Pre-Lift Payment
 * Contains Month 1 through Month totalMonths
 */
export function downloadPreLiftSampleExcel(
  totalMonths: number = 25,
  existingPayments?: number[],
  defaultAmount: number = 16000
) {
  const headers = ['Month', 'Pre-Lift Payment'];
  const rows: any[][] = [headers];

  // Prefill realistic sample values or configured values for all months
  // e.g. 13500, 16000, 15500, 17000...
  const sampleAmounts = [
    13500, 16000, 15500, 17000, 16000, 16500, 17500, 17000, 18000, 17500,
    18500, 18000, 19000, 18500, 19500, 19000, 20000, 19500, 20500, 20000,
    21000, 20500, 21500, 21000, 18000,
  ];

  for (let m = 1; m <= totalMonths; m++) {
    const idx = m - 1;
    let paymentVal: number = defaultAmount;
    if (existingPayments && existingPayments[idx] && existingPayments[idx] > 0) {
      paymentVal = existingPayments[idx];
    } else if (idx < sampleAmounts.length) {
      paymentVal = sampleAmounts[idx];
    }
    rows.push([m, paymentVal]);
  }

  const ws = XLSX.utils.aoa_to_sheet(rows);

  // Set column widths
  ws['!cols'] = [{ wch: 12 }, { wch: 22 }];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Pre-Lift Payments');

  XLSX.writeFile(wb, 'pre_lift_payment_sample.xlsx');
}
