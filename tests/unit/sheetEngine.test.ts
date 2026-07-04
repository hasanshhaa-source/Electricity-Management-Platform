import { describe, it, expect } from 'vitest';
import {
  evaluateSheet, evaluateCell, lit, formula, SheetEngineError, type Sheet,
} from '@/lib/billing/sheetEngine';

describe('sheetEngine', () => {
  describe('basic evaluation', () => {
    it('evaluates literal and formula cells, referencing other cells by bare colon-identifier', () => {
      const sheet: Sheet = {
        'flat:1:consumption': lit(50),
        'flat:1:rate':        lit(5),
        'flat:1:bill':        formula('flat:1:consumption * flat:1:rate'),
      };
      const { values } = evaluateSheet(sheet);
      expect(values['flat:1:bill']).toBe(250);
    });

    it('resolves a single cell on demand via evaluateCell', () => {
      const sheet: Sheet = {
        'flat:1:a': lit(2),
        'flat:1:b': formula('flat:1:a * 10'),
      };
      expect(evaluateCell(sheet, 'flat:1:b')).toBe(20);
    });

    it('supports IF(), arithmetic, and comparisons', () => {
      const sheet: Sheet = {
        'flat:1:x': lit(10),
        'flat:1:y': formula("IF(flat:1:x > 5, 100, 0)"),
      };
      expect(evaluateSheet(sheet).values['flat:1:y']).toBe(100);
    });
  });

  describe('circular reference detection', () => {
    it('throws a clear error naming the cycle', () => {
      const sheet: Sheet = {
        'flat:23:bill':              formula('bill:1:remaining_cost + 1'),
        'bill:1:remaining_cost':     formula('flat:23:bill - 1'),
      };
      expect(() => evaluateSheet(sheet)).toThrow(SheetEngineError);
      try {
        evaluateSheet(sheet);
        expect.fail('should have thrown');
      } catch (err) {
        expect((err as Error).message).toMatch(/^Circular reference: /);
        expect((err as Error).message).toContain('flat:23:bill');
        expect((err as Error).message).toContain('bill:1:remaining_cost');
      }
    });

    it('does not infinite loop on a longer cycle', () => {
      const sheet: Sheet = {
        'a:1:x': formula('a:1:y'),
        'a:1:y': formula('a:1:z'),
        'a:1:z': formula('a:1:x'),
      };
      expect(() => evaluateSheet(sheet)).toThrow(/Circular reference: a:1:x -> a:1:y -> a:1:z -> a:1:x/);
    });
  });

  describe('unknown cell reference detection', () => {
    it('throws a clear error naming the missing cell and the referencing formula', () => {
      const sheet: Sheet = {
        'flat:1:bill': formula('flat:99:bill + 1'),
      };
      expect(() => evaluateSheet(sheet)).toThrow(
        "Unknown cell reference 'flat:99:bill' in formula for 'flat:1:bill'",
      );
    });
  });

  describe('AVG_OTHER_FLATS / SUM_OTHER_FLATS aggregates', () => {
    it('averages/sums the given field across all flats except the excluded one', () => {
      const sheet: Sheet = {
        'flat:21:consumption': lit(50),
        'flat:22:consumption': lit(40),
        'flat:23:consumption': lit(999), // excluded
        'flat:24:consumption': lit(5),
        'flat:25:avg_others':  formula("AVG_OTHER_FLATS('consumption', 25)"),
        'flat:25:sum_others':  formula("SUM_OTHER_FLATS('consumption', 25)"),
      };
      const { values } = evaluateSheet(sheet);
      // flats 21,22,23,24 (25 excludes itself too, but 25 has no consumption cell here)
      expect(values['flat:25:sum_others']).toBe(50 + 40 + 999 + 5);
      expect(values['flat:25:avg_others']).toBeCloseTo((50 + 40 + 999 + 5) / 4, 10);
    });

    it('resolves through the dependency graph, not just literals', () => {
      const sheet: Sheet = {
        'flat:1:base':        lit(10),
        'flat:1:consumption': formula('flat:1:base * 2'), // formula-derived, still picked up
        'flat:2:consumption': lit(30),
        'flat:3:avg':         formula("AVG_OTHER_FLATS('consumption', 3)"),
      };
      const { values } = evaluateSheet(sheet);
      expect(values['flat:3:avg']).toBeCloseTo((20 + 30) / 2, 10);
    });
  });

  describe('vacant-exclusion aggregates (AVG_NONVACANT_FLATS / SUM_NONVACANT_FLATS / COUNT_NONVACANT_FLATS)', () => {
    it('excludes vacant flats and the explicitly-excluded flat from the divisor', () => {
      const sheet: Sheet = {
        'flat:21:consumption': lit(50), 'flat:21:vacant': lit(0),
        'flat:22:consumption': lit(40), 'flat:22:vacant': lit(0),
        'flat:23:consumption': lit(999), 'flat:23:vacant': lit(0), // excluded explicitly
        'flat:24:consumption': lit(5),   'flat:24:vacant': lit(1), // vacant -> excluded
        'flat:25:consumption': lit(30),  'flat:25:vacant': lit(0),
        'flat:25:avg_nonvacant':   formula("AVG_NONVACANT_FLATS('consumption', 23)"),
        'flat:25:sum_nonvacant':   formula("SUM_NONVACANT_FLATS('consumption', 23)"),
        'flat:25:count_nonvacant': formula('COUNT_NONVACANT_FLATS(23)'),
      };
      const { values } = evaluateSheet(sheet);
      // occupied, non-23 flats: 21, 22, 25 (24 is vacant; 23 explicitly excluded; 25 includes itself)
      expect(values['flat:25:count_nonvacant']).toBe(3);
      expect(values['flat:25:sum_nonvacant']).toBe(50 + 40 + 30);
      expect(values['flat:25:avg_nonvacant']).toBeCloseTo((50 + 40 + 30) / 3, 10);
    });
  });

  // ───────────────────────────────────────────────────────────────────────────────
  // Full 8-step acceptance scenario
  // ───────────────────────────────────────────────────────────────────────────────
  //
  // Flats: 21, 22 (normal), 23 (dedicated-bill flat), 24 (vacant), 25 (meter-error flat).
  // Bills: bill:1 (split with flat 23 + owner), bill:2 (ordinary company bill, untouched).
  //
  // Readings -> consumption (current - previous):
  //   flat 21: 150 - 100 = 50
  //   flat 22: 220 - 180 = 40
  //   flat 23: 90  - 50  = 40   (dedicated-bill flat)
  //   flat 24: 60  - 55  = 5    (vacant)
  //   flat 25: meter error -> raw reading is unreliable, literal consumption cell is left
  //            at 0 and the POOL calculation instead substitutes AVG_OTHER_FLATS (step 5)
  //
  //   bill:1 cost = 1000, consumption = 200
  //   bill:2 cost = 300,  consumption = 60   (ordinary bill, fully in the pool, untouched by the split)
  //
  // Step 2 (flat 23 dedicated bill):
  //   flat23_bill = flat23_consumption * (bill1_cost / bill1_consumption) = 40 * (1000/200) = 40 * 5 = 200
  //
  // Step 3 (subtract flat 23 out of bill 1):
  //   bill1_remaining_cost        = 1000 - 200 = 800
  //   bill1_remaining_consumption = 200  - 40  = 160
  //
  // Step 4 (split the remainder in half — pool half vs owner half):
  //   pool_share (cost)        = 800 / 2 = 400
  //   pool_share (consumption) = 160 / 2 = 80
  //   owner_share (cost)       = 800 - 400 = 400   <- owner's final, fixed bill
  //
  // Step 5 (error correction for flat 25, pool calc only):
  //   corrected_consumption_25 = AVG_OTHER_FLATS('consumption', 25) over {21,22,24}
  //                            = (50 + 40 + 5) / 3 = 31.666666...
  //   (flat 23 has no `flat:23:consumption` in the *pool* candidate set in this design
  //    because the aggregate only iterates flats that exist as `flat:N:consumption` cells;
  //    we still WANT flat 23 excluded from this average per the scenario text "all OTHER
  //    flats" in context meaning the other POOL flats — so flat 23's consumption cell is
  //    deliberately given a distinct name `flat:23:dedicated_consumption` instead of
  //    `flat:23:consumption`, keeping it out of the pool flat-number set entirely. This
  //    is a deliberate modeling choice, documented here and in the final report.)
  //
  // Step 6 (pool totals and rate):
  //   total_pool_cost        = bill1_pool_share_cost (400) + bill2_cost (300) = 700
  //   total_pool_consumption = bill1_pool_share_cons (80)  + bill2_cons (60)  = 140
  //   pool_rate = 700 / 140 = 5
  //   flat21_pool_bill = 50          * 5 = 250
  //   flat22_pool_bill = 40          * 5 = 200
  //   flat24_pool_bill = 5           * 5 = 25      (vacant, still gets a pool bill in step 6;
  //                                                  it's EXCLUDED only from the step-7 divisor,
  //                                                  not from having its own consumption billed)
  //   flat25_pool_bill = 31.66666... * 5 = 158.333333...
  //
  // Step 7 (reconciliation against the pool total — see ambiguity resolution below):
  //   sum_of_pool_flat_bills = 250 + 200 + 25 + 158.333333... = 633.333333...
  //   discrepancy = (bill1_pool_share_cost + bill2_cost) - sum_of_pool_flat_bills
  //               = 700 - 633.333333... = 66.666666...
  //   Divisor = occupied, non-vacant, non-flat-23 flats = {21, 22, 25} (24 excluded: vacant)
  //   share_per_flat = 66.666666... / 3 = 22.222222...
  //   flat21_final = 250           + 22.222222... = 272.222222...
  //   flat22_final = 200           + 22.222222... = 222.222222...
  //   flat24_final = 25            + 0            = 25            (vacant: excluded, gets zero adjustment)
  //   flat25_final = 158.333333... + 22.222222... = 180.555555...
  //
  // Step 8 (flat 23 and owner are final/fixed, untouched by reconciliation):
  //   flat23_final = 200
  //   owner_final  = 400
  //
  // Sanity check: 272.222222... + 222.222222... + 25 + 180.555555... + 200 + 400 = 1300.000000
  //   == bill1_cost (1000) + bill2_cost (300) == grand total of all real company bills. ✓
  //
  // ─── Ambiguity resolution (step 7) ───────────────────────────────────────────────
  // The prompt flags an ambiguity in what "actual total of all company bills" means for
  // the discrepancy comparison. We adopt the suggested interpretation explicitly:
  //   discrepancy = (bill1_remaining_cost_pool_half + sum_of_other_bills_cost)
  //                 - sum_of_computed_pool_flat_bills
  // i.e. reconcile ONLY against the POOL total (not the grand total including flat 23 and
  // the owner's half), because flat 23 and the owner's bill are already EXACTLY settled by
  // construction in steps 2-4 (no rounding or estimation occurs there) — including them in
  // the step-7 comparison would reconcile a difference that doesn't exist on their side and
  // would incorrectly perturb their fixed, final bills. The only real source of drift is
  // within the pool (rounding + the AVG-substitution for the error-flagged meter), so the
  // reconciliation is scoped to exactly that pool.

  describe('full 8-step billing scenario', () => {
    function buildSheet(): Sheet {
      return {
        // ── Step 1: raw readings -> consumption ──────────────────────────────────
        'flat:21:previous_reading': lit(100), 'flat:21:current_reading': lit(150),
        'flat:21:consumption':      formula('flat:21:current_reading - flat:21:previous_reading'),
        'flat:21:vacant':           lit(0),

        'flat:22:previous_reading': lit(180), 'flat:22:current_reading': lit(220),
        'flat:22:consumption':      formula('flat:22:current_reading - flat:22:previous_reading'),
        'flat:22:vacant':           lit(0),

        // Flat 23 is the dedicated-bill flat. Its consumption cell is deliberately named
        // `dedicated_consumption` (not `consumption`) so it is excluded from the pool
        // flat-number candidate set used by the AVG_OTHER_FLATS aggregate in step 5 —
        // see the modeling note above.
        'flat:23:previous_reading':     lit(50), 'flat:23:current_reading': lit(90),
        'flat:23:dedicated_consumption': formula('flat:23:current_reading - flat:23:previous_reading'),
        'flat:23:vacant':               lit(0),

        'flat:24:previous_reading': lit(55), 'flat:24:current_reading': lit(60),
        'flat:24:consumption':      formula('flat:24:current_reading - flat:24:previous_reading'),
        'flat:24:vacant':           lit(1), // vacant flag

        // Flat 25 has a flagged meter error: its raw reading is unreliable, so its
        // `consumption` cell is left at a literal 0 and is NOT used for the pool bill —
        // `pool_consumption` (below) substitutes the AVG_OTHER_FLATS-corrected value instead.
        'flat:25:meter_error':  lit(1),
        'flat:25:consumption':  lit(0),
        'flat:25:vacant':       lit(0),
        'flat:25:pool_consumption': formula(
          "IF(flat:25:meter_error, AVG_OTHER_FLATS('consumption', 25), flat:25:consumption)",
        ),

        // ── Company bills ─────────────────────────────────────────────────────────
        'bill:1:cost':        lit(1000),
        'bill:1:consumption': lit(200),
        'bill:2:cost':        lit(300),
        'bill:2:consumption': lit(60),

        // ── Step 2: flat 23 dedicated bill ────────────────────────────────────────
        'flat:23:bill': formula('flat:23:dedicated_consumption * (bill:1:cost / bill:1:consumption)'),

        // ── Step 3: subtract flat 23 out of bill 1 ────────────────────────────────
        'bill:1:remaining_cost':        formula('bill:1:cost - flat:23:bill'),
        'bill:1:remaining_consumption': formula('bill:1:consumption - flat:23:dedicated_consumption'),

        // ── Step 4: split the remainder — half to pool, half to owner ────────────
        'bill:1:pool_share_cost':        formula('bill:1:remaining_cost / 2'),
        'bill:1:pool_share_consumption': formula('bill:1:remaining_consumption / 2'),
        'owner:bill':                    formula('bill:1:remaining_cost - bill:1:pool_share_cost'),

        // ── Step 6: pool totals and rate (other company bills included in full) ──
        'pool:total_cost':        formula('bill:1:pool_share_cost + bill:2:cost'),
        'pool:total_consumption': formula('bill:1:pool_share_consumption + bill:2:consumption'),
        'pool:rate':              formula('pool:total_cost / pool:total_consumption'),

        'flat:21:pool_bill': formula('flat:21:consumption * pool:rate'),
        'flat:22:pool_bill': formula('flat:22:consumption * pool:rate'),
        'flat:24:pool_bill': formula('flat:24:consumption * pool:rate'), // vacant, still billed for its own usage
        'flat:25:pool_bill': formula('flat:25:pool_consumption * pool:rate'),

        // ── Step 7: reconciliation ─────────────────────────────────────────────────
        'pool:sum_of_flat_bills': formula(
          'flat:21:pool_bill + flat:22:pool_bill + flat:24:pool_bill + flat:25:pool_bill',
        ),
        'pool:discrepancy': formula('pool:total_cost - pool:sum_of_flat_bills'),
        'pool:reconciliation_divisor_count': formula('COUNT_NONVACANT_FLATS(23)'),
        'pool:reconciliation_share': formula('pool:discrepancy / pool:reconciliation_divisor_count'),

        'flat:21:adjustment': formula('IF(flat:21:vacant, 0, pool:reconciliation_share)'),
        'flat:22:adjustment': formula('IF(flat:22:vacant, 0, pool:reconciliation_share)'),
        'flat:24:adjustment': formula('IF(flat:24:vacant, 0, pool:reconciliation_share)'),
        'flat:25:adjustment': formula('IF(flat:25:vacant, 0, pool:reconciliation_share)'),

        'flat:21:final_bill': formula('flat:21:pool_bill + flat:21:adjustment'),
        'flat:22:final_bill': formula('flat:22:pool_bill + flat:22:adjustment'),
        'flat:24:final_bill': formula('flat:24:pool_bill + flat:24:adjustment'),
        'flat:25:final_bill': formula('flat:25:pool_bill + flat:25:adjustment'),

        // ── Step 8: flat 23 and owner bills are final/fixed (no further formula) ──
        'flat:23:final_bill': formula('flat:23:bill'),
        'owner:final_bill':   formula('owner:bill'),
      };
    }

    it('computes every intermediate quantity exactly as hand-calculated', () => {
      const { values } = evaluateSheet(buildSheet());

      // Step 1
      expect(values['flat:21:consumption']).toBe(50);
      expect(values['flat:22:consumption']).toBe(40);
      expect(values['flat:23:dedicated_consumption']).toBe(40);
      expect(values['flat:24:consumption']).toBe(5);

      // Step 2
      expect(values['flat:23:bill']).toBe(200);

      // Step 3
      expect(values['bill:1:remaining_cost']).toBe(800);
      expect(values['bill:1:remaining_consumption']).toBe(160);

      // Step 4
      expect(values['bill:1:pool_share_cost']).toBe(400);
      expect(values['bill:1:pool_share_consumption']).toBe(80);
      expect(values['owner:bill']).toBe(400);

      // Step 5
      expect(values['flat:25:pool_consumption']).toBeCloseTo(31.666666666666668, 9);

      // Step 6
      expect(values['pool:total_cost']).toBe(700);
      expect(values['pool:total_consumption']).toBe(140);
      expect(values['pool:rate']).toBe(5);
      expect(values['flat:21:pool_bill']).toBe(250);
      expect(values['flat:22:pool_bill']).toBe(200);
      expect(values['flat:24:pool_bill']).toBe(25);
      expect(values['flat:25:pool_bill']).toBeCloseTo(158.33333333333334, 9);

      // Step 7
      expect(values['pool:sum_of_flat_bills']).toBeCloseTo(633.3333333333334, 9);
      expect(values['pool:discrepancy']).toBeCloseTo(66.66666666666663, 9);
      expect(values['pool:reconciliation_divisor_count']).toBe(3);
      expect(values['pool:reconciliation_share']).toBeCloseTo(22.22222222222221, 9);

      expect(values['flat:24:adjustment']).toBe(0); // vacant -> excluded
      expect(values['flat:21:adjustment']).toBeCloseTo(22.22222222222221, 9);
      expect(values['flat:22:adjustment']).toBeCloseTo(22.22222222222221, 9);
      expect(values['flat:25:adjustment']).toBeCloseTo(22.22222222222221, 9);

      // Final bills — every flat and the owner
      expect(values['flat:21:final_bill']).toBeCloseTo(272.22222222222223, 9);
      expect(values['flat:22:final_bill']).toBeCloseTo(222.2222222222222, 9);
      expect(values['flat:24:final_bill']).toBe(25); // vacant: pool bill only, zero adjustment
      expect(values['flat:25:final_bill']).toBeCloseTo(180.55555555555554, 9);
      expect(values['flat:23:final_bill']).toBe(200);
      expect(values['owner:final_bill']).toBe(400);

      // Grand-total sanity check: sum of every final bill must equal the true total of
      // all real company bills (bill 1 + bill 2), since flat23/owner are exact and the
      // pool reconciliation makes the pool flats' bills sum exactly to the pool total.
      const grandTotal =
        values['flat:21:final_bill'] + values['flat:22:final_bill'] +
        values['flat:23:final_bill'] + values['flat:24:final_bill'] +
        values['flat:25:final_bill'] + values['owner:final_bill'];
      expect(grandTotal).toBeCloseTo(1300, 9);
      expect(grandTotal).toBeCloseTo(values['bill:1:cost'] + values['bill:2:cost'], 9);
    });
  });

  describe('multi-flat exclusion', () => {
    it('AVG_OTHER_FLATS excludes multiple flat numbers', () => {
      const sheet: Sheet = {
        'flat:1:consumption':  lit(100),
        'flat:2:consumption':  lit(0),   // secondary / zeroed-out
        'flat:3:consumption':  lit(0),   // secondary / zeroed-out
        'flat:4:consumption':  lit(200),
        'flat:16:consumption': formula("AVG_OTHER_FLATS('consumption', 2, 3, 16)"),
      };
      // Only flats 1 and 4 are included; avg = (100 + 200) / 2 = 150
      const { values } = evaluateSheet(sheet);
      expect(values['flat:16:consumption']).toBe(150);
    });

    it('SUM_OTHER_FLATS excludes multiple flat numbers', () => {
      const sheet: Sheet = {
        'flat:1:consumption': lit(100),
        'flat:2:consumption': lit(0),
        'flat:3:consumption': lit(50),
        'flat:4:consumption': lit(200),
        'flat:5:consumption': formula("SUM_OTHER_FLATS('consumption', 2, 5)"),
      };
      // Flats 1, 3, 4 included; sum = 350
      const { values } = evaluateSheet(sheet);
      expect(values['flat:5:consumption']).toBe(350);
    });

    it('single exclusion still works after refactor', () => {
      const sheet: Sheet = {
        'flat:1:consumption': lit(100),
        'flat:2:consumption': lit(200),
        'flat:3:consumption': formula("AVG_OTHER_FLATS('consumption', 3)"),
      };
      // Only flats 1 and 2; avg = 150
      const { values } = evaluateSheet(sheet);
      expect(values['flat:3:consumption']).toBe(150);
    });
  });
});
