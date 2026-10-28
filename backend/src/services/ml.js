const ML_URL =
  process.env.ML_SERVICE_URL ||
  'http://127.0.0.1:5001';

const { query } = require('../db');


/* =========================================================
   PREPARE HOUSEHOLD DATA
   ========================================================= */


function toBoolean(value) {
  if (typeof value === 'boolean') {
    return value;
  }

  if (typeof value === 'number') {
    return value === 1;
  }

  if (value == null) {
    return false;
  }

  return ['true', '1', 'yes', 'y'].includes(
    String(value).trim().toLowerCase()
  );
}

function prepareHousehold(row = {}) {
  return {
    // Existing fields
    monthly_income: Number(row.monthly_income) || 0,
    family_number: Number(row.family_number) || 1,
    age: Number(row.age) || 0,
    length_residency: Number(row.length_residency) || 0,

    sex: row.sex || 'male',
    civil_status: row.civil_status || 'Single',
    highest_education: row.highest_education || 'None',
    occupation: row.occupation || 'None',
    residence: row.residence || 'Owned',
    disability_present: toBoolean(row.disability_present),

    // New model fields
    member_count:
      row.member_count == null
        ? null
        : Number(row.member_count),

    family_size:
      row.family_size == null
        ? null
        : Number(row.family_size),

    head_education:
      row.head_education || null,

    all_members_explicitly_unemployed:
      row.all_members_explicitly_unemployed == null
        ? null
        : toBoolean(row.all_members_explicitly_unemployed),

    provisional_disability_indicator:
      row.provisional_disability_indicator == null
        ? null
        : toBoolean(row.provisional_disability_indicator),

    illness_indicator:
      row.illness_indicator == null
        ? null
        : toBoolean(row.illness_indicator),
  };
}


/* =========================================================
   GET ASSISTANCE PROGRAMS
   ========================================================= */

async function getAssistancePrograms() {
  try {
    const rows = await query(`
      SELECT
        program_id,
        program_name,
        description,
        eligibility_rules
      FROM assistance_programs
      ORDER BY program_name ASC
    `);

    return rows || [];

  } catch (error) {
    console.error(
      'Failed to load assistance programs:',
      error.message
    );

    return [];
  }
}


/* =========================================================
   RANDOM FOREST - SINGLE HOUSEHOLD
   ========================================================= */

async function predictHousehold(
  row,
  programs = null
) {
  const household =
    prepareHousehold(row);

  /*
   * Load programs from the database when
   * the caller does not provide them.
   */
  if (!Array.isArray(programs)) {
    programs =
      await getAssistancePrograms();
  }

  try {

    console.log(
      `Sending household to ML service: ${ML_URL}`
    );

    console.log(
      `Sending ${programs.length} assistance program(s) to ML service.`
    );

    const response =
      await fetch(
        `${ML_URL}/predict`,
        {
          method: 'POST',

          headers: {
            'Content-Type':
              'application/json',
          },

          body: JSON.stringify({
            household,
            programs,
          }),

          signal:
            AbortSignal.timeout(8000),
        }
      );

    const data =
      await response.json();

    if (!response.ok) {
      throw new Error(
        data.detail ||
        `ML service responded ${response.status}`
      );
    }

    console.log(
      'Random Forest result:',
      data
    );

    return data;

  } catch (error) {

    console.error(
      'ML prediction error:',
      error.message
    );

    console.warn(
      'Using rule-based fallback.'
    );

    /*
     * IMPORTANT:
     *
     * The fallback below only determines
     * vulnerability.
     *
     * It does not hardcode assistance
     * program names.
     */
    return {
      ...ruleBasedFallback(household),

      suggested_programs: [],
    };
  }
}


/* =========================================================
   RANDOM FOREST - BATCH PREDICTION
   ========================================================= */

async function predictHouseholds(
  rows = [],
  programs = null
) {
  const households =
    rows.map(
      prepareHousehold
    );

  if (!Array.isArray(programs)) {
    programs =
      await getAssistancePrograms();
  }

  try {

    console.log(
      `Sending ${households.length} household(s) to ML service.`
    );

    console.log(
      `Sending ${programs.length} assistance program(s) to ML service.`
    );

    const response =
      await fetch(
        `${ML_URL}/predict-batch`,
        {
          method: 'POST',

          headers: {
            'Content-Type':
              'application/json',
          },

          body: JSON.stringify({
            households,
            programs,
          }),

          signal:
            AbortSignal.timeout(15000),
        }
      );

    const data =
      await response.json();

    if (!response.ok) {
  console.error(
    'ML validation/API error:',
    JSON.stringify(data, null, 2)
  );

  throw new Error(
    typeof data.detail === 'string'
      ? data.detail
      : JSON.stringify(data.detail || data)
  );
}

    return data;

  } catch (error) {

    console.error(
      'ML batch prediction error:',
      error.message
    );

    return {
      results:
        households.map(
          ruleBasedFallback
        ),
    };
  }
}


