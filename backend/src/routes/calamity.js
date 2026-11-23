const express = require('express');
const router = express.Router();

const { query } = require('../db');

const {
  auth,
  requireRole,
  logActivity,
} = require('../middleware/auth');

const { notifyRole } = require('./notifications');

router.use(auth);

/*
|--------------------------------------------------------------------------
| HELPERS
|--------------------------------------------------------------------------
*/

function getAuthenticatedUserId(req) {
  return (
    req.user?.users ||
    req.user?.user_id ||
    req.user?.id ||
    req.user?.sub ||
    null
  );
}

async function safeNotifyRole(options) {
  try {
    await notifyRole(options);
  } catch (error) {
    /*
     * Notification failure must never cause the
     * calamity request itself to fail.
     */
    console.error(
      'Calamity notification failed:',
      error
    );
  }
}

async function safeLogActivity(
  req,
  action,
  description
) {
  try {
    await logActivity(
      req,
      action,
      description
    );
  } catch (error) {
    /*
     * Activity logging failure must never cause
     * the main operation to fail.
     */
    console.error(
      'Calamity activity log failed:',
      error
    );
  }
}

/*
|--------------------------------------------------------------------------
| GET ALL CALAMITY PROGRAMS
| GET /calamity
|--------------------------------------------------------------------------
*/

router.get('/', async (req, res) => {
  try {
    const { status, purok, q } = req.query;

    const where = [];
    const params = [];

    if (status) {
      params.push(status);
      where.push(`c.status = $${params.length}`);
    }

    if (purok) {
      params.push(purok);
      where.push(`h.purok = $${params.length}`);
    }

    if (q) {
      params.push(`%${q}%`);
      where.push(`
        (
          h.household_head_name ILIKE $${params.length}
          OR p.program_name ILIKE $${params.length}
        )
      `);
    }

    const sql = `
      SELECT
        c.*,
        h.household_head_name,
        h.purok,
        h.address,
        p.program_name,
        u.full_name AS approved_by_name

      FROM calamity_programs c

      LEFT JOIN households h
        ON h.household_id = c.household_id

      LEFT JOIN assistance_programs p
        ON p.program_id = c.program_id

      LEFT JOIN users u
        ON u.user_id = c.approved_by

      ${where.length ? `WHERE ${where.join(' AND ')}` : ''}

      ORDER BY c.created_at DESC
    `;

    const rows = await query(sql, params);

    return res.json({
      calamityPrograms: rows,
    });

  } catch (error) {
    console.error('GET calamity programs ERROR:', error);

    return res.status(500).json({
      error: error.message || 'Failed to load calamity programs.',
      code: error.code || null,
    });
  }
});


/*
|--------------------------------------------------------------------------
| GET PENDING CALAMITY PROGRAMS FOR CAPTAIN
| GET /calamity/calamity-programs
|--------------------------------------------------------------------------
*/
router.get(
  '/calamity-programs',
  requireRole('captain'),
  async (req, res) => {
    try {
      const rows = await query(`
        SELECT
          cp.calamity_id,
          cp.household_id,
          cp.program_id,

          h.household_head_name,
          h.purok,
          h.monthly_income,
          h.family_number,

          cp.house_type,
          cp.roof_damage,
          cp.wall_damage,
          cp.flooding_level,
          cp.damage_risk,
          cp.risk_level,
          cp.status,
          cp.approved_by,
          cp.approved_at,
          cp.rejection_reason,
          cp.created_at,

          p.program_name,
          p.description

        FROM calamity_programs cp

        INNER JOIN households h
          ON h.household_id = cp.household_id

        LEFT JOIN assistance_programs p
          ON p.program_id = cp.program_id

        WHERE cp.status = 'Pending'

        ORDER BY cp.created_at DESC
      `);

      return res.json({
        calamity_programs: rows,
      });
    } catch (error) {
      console.error(
        'GET pending calamity programs ERROR:',
        error
      );

      return res.status(500).json({
        error:
          error.message ||
          'Failed to load pending calamity programs.',
      });
    }
  }
);



