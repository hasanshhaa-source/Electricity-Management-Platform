import { createClient } from '@/lib/supabase/server';
import type { TicketStatus, TicketType, ApiResponse } from '@/types';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ComplaintRow {
  id:              string;
  type:            TicketType;
  subject:         string;
  description:     string;
  attachment_url:  string | null;
  status:          TicketStatus;
  resolution_note: string | null;
  admin_notes:     string | null;
  admin_reply:     string | null;
  replied_at:      string | null;
  created_at:      string;
  updated_at:      string;
  flat: {
    id:           string;
    flat_number:  string;
    building: {
      id:   string;
      name: string;
      city: string;
    };
  };
  submitter: {
    id:        string;
    full_name: string;
    email:     string;
  };
}

export interface ComplaintFilters {
  buildingId?: string;
  type?:       string;
  status?:     string;
  search?:     string;
}

const COMPLAINT_SELECT = `
  id, type, subject, description, attachment_url, status,
  resolution_note, admin_notes, admin_reply, replied_at,
  created_at, updated_at,
  flat:flats(
    id, flat_number,
    building:buildings(id, name, city)
  ),
  submitter:users!submitted_by(id, full_name, email)
`;

// ── List ──────────────────────────────────────────────────────────────────────

export async function getComplaints(
  filters: ComplaintFilters = {},
): Promise<ComplaintRow[]> {
  const supabase = await createClient();

  let query = supabase
    .from('complaints')
    .select(COMPLAINT_SELECT)
    .is('deleted_at', null)
    .order('created_at', { ascending: false });

  if (filters.type)   query = query.eq('type',   filters.type);
  if (filters.status) query = query.eq('status', filters.status);

  const { data } = await query;
  let rows = (data ?? []) as unknown as ComplaintRow[];

  // In-JS filters (nested fields)
  if (filters.buildingId) {
    rows = rows.filter(r => r.flat?.building?.id === filters.buildingId);
  }
  if (filters.search) {
    const q = filters.search.toLowerCase();
    rows = rows.filter(r =>
      r.subject.toLowerCase().includes(q) ||
      r.submitter?.full_name.toLowerCase().includes(q) ||
      r.flat?.flat_number.toLowerCase().includes(q),
    );
  }

  return rows;
}

// ── Single ─────────────────────────────────────────────────────────────────────

export async function getComplaint(id: string): Promise<ComplaintRow | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from('complaints')
    .select(COMPLAINT_SELECT)
    .eq('id', id)
    .is('deleted_at', null)
    .single();
  return data as unknown as ComplaintRow | null;
}

// ── Update (admin) ────────────────────────────────────────────────────────────

export interface ComplaintUpdate {
  status?:          TicketStatus;
  resolution_note?: string | null;
  admin_notes?:     string | null;
  admin_reply?:     string | null;
  replied_at?:      string | null;
  replied_by?:      string | null;
  resolved_by?:     string | null;
  resolved_at?:     string | null;
}

export async function updateComplaint(
  id:      string,
  updates: ComplaintUpdate,
  adminId: string,
): Promise<ApiResponse<ComplaintRow>> {
  const supabase = await createClient();

  const patch: Record<string, unknown> = { ...updates };

  // Auto-set resolved_at / resolved_by when moving to resolved
  if (updates.status === 'resolved' && !updates.resolved_at) {
    patch.resolved_by = adminId;
    patch.resolved_at = new Date().toISOString();
  }

  const { data, error } = await supabase
    .from('complaints')
    .update(patch)
    .eq('id', id)
    .is('deleted_at', null)
    .select(COMPLAINT_SELECT)
    .single();

  if (error) return { data: null, error: error.message };
  return { data: data as unknown as ComplaintRow, error: null };
}

// ── Counts for sidebar badge ──────────────────────────────────────────────────

export async function getOpenComplaintsCount(): Promise<number> {
  const supabase = await createClient();
  const { count } = await supabase
    .from('complaints')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'open')
    .is('deleted_at', null);
  return count ?? 0;
}
