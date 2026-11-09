const express = require('express');
const router = express.Router();

const multer = require('multer');
const { randomUUID } = require('crypto');
const { createClient } = require('@supabase/supabase-js');

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
  'monthly_income',
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

function hasIncomeProofImages(household) {
  return (
    Array.isArray(household?.income_proof_images) &&
    household.income_proof_images.some(
      (path) => typeof path === 'string' && path.trim().length > 0
    )
  );
}

function applyIncomeProofGate(prediction, household) {
  const suggestedPrograms = hasIncomeProofImages(household)
    ? (
        Array.isArray(prediction?.suggested_programs)
          ? prediction.suggested_programs
          : []
      )
    : [];

  return {
    ...prediction,
    suggested_programs: suggestedPrograms,
  };
}



async function refreshHouseholdPrediction(householdId) {
  console.log('[PREDICT] Step 1: Fetching household:', householdId);

  try {
    const rows = await query(
      `
        SELECT *
        FROM households
        WHERE household_id = $1
        LIMIT 1
      `,
      [householdId]
    );

    if (!rows.length) {
      throw new Error('Household not found.');
    }

    console.log('[PREDICT] Step 2: Household fetched successfully.');

    console.log('[PREDICT] Step 3: Calling ML service.');

const rawPrediction = await predictHousehold(rows[0]);

const prediction = applyIncomeProofGate(
  rawPrediction,
  rows[0]
);

    console.log('[PREDICT] Step 4: ML prediction received:', {
      vulnerability: prediction.vulnerability,
      vulnerability_prob: prediction.vulnerability_prob,
      suggested_programs: prediction.suggested_programs,
    });

    const suggestedPrograms = Array.isArray(
      prediction.suggested_programs
    )
      ? prediction.suggested_programs
      : [];

    console.log('[PREDICT] Step 5: Saving prediction to database.');

    const updatedRows = await query(
      `
        UPDATE households
        SET
          vulnerability = $1,
          vulnerability_prob = $2,
          suggested_programs = $3
        WHERE household_id = $4
        RETURNING *
      `,
      [
        prediction.vulnerability ?? null,
        prediction.vulnerability_prob ?? null,
        suggestedPrograms,
        householdId,
      ]
    );

    if (!updatedRows.length) {
      throw new Error('Prediction was generated but household update returned no rows.');
    }

    console.log('[PREDICT] Step 6: Prediction saved successfully.');

    return prediction;

  } catch (error) {
    console.error('[PREDICT] REFRESH FAILED:', {
      householdId,
      message: error.message,
      code: error.code,
      detail: error.detail,
      hint: error.hint,
      stack: error.stack,
    });

    throw error;
  }
}


/*
|--------------------------------------------------------------------------
| Authentication
|--------------------------------------------------------------------------
*/
router.use(auth);


/*
|--------------------------------------------------------------------------
| HOUSEHOLD INCOME-PROOF IMAGE UPLOADS
|--------------------------------------------------------------------------
| Images are stored in:
|   Supabase Storage: income-proofs
|
| Image paths are stored directly in:
|   households.income_proof_images (TEXT[])
|
| No separate metadata table.
|--------------------------------------------------------------------------
*/

const INCOME_PROOF_BUCKET = 'income-proofs';
const INCOME_PROOF_MAX_FILES = 5;
const INCOME_PROOF_MAX_FILE_SIZE = 5 * 1024 * 1024;
const INCOME_PROOF_SIGNED_URL_EXPIRY = 3600;

const INCOME_PROOF_TYPES = new Map([
  ['image/jpeg', 'jpg'],
  ['image/png', 'png'],
  ['image/webp', 'webp'],
]);

let incomeProofSupabaseAdmin = null;

function getIncomeProofSupabaseAdmin() {
  if (incomeProofSupabaseAdmin) {
    return incomeProofSupabaseAdmin;
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error(
      'SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be configured on the backend.'
    );
  }

  incomeProofSupabaseAdmin = createClient(
    supabaseUrl,
    serviceRoleKey,
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    }
  );

  return incomeProofSupabaseAdmin;
}

