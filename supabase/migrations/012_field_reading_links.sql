-- Sprint: Field meter-reading links
-- Lets an admin generate a no-login shareable link per billing cycle so a
-- field worker can submit meter readings from their phone without an
-- admin account. The token is only ever resolved server-side with the
-- service-role client, so no new RLS policy is needed for anonymous access.

ALTER TABLE billing_cycles
  ADD COLUMN IF NOT EXISTS field_token             TEXT UNIQUE,
  ADD COLUMN IF NOT EXISTS field_token_enabled      BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS field_token_created_by   UUID REFERENCES users(id),
  ADD COLUMN IF NOT EXISTS field_token_created_at   TIMESTAMPTZ;
