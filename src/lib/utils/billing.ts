import type { ElectricityCompanyBill } from '@/types';

export interface BillSummary {
  count:          number;
  totalAmount:    number;
  totalUnits:     number;
  avgCostPerUnit: number | null;
}

export function calcBillSummary(bills: ElectricityCompanyBill[]): BillSummary {
  const count       = bills.length;
  const totalAmount = bills.reduce((s, b) => s + Number(b.total_amount), 0);
  const totalUnits  = bills.reduce((s, b) => s + Number(b.total_units ?? 0), 0);
  return {
    count,
    totalAmount,
    totalUnits,
    avgCostPerUnit: totalUnits > 0 ? totalAmount / totalUnits : null,
  };
}