/* =========================================================
   RULE-BASED FALLBACK
   ========================================================= */

function ruleBasedFallback(f) {

  let score = 0;


  /* -------------------------------------------------------
     INCOME
     ------------------------------------------------------- */

  if (f.monthly_income < 6000) {

    score += 3;

  } else if (f.monthly_income < 12000) {

    score += 2;

  } else if (f.monthly_income < 20000) {

    score += 1;
  }


  /* -------------------------------------------------------
     FAMILY SIZE
     ------------------------------------------------------- */

  if (f.family_number >= 6) {

    score += 2;

  } else if (f.family_number >= 4) {

    score += 1;
  }


  /* -------------------------------------------------------
     DISABILITY
     ------------------------------------------------------- */

 
const disability =
  toBoolean(f.disability_present);

if (disability) {
  score += 3;
}



  /* -------------------------------------------------------
     AGE
     ------------------------------------------------------- */

  if (f.age >= 60) {
    score += 2;
  }


  /* -------------------------------------------------------
     OCCUPATION
     ------------------------------------------------------- */

  if (
    String(f.occupation)
      .trim()
      .toLowerCase() === 'none' ||

    String(f.occupation)
      .trim()
      .toLowerCase() === 'unemployed'
  ) {

    score += 2;
  }


  /* -------------------------------------------------------
     EDUCATION
     ------------------------------------------------------- */

  const education =
    String(
      f.highest_education || ''
    )
      .trim()
      .toLowerCase();

  if (
    education === 'none' ||
    education === 'elementary'
  ) {

    score += 1;
  }


  /* -------------------------------------------------------
     CLASSIFICATION
     ------------------------------------------------------- */

  let vulnerability;

  if (score >= 6) {

    vulnerability =
      'Highly Vulnerable';

  } else if (score >= 3) {

    vulnerability =
      'Moderately Vulnerable';

  } else {

    vulnerability =
      'Low Vulnerable';
  }


  /* -------------------------------------------------------
     FALLBACK CONFIDENCE
     ------------------------------------------------------- */

  const probability =
    Math.min(
      0.97,
      0.50 + score * 0.07
    );


  const high =
    vulnerability ===
      'Highly Vulnerable'
      ? probability
      : 0;

  const moderate =
    vulnerability ===
      'Moderately Vulnerable'
      ? probability
      : 0;

  const low =
    vulnerability ===
      'Low Vulnerable'
      ? probability
      : 0;


  return {

    vulnerability,

    vulnerability_prob:
      Number(
        probability.toFixed(4)
      ),

    probabilities: {

      'Highly Vulnerable':
        Number(
          high.toFixed(4)
        ),

      'Moderately Vulnerable':
        Number(
          moderate.toFixed(4)
        ),

      'Low Vulnerable':
        Number(
          low.toFixed(4)
        ),
    },

    suggested_programs: [],
  };
}


/* =========================================================
   CHECK ML SERVICE
   ========================================================= */

async function mlHealth() {

  try {

    const response =
      await fetch(
        `${ML_URL}/health`,
        {
          signal:
            AbortSignal.timeout(3000),
        }
      );

    return await response.json();

  } catch (error) {

    return {

      status:
        'unavailable',

      model_loaded:
        false,

      error:
        error.message,
    };
  }
}


/* =========================================================
   RETRAIN MODEL
   ========================================================= */

async function retrainModel() {

  const response =
    await fetch(
      `${ML_URL}/retrain`,
      {
        method: 'POST',

        headers: {
          'Content-Type':
            'application/json',
        },

        signal:
          AbortSignal.timeout(60000),
      }
    );

  const data =
    await response.json();

  if (!response.ok) {

    throw new Error(
      data.detail ||
      `Retraining failed with status ${response.status}`
    );
  }

  return data;
}


/* =========================================================
   EXPORT
   ========================================================= */

module.exports = {
  predictHousehold,
  predictHouseholds,
  mlHealth,
  retrainModel,
  getAssistancePrograms,
};