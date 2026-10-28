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
// HELPERS
// ==================================================

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
    // Notification failure must never make the
    // main validation/approval operation fail.
    console.error('Notification failed:', error);
  }
}

async function safeLogActivity(req, action, description) {
  try {
    await logActivity(req, action, description);
  } catch (error) {
    // Activity log failure must not make the
    // main operation fail.
    console.error('Activity log failed:', error);
  }
}

// ==================================================
// REGULAR BENEFICIARY VALIDATION
// GET /validation/beneficiary-validation
//
// Captain sees ONLY Pending requests.
// ==================================================

router.get(
  '/beneficiary-validation',
  requireRole('captain'),
  async (req, res) => {
    try {
      const rows = await query(`
        SELECT
          bv.validation_id,
          bv.household_id,
          bv.program_id,
          bv.validation_status,
          bv.submitted_by,
          bv.submitted_at,
          bv.remarks,
          bv.approved_at,
          bv.approved_by,

          h.household_head_name,
          h.purok,
          h.vulnerability,
          h.vulnerability_prob,
          h.monthly_income,
          h.family_number,
          h.validation_status AS household_validation_status,

          h.user_id,
          encoder.full_name AS encoded_by,

          p.program_name

        FROM beneficiary_validation bv

        INNER JOIN households h
          ON h.household_id = bv.household_id

        LEFT JOIN users encoder
          ON encoder.user_id = h.user_id

        LEFT JOIN assistance_programs p
          ON p.program_id = bv.program_id

        WHERE bv.validation_status = 'Pending'

        ORDER BY bv.submitted_at DESC
      `);

      return res.json({
        households: rows,
      });
    } catch (error) {
      console.error(
        'GET /beneficiary-validation ERROR:',
        error
      );

      return res.status(500).json({
        error:
          error.message ||
          'Failed to load beneficiary validation.',
      });
    }
  }
);

// ==================================================
// GET ALL PROGRAM-SPECIFIC VALIDATION STATUSES
//
// Used by Suggestions.jsx.
//
// Returns Pending, Approved, and Rejected.
// ==================================================

router.get(
  '/beneficiary-validation/statuses',
  requireRole('admin', 'staff', 'captain'),
  async (req, res) => {
    try {
      const rows = await query(`
        SELECT
          bv.validation_id,
          bv.household_id,
          bv.program_id,
          bv.validation_status,
          bv.submitted_by,
          bv.submitted_at,
          bv.remarks,
          bv.approved_at,
          bv.approved_by,

          p.program_name

        FROM beneficiary_validation bv

        LEFT JOIN assistance_programs p
          ON p.program_id = bv.program_id

        ORDER BY bv.submitted_at DESC
      `);

      return res.json({
        statuses: rows,
      });
    } catch (error) {
      console.error(
        'GET /beneficiary-validation/statuses ERROR:',
        error
      );

      return res.status(500).json({
        error:
          error.message ||
          'Failed to load beneficiary validation statuses.',
      });
    }
  }
);

// ==================================================
// SUBMIT REGULAR BENEFICIARY
// POST /validation/beneficiary-validation
//
// Admin/Staff submits.
// Captain later approves.
// ==================================================

