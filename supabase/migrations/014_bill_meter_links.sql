-- Sprint: Bill-to-meter linking
-- Lets an admin link each company bill to the specific meter(s) it covers, so
-- the calculation engine can price each bill's consumption independently
-- instead of pooling every bill for the building/period into one shared rate.
-- A bill can instead be linked directly to one flat as a lump sum (e.g. an
-- owner-absorbed cost for a vacant flat or common-area expense) — this bypasses
-- consumption math and difference reconciliation entirely for that bill.
--
-- A meter may only be linked to one bill per billing cycle (enforced at the
-- application layer, since a meter's "current" bill depends on the cycle it's
-- being billed in, not a fixed relationship).

CREATE TABLE IF NOT EXISTS company_bill_meters (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_bill_id UUID NOT NULL REFERENCES electricity_company_bills(id) ON DELETE CASCADE,
  meter_id        UUID NOT NULL REFERENCES meters(id) ON DELETE CASCADE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (company_bill_id, meter_id)
);

CREATE INDEX IF NOT EXISTS idx_company_bill_meters_bill  ON company_bill_meters(company_bill_id);
CREATE INDEX IF NOT EXISTS idx_company_bill_meters_meter ON company_bill_meters(meter_id);

ALTER TABLE company_bill_meters ENABLE ROW LEVEL SECURITY;

CREATE POLICY company_bill_meters_admin_all ON company_bill_meters
  FOR ALL TO authenticated
  USING (current_user_role() = 'admin');

-- Lump-sum link: bill the full amount directly to one flat, bypassing
-- consumption-based proration. Mutually exclusive with linking meters
-- (enforced at the application layer).
ALTER TABLE electricity_company_bills
  ADD COLUMN IF NOT EXISTS billed_to_flat_id UUID REFERENCES flats(id);

CREATE INDEX IF NOT EXISTS idx_ecb_billed_to_flat ON electricity_company_bills(billed_to_flat_id);

-- Formula target: whether a flat's custom formula overrides the whole base
-- bill (legacy default) or only the consumption value, leaving the normal
-- rate/difference math to run on top of the overridden consumption.
ALTER TABLE flat_bill_formulas
  ADD COLUMN IF NOT EXISTS formula_target TEXT NOT NULL DEFAULT 'base_bill'
    CHECK (formula_target IN ('base_bill', 'consumption'));
