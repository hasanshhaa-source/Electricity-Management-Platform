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
