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

// ==================================================
// GET ASSISTANCE PROGRAMS
// GET /programs
// GET /programs?type=Calamity
// ==================================================
router.get('/', async (req, res) => {
  try {
    const rows = await query(`
      SELECT
        p.program_id,
        p.program_name,
        p.description,
        p.eligibility_rules,
        p.created_at,
        p.is_active,

        (
          SELECT COUNT(DISTINCT household_id)
          FROM (
            SELECT mad.household_id
            FROM ml_assistance_distribution mad
            WHERE mad.program_id = p.program_id
              AND mad.status = 'Approved'

            UNION

            SELECT cp.household_id
            FROM calamity_programs cp
            WHERE cp.program_id = p.program_id
              AND cp.status = 'Approved'
          ) approved_households
        ) AS total_approved_households

      FROM assistance_programs p
      ORDER BY p.created_at DESC
    `);

    return res.json({
      programs: rows,
    });
  } catch (e) {
    console.error(
      'Failed to load assistance programs:',
      e
    );

    return res.status(500).json({
      error:
        e.message ||
        'Failed to load assistance programs.',
    });
  }
});

// ==================================================
// CREATE ASSISTANCE PROGRAM
// POST /programs
// ==================================================
router.post(
  '/',
  requireRole('admin'),
  async (req, res) => {
    try {
      const {
        program_name,
        description,
        eligibility_rules,
        is_active,
      } = req.body || {};

      // Validate program name
      if (
        typeof program_name !== 'string' ||
        !program_name.trim()
      ) {
        return res.status(400).json({
          error: 'Program name is required.',
        });
      }

      // Get the authenticated user's ID.
      // Confirm the correct property in your auth middleware.
      const userId =
        req.user?.user_id ??
        req.user?.id ??
        req.user?.users;

      if (!userId) {
        return res.status(401).json({
          error: 'Unable to identify the logged-in user.',
        });
      }

      const active =
        typeof is_active === 'boolean'
          ? is_active
          : true;

      const rows = await query(
        `
        INSERT INTO assistance_programs (
          user_id,
          program_name,
          description,
          eligibility_rules,
          is_active
        )
        VALUES ($1, $2, $3, $4, $5)
        RETURNING *
        `,
        
  [
  userId,
  program_name.trim(),
  description?.trim() || null,
  eligibility_rules?.trim() || null,
  is_active ?? true,
]
      );

      const createdProgram = rows[0];

      // Activity logging should not undo a successful insert.
      try {
        await logActivity(
          req,
          'CREATE_PROGRAM',
          `Created assistance program "${createdProgram.program_name}".`
        );
      } catch (logError) {
        console.error(
          'CREATE_PROGRAM activity log failed:',
          logError
        );
      }

      return res.status(201).json({
        success: true,
        message: 'Assistance program created successfully.',
        program: createdProgram,
      });
    } catch (error) {
      console.error(
        'Failed to create program:',
        error
      );

      return res.status(500).json({
        error: 'Failed to create assistance program.',
        details:
          process.env.NODE_ENV === 'production'
            ? undefined
            : error.message,
      });
    }
  }
);

// ==================================================
// UPDATE ASSISTANCE PROGRAM
// PUT /programs/:id
// ==================================================
router.put(
  '/:id',
  requireRole('admin'),
  async (req, res) => {
    try {
      const {
        program_name,
        description,
        eligibility_rules,
      } = req.body || {};

      const rows = await query(
        `
        UPDATE assistance_programs
        SET
          program_name =
            COALESCE($1, program_name),
          description =
            COALESCE($2, description),
          eligibility_rules =
            COALESCE($3, eligibility_rules)
        WHERE program_id = $4
        RETURNING *
        `,
        [
          program_name?.trim() || null,
          description?.trim() || null,
          eligibility_rules?.trim() || null,
          req.params.id,
        ]
      );

      if (!rows[0]) {
        return res.status(404).json({
          error: 'Program not found.',
        });
      }

      try {
        await logActivity(
          req,
          'UPDATE_PROGRAM',
          `Updated assistance program "${rows[0].program_name}".`
        );
      } catch (logError) {
        console.error(
          'UPDATE_PROGRAM activity log failed:',
          logError
        );
      }

      return res.json({
        program: rows[0],
      });
    } catch (error) {
      console.error(
        'Failed to update program:',
        error
      );

      return res.status(500).json({
        error:
          error.message ||
          'Failed to update assistance program.',
      });
    }
  }
);

// ==================================================
// DELETE ASSISTANCE PROGRAM
// DELETE /programs/:id
// ==================================================
router.delete(
  '/:id',
  requireRole('admin'),
  async (req, res) => {
    try {
      const rows = await query(
        `
        DELETE FROM assistance_programs
        WHERE program_id = $1
        RETURNING program_name
        `,
        [req.params.id]
      );

      if (!rows[0]) {
        return res.status(404).json({
          error: 'Program not found.',
        });
      }

      try {
        await logActivity(
          req,
          'DELETE_PROGRAM',
          `Deleted assistance program "${rows[0].program_name}".`
        );
      } catch (logError) {
        console.error(
          'DELETE_PROGRAM activity log failed:',
          logError
        );
      }

      return res.json({
        success: true,
      });
    } catch (error) {
      console.error(
        'Failed to delete program:',
        error
      );

      return res.status(500).json({
        error:
          error.message ||
          'Failed to delete assistance program.',
      });
    }
  }
);

