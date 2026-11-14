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
| Combines regular and calamity beneficiary records.
*/
router.get(
  '/beneficiary-validation',
  requireRole('admin', 'captain', 'staff'),
  async (req, res) => {
    try {
      // -------------------------------------------------------
      // REGULAR BENEFICIARY RECORDS
      // -------------------------------------------------------
      const regularResult = await query(`
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

        WHERE LOWER(
          TRIM(COALESCE(bv.validation_status, ''))
        ) IN ('approved', 'rejected')

        ORDER BY COALESCE(
          bv.approved_at,
          bv.submitted_at
        ) DESC NULLS LAST
      `);

      // -------------------------------------------------------
      // CALAMITY BENEFICIARY RECORDS
      // -------------------------------------------------------
      const calamityResult = await query(`
        SELECT
          cp.calamity_id,
          cp.household_id,
          cp.program_id,
          cp.status,
          cp.created_at,
          cp.approved_by,
          cp.approved_at,
          cp.rejection_reason,

          cp.risk_level,
          cp.house_type,
          cp.roof_damage,
          cp.wall_damage,
          cp.flooding_level,
          cp.damage_risk,

          h.household_head_name,
          h.purok,
          h.address,
          h.vulnerability,

          p.program_name,
          p.description,

          u.full_name AS approved_by_name

        FROM calamity_programs cp

        INNER JOIN households h
          ON h.household_id = cp.household_id

        LEFT JOIN assistance_programs p
          ON p.program_id = cp.program_id

        LEFT JOIN users u
          ON u.user_id = cp.approved_by

        WHERE LOWER(
          TRIM(COALESCE(cp.status, ''))
        ) IN ('approved', 'rejected')

        ORDER BY COALESCE(
          cp.approved_at,
          cp.created_at
        ) DESC NULLS LAST
      `);

      const regularRecords = Array.isArray(regularResult)
        ? regularResult
        : regularResult?.rows || [];

      const calamityRecords = Array.isArray(calamityResult)
        ? calamityResult
        : calamityResult?.rows || [];

      // -------------------------------------------------------
      // NORMALIZE REGULAR RECORDS
      // -------------------------------------------------------
      const regularHistory = regularRecords.map((record) => ({
        ...record,
        validation_id: String(record.validation_id),
        record_type: 'Regular',
      }));

      // -------------------------------------------------------
      // NORMALIZE CALAMITY RECORDS
      // -------------------------------------------------------
      const calamityHistory = calamityRecords.map((record) => ({
        validation_id: `calamity-${record.calamity_id}`,
        calamity_id: record.calamity_id,

        household_id: record.household_id,
        program_id: record.program_id,

        validation_status: record.status,

        submitted_by: null,
        submitted_at: record.created_at,

        approved_by: record.approved_by,
        approved_at: record.approved_at,

        remarks: record.rejection_reason,

        household_head_name: record.household_head_name,
        purok: record.purok,
        address: record.address,
        vulnerability: record.vulnerability,

        program_name: record.program_name || 'Calamity Assistance',
        description: record.description,

        approved_by_name: record.approved_by_name,

        record_type: 'Calamity',

        risk_level: record.risk_level,
        house_type: record.house_type,
        roof_damage: record.roof_damage,
        wall_damage: record.wall_damage,
        flooding_level: record.flooding_level,
        damage_risk: record.damage_risk,
      }));

      // -------------------------------------------------------
      // COMBINE AND SORT
      // -------------------------------------------------------
      const combinedHistory = [
        ...regularHistory,
        ...calamityHistory,
      ].sort((a, b) => {
        const dateA = new Date(
          a.approved_at || a.submitted_at || 0
        ).getTime();

        const dateB = new Date(
          b.approved_at || b.submitted_at || 0
        ).getTime();

        return dateB - dateA;
      });

      console.log('Beneficiary history loaded:', {
        regular: regularHistory.length,
        calamity: calamityHistory.length,
        total: combinedHistory.length,
      });

      return res.status(200).json(combinedHistory);

    } catch (error) {
      console.error(
        'GET /history/beneficiary-validation ERROR:',
        error
      );

      return res.status(500).json({
        error: 'Failed to load beneficiary history',
        details: error.message,
        code: error.code || null,
        column: error.column || null,
        table: error.table || null,
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

      // REGULAR HISTORY
      const regularResult = await query(
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
          AND LOWER(
            TRIM(COALESCE(bv.validation_status, ''))
          ) IN ('approved', 'rejected')

        ORDER BY COALESCE(
          bv.approved_at,
          bv.submitted_at
        ) DESC NULLS LAST
        `,
        [householdId]
      );

      // CALAMITY HISTORY
      const calamityResult = await query(
        `
        SELECT
          cp.calamity_id,
          cp.household_id,
          cp.program_id,
          cp.status,
          cp.created_at,
          cp.approved_by,
          cp.approved_at,
          cp.rejection_reason,

          cp.risk_level,
          cp.house_type,
          cp.roof_damage,
          cp.wall_damage,
          cp.flooding_level,
          cp.damage_risk,

          h.household_head_name,
          h.purok,
          h.address,
          h.vulnerability,

          p.program_name,
          p.description,

          u.full_name AS approved_by_name

        FROM calamity_programs cp

        INNER JOIN households h
          ON h.household_id = cp.household_id

        LEFT JOIN assistance_programs p
          ON p.program_id = cp.program_id

        LEFT JOIN users u
          ON u.user_id = cp.approved_by

        WHERE cp.household_id = $1
          AND LOWER(
            TRIM(COALESCE(cp.status, ''))
          ) IN ('approved', 'rejected')

        ORDER BY COALESCE(
          cp.approved_at,
          cp.created_at
        ) DESC NULLS LAST
        `,
        [householdId]
      );

      const regularRecords = Array.isArray(regularResult)
        ? regularResult
        : regularResult?.rows || [];

      const calamityRecords = Array.isArray(calamityResult)
        ? calamityResult
        : calamityResult?.rows || [];

      const regularHistory = regularRecords.map((record) => ({
        ...record,
        validation_id: String(record.validation_id),
        record_type: 'Regular',
      }));

      const calamityHistory = calamityRecords.map((record) => ({
        validation_id: `calamity-${record.calamity_id}`,
        calamity_id: record.calamity_id,

        household_id: record.household_id,
        program_id: record.program_id,

        validation_status: record.status,

        submitted_by: null,
        submitted_at: record.created_at,

        approved_by: record.approved_by,
        approved_at: record.approved_at,

        remarks: record.rejection_reason,

        household_head_name: record.household_head_name,
        purok: record.purok,
        address: record.address,
        vulnerability: record.vulnerability,

        program_name: record.program_name || 'Calamity Assistance',
        description: record.description,

        approved_by_name: record.approved_by_name,

        record_type: 'Calamity',

        risk_level: record.risk_level,
        house_type: record.house_type,
        roof_damage: record.roof_damage,
        wall_damage: record.wall_damage,
        flooding_level: record.flooding_level,
        damage_risk: record.damage_risk,
      }));

      const combinedHistory = [
        ...regularHistory,
        ...calamityHistory,
      ].sort((a, b) => {
        const dateA = new Date(
          a.approved_at || a.submitted_at || 0
        ).getTime();

        const dateB = new Date(
          b.approved_at || b.submitted_at || 0
        ).getTime();

        return dateB - dateA;
      });

      return res.status(200).json(combinedHistory);

    } catch (error) {
      console.error(
        'GET household beneficiary history ERROR:',
        error
      );

      return res.status(500).json({
        error: 'Failed to load household history',
        details: error.message,
        code: error.code || null,
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