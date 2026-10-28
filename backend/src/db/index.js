require('dotenv').config();

const path = require('path');
const fs = require('fs');
const { Pool } = require('pg');

// Load Supabase database schema
const SCHEMA_SQL = fs
  .readFileSync(
    path.join(
      __dirname,
      '..',
      '..',
      '..',
      'supabase',
      'migrations',
      '0001_schema.sql'
    ),
    'utf8'
  )
  .replace(/^\uFEFF/, '');

let db = null;

/**
 * Initialize Supabase PostgreSQL
 */
async function initDb() {
  if (!process.env.API_BASE_URL) {
    throw new Error(
      'API_BASE_URL is missing. Add your Supabase PostgreSQL connection string to .env'
    );
  }

  console.log('Connecting to Supabase PostgreSQL...');

  try {
    db = new Pool({
      connectionString: process.env.API_BASE_URL,
      max: 10,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 10000,
    });

    // Test the connection
    const result = await db.query('SELECT NOW() AS current_time');

    console.log(
      'Connected to Supabase PostgreSQL:',
      result.rows[0].current_time
    );

    // Initialize database tables
    await db.query(SCHEMA_SQL);

    console.log('Supabase database schema initialized successfully.');

    return db;
  } catch (error) {
    console.error('Failed to connect to Supabase PostgreSQL.');

    // Show safe connection information
    if (process.env.API_BASE_URL) {
      try {
        const url = new URL(process.env.API_BASE_URL);

        console.error('Database host:', url.hostname);
        console.error('Database port:', url.port);
        console.error('Database:', url.pathname.replace('/', ''));
      } catch {
        console.error('API_BASE_URL has an invalid format.');
      }
    }

    throw error;
  }
}

/**
 * Get database connection
 */
function getDb() {
  if (!db) {
    throw new Error(
      'Database not initialized. Call initDb() first.'
    );
  }

  return db;
}

/**
 * Execute SQL query
 */
async function query(text, params = []) {
  const client = getDb();

  const result = await client.query(text, params);

  return result.rows;
}

/**
 * Execute SQL command
 */
async function run(sql, params = []) {
  const client = getDb();

  await client.query(sql, params);
}

module.exports = {
  initDb,
  getDb,
  query,
  run,
  SCHEMA_SQL,
};