const incomeProofUpload = multer({
  storage: multer.memoryStorage(),

  limits: {
    files: INCOME_PROOF_MAX_FILES,
    fileSize: INCOME_PROOF_MAX_FILE_SIZE,
  },

  fileFilter: (_req, file, callback) => {
    if (!INCOME_PROOF_TYPES.has(file.mimetype)) {
      return callback(
        new Error('Only JPG, PNG, and WEBP images are allowed.')
      );
    }

    callback(null, true);
  },
});

function handleIncomeProofUpload(req, res, next) {
  incomeProofUpload.array('files', INCOME_PROOF_MAX_FILES)(
    req,
    res,
    (error) => {
      if (!error) return next();

      const message =
        error.code === 'LIMIT_FILE_SIZE'
          ? 'Each image must be 5 MB or smaller.'
          : error.code === 'LIMIT_FILE_COUNT'
            ? `You can upload up to ${INCOME_PROOF_MAX_FILES} images at a time.`
            : error.message || 'Unable to process uploaded images.';

      return res.status(400).json({
        error: message,
      });
    }
  );
}

/*
|--------------------------------------------------------------------------
| CREATE SIGNED IMAGE URL
|--------------------------------------------------------------------------
*/

async function createIncomeProofImage(supabaseAdmin, path) {
  const { data, error } = await supabaseAdmin.storage
    .from(INCOME_PROOF_BUCKET)
    .createSignedUrl(
      path,
      INCOME_PROOF_SIGNED_URL_EXPIRY
    );

  if (error) throw error;

  return {
    path,
    url: data.signedUrl,
    name: path.split('/').pop(),
  };
}

/*
|--------------------------------------------------------------------------
| UPLOAD HOUSEHOLD INCOME-PROOF IMAGES
|--------------------------------------------------------------------------
| POST /api/households/:householdId/income-proofs
|
| multipart/form-data:
|   files
|
| Saves paths directly into households.income_proof_images.
|--------------------------------------------------------------------------
*/


router.post(
  '/:householdId/income-proofs',
  requireRole('admin', 'staff'),
  handleIncomeProofUpload,
  async (req, res) => {
    const { householdId } = req.params;
    const files = req.files || [];
    const uploadedPaths = [];

    try {
      if (!files.length) {
        return res.status(400).json({
          error: 'Select at least one household income-proof image.',
        });
      }

      const householdRows = await query(
        `
          SELECT household_id
          FROM households
          WHERE household_id = $1
          LIMIT 1
        `,
        [householdId]
      );

      if (!householdRows.length) {
        return res.status(404).json({
          error: 'Household not found.',
        });
      }

      const supabaseAdmin = getIncomeProofSupabaseAdmin();

      // Upload images to Supabase Storage.
      for (const file of files) {
        const extension = INCOME_PROOF_TYPES.get(file.mimetype);

        if (!extension) {
          throw new Error('Unsupported image type.');
        }

        const path = `${householdId}/${randomUUID()}.${extension}`;

        const { error: uploadError } = await supabaseAdmin.storage
          .from(INCOME_PROOF_BUCKET)
          .upload(path, file.buffer, {
            contentType: file.mimetype,
            cacheControl: '3600',
            upsert: false,
          });

        if (uploadError) {
          throw uploadError;
        }

        uploadedPaths.push(path);
      }

      // Generate signed image URLs.
      const images = await Promise.all(
        uploadedPaths.map((path) =>
          createIncomeProofImage(supabaseAdmin, path)
        )
      );

      // Save image paths without removing existing images.
      const updatedRows = await query(
        `
          UPDATE households
          SET income_proof_images =
            COALESCE(income_proof_images, ARRAY[]::TEXT[])
            || $1::TEXT[]
          WHERE household_id = $2
          RETURNING income_proof_images
        `,
        [uploadedPaths, householdId]
      );

      if (!updatedRows.length) {
        throw new Error('Unable to save image paths to household.');
      }

      // Refresh vulnerability and assistance suggestions.
      // Existing images now satisfy the income-proof requirement.
      let predictionRefreshed = true;

      try {
        await refreshHouseholdPrediction(householdId);
      } catch (predictionError) {
        predictionRefreshed = false;

        console.error(
          'Income proof uploaded, but prediction refresh failed:',
          predictionError
        );
      }

      return res.status(201).json({
        success: true,
        message: 'Household income-proof images uploaded successfully.',
        images,
        prediction_refreshed: predictionRefreshed,
      });

    } catch (error) {
      // Clean up uploaded files if the upload operation fails.
      if (uploadedPaths.length) {
        try {
          const supabaseAdmin = getIncomeProofSupabaseAdmin();

          await supabaseAdmin.storage
            .from(INCOME_PROOF_BUCKET)
            .remove(uploadedPaths);
        } catch (cleanupError) {
          console.error(
            'Income-proof upload cleanup failed:',
            cleanupError
          );
        }
      }

      console.error(
        'Household income-proof upload failed:',
        error
      );

      return res.status(500).json({
        error:
          error.message ||
          'Failed to upload household income-proof images.',
      });
    }
  }
);


