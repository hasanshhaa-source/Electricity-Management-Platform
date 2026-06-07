// ─── Enums ────────────────────────────────────────────────────

export type UserRole = 'admin' | 'tenant';
export type FlatStatus = 'available' | 'occupied' | 'maintenance' | 'inactive';
export type TenancyStatus = 'pending' | 'active' | 'ended' | 'rejected';
export type MeterType = 'individual' | 'shared';
export type ReadingType = 'actual' | 'estimated' | 'opening';
export type CycleStatus =
  | 'draft'
  | 'readings_collected'
  | 'bills_imported'
  | 'calculated'
  | 'issued'
  | 'closed'
  | 'open'       // legacy
  | 'finalized'; // legacy
export type BillStatus = 'draft' | 'unpaid' | 'partial' | 'paid' | 'waived';
export type PaymentMethod = 'cash' | 'bank_transfer' | 'online' | 'other';
export type NotificationChannel = 'email' | 'whatsapp' | 'in_app';
export type NotificationType =
  | 'bill_generated'
  | 'payment_reminder'
  | 'overdue'
  | 'payment_confirmed'
  | 'tenancy_approved'
  | 'tenancy_rejected';
export type NotificationStatus = 'pending' | 'sent' | 'failed' | 'skipped';
export type TicketType = 'complaint' | 'recommendation' | 'query';
export type TicketStatus = 'open' | 'in_progress' | 'resolved' | 'closed';

// ─── Database Entities ────────────────────────────────────────

export interface User {
  id: string;
  auth_id: string | null;
  email: string;
  full_name: string;
  phone: string | null;
  national_id: string | null;
  role: UserRole;
  is_active: boolean;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface Building {
  id: string;
  name: string;
  address: string;
  city: string;
  country: string;
  billing_day: number;
  currency: string;
  is_active: boolean;
  deleted_at: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface Flat {
  id: string;
  building_id: string;
  flat_number: string;
  floor: number | null;
  area_sqm: number | null;
  description: string | null;
  notes: string | null;
  status: FlatStatus;
  is_active: boolean;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
}

// ─── Extended / Joined Types ──────────────────────────────────

export interface FlatWithTenant extends Flat {
  building?: Building;
  active_tenancy?: TenancyWithUser | null;
}

export interface TenancyWithUser extends Tenancy {
  user: User;
}

export interface MeterWithAllocations extends Meter {
  allocations: (FlatMeterAssignment & { flat: Pick<Flat, 'id' | 'flat_number' | 'floor'> })[];
}

export interface TenantWithTenancy extends User {
  active_tenancy?: (Tenancy & {
    flat: Flat & { building: Building };
  }) | null;
}

export interface FlatWithBuilding extends Flat {
  building: Building;
}

export interface Tenancy {
  id: string;
  flat_id: string;
  user_id: string;
  status: TenancyStatus;
  start_date: string | null;
  end_date: string | null;
  notes: string | null;
  approved_by: string | null;
  approved_at: string | null;
  rejected_by: string | null;
  rejected_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface TenancyWithDetails extends Tenancy {
  flat: FlatWithBuilding;
  user: User;
}

export interface Meter {
  id: string;
  building_id: string;
  meter_number: string;
  meter_type: MeterType;
  description: string | null;
  unit: string;
  is_active: boolean;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface FlatMeterAssignment {
  id: string;
  flat_id: string;
  meter_id: string;
  share_percent: number;
  effective_from: string;
  effective_to: string | null;
  created_at: string;
  updated_at: string;
}

export interface TariffRate {
  id: string;
  building_id: string;
  rate_per_unit: number;
  fixed_charge: number;
  effective_from: string;
  effective_to: string | null;
  notes: string | null;
  created_by: string;
  created_at: string;
}

export interface MeterReading {
  id: string;
  meter_id: string;
  cycle_id: string | null;
  reading_value: number;
  reading_date: string;
  billing_period_year: number;
  billing_period_month: number;
  reading_type: ReadingType;
  image_url: string | null;
  recorded_by: string;
  override_reason: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface ElectricityCompanyBill {
  id: string;
  building_id: string;
  cycle_id: string | null;
  bill_number: string;
  electricity_account_number: string | null;
  period_year: number;
  period_month: number;
  total_amount: number;
  total_units: number | null;
  bill_issue_date: string | null;
  due_date: string;
  paid_at: string | null;
  image_url: string | null;
  notes: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface BillingCycle {
  id: string;
  building_id: string;
  period_year: number;
  period_month: number;
  status: CycleStatus;
  opened_at: string;
  finalized_at: string | null;
  finalized_by: string | null;
  closed_at: string | null;
  closed_by: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface FlatBill {
  id: string;
  billing_cycle_id: string;
  flat_id: string;
  tenancy_id: string;
  version: number;
  is_current_version: boolean;
  meter_id: string | null;
  opening_reading: number | null;
  closing_reading: number | null;
  units_consumed: number;
  share_percent: number;
  billed_units: number;
  rate_per_unit: number;
  fixed_charge: number;
  tariff_rate_id: string | null;
  current_charges: number;
  previous_balance: number;
  total_due: number;
  amount_paid: number;
  outstanding_balance: number;
  status: BillStatus;
  due_date: string;
  paid_at: string | null;
  calculation_log: Record<string, unknown>;
  calculated_by: string | null;
  calculated_at: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface Payment {
  id: string;
  bill_id: string;
  amount: number;
  payment_method: PaymentMethod;
  reference_no: string | null;
  paid_at: string;
  recorded_by: string;
  notes: string | null;
  is_reversed: boolean;
  reversed_at: string | null;
  reversed_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface Complaint {
  id: string;
  flat_id: string;
  submitted_by: string;
  type: TicketType;
  subject: string;
  description: string;
  status: TicketStatus;
  resolved_by: string | null;
  resolved_at: string | null;
  resolution_note: string | null;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface Notification {
  id: string;
  user_id: string;
  bill_id: string | null;
  tenancy_id: string | null;
  channel: NotificationChannel;
  type: NotificationType;
  status: NotificationStatus;
  title: string;
  body: string | null;
  scheduled_for: string | null;
  sent_at: string | null;
  read_at: string | null;
  error_message: string | null;
  payload: Record<string, unknown> | null;
  created_at: string;
}

export interface AuditLog {
  id: number;
  entity_type: string;
  entity_id: string | null;
  action: string;
  actor_id: string | null;
  actor_role: UserRole | null;
  old_data: Record<string, unknown> | null;
  new_data: Record<string, unknown> | null;
  ip_address: string | null;
  user_agent: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

// ─── API Response Types ───────────────────────────────────────

export interface ApiResponse<T = unknown> {
  data: T | null;
  error: string | null;
  message?: string;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

// ─── Auth Types ───────────────────────────────────────────────

export interface AuthUser {
  id: string;         // users.id (internal)
  auth_id: string;    // supabase auth uid
  email: string;
  full_name: string;
  role: UserRole;
  is_active: boolean;
}

export interface SessionPayload {
  user: AuthUser;
  accessToken: string;
}
