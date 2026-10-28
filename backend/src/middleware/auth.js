const { verifyToken } = require('../lib/auth');
const { query } = require('../db');

function auth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ')
    ? header.slice(7)
    : null;

  if (!token) {
    return res.status(401).json({
      error: 'Authentication required.'
    });
  }

  try {
    const payload = verifyToken(token);

    req.user = payload;

    next();
  } catch (e) {
    console.error('Authentication failed:', e.message);

    return res.status(401).json({
      error: 'Invalid or expired token.'
    });
  }
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        error: 'Authentication required.'
      });
    }

    const userRole =
      req.user.role ||
      req.user.roles;

    const normalizedRole =
      typeof userRole === 'string'
        ? userRole.trim().toLowerCase()
        : '';

    const allowedRoles = roles.map((role) =>
      String(role).trim().toLowerCase()
    );

    if (!allowedRoles.includes(normalizedRole)) {
      console.log('ROLE CHECK FAILED:', {
        userId: req.user.users,
        role: userRole,
        requiredRoles: roles
      });

      return res.status(403).json({
        error: 'You do not have permission for this action.'
      });
    }

    next();
  };
}

async function logActivity(req, action, description) {
  if (!req.user) return;

  try {
    await query(
      `
      INSERT INTO activity_logs (
        user_id,
        action,
        activity_description
      )
      VALUES ($1, $2, $3)
      `,
      [
        req.user.users,
        action,
        description
      ]
    );
  } catch (e) {
    console.error(
      'logActivity failed:',
      e.message
    );
  }
}

module.exports = {
  auth,
  requireRole,
  logActivity
};