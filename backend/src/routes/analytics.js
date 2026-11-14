const express = require('express');

const router = express.Router();

const { query } = require('../db');
const {
  auth,
  requireRole,
  logActivity,
} = require('../middleware/auth');

router.use(auth);

/*
|--------------------------------------------------------------------------
| GET ANALYTICS SUMMARY
|--------------------------------------------------------------------------
*/
router.get('/summary', async (req, res) => {
  try {
    // -------------------------------------------------------
    // TOTAL HOUSEHOLDS
    // -------------------------------------------------------
    const total = await query(`
      SELECT COUNT(*)::int AS n
      FROM households
    `);

    // -------------------------------------------------------
    // VALIDATED HOUSEHOLDS
    // -------------------------------------------------------
    const validated = await query(`
      SELECT COUNT(*)::int AS n
      FROM households
      WHERE LOWER(COALESCE(validation_status, '')) = 'validated'
    `);

    // -------------------------------------------------------
    // APPROVED HOUSEHOLDS
    // -------------------------------------------------------
    const approved = await query(`
      SELECT COUNT(*)::int AS n
      FROM households
      WHERE LOWER(COALESCE(validation_status, '')) = 'approved'
    `);

    // -------------------------------------------------------
    // PENDING HOUSEHOLDS
    // -------------------------------------------------------
    const pending = await query(`
      SELECT COUNT(*)::int AS n
      FROM households
      WHERE LOWER(COALESCE(validation_status, '')) = 'pending'
    `);

    // -------------------------------------------------------
    // VULNERABILITY
    // -------------------------------------------------------
    const byVuln = await query(`
      SELECT
        COALESCE(
          NULLIF(TRIM(vulnerability), ''),
          'Unclassified'
        ) AS vulnerability,
        COUNT(*)::int AS n
      FROM households
      GROUP BY
        COALESCE(
          NULLIF(TRIM(vulnerability), ''),
          'Unclassified'
        )
      ORDER BY vulnerability
    `);

    // -------------------------------------------------------
    // PUROK
    // -------------------------------------------------------
    const byPurok = await query(`
      SELECT
        COALESCE(
          NULLIF(TRIM(purok::text), ''),
          'Unknown'
        ) AS purok,
        COUNT(*)::int AS n
      FROM households
      GROUP BY
        COALESCE(
          NULLIF(TRIM(purok::text), ''),
          'Unknown'
        )
      ORDER BY n DESC
    `);

    // -------------------------------------------------------
    // INCOME BRACKETS
    //
    // IMPORTANT:
    // The CASE expression is placed inside a subquery so
    // PostgreSQL can safely GROUP BY the resulting "bracket".
    // -------------------------------------------------------
    const income = await query(
  `SELECT
      bracket,
      COUNT(*)::int AS n
   FROM (
      SELECT
        CASE
          WHEN COALESCE(monthly_income, 0) < 6000
            THEN 'Below 6k'
          WHEN monthly_income < 12000
            THEN '6k-12k'
          WHEN monthly_income < 20000
            THEN '12k-20k'
          ELSE 'Above 20k'
        END AS bracket
      FROM households
   ) x
   GROUP BY bracket
   ORDER BY
      CASE bracket
        WHEN 'Below 6k' THEN 1
        WHEN '6k-12k' THEN 2
        WHEN '12k-20k' THEN 3
        WHEN 'Above 20k' THEN 4
        ELSE 5
      END`
);

    // -------------------------------------------------------
    // RESPONSE
    // -------------------------------------------------------
    res.json({
      summary: {
        total_households:
          Number(total?.[0]?.n || 0),

        validated:
          Number(validated?.[0]?.n || 0),

        approved:
          Number(approved?.[0]?.n || 0),

        pending:
          Number(pending?.[0]?.n || 0),

        total_beneficiaries:
          Number(approved?.[0]?.n || 0),
      },

      by_vulnerability: byVuln || [],

      by_purok: byPurok || [],

      by_income: income || [],
    });
  } catch (error) {
    console.error(
      'GET /api/analytics/summary error:',
      error
    );

    res.status(500).json({
      error: error.message,
    });
  }
});


