const express = require('express');

const router = express.Router();

const { query } = require('../db');

const {
  comparePassword,
  signToken,
} = require('../lib/auth');

const { auth } = require('../middleware/auth');

// --------------------------------------------------
// LOGIN
// --------------------------------------------------
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body || {};

    if (!username || !password) {
      return res.status(400).json({
        error: 'Username and password are required.',
      });
    }

    const rows = await query(
      'select * from users where lower(username) = lower($1)',
      [username]
    );

    const user = rows[0];

    if (!user || !comparePassword(password, user.password)) {
      return res.status(401).json({
        error: 'Invalid username or password.',
      });
    }

    if (!user.account_status) {
      return res.status(403).json({
        error: 'This account has been deactivated.',
      });
    }

    const token = signToken(user);

    res.json({
      token,

      user: {
        user_id: user.user_id,
        username: user.username,
        full_name: user.full_name,
        email: user.email,
        roles: user.roles,
      },
    });
  } catch (e) {
    console.error('Login error:', e);

    res.status(500).json({
      error: 'Server error during login.',
    });
  }
});

// --------------------------------------------------
// CURRENT LOGGED-IN USER
// --------------------------------------------------
router.get('/me', auth, async (req, res) => {
  try {
    // IMPORTANT:
    // signToken() stores the user ID as "users",
    // not "sub".
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

    const rows = await query(
      `
      select
        user_id,
        username,
        full_name,
        email,
        roles,
        account_status,
        date_created
      from users
      where user_id = $1
      `,
      [userId]
    );

    if (!rows[0]) {
      return res.status(404).json({
        error: 'User not found.',
      });
    }

    // If the account was deactivated after login,
    // don't allow the session to continue.
    if (!rows[0].account_status) {
      return res.status(403).json({
        error: 'This account has been deactivated.',
      });
    }

    res.json({
      user: rows[0],
    });
  } catch (e) {
    console.error('Auth /me error:', e);

    res.status(500).json({
      error: 'Server error.',
    });
  }
});

module.exports = router;