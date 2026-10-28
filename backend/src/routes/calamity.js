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
    const {
      status,
      purok,
      q,
    } = req.query;

    const where = [];
    const params = [];

    /*
     * STATUS FILTER
     */
    if (status) {
      params.push(status);

      where.push(
        `c.status = $${params.length}`
      );
    }

    /*
     * PUROK FILTER
     */
    if (purok) {
      params.push(purok);

      where.push(
        `c.purok = $${params.length}`
      );
    }

    /*
     * SEARCH FILTER
     */
    if (q) {
      params.push(`%${q}%`);

      where.push(`
        (
          c.household_name ILIKE $${params.length}
          OR c.calamity_program ILIKE $${params.length}
          OR h.household_head_name ILIKE $${params.length}
        )
      `);
    }

    const sql = `
      SELECT
        c.*,
        h.household_head_name,
        u.full_name AS approved_by_name

      FROM calamity_programs c

      LEFT JOIN households h
        ON h.household_id = c.household_id

      LEFT JOIN users u
        ON u.user_id = c.approved_by

      ${
        where.length
          ? `WHERE ${where.join(' AND ')}`
          : ''
      }

      ORDER BY c.created_at DESC
    `;

    const rows = await query(
      sql,
      params
    );

    return res.json({
      calamityPrograms: rows,
    });
  } catch (error) {
    console.error(
      'GET calamity programs ERROR:',
      error
    );

    return res.status(500).json({
      error:
        error.message ||
        'Failed to load calamity programs.',
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
        household_name,
        purok,
        calamity_program,
        house_type,
        roof_damage,
        wall_damage,
        flooding_level,
        damage_risk,
        risk_level,
      } = req.body || {};

      /*
       * VALIDATE HOUSEHOLD
       */
      if (!household_id) {
        return res.status(400).json({
          error:
            'household_id is required.',
        });
      }

      /*
       * VALIDATE PROGRAM
       */
      if (!calamity_program) {
        return res.status(400).json({
          error:
            'Please select a calamity assistance program.',
        });
      }

      /*
       * GET HOUSEHOLD
       */
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
          error:
            'Household not found.',
        });
      }

      const household =
        householdRows[0];

      /*
       * INSERT REQUEST
       */
      const rows = await query(
        `
        INSERT INTO calamity_programs (
          household_id,
          household_name,
          purok,
          calamity_program,
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
          $2,
          $3,
          $4,
          $5,
          $6,
          $7,
          $8,
          $9,
          $10,
          'Pending'
        )

        RETURNING *
        `,
        [
          household_id,

          household_name ||
            household.household_head_name,

          purok ||
            household.purok,

          calamity_program,

          house_type || null,

          roof_damage || null,

          wall_damage || null,

          flooding_level || null,

          Number(damage_risk || 0),

          risk_level || 'Low Risk',
        ]
      );

      const calamityProgram =
        rows[0];

      /*
       * NOTIFY CAPTAIN
       */
      await safeNotifyRole({
        role: 'captain',

        title:
          'New Calamity Assistance Approval',

        message:
          `A new calamity assistance request from ` +
          `"${calamityProgram.household_name}" ` +
          `is waiting for your approval.`,

        type:
          'calamity_pending',

        referenceId:
          calamityProgram.calamity_id,
      });

      /*
       * ACTIVITY LOG
       */
      await safeLogActivity(
        req,
        'CREATE_CALAMITY_PROGRAM',

        `Added household ` +
          `"${calamityProgram.household_name}" ` +
          `to "${calamity_program}". ` +
          `Submitted for Captain approval.`
      );

      return res.status(201).json({
        success: true,
        calamityProgram,
      });
    } catch (error) {
      console.error(
        'CREATE calamity program ERROR:',
        error
      );

      return res.status(500).json({
        error:
          error.message ||
          'Failed to create calamity program.',

        code:
          error.code || null,

        detail:
          error.detail || null,

        hint:
          error.hint || null,
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
      const captainId =
        getAuthenticatedUserId(req);

      if (!captainId) {
        return res.status(401).json({
          error:
            'Unable to identify the current Captain.',
        });
      }

      /*
       * GET REQUEST BEFORE UPDATE
       */
      const existing = await query(
        `
        SELECT
          cp.*,
          h.household_head_name,
          p.program_name

        FROM calamity_programs cp

        LEFT JOIN households h
          ON h.household_id = cp.household_id

        LEFT JOIN assistance_programs p
          ON p.program_id = cp.program_id

        WHERE cp.calamity_id = $1::uuid
          AND cp.status = 'Pending'
        `,
        [req.params.id]
      );

      if (!existing[0]) {
        return res.status(404).json({
          error:
            'Calamity request not found or has already been processed.',
        });
      }

      const calamity =
        existing[0];

      /*
       * UPDATE
       */
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
        [
          captainId,
          req.params.id,
        ]
      );

      if (!rows[0]) {
        return res.status(409).json({
          error:
            'Calamity request was not found or has already been processed.',
        });
      }

      /*
       * ADD TO DISTRIBUTION
       */
      try {
        await query(
          `
          INSERT INTO ml_assistance_distribution (
            household_id,
            program_id,
            status,
            approved_by,
            approved_at
          )

          VALUES (
            $1::uuid,
            $2::uuid,
            'Approved',
            $3::uuid,
            NOW()
          )

          ON CONFLICT DO NOTHING
          `,
          [
            calamity.household_id,
            calamity.program_id,
            captainId,
          ]
        );
      } catch (distributionError) {
        console.error(
          'Calamity distribution insert failed:',
          distributionError
        );
      }

      /*
       * NOTIFY STAFF
       */
      await safeNotifyRole({
        role: 'staff',

        title:
          'Calamity Assistance Approved',

        message:
          `The calamity assistance request for ` +
          `"${calamity.household_head_name || calamity.household_name}" ` +
          `has been approved by the Captain.`,

        type:
          'calamity_approved',

        referenceId:
          calamity.calamity_id,
      });

      /*
       * NOTIFY ADMIN
       */
      await safeNotifyRole({
        role: 'admin',

        title:
          'Calamity Assistance Approved',

        message:
          `The calamity assistance request for ` +
          `"${calamity.household_head_name || calamity.household_name}" ` +
          `has been approved by the Captain.`,

        type:
          'calamity_approved',

        referenceId:
          calamity.calamity_id,
      });

      /*
       * ACTIVITY LOG
       */
      await safeLogActivity(
        req,
        'APPROVE_CALAMITY_PROGRAM',

        `Approved calamity assistance request ` +
          `for "${calamity.household_head_name || calamity.household_name}" ` +
          `under "${calamity.program_name || calamity.calamity_program || 'Calamity Assistance'}".`
      );

      return res.json({
        success: true,

        message:
          'Calamity assistance approved.',

        calamityProgram:
          rows[0],
      });
    } catch (error) {
      console.error(
        'APPROVE calamity program ERROR:',
        error
      );

      return res.status(500).json({
        error:
          error.message ||
          'Failed to approve calamity program.',

        code:
          error.code || null,

        detail:
          error.detail || null,

        hint:
          error.hint || null,
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
      const {
        rejection_reason,
      } = req.body || {};

      const cleanReason =
        String(
          rejection_reason || ''
        ).trim();

      if (!cleanReason) {
        return res.status(400).json({
          error:
            'Rejection reason is required.',
        });
      }

      const captainId =
        getAuthenticatedUserId(req);

      if (!captainId) {
        return res.status(401).json({
          error:
            'Unable to identify the current Captain.',
        });
      }

      /*
       * GET REQUEST BEFORE UPDATE
       */
      const existing = await query(
        `
        SELECT
          cp.*,
          h.household_head_name,
          p.program_name

        FROM calamity_programs cp

        LEFT JOIN households h
          ON h.household_id = cp.household_id

        LEFT JOIN assistance_programs p
          ON p.program_id = cp.program_id

        WHERE cp.calamity_id = $1::uuid
          AND cp.status = 'Pending'
        `,
        [req.params.id]
      );

      if (!existing[0]) {
        return res.status(404).json({
          error:
            'Calamity request not found or has already been processed.',
        });
      }

      const calamity =
        existing[0];

      /*
       * UPDATE
       */
      const rows = await query(
        `
        UPDATE calamity_programs

        SET
          status = 'Rejected',
          approved_by = $1::uuid,
          approved_at = NOW(),
          rejection_reason = $2

        WHERE calamity_id = $3::uuid
          AND status = 'Pending'

        RETURNING *
        `,
        [
          captainId,
          cleanReason,
          req.params.id,
        ]
      );

      if (!rows[0]) {
        return res.status(409).json({
          error:
            'Calamity request was not found or has already been processed.',
        });
      }

      /*
       * NOTIFY STAFF
       */
      await safeNotifyRole({
        role: 'staff',

        title:
          'Calamity Assistance Rejected',

        message:
          `The calamity assistance request for ` +
          `"${calamity.household_head_name || calamity.household_name}" ` +
          `has been rejected by the Captain. ` +
          `Reason: ${cleanReason}`,

        type:
          'calamity_rejected',

        referenceId:
          calamity.calamity_id,
      });

      /*
       * NOTIFY ADMIN
       */
      await safeNotifyRole({
        role: 'admin',

        title:
          'Calamity Assistance Rejected',

        message:
          `The calamity assistance request for ` +
          `"${calamity.household_head_name || calamity.household_name}" ` +
          `has been rejected by the Captain. ` +
          `Reason: ${cleanReason}`,

        type:
          'calamity_rejected',

        referenceId:
          calamity.calamity_id,
      });

      /*
       * ACTIVITY LOG
       */
      await safeLogActivity(
        req,
        'REJECT_CALAMITY_PROGRAM',

        `Rejected calamity assistance request ` +
          `for "${calamity.household_head_name || calamity.household_name}" ` +
          `under "${calamity.program_name || calamity.calamity_program || 'Calamity Assistance'}". ` +
          `Reason: ${cleanReason}`
      );

      return res.json({
        success: true,

        message:
          'Calamity assistance rejected.',

        calamityProgram:
          rows[0],
      });
    } catch (error) {
      console.error(
        'REJECT calamity program ERROR:',
        error
      );

      return res.status(500).json({
        error:
          error.message ||
          'Failed to reject calamity program.',

        code:
          error.code || null,

        detail:
          error.detail || null,

        hint:
          error.hint || null,
      });
    }
  }
);

module.exports = router;