/*
|--------------------------------------------------------------------------
| GET HOUSEHOLD INCOME-PROOF IMAGES
|--------------------------------------------------------------------------
| GET /api/households/:householdId/income-proofs
|
| Reads image paths directly from households.income_proof_images.
|--------------------------------------------------------------------------
*/

router.get(
  '/:householdId/income-proofs',
  requireRole('admin', 'captain', 'staff'),
  async (req, res) => {
    try {
      const { householdId } = req.params;

      const householdRows = await query(
        `
          SELECT
            household_id,
            COALESCE(income_proof_images, ARRAY[]::TEXT[])
              AS income_proof_images
          FROM households
          WHERE household_id = $1
          LIMIT 1
        `,
        [householdId]
      );

      if (!householdRows.length) {
        return res.status(404).json({
          error: 'Household not found.',
        });
      }

      const paths = householdRows[0].income_proof_images || [];

      if (!paths.length) {
        return res.json({
          images: [],
        });
      }

      const supabaseAdmin = getIncomeProofSupabaseAdmin();

      const results = await Promise.all(
        paths.map(async (path) => {
          try {
            return await createIncomeProofImage(
              supabaseAdmin,
              path
            );
          } catch (error) {
            console.error(
              'Unable to generate income-proof URL:',
              path,
              error.message
            );

            return null;
          }
        })
      );

      return res.json({
        images: results.filter(Boolean),
      });

    } catch (error) {
      console.error(
        'Household income-proof retrieval failed:',
        error
      );

      return res.status(500).json({
        error:
          error.message ||
          'Failed to retrieve household income-proof images.',
      });
    }
  }
);

/*
|--------------------------------------------------------------------------
| DELETE HOUSEHOLD INCOME-PROOF IMAGE
|--------------------------------------------------------------------------
| DELETE /api/households/:householdId/income-proofs
|
| Request body:
|   { "path": "householdId/image-name.jpg" }
|--------------------------------------------------------------------------
*/