router.post(
  '/beneficiary-validation',
  requireRole('admin', 'staff'),
  async (req, res) => {
    try {
      const {
        household_id,
        program_id,
      } = req.body || {};

      // ------------------------------------------------
      // REQUIRED FIELDS
      // ------------------------------------------------

      if (!household_id) {
        return res.status(400).json({
          error: 'household_id is required.',
        });
      }

      if (!program_id) {
        return res.status(400).json({
          error: 'program_id is required.',
        });
      }

      // ------------------------------------------------
      // VERIFY HOUSEHOLD
      // ------------------------------------------------

      const household = await query(
        `
        SELECT household_id
        FROM households
        WHERE household_id = $1::uuid
        `,
        [household_id]
      );

      if (!household[0]) {
        return res.status(404).json({
          error: 'Household not found.',
        });
      }

      // ------------------------------------------------
      // VERIFY PROGRAM
      // ------------------------------------------------

      const program = await query(
        `
        SELECT
          program_id,
          program_name
        FROM assistance_programs
        WHERE program_id = $1::uuid
        `,
        [program_id]
      );

      if (!program[0]) {
        return res.status(404).json({
          error: 'Assistance program not found.',
        });
      }

      // ------------------------------------------------
      // CHECK EXISTING VALIDATION
      // ------------------------------------------------

      const existing = await query(
        `
        SELECT
          validation_id,
          validation_status
        FROM beneficiary_validation
        WHERE household_id = $1::uuid
          AND program_id = $2::uuid
        ORDER BY submitted_at DESC
        LIMIT 1
        `,
        [
          household_id,
          program_id,
        ]
      );

      if (existing[0]) {
        const current = existing[0];

        if (
          current.validation_status === 'Pending' ||
          current.validation_status === 'Approved'
        ) {
          return res.status(409).json({
            error:
              current.validation_status === 'Pending'
                ? 'This household is already Pending for this assistance program.'
                : 'This household is already Approved for this assistance program.',
            validation_id: current.validation_id,
            validation_status: current.validation_status,
          });
        }
      }

      // ------------------------------------------------
      // AUTHENTICATED USER
      // ------------------------------------------------

      const submittedBy = getAuthenticatedUserId(req);

      console.log(
        'BENEFICIARY SUBMITTED BY:',
        submittedBy
      );

      console.log(
        'AUTH USER:',
        req.user
      );

      if (!submittedBy) {
        return res.status(401).json({
          error: 'Authenticated user ID not found.',
        });
      }

      // ------------------------------------------------
      // INSERT PENDING REQUEST
      // ------------------------------------------------

      const rows = await query(
        `
        INSERT INTO beneficiary_validation (
          validation_id,
          household_id,
          program_id,
          validation_status,
          submitted_by,
          submitted_at
        )
        VALUES (
          gen_random_uuid(),
          $1::uuid,
          $2::uuid,
          'Pending',
          $3::uuid,
          NOW()
        )
        RETURNING *
        `,
        [
          household_id,
          program_id,
          submittedBy,
        ]
      );

      const validation = rows[0];

      // ------------------------------------------------
      // NOTIFY CAPTAIN
      // ------------------------------------------------

      await safeNotifyRole({
        role: 'captain',
        title: 'New Beneficiary Approval',
        message:
          `A new beneficiary is waiting for your approval ` +
          `for the program "${program[0].program_name}".`,
        type: 'beneficiary_pending',
        referenceId: validation.validation_id,
      });

      // ------------------------------------------------
      // ACTIVITY LOG
      // ------------------------------------------------

      await safeLogActivity(
        req,
        'SUBMIT_BENEFICIARY',
        `Submitted household for "${program[0].program_name}" approval.`
      );

      // ------------------------------------------------
      // RESPONSE
      // ------------------------------------------------

      return res.status(201).json({
        success: true,
        message:
          'Beneficiary submitted for Captain approval.',
        validation,
      });
    } catch (error) {
      console.error(
        'POST /beneficiary-validation ERROR:',
        error
      );

      if (error.code === '23505') {
        return res.status(409).json({
          error:
            'This household is already submitted for this assistance program.',
        });
      }

      return res.status(500).json({
        error:
          error.message ||
          'Failed to submit beneficiary.',
        code: error.code || null,
        detail: error.detail || null,
        hint: error.hint || null,
      });
    }
  }
);

// ==================================================
// CAPTAIN DECISION - REGULAR BENEFICIARY
//
// PATCH
// /validation/beneficiary-validation/:id/decision
// ==================================================

