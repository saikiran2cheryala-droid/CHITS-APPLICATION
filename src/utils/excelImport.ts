import * as XLSX from 'xlsx';

export interface ParsedCustomerRow {
  rowNumber: number;
  customer_name: string;
  phone: string;
  ticket_number?: string;
  isValid: boolean;
  isOverCapacity?: boolean;
  errorMessage?: string;
}

export interface ParseExcelResult {
  totalRows: number;
  validRows: ParsedCustomerRow[];
  invalidRows: ParsedCustomerRow[];
  allRows: ParsedCustomerRow[];
  detectedColumns: { nameCol: string | null; phoneCol: string | null };
  error?: string;
}

// Common acceptable headers for Name and Phone
const NAME_HEADERS = [
  'name',
  'customer name',
  'customer_name',
  'customer',
  'member name',
  'member',
  'full name',
  'client',
  'subscriber',
];

const PHONE_HEADERS = [
  'phone',
  'phone number',
  'phone_number',
  'phonenumber',
  'mobile',
  'mobile number',
  'mobile_number',
  'contact',
  'contact number',
  'cell',
  'cell phone',
  'tel',
];

/**
 * Clean and standardize phone numbers.
 * Keeps digits, handles leading zeros, removes spaces/dashes.
 */
export function sanitizePhoneNumber(val: any): string {
  if (val === null || val === undefined) return '';

  let str = '';
  if (typeof val === 'number') {
    // If it's a number, format without scientific notation
    str = val.toLocaleString('fullwide', { useGrouping: false });
  } else {
    str = String(val).trim();
  }

  // Remove whitespace, dashes, parentheses
  const cleaned = str.replace(/[\s\-()]/g, '');

  // If starts with +91, remove +91
  if (cleaned.startsWith('+91')) {
    return cleaned.substring(3);
  }
  if (cleaned.startsWith('91') && cleaned.length > 10) {
    return cleaned.substring(2);
  }

  return cleaned;
}

/**
 * Validate phone number (specifically 10-digit Indian mobile or valid phone string)
 */
export function validatePhone(phone: string): { isValid: boolean; error?: string } {
  if (!phone) {
    return { isValid: false, error: 'Phone number missing' };
  }
  const digitsOnly = phone.replace(/\D/g, '');
  if (digitsOnly.length < 10) {
    return { isValid: false, error: `Invalid phone (${digitsOnly.length} digits, minimum 10 required)` };
  }
  return { isValid: true };
}

/**
 * Parses an Excel or CSV File buffer or ArrayBuffer
 */