router.delete(
  '/:householdId/income-proofs',
  requireRole('admin', 'staff'),
  async (req, res) => {
    const { householdId } = req.params;
    const { path } = req.body || {};

    try {
      if (
        typeof path !== 'string' ||
        !path.trim() ||
        !path.startsWith(`${householdId}/`)
      ) {
        return res.status(400).json({
          error: 'Invalid income-proof image path.',
        });
      }

      // Get existing household image paths.
      const householdRows = await query(
        `
          SELECT
            household_id,
            COALESCE(income_proof_images, ARRAY[]::TEXT[])
              AS income_proof_images
          FROM households
          WHERE household_id = $1
          LIMIT 1
        `,
        [householdId]
      );

      if (!householdRows.length) {
        return res.status(404).json({
          error: 'Household not found.',
        });
      }

      const existingPaths =
        householdRows[0].income_proof_images || [];

      if (!existingPaths.includes(path)) {
        return res.status(404).json({
          error: 'Income-proof image not found.',
        });
      }

      // Remove the image path from the database.
      const updatedRows = await query(
        `
          UPDATE households
          SET income_proof_images =
            array_remove(
              COALESCE(income_proof_images, ARRAY[]::TEXT[]),
              $1
            )
          WHERE household_id = $2
          RETURNING income_proof_images
        `,
        [path, householdId]
      );

      if (!updatedRows.length) {
        throw new Error(
          'Unable to update household income-proof images.'
        );
      }

      // Delete the actual file from Supabase Storage.
      const supabaseAdmin = getIncomeProofSupabaseAdmin();

      const { error: deleteError } = await supabaseAdmin.storage
        .from(INCOME_PROOF_BUCKET)
        .remove([path]);

      if (deleteError) {
        // Restore the database path if Storage deletion fails.
        await query(
          `
            UPDATE households
            SET income_proof_images =
              CASE
                WHEN $1 = ANY(
                  COALESCE(income_proof_images, ARRAY[]::TEXT[])
                )
                THEN income_proof_images
                ELSE COALESCE(
                  income_proof_images,
                  ARRAY[]::TEXT[]
                ) || ARRAY[$1]::TEXT[]
              END
            WHERE household_id = $2
          `,
          [path, householdId]
        );

        throw deleteError;
      }

      const remainingPaths =
        updatedRows[0].income_proof_images || [];

      let predictionRefreshed = true;

      if (remainingPaths.length === 0) {
        // No income-proof images remain.
        // Clear suggested programs but preserve vulnerability.
        await query(
          `
            UPDATE households
            SET suggested_programs = ARRAY[]::TEXT[]
            WHERE household_id = $1
          `,
          [householdId]
        );
      } else {
        // Other images remain, so refresh program recommendations.
        try {
          await refreshHouseholdPrediction(householdId);
        } catch (predictionError) {
          predictionRefreshed = false;

          console.error(
            'Image deleted, but prediction refresh failed:',
            predictionError
          );
        }
      }

      return res.json({
        success: true,
        message: 'Income-proof image deleted successfully.',
        remaining_images: remainingPaths.length,
        prediction_refreshed: predictionRefreshed,
      });

    } catch (error) {
      console.error(
        'Household income-proof deletion failed:',
        error
      );

      return res.status(500).json({
        error:
          error.message ||
          'Failed to delete household income-proof image.',
      });
    }
  }
);



/*
|--------------------------------------------------------------------------
| REFRESH HOUSEHOLD ML PREDICTION
|--------------------------------------------------------------------------
| Generates and saves a new vulnerability prediction and
| dynamically matched assistance programs.
|--------------------------------------------------------------------------
*/

router.post(
  '/:id/predict',
  requireRole('admin', 'captain', 'staff'),
  async (req, res) => {
    const { id } = req.params;

    try {
      console.log('[PREDICT ROUTE] Request received:', id);

      const prediction = await refreshHouseholdPrediction(id);

      console.log('[PREDICT ROUTE] Prediction saved. Logging activity.');

      try {
        await logActivity(
          req,
          'REFRESH_HOUSEHOLD_PREDICTION',
          `Refreshed ML prediction for household ${id}.`
        );
      } catch (activityError) {
        console.error('[PREDICT ROUTE] Activity log failed:', {
          message: activityError.message,
          code: activityError.code,
          detail: activityError.detail,
          stack: activityError.stack,
        });

        // Prediction has already been saved.
        // Do not report the prediction itself as failed.
      }

      const rows = await query(
        `
          SELECT
            household_id,
            vulnerability,
            vulnerability_prob,
            suggested_programs
          FROM households
          WHERE household_id = $1
          LIMIT 1
        `,
        [id]
      );

      if (!rows.length) {
        return res.status(404).json({
          success: false,
          error: 'Household not found after prediction.',
        });
      }

      console.log('[PREDICT ROUTE] Completed successfully.');

      return res.json({
        success: true,
        message: 'Household prediction refreshed successfully.',
        household: rows[0],
        prediction,
      });

    } catch (error) {
      console.error('[PREDICT ROUTE] FAILED:', {
        householdId: id,
        message: error.message,
        code: error.code,
        detail: error.detail,
        hint: error.hint,
        stack: error.stack,
      });

      return res.status(500).json({
        success: false,
        error: 'Failed to refresh household prediction.',
        details: error.message,
      });
    }
  }
);



