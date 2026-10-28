const express = require('express');
const router = express.Router();

const { query } = require('../db');
const {
  auth,
  logActivity,
} = require('../middleware/auth');

router.use(auth);

/*
|--------------------------------------------------------------------------
| HELPERS
|--------------------------------------------------------------------------
*/

function getUserId(req) {
  return (
    req.user?.users ||
    req.user?.user_id ||
    req.user?.id ||
    null
  );
}


function normalizeType(type) {
  const value = String(type || '')
    .trim()
    .toLowerCase()
    .replace(/[\s_-]+/g, '');

  const aliases = {
    households: 'households',
    household: 'households',
    householdprofilereport: 'households',

    approved: 'approved',
    approvedbeneficiaries: 'approved',

    distribution: 'distribution',
    assistancedistribution: 'distribution',

    analytics: 'analytics',
    analytical: 'analytics',
    analyticalsummary: 'analytics',
  };

  return aliases[value] || null;
}


/*
 * Your db.query() implementation may return either:
 *
 *   rows
 *
 * OR:
 *
 *   { rows }
 *
 * This helper supports both.
 */
function getRows(result) {
  if (Array.isArray(result)) {
    return result;
  }

  if (
    result &&
    Array.isArray(result.rows)
  ) {
    return result.rows;
  }

  return [];
}