export async function parseExcelOrCsvFile(
  file: File,
  _existingPhones?: Set<string>,
  maxCapacityLimit?: number,
  existingCount: number = 0
): Promise<ParseExcelResult> {
  return new Promise((resolve) => {
    const reader = new FileReader();

    reader.onload = (e) => {
      try {
        const data = e.target?.result;
        if (!data) {
          resolve({
            totalRows: 0,
            validRows: [],
            invalidRows: [],
            allRows: [],
            detectedColumns: { nameCol: null, phoneCol: null },
            error: 'File could not be read or is empty.',
          });
          return;
        }

        const workbook = XLSX.read(data, { type: 'binary', cellText: true, raw: false });
        const firstSheetName = workbook.SheetNames[0];
        if (!firstSheetName) {
          resolve({
            totalRows: 0,
            validRows: [],
            invalidRows: [],
            allRows: [],
            detectedColumns: { nameCol: null, phoneCol: null },
            error: 'No sheets found in Excel file.',
          });
          return;
        }

        const worksheet = workbook.Sheets[firstSheetName];
        // Read as array of arrays to preserve column ordering and detect header row
        const rows: any[][] = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' });

        if (!rows || rows.length === 0) {
          resolve({
            totalRows: 0,
            validRows: [],
            invalidRows: [],
            allRows: [],
            detectedColumns: { nameCol: null, phoneCol: null },
            error: 'The uploaded file contains no rows.',
          });
          return;
        }

        // Detect header row (examine first 5 rows to locate columns)
        let headerRowIndex = -1;
        let nameColIdx = -1;
        let phoneColIdx = -1;
        let nameColName = '';
        let phoneColName = '';

        for (let r = 0; r < Math.min(5, rows.length); r++) {
          const row = rows[r];
          if (!Array.isArray(row)) continue;

          for (let c = 0; c < row.length; c++) {
            const cellVal = String(row[c] || '').trim().toLowerCase();
            if (nameColIdx === -1 && NAME_HEADERS.includes(cellVal)) {
              nameColIdx = c;
              nameColName = String(row[c]).trim();
            }
            if (phoneColIdx === -1 && PHONE_HEADERS.includes(cellVal)) {
              phoneColIdx = c;
              phoneColName = String(row[c]).trim();
            }
          }

          if (nameColIdx !== -1 && phoneColIdx !== -1) {
            headerRowIndex = r;
            break;
          }
        }

        // If exact match wasn't found, try loose contains match
        if (nameColIdx === -1 || phoneColIdx === -1) {
          for (let r = 0; r < Math.min(5, rows.length); r++) {
            const row = rows[r];
            if (!Array.isArray(row)) continue;

            for (let c = 0; c < row.length; c++) {
              const cellVal = String(row[c] || '').trim().toLowerCase();
              if (nameColIdx === -1 && (cellVal.includes('name') || cellVal.includes('customer'))) {
                nameColIdx = c;
                nameColName = String(row[c]).trim();
              }
              if (
                phoneColIdx === -1 &&
                (cellVal.includes('phone') || cellVal.includes('mobile') || cellVal.includes('contact'))
              ) {
                phoneColIdx = c;
                phoneColName = String(row[c]).trim();
              }
            }
            if (nameColIdx !== -1 && phoneColIdx !== -1) {
              headerRowIndex = r;
              break;
            }
          }
        }

        // If no headers matched at all, check if row 0 has data directly (Col 0: Name, Col 1: Phone)
        if (nameColIdx === -1 && phoneColIdx === -1 && rows.length > 0 && rows[0].length >= 2) {
          // Check if first row first column looks like a name and second looks like phone
          const candidatePhone = sanitizePhoneNumber(rows[0][1]);
          if (candidatePhone.replace(/\D/g, '').length >= 10) {
            nameColIdx = 0;
            phoneColIdx = 1;
            headerRowIndex = -1; // No header, start from index 0
            nameColName = 'Column 1 (Name)';
            phoneColName = 'Column 2 (Phone)';
          }
        }

        if (nameColIdx === -1) {
          resolve({
            totalRows: 0,
            validRows: [],
            invalidRows: [],
            allRows: [],
            detectedColumns: { nameCol: null, phoneCol: phoneColName || null },
            error: 'Customer Name column not found. Please ensure your file has a "Name" or "Customer Name" column.',
          });
          return;
        }

        if (phoneColIdx === -1) {
          resolve({
            totalRows: 0,
            validRows: [],
            invalidRows: [],
            allRows: [],
            detectedColumns: { nameCol: nameColName, phoneCol: null },
            error: 'Phone Number column not found. Please ensure your file has a "Phone" or "Mobile Number" column.',
          });
          return;
        }

        const dataStartRow = headerRowIndex + 1;
        const allRows: ParsedCustomerRow[] = [];

        const remainingSlots = maxCapacityLimit !== undefined ? Math.max(0, maxCapacityLimit - existingCount) : Infinity;

        let rowCounter = 0;
        for (let r = dataStartRow; r < rows.length; r++) {
          const row = rows[r];
          if (!row || !Array.isArray(row)) continue;

          const rawName = String(row[nameColIdx] || '').trim();
          const rawPhone = sanitizePhoneNumber(row[phoneColIdx]);

          // Skip completely blank rows
          if (!rawName && !rawPhone) {
            continue;
          }

          rowCounter++;
          const rowNum = r + 1;
          let isValid = true;
          let errorMessage: string | undefined = undefined;

          // Check Name
          if (!rawName) {
            isValid = false;
            errorMessage = 'Customer name missing';
          }

          // Check Phone
          if (isValid) {
            const phoneVal = validatePhone(rawPhone);
            if (!phoneVal.isValid) {
              isValid = false;
              errorMessage = phoneVal.error || 'Invalid phone number';
            }
          }

          allRows.push({
            rowNumber: rowNum,
            customer_name: rawName,
            phone: rawPhone,
            isValid,
            errorMessage,
          });
        }

        // Check chit capacity on valid rows
        const validRows: ParsedCustomerRow[] = [];
        const invalidRows: ParsedCustomerRow[] = [];

        let validCount = 0;
        for (const item of allRows) {
          if (item.isValid) {
            validCount++;
            if (validCount > remainingSlots) {
              item.isValid = false;
              item.isOverCapacity = true;
              item.errorMessage = `Chit capacity limit (${maxCapacityLimit}) reached`;
              invalidRows.push(item);
            } else {
              validRows.push(item);
            }
          } else {
            invalidRows.push(item);
          }
        }

        resolve({
          totalRows: allRows.length,
          validRows,
          invalidRows,
          allRows,
          detectedColumns: { nameCol: nameColName, phoneCol: phoneColName },
        });
      } catch (err: any) {
        resolve({
          totalRows: 0,
          validRows: [],
          invalidRows: [],
          allRows: [],
          detectedColumns: { nameCol: null, phoneCol: null },
          error: `Failed to parse file: ${err.message || 'Unknown error'}`,
        });
      }
    };

    reader.onerror = () => {
      resolve({
        totalRows: 0,
        validRows: [],
        invalidRows: [],
        allRows: [],
        detectedColumns: { nameCol: null, phoneCol: null },
        error: 'Failed to read uploaded file.',
      });
    };

    reader.readAsBinaryString(file);
  });
}

/**
 * Downloads a pre-formatted Excel template file: customer_import_template.xlsx
 */
export function downloadSampleExcelTemplate() {
  const sampleData = [
    ['Name', 'Phone Number'],
    ['Ramesh Kumar', '9876543210'],
    ['Suresh Reddy', '9876543211'],
    ['Mahesh Varma', '9876543212'],
    ['Cheryala Saikiran', '9640488507'],
    ['Kiran Cheryala', '9876543213'],
  ];

  const ws = XLSX.utils.aoa_to_sheet(sampleData);

  // Set column widths for clean readability
  ws['!cols'] = [{ wch: 24 }, { wch: 18 }];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Customers');

  XLSX.writeFile(wb, 'customer_import_template.xlsx');
}
