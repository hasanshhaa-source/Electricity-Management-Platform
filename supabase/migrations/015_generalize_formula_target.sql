-- Sprint: Unified per-cell formula system (Sprint 1)
-- Generalizes flat_bill_formulas.formula_target from the original two-value
-- set ('base_bill', 'consumption') to cover every billing cell that a custom
-- formula may eventually override. No new targets are wired up to the
-- calculation engine yet (that lands in Sprint 2+) — this migration only
-- widens the column's allowed values so later sprints aren't blocked on a
-- schema change.

ALTER TABLE flat_bill_formulas
  DROP CONSTRAINT IF EXISTS flat_bill_formulas_formula_target_check;

ALTER TABLE flat_bill_formulas
  ADD CONSTRAINT flat_bill_formulas_formula_target_check
    CHECK (formula_target IN (
      'base_bill',
      'consumption',
      'rate_per_unit',
      'adjustment',
      'previous_balance',
      'lump_sum',
      'total_due'
    ));
