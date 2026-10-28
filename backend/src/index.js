require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { initDb, query } = require('./db');
const { hashPassword } = require('./lib/auth');

async function seedUsers() {
  const existing = await query('select count(*)::int as n from users');
  if (existing[0].n > 0) return;
  await query(
    `insert into users (email, full_name, password, roles, username) values
     ($1, $2, $3, 'admin', 'admin'),
     ($4, $5, $6, 'captain', 'captain'),
     ($7, $8, $9, 'staff', 'staff')`,
    ['admin@luinab.gov.ph', 'System Administrator', hashPassword('admin123'),
     'captain@luinab.gov.ph', 'Barangay Captain', hashPassword('captain123'),
     'staff@luinab.gov.ph', 'Barangay Secretary', hashPassword('staff123')]
  );
  
  console.log('Seeded default users and assistance programs.');
}

async function main() {
  await initDb();
  await seedUsers();

  const app = express();
  const allowedOrigins = [
  'https://luinab-profiling-66p3.vercel.app',
  'https://luinab-profiling-66p3-f597aejhg-beverlys-projects-fb926395.vercel.app',
];

app.use(cors({
  origin(origin, callback) {
    // Allow requests without an Origin header, such as server-to-server calls.
    if (!origin || allowedOrigins.includes(origin)) {
      return callback(null, true);
    }

    return callback(new Error('Origin not allowed by CORS'));
  },
  credentials: true,
}));

  app.get('/', (req, res) => res.json({ name: 'Barangay Luinab API', status: 'ok' }));
  app.use('/auth', require('./routes/auth'));
  app.use('/users', require('./routes/users'));
  app.use('/households', require('./routes/households'));
  app.use('/validation', require('./routes/validation'));
  app.use('/programs', require('./routes/programs'));
  app.use('/distributions', require('./routes/distributions'));
  app.use('/analytics', require('./routes/analytics'));
  app.use('/reports', require('./routes/reports'));
  app.use('/activity', require('./routes/activity'));
  app.use('/calamity', require('./routes/calamity'));
  app.use('/history', require('./routes/history'));
  app.use('/notifications', require('./routes/notifications'));
  app.use('/public', require('./routes/public'));

  app.use((req, res) => res.status(404).json({ error: 'Not found.' }));
  app.use((err, req, res, next) => {
    console.error(err);
    res.status(500).json({ error: 'Internal server error.' });
  });

  const port = process.env.PORT || 4000;
  app.listen(port, () => console.log(`API listening on http://localhost:${port}`));
}

main().catch((e) => {
  console.error('Fatal startup error:', e);
  process.exit(1);
});