// ==================================================
// SAVE CALAMITY PROGRAM
// POST /programs/calamity-programs
// ==================================================

 // ==================================================
 // SAVE CALAMITY PROGRAM
 // POST /programs/calamity-programs
 // ==================================================

router.post(
  '/calamity-programs',
  requireRole('admin', 'staff'),
  async (req, res) => {
    try {
      const {
        household_id,
        program_id,
        house_type,
        roof_damage,
        wall_damage,
        flooding_level,
        damage_risk,
        risk_level,
      } = req.body || {};

      if (!household_id || !program_id) {
        return res.status(400).json({
          error: 'household_id and program_id are required.',
        });
      }

      // Verify household.
      const householdRows = await query(
        `
        SELECT
          household_id,
          household_head_name,
          income_proof_images
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

      const hasIncomeProof =
        Array.isArray(household.income_proof_images) &&
        household.income_proof_images.some(
          (image) =>
            typeof image === 'string' &&
            image.trim().length > 0
        );

      if (!hasIncomeProof) {
        return res.status(400).json({
          error:
            'An income-proof image must be uploaded before this household can be submitted for assistance.',
        });
      }

      // Verify assistance program.
      const programRows = await query(
        `
        SELECT program_id, program_name
        FROM assistance_programs
        WHERE program_id = $1::uuid
        `,
        [program_id]
      );

      if (!programRows[0]) {
        return res.status(404).json({
          error: 'Assistance program not found.',
        });
      }

      const program = programRows[0];

      // Check existing request.
      const existingRows = await query(
        `
        SELECT calamity_id, status
        FROM calamity_programs
        WHERE household_id = $1::uuid
          AND program_id = $2::uuid
        ORDER BY created_at DESC
        LIMIT 1
        `,
        [household_id, program_id]
      );

      if (existingRows[0]) {
        const existing = existingRows[0];

        if (
          ['Pending', 'Approved'].includes(existing.status)
        ) {
          return res.status(409).json({
            error:
              existing.status === 'Pending'
                ? 'This household is already pending for this calamity assistance program.'
                : 'This household is already approved for this calamity assistance program.',
            status: existing.status,
            calamity_id: existing.calamity_id,
          });
        }
      }

      // Insert calamity request.
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
          program_id,
          house_type || null,
          roof_damage || 'None',
          wall_damage || 'None',
          flooding_level || 'None',
          Number(damage_risk || 0),
          risk_level || 'Low Risk',
        ]
      );

      const calamityProgram = rows[0];

      console.log(
        'CALAMITY REQUEST INSERTED:',
        calamityProgram.calamity_id
      );

      // Notify Captain.
      try {
        await notifyRole({
          role: 'captain',
          title: 'New Calamity Assistance Approval',
          message:
            `A new calamity assistance request from ` +
            `"${household.household_head_name || 'A household'}" ` +
            `for "${program.program_name}" is waiting for your approval.`,
          type: 'calamity_pending',
          referenceId: calamityProgram.calamity_id,
        });

        console.log(
          'CAPTAIN NOTIFIED FOR CALAMITY:',
          calamityProgram.calamity_id
        );
      } catch (notificationError) {
        console.error(
          'CALAMITY NOTIFICATION FAILED:',
          notificationError
        );
      }

      return res.status(201).json({
        success: true,
        message:
          'Calamity assistance request created successfully and is pending Captain approval.',
        calamity_program: calamityProgram,
      });

    } catch (error) {
      console.error(
        'Failed to save calamity program:',
        error
      );

      if (error.code === '23505') {
        return res.status(409).json({
          error:
            'This household has already been submitted for this calamity assistance program.',
        });
      }

      return res.status(500).json({
        error: error.message || 'Failed to save calamity program.',
        code: error.code || null,
        detail: error.detail || null,
      });
    }
  }
);


router.patch('/:id/status', requireRole('admin', 'staff'), async (req, res) => {
  try {
    const { is_active } = req.body;

    if (typeof is_active !== 'boolean') {
      return res.status(400).json({
        error: 'is_active must be true or false.',
      });
    }

    const result = await query(
      `
      UPDATE assistance_programs
      SET is_active = $1
      WHERE program_id = $2::uuid
      RETURNING *
      `,
      [is_active, req.params.id]
    );

    if (!result[0]) {
      return res.status(404).json({
        error: 'Assistance program not found.',
      });
    }

    return res.json({
      message: is_active
        ? 'Assistance program activated successfully.'
        : 'Assistance program deactivated successfully.',
      program: result[0],
    });
  } catch (error) {
    console.error('UPDATE PROGRAM STATUS ERROR:', error);

    return res.status(500).json({
      error: error.message,
    });
  }
});

module.exports = router;