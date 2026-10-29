const express = require('express');
const router = express.Router();

const { query } = require('../db');
const {
  auth,
  requireRole,
  logActivity,
} = require('../middleware/auth');
const { predictHousehold } = require('../services/ml');

const OCCUPATIONS_WITH_DETAILS = [
  'Self-employed',
  'Government',
  'Private',
];

/*
|--------------------------------------------------------------------------
| Allowed household fields
|--------------------------------------------------------------------------
*/
const HOUSEHOLD_FIELDS = [
  'household_head_name',
  'surname',
  'given_name',
  'middle_name',
  'family_position',
  'family_number',
  'address',
  'purok',
  'residence',
  'length_residency',
  'household_status',
  'sex',
  'age',
  'birthday',
  'birth_place',
  'blood_type',
  'civil_status',
  'disability_present',
  'disability_details',
  'highest_education',
  'occupation',
  'occupation_details',
  'contact_number',
  'religion',
  'ethnicity',
  'business',
  'monthly_income',
  'with_electricity',
  'sanitary_toilet',
  'potable_water_supply',
  'four_ps_member',
  'house_owner',
  'renter',
  'sharer',
  'caretaker',
  'consent',
  'migration_type',
  'migration_destination',
];

/*
|--------------------------------------------------------------------------
| Allowed household member fields
|--------------------------------------------------------------------------
*/
const MEMBER_FIELDS = [
  'relationship_hh',
  'full_name',
  'birthday',
  'age',
  'sex',
  'civil_status',
  'education_attainment',
  'occupation',
  'occupation_details',
  'disability_present',
];

/*
|--------------------------------------------------------------------------
| Pick allowed fields only
|--------------------------------------------------------------------------
*/
function pick(body, allowedFields) {
  const result = {};

  for (const field of allowedFields) {
    if (body[field] !== undefined) {
      result[field] = body[field];
    }
  }

  return result;
}

/*
|--------------------------------------------------------------------------
| Normalize empty strings
|--------------------------------------------------------------------------
| Blank optional inputs become NULL rather than invalid empty dates,
| numbers, or database values.
|--------------------------------------------------------------------------
*/
function normalizeEmptyStrings(data) {
  for (const key of Object.keys(data)) {
    if (data[key] === '') {
      data[key] = null;
    }
  }

  return data;
}

/*
|--------------------------------------------------------------------------
| Normalize occupation
|--------------------------------------------------------------------------
*/
function normalizeOccupation(data) {
  const occupation = String(data.occupation || '').trim();

  if (!occupation) {
    data.occupation = null;
    data.occupation_details = 'None';
    return data;
  }

  data.occupation = occupation;

  if (OCCUPATIONS_WITH_DETAILS.includes(occupation)) {
    const details = String(
      data.occupation_details || ''
    ).trim();

    if (!details) {
      throw new Error(
        `Occupation details are required for ${occupation}.`
      );
    }

    data.occupation_details = details;
  } else {
    data.occupation_details = 'None';
  }

  return data;
}

/*
|--------------------------------------------------------------------------
| Prepare a complete household name
|--------------------------------------------------------------------------
*/
function prepareHouseholdName(data) {
  const parts = [
    data.given_name,
    data.middle_name,
    data.surname,
  ]
    .map((value) => String(value || '').trim())
    .filter(Boolean);

  if (!data.household_head_name && parts.length) {
    data.household_head_name = parts.join(' ');
  }

  return data;
}

/*
|--------------------------------------------------------------------------
| Normalize member occupation, including partial updates
|--------------------------------------------------------------------------
*/
function normalizeMemberOccupation(data, existing = {}) {
  const merged = {
    ...existing,
    ...data,
  };

  const occupation = String(
    merged.occupation || ''
  ).trim();

  if (!occupation) {
    merged.occupation = null;
    merged.occupation_details = '';
  } else {
    merged.occupation = occupation;

    if (OCCUPATIONS_WITH_DETAILS.includes(occupation)) {
      const details = String(
        merged.occupation_details || ''
      ).trim();

      if (!details) {
        throw new Error(
          `Occupation details are required for ${occupation}.`
        );
      }

      merged.occupation_details = details;
    } else {
      merged.occupation_details = 'None';
    }
  }

  return merged;
}

/*
|--------------------------------------------------------------------------
| Generic safe update helper
|--------------------------------------------------------------------------
| Column names come exclusively from fixed allowlists.
|--------------------------------------------------------------------------
*/
async function updateById(
  table,
  idColumn,
  id,
  data,
  allowedFields
) {
  const safeData = pick(data, allowedFields);
  const keys = Object.keys(safeData);

  if (!keys.length) {
    return null;
  }

  const params = keys.map((key) => safeData[key]);
  params.push(id);

  const sets = keys
    .map((key, index) => `${key} = $${index + 1}`)
    .join(', ');

  const rows = await query(
    `
      UPDATE ${table}
      SET ${sets}
      WHERE ${idColumn} = $${params.length}
      RETURNING *
    `,
    params
  );

  return rows[0] || null;
}