router.patch(
  '/beneficiary-validation/:id/decision',
  requireRole('captain'),
  async (req, res) => {
    try {
      const {
        decision,
        remarks,
      } = req.body || {};

      console.log(
        '=========================================='
      );
      console.log(
        'BENEFICIARY DECISION'
      );
      console.log(
        'validation_id:',
        req.params.id
      );
      console.log(
        'decision:',
        decision
      );
      console.log(
        'captain user:',
        req.user
      );
      console.log(
        '=========================================='
      );

      // ------------------------------------------------
      // VALIDATE DECISION
      // ------------------------------------------------

      if (
        !['Approved', 'Rejected'].includes(
          decision
        )
      ) {
        return res.status(400).json({
          error:
            'Decision must be Approved or Rejected.',
        });
      }

      // ------------------------------------------------
      // GET CAPTAIN UUID
      // ------------------------------------------------

      const approvedBy =
        getAuthenticatedUserId(req);

      if (!approvedBy) {
        return res.status(401).json({
          error:
            'Authenticated user ID not found.',
        });
      }

      // ------------------------------------------------
      // GET BENEFICIARY VALIDATION
      // ------------------------------------------------

      const existing = await query(
        `
        SELECT
          bv.validation_id,
          bv.household_id,
          bv.program_id,
          bv.validation_status,
          bv.submitted_by,
          bv.submitted_at,

          h.household_head_name,
          h.user_id,
          encoder.full_name AS encoded_by,

          p.program_name

        FROM beneficiary_validation bv

        INNER JOIN households h
          ON h.household_id = bv.household_id

        LEFT JOIN users encoder
          ON encoder.user_id = h.user_id

        LEFT JOIN assistance_programs p
          ON p.program_id = bv.program_id

        WHERE bv.validation_id = $1::uuid
        `,
        [req.params.id]
      );

      if (!existing[0]) {
        return res.status(404).json({
          error:
            'Beneficiary validation record not found.',
        });
      }

      const validation = existing[0];

      // ------------------------------------------------
      // ONLY PENDING CAN BE PROCESSED
      // ------------------------------------------------

      if (
        validation.validation_status !==
        'Pending'
      ) {
        return res.status(409).json({
          error:
            `This beneficiary is already ` +
            `${validation.validation_status}.`,
        });
      }

      // ------------------------------------------------
      // UPDATE VALIDATION
      // ------------------------------------------------

      let updated;

      if (decision === 'Approved') {
        updated = await query(
          `
          UPDATE beneficiary_validation
          SET
            validation_status = 'Approved',
            remarks = $1,
            approved_at = NOW(),
            approved_by = $2::uuid

          WHERE validation_id = $3::uuid
            AND validation_status = 'Pending'

          RETURNING *
          `,
          [
            remarks?.trim() || null,
            approvedBy,
            req.params.id,
          ]
        );
      } else {
        updated = await query(
          `
          UPDATE beneficiary_validation
          SET
            validation_status = 'Rejected',
            remarks = $1,
            approved_at = NULL,
            approved_by = NULL

          WHERE validation_id = $2::uuid
            AND validation_status = 'Pending'

          RETURNING *
          `,
          [
            remarks?.trim() || null,
            req.params.id,
          ]
        );
      }

      if (!updated[0]) {
        return res.status(409).json({
          error:
            'The beneficiary could not be updated because it is no longer Pending.',
        });
      }

      // ------------------------------------------------
      // APPROVED
      // ------------------------------------------------

      if (decision === 'Approved') {
        // ----------------------------------------------
        // ADD TO DISTRIBUTION
        // ----------------------------------------------

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
              validation.household_id,
              validation.program_id,
              approvedBy,
            ]
          );
        } catch (distributionError) {
          console.error(
            'Beneficiary distribution insert failed:',
            distributionError
          );
        }

        // ----------------------------------------------
        // NOTIFY STAFF
        // ----------------------------------------------

        await safeNotifyRole({
          role: 'staff',
          title: 'Beneficiary Approved',
          message:
            `The beneficiary "${validation.household_head_name}" ` +
            `has been approved by the Captain for ` +
            `"${validation.program_name || 'Assistance Program'}".`,
          type: 'beneficiary_approved',
          referenceId:
            validation.validation_id,
        });

        // ----------------------------------------------
        // NOTIFY ADMIN
        // ----------------------------------------------

        await safeNotifyRole({
          role: 'admin',
          title: 'Beneficiary Approved',
          message:
            `The beneficiary "${validation.household_head_name}" ` +
            `has been approved by the Captain for ` +
            `"${validation.program_name || 'Assistance Program'}".`,
          type: 'beneficiary_approved',
          referenceId:
            validation.validation_id,
        });
      }

      // ------------------------------------------------
      // REJECTED
      // ------------------------------------------------

      if (decision === 'Rejected') {
        const reason =
          remarks?.trim() || '';

        // ----------------------------------------------
        // NOTIFY STAFF
        // ----------------------------------------------

        await safeNotifyRole({
          role: 'staff',
          title: 'Beneficiary Rejected',
          message:
            `The beneficiary "${validation.household_head_name}" ` +
            `has been rejected by the Captain for ` +
            `"${validation.program_name || 'Assistance Program'}".` +
            (
              reason
                ? ` Reason: ${reason}`
                : ''
            ),
          type: 'beneficiary_rejected',
          referenceId:
            validation.validation_id,
        });

        // ----------------------------------------------
        // NOTIFY ADMIN
        // ----------------------------------------------

        await safeNotifyRole({
          role: 'admin',
          title: 'Beneficiary Rejected',
          message:
            `The beneficiary "${validation.household_head_name}" ` +
            `has been rejected by the Captain for ` +
            `"${validation.program_name || 'Assistance Program'}".` +
            (
              reason
                ? ` Reason: ${reason}`
                : ''
            ),
          type: 'beneficiary_rejected',
          referenceId:
            validation.validation_id,
        });
      }

      // ------------------------------------------------
      // ACTIVITY LOG
      // ------------------------------------------------

      await safeLogActivity(
        req,
        decision === 'Approved'
          ? 'APPROVE_BENEFICIARY'
          : 'REJECT_BENEFICIARY',
        `${decision} household "${validation.household_head_name}" ` +
          `for program "${validation.program_name || 'Unknown Program'}".`
      );

      // ------------------------------------------------
      // RESPONSE
      // ------------------------------------------------

      return res.json({
        success: true,
        message:
          decision === 'Approved'
            ? 'Beneficiary approved successfully.'
            : 'Beneficiary returned successfully.',
        validation: updated[0],
      });
    } catch (error) {
      console.error(
        'PATCH /beneficiary-validation/:id/decision ERROR:',
        error
      );

      return res.status(500).json({
        error:
          error.message ||
          'Failed to save beneficiary decision.',
        code: error.code || null,
        detail: error.detail || null,
        hint: error.hint || null,
      });
    }
  }
);

