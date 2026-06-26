-- Sprint 3: per-flat-per-column formulas
-- Previously the app enforced (via application logic, not a DB constraint) at
-- most one ACTIVE formula per (flat_id, cycle-or-persistent) regardless of
-- formula_target — so a flat could only ever have ONE custom formula total,
-- even though 015 already widened formula_target to 7 possible columns.
-- This migration adds a real uniqueness guarantee scoped to formula_target so
-- a single flat can have, say, both a `consumption` formula and a
-- `previous_balance` formula active at the same time, while still preventing
-- two simultaneously-active formulas for the SAME flat+column+scope.
--
-- Postgres treats NULL as distinct in UNIQUE indexes, so a plain UNIQUE
-- constraint on (flat_id, cycle_id, formula_target) wouldn't actually stop
-- duplicate persistent (cycle_id IS NULL) rows. Two partial unique indexes —
-- one for persistent rows, one for cycle-specific rows — get this right.

CREATE UNIQUE INDEX IF NOT EXISTS uq_flat_bill_formulas_persistent
  ON flat_bill_formulas (flat_id, formula_target)
  WHERE is_active AND cycle_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_flat_bill_formulas_cycle
  ON flat_bill_formulas (flat_id, cycle_id, formula_target)
  WHERE is_active AND cycle_id IS NOT NULL;