/*
|--------------------------------------------------------------------------
| GET HOUSEHOLD MEMBERS
|--------------------------------------------------------------------------
*/
router.get('/:id/members', async (req, res) => {
  try {
    const { id } = req.params;

    const householdRows = await query(
      `
        SELECT household_id
        FROM households
        WHERE household_id = $1
        LIMIT 1
      `,
      [id]
    );

    if (!householdRows.length) {
      return res.status(404).json({
        error: 'Household not found.',
      });
    }

    const members = await query(
      `
        SELECT *
        FROM household_members
        WHERE household_id = $1
        ORDER BY full_name ASC
      `,
      [id]
    );

    return res.status(200).json({
      members,
      count: members.length,
    });
  } catch (error) {
    console.error(
      'GET /households/:id/members error:',
      error
    );

    return res.status(500).json({
      error: 'Failed to load household members.',
    });
  }
});
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
const rawPrediction = await predictHousehold(household);

const prediction = applyIncomeProofGate(
  rawPrediction,
  household
);
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
  prediction.vulnerability ?? null,
  prediction.vulnerability_prob ?? null,
  Array.isArray(prediction.suggested_programs)
    ? prediction.suggested_programs
    : [],
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

const existingNameRows = await query(
  `
    SELECT
      household_head_name,
      given_name,
      middle_name,
      surname
    FROM households
    WHERE household_id = $1
    LIMIT 1
  `,
  [req.params.id]
);

if (!existingNameRows.length) {
  return res.status(404).json({
    error: 'Household not found.',
  });
}

const existingName = existingNameRows[0];

const mergedName = {
  ...existingName,
  ...data,
};

if (
  data.given_name !== undefined ||
  data.middle_name !== undefined ||
  data.surname !== undefined
) {
  const parts = [
    mergedName.given_name,
    mergedName.middle_name,
    mergedName.surname,
  ]
    .map(value => String(value || '').trim())
    .filter(Boolean);

  data.household_head_name = parts.join(' ');
}

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
const rawPrediction = await predictHousehold(household);

const prediction = applyIncomeProofGate(
  rawPrediction,
  household
);
        await query(
          `
            UPDATE households
SET
  vulnerability = $1,
  vulnerability_prob = $2,
  suggested_programs = $3
WHERE household_id = $4;
          `,
          [
  prediction.vulnerability ?? null,
  prediction.vulnerability_prob ?? null,
  Array.isArray(prediction.suggested_programs)
    ? prediction.suggested_programs
    : [],
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

      try {
  await refreshHouseholdPrediction(req.params.id);
} catch (mlError) {
  console.error(
    'Member added, but ML prediction refresh failed:',
    mlError
  );
}

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

      try {
  await refreshHouseholdPrediction(member.household_id);
} catch (mlError) {
  console.error(
    'Member updated, but ML prediction refresh failed:',
    mlError
  );
}

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
          RETURNING full_name, household_id
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

      const deletedMember = rows[0];

try {
  await refreshHouseholdPrediction(deletedMember.household_id);
} catch (mlError) {
  console.error('Failed to refresh prediction after deleting member:', mlError);
} 

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