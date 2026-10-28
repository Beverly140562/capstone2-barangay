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
| Returns all Approved and Rejected beneficiary validation records.
*/
router.get(
  '/beneficiary-validation',
  requireRole('admin', 'captain', 'staff'),
  async (req, res) => {
    try {
      const result = await query(`
        SELECT
          bv.validation_id,
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

          u.full_name AS approved_by_name

        FROM beneficiary_validation bv

        INNER JOIN households h
          ON h.household_id = bv.household_id

        INNER JOIN assistance_programs ap
          ON ap.program_id = bv.program_id

        LEFT JOIN users u
          ON u.user_id = bv.approved_by

        WHERE LOWER(TRIM(bv.validation_status)) IN (
          'approved',
          'rejected'
        )

        ORDER BY
          COALESCE(
            bv.approved_at,
            bv.submitted_at
          ) DESC
      `);

      console.log(
        'Beneficiary history records:',
        Array.isArray(result) ? result.length : 0
      );

      return res.status(200).json(
        Array.isArray(result) ? result : []
      );

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
        SELECT
          bv.validation_id,
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

          u.full_name AS approved_by_name

        FROM beneficiary_validation bv

        INNER JOIN households h
          ON h.household_id = bv.household_id

        INNER JOIN assistance_programs ap
          ON ap.program_id = bv.program_id

        LEFT JOIN users u
          ON u.user_id = bv.approved_by

        WHERE bv.household_id = $1
          AND LOWER(TRIM(bv.validation_status)) IN (
            'approved',
            'rejected'
          )

        ORDER BY
          COALESCE(
            bv.approved_at,
            bv.submitted_at
          ) DESC
        `,
        [householdId]
      );

      return res.status(200).json(
        Array.isArray(result) ? result : []
      );

    } catch (error) {
      console.error(
        `GET /history/beneficiary-validation/ Error:`,
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