/*
|--------------------------------------------------------------------------
| GET APPROVED HOUSEHOLDS PER ASSISTANCE PROGRAM
| Includes regular and calamity approvals
|--------------------------------------------------------------------------
*/
router.get('/distribution', async (req, res) => {
  try {
    const result = await query(`
      WITH approved_program_households AS (
        -- Regular beneficiary approvals
        SELECT
          bv.program_id,
          bv.household_id
        FROM beneficiary_validation bv
        WHERE LOWER(
          TRIM(COALESCE(bv.validation_status, ''))
        ) = 'approved'

        UNION

        -- Calamity beneficiary approvals
        SELECT
          cp.program_id,
          cp.household_id
        FROM calamity_programs cp
        WHERE LOWER(
          TRIM(COALESCE(cp.status, ''))
        ) = 'approved'
      )

      SELECT
        p.program_id,
        p.program_name,
        COUNT(DISTINCT aph.household_id)::int
          AS approved_households
      FROM assistance_programs p

      LEFT JOIN approved_program_households aph
        ON aph.program_id = p.program_id

      GROUP BY
        p.program_id,
        p.program_name

      ORDER BY
        approved_households DESC,
        p.program_name ASC
    `);

    const rows = Array.isArray(result)
      ? result
      : result?.rows || [];

    res.json({
      distribution: rows.map((row) => ({
        program_id: row.program_id,
        program_name: row.program_name,
        approved_households: Number(
          row.approved_households || 0
        ),
      })),
    });
  } catch (error) {
    console.error(
      'GET /analytics/distribution error:',
      error
    );

    res.status(500).json({
      error: error.message,
    });
  }
});


