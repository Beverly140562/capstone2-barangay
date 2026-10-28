const express = require('express');
const router = express.Router();

const { query } = require('../db');
const { auth } = require('../middleware/auth');

router.use(auth);

/*
|--------------------------------------------------------------------------
| GET CURRENT USER ID
|--------------------------------------------------------------------------
*/
function getCurrentUserId(req) {
  return (
    req.user?.users ||
    req.user?.user_id ||
    req.user?.id ||
    req.user?.sub ||
    null
  );
}

/*
|--------------------------------------------------------------------------
| CREATE NOTIFICATION
|--------------------------------------------------------------------------
*/
async function createNotification({
  userId,
  title,
  message,
  type,
  referenceId = null,
}) {
  if (!userId) {
    console.warn(
      'Notification skipped: userId is missing.'
    );
    return;
  }

  try {
    await query(
      `
      INSERT INTO notifications (
        user_id,
        title,
        message,
        notification_type,
        reference_id
      )
      VALUES (
        $1::uuid,
        $2,
        $3,
        $4,
        $5::uuid
      )
      `,
      [
        userId,
        title,
        message,
        type,
        referenceId,
      ]
    );

    console.log(
      'NOTIFICATION CREATED:',
      {
        userId,
        title,
        type,
        referenceId,
      }
    );
  } catch (error) {
    console.error(
      'CREATE NOTIFICATION ERROR:',
      error
    );

    throw error;
  }
}

/*
|--------------------------------------------------------------------------
| GET USERS BY ROLE
|--------------------------------------------------------------------------
*/
async function getUsersByRole(role) {
  try {
    const rows = await query(
      `
      SELECT user_id
      FROM users
      WHERE roles = $1
        AND account_status = TRUE
      `,
      [role]
    );

    return Array.isArray(rows)
      ? rows
      : [];
  } catch (error) {
    console.error(
      'GET USERS BY ROLE ERROR:',
      error
    );

    throw error;
  }
}

/*
|--------------------------------------------------------------------------
| NOTIFY ALL USERS WITH A ROLE
|--------------------------------------------------------------------------
*/
async function notifyRole({
  role,
  title,
  message,
  type,
  referenceId = null,
}) {
  try {
    const users =
      await getUsersByRole(role);

    console.log(
      `NOTIFY ROLE: ${role}`,
      'USERS:',
      users.length
    );

    for (const user of users) {
      await createNotification({
        userId: user.user_id,
        title,
        message,
        type,
        referenceId,
      });
    }
  } catch (error) {
    console.error(
      'NOTIFY ROLE ERROR:',
      error
    );

    throw error;
  }
}

/*
|--------------------------------------------------------------------------
| GET NOTIFICATIONS
| GET /notifications
|--------------------------------------------------------------------------
*/
router.get('/', async (req, res) => {
  try {
    const userId = getCurrentUserId(req);

    console.log(
      'NOTIFICATION USER:',
      req.user
    );

    console.log(
      'NOTIFICATION USER ID:',
      userId
    );

    if (!userId) {
      return res.status(401).json({
        error: 'Authenticated user ID not found.',
      });
    }

    const rows = await query(
      `
      SELECT
        notification_id,
        title,
        user_id,
        message,
        notification_type,
        reference_id,
        is_read,
        created_at
      FROM notifications
      WHERE user_id = $1::uuid
      ORDER BY created_at DESC
      LIMIT 50
      `,
      [userId]
    );

    return res.json(
      Array.isArray(rows)
        ? rows
        : []
    );
  } catch (error) {
    console.error(
      'GET /notifications ERROR:',
      error
    );

    return res.status(500).json({
      error:
        error.message ||
        'Failed to load notifications.',
    });
  }
});

/*
|--------------------------------------------------------------------------
| GET UNREAD COUNT
| GET /notifications/unread-count
|--------------------------------------------------------------------------
*/
router.get('/unread-count', async (req, res) => {
  try {
    const userId = getCurrentUserId(req);

    console.log(
      'UNREAD COUNT USER:',
      req.user
    );

    console.log(
      'UNREAD COUNT USER ID:',
      userId
    );

    if (!userId) {
      return res.status(401).json({
        error: 'Authenticated user ID not found.',
      });
    }

    const rows = await query(
      `
      SELECT COUNT(*)::int AS count
      FROM notifications
      WHERE user_id = $1::uuid
        AND is_read = FALSE
      `,
      [userId]
    );

    const count =
      Array.isArray(rows) &&
      rows.length > 0
        ? Number(rows[0].count || 0)
        : 0;

    return res.json({
      count,
    });
  } catch (error) {
    console.error(
      'GET /notifications/unread-count ERROR:',
      error
    );

    return res.status(500).json({
      error:
        error.message ||
        'Failed to get unread notification count.',
    });
  }
});

/*
|--------------------------------------------------------------------------
| MARK ALL AS READ
| PATCH /notifications/read-all
|--------------------------------------------------------------------------
*/
router.patch('/read-all', async (req, res) => {
  try {
    const userId = getCurrentUserId(req);

    if (!userId) {
      return res.status(401).json({
        error: 'Authenticated user ID not found.',
      });
    }

    await query(
      `
      UPDATE notifications
      SET is_read = TRUE
      WHERE user_id = $1::uuid
        AND is_read = FALSE
      `,
      [userId]
    );

    return res.json({
      success: true,
      message: 'All notifications marked as read.',
    });
  } catch (error) {
    console.error(
      'PATCH /notifications/read-all ERROR:',
      error
    );

    return res.status(500).json({
      error:
        error.message ||
        'Failed to mark notifications as read.',
    });
  }
});

/*
|--------------------------------------------------------------------------
| MARK ONE NOTIFICATION AS READ
| PATCH /notifications/:id/read
|--------------------------------------------------------------------------
*/
router.patch('/:id/read', async (req, res) => {
  try {
    const userId = getCurrentUserId(req);
    const notificationId = req.params.id;

    if (!userId) {
      return res.status(401).json({
        error: 'Authenticated user ID not found.',
      });
    }

    if (!notificationId) {
      return res.status(400).json({
        error: 'Notification ID is required.',
      });
    }

    const rows = await query(
      `
      UPDATE notifications
      SET is_read = TRUE
      WHERE notification_id = $1::uuid
        AND user_id = $2::uuid
      RETURNING notification_id
      `,
      [
        notificationId,
        userId,
      ]
    );

    if (
      !Array.isArray(rows) ||
      !rows[0]
    ) {
      return res.status(404).json({
        error: 'Notification not found.',
      });
    }

    return res.json({
      success: true,
      message: 'Notification marked as read.',
    });
  } catch (error) {
    console.error(
      'PATCH /notifications/:id/read ERROR:',
      error
    );

    return res.status(500).json({
      error:
        error.message ||
        'Failed to mark notification as read.',
    });
  }
});

/*
|--------------------------------------------------------------------------
| EXPORT
|--------------------------------------------------------------------------
|
| Export both the Express router and notification helper functions.
|--------------------------------------------------------------------------
*/
module.exports = router;

module.exports.createNotification =
  createNotification;

module.exports.getUsersByRole =
  getUsersByRole;

module.exports.notifyRole =
  notifyRole;