const express = require('express');

const router = express.Router();

const { query } = require('../db');

const {
  auth,
  requireRole,
} = require('../middleware/auth');

router.use(auth);

/*
|--------------------------------------------------------------------------
| GET ALL BENEFICIARY VALIDATION HISTORY
|--------------------------------------------------------------------------
| Includes Approved and Rejected regular and calamity records.
*/
router.get(
  '/beneficiary-validation',
  requireRole('admin', 'captain', 'staff'),
  async (req, res) => {
    try {
      const result = await query(`
        -- REGULAR BENEFICIARY RECORDS
        SELECT
          bv.validation_id::text AS validation_id,
          bv.household_id,
          bv.program_id,
          bv.validation_status,
          bv.submitted_by,
          bv.submitted_at,
          bv.approved_by,
          bv.approved_at,
          bv.remarks,

          h.household_head_name,
          h.purok,
          h.address,
          h.vulnerability,

          ap.program_name,
          ap.description,
          ap.eligibility_rules,

          u.full_name AS approved_by_name,

          'Regular' AS record_type,

          NULL AS risk_level,
          NULL AS house_type,
          NULL AS roof_damage,
          NULL AS wall_damage,
          NULL AS flooding_level,
          NULL AS damage_risk

        FROM beneficiary_validation bv

        INNER JOIN households h
          ON h.household_id = bv.household_id

        INNER JOIN assistance_programs ap
          ON ap.program_id = bv.program_id

        LEFT JOIN users u
          ON u.user_id = bv.approved_by

        WHERE LOWER(TRIM(COALESCE(bv.validation_status, ''))) IN (
          'approved',
          'rejected'
        )

        UNION ALL

        -- CALAMITY BENEFICIARY RECORDS
        SELECT
          ('calamity-' || cp.calamity_id::text) AS validation_id,
          cp.household_id,
          cp.program_id,
          cp.status AS validation_status,

          NULL AS submitted_by,
          cp.created_at AS submitted_at,

          cp.approved_by,
          cp.approved_at,
          cp.rejection_reason AS remarks,

          h.household_head_name,
          h.purok,
          h.address,
          h.vulnerability,

          ap.program_name,
          ap.description,
          ap.eligibility_rules,

          u.full_name AS approved_by_name,

          'Calamity' AS record_type,

          cp.risk_level,
          cp.house_type,
          cp.roof_damage,
          cp.wall_damage,
          cp.flooding_level,
          cp.damage_risk

        FROM calamity_programs cp

        INNER JOIN households h
          ON h.household_id = cp.household_id

        LEFT JOIN assistance_programs ap
          ON ap.program_id = cp.program_id

        LEFT JOIN users u
          ON u.user_id = cp.approved_by

        WHERE LOWER(TRIM(COALESCE(cp.status, ''))) IN (
          'approved',
          'rejected'
        )

        ORDER BY
          COALESCE(approved_at, submitted_at) DESC NULLS LAST
      `);

      const rows = Array.isArray(result)
        ? result
        : result?.rows || [];

      console.log(
        'Combined beneficiary history:',
        rows.length
      );

      return res.status(200).json(rows);

    } catch (error) {
      console.error(
        'GET /history/beneficiary-validation error:',
        error
      );

      return res.status(500).json({
        error: 'Failed to load beneficiary history',
        details: error.message,
      });
    }
  }
);
/*
|--------------------------------------------------------------------------
| GET BENEFICIARY HISTORY BY HOUSEHOLD
|--------------------------------------------------------------------------
*/
router.get(
  '/beneficiary-validation/:householdId',
  requireRole('admin', 'captain', 'staff'),
  async (req, res) => {
    try {
      const { householdId } = req.params;

      if (!householdId) {
        return res.status(400).json({
          error: 'Household ID is required',
        });
      }

      const result = await query(
        `
        -- REGULAR RECORDS
        SELECT
          bv.validation_id::text AS validation_id,
          bv.household_id,
          bv.program_id,
          bv.validation_status,
          bv.submitted_by,
          bv.submitted_at,
          bv.approved_by,
          bv.approved_at,
          bv.remarks,

          h.household_head_name,
          h.purok,
          h.address,
          h.vulnerability,

          ap.program_name,
          ap.description,
          ap.eligibility_rules,

          u.full_name AS approved_by_name,

          'Regular' AS record_type,

          NULL AS risk_level,
          NULL AS house_type,
          NULL AS roof_damage,
          NULL AS wall_damage,
          NULL AS flooding_level,
          NULL AS damage_risk

        FROM beneficiary_validation bv

        INNER JOIN households h
          ON h.household_id = bv.household_id

        INNER JOIN assistance_programs ap
          ON ap.program_id = bv.program_id

        LEFT JOIN users u
          ON u.user_id = bv.approved_by

        WHERE bv.household_id = $1
          AND LOWER(TRIM(COALESCE(bv.validation_status, ''))) IN (
            'approved',
            'rejected'
          )

        UNION ALL

        -- CALAMITY RECORDS
        SELECT
          ('calamity-' || cp.calamity_id::text) AS validation_id,
          cp.household_id,
          cp.program_id,
          cp.status AS validation_status,

          NULL AS submitted_by,
          cp.created_at AS submitted_at,

          cp.approved_by,
          cp.approved_at,
          cp.rejection_reason AS remarks,

          h.household_head_name,
          h.purok,
          h.address,
          h.vulnerability,

          ap.program_name,
          ap.description,
          ap.eligibility_rules,

          u.full_name AS approved_by_name,

          'Calamity' AS record_type,

          cp.risk_level,
          cp.house_type,
          cp.roof_damage,
          cp.wall_damage,
          cp.flooding_level,
          cp.damage_risk

        FROM calamity_programs cp

        INNER JOIN households h
          ON h.household_id = cp.household_id

        LEFT JOIN assistance_programs ap
          ON ap.program_id = cp.program_id

        LEFT JOIN users u
          ON u.user_id = cp.approved_by

        WHERE cp.household_id = $1
          AND LOWER(TRIM(COALESCE(cp.status, ''))) IN (
            'approved',
            'rejected'
          )

        ORDER BY
          COALESCE(approved_at, submitted_at) DESC NULLS LAST
        `,
        [householdId]
      );

      const rows = Array.isArray(result)
        ? result
        : result?.rows || [];

      return res.status(200).json(rows);

    } catch (error) {
      console.error(
        'GET /history/beneficiary-validation/:householdId error:',
        error
      );

      return res.status(500).json({
        error: 'Failed to load household history',
        details: error.message,
      });
    }
  }
);

// GET /api/history/household-releases
router.get('/household-releases', async (req, res) => {
  try {
    const result = await query(`
      SELECT
        d.distribution_id,
        d.household_id,
        h.household_head_name,
        d.program_id,
        p.program_name,
        d.amount_released,
        d.release_date,
        d.period_start,
        d.period_end,
        d.release_status
      FROM ml_assistance_distribution d
      INNER JOIN households h
        ON h.household_id = d.household_id
      INNER JOIN assistance_programs p
        ON p.program_id = d.program_id
      WHERE LOWER(TRIM(d.release_status)) = 'released'
        AND d.amount_released IS NOT NULL
        AND d.amount_released > 0
      ORDER BY
        d.household_id,
        d.release_date DESC NULLS LAST,
        d.created_at DESC
    `);

    const records = Array.isArray(result)
      ? result
      : result?.rows || [];

    return res.json(records);
  } catch (error) {
    console.error('Failed to load household release history:', error);

    return res.status(500).json({
      error: 'Failed to load released assistance history.',
    });
  }
});

module.exports = router;