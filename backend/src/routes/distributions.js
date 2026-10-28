
const express = require('express');
const router = express.Router();

const { query } = require('../db');
const { auth, requireRole, logActivity } = require('../middleware/auth');

router.use(auth);

/* ======================================================
   HELPERS
====================================================== */

function getRows(result) {
  if (Array.isArray(result)) return result;
  if (Array.isArray(result?.rows)) return result.rows;
  return [];
}

function validAmount(value) {
  return (
    value !== undefined &&
    value !== null &&
    String(value).trim() !== '' &&
    Number.isFinite(Number(value)) &&
    Number(value) > 0
  );
}

function isUuid(value) {
  return (
    typeof value === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      value
    )
  );
}

function todayISO() {
  const now = new Date();
  const pad = (value) => String(value).padStart(2, '0');

  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(
    now.getDate()
  )}`;
}

function isValidDateOnly(value) {
  if (
    typeof value !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}$/.test(value)
  ) {
    return false;
  }

  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));

  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

function validatePeriod(periodStart, periodEnd) {
  if (
    !isValidDateOnly(periodStart) ||
    !isValidDateOnly(periodEnd)
  ) {
    return 'A valid period start and end date are required (YYYY-MM-DD).';
  }

  if (periodEnd < periodStart) {
    return 'The period end date cannot be before the start date.';
  }

  return null;
}

function isAlreadyReleased(row) {
  return (
    String(row?.release_status ?? '')
      .trim()
      .toLowerCase() === 'released'
  );
}

async function isCaptainApproved(householdId, programId) {
  const result = await query(
    `
    SELECT 1
    FROM beneficiary_validation
    WHERE household_id = $1
      AND program_id = $2
      AND LOWER(TRIM(validation_status)) = 'approved'
      AND approved_by IS NOT NULL
      AND approved_at IS NOT NULL
    LIMIT 1
    `,
    [householdId, programId]
  );

  return getRows(result).length > 0;
}

async function programExists(programId) {
  const result = await query(
    `
    SELECT program_id
    FROM assistance_programs
    WHERE program_id = $1
    LIMIT 1
    `,
    [programId]
  );

  return getRows(result).length > 0;
}

/* ======================================================
   GET /distributions/approved?program_id=...

   Return Captain-approved households for one program.
====================================================== */

router.get('/approved', requireRole('staff'), async (req, res) => {
  try {
    const { program_id } = req.query;

    if (!isUuid(program_id)) {
      return res.status(400).json({
        error: 'A valid program_id is required.',
      });
    }

    const result = await query(
      `
      SELECT DISTINCT ON (h.household_id)
        h.household_id,
        h.household_head_name,
        h.purok,
        h.vulnerability,
        bv.program_id,
        bv.validation_status,
        bv.approved_by,
        bv.approved_at
      FROM beneficiary_validation bv
      INNER JOIN households h
        ON h.household_id = bv.household_id
      WHERE bv.program_id = $1
        AND LOWER(TRIM(bv.validation_status)) = 'approved'
        AND bv.approved_by IS NOT NULL
        AND bv.approved_at IS NOT NULL
      ORDER BY
        h.household_id,
        bv.approved_at DESC NULLS LAST
      `,
      [program_id]
    );

    return res.json({
      households: getRows(result),
    });
  } catch (error) {
    console.error('GET /distributions/approved error:', error);

    return res.status(500).json({
      error: error.message || 'Failed to load approved households.',
    });
  }
});

/* ======================================================
   POST /distributions/load-period

   Create missing distribution records for the selected
   program and exact date range.

   Existing records, including Released records, are
   preserved when this endpoint is called again.
====================================================== */

router.post('/load-period', requireRole('staff'), async (req, res) => {
  try {
    const {
      program_id,
      period_start,
      period_end,
    } = req.body || {};

    if (!isUuid(program_id)) {
      return res.status(400).json({
        error: 'A valid program_id is required.',
      });
    }

    const periodError = validatePeriod(period_start, period_end);

    if (periodError) {
      return res.status(400).json({ error: periodError });
    }

    if (!(await programExists(program_id))) {
      return res.status(404).json({
        error: 'Assistance program not found.',
      });
    }

    const insertResult = await query(
      `
      INSERT INTO ml_assistance_distribution (
    household_id,
    program_id,
    amount_released,
    status,
    release_status,
    release_date,
    period_start,
    period_end
)
SELECT DISTINCT
    bv.household_id,
    bv.program_id,
    CAST(NULL AS NUMERIC(12,2)),
    'Approved',
    'Not Released',
    CAST(NULL AS DATE),
    CAST($2 AS DATE),
    CAST($3 AS DATE)
