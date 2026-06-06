-- ============================================================
-- Seed Data: 2 buildings with sample flats, meters, tariffs
-- Run AFTER creating admin users through Supabase Auth
-- ============================================================

-- NOTE: Replace the UUIDs below with actual admin user IDs after
-- creating them through the auth flow. These are placeholder values.

DO $$
DECLARE
  v_admin_id UUID;
  v_building1_id UUID := uuid_generate_v4();
  v_building2_id UUID := uuid_generate_v4();
  v_flat_ids UUID[];
  v_meter_id UUID;
  i INTEGER;
BEGIN

  -- Use the first admin user found, or create a placeholder
  SELECT id INTO v_admin_id FROM users WHERE role = 'admin' LIMIT 1;

  IF v_admin_id IS NULL THEN
    RAISE NOTICE 'No admin user found. Please create an admin user first via the auth flow.';
    RETURN;
  END IF;

  -- ─── BUILDING 1: Al-Noor Residence ───────────────────────

  INSERT INTO buildings (id, name, address, city, billing_day, currency, created_by)
  VALUES (
    v_building1_id,
    'Al-Noor Residence',
    'King Fahd Road, Al-Olaya District',
    'Riyadh',
    1,
    'SAR',
    v_admin_id
  );

  -- Flats: 3 floors × 4 flats = 12 flats
  FOR floor_num IN 1..3 LOOP
    FOR flat_num IN 1..4 LOOP
      INSERT INTO flats (building_id, flat_number, floor, area_sqm, status)
      VALUES (
        v_building1_id,
        floor_num::TEXT || '0' || flat_num::TEXT,   -- e.g. 101, 102, 201
        floor_num,
        CASE flat_num
          WHEN 1 THEN 85.00
          WHEN 2 THEN 95.00
          WHEN 3 THEN 110.00
          WHEN 4 THEN 75.00
        END,
        'available'
      );
    END LOOP;
  END LOOP;

  -- Individual meters for each flat in building 1
  FOR floor_num IN 1..3 LOOP
    FOR flat_num IN 1..4 LOOP
      v_meter_id := uuid_generate_v4();
      INSERT INTO meters (id, building_id, meter_number, meter_type, description)
      VALUES (
        v_meter_id,
        v_building1_id,
        'NR-' || floor_num::TEXT || '0' || flat_num::TEXT,
        'individual',
        'Meter for flat ' || floor_num::TEXT || '0' || flat_num::TEXT
      );

      -- Assign meter to flat
      INSERT INTO flat_meter_assignments (flat_id, meter_id, share_percent, effective_from)
      SELECT f.id, v_meter_id, 100.00, CURRENT_DATE
      FROM flats f
      WHERE f.building_id = v_building1_id
        AND f.flat_number = floor_num::TEXT || '0' || flat_num::TEXT;
    END LOOP;
  END LOOP;

  -- Tariff for building 1
  INSERT INTO tariff_rates (building_id, rate_per_unit, fixed_charge, effective_from, notes, created_by)
  VALUES (v_building1_id, 0.18, 15.00, '2024-01-01', 'Standard residential rate 2024', v_admin_id);

  -- ─── BUILDING 2: Al-Salam Tower ──────────────────────────

  INSERT INTO buildings (id, name, address, city, billing_day, currency, created_by)
  VALUES (
    v_building2_id,
    'Al-Salam Tower',
    'Prince Mohammad Bin Abdulaziz Road, Al-Hamra',
    'Jeddah',
    5,
    'SAR',
    v_admin_id
  );

  -- Flats: 5 floors × 3 flats = 15 flats
  FOR floor_num IN 1..5 LOOP
    FOR flat_num IN 1..3 LOOP
      INSERT INTO flats (building_id, flat_number, floor, area_sqm, status)
      VALUES (
        v_building2_id,
        floor_num::TEXT || '0' || flat_num::TEXT,
        floor_num,
        CASE flat_num
          WHEN 1 THEN 120.00
          WHEN 2 THEN 140.00
          WHEN 3 THEN 100.00
        END,
        'available'
      );
    END LOOP;
  END LOOP;

  -- Individual meters for each flat in building 2
  FOR floor_num IN 1..5 LOOP
    FOR flat_num IN 1..3 LOOP
      v_meter_id := uuid_generate_v4();
      INSERT INTO meters (id, building_id, meter_number, meter_type, description)
      VALUES (
        v_meter_id,
        v_building2_id,
        'ST-' || floor_num::TEXT || '0' || flat_num::TEXT,
        'individual',
        'Meter for flat ' || floor_num::TEXT || '0' || flat_num::TEXT
      );

      INSERT INTO flat_meter_assignments (flat_id, meter_id, share_percent, effective_from)
      SELECT f.id, v_meter_id, 100.00, CURRENT_DATE
      FROM flats f
      WHERE f.building_id = v_building2_id
        AND f.flat_number = floor_num::TEXT || '0' || flat_num::TEXT;
    END LOOP;
  END LOOP;

  -- Tariff for building 2
  INSERT INTO tariff_rates (building_id, rate_per_unit, fixed_charge, effective_from, notes, created_by)
  VALUES (v_building2_id, 0.20, 20.00, '2024-01-01', 'Standard residential rate 2024', v_admin_id);

  RAISE NOTICE 'Seed data inserted successfully.';
  RAISE NOTICE 'Building 1 (Al-Noor Residence) ID: %', v_building1_id;
  RAISE NOTICE 'Building 2 (Al-Salam Tower) ID: %', v_building2_id;

END $$;
