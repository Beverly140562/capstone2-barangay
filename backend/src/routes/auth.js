
const express = require('express');
const router = express.Router();

const { query } = require('../db');

const {
  comparePassword,
  signToken,
} = require('../lib/auth');

const { auth } = require('../middleware/auth');

// --------------------------------------------------
// LOGIN - EMAIL AND PASSWORD
// --------------------------------------------------


router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body || {};

    const loginValue = String(username || '').trim();

    if (!loginValue || !password) {
      return res.status(400).json({
        error: 'Username/email and password are required.',
      });
    }

    // Find account using either username or email.
    const rows = await query(
      `
      SELECT *
      FROM users
      WHERE LOWER(TRIM(username)) = LOWER($1)
         OR LOWER(TRIM(email)) = LOWER($1)
      LIMIT 1
      `,
      [loginValue]
    );

    const user = rows[0];

    if (!user || !comparePassword(password, user.password)) {
      return res.status(401).json({
        error: 'Invalid username/email or password.',
      });
    }

    if (!user.account_status) {
      return res.status(403).json({
        error: 'This account has been deactivated.',
      });
    }

    const assignedRole = String(user.roles || '')
      .trim()
      .toLowerCase();

    if (!['admin', 'captain', 'staff'].includes(assignedRole)) {
      return res.status(403).json({
        error: 'Invalid account role. Contact the administrator.',
      });
    }

    await query(
      `UPDATE users SET visited_date = NOW() WHERE user_id = $1`,
      [user.user_id]
    );

    const token = signToken({
      ...user,
      roles: assignedRole,
    });

    return res.json({
      token,
      user: {
        user_id: user.user_id,
        username: user.username,
        full_name: user.full_name,
        email: user.email,
        roles: assignedRole,
        role: assignedRole,
      },
    });

  } catch (e) {
    console.error('Login error:', e);

    return res.status(500).json({
      error: 'Server error during login.',
    });
  }
});



// --------------------------------------------------
// CURRENT LOGGED-IN USER
// --------------------------------------------------

router.get('/me', auth, async (req, res) => {
  try {
    const userId =
      req.user?.users ??
      req.user?.user_id ??
      req.user?.id ??
      req.user?.sub;

    if (!userId) {
      return res.status(401).json({
        error: 'Invalid authentication token.',
      });
    }

    // Always retrieve the latest role from the database.
    const rows = await query(
      `
      SELECT
        user_id,
        username,
        full_name,
        email,
        roles,
        account_status,
        date_created
      FROM users
      WHERE user_id = $1
      LIMIT 1
      `,
      [userId]
    );

    const currentUser = rows[0];

    if (!currentUser) {
      return res.status(404).json({
        error: 'User not found.',
      });
    }

    if (!currentUser.account_status) {
      return res.status(403).json({
        error: 'This account has been deactivated.',
      });
    }

    const assignedRole = String(currentUser.roles || '')
      .trim()
      .toLowerCase();

    if (!['admin', 'captain', 'staff'].includes(assignedRole)) {
      return res.status(403).json({
        error: 'Your account has no valid assigned role.',
      });
    }

    return res.json({
      user: {
        ...currentUser,
        roles: assignedRole,
        role: assignedRole,
      },
    });

  } catch (e) {
    console.error('Auth /me error:', e);

    return res.status(500).json({
      error: 'Server error.',
    });
  }
});

module.exports = router;