FROM beneficiary_validation AS bv
INNER JOIN households AS h
    ON h.household_id = bv.household_id
WHERE bv.program_id = $1::uuid
  AND LOWER(TRIM(bv.validation_status)) = 'approved'
  AND bv.approved_by IS NOT NULL
  AND bv.approved_at IS NOT NULL
ON CONFLICT (
    household_id,
    program_id,
    period_start,
    period_end
)
WHERE period_start IS NOT NULL
  AND period_end IS NOT NULL
DO NOTHING
RETURNING distribution_id;
      `,
      [program_id, period_start, period_end]
    );

    const created = getRows(insertResult).length;

    const result = await query(
      `
      SELECT
        d.distribution_id,
        d.household_id,
        d.program_id,
        d.amount_released,
        d.status,
        d.release_status,
        d.release_date,
        d.period_start,
        d.period_end,
        d.created_at,
        h.household_head_name,
        h.purok,
        h.vulnerability,
        p.program_name
      FROM ml_assistance_distribution d
      INNER JOIN households h
        ON h.household_id = d.household_id
      INNER JOIN assistance_programs p
        ON p.program_id = d.program_id
      WHERE d.program_id = $1
        AND d.period_start = $2::date
        AND d.period_end = $3::date
      ORDER BY h.household_head_name
      `,
      [program_id, period_start, period_end]
    );

    const distributions = getRows(result);

    await logActivity(
      req,
      'LOAD_ASSISTANCE_PERIOD',
      `Loaded period ${period_start} to ${period_end} for program ${program_id}. Created ${created} new record(s).`
    );

    return res.json({
      message: 'Distribution period loaded successfully.',
      created,
      total: distributions.length,
      distributions,
    });
  } catch (error) {
    console.error('POST /distributions/load-period error:', error);

    return res.status(500).json({
      error: error.message || 'Failed to load the distribution period.',
    });
  }
});

/* ======================================================
   GET /distributions

   Optional query parameters:
     program_id
     period_start
     period_end

   If a period is provided, return only records for that
   exact period.
====================================================== */

router.get('/', async (req, res) => {
  try {
    const {
      program_id,
      period_start,
      period_end,
    } = req.query;

    if (program_id && !isUuid(program_id)) {
      return res.status(400).json({
        error: 'Invalid program_id.',
      });
    }

    const hasStart = Boolean(period_start);
    const hasEnd = Boolean(period_end);

    if (hasStart !== hasEnd) {
      return res.status(400).json({
        error: 'Both period_start and period_end are required.',
      });
    }

    if (hasStart) {
      const periodError = validatePeriod(period_start, period_end);

      if (periodError) {
        return res.status(400).json({ error: periodError });
      }
    }

    const conditions = [];
    const params = [];

    if (program_id) {
      params.push(program_id);
      conditions.push(`d.program_id = $${params.length}`);
    }

    if (hasStart) {
      params.push(period_start);
      conditions.push(`d.period_start = $${params.length}::date`);

      params.push(period_end);
      conditions.push(`d.period_end = $${params.length}::date`);
    }

    let sql = `
      SELECT
        d.distribution_id,
        d.household_id,
        d.program_id,
        d.amount_released,
        d.status,
        d.release_status,
        d.release_date,
        d.period_start,
        d.period_end,
        d.created_at,
        h.household_head_name,
        h.purok,
        h.vulnerability,
        p.program_name
      FROM ml_assistance_distribution d
      INNER JOIN households h
        ON h.household_id = d.household_id
      INNER JOIN assistance_programs p
        ON p.program_id = d.program_id
    `;

    if (conditions.length > 0) {
      sql += ` WHERE ${conditions.join(' AND ')}`;
    }

    sql += ' ORDER BY d.created_at DESC, d.distribution_id';

    const result = await query(sql, params);

    return res.json({
      distributions: getRows(result),
    });
  } catch (error) {
    console.error('GET /distributions error:', error);

    return res.status(500).json({
      error: error.message || 'Failed to load distributions.',
    });
  }
});

/* ======================================================
   POST /distributions/bulk

   Save amounts for the selected program and period.

   A distribution from a different period is never used
   as the existing record for this request.
====================================================== */

router.post('/bulk', requireRole('staff'), async (req, res) => {
  try {
    const {
      program_id,
      period_start,
      period_end,
      items,
    } = req.body || {};

    if (!isUuid(program_id)) {
      return res.status(400).json({
        error: 'A valid program_id is required.',
      });
    }

    const periodError = validatePeriod(period_start, period_end);

    if (periodError) {
      return res.status(400).json({ error: periodError });
    }

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({
        error: 'At least one household is required.',
      });
    }

    if (!(await programExists(program_id))) {
      return res.status(404).json({
        error: 'Assistance program not found.',
      });
    }

    const seen = new Set();

    for (const item of items) {
      if (
        !isUuid(item?.household_id) ||
        !validAmount(item?.amount)
      ) {
        return res.status(400).json({
          error:
            'Each household must have a valid household ID and an amount greater than zero.',
        });
      }

      const id = item.household_id.toLowerCase();

      if (seen.has(id)) {
        return res.status(400).json({
          error: `Household ${item.household_id} appears more than once.`,
        });
      }

      seen.add(id);
    }

    /*
     * Validate every item before writing any records.
     */
    const checkedItems = [];

    for (const item of items) {
      const householdResult = await query(
        `
        SELECT household_id, household_head_name
        FROM households
        WHERE household_id = $1
        LIMIT 1
        `,
        [item.household_id]
      );

      const household = getRows(householdResult)[0];

      if (!household) {
        return res.status(404).json({
          error: `Household ${item.household_id} was not found.`,
        });
      }

      const approved = await isCaptainApproved(
        item.household_id,
        program_id
      );

      if (!approved) {
        return res.status(400).json({
          error: `${
            household.household_head_name || item.household_id
          } has not been approved for this program by the captain.`,
        });
      }

      /*
       * Important: this lookup includes the selected period.
       * It will not find last month's distribution.
       */
      const existingResult = await query(
        `
        SELECT
          distribution_id,
          status,
          release_status,
          amount_released,
          period_start,
          period_end
        FROM ml_assistance_distribution
        WHERE household_id = $1
          AND program_id = $2
          AND period_start = $3::date
          AND period_end = $4::date
        LIMIT 1
        `,
        [
          item.household_id,
          program_id,
          period_start,
          period_end,
        ]
      );

      const existing = getRows(existingResult)[0];

      if (existing && isAlreadyReleased(existing)) {
        return res.status(409).json({
          error: `${
            household.household_head_name || item.household_id
          } has already received this assistance for the selected period. The released record cannot be changed.`,
        });
      }

      checkedItems.push({
        household,
        householdId: item.household_id,
        amount: Number(item.amount),
        existing,
      });
    }

    const saved = [];

    for (const item of checkedItems) {
      if (item.existing) {
        const updateResult = await query(
          `
          UPDATE ml_assistance_distribution