/*
|--------------------------------------------------------------------------
| Authentication
|--------------------------------------------------------------------------
*/
router.use(auth);

/*
|--------------------------------------------------------------------------
| GET ALL HOUSEHOLDS
|--------------------------------------------------------------------------
*/
router.get('/', async (req, res) => {
  try {
    const {
      validation_status,
      purok,
      q,
    } = req.query;

    const conditions = [];
    const params = [];

    if (validation_status) {
      params.push(validation_status);
      conditions.push(
        `h.validation_status = $${params.length}`
      );
    }

    if (purok) {
      params.push(`%${purok}%`);
      conditions.push(
        `h.purok ILIKE $${params.length}`
      );
    }

    if (q) {
      params.push(`%${q}%`);

      conditions.push(`
        (
          h.household_head_name ILIKE $${params.length}
          OR h.surname ILIKE $${params.length}
          OR h.address ILIKE $${params.length}
        )
      `);
    }

    const rows = await query(
      `
        SELECT
          h.*,
          u.full_name AS encoded_by
        FROM households h
        LEFT JOIN users u
          ON u.user_id = h.user_id
        ${conditions.length
          ? `WHERE ${conditions.join(' AND ')}`
          : ''}
        ORDER BY h.created_at DESC
      `,
      params
    );

    res.json({ households: rows });
  } catch (error) {
    console.error('GET /households error:', error);

    res.status(500).json({
      error: 'Failed to load household records.',
    });
  }
});



router.post('/check-duplicate', async (req, res) => {
  try {
    const {
      surname,
      given_name,
      middle_name,
      address,
      purok,
      exclude_household_id,
    } = req.body || {};

    if (
      !String(surname || '').trim() ||
      !String(given_name || '').trim() ||
      !String(address || '').trim() ||
      !String(purok || '').trim()
    ) {
      return res.status(400).json({
        error: 'Surname, given name, address, and Purok are required.',
      });
    }

    const result = await query(
      `
        SELECT household_id
        FROM households
        WHERE LOWER(TRIM(COALESCE(surname, ''))) =
              LOWER(TRIM($1))
          AND LOWER(TRIM(COALESCE(given_name, ''))) =
              LOWER(TRIM($2))
          AND LOWER(TRIM(COALESCE(middle_name, ''))) =
              LOWER(TRIM($3))
          AND LOWER(TRIM(COALESCE(address, ''))) =
              LOWER(TRIM($4))
          AND LOWER(TRIM(COALESCE(purok, ''))) =
              LOWER(TRIM($5))
          AND (
            $6::text IS NULL
            OR household_id::text <> $6::text
          )
        LIMIT 1
      `,
      [
        String(surname).trim(),
        String(given_name).trim(),
        String(middle_name || '').trim(),
        String(address).trim(),
        String(purok).trim(),
        exclude_household_id || null,
      ]
    );

    // Return true only if a matching record was found.
    return res.json({
      duplicate: result.length > 0,
      household_id: result.length > 0
        ? result[0].household_id
        : null,
    });
  } catch (error) {
    console.error('Duplicate household check failed:', error);

    return res.status(500).json({
      error: 'Unable to check for duplicate household.',
    });
  }
});


/*
|--------------------------------------------------------------------------
| GET SINGLE HOUSEHOLD AND MEMBERS
|--------------------------------------------------------------------------
*/

/*
|--------------------------------------------------------------------------
| GET SINGLE HOUSEHOLD AND MEMBERS
|--------------------------------------------------------------------------
*/
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    // Fetch the household record.
    const households = await query(
      `
        SELECT *
        FROM households
        WHERE household_id = $1
        LIMIT 1
      `,
      [id]
    );

    if (!households.length) {
      return res.status(404).json({
        error: 'Household not found.',
      });
    }

    const household = households[0];

    // Fetch every member belonging to this household.
    const members = await query(
      `
        SELECT *
        FROM household_members
        WHERE household_id = $1
        ORDER BY full_name ASC
      `,
      [id]
    );

    // The drawer and edit form both expect this response shape.
    return res.status(200).json({
      household,
      members,
    });
  } catch (error) {
    console.error('GET /households/:id error:', error);

    return res.status(500).json({
      error: 'Failed to load household details.',
      details:
        process.env.NODE_ENV === 'development'
          ? error.message
          : undefined,
    });
  }
});

