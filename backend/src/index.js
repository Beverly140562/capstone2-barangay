
require('dotenv').config();

const express = require('express');
const cors = require('cors');

const { initDb, query } = require('./db');
const { hashPassword } = require('./lib/auth');

const app = express();

/*
|--------------------------------------------------------------------------
| CORS CONFIGURATION
|--------------------------------------------------------------------------
*/

const allowedOrigins = [
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'https://capstone2-barangay-j5ni.vercel.app',
];

const corsOptions = {
  origin: (origin, callback) => {
    // Allow requests without an Origin header, such as server-to-server calls.
    if (!origin || allowedOrigins.includes(origin)) {
      return callback(null, true);
    }

    console.error(`CORS blocked origin: ${origin}`);
    return callback(new Error('Origin not allowed by CORS'));
  },

  methods: [
    'GET',
    'POST',
    'PUT',
    'PATCH',
    'DELETE',
    'OPTIONS',
  ],

  allowedHeaders: [
    'Content-Type',
    'Authorization',
  ],

  credentials: true,
  optionsSuccessStatus: 204,
};

// CORS must run before authentication and API routes.
app.use(cors(corsOptions));

// Handle browser preflight requests.
app.options(/.*/, cors(corsOptions));

// Parse JSON request bodies.
app.use(express.json());

/*
|--------------------------------------------------------------------------
| SEED DEFAULT USERS
|--------------------------------------------------------------------------
*/

async function seedUsers() {
  const existing = await query(
    'SELECT COUNT(*)::int AS n FROM users'
  );

  if (Number(existing[0].n) > 0) {
    return;
  }

  await query(
    `INSERT INTO users
      (email, full_name, password, roles, username)
     VALUES
      ($1, $2, $3, 'admin', 'admin'),
      ($4, $5, $6, 'captain', 'captain'),
      ($7, $8, $9, 'staff', 'staff')`,
    [
      'admin@luinab.gov.ph',
      'System Administrator',
      hashPassword('admin123'),

      'captain@luinab.gov.ph',
      'Barangay Captain',
      hashPassword('captain123'),

      'staff@luinab.gov.ph',
      'Barangay Secretary',
      hashPassword('staff123'),
    ]
  );

  console.log('Seeded default users.');
}

/*
|--------------------------------------------------------------------------
| HEALTH CHECK
|--------------------------------------------------------------------------
*/

app.get('/', (req, res) => {
  res.status(200).json({
    name: 'Barangay Luinab API',
    status: 'ok',
  });
});

/*
|--------------------------------------------------------------------------
| API ROUTES
|--------------------------------------------------------------------------
*/

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

/*
|--------------------------------------------------------------------------
| NOT FOUND HANDLER
|--------------------------------------------------------------------------
*/

app.use((req, res) => {
  res.status(404).json({
    error: 'Not found.',
    path: req.originalUrl,
  });
});

/*
|--------------------------------------------------------------------------
| ERROR HANDLER
|--------------------------------------------------------------------------
*/

app.use((err, req, res, next) => {
  console.error('API error:', err.message);

  // Return CORS errors as 403 rather than a generic 500.
  if (err.message === 'Origin not allowed by CORS') {
    return res.status(403).json({
      error: 'Origin not allowed by CORS.',
    });
  }

  if (res.headersSent) {
    return next(err);
  }

  return res.status(500).json({
    error: 'Internal server error.',
  });
});

/*
|--------------------------------------------------------------------------
| START SERVER
|--------------------------------------------------------------------------
*/

async function main() {
  try {
    await initDb();
    await seedUsers();

    const port = process.env.PORT || 4000;

    app.listen(port, '0.0.0.0', () => {
      console.log(`API listening on port ${port}`);
    });
  } catch (error) {
    console.error('Fatal startup error:', error);
    process.exit(1);
  }
}

main();
