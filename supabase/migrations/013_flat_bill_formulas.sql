-- Sprint: Custom bill calculation formulas
-- Lets an admin attach a custom Excel-like formula to a flat (optionally scoped
-- to one meter) that overrides the default consumption/base-bill calculation
-- for that flat. A formula with cycle_id = NULL is persistent (applies to every
-- future cycle); one with cycle_id set is a one-off override for that cycle only.
-- Cycle-specific formulas take priority over persistent ones for the same flat.

CREATE TABLE IF NOT EXISTS flat_bill_formulas (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  flat_id       UUID NOT NULL REFERENCES flats(id) ON DELETE CASCADE,
  meter_id      UUID REFERENCES meters(id) ON DELETE CASCADE,
  cycle_id      UUID REFERENCES billing_cycles(id) ON DELETE CASCADE,
  formula_text  TEXT NOT NULL,
  is_active     BOOLEAN NOT NULL DEFAULT TRUE,
  created_by    UUID REFERENCES users(id),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_flat_bill_formulas_flat  ON flat_bill_formulas(flat_id);
CREATE INDEX IF NOT EXISTS idx_flat_bill_formulas_cycle ON flat_bill_formulas(cycle_id);

ALTER TABLE flat_bills
  ADD COLUMN IF NOT EXISTS excluded_from_residual BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE flat_bill_formulas ENABLE ROW LEVEL SECURITY;

CREATE POLICY flat_bill_formulas_admin_all ON flat_bill_formulas
  FOR ALL TO authenticated
  USING (current_user_role() = 'admin');
