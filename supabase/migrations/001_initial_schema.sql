-- ============================================================
-- Migration 001: Initial Schema
-- Electricity Management Platform
-- ============================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ─── ENUM TYPES ──────────────────────────────────────────────

CREATE TYPE user_role AS ENUM ('admin', 'tenant');
CREATE TYPE flat_status AS ENUM ('available', 'occupied', 'maintenance');
CREATE TYPE tenancy_status AS ENUM ('pending', 'active', 'ended', 'rejected');
CREATE TYPE meter_type AS ENUM ('individual', 'shared');
CREATE TYPE reading_type AS ENUM ('actual', 'estimated', 'opening');
CREATE TYPE cycle_status AS ENUM ('open', 'calculated', 'finalized', 'closed');
CREATE TYPE bill_status AS ENUM ('draft', 'unpaid', 'partial', 'paid', 'waived');
CREATE TYPE payment_method AS ENUM ('cash', 'bank_transfer', 'online', 'other');
CREATE TYPE notification_channel AS ENUM ('email', 'whatsapp', 'in_app');
CREATE TYPE notification_type AS ENUM ('bill_generated', 'payment_reminder', 'overdue', 'payment_confirmed', 'tenancy_approved', 'tenancy_rejected');
CREATE TYPE notification_status AS ENUM ('pending', 'sent', 'failed', 'skipped');
CREATE TYPE ticket_type AS ENUM ('complaint', 'recommendation', 'query');
CREATE TYPE ticket_status AS ENUM ('open', 'in_progress', 'resolved', 'closed');
CREATE TYPE audit_action AS ENUM (
  'INSERT', 'UPDATE', 'DELETE', 'SOFT_DELETE', 'RESTORE',
  'BILL_CALCULATE', 'BILL_RECALCULATE', 'BILL_FINALIZE',
  'CYCLE_OPEN', 'CYCLE_CLOSE',
  'TENANCY_APPROVE', 'TENANCY_REJECT', 'TENANCY_END',
  'PAYMENT_RECORD', 'PAYMENT_REVERSE'
);

-- ─── HELPER FUNCTION: updated_at trigger ─────────────────────

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ─── USERS ───────────────────────────────────────────────────

