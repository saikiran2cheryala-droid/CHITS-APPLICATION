import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { formatINR, formatDDMMYYYY } from './formatters';

interface ExportContext {
  chit: any;
  selectedMonth: number;
  monthData: any;
}

function sanitizeFileName(name: string): string {
  return (name || 'chit')
    .replace(/[^a-zA-Z0-9_-]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');
}

/**
 * Export Customer Monthly Sheet to Excel (.xlsx) with all details
 */
export function exportMonthlySheetToExcel({ chit, selectedMonth, monthData }: ExportContext) {
  const chitName = chit?.name || 'Chit Fund';
  const monthName = monthData?.rule?.month_name || `Month ${selectedMonth}`;
  const totalDue = Number(monthData?.stats?.total_due || 0);
  const totalPaid = Number(monthData?.stats?.total_paid || 0);
  const totalPending = Math.max(0, totalDue - totalPaid);

  const preLift = Number(monthData?.rule?.pre_lift_payment || 0);
  const postLift = Number(monthData?.rule?.post_lift_payment || 0);
  const liftPayout = Number(monthData?.rule?.expected_lift_payout || monthData?.rule?.monthly_chit_value || 0);

  const duesList: any[] = monthData?.dues || [];

  // 1. Overview Metadata Section
  const overviewRows = [
    ['SAIKIRAN CHITS — MONTHLY CUSTOMER SHEET'],
    ['Chit Group:', chitName, '', 'Month:', `Month ${selectedMonth} — ${monthName}`],
    ['Chit Value:', formatINR(chit?.chit_value || 0), '', 'Total Duration:', `${chit?.total_months || 0} Months`],
    ['Total Members:', chit?.total_members || duesList.length, '', 'Generated Date:', new Date().toLocaleDateString('en-IN')],
    [],
    ['MONTHLY FINANCIAL RULES & SUMMARY'],
    ['Pre-Lift Payment:', formatINR(preLift), '', 'Total Scheduled Due:', formatINR(totalDue)],
    ['Post-Lift Payment:', formatINR(postLift), '', 'Total Collected:', formatINR(totalPaid)],
    ['Lift Payout:', formatINR(liftPayout), '', 'Total Pending:', formatINR(totalPending)],
    [
      'Lifted Customer:',
      monthData?.lift
        ? `${monthData.lift.customer_name} (#${monthData.lift.ticket_number}) — Disbursed: ${formatINR(monthData.lift.lift_amount_received || 0)}`
        : 'None (Scheduled for this month)',
      '',
      'Collection Status:',
      `${duesList.filter((d: any) => d.status === 'PAID').length} Paid / ${duesList.filter((d: any) => d.status !== 'PAID').length} Pending`,
    ],
    [],
    ['MEMBER MONTHLY DUES & PAYMENT DETAILS'],
  ];

  // 2. Column Headers
  const tableHeaders = [
    'Sl No',
    'Ticket #',
    'Customer Name',
    'Phone Number',
    'Lift Status',
    'Monthly Due (₹)',
    'Paid Amount (₹)',
    'Balance (₹)',
    'Payment Status',
    'Last Payment Date',
    'Payment Method',
    'Reference No',
    'Notes',
  ];

  // 3. Member Rows
  const memberRows = duesList.map((d: any, idx: number) => {
    const isLifted = d.lift_status === 'lifted' || Boolean(d.lift_id);
    const lastPayDate = d.last_payment_date ? formatDDMMYYYY(d.last_payment_date) : '-';

    return [
      idx + 1,
      d.ticket_number ? String(d.ticket_number).padStart(2, '0') : String(idx + 1).padStart(2, '0'),
      d.customer_name || '-',
      d.phone || '-',
      isLifted ? 'LIFTED' : 'NOT LIFTED',
      Number(d.due_amount || 0),
      Number(d.paid_amount || 0),
      Number(d.balance_amount || 0),
      d.status || (d.paid_amount >= d.due_amount ? 'PAID' : d.paid_amount > 0 ? 'PARTIAL' : 'PENDING'),
      lastPayDate,
      d.last_payment_method || '-',
      d.last_payment_reference || '-',
      d.last_payment_notes || '-',
    ];
  });

  // Total Summary Row
  const totalRow = [
    'TOTAL',
    '',
    `${duesList.length} Members`,
    '',
    '',
    totalDue,
    totalPaid,
    totalPending,
    `${duesList.filter((d: any) => d.status === 'PAID').length} PAID`,
    '',
    '',
    '',
    '',
  ];

  const fullSheetData = [...overviewRows, tableHeaders, ...memberRows, totalRow];

  const ws = XLSX.utils.aoa_to_sheet(fullSheetData);

  // Column widths
  ws['!cols'] = [
    { wch: 8 },  // Sl No
    { wch: 10 }, // Ticket #
    { wch: 26 }, // Customer Name
    { wch: 16 }, // Phone
    { wch: 14 }, // Lift Status
    { wch: 16 }, // Due Amount
    { wch: 16 }, // Paid Amount
    { wch: 16 }, // Balance
    { wch: 16 }, // Status
    { wch: 18 }, // Last Payment Date
    { wch: 16 }, // Payment Method
    { wch: 18 }, // Reference No
    { wch: 24 }, // Notes
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, `Month ${selectedMonth}`);

  const fileName = `${sanitizeFileName(chitName)}_Month_${selectedMonth}_Sheet.xlsx`;
  XLSX.writeFile(wb, fileName);
}

/**
 * Export Customer Monthly Sheet to PDF (.pdf) with brand headers and formatted table
 */
export function exportMonthlySheetToPDF({ chit, selectedMonth, monthData }: ExportContext) {
  const chitName = chit?.name || 'Chit Fund';
  const monthName = monthData?.rule?.month_name || `Month ${selectedMonth}`;
  const totalDue = Number(monthData?.stats?.total_due || 0);
  const totalPaid = Number(monthData?.stats?.total_paid || 0);
  const totalPending = Math.max(0, totalDue - totalPaid);

  const preLift = Number(monthData?.rule?.pre_lift_payment || 0);
  const postLift = Number(monthData?.rule?.post_lift_payment || 0);
  const liftPayout = Number(monthData?.rule?.expected_lift_payout || monthData?.rule?.monthly_chit_value || 0);

  const duesList: any[] = monthData?.dues || [];

  // Create landscape A4 PDF for optimal tabular presentation
  const doc = new jsPDF({
    orientation: 'landscape',
    unit: 'pt',
    format: 'a4',
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();

  // Top Accent Banner
  doc.setFillColor(30, 41, 59); // slate-800
  doc.rect(0, 0, pageWidth, 55, 'F');

  // Brand & Title
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.text('SAIKIRAN CHITS', 28, 26);

  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(203, 213, 225); // slate-300
  doc.text(`Customer Monthly Sheet • Month ${selectedMonth} (${monthName})`, 28, 42);

  // Chit Name & Generated Time on right
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(255, 255, 255);
  doc.text(chitName.toUpperCase(), pageWidth - 28, 26, { align: 'right' });

  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(203, 213, 225);
  doc.text(
    `Chit Value: ${formatINR(chit?.chit_value || 0)} | Generated: ${new Date().toLocaleDateString('en-IN')}`,
    pageWidth - 28,
    42,
    { align: 'right' }
  );

  // Financial Summary Cards Bar (below header)
  const summaryBoxY = 66;
  doc.setFillColor(248, 250, 252); // slate-50
  doc.setDrawColor(226, 232, 240); // slate-200
  doc.roundedRect(28, summaryBoxY, pageWidth - 56, 46, 6, 6, 'FD');

  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(71, 85, 105);

  const colW = (pageWidth - 56) / 5;

  // Box 1: Pre/Post Lift
  doc.text('PAYMENT RULES', 38, summaryBoxY + 16);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(15, 23, 42);
  doc.text(`Pre: ${formatINR(preLift)} | Post: ${formatINR(postLift)}`, 38, summaryBoxY + 32);

  // Box 2: Total Due
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(71, 85, 105);
  doc.text('SCHEDULED DUE', 38 + colW, summaryBoxY + 16);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(15, 23, 42);
  doc.text(formatINR(totalDue), 38 + colW, summaryBoxY + 32);

  // Box 3: Total Collection
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(21, 128, 61); // emerald-700
  doc.text('TOTAL COLLECTED', 38 + colW * 2, summaryBoxY + 16);
  doc.setFont('helvetica', 'bold');
  doc.text(formatINR(totalPaid), 38 + colW * 2, summaryBoxY + 32);

  // Box 4: Pending Balance
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(220, 38, 38); // red-600
  doc.text('TOTAL PENDING', 38 + colW * 3, summaryBoxY + 16);
  doc.setFont('helvetica', 'bold');
  doc.text(formatINR(totalPending), 38 + colW * 3, summaryBoxY + 32);

  // Box 5: Lifted customer
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(109, 40, 217); // purple-700
  doc.text('LIFT STATUS', 38 + colW * 4, summaryBoxY + 16);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(15, 23, 42);
  const liftSummary = monthData?.lift
    ? `${monthData.lift.customer_name} (#${monthData.lift.ticket_number})`
    : `Scheduled Payout: ${formatINR(liftPayout)}`;
  doc.text(liftSummary, 38 + colW * 4, summaryBoxY + 32);

  // Table Body Rows
  const tableData = duesList.map((d: any, idx: number) => {
    const isLifted = d.lift_status === 'lifted' || Boolean(d.lift_id);
    const lastPayDate = d.last_payment_date ? formatDDMMYYYY(d.last_payment_date) : '-';
    const payMethod = d.last_payment_method ? `${d.last_payment_method}${d.last_payment_reference ? ` (#${d.last_payment_reference})` : ''}` : '-';

    return [
      String(idx + 1),
      d.ticket_number ? String(d.ticket_number).padStart(2, '0') : String(idx + 1).padStart(2, '0'),
      d.customer_name || '-',
      d.phone || '-',
      isLifted ? 'Lifted' : 'Not Lifted',
      formatINR(d.due_amount || 0),
      formatINR(d.paid_amount || 0),
      formatINR(d.balance_amount || 0),
      d.status || (d.paid_amount >= d.due_amount ? 'PAID' : d.paid_amount > 0 ? 'PARTIAL' : 'PENDING'),
      lastPayDate,
      payMethod,
    ];
  });

  // Table Columns
  const tableHeadersPDF = [
    '#',
    'Ticket',
    'Customer Name',
    'Phone',
    'Lift Status',
    'Due (₹)',
    'Paid (₹)',
    'Balance (₹)',
    'Status',
    'Payment Date',
    'Method / Reference',
  ];

  autoTable(doc, {
    startY: summaryBoxY + 54,
    head: [tableHeadersPDF],
    body: tableData,
    margin: { left: 28, right: 28, bottom: 35 },
    styles: {
      fontSize: 8,
      cellPadding: 4.5,
      textColor: [30, 41, 59],
      lineColor: [226, 232, 240],
      lineWidth: 0.5,
      overflow: 'linebreak',
    },
    headStyles: {
      fillColor: [241, 245, 249],
      textColor: [15, 23, 42],
      fontStyle: 'bold',
      fontSize: 8,
    },
    columnStyles: {
      0: { cellWidth: 22, halign: 'center' }, // #
      1: { cellWidth: 38, halign: 'center', fontStyle: 'bold' }, // Ticket
      2: { cellWidth: 140, fontStyle: 'bold' }, // Customer Name
      3: { cellWidth: 80 }, // Phone
      4: { cellWidth: 65, halign: 'center' }, // Lift Status
      5: { cellWidth: 65, halign: 'right' }, // Due
      6: { cellWidth: 65, halign: 'right' }, // Paid
      7: { cellWidth: 65, halign: 'right' }, // Balance
      8: { cellWidth: 60, halign: 'center', fontStyle: 'bold' }, // Status
      9: { cellWidth: 65, halign: 'center' }, // Date
      10: { cellWidth: 'auto' }, // Method / Ref
    },
    didParseCell: (data) => {
      // Color status tags
      if (data.section === 'body' && data.column.index === 8) {
        const val = String(data.cell.raw || '').toUpperCase();
        if (val === 'PAID') {
          data.cell.styles.textColor = [21, 128, 61]; // green
        } else if (val === 'PARTIAL') {
          data.cell.styles.textColor = [180, 83, 9]; // amber
        } else {
          data.cell.styles.textColor = [220, 38, 38]; // red
        }
      }
      // Lifted status
      if (data.section === 'body' && data.column.index === 4) {
        if (data.cell.raw === 'Lifted') {
          data.cell.styles.textColor = [109, 40, 217];
          data.cell.styles.fontStyle = 'bold';
        }
      }
    },
    didDrawPage: (data) => {
      // Footer page numbering
      const str = `Page ${doc.getNumberOfPages()} • SAIKIRAN CHITS Confidential Record`;
      doc.setFontSize(8);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(148, 163, 184); // slate-400
      doc.text(str, pageWidth / 2, pageHeight - 15, { align: 'center' });
    },
  });

  const fileName = `${sanitizeFileName(chitName)}_Month_${selectedMonth}_Sheet.pdf`;
  doc.save(fileName);
}
