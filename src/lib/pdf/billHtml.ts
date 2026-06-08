/**
 * Generates a self-contained, print-optimised HTML bill document.
 * Returns a full HTML string that renders correctly in any browser
 * and prints cleanly to A4 (or downloads via the PDF endpoint).
 * Zero external dependencies.
 */

export interface BillHtmlData {
  billId:          string;
  buildingName:    string;
  buildingAddress: string;
  flatNumber:      string;
  tenantName:      string;
  tenantEmail:     string;
  periodYear:      number;
  periodMonth:     number;
  issueDate:       string;       // YYYY-MM-DD
  dueDate:         string;       // YYYY-MM-DD
  currency:        string;
  openingReading:  number | null;
  closingReading:  number | null;
  unitsConsumed:   number;
  sharePercent:    number;
  billedUnits:     number;
  ratePerUnit:     number;
  currentCharges:  number;
  differenceAdj:   number;
  manualAdj:       number;
  previousBalance: number;
  totalDue:        number;
  amountPaid:      number;
  outstanding:     number;
  status:          string;
  locale:          'en' | 'ar';
}

const MONTHS_EN = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December',
];

const MONTHS_AR = [
  'يناير','فبراير','مارس','أبريل','مايو','يونيو',
  'يوليو','أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر',
];

function fmt(n: number, d = 2) {
  return n.toLocaleString('en', { minimumFractionDigits: d, maximumFractionDigits: d });
}

function fmtDate(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' });
}

