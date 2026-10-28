const express = require('express');
const router = express.Router();
const { query } = require('../db');
const { auth, requireRole } = require('../middleware/auth');

router.use(auth, requireRole('admin'));

router.get('/', async (req, res) => {
  try {
    const rows = await query(
      `select l.*, u.username
         from activity_logs l left join users u on u.user_id = l.user_id
        order by l.timestamp desc limit 200`
    );
    res.json({ logs: rows });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
