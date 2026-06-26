import { createClient } from '@/lib/supabase/server';
import type { ElectricityCompanyBill, ApiResponse } from '@/types';
import type { CompanyBillInput } from '@/lib/validation/billing';

export async function getBillsForCycle(
  buildingId: string,
  periodYear: number,
  periodMonth: number,
): Promise<ApiResponse<ElectricityCompanyBill[]>> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('electricity_company_bills')
    .select('*')
    .eq('building_id', buildingId)
    .eq('period_year', periodYear)
    .eq('period_month', periodMonth)
    .order('created_at', { ascending: true });
  if (error) return { data: null, error: error.message };
  return { data, error: null };
}

export async function getCompanyBillById(id: string): Promise<ApiResponse<ElectricityCompanyBill>> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('electricity_company_bills')
    .select('*')
    .eq('id', id)
    .single();
  if (error) return { data: null, error: error.message };
  return { data, error: null };
}

export async function createCompanyBill(
  input: CompanyBillInput,
  adminId: string,
): Promise<ApiResponse<ElectricityCompanyBill>> {
  const supabase = await createClient();

  // Enforce unique bill_number per building
  const { count } = await supabase
    .from('electricity_company_bills')
    .select('id', { count: 'exact', head: true })
    .eq('building_id', input.building_id)
    .eq('bill_number', input.bill_number);

  if (count && count > 0) {
    return { data: null, error: `Bill reference "${input.bill_number}" already exists for this building` };
  }

  const { data, error } = await supabase
    .from('electricity_company_bills')
    .insert({ ...input, created_by: adminId })
    .select()
    .single();

  if (error) return { data: null, error: error.message };
  return { data, error: null };
}

export async function updateCompanyBill(
  id: string,
  input: Partial<CompanyBillInput>,
  adminId: string,
): Promise<ApiResponse<ElectricityCompanyBill>> {
  const supabase = await createClient();

  // If bill_number is changing, check uniqueness
  if (input.bill_number && input.building_id) {
    const { count } = await supabase
      .from('electricity_company_bills')
      .select('id', { count: 'exact', head: true })
      .eq('building_id', input.building_id)
      .eq('bill_number', input.bill_number)
      .neq('id', id);
    if (count && count > 0) {
      return { data: null, error: `Bill reference "${input.bill_number}" already exists for this building` };
    }
  }

  const { data, error } = await supabase
    .from('electricity_company_bills')
    .update(input)
    .eq('id', id)
    .select()
    .single();

  if (error) return { data: null, error: error.message };
  return { data, error: null };
}

export async function deleteCompanyBill(id: string): Promise<ApiResponse<null>> {
  const supabase = await createClient();
  const { error } = await supabase
    .from('electricity_company_bills')
    .delete()
    .eq('id', id);
  if (error) return { data: null, error: error.message };
  return { data: null, error: null };
}

// ─── Bill-meter links ───────────────────────────────────────────────

/**
 * Replaces the full set of meters linked to a bill. A bill billed directly to
 * a flat (lump sum) cannot also have linked meters — clear billed_to_flat_id first.
 */
export async function linkBillToMeters(billId: string, meterIds: string[]): Promise<ApiResponse<null>> {
  const supabase = await createClient();

  const { data: bill } = await supabase
    .from('electricity_company_bills')
    .select('id, billed_to_flat_id')
    .eq('id', billId)
    .single();
  if (!bill) return { data: null, error: 'Bill not found' };
  if (bill.billed_to_flat_id) {
    return { data: null, error: 'Bill is billed directly to a flat — unlink it before assigning meters' };
  }

  if (meterIds.length > 0) {
    // A meter may only be linked to one bill at a time (no DB constraint for
    // this since links aren't period-scoped on their own, so enforce here).
    const { data: existingLinks } = await supabase
      .from('company_bill_meters')
      .select('meter_id, company_bill_id')
      .in('meter_id', meterIds)
      .neq('company_bill_id', billId);
    if (existingLinks && existingLinks.length > 0) {
      return { data: null, error: `Meter already linked to another bill: ${existingLinks.map((l) => l.meter_id).join(', ')}` };
    }
  }

  const { error: deleteError } = await supabase.from('company_bill_meters').delete().eq('company_bill_id', billId);
  if (deleteError) return { data: null, error: deleteError.message };

  if (meterIds.length > 0) {
    const { error: insertError } = await supabase
      .from('company_bill_meters')
      .insert(meterIds.map((meterId) => ({ company_bill_id: billId, meter_id: meterId })));
    if (insertError) return { data: null, error: insertError.message };
  }

  return { data: null, error: null };
}

/**
 * Sets (or clears) the flat a bill is billed to as a lump sum. Setting this
 * clears any linked meters, since lump-sum bills bypass consumption math.
 */
export async function setBillFlatTarget(billId: string, flatId: string | null): Promise<ApiResponse<ElectricityCompanyBill>> {
  const supabase = await createClient();

  if (flatId) {
    await supabase.from('company_bill_meters').delete().eq('company_bill_id', billId);
  }

  const { data, error } = await supabase
    .from('electricity_company_bills')
    .update({ billed_to_flat_id: flatId })
    .eq('id', billId)
    .select()
    .single();
  if (error) return { data: null, error: error.message };
  return { data, error: null };
}

export interface BillLink {
  billId:   string;
  meterIds: string[];
  flatId:   string | null;
}

/** Fetches the bill-meter/flat links for every bill in a building/period, for use building calculation inputs. */
export async function getBillLinksForCycle(
  buildingId: string,
  periodYear: number,
  periodMonth: number,
): Promise<BillLink[]> {
  const supabase = await createClient();

  const { data: bills } = await supabase
    .from('electricity_company_bills')
    .select('id, billed_to_flat_id')
    .eq('building_id', buildingId)
    .eq('period_year', periodYear)
    .eq('period_month', periodMonth);
  if (!bills || bills.length === 0) return [];

  const billIds = bills.map((b) => b.id);
  const { data: links } = await supabase
    .from('company_bill_meters')
    .select('company_bill_id, meter_id')
    .in('company_bill_id', billIds);

  return bills.map((bill) => ({
    billId:   bill.id,
    flatId:   bill.billed_to_flat_id,
    meterIds: (links ?? []).filter((l) => l.company_bill_id === bill.id).map((l) => l.meter_id),
  }));
}

/** Returns bill_numbers of bills for this building/period that are neither linked to meters nor billed to a flat. */
export function findUnlinkedBills(
  bills: { id: string; bill_number: string }[],
  links: BillLink[],
): string[] {
  const linkedById = new Map(links.map((l) => [l.billId, l]));
  return bills
    .filter((b) => {
      const link = linkedById.get(b.id);
      return !link || (link.meterIds.length === 0 && !link.flatId);
    })
    .map((b) => b.bill_number);
}