export function generateBillHtml(data: BillHtmlData): string {
  const isAr   = data.locale === 'ar';
  const dir    = isAr ? 'rtl' : 'ltr';
  const months = isAr ? MONTHS_AR : MONTHS_EN;
  const period = `${months[data.periodMonth - 1]} ${data.periodYear}`;

  const t = {
    title:          isAr ? 'فاتورة الكهرباء' : 'Electricity Bill',
    building:       isAr ? 'المبنى' : 'Building',
    flat:           isAr ? 'الشقة' : 'Flat',
    tenant:         isAr ? 'المستأجر' : 'Tenant',
    period:         isAr ? 'فترة الفاتورة' : 'Billing Period',
    issueDate:      isAr ? 'تاريخ الإصدار' : 'Issue Date',
    dueDate:        isAr ? 'تاريخ الاستحقاق' : 'Due Date',
    breakdown:      isAr ? 'تفاصيل الفاتورة' : 'Bill Breakdown',
    opening:        isAr ? 'القراءة الافتتاحية' : 'Opening Reading',
    closing:        isAr ? 'القراءة الختامية' : 'Closing Reading',
    consumed:       isAr ? 'الوحدات المستهلكة' : 'Units Consumed',
    share:          isAr ? 'نسبة العداد' : 'Meter Share',
    billed:         isAr ? 'الوحدات المفوترة' : 'Billed Units',
    rate:           isAr ? 'السعر لكل كيلوواط ساعة' : 'Rate per kWh',
    base:           isAr ? 'الفاتورة الأساسية' : 'Base Electricity Charge',
    diffAdj:        isAr ? 'تسوية فرق المبنى' : 'Building Difference Adjustment',
    manAdj:         isAr ? 'تعديل يدوي' : 'Manual Adjustment',
    prevBal:        isAr ? 'رصيد غير مسدد سابق' : 'Previous Unpaid Balance',
    totalDue:       isAr ? 'إجمالي المستحق' : 'Total Amount Due',
    amtPaid:        isAr ? 'المبلغ المدفوع' : 'Amount Paid',
    outstanding:    isAr ? 'الرصيد المتبقي' : 'Outstanding Balance',
    payInstr:       isAr ? 'تعليمات الدفع' : 'Payment Instructions',
    payInstrBody:   isAr
      ? 'يرجى تحويل المبلغ المستحق إلى الحساب البنكي لإدارة المبنى أو الدفع في مكتب الإدارة قبل تاريخ الاستحقاق.'
      : 'Please pay the outstanding amount to the building management office or via bank transfer before the due date shown above.',
    contact:        isAr
      ? 'للاستفسار، يرجى التواصل مع مكتب إدارة المبنى.'
      : 'For queries, please contact your building management office.',
    powered:        'Powered by ElectroManage',
    statusPaid:     isAr ? 'مدفوع بالكامل' : 'PAID IN FULL',
    statusOverdue:  isAr ? 'متأخر' : 'OVERDUE',
    statusUnpaid:   isAr ? 'غير مدفوع' : 'UNPAID',
    ref:            isAr ? 'رقم الفاتورة' : 'Bill Reference',
  };

  const statusColor =
    data.status === 'paid'    ? '#16a34a' :
    data.status === 'waived'  ? '#16a34a' :
    data.status === 'overdue' ? '#dc2626' :
    data.status === 'partial' ? '#d97706' : '#1d4ed8';

  const statusLabel =
    data.status === 'paid'    ? t.statusPaid    :
    data.status === 'overdue' ? t.statusOverdue : t.statusUnpaid;

  const rows: string[] = [];

  const row = (label: string, value: string, bold = false, warn = false, green = false) => {
    const labelStyle = `padding:8px 12px;color:${warn ? '#92400e' : '#374151'};font-size:13px;`;
    const valStyle   = `padding:8px 12px;text-align:right;font-family:monospace;font-size:13px;${bold ? 'font-weight:700;' : ''}${green ? 'color:#16a34a;' : warn ? 'color:#92400e;' : ''}`;
    rows.push(`<tr style="border-bottom:1px solid #f3f4f6;"><td style="${labelStyle}">${label}</td><td style="${valStyle}">${value}</td></tr>`);
  };

  if (data.openingReading !== null) row(t.opening, `${fmt(data.openingReading, 3)} kWh`);
  if (data.closingReading !== null) row(t.closing, `${fmt(data.closingReading, 3)} kWh`);
  if (data.openingReading !== null && data.closingReading !== null) row(t.consumed, `${fmt(data.unitsConsumed, 3)} kWh`);
  if (data.sharePercent < 100) row(t.share, `${fmt(data.sharePercent, 1)}%`);
  row(t.billed,  `${fmt(data.billedUnits, 3)} kWh`);
  row(t.rate,    `${data.currency} ${fmt(data.ratePerUnit, 4)}`);
  rows.push(`<tr style="background:#f9fafb;border-top:1px solid #e5e7eb;border-bottom:1px solid #e5e7eb;"><td colspan="2" style="padding:2px;"></td></tr>`);
  row(t.base, `${data.currency} ${fmt(data.currentCharges)}`);
  if (data.differenceAdj !== 0) row(t.diffAdj, `${data.differenceAdj >= 0 ? '+' : ''}${data.currency} ${fmt(data.differenceAdj)}`, false, data.differenceAdj > 0);
  if (data.manualAdj !== 0)     row(t.manAdj,  `${data.manualAdj >= 0 ? '+' : ''}${data.currency} ${fmt(data.manualAdj)}`, false, data.manualAdj > 0);
  if (data.previousBalance > 0) row(t.prevBal, `+ ${data.currency} ${fmt(data.previousBalance)}`, false, true);
  rows.push(`<tr style="background:#eff6ff;border-top:2px solid #bfdbfe;"><td style="padding:10px 12px;font-weight:700;font-size:14px;color:#1e3a5f;">${t.totalDue}</td><td style="padding:10px 12px;text-align:right;font-weight:700;font-size:16px;color:#1e3a5f;font-family:monospace;">${data.currency} ${fmt(data.totalDue)}</td></tr>`);
  if (data.amountPaid > 0) row(t.amtPaid, `− ${data.currency} ${fmt(data.amountPaid)}`, false, false, true);
  if (data.outstanding > 0) rows.push(`<tr style="background:#fef2f2;"><td style="padding:8px 12px;font-weight:700;color:#991b1b;font-size:13px;">${t.outstanding}</td><td style="padding:8px 12px;text-align:right;font-weight:700;color:#dc2626;font-size:14px;font-family:monospace;">${data.currency} ${fmt(data.outstanding)}</td></tr>`);

  return `<!DOCTYPE html>
<html lang="${isAr ? 'ar' : 'en'}" dir="${dir}">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${t.title} — ${period}</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0;}
  body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;color:#111827;background:#f3f4f6;direction:${dir};}
  .page{max-width:680px;margin:32px auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,.08);}
  .header{background:linear-gradient(135deg,#1e40af,#1d4ed8);color:#fff;padding:32px 36px;}
  .header-top{display:flex;justify-content:space-between;align-items:flex-start;gap:16px;}
  .logo{display:flex;align-items:center;gap:10px;margin-bottom:20px;}
  .logo-icon{width:36px;height:36px;background:rgba(255,255,255,.2);border-radius:8px;display:flex;align-items:center;justify-content:center;font-weight:900;font-size:18px;}
  .logo-name{font-size:16px;font-weight:700;letter-spacing:.3px;}
  .bill-title{font-size:22px;font-weight:700;margin-bottom:4px;}
  .bill-period{font-size:14px;opacity:.85;}
  .status-badge{display:inline-flex;align-items:center;padding:4px 14px;border-radius:20px;font-size:12px;font-weight:700;letter-spacing:.5px;background:rgba(255,255,255,.15);color:#fff;border:1.5px solid rgba(255,255,255,.4);}
  .meta-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:24px;}
  .meta-item{background:rgba(255,255,255,.1);border-radius:8px;padding:12px 16px;}
  .meta-label{font-size:11px;opacity:.7;margin-bottom:2px;text-transform:uppercase;letter-spacing:.5px;}
  .meta-value{font-size:14px;font-weight:600;}
  .section{padding:28px 36px;}
  .section-title{font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:.8px;color:#6b7280;margin-bottom:14px;padding-bottom:8px;border-bottom:1px solid #f3f4f6;}
  table{width:100%;border-collapse:collapse;}
  .info-grid{display:grid;grid-template-columns:1fr 1fr;gap:16px;background:#f9fafb;border-radius:8px;padding:16px;margin-bottom:24px;}
  .info-item{}
  .info-label{font-size:11px;color:#9ca3af;text-transform:uppercase;letter-spacing:.5px;margin-bottom:3px;}
  .info-value{font-size:14px;font-weight:600;color:#111827;}
  .pay-box{background:#f0fdf4;border:1.5px solid #86efac;border-radius:8px;padding:16px 20px;}
  .pay-title{font-size:13px;font-weight:700;color:#15803d;margin-bottom:6px;}
  .pay-body{font-size:12px;color:#166534;line-height:1.6;}
  .footer{background:#f9fafb;border-top:1px solid #e5e7eb;padding:16px 36px;display:flex;justify-content:space-between;align-items:center;}
  .footer-note{font-size:11px;color:#9ca3af;}
  @media print{
    body{background:#fff;}
    .page{margin:0;border-radius:0;box-shadow:none;max-width:100%;}
    .no-print{display:none!important;}
  }
  @page{size:A4;margin:10mm;}
</style>
</head>
<body>
<div class="page">
  <!-- Header -->
  <div class="header">
    <div class="logo">
      <div class="logo-icon">⚡</div>
      <div class="logo-name">ElectroManage</div>
    </div>
    <div class="header-top">
      <div>
        <div class="bill-title">${t.title}</div>
        <div class="bill-period">${period}</div>
      </div>
      <div class="status-badge" style="background:rgba(255,255,255,.18);border-color:rgba(255,255,255,.5);color:#fff;">
        ${statusLabel}
      </div>
    </div>
    <div class="meta-grid">
      <div class="meta-item"><div class="meta-label">${t.building}</div><div class="meta-value">${data.buildingName}</div></div>
      <div class="meta-item"><div class="meta-label">${t.flat}</div><div class="meta-value">${t.flat} ${data.flatNumber}</div></div>
      <div class="meta-item"><div class="meta-label">${t.tenant}</div><div class="meta-value">${data.tenantName}</div></div>
      <div class="meta-item"><div class="meta-label">${t.dueDate}</div><div class="meta-value" style="color:${data.status === 'overdue' ? '#fca5a5' : '#fff'}">${fmtDate(data.dueDate)}</div></div>
    </div>
  </div>

  <!-- Bill info grid -->
  <div class="section">
    <div class="section-title">${t.breakdown}</div>
    <div class="info-grid">
      <div class="info-item"><div class="info-label">${t.ref}</div><div class="info-value" style="font-family:monospace;font-size:12px;">${data.billId.slice(0, 8).toUpperCase()}</div></div>
      <div class="info-item"><div class="info-label">${t.issueDate}</div><div class="info-value">${fmtDate(data.issueDate)}</div></div>
      <div class="info-item"><div class="info-label">${t.period}</div><div class="info-value">${period}</div></div>
      <div class="info-item"><div class="info-label">${t.dueDate}</div><div class="info-value" style="color:${data.status === 'overdue' ? '#dc2626' : 'inherit'}">${fmtDate(data.dueDate)}</div></div>
    </div>

    <!-- Breakdown table -->
    <table style="border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;">
      ${rows.join('\n      ')}
    </table>
  </div>

  <!-- Payment instructions -->
  ${data.outstanding > 0 ? `
  <div class="section" style="padding-top:0">
    <div class="pay-box">
      <div class="pay-title">💳 ${t.payInstr}</div>
      <div class="pay-body">${t.payInstrBody}</div>
      <div class="pay-body" style="margin-top:6px;opacity:.8;">${t.contact}</div>
    </div>
  </div>` : ''}

  <!-- Footer -->
  <div class="footer">
    <span class="footer-note">${t.powered}</span>
    <span class="footer-note">${data.buildingAddress}</span>
  </div>
</div>

<!-- Print button (hidden when printing) -->
<div class="no-print" style="text-align:center;padding:20px;">
  <button onclick="window.print()"
    style="background:#1d4ed8;color:#fff;border:none;padding:10px 28px;border-radius:8px;font-size:14px;font-weight:600;cursor:pointer;">
    🖨️ Print / Save as PDF
  </button>
</div>
</body>
</html>`;
}