CREATE TABLE users (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  auth_id     UUID UNIQUE,                     -- Supabase Auth UID (null until verified)
  email       TEXT UNIQUE NOT NULL,
  full_name   TEXT NOT NULL,
  phone       TEXT,
  role        user_role NOT NULL DEFAULT 'tenant',
  is_active   BOOLEAN NOT NULL DEFAULT TRUE,
  deleted_at  TIMESTAMPTZ,                     -- soft delete
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER trg_users_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ─── BUILDINGS ───────────────────────────────────────────────

CREATE TABLE buildings (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name          TEXT NOT NULL,
  address       TEXT NOT NULL,
  city          TEXT NOT NULL,
  country       TEXT NOT NULL DEFAULT 'Saudi Arabia',
  billing_day   SMALLINT NOT NULL DEFAULT 1 CHECK (billing_day BETWEEN 1 AND 28),
  currency      TEXT NOT NULL DEFAULT 'SAR',
  is_active     BOOLEAN NOT NULL DEFAULT TRUE,
  deleted_at    TIMESTAMPTZ,
  created_by    UUID NOT NULL REFERENCES users(id),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER trg_buildings_updated_at
  BEFORE UPDATE ON buildings
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ─── FLATS ───────────────────────────────────────────────────

CREATE TABLE flats (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  building_id   UUID NOT NULL REFERENCES buildings(id) ON DELETE RESTRICT,
  flat_number   TEXT NOT NULL,
  floor         SMALLINT,
  area_sqm      NUMERIC(8,2),
  description   TEXT,
  status        flat_status NOT NULL DEFAULT 'available',
  is_active     BOOLEAN NOT NULL DEFAULT TRUE,
  deleted_at    TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (building_id, flat_number)
);

CREATE TRIGGER trg_flats_updated_at
  BEFORE UPDATE ON flats
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ─── TENANCIES ───────────────────────────────────────────────
-- Tracks the request and lifecycle of a tenant linked to a flat

CREATE TABLE tenancies (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  flat_id       UUID NOT NULL REFERENCES flats(id) ON DELETE RESTRICT,
  user_id       UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  status        tenancy_status NOT NULL DEFAULT 'pending',
  start_date    DATE,
  end_date      DATE,
  notes         TEXT,                          -- admin notes or rejection reason
  approved_by   UUID REFERENCES users(id),
  approved_at   TIMESTAMPTZ,
  rejected_by   UUID REFERENCES users(id),
  rejected_at   TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER trg_tenancies_updated_at
  BEFORE UPDATE ON tenancies
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Only one active tenancy per flat at a time
CREATE UNIQUE INDEX idx_tenancies_active_flat
  ON tenancies (flat_id)
  WHERE status = 'active';

-- Only one active tenancy per user at a time
CREATE UNIQUE INDEX idx_tenancies_active_user
  ON tenancies (user_id)
  WHERE status = 'active';

-- ─── METERS ──────────────────────────────────────────────────

CREATE TABLE meters (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  building_id   UUID NOT NULL REFERENCES buildings(id) ON DELETE RESTRICT,
  meter_number  TEXT NOT NULL,
  meter_type    meter_type NOT NULL DEFAULT 'individual',
  description   TEXT,
  unit          TEXT NOT NULL DEFAULT 'kWh',
  is_active     BOOLEAN NOT NULL DEFAULT TRUE,
  deleted_at    TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (building_id, meter_number)
);

CREATE TRIGGER trg_meters_updated_at
  BEFORE UPDATE ON meters
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ─── FLAT ↔ METER ASSIGNMENTS ────────────────────────────────

CREATE TABLE flat_meter_assignments (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  flat_id         UUID NOT NULL REFERENCES flats(id) ON DELETE RESTRICT,
  meter_id        UUID NOT NULL REFERENCES meters(id) ON DELETE RESTRICT,
  share_percent   NUMERIC(5,2) NOT NULL DEFAULT 100.00
                    CHECK (share_percent > 0 AND share_percent <= 100),
  effective_from  DATE NOT NULL,
  effective_to    DATE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER trg_flat_meter_assignments_updated_at
  BEFORE UPDATE ON flat_meter_assignments
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ─── TARIFF RATES ────────────────────────────────────────────

CREATE TABLE tariff_rates (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  building_id     UUID NOT NULL REFERENCES buildings(id) ON DELETE RESTRICT,
  rate_per_unit   NUMERIC(10,4) NOT NULL CHECK (rate_per_unit > 0),
  fixed_charge    NUMERIC(10,2) NOT NULL DEFAULT 0.00,
  effective_from  DATE NOT NULL,
  effective_to    DATE,
  notes           TEXT,
  created_by      UUID NOT NULL REFERENCES users(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── METER READINGS ──────────────────────────────────────────

CREATE TABLE meter_readings (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  meter_id              UUID NOT NULL REFERENCES meters(id) ON DELETE RESTRICT,
  reading_value         NUMERIC(12,3) NOT NULL CHECK (reading_value >= 0),
  reading_date          DATE NOT NULL,
  billing_period_year   SMALLINT NOT NULL CHECK (billing_period_year >= 2000),
  billing_period_month  SMALLINT NOT NULL CHECK (billing_period_month BETWEEN 1 AND 12),
  reading_type          reading_type NOT NULL DEFAULT 'actual',
  image_url             TEXT,
  recorded_by           UUID NOT NULL REFERENCES users(id),
  notes                 TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (meter_id, billing_period_year, billing_period_month)
);

CREATE TRIGGER trg_meter_readings_updated_at
  BEFORE UPDATE ON meter_readings
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ─── ELECTRICITY COMPANY BILLS ───────────────────────────────
-- The actual invoice received from the electricity provider

CREATE TABLE electricity_company_bills (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  building_id     UUID NOT NULL REFERENCES buildings(id) ON DELETE RESTRICT,
  bill_number     TEXT NOT NULL,
  period_year     SMALLINT NOT NULL,
  period_month    SMALLINT NOT NULL,
  total_amount    NUMERIC(12,2) NOT NULL,
  total_units     NUMERIC(12,3),
  due_date        DATE NOT NULL,
  paid_at         TIMESTAMPTZ,
  image_url       TEXT,
  notes           TEXT,
  created_by      UUID NOT NULL REFERENCES users(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (building_id, period_year, period_month)
);

CREATE TRIGGER trg_electricity_company_bills_updated_at
  BEFORE UPDATE ON electricity_company_bills
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ─── BILLING CYCLES ──────────────────────────────────────────

CREATE TABLE billing_cycles (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  building_id     UUID NOT NULL REFERENCES buildings(id) ON DELETE RESTRICT,
  period_year     SMALLINT NOT NULL,
  period_month    SMALLINT NOT NULL,
  status          cycle_status NOT NULL DEFAULT 'open',
  opened_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finalized_at    TIMESTAMPTZ,
  finalized_by    UUID REFERENCES users(id),
  closed_at       TIMESTAMPTZ,
  closed_by       UUID REFERENCES users(id),
  notes           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (building_id, period_year, period_month)
);

CREATE TRIGGER trg_billing_cycles_updated_at
  BEFORE UPDATE ON billing_cycles
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ─── FLAT BILLS ──────────────────────────────────────────────

CREATE TABLE flat_bills (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  billing_cycle_id      UUID NOT NULL REFERENCES billing_cycles(id) ON DELETE RESTRICT,
  flat_id               UUID NOT NULL REFERENCES flats(id) ON DELETE RESTRICT,
  tenancy_id            UUID NOT NULL REFERENCES tenancies(id) ON DELETE RESTRICT,
  version               SMALLINT NOT NULL DEFAULT 1,
  is_current_version    BOOLEAN NOT NULL DEFAULT TRUE,

  -- Consumption
  meter_id              UUID REFERENCES meters(id),
  opening_reading       NUMERIC(12,3),
  closing_reading       NUMERIC(12,3),
  units_consumed        NUMERIC(12,3) NOT NULL DEFAULT 0,
  share_percent         NUMERIC(5,2) NOT NULL DEFAULT 100.00,
  billed_units          NUMERIC(12,3) NOT NULL DEFAULT 0,

  -- Rate snapshot (immutable at time of billing)
  rate_per_unit         NUMERIC(10,4) NOT NULL,
  fixed_charge          NUMERIC(10,2) NOT NULL DEFAULT 0.00,
  tariff_rate_id        UUID REFERENCES tariff_rates(id),

  -- Amounts
  current_charges       NUMERIC(10,2) NOT NULL DEFAULT 0.00,
  previous_balance      NUMERIC(10,2) NOT NULL DEFAULT 0.00,
  total_due             NUMERIC(10,2) NOT NULL DEFAULT 0.00,
  amount_paid           NUMERIC(10,2) NOT NULL DEFAULT 0.00,
  outstanding_balance   NUMERIC(10,2) GENERATED ALWAYS AS (total_due - amount_paid) STORED,

  -- Status
  status                bill_status NOT NULL DEFAULT 'draft',
  due_date              DATE NOT NULL,
  paid_at               TIMESTAMPTZ,

  -- Audit trail
  calculation_log       JSONB NOT NULL DEFAULT '{}',
  calculated_by         UUID REFERENCES users(id),
  calculated_at         TIMESTAMPTZ,
  notes                 TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER trg_flat_bills_updated_at
  BEFORE UPDATE ON flat_bills
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE INDEX idx_flat_bills_current ON flat_bills (billing_cycle_id, flat_id)
  WHERE is_current_version = TRUE;

-- ─── PAYMENTS ────────────────────────────────────────────────

CREATE TABLE payments (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  bill_id         UUID NOT NULL REFERENCES flat_bills(id) ON DELETE RESTRICT,
  amount          NUMERIC(10,2) NOT NULL CHECK (amount > 0),
  payment_method  payment_method NOT NULL DEFAULT 'cash',
  reference_no    TEXT,
  paid_at         TIMESTAMPTZ NOT NULL,
  recorded_by     UUID NOT NULL REFERENCES users(id),
  notes           TEXT,
  is_reversed     BOOLEAN NOT NULL DEFAULT FALSE,
  reversed_at     TIMESTAMPTZ,
  reversed_by     UUID REFERENCES users(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER trg_payments_updated_at
  BEFORE UPDATE ON payments
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ─── COMPLAINTS / TICKETS ────────────────────────────────────

CREATE TABLE complaints (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  flat_id         UUID NOT NULL REFERENCES flats(id) ON DELETE RESTRICT,
  submitted_by    UUID NOT NULL REFERENCES users(id),
  type            ticket_type NOT NULL DEFAULT 'complaint',
  subject         TEXT NOT NULL,
  description     TEXT NOT NULL,
  status          ticket_status NOT NULL DEFAULT 'open',
  resolved_by     UUID REFERENCES users(id),
  resolved_at     TIMESTAMPTZ,
  resolution_note TEXT,
  deleted_at      TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER trg_complaints_updated_at
  BEFORE UPDATE ON complaints
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ─── NOTIFICATIONS ───────────────────────────────────────────

CREATE TABLE notifications (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id         UUID NOT NULL REFERENCES users(id),
  bill_id         UUID REFERENCES flat_bills(id),
  tenancy_id      UUID REFERENCES tenancies(id),
  channel         notification_channel NOT NULL DEFAULT 'in_app',
  type            notification_type NOT NULL,
  status          notification_status NOT NULL DEFAULT 'pending',
  title           TEXT NOT NULL,
  body            TEXT,
  scheduled_for   TIMESTAMPTZ,
  sent_at         TIMESTAMPTZ,
  read_at         TIMESTAMPTZ,
  error_message   TEXT,
  payload         JSONB,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_notifications_user ON notifications (user_id, read_at)
  WHERE read_at IS NULL;

-- ─── AUDIT LOGS ──────────────────────────────────────────────

CREATE TABLE audit_logs (
  id            BIGSERIAL PRIMARY KEY,
  entity_type   TEXT NOT NULL,
  entity_id     UUID,
  action        audit_action NOT NULL,
  actor_id      UUID REFERENCES users(id),
  actor_role    user_role,
  old_data      JSONB,
  new_data      JSONB,
  ip_address    INET,
  user_agent    TEXT,
  metadata      JSONB,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_audit_logs_entity ON audit_logs (entity_type, entity_id);
CREATE INDEX idx_audit_logs_actor ON audit_logs (actor_id, created_at);
CREATE INDEX idx_audit_logs_created ON audit_logs (created_at DESC);

-- ─── ROW LEVEL SECURITY ──────────────────────────────────────

ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE buildings ENABLE ROW LEVEL SECURITY;
ALTER TABLE flats ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenancies ENABLE ROW LEVEL SECURITY;
ALTER TABLE meters ENABLE ROW LEVEL SECURITY;
ALTER TABLE flat_meter_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE tariff_rates ENABLE ROW LEVEL SECURITY;
ALTER TABLE meter_readings ENABLE ROW LEVEL SECURITY;
ALTER TABLE electricity_company_bills ENABLE ROW LEVEL SECURITY;
ALTER TABLE billing_cycles ENABLE ROW LEVEL SECURITY;
ALTER TABLE flat_bills ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE complaints ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

-- Helper function: get current user's role
CREATE OR REPLACE FUNCTION current_user_role()
RETURNS user_role AS $$
  SELECT role FROM users WHERE auth_id = auth.uid()
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- Helper function: get current user's id
CREATE OR REPLACE FUNCTION current_user_id()
RETURNS UUID AS $$
  SELECT id FROM users WHERE auth_id = auth.uid()
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- Helper function: get active flat IDs for current tenant
CREATE OR REPLACE FUNCTION tenant_flat_ids()
RETURNS SETOF UUID AS $$
  SELECT flat_id FROM tenancies
  WHERE user_id = current_user_id() AND status = 'active'
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- USERS: admins see all, tenants see only themselves
CREATE POLICY users_admin_all ON users
  FOR ALL TO authenticated
  USING (current_user_role() = 'admin');

CREATE POLICY users_tenant_self ON users
  FOR SELECT TO authenticated
  USING (auth_id = auth.uid());

CREATE POLICY users_tenant_update_self ON users
  FOR UPDATE TO authenticated
  USING (auth_id = auth.uid());

-- BUILDINGS: admins all, tenants see buildings their flat is in
CREATE POLICY buildings_admin_all ON buildings
  FOR ALL TO authenticated
  USING (current_user_role() = 'admin');

CREATE POLICY buildings_tenant_read ON buildings
  FOR SELECT TO authenticated
  USING (
    current_user_role() = 'tenant' AND
    id IN (SELECT building_id FROM flats WHERE id IN (SELECT * FROM tenant_flat_ids()))
  );

-- Public read for buildings (for signup flat selection - tenants need to browse)
CREATE POLICY buildings_public_read ON buildings
  FOR SELECT TO authenticated
  USING (is_active = TRUE AND deleted_at IS NULL);

-- FLATS: admins all; tenants see available flats (for signup) + their own
CREATE POLICY flats_admin_all ON flats
  FOR ALL TO authenticated
  USING (current_user_role() = 'admin');

CREATE POLICY flats_tenant_available ON flats
  FOR SELECT TO authenticated
  USING (
    current_user_role() = 'tenant' AND
    is_active = TRUE AND
    deleted_at IS NULL AND
    (status = 'available' OR id IN (SELECT * FROM tenant_flat_ids()))
  );

-- TENANCIES: admins all; tenants see only their own
CREATE POLICY tenancies_admin_all ON tenancies
  FOR ALL TO authenticated
  USING (current_user_role() = 'admin');

CREATE POLICY tenancies_tenant_own ON tenancies
  FOR SELECT TO authenticated
  USING (current_user_role() = 'tenant' AND user_id = current_user_id());

CREATE POLICY tenancies_tenant_insert ON tenancies
  FOR INSERT TO authenticated
  WITH CHECK (current_user_role() = 'tenant' AND user_id = current_user_id());

-- METERS: admins all; tenants see meters for their flat
CREATE POLICY meters_admin_all ON meters
  FOR ALL TO authenticated
  USING (current_user_role() = 'admin');

CREATE POLICY meters_tenant_read ON meters
  FOR SELECT TO authenticated
  USING (
    current_user_role() = 'tenant' AND
    id IN (
      SELECT meter_id FROM flat_meter_assignments
      WHERE flat_id IN (SELECT * FROM tenant_flat_ids())
    )
  );

-- FLAT_METER_ASSIGNMENTS: admins all; tenants see their flat's
CREATE POLICY fma_admin_all ON flat_meter_assignments
  FOR ALL TO authenticated
  USING (current_user_role() = 'admin');

CREATE POLICY fma_tenant_read ON flat_meter_assignments
  FOR SELECT TO authenticated
  USING (current_user_role() = 'tenant' AND flat_id IN (SELECT * FROM tenant_flat_ids()));

-- TARIFF_RATES: admins all; tenants read
CREATE POLICY tariff_admin_all ON tariff_rates
  FOR ALL TO authenticated
  USING (current_user_role() = 'admin');

CREATE POLICY tariff_tenant_read ON tariff_rates
  FOR SELECT TO authenticated
  USING (current_user_role() = 'tenant');

-- METER_READINGS: admins all; tenants see their meter's readings
CREATE POLICY readings_admin_all ON meter_readings
  FOR ALL TO authenticated
  USING (current_user_role() = 'admin');

CREATE POLICY readings_tenant_read ON meter_readings
  FOR SELECT TO authenticated
  USING (
    current_user_role() = 'tenant' AND
    meter_id IN (
      SELECT meter_id FROM flat_meter_assignments
      WHERE flat_id IN (SELECT * FROM tenant_flat_ids())
    )
  );

-- ELECTRICITY_COMPANY_BILLS: admins only
CREATE POLICY ecb_admin_all ON electricity_company_bills
  FOR ALL TO authenticated
  USING (current_user_role() = 'admin');

-- BILLING_CYCLES: admins all; tenants read their building's
CREATE POLICY cycles_admin_all ON billing_cycles
  FOR ALL TO authenticated
  USING (current_user_role() = 'admin');

CREATE POLICY cycles_tenant_read ON billing_cycles
  FOR SELECT TO authenticated
  USING (
    current_user_role() = 'tenant' AND
    building_id IN (
      SELECT building_id FROM flats WHERE id IN (SELECT * FROM tenant_flat_ids())
    )
  );

-- FLAT_BILLS: admins all; tenants see only their own flat's current bills
CREATE POLICY bills_admin_all ON flat_bills
  FOR ALL TO authenticated
  USING (current_user_role() = 'admin');

CREATE POLICY bills_tenant_own ON flat_bills
  FOR SELECT TO authenticated
  USING (
    current_user_role() = 'tenant' AND
    flat_id IN (SELECT * FROM tenant_flat_ids()) AND
    is_current_version = TRUE
  );

-- PAYMENTS: admins all; tenants see their bill's payments
CREATE POLICY payments_admin_all ON payments
  FOR ALL TO authenticated
  USING (current_user_role() = 'admin');

CREATE POLICY payments_tenant_read ON payments
  FOR SELECT TO authenticated
  USING (
    current_user_role() = 'tenant' AND
    bill_id IN (
      SELECT id FROM flat_bills
      WHERE flat_id IN (SELECT * FROM tenant_flat_ids())
    )
  );

-- COMPLAINTS: admins all; tenants manage their own
CREATE POLICY complaints_admin_all ON complaints
  FOR ALL TO authenticated
  USING (current_user_role() = 'admin');

CREATE POLICY complaints_tenant_own ON complaints
  FOR SELECT TO authenticated
  USING (current_user_role() = 'tenant' AND submitted_by = current_user_id());

CREATE POLICY complaints_tenant_insert ON complaints
  FOR INSERT TO authenticated
  WITH CHECK (
    current_user_role() = 'tenant' AND
    submitted_by = current_user_id() AND
    flat_id IN (SELECT * FROM tenant_flat_ids())
  );

-- NOTIFICATIONS: users see their own
CREATE POLICY notifications_own ON notifications
  FOR SELECT TO authenticated
  USING (user_id = current_user_id());

CREATE POLICY notifications_admin_all ON notifications
  FOR ALL TO authenticated
  USING (current_user_role() = 'admin');

-- AUDIT_LOGS: admins only
CREATE POLICY audit_logs_admin_only ON audit_logs
  FOR SELECT TO authenticated
  USING (current_user_role() = 'admin');