/*
|--------------------------------------------------------------------------
| GET ALL HOUSEHOLDS — SEARCH BY NAME AND OTHER FIELDS
|--------------------------------------------------------------------------
*/

/*
|--------------------------------------------------------------------------
| CREATE HOUSEHOLD
|--------------------------------------------------------------------------
*/
router.post(
  '/',
  requireRole('admin', 'staff'),
  async (req, res) => {
    try {
      let data = pick(
        req.body || {},
        HOUSEHOLD_FIELDS
      );

      data = normalizeEmptyStrings(data);
      data = prepareHouseholdName(data);

      if (!data.household_head_name || !data.address) {
        return res.status(400).json({
          error: 'Household head name and address are required.',
        });
      }

      try {
        normalizeOccupation(data);
      } catch (error) {
        return res.status(400).json({
          error: error.message,
        });
      }

      const keys = Object.keys(data);

      const userId =
        req.user?.users ||
        req.user?.user_id ||
        req.user?.sub;

      if (!userId) {
        return res.status(401).json({
          error: 'Authenticated user ID is missing.',
        });
      }

      const params = [
        userId,
        ...keys.map((key) => data[key]),
      ];

      const columns = keys.join(', ');

      const placeholders = keys
        .map((key, index) => `$${index + 2}`)
        .join(', ');

      const rows = await query(
        `
          INSERT INTO households (
            user_id,
            ${columns}
          )
          VALUES (
            $1,
            ${placeholders}
          )
          RETURNING *
        `,
        params
      );

      const household = rows[0];

      await logActivity(
        req,
        'ENCODE_HOUSEHOLD',
        `Encoded household "${household.household_head_name}".`
      );

      /*
       * Run ML prediction without automatically validating
       * the household.
       */
      try {
        const prediction = await predictHousehold(household);

        await query(
          `
            UPDATE households
            SET
              vulnerability = $1,
              vulnerability_prob = $2,
              suggested_programs = $3
            WHERE household_id = $4
          `,
          [
            prediction.vulnerability,
            prediction.vulnerability_prob,
            prediction.suggested_programs,
            household.household_id,
          ]
        );
      } catch (mlError) {
        console.error(
          'Household created, but ML prediction failed:',
          mlError
        );
      }

      const updated = await query(
        `
          SELECT *
          FROM households
          WHERE household_id = $1
        `,
        [household.household_id]
      );

      res.status(201).json({
        household: updated[0],
      });
    } catch (error) {
      console.error('POST /households error:', error);

      res.status(500).json({
        error: error.message || 'Failed to create household.',
      });
    }
  }
);

/*
|--------------------------------------------------------------------------
| UPDATE HOUSEHOLD
|--------------------------------------------------------------------------
*/
router.put(
  '/:id',
  requireRole('admin', 'staff'),
  async (req, res) => {
    try {
      let data = pick(
        req.body || {},
        HOUSEHOLD_FIELDS
      );

      data = normalizeEmptyStrings(data);
      data = prepareHouseholdName(data);

      if (!Object.keys(data).length) {
        return res.status(400).json({
          error: 'Nothing to update.',
        });
      }

      /*
       * Preserve occupation details during unrelated updates.
       * Validate the merged occupation when occupation changes.
       */
      if (
        data.occupation !== undefined ||
        data.occupation_details !== undefined
      ) {
        const existingRows = await query(
          `
            SELECT occupation, occupation_details
            FROM households
            WHERE household_id = $1
          `,
          [req.params.id]
        );

        if (!existingRows.length) {
          return res.status(404).json({
            error: 'Household not found.',
          });
        }

        const merged = {
          ...existingRows[0],
          ...data,
        };

        try {
          normalizeOccupation(merged);
        } catch (error) {
          return res.status(400).json({
            error: error.message,
          });
        }

        data.occupation = merged.occupation;
        data.occupation_details =
          merged.occupation_details;
      }

      const household = await updateById(
        'households',
        'household_id',
        req.params.id,
        data,
        HOUSEHOLD_FIELDS
      );

      if (!household) {
        return res.status(404).json({
          error: 'Household not found.',
        });
      }

      await logActivity(
        req,
        'UPDATE_HOUSEHOLD',
        `Updated household "${household.household_head_name}".`
      );

      /*
       * Re-run ML after household information changes.
       * Do not change validation_status automatically.
       */
      try {
        const prediction = await predictHousehold(household);

        await query(
          `
            UPDATE households
SET
    vulnerability = $1,
    vulnerability_prob = $2,
    suggested_programs = $3,
    validation_status = 'Validated'
WHERE household_id = $4;
          `,
          [
            prediction.vulnerability,
            prediction.vulnerability_prob,
            prediction.suggested_programs,
            household.household_id,
          ]
        );
      } catch (mlError) {
        console.error(
          'Household updated, but ML prediction failed:',
          mlError
        );
      }

      const updated = await query(
        `
          SELECT *
          FROM households
          WHERE household_id = $1
        `,
        [req.params.id]
      );

      res.json({
        household: updated[0],
      });
    } catch (error) {
      console.error('PUT /households/:id error:', error);

      res.status(500).json({
        error: error.message || 'Failed to update household.',
      });
    }
  }
);