// ==================================================
// GET CALAMITY PROGRAMS FOR CAPTAIN
// GET /validation/calamity-programs
//
// ONLY Pending requests.
// ==================================================

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

          h.household_head_name,
          h.purok,
          h.monthly_income,
          h.family_number,
          h.vulnerability,

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
        'GET /calamity-programs ERROR:',
        error
      );

      return res.status(500).json({
        error:
          error.message ||
          'Failed to load calamity programs.',
      });
    }
  }
);

// ==================================================
// CAPTAIN DECISION - CALAMITY
//
// PATCH
// /validation/calamity-programs/:id/decision
// ==================================================

router.patch(
  '/calamity-programs/:id/decision',
  requireRole('captain'),
  async (req, res) => {
    try {
      const {
        decision,
        remarks,
      } = req.body || {};

      // ------------------------------------------------
      // VALIDATE DECISION
      // ------------------------------------------------

      if (
        !['Approved', 'Rejected'].includes(
          decision
        )
      ) {
        return res.status(400).json({
          error:
            'Decision must be Approved or Rejected.',
        });
      }

      const cleanRemarks =
        String(remarks || '').trim();

      if (
        decision === 'Rejected' &&
        !cleanRemarks
      ) {
        return res.status(400).json({
          error:
            'Please provide a reason for returning this calamity request.',
        });
      }

      // ------------------------------------------------
      // GET CAPTAIN UUID
      // ------------------------------------------------

      const approvedBy =
        getAuthenticatedUserId(req);

      if (!approvedBy) {
        return res.status(401).json({
          error:
            'Unable to identify the Captain account.',
        });
      }

      // ------------------------------------------------
      // GET CALAMITY REQUEST
      // ------------------------------------------------

      const existing = await query(
        `
        SELECT
          cp.calamity_id,
          cp.household_id,
          cp.program_id,
          cp.status,
          cp.house_type,
          cp.roof_damage,
          cp.wall_damage,
          cp.flooding_level,
          cp.damage_risk,
          cp.risk_level,
          cp.created_at,

          h.household_head_name,
          h.purok,
          h.monthly_income,
          h.family_number,

          p.program_name

        FROM calamity_programs cp

        INNER JOIN households h
          ON h.household_id = cp.household_id

        LEFT JOIN assistance_programs p
          ON p.program_id = cp.program_id

        WHERE cp.calamity_id = $1::uuid
        `,
        [req.params.id]
      );

      if (!existing[0]) {
        return res.status(404).json({
          error:
            'Calamity assistance request not found.',
        });
      }

      const calamity = existing[0];

      // ------------------------------------------------
      // ONLY PENDING CAN BE PROCESSED
      // ------------------------------------------------

      if (calamity.status !== 'Pending') {
        return res.status(409).json({
          error:
            `This calamity request has already been ` +
            `${String(calamity.status).toLowerCase()}.`,
        });
      }

      // ==================================================
      // APPROVE CALAMITY
      // ==================================================

      if (decision === 'Approved') {
        const updated = await query(
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
            approvedBy,
            req.params.id,
          ]
        );

        if (!updated[0]) {
          return res.status(409).json({
            error:
              'Calamity request was not found or has already been processed.',
          });
        }

        // ----------------------------------------------
        // ADD TO DISTRIBUTION
        // ----------------------------------------------

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
              approvedBy,
            ]
          );
        } catch (distributionError) {
          console.error(
            'Calamity distribution insert failed:',
            distributionError
          );
        }

        // ----------------------------------------------
        // NOTIFY STAFF
        // ----------------------------------------------

        await safeNotifyRole({
          role: 'staff',
          title: 'Calamity Assistance Approved',
          message:
            `The calamity assistance request for ` +
            `"${calamity.household_head_name}" ` +
            `has been approved by the Captain.`,
          type: 'calamity_approved',
          referenceId:
            calamity.calamity_id,
        });

        // ----------------------------------------------
        // NOTIFY ADMIN
        // ----------------------------------------------

        await safeNotifyRole({
          role: 'admin',
          title: 'Calamity Assistance Approved',
          message:
            `The calamity assistance request for ` +
            `"${calamity.household_head_name}" ` +
            `has been approved by the Captain.`,
          type: 'calamity_approved',
          referenceId:
            calamity.calamity_id,
        });

        // ----------------------------------------------
        // ACTIVITY LOG
        // ----------------------------------------------

        await safeLogActivity(
          req,
          'APPROVE_CALAMITY_PROGRAM',
          `Approved calamity assistance request for ` +
            `"${calamity.household_head_name}" ` +
            `under "${calamity.program_name || 'Calamity Assistance'}".`
        );

        return res.status(200).json({
          success: true,
          message:
            'Calamity assistance approved successfully.',
          calamityProgram: updated[0],
        });
      }

      // ==================================================
      // REJECT / RETURN CALAMITY
      // ==================================================

      const updated = await query(
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
          approvedBy,
          cleanRemarks,
          req.params.id,
        ]
      );

      if (!updated[0]) {
        return res.status(409).json({
          error:
            'Calamity request was not found or has already been processed.',
        });
      }

      // ----------------------------------------------
      // NOTIFY STAFF
      // ----------------------------------------------

      await safeNotifyRole({
        role: 'staff',
        title: 'Calamity Assistance Rejected',
        message:
          `The calamity assistance request for ` +
          `"${calamity.household_head_name}" ` +
          `has been rejected by the Captain. ` +
          `Reason: ${cleanRemarks}`,
        type: 'calamity_rejected',
        referenceId:
          calamity.calamity_id,
      });

      // ----------------------------------------------
      // NOTIFY ADMIN
      // ----------------------------------------------

      await safeNotifyRole({
        role: 'admin',
        title: 'Calamity Assistance Rejected',
        message:
          `The calamity assistance request for ` +
          `"${calamity.household_head_name}" ` +
          `has been rejected by the Captain. ` +
          `Reason: ${cleanRemarks}`,
        type: 'calamity_rejected',
        referenceId:
          calamity.calamity_id,
      });

      // ----------------------------------------------
      // ACTIVITY LOG
      // ----------------------------------------------

      await safeLogActivity(
        req,
        'REJECT_CALAMITY_PROGRAM',
        `Returned calamity assistance request for ` +
          `"${calamity.household_head_name}" ` +
          `under "${calamity.program_name || 'Calamity Assistance'}". ` +
          `Reason: ${cleanRemarks}`
      );

      return res.status(200).json({
        success: true,
        message:
          'Calamity assistance returned successfully.',
        calamityProgram: updated[0],
      });
    } catch (error) {
      console.error(
        'CALAMITY CAPTAIN DECISION ERROR:',
        error
      );

      return res.status(500).json({
        error:
          error.message ||
          'Failed to save calamity decision.',
        code: error.code || null,
        detail: error.detail || null,
        hint: error.hint || null,
      });
    }
  }
);

module.exports = router;