/*
|--------------------------------------------------------------------------
| GET APPROVED CALAMITY PROGRAM BENEFICIARIES
| GET /calamity/approved-beneficiaries
|--------------------------------------------------------------------------
*/
router.get(
  '/approved-beneficiaries',
  async (req, res) => {
    try {
      const rows = await query(`
        SELECT
          cp.calamity_id,
          cp.household_id,
          cp.program_id,

          h.household_head_name,
          h.purok,
          h.address,
          h.family_number,

          cp.house_type,
          cp.roof_damage,
          cp.wall_damage,
          cp.flooding_level,
          cp.damage_risk,
          cp.risk_level,

          cp.status,
          cp.approved_by,
          cp.approved_at,
          cp.rejection_reason,
          cp.created_at,

          u.full_name AS approved_by_name,

          p.program_name,
          p.description

        FROM calamity_programs cp

        LEFT JOIN households h
          ON h.household_id = cp.household_id

        LEFT JOIN users u
          ON u.user_id = cp.approved_by

        LEFT JOIN assistance_programs p
          ON p.program_id = cp.program_id

        WHERE cp.status = 'Approved'

        ORDER BY
          cp.approved_at DESC NULLS LAST,
          cp.created_at DESC
      `);

      return res.json({
        success: true,
        calamity_beneficiaries: rows,
      });

    } catch (error) {
      console.error(
        'GET approved calamity beneficiaries ERROR:',
        error
      );

      return res.status(500).json({
        error: error.message || 'Failed to load approved calamity beneficiaries.',
        code: error.code || null,
        detail: error.detail || null,
      });
    }
  }
);


/*
|--------------------------------------------------------------------------
| GET ONE CALAMITY PROGRAM
| GET /calamity/:id
|--------------------------------------------------------------------------
*/
router.get(
  '/:id',
  async (req, res) => {
    try {
      const rows = await query(
        `
        SELECT
          c.*,
          h.household_head_name,
          h.address,
          h.purok AS household_purok,
          u.full_name AS approved_by_name

        FROM calamity_programs c

        LEFT JOIN households h
          ON h.household_id = c.household_id

        LEFT JOIN users u
          ON u.user_id = c.approved_by

        WHERE c.calamity_id = $1::uuid
        `,
        [req.params.id]
      );

      if (!rows[0]) {
        return res.status(404).json({
          error:
            'Calamity program not found.',
        });
      }

      return res.json({
        calamityProgram: rows[0],
      });
    } catch (error) {
      console.error(
        'GET calamity program ERROR:',
        error
      );

      return res.status(500).json({
        error:
          error.message ||
          'Failed to load calamity program.',
      });
    }
  }
);

/*
|--------------------------------------------------------------------------
| CREATE CALAMITY PROGRAM
| POST /calamity
|--------------------------------------------------------------------------
| STAFF / ADMIN ONLY
|--------------------------------------------------------------------------
*/

router.post(
  '/',
  requireRole('admin', 'staff'),
  async (req, res) => {
    try {
      const {
        household_id,
        program_id,
        calamity_program,
        house_type,
        roof_damage,
        wall_damage,
        flooding_level,
        damage_risk,
        risk_level,
      } = req.body || {};

      if (!household_id) {
        return res.status(400).json({
          error: 'household_id is required.',
        });
      }

      if (!program_id && !calamity_program) {
        return res.status(400).json({
          error: 'Please select a calamity assistance program.',
        });
      }

      // Get household details.
      const householdRows = await query(
        `
          SELECT
            household_id,
            household_head_name,
            purok
          FROM households
          WHERE household_id = $1::uuid
        `,
        [household_id]
      );

      if (!householdRows[0]) {
        return res.status(404).json({
          error: 'Household not found.',
        });
      }

      const household = householdRows[0];

      // Find the selected assistance program.
      const programRows = await query(
        program_id
          ? `
              SELECT program_id, program_name
              FROM assistance_programs
              WHERE program_id = $1::uuid
            `
          : `
              SELECT program_id, program_name
              FROM assistance_programs
              WHERE LOWER(TRIM(program_name)) =
                    LOWER(TRIM($1))
            `,
        [program_id || calamity_program]
      );

      if (!programRows[0]) {
        return res.status(404).json({
          error: 'Selected assistance program was not found.',
        });
      }

      const program = programRows[0];

      // Insert using the actual calamity_programs columns.
      const rows = await query(
        `
          INSERT INTO calamity_programs (
            household_id,
            program_id,
            house_type,
            roof_damage,
            wall_damage,
            flooding_level,
            damage_risk,
            risk_level,
            status
          )
          VALUES (
            $1::uuid,
            $2::uuid,
            $3,
            $4,
            $5,
            $6,
            $7,
            $8,
            'Pending'
          )
          RETURNING *
        `,
        [
          household_id,
          program.program_id,
          house_type || null,
          roof_damage || null,
          wall_damage || null,
          flooding_level || null,
          Number(damage_risk || 0),
          risk_level || 'Low Risk',
        ]
      );

      const calamityProgram = rows[0];

      // Notify Captain after successful submission.
      await safeNotifyRole({
        role: 'captain',
        title: 'New Calamity Assistance Approval',
        message:
          `A new calamity assistance request from ` +
          `"${household.household_head_name}" ` +
          `for "${program.program_name}" ` +
          `is waiting for your approval.`,
        type: 'calamity_pending',
        referenceId: calamityProgram.calamity_id,
      });

      await safeLogActivity(
        req,
        'CREATE_CALAMITY_PROGRAM',
        `Added household "${household.household_head_name}" ` +
          `to "${program.program_name}". Submitted for Captain approval.`
      );

      return res.status(201).json({
        success: true,
        message: 'Calamity assistance request submitted successfully.',
        calamityProgram,
      });

    } catch (error) {
      console.error('CREATE CALAMITY PROGRAM ERROR:', error);

      return res.status(500).json({
        error: error.message || 'Failed to create calamity program.',
        code: error.code || null,
        detail: error.detail || null,
        hint: error.hint || null,
      });
    }
  }
);

