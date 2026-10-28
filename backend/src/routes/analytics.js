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
| GET ASSISTANCE DISTRIBUTION
|--------------------------------------------------------------------------
*/
router.get('/distribution', async (req, res) => {
  try {
    const rows = await query(`
      SELECT
        p.program_id,
        p.program_name,
        COUNT(d.distribution_id)::int AS released
      FROM assistance_programs p
      LEFT JOIN ml_assistance_distribution d
        ON d.program_id = p.program_id
      GROUP BY
        p.program_id,
        p.program_name
      ORDER BY released DESC, p.program_name
    `);

    res.json({
      distribution: rows || [],
    });
  } catch (error) {
    console.error(
      'GET /api/analytics/distribution error:',
      error
    );

    res.status(500).json({
      error: error.message,
    });
  }
});

router.get('/analytics', auth, async (req, res) => {
  try {
    const {
      dateRange = 'This Month',
      purok = 'All Puroks',
      startDate,
      endDate,
    } = req.query;

    const conditions = [];
    const values = [];

    /* =========================
       PUROK FILTER
    ========================= */

    if (purok && purok !== 'All Puroks') {
      values.push(purok);
      conditions.push(`purok = $${values.length}`);
    }

    /* =========================
       DATE FILTER
    ========================= */

    if (dateRange === 'This Month') {
      conditions.push(`
        created_at >= date_trunc('month', CURRENT_DATE)
        AND created_at < date_trunc('month', CURRENT_DATE) + INTERVAL '1 month'
      `);
    }

    if (dateRange === 'Last Month') {
      conditions.push(`
        created_at >= date_trunc('month', CURRENT_DATE) - INTERVAL '1 month'
        AND created_at < date_trunc('month', CURRENT_DATE)
      `);
    }

    if (dateRange === 'This Year') {
      conditions.push(`
        created_at >= date_trunc('year', CURRENT_DATE)
        AND created_at < date_trunc('year', CURRENT_DATE) + INTERVAL '1 year'
      `);
    }

    if (dateRange === 'Custom') {
      if (startDate) {
        values.push(startDate);
        conditions.push(`created_at >= $${values.length}`);
      }

      if (endDate) {
        values.push(endDate);
        conditions.push(
          `created_at < ($${values.length}::date + INTERVAL '1 day')`
        );
      }
    }

    const whereClause = conditions.length
      ? `WHERE ${conditions.join(' AND ')}`
      : '';

    /* =========================
       TOTAL HOUSEHOLDS
    ========================= */

    const totalResult = await query(
      `
      SELECT COUNT(*) AS total
      FROM households
      ${whereClause}
      `,
      values
    );

    const total_households = Number(
      totalResult.rows[0]?.total || 0
    );

    /* =========================
       BY PUROK
    ========================= */

    const purokResult = await query(
      `
      SELECT
        purok,
        COUNT(*) AS n
      FROM households
      ${whereClause}
      GROUP BY purok
      ORDER BY purok
      `,
      values
    );

    const by_purok = purokResult.rows.map((row) => ({
      purok: row.purok,
      n: Number(row.n),
    }));

    /* =========================
       VULNERABILITY
    ========================= */

    const vulnerabilityResult = await query(
      `
      SELECT
        COALESCE(vulnerability, 'Unclassified') AS vulnerability,
        COUNT(*) AS n
      FROM households
      ${whereClause}
      GROUP BY vulnerability
      ORDER BY n DESC
      `,
      values
    );

    const by_vulnerability = vulnerabilityResult.rows.map((row) => ({
      vulnerability: row.vulnerability,
      n: Number(row.n),
    }));

    res.json({
      analytics: {
        total_households,
        by_purok,
        by_vulnerability,
        validation_records: [],
        distribution: [],
        approved_household_count: 0,
        rejected_count: 0,
        decided_household_count: 0,
        approval_rate: 0,
        coverage: 0,
        highly_vulnerable: by_vulnerability
          .filter((row) =>
            String(row.vulnerability)
              .toLowerCase()
              .includes('high')
          )
          .reduce((sum, row) => sum + row.n, 0),
      },
    });
  } catch (error) {
    console.error('Analytics error:', error);

    res.status(500).json({
      message: 'Failed to generate analytics.',
    });
  }
});


module.exports = router;