/*
|--------------------------------------------------------------------------
| GET HOUSEHOLD ANALYTICS
|--------------------------------------------------------------------------
*/
router.get('/analytics', async (req, res) => {
  try {
    const {
      dateRange = 'This Month',
      purok = 'All Puroks',
      startDate,
      endDate,
    } = req.query;

    const conditions = [];
    const values = [];

    // -------------------------------------------------------
    // PUROK FILTER
    // -------------------------------------------------------

    if (purok && purok !== 'All Puroks') {
      values.push(purok);
      conditions.push(`h.purok::text = $${values.length}`);
    }

    // -------------------------------------------------------
    // DATE FILTER
    // -------------------------------------------------------

    if (dateRange === 'This Month') {
      conditions.push(`
        h.created_at >= date_trunc('month', CURRENT_DATE)
        AND h.created_at < date_trunc('month', CURRENT_DATE)
          + INTERVAL '1 month'
      `);
    }

    if (dateRange === 'Last Month') {
      conditions.push(`
        h.created_at >= date_trunc('month', CURRENT_DATE)
          - INTERVAL '1 month'
        AND h.created_at < date_trunc('month', CURRENT_DATE)
      `);
    }

    if (dateRange === 'This Year') {
      conditions.push(`
        h.created_at >= date_trunc('year', CURRENT_DATE)
        AND h.created_at < date_trunc('year', CURRENT_DATE)
          + INTERVAL '1 year'
      `);
    }

    if (dateRange === 'Custom') {
      if (startDate) {
        values.push(startDate);
        conditions.push(`h.created_at >= $${values.length}::date`);
      }

      if (endDate) {
        values.push(endDate);
        conditions.push(`
          h.created_at < ($${values.length}::date + INTERVAL '1 day')
        `);
      }
    }

    const householdWhere = conditions.length
      ? `WHERE ${conditions.join(' AND ')}`
      : '';

    const householdJoinConditions = conditions.length
      ? `AND ${conditions.join(' AND ')}`
      : '';

    // -------------------------------------------------------
    // TOTAL HOUSEHOLDS
    // -------------------------------------------------------

    const totalResult = await query(
      `
      SELECT COUNT(*)::int AS total
      FROM households h
      ${householdWhere}
      `,
      values
    );

    const totalRows = Array.isArray(totalResult)
      ? totalResult
      : totalResult?.rows || [];

    const total_households = Number(
      totalRows[0]?.total || 0
    );


    // -------------------------------------------------------
    // SUBMITTED HOUSEHOLDS FOR ASSISTANCE PROGRAMS
    // Count distinct households with submitted applications.
    // Pending, Approved, and Rejected are all submissions.
    // -------------------------------------------------------

    const submittedResult = await query(
      `
      SELECT COUNT(DISTINCT bv.household_id)::int AS total
      FROM beneficiary_validation bv
      INNER JOIN households h
        ON h.household_id = bv.household_id
      ${householdWhere
        ? `${householdWhere} AND LOWER(TRIM(COALESCE(bv.validation_status, ''))) IN ('pending', 'approved', 'rejected')`
        : `WHERE LOWER(TRIM(COALESCE(bv.validation_status, ''))) IN ('pending', 'approved', 'rejected')`
      }
      `,
      values
    );

    const submittedRows = Array.isArray(submittedResult)
      ? submittedResult
      : submittedResult?.rows || [];

    const submitted_household_count = Number(
      submittedRows[0]?.total || 0
    );


    // -------------------------------------------------------
    // HOUSEHOLDS BY PUROK
    // -------------------------------------------------------

    const purokResult = await query(
      `
      SELECT
        COALESCE(
          NULLIF(TRIM(h.purok::text), ''),
          'Unknown'
        ) AS purok,
        COUNT(*)::int AS n
      FROM households h
      ${householdWhere}
      GROUP BY h.purok
      ORDER BY h.purok
      `,
      values
    );

    const purokRows = Array.isArray(purokResult)
      ? purokResult
      : purokResult?.rows || [];

    const by_purok = purokRows.map((row) => ({
      purok: row.purok,
      n: Number(row.n),
    }));

    // -------------------------------------------------------
    // HOUSEHOLDS BY VULNERABILITY
    // -------------------------------------------------------

    const vulnerabilityResult = await query(
      `
      SELECT
        COALESCE(
          NULLIF(TRIM(h.vulnerability), ''),
          'Unclassified'
        ) AS vulnerability,
        COUNT(*)::int AS n
      FROM households h
      ${householdWhere}
      GROUP BY h.vulnerability
      ORDER BY n DESC
      `,
      values
    );

    const vulnerabilityRows = Array.isArray(vulnerabilityResult)
      ? vulnerabilityResult
      : vulnerabilityResult?.rows || [];

    const by_vulnerability = vulnerabilityRows.map((row) => ({
      vulnerability: row.vulnerability,
      n: Number(row.n),
    }));

   // -------------------------------------------------------
// APPROVED HOUSEHOLDS PER PROGRAM
// Includes regular and calamity approvals.
// Applies the selected date and Purok filters.
// -------------------------------------------------------

const distributionResult = await query(
  `
  WITH approved_program_households AS (
    -- Regular beneficiary approvals
    SELECT
      bv.program_id,
      bv.household_id
    FROM beneficiary_validation bv
    WHERE LOWER(
      TRIM(COALESCE(bv.validation_status, ''))
    ) = 'approved'

    UNION

    -- Calamity beneficiary approvals
    SELECT
      cp.program_id,
      cp.household_id
    FROM calamity_programs cp
    WHERE LOWER(
      TRIM(COALESCE(cp.status, ''))
    ) = 'approved'
  )

  SELECT
    p.program_id,
    p.program_name,
    COUNT(DISTINCT h.household_id)::int
      AS approved_households

  FROM assistance_programs p

  LEFT JOIN approved_program_households aph
    ON aph.program_id = p.program_id

  LEFT JOIN households h
    ON h.household_id = aph.household_id
    ${householdJoinConditions}

  GROUP BY
    p.program_id,
    p.program_name

  ORDER BY
    approved_households DESC,
    p.program_name ASC
  `,
  values
);

const distributionRows = Array.isArray(distributionResult)
  ? distributionResult
  : distributionResult?.rows || [];

const distribution = distributionRows.map((row) => ({
  program_id: row.program_id,
  program_name: row.program_name,
  approved_households: Number(
    row.approved_households || 0
  ),
}));

    // -------------------------------------------------------
// TOTAL DISTINCT APPROVED HOUSEHOLDS
// Includes regular and calamity approvals.
// -------------------------------------------------------

const approvedResult = await query(
  `
  WITH approved_households AS (
    -- Regular beneficiary approvals
    SELECT
      bv.household_id
    FROM beneficiary_validation bv
    WHERE LOWER(
      TRIM(COALESCE(bv.validation_status, ''))
    ) = 'approved'

    UNION

    -- Calamity beneficiary approvals
    SELECT
      cp.household_id
    FROM calamity_programs cp
    WHERE LOWER(
      TRIM(COALESCE(cp.status, ''))
    ) = 'approved'
  )

  SELECT
    COUNT(DISTINCT h.household_id)::int AS total

  FROM approved_households ah

  INNER JOIN households h
    ON h.household_id = ah.household_id

  ${householdWhere}
  `,
  values
);

const approvedRows = Array.isArray(approvedResult)
  ? approvedResult
  : approvedResult?.rows || [];

const approved_household_count = Number(
  approvedRows[0]?.total || 0
);

    // -------------------------------------------------------
    // HIGHLY VULNERABLE
    // -------------------------------------------------------

    const highly_vulnerable = by_vulnerability
      .filter((row) =>
        String(row.vulnerability)
          .toLowerCase()
          .includes('high')
      )
      .reduce((sum, row) => sum + row.n, 0);

    // -------------------------------------------------------
    // RESPONSE
    // -------------------------------------------------------

    const analytics = {
      total_households,

      submitted_household_count,

      by_purok,

      by_vulnerability,

      distribution,

      approved_household_count,

      highly_vulnerable,

      validation_records: [],

      rejected_count: 0,

      decided_household_count: approved_household_count,

      approval_rate: total_households > 0
        ? Number(
            (
              approved_household_count /
              total_households *
              100
            ).toFixed(2)
          )
        : 0,

      coverage: total_households > 0
        ? Number(
            (
              approved_household_count /
              total_households *
              100
            ).toFixed(2)
          )
        : 0,
    };

    res.json({
      ...analytics,
      analytics,
    });

  } catch (error) {
    console.error(
      'Analytics error:',
      error
    );

    res.status(500).json({
      message: 'Failed to generate analytics.',
      error: error.message,
    });
  }
});


module.exports = router;