/*
|--------------------------------------------------------------------------
| APPROVE CALAMITY PROGRAM
| PUT /calamity/:id/approve
|--------------------------------------------------------------------------
*/

router.put(
  '/:id/approve',
  requireRole('captain'),
  async (req, res) => {
    try {
      const captainId = getAuthenticatedUserId(req);

      if (!captainId) {
        return res.status(401).json({
          error: 'Unable to identify the current Captain.',
        });
      }

      // Update ONLY calamity_programs
      const rows = await query(
        `
          UPDATE calamity_programs
          SET
            status = 'Approved',
            approved_by = $1::uuid,
            approved_at = NOW(),
            rejection_reason = NULL
          WHERE calamity_id = $2::uuid
            AND status = 'Pending'
          RETURNING *
        `,
        [captainId, req.params.id]
      );

      if (!rows[0]) {
        return res.status(404).json({
          error: 'Calamity request not found or has already been processed.',
        });
      }

      return res.json({
        success: true,
        message: 'Calamity assistance approved.',
        calamityProgram: rows[0],
      });

    } catch (error) {
      console.error('APPROVE calamity program ERROR:', error);

      return res.status(500).json({
        error: error.message || 'Failed to approve calamity program.',
        code: error.code || null,
        detail: error.detail || null,
        hint: error.hint || null,
      });
    }
  }
);


/*
|--------------------------------------------------------------------------
| REJECT CALAMITY PROGRAM
| PUT /calamity/:id/reject
|--------------------------------------------------------------------------
*/

router.put(
  '/:id/reject',
  requireRole('captain'),
  async (req, res) => {
    try {
      const cleanReason = String(
        req.body?.rejection_reason || ''
      ).trim();

      if (!cleanReason) {
        return res.status(400).json({
          error: 'Rejection reason is required.',
        });
      }

      // Update ONLY calamity_programs
      const rows = await query(
        `
          UPDATE calamity_programs
          SET
            status = 'Rejected',
            approved_by = NULL,
            approved_at = NULL,
            rejection_reason = $1
          WHERE calamity_id = $2::uuid
            AND status = 'Pending'
          RETURNING *
        `,
        [cleanReason, req.params.id]
      );

      if (!rows[0]) {
        return res.status(404).json({
          error: 'Calamity request not found or has already been processed.',
        });
      }

      return res.json({
        success: true,
        message: 'Calamity assistance rejected.',
        calamityProgram: rows[0],
      });

    } catch (error) {
      console.error('REJECT calamity program ERROR:', error);

      return res.status(500).json({
        error: error.message || 'Failed to reject calamity program.',
        code: error.code || null,
        detail: error.detail || null,
        hint: error.hint || null,
      });
    }
  }
);


module.exports = router;