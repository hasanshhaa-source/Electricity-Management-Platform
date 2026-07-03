-- Sprint 2 (v2 plan): spreadsheet-style sheet/cell persistence per billing cycle.
-- Each billing cycle gets one cycle_sheet, which holds many sheet_cells.
-- Buildings store a sheet_cell_formulas template so formulas carry forward
-- automatically into every new cycle's sheet.

-- ─── cycle_sheets ──────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS cycle_sheets (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cycle_id     UUID NOT NULL REFERENCES billing_cycles(id) ON DELETE CASCADE,
  published_at TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (cycle_id)
);

ALTER TABLE cycle_sheets ENABLE ROW LEVEL SECURITY;

CREATE POLICY cycle_sheets_admin_all ON cycle_sheets
  FOR ALL USING (current_user_role() = 'admin');

CREATE INDEX idx_cycle_sheets_cycle ON cycle_sheets (cycle_id);

-- ─── sheet_cells ───────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS sheet_cells (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sheet_id        UUID NOT NULL REFERENCES cycle_sheets(id) ON DELETE CASCADE,
  cell_name       TEXT NOT NULL,
  formula_text    TEXT,
  literal_value   NUMERIC,
  computed_value  NUMERIC,
  is_input        BOOLEAN NOT NULL DEFAULT false,
  display_order   INT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (sheet_id, cell_name),
  CHECK (
    (formula_text IS NOT NULL AND literal_value IS NULL) OR
    (formula_text IS NULL)
  )
);

ALTER TABLE sheet_cells ENABLE ROW LEVEL SECURITY;

CREATE POLICY sheet_cells_admin_all ON sheet_cells
  FOR ALL USING (current_user_role() = 'admin');

CREATE INDEX idx_sheet_cells_sheet ON sheet_cells (sheet_id);

-- ─── sheet_cell_formulas (building-level template for carry-forward) ───────────

CREATE TABLE IF NOT EXISTS sheet_cell_formulas (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  building_id  UUID NOT NULL REFERENCES buildings(id) ON DELETE CASCADE,
  cell_name    TEXT NOT NULL,
  formula_text TEXT NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (building_id, cell_name)
);

ALTER TABLE sheet_cell_formulas ENABLE ROW LEVEL SECURITY;

CREATE POLICY sheet_cell_formulas_admin_all ON sheet_cell_formulas
  FOR ALL USING (current_user_role() = 'admin');

CREATE INDEX idx_sheet_cell_formulas_building ON sheet_cell_formulas (building_id);
