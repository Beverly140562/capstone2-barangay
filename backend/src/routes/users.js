const express = require('express');
const router = express.Router();
const { query } = require('../db');
const { hashPassword } = require('../lib/auth');
const { auth, requireRole, logActivity } = require('../middleware/auth');

router.use(auth, requireRole('admin'));

router.get('/', async (req, res) => {
  try {
    const rows = await query(
      `select user_id, username, full_name, email, roles, account_status, date_created
         from users order by date_created desc`
    );
    res.json({ users: rows });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/', async (req, res) => {
  try {
    const { email, full_name, password, roles, username } = req.body || {};
    if (!full_name || !username || !password || !roles) {
      return res.status(400).json({ error: 'full_name, username, password, roles are required.' });
    }
    if (!['admin', 'captain', 'staff'].includes(roles)) {
      return res.status(400).json({ error: 'roles must be admin, captain or staff.' });
    }
    const rows = await query(
      `insert into users (email, full_name, password, roles, username)
       values ($1, $2, $3, $4, $5) returning user_id, username, full_name, email, roles, account_status`,
      [email || null, full_name, hashPassword(password), roles, username]
    );
    await logActivity(req, 'CREATE_USER', `Created ${roles} account "${username}".`);
    res.status(201).json({ user: rows[0] });
  } catch (e) {
    if (e.code === '23505') return res.status(409).json({ error: 'Username or email already exists.' });
    res.status(500).json({ error: e.message });
  }
});

router.put('/:id', async (req, res) => { 
  try {
    const { id } = req.params;
    const { email, full_name, roles, username, password, account_status } = req.body || {};
    if (roles && !['admin', 'captain', 'staff'].includes(roles)) {
      return res.status(400).json({ error: 'roles must be admin, captain or staff.' });
    }
    const fields = [];
    const params = [];
    const set = (name, value) => {
      if (value !== undefined) {
        params.push(value);
        fields.push(`${name} = $${params.length}`);
      }
    };
    set('email', email);
    set('full_name', full_name);
    set('roles', roles);
    set('username', username);
    set('account_status', account_status);
    if (password) {
      params.push(hashPassword(password));
      fields.push(`password = $${params.length}`);
    }
    if (!fields.length) return res.status(400).json({ error: 'Nothing to update.' });
    params.push(id);
    const rows = await query(
      `update users set ${fields.join(', ')} where user_id = $${params.length}
       returning user_id, username, full_name, email, roles, account_status`,
      params
    );
    if (!rows[0]) return res.status(404).json({ error: 'User not found.' });
    await logActivity(req, 'UPDATE_USER', `Updated account "${rows[0].username}".`);
    res.json({ user: rows[0] });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.patch('/:id/status', async (req, res) => {
  try {
    const { id } = req.params;
    const { account_status } = req.body || {};
    if (typeof account_status !== 'boolean') {
      return res.status(400).json({ error: 'account_status must be a boolean.' });
    }
    const rows = await query(
      `update users set account_status = $1 where user_id = $2
       returning user_id, username, full_name, email, roles, account_status`,
      [account_status, id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'User not found.' });
    await logActivity(req, account_status ? 'ACTIVATE_USER' : 'DEACTIVATE_USER',
      `Set "${rows[0].username}" to ${account_status ? 'active' : 'inactive'}.`);
    res.json({ user: rows[0] });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const rows = await query('delete from users where user_id = $1 returning username', [req.params.id]);
    if (!rows[0]) return res.status(404).json({ error: 'User not found.' });
    await logActivity(req, 'DELETE_USER', `Deleted account "${rows[0].username}".`);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
