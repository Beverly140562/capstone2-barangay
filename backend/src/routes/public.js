const express = require('express');
const router = express.Router();
const { query } = require('../db');

router.get('/stats', async (req, res) => {
  try {
    const result = await query(`
      SELECT
        COUNT(*)::int AS total_households,
        COALESCE(
          SUM(
            CASE
              WHEN family_number IS NOT NULL
              THEN family_number
              ELSE 0
            END
          ),
          0
        )::int AS total_residents
      FROM households
      WHERE household_status = 'Active'
    `);

    const row = Array.isArray(result)
      ? result[0]
      : result?.rows?.[0];

    res.json({
      totalHouseholds: Number(row?.total_households || 0),
      totalResidents: Number(row?.total_residents || 0),
    });
  } catch (error) {
    console.error('PUBLIC STATS ERROR:', error);

    res.status(500).json({
      error: 'Failed to load public statistics.',
    });
  }
});

module.exports = router;