/*
|--------------------------------------------------------------------------
| ADD HOUSEHOLD MEMBER
|--------------------------------------------------------------------------
*/
router.post(
  '/:id/members',
  requireRole('admin', 'staff'),
  async (req, res) => {
    try {
      const householdRows = await query(
        `
          SELECT household_id
          FROM households
          WHERE household_id = $1
        `,
        [req.params.id]
      );

      if (!householdRows.length) {
        return res.status(404).json({
          error: 'Household not found.',
        });
      }

      let data = pick(
        req.body || {},
        MEMBER_FIELDS
      );

      data = normalizeEmptyStrings(data);

      if (!data.full_name) {
        return res.status(400).json({
          error: 'Member full name is required.',
        });
      }

      try {
        data = normalizeMemberOccupation(data);
      } catch (error) {
        return res.status(400).json({
          error: error.message,
        });
      }

      const keys = Object.keys(data);

      const params = [
        req.params.id,
        ...keys.map((key) => data[key]),
      ];

      const placeholders = keys
        .map((key, index) => `$${index + 2}`)
        .join(', ');

      const rows = await query(
        `
          INSERT INTO household_members (
            household_id,
            ${keys.join(', ')}
          )
          VALUES (
            $1,
            ${placeholders}
          )
          RETURNING *
        `,
        params
      );

      await logActivity(
        req,
        'ADD_MEMBER',
        `Added member "${rows[0].full_name}".`
      );

      res.status(201).json({
        member: rows[0],
      });
    } catch (error) {
      console.error(
        'POST /households/:id/members error:',
        error
      );

      res.status(500).json({
        error: error.message || 'Failed to add household member.',
      });
    }
  }
);

/*
|--------------------------------------------------------------------------
| UPDATE HOUSEHOLD MEMBER
|--------------------------------------------------------------------------
*/
router.put(
  '/members/:memberId',
  requireRole('admin', 'staff'),
  async (req, res) => {
    try {
      let data = pick(
        req.body || {},
        MEMBER_FIELDS
      );

      data = normalizeEmptyStrings(data);

      if (!Object.keys(data).length) {
        return res.status(400).json({
          error: 'Nothing to update.',
        });
      }

      if (
        data.occupation !== undefined ||
        data.occupation_details !== undefined
      ) {
        const existingRows = await query(
          `
            SELECT occupation, occupation_details
            FROM household_members
            WHERE member_id = $1
          `,
          [req.params.memberId]
        );

        if (!existingRows.length) {
          return res.status(404).json({
            error: 'Member not found.',
          });
        }

        try {
          const merged = normalizeMemberOccupation(
            data,
            existingRows[0]
          );

          data.occupation = merged.occupation;
          data.occupation_details =
            merged.occupation_details;
        } catch (error) {
          return res.status(400).json({
            error: error.message,
          });
        }
      }

      const member = await updateById(
        'household_members',
        'member_id',
        req.params.memberId,
        data,
        MEMBER_FIELDS
      );

      if (!member) {
        return res.status(404).json({
          error: 'Member not found.',
        });
      }

      await logActivity(
        req,
        'UPDATE_MEMBER',
        `Updated member "${member.full_name}".`
      );

      res.json({ member });
    } catch (error) {
      console.error(
        'PUT /households/members/:memberId error:',
        error
      );

      res.status(500).json({
        error: error.message || 'Failed to update member.',
      });
    }
  }
);

/*
|--------------------------------------------------------------------------
| DELETE HOUSEHOLD MEMBER
|--------------------------------------------------------------------------
*/
router.delete(
  '/members/:memberId',
  requireRole('admin', 'staff'),
  async (req, res) => {
    try {
      const rows = await query(
        `
          DELETE FROM household_members
          WHERE member_id = $1
          RETURNING full_name
        `,
        [req.params.memberId]
      );

      if (!rows.length) {
        return res.status(404).json({
          error: 'Member not found.',
        });
      }

      await logActivity(
        req,
        'DELETE_MEMBER',
        `Removed member "${rows[0].full_name}".`
      );

      res.json({ success: true });
    } catch (error) {
      console.error(
        'DELETE /households/members/:memberId error:',
        error
      );

      res.status(500).json({
        error: error.message || 'Failed to delete member.',
      });
    }
  }
);

module.exports = router;