SET
  amount_released = $2::numeric,
  status = 'Approved'
WHERE distribution_id = $1
  AND period_start = $3::date
  AND period_end = $4::date
  AND LOWER(
    TRIM(COALESCE(release_status, 'Not Released'))
  ) IN ('not released', '')
RETURNING *
          `,
          [
            item.existing.distribution_id,
            item.amount,
            period_start,
            period_end,
          ]
        );

        const updatedRows = getRows(updateResult);

        if (updatedRows.length === 0) {
          return res.status(409).json({
            error: `${
              item.household.household_head_name || item.householdId
            } could not be updated. It may have already been released. Refresh and try again.`,
            saved,
          });
        }

        saved.push(...updatedRows);
        continue;
      }

      /*
       * No record exists for this household/program/period.
       * Insert a new one and let the unique index prevent
       * duplicate records if two requests race.
       */
      const insertResult = await query(
  `
  INSERT INTO ml_assistance_distribution (
    household_id,
    program_id,
    amount_released,
    status,
    release_status,
    release_date,
    period_start,
    period_end
  )
  SELECT DISTINCT
    bv.household_id,
    bv.program_id,
    CAST(NULL AS NUMERIC),
    CAST('Approved' AS VARCHAR),
    CAST('Not Released' AS VARCHAR),
    CAST(NULL AS DATE),
    CAST($2 AS DATE),
    CAST($3 AS DATE)
  FROM beneficiary_validation bv
  INNER JOIN households h
    ON h.household_id = bv.household_id
  WHERE bv.program_id = $1::uuid
    AND LOWER(TRIM(bv.validation_status)) = 'approved'
    AND bv.approved_by IS NOT NULL
    AND bv.approved_at IS NOT NULL
  ON CONFLICT (
    household_id,
    program_id,
    period_start,
    period_end
  )
  WHERE period_start IS NOT NULL
    AND period_end IS NOT NULL
  DO NOTHING
  RETURNING distribution_id
  `,
  [program_id, period_start, period_end]
);

      const insertedRows = getRows(insertResult);

      if (insertedRows.length === 0) {
        return res.status(409).json({
          error:
            `A distribution already exists for ${
              item.household.household_head_name || item.householdId
            } in this period. Refresh and try again.`,
          saved,
        });
      }

      // Add returned rows once only.
      saved.push(...insertedRows);
    }

    await logActivity(
      req,
      'ASSIGN_ASSISTANCE',
      `Saved amounts for ${saved.length} distribution(s), program ${program_id}, period ${period_start} to ${period_end}.`
    );

    return res.json({
      message: 'Assistance amounts saved successfully.',
      count: saved.length,
      distributions: saved,
    });
  } catch (error) {
    console.error('POST /distributions/bulk error:', error);

    return res.status(500).json({
      error: error.message || 'Failed to save distribution amounts.',
    });
  }
});

/* ======================================================
   PATCH /distributions/:id/amount

   Legacy amount-edit endpoint. Released records cannot
   be changed.
====================================================== */

router.patch('/:id/amount', requireRole('staff'), async (req, res) => {
  try {
    const { id } = req.params;
    const { amount_released } = req.body || {};

    if (!isUuid(id)) {
      return res.status(400).json({
        error: 'Invalid distribution ID.',
      });
    }

    if (!validAmount(amount_released)) {
      return res.status(400).json({
        error: 'Enter an amount greater than zero.',
      });
    }

    const result = await query(
      `
      UPDATE ml_assistance_distribution
      SET amount_released = $2::numeric
      WHERE distribution_id = $1
        AND LOWER(TRIM(status)) = 'approved'
        AND LOWER(
          TRIM(COALESCE(release_status, 'Not Released'))
        ) IN ('not released', '')
      RETURNING *
      `,
      [id, Number(amount_released)]
    );

    const rows = getRows(result);

    if (rows.length === 0) {
      return res.status(409).json({
        error:
          'Distribution not found, not approved, or already released.',
      });
    }

    await logActivity(
      req,
      'UPDATE_ASSISTANCE_AMOUNT',
      `Updated amount for distribution ${id}.`
    );

    return res.json({
      message: 'Assistance amount saved successfully.',
      distribution: rows[0],
    });
  } catch (error) {
    console.error('PATCH /distributions/:id/amount error:', error);

    return res.status(500).json({
      error: error.message || 'Failed to save assistance amount.',
    });
  }
});

/* ======================================================
   POST /distributions/release

   Required body:
     distribution_ids: UUID[]
     release_date: YYYY-MM-DD
     period_start: YYYY-MM-DD
     period_end: YYYY-MM-DD

   Every selected ID must be eligible in the selected
   period, or the SQL updates none of them.
====================================================== */

router.post('/release', requireRole('staff'), async (req, res) => {
  try {
    const {
      distribution_ids,
      release_date,
      period_start,
      period_end,
    } = req.body || {};

    const periodError = validatePeriod(period_start, period_end);

    if (periodError) {
      return res.status(400).json({ error: periodError });
    }

    if (
      !Array.isArray(distribution_ids) ||
      distribution_ids.length === 0
    ) {
      return res.status(400).json({
        error: 'Select at least one distribution.',
      });
    }

    if (!distribution_ids.every(isUuid)) {
      return res.status(400).json({
        error: 'Every distribution ID must be a valid UUID.',
      });
    }

    const ids = [
      ...new Set(distribution_ids.map((id) => id.toLowerCase())),
    ];

    if (ids.length !== distribution_ids.length) {
      return res.status(400).json({
        error: 'Duplicate distribution IDs were supplied.',
      });
    }

    if (!isValidDateOnly(release_date)) {
      return res.status(400).json({
        error: 'Invalid receipt date. Use YYYY-MM-DD.',
      });
    }

    if (release_date > todayISO()) {
      return res.status(400).json({
        error: 'Receipt date cannot be in the future.',
      });
    }

    const result = await query(
      `
      WITH eligible AS MATERIALIZED (
        SELECT distribution_id
        FROM ml_assistance_distribution
        WHERE distribution_id = ANY($1::uuid[])
          AND period_start = $3::date
          AND period_end = $4::date
          AND LOWER(TRIM(status)) = 'approved'
          AND LOWER(
            TRIM(COALESCE(release_status, 'Not Released'))
          ) IN ('not released', '')
          AND amount_released IS NOT NULL
          AND amount_released > 0
        FOR UPDATE
      ),
      updated AS (
        UPDATE ml_assistance_distribution AS d
        SET
          release_status = 'Released',
          release_date = $2::date
        FROM eligible AS e
        WHERE d.distribution_id = e.distribution_id
          AND (
            SELECT COUNT(*) FROM eligible
          ) = cardinality($1::uuid[])
        RETURNING
          d.distribution_id,
          d.household_id,
          d.program_id,
          d.amount_released,
          d.status,
          d.release_status,
          d.release_date,
          d.period_start,
          d.period_end
      )
      SELECT *
      FROM updated
      `,
      [ids, release_date, period_start, period_end]
    );

    const releasedRows = getRows(result);

    if (releasedRows.length !== ids.length) {
      return res.status(409).json({
        error:
          'No distributions were released. Every selected distribution must belong to the selected period, be approved, have a valid saved amount, and still be Not Released. Refresh and try again.',
      });
    }

    await logActivity(
      req,
      'RELEASE_ASSISTANCE',
      `Marked ${releasedRows.length} distribution(s) as received on ${release_date}, period ${period_start} to ${period_end}.`
    );

    return res.json({
      message: 'Selected assistance receipt recorded successfully.',
      count: releasedRows.length,
      released: releasedRows,
    });
  } catch (error) {
    console.error('POST /distributions/release error:', error);

    return res.status(500).json({
      error: error.message || 'Failed to mark assistance as received.',
    });
  }
});

/* ======================================================
   POST /distributions

   Legacy single-record creation.
   Period is required to keep new records consistent
   with monthly/custom distribution tracking.
====================================================== */

router.post('/', requireRole('staff'), async (req, res) => {
  try {
    const {
      household_id,
      program_id,
      amount,
      period_start,
      period_end,
    } = req.body || {};

    if (!isUuid(household_id) || !isUuid(program_id)) {
      return res.status(400).json({
        error: 'Valid household_id and program_id are required.',
      });
    }

    if (!validAmount(amount)) {
      return res.status(400).json({
        error: 'Amount must be greater than zero.',
      });
    }

    const periodError = validatePeriod(period_start, period_end);

    if (periodError) {
      return res.status(400).json({ error: periodError });
    }

    const householdResult = await query(
      `
      SELECT household_id, household_head_name
      FROM households
      WHERE household_id = $1
      LIMIT 1
      `,
      [household_id]
    );

    const household = getRows(householdResult)[0];

    if (!household) {
      return res.status(404).json({
        error: 'Household not found.',
      });
    }

    if (!(await programExists(program_id))) {
      return res.status(404).json({
        error: 'Assistance program not found.',
      });
    }

    const approved = await isCaptainApproved(household_id, program_id);

    if (!approved) {
      return res.status(400).json({
        error:
          'Only Captain-approved beneficiaries can be assigned assistance.',
      });
    }

    const result = await query(
      `
      INSERT INTO ml_assistance_distribution (
        household_id,
        program_id,
        amount_released,
        status,
        release_status,
        release_date,
        period_start,
        period_end
      )
      VALUES (
  $1,
  $2,
  $3::numeric,
  'Approved',
  'Not Released',
  NULL
)
RETURNING *
      ON CONFLICT (
        household_id,
        program_id,
        period_start,
        period_end
      )
      WHERE period_start IS NOT NULL
        AND period_end IS NOT NULL
      DO NOTHING
      RETURNING *
      `,
      [
        household_id,
        program_id,
        Number(amount),
        period_start,
        period_end,
      ]
    );

    const rows = getRows(result);

    if (rows.length === 0) {
      return res.status(409).json({
        error:
          'A distribution already exists for this household and program in the selected period.',
      });
    }

    await logActivity(
      req,
      'ASSIGN_ASSISTANCE',
      `Saved assistance for "${household.household_head_name}" for period ${period_start} to ${period_end}.`
    );

    return res.status(201).json({
      message: 'Assistance amount saved successfully.',
      distribution: rows[0],
    });
  } catch (error) {
    console.error('POST /distributions error:', error);

    return res.status(500).json({
      error: error.message || 'Failed to create distribution.',
    });
  }
});

module.exports = router;