function toCsv(rows) {
  if (
    !Array.isArray(rows) ||
    rows.length === 0
  ) {
    return '';
  }

  const headers = Object.keys(rows[0]);

  const escape = (value) => {
    const stringValue =
      value === null ||
      value === undefined
        ? ''
        : String(value);

    return /[",\n\r]/.test(stringValue)
      ? `"${stringValue.replace(
          /"/g,
          '""'
        )}"`
      : stringValue;
  };

  return [
    headers.join(','),
    ...rows.map((row) =>
      headers
        .map((header) =>
          escape(row[header])
        )
        .join(',')
    ),
  ].join('\n');
}

/*
|--------------------------------------------------------------------------
| DATE HELPERS
|--------------------------------------------------------------------------
*/

function formatDate(date) {
  const year = date.getFullYear();

  const month = String(
    date.getMonth() + 1
  ).padStart(2, '0');

  const day = String(
    date.getDate()
  ).padStart(2, '0');

  return `${year}-${month}-${day}`;
}

function getDateFilter(
  dateRange,
  startDate,
  endDate
) {
  const now = new Date();

  if (
    !dateRange ||
    dateRange === 'All Time' ||
    dateRange === 'All'
  ) {
    return null;
  }

  if (dateRange === 'This Month') {
    const start = new Date(
      now.getFullYear(),
      now.getMonth(),
      1
    );

    const end = new Date(
      now.getFullYear(),
      now.getMonth() + 1,
      1
    );

    return {
      startDate: formatDate(start),
      endDate: formatDate(end),
    };
  }

  if (dateRange === 'Last Month') {
    const start = new Date(
      now.getFullYear(),
      now.getMonth() - 1,
      1
    );

    const end = new Date(
      now.getFullYear(),
      now.getMonth(),
      1
    );

    return {
      startDate: formatDate(start),
      endDate: formatDate(end),
    };
  }

  if (dateRange === 'This Year') {
    const start = new Date(
      now.getFullYear(),
      0,
      1
    );

    const end = new Date(
      now.getFullYear() + 1,
      0,
      1
    );

    return {
      startDate: formatDate(start),
      endDate: formatDate(end),
    };
  }

  if (dateRange === 'Custom') {
    if (!startDate || !endDate) {
      return null;
    }

    const start = new Date(
      `${startDate}T00:00:00`
    );

    const end = new Date(
      `${endDate}T00:00:00`
    );

    if (
      Number.isNaN(start.getTime()) ||
      Number.isNaN(end.getTime())
    ) {
      return null;
    }

    if (end < start) {
      return null;
    }

    end.setDate(
      end.getDate() + 1
    );

    return {
      startDate: formatDate(start),
      endDate: formatDate(end),
    };
  }

  return null;
}

function addDateCondition(
  conditions,
  params,
  column,
  dateFilter
) {
  if (!dateFilter) {
    return;
  }

  params.push(
    dateFilter.startDate
  );

  const startParam =
    params.length;

  params.push(
    dateFilter.endDate
  );

  const endParam =
    params.length;

  conditions.push(`
    ${column} >= $${startParam}::date
    AND ${column} < $${endParam}::date
  `);
}

/*
|--------------------------------------------------------------------------
| PUROK FILTER
|--------------------------------------------------------------------------
*/

function addPurokCondition(
  conditions,
  params,
  purok
) {
  if (
    !purok ||
    String(purok).trim() === '' ||
    purok === 'All Puroks' ||
    purok === 'All'
  ) {
    return;
  }

  const cleanPurok = String(purok)
    .trim()
    .replace(/^purok\s*/i, '');

  if (!cleanPurok) {
    return;
  }

  params.push(cleanPurok);

  const parameter = params.length;

  conditions.push(`
    REGEXP_REPLACE(
      LOWER(TRIM(h.purok)),
      '^purok\\s*',
      ''
    ) = LOWER(TRIM($${parameter}))
  `);
}

/*
|--------------------------------------------------------------------------
| REPORT QUERIES
|--------------------------------------------------------------------------
*/

const QUERIES = {
  households: `
    SELECT
      h.household_id,
      h.household_head_name,
      h.family_position,
      h.family_number,
      h.address,
      h.purok,
      h.length_residency,
      h.sex,
      h.age,
      h.birthday,
      h.civil_status,
      h.disability_present,
      h.highest_education,
      h.occupation,
      h.contact_number,
      h.religion,
      h.monthly_income,
      h.validation_status,
      h.vulnerability,
      h.vulnerability_prob,
      h.suggested_programs,
      h.created_at
    FROM households h
  `,

  approved: `
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

      u.full_name AS approved_by_name,

      h.household_head_name,
      h.purok,
      h.address,
      h.monthly_income,
      h.vulnerability,
      h.vulnerability_prob,
      h.family_number,

      p.program_name

    FROM beneficiary_validation bv

    INNER JOIN households h
      ON h.household_id =
         bv.household_id

    LEFT JOIN assistance_programs p
      ON p.program_id =
         bv.program_id

    LEFT JOIN users u
      ON u.user_id = bv.approved_by

    WHERE LOWER(
      TRIM(bv.validation_status)
    ) = 'approved'
  `,

  distribution: `
    SELECT
      d.distribution_id,
      d.household_id,
      d.program_id,
      d.created_at,
      d.release_status,
      d.release_date,
      d.amount_released,

      h.household_head_name,
      h.purok,
      h.address,
      h.vulnerability,

      p.program_name

    FROM ml_assistance_distribution d

    INNER JOIN households h
      ON h.household_id =
         d.household_id

    LEFT JOIN assistance_programs p
      ON p.program_id =
         d.program_id
  `,

  analytics: `
    SELECT
      COALESCE(
        NULLIF(
          TRIM(h.vulnerability),
          ''
        ),
        'Unclassified'
      ) AS classification,

      COUNT(*)::int AS count

    FROM households h
  `,
};

/*
|--------------------------------------------------------------------------
| BUILD REPORT QUERY
|--------------------------------------------------------------------------
*/


function buildReportQuery(type, req) {
  const normalizedType = normalizeType(type);

  if (!normalizedType) {
    throw new Error(`Unsupported report type: ${String(type)}`);
  }

  const {
    purok,
    dateRange,
    startDate,
    endDate,
  } = req.query;

  const params = [];
  const conditions = [];

  const dateFilter = getDateFilter(
    dateRange,
    startDate,
    endDate
  );

  // HOUSEHOLD PROFILE REPORT
  
if (normalizedType === 'households') {
  addPurokCondition(
    conditions,
    params,
    purok
  );

  // Apply the selected month or custom date range.
  addDateCondition(
    conditions,
    params,
    'h.created_at',
    dateFilter
  );

  let sql = QUERIES.households;

  if (conditions.length > 0) {
    sql += ` WHERE ${conditions.join(' AND ')}`;
  }

  sql += `
    ORDER BY h.created_at DESC NULLS LAST
  `;

  return {
    sql,
    params,
  };
}


  // ANALYTICAL SUMMARY
  if (normalizedType === 'analytics') {
    addPurokCondition(conditions, params, purok);

    addDateCondition(
      conditions,
      params,
      'h.created_at',
      dateFilter
    );

    let sql = `
      SELECT
        COALESCE(
          NULLIF(TRIM(h.vulnerability), ''),
          'Unclassified'
        ) AS classification,
        COUNT(*)::int AS count
      FROM households h
    `;

    if (conditions.length) {
      sql += ` WHERE ${conditions.join(' AND ')}`;
    }

    sql += `
      GROUP BY
        COALESCE(
          NULLIF(TRIM(h.vulnerability), ''),
          'Unclassified'
        )
      ORDER BY
        CASE
          WHEN LOWER(
            COALESCE(
              NULLIF(TRIM(h.vulnerability), ''),
              'Unclassified'
            )
          ) LIKE '%high%' THEN 1
          WHEN LOWER(
            COALESCE(
              NULLIF(TRIM(h.vulnerability), ''),
              'Unclassified'
            )
          ) LIKE '%moderate%' THEN 2
          WHEN LOWER(
            COALESCE(
              NULLIF(TRIM(h.vulnerability), ''),
              'Unclassified'
            )
          ) LIKE '%not%' THEN 3
          WHEN LOWER(
            COALESCE(
              NULLIF(TRIM(h.vulnerability), ''),
              'Unclassified'
            )
          ) LIKE '%low%' THEN 4
          ELSE 5
        END,
        classification ASC
    `;

    return { sql, params };
  }

  // APPROVED BENEFICIARIES
  if (normalizedType === 'approved') {
    addPurokCondition(conditions, params, purok);

    addDateCondition(
      conditions,
      params,
      'bv.approved_at',
      dateFilter
    );

    let sql = QUERIES.approved;

    if (conditions.length) {
      sql += ` AND ${conditions.join(' AND ')}`;
    }

    sql += `
      ORDER BY bv.approved_at DESC NULLS LAST
    `;

    return { sql, params };
  }

  // ASSISTANCE DISTRIBUTION
  
  // ASSISTANCE DISTRIBUTION
  if (normalizedType === 'distribution') {
    addPurokCondition(
      conditions,
      params,
      purok
    );

    addDateCondition(
      conditions,
      params,
      'd.created_at',
      dateFilter
    );

    // Filter by the selected assistance program.
    const programId = String(
      req.query.programId || ''
    ).trim();

    if (programId && programId !== 'All') {
      params.push(programId);
      const programParam = params.length;

      conditions.push(
        `d.program_id = $${programParam}`
      );
    }

    let sql = QUERIES.distribution;

    if (conditions.length > 0) {
      sql += ` WHERE ${conditions.join(' AND ')}`;
    }

    sql += `
      ORDER BY d.created_at DESC NULLS LAST
    `;

    return { sql, params };
  }


  return null;
}


/*
|--------------------------------------------------------------------------
| REPORT HISTORY
|--------------------------------------------------------------------------
*/


async function recordReportGeneration(
  req,
  type,
  format = 'CSV',
  filters = {},
  reportData = []
) {
  const userId = getUserId(req);

  try {
    if (userId) {
      await query(
        `
        INSERT INTO reports (
          user_id,
          report_type,
          format,
          report_date,
          filters,
          report_data
        )
        VALUES (
          $1::uuid,
          $2,
          $3,
          NOW(),
          $4::jsonb,
          $5::jsonb
        )
        `,
        [
          userId,
          type,
          format,
          JSON.stringify(filters),
          JSON.stringify(reportData),
        ]
      );
    }
  } catch (error) {
    console.error(
      'REPORT HISTORY ERROR:',
      error
    );
  }

  try {
    await logActivity(
      req,
      'GENERATE_REPORT',
      `Generated ${format} ${type} report.`
    );
  } catch (error) {
    console.error(
      'REPORT ACTIVITY LOG ERROR:',
      error
    );
  }
}


/*
|--------------------------------------------------------------------------
| GET REPORT HISTORY
|--------------------------------------------------------------------------
*/

router.get(
  '/',
  async (req, res) => {
    try {
      const result =
        await query(
          `
          SELECT
            r.*,

            COALESCE(
              u.full_name,
              u.username,
              'Unknown User'
            ) AS generated_by

          FROM reports r

          LEFT JOIN users u
            ON u.user_id =
               r.user_id

          ORDER BY
            r.report_date DESC
          `
        );

      const rows =
        getRows(result);

      return res.status(200).json({
        reports: rows,
      });
    } catch (error) {
      console.error(
        'GET REPORTS ERROR:',
        error
      );

      return res.status(500).json({
        error:
          error?.message ||
          'Failed to load reports.',
      });
    }
  }
);

/*
|--------------------------------------------------------------------------
| RECORD PDF GENERATION
|--------------------------------------------------------------------------
*/

router.post('/record', auth, async (req, res) => {
  try {
    const {
      report_type,
      format = 'PDF',
      filters = {},
      report_data = [],
    } = req.body;

    if (!report_type) {
      return res.status(400).json({
        message: 'report_type is required',
      });
    }

    const userId =
      req.user?.user_id ||
      req.user?.id ||
      req.user?.users ||
      null;

    const result = await query(
      `
      INSERT INTO reports (
        user_id,
        report_type,
        format,
        report_date,
        filters,
        report_data
      )
      VALUES (
        $1,
        $2,
        $3,
        NOW(),
        $4::jsonb,
        $5::jsonb
      )
      RETURNING
        report_id,
        report_type,
        format,
        report_date,
        filters,
        report_data
      `,
      [
        userId,
        report_type,
        format,
        JSON.stringify(filters),
        JSON.stringify(report_data),
      ]
    );

    const rows = Array.isArray(result)
      ? result
      : result?.rows || [];

    return res.status(201).json({
      message: 'Report saved successfully.',
      report: rows[0] || null,
    });
  } catch (error) {
    console.error(
      'SAVE REPORT ERROR:',
      error
    );

    return res.status(500).json({
      message: error.message,
    });
  }
});


/*
| GET ASSISTANCE PROGRAMS FOR REPORT FILTER
*/
router.get('/assistance-programs', async (req, res) => {
  try {
    const result = await query(`
      SELECT
        program_id,
        program_name
      FROM assistance_programs
      ORDER BY program_name ASC
    `);

    const rows = getRows(result);

    return res.status(200).json({
      programs: rows,
    });
  } catch (error) {
    console.error(
      'GET ASSISTANCE PROGRAMS ERROR:',
      error
    );

    return res.status(500).json({
      error: 'Failed to load assistance programs.',
    });
  }
});


router.get('/:reportId', auth, async (req, res) => {
  try {
    const { reportId } = req.params;

    const result = await query(
      `
      SELECT
        r.report_id,
        r.report_type,
        r.format,
        r.report_date,
        r.filters,
        r.report_data,

        u.full_name AS generated_by

      FROM reports r

      LEFT JOIN users u
        ON u.user_id = r.user_id

      WHERE r.report_id = $1

      LIMIT 1
      `,
      [reportId]
    );

    const rows = Array.isArray(result)
      ? result
      : result?.rows || [];

    if (!rows.length) {
      return res.status(404).json({
        message: 'Report not found.',
      });
    }

    return res.json({
      report: rows[0],
    });
  } catch (error) {
    console.error(
      'GET REPORT ERROR:',
      error
    );

    return res.status(500).json({
      message: error.message,
    });
  }
});

/*
|--------------------------------------------------------------------------
| GET REPORT DATA
|--------------------------------------------------------------------------
*/

router.get(
  '/data/:type',
  async (req, res) => {
    const type =
      normalizeType(
        req.params.type
      );

    if (!type) {
      return res.status(400).json({
        error:
          'Unknown report type.',
      });
    }

    try {
      console.log(
        '=============================================='
      );

      console.log(
        'REPORT DATA REQUEST:',
        {
          type,
          query: req.query,
        }
      );

      /*
      |--------------------------------------------------------------------------
      | DEBUG HOUSEHOLDS
      |--------------------------------------------------------------------------
      */

      if (
        type === 'households' ||
        type === 'analytics'
      ) {
        const countResult =
          await query(`
            SELECT COUNT(*)::int AS count
            FROM households
          `);

        const countRows =
          getRows(countResult);

        console.log(
          'HOUSEHOLDS TABLE COUNT:',
          countRows[0]?.count ?? 0
        );
      }

      /*
      |--------------------------------------------------------------------------
      | BUILD QUERY
      |--------------------------------------------------------------------------
      */

   const reportQuery = buildReportQuery(type, req);

console.log('REPORT TYPE:', type);
console.log('BUILT REPORT QUERY:', reportQuery);

if (!reportQuery) {
  return res.status(400).json({
    error: 'Unable to build report query.',
    type,
  });
}

      console.log(
        'REPORT SQL:',
        reportQuery.sql
      );

      console.log(
        'REPORT PARAMS:',
        reportQuery.params
      );

      /*
      |--------------------------------------------------------------------------
      | EXECUTE
      |--------------------------------------------------------------------------
      */

      const result =
        await query(
          reportQuery.sql,
          reportQuery.params
        );

      const rows =
        getRows(result);

      console.log(
        'REPORT DATA RESULT:',
        rows.length,
        'records'
      );

      console.log(
        'REPORT FIRST ROW:',
        rows[0] || null
      );

      console.log(
        '=============================================='
      );

      return res.json({
        rows,
      });
    } catch (error) {
      console.error(
        `GET /reports/data/${type} ERROR:`,
        error
      );

      return res.status(500).json({
        error:
          error?.message ||
          'Failed to load report data.',
      });
    }
  }
);

/*
|--------------------------------------------------------------------------
| GENERATE CSV
|--------------------------------------------------------------------------
*/

router.get(
  '/csv/:type',
  async (req, res) => {
    try {
      const type =
        normalizeType(
          req.params.type
        );

      if (!type) {
        return res.status(400).json({
          error:
            'Unknown report type.',
        });
      }

      const reportQuery =
        buildReportQuery(
          type,
          req
        );

      if (!reportQuery) {
        return res.status(400).json({
          error:
            'Unable to build report query.',
        });
      }

      const result =
        await query(
          reportQuery.sql,
          reportQuery.params
        );

      const rows =
        getRows(result);

      const csv =
        toCsv(rows);

      await recordReportGeneration(
        req,
        type,
        'CSV',
        req.query,
        rows
      );

      res.setHeader(
        'Content-Type',
        'text/csv; charset=utf-8'
      );

      res.setHeader(
        'Content-Disposition',
        `attachment; filename="${type}-${Date.now()}.csv"`
      );

      return res.send(csv);
    } catch (error) {
      console.error(
        'CSV REPORT ERROR:',
        error
      );

      return res.status(500).json({
        error:
          error?.message ||
          'Failed to generate CSV report.',
      });
    }
  }
);

/*
|--------------------------------------------------------------------------
| BACKWARD COMPATIBILITY
|--------------------------------------------------------------------------
*/

router.get(
  '/generate/:type',
  async (req, res) => {
    try {
      const type =
        normalizeType(
          req.params.type
        );

      if (!type) {
        return res.status(400).json({
          error:
            'Unknown report type.',
        });
      }

      const reportQuery =
        buildReportQuery(
          type,
          req
        );

      if (!reportQuery) {
        return res.status(400).json({
          error:
            'Unable to build report query.',
        });
      }

      const result =
        await query(
          reportQuery.sql,
          reportQuery.params
        );

      const rows =
        getRows(result);

      const csv =
        toCsv(rows);

      await recordReportGeneration(
        req,
        type,
        'CSV'
      );

      res.setHeader(
        'Content-Type',
        'text/csv; charset=utf-8'
      );

      res.setHeader(
        'Content-Disposition',
        `attachment; filename="${type}-${Date.now()}.csv"`
      );

      return res.send(csv);
    } catch (error) {
      console.error(
        'LEGACY CSV REPORT ERROR:',
        error
      );

      return res.status(500).json({
        error:
          error?.message ||
          'Failed to generate CSV report.',
      });
    }
  }
);

module.exports = router;