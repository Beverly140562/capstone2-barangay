
const { query } = require('../db');

const ML_SERVICE_URL = (
  process.env.ML_SERVICE_URL || 'http://127.0.0.1:5001'
).replace(/\/+$/, '');

function toNumberOrNull(value) {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function normalizeText(value) {
  if (value === null || value === undefined) {
    return '';
  }

  return String(value).trim().toLowerCase();
}

/*
|--------------------------------------------------------------------------
| Check whether all members are explicitly unemployed
|--------------------------------------------------------------------------
| true  = Every member has occupation "none".
| false = At least one member has another recorded occupation.
| null  = Occupation information is incomplete.
|
| Keep these values consistent with the labels used to train your model.
|--------------------------------------------------------------------------
*/
function getAllMembersExplicitlyUnemployed(members) {
  if (!Array.isArray(members) || members.length === 0) {
    return null;
  }

  const occupations = members.map((member) =>
    normalizeText(member.occupation)
  );

  if (
    occupations.some(
      (occupation) => occupation !== '' && occupation !== 'none'
    )
  ) {
    return false;
  }

  if (occupations.every((occupation) => occupation === 'none')) {
    return true;
  }

  return null;
}

/*
|--------------------------------------------------------------------------
| Determine disability indicator
|--------------------------------------------------------------------------
*/
function getDisabilityIndicator(members) {
  if (!Array.isArray(members) || members.length === 0) {
    return null;
  }

  const statuses = members.map((member) =>
    normalizeText(member.disability_present)
  );

  if (statuses.some((status) => ['yes', 'true', '1'].includes(status))) {
    return true;
  }

  if (statuses.every((status) => ['no', 'false', '0'].includes(status))) {
    return false;
  }

  return null;
}

/*
|--------------------------------------------------------------------------
| Normalize suggested programs
|--------------------------------------------------------------------------
| PostgreSQL suggested_programs is a text[] column.
| Store program names, not JSON objects.
|--------------------------------------------------------------------------
*/
function normalizeSuggestedPrograms(programs) {
  if (!Array.isArray(programs)) {
    return [];
  }

  return programs
    .map((program) => {
      if (typeof program === 'string') {
        return program.trim();
      }

      if (program && typeof program === 'object') {
        return String(
          program.program_name ||
          program.name ||
          ''
        ).trim();
      }

      return '';
    })
    .filter(Boolean);
}

/*
|--------------------------------------------------------------------------
| Predict household vulnerability and suggested programs
|--------------------------------------------------------------------------
*/
async function predictHousehold(household) {
  if (!household?.household_id) {
    throw new Error(
      'A valid household_id is required for ML prediction.'
    );
  }

  // 1. Retrieve actual household members.
  const members = await query(
    `
      SELECT
        member_id,
        occupation,
        disability_present
      FROM household_members
      WHERE household_id = $1
    `,
    [household.household_id]
  );

  const memberRows = Array.isArray(members) ? members : [];

  if (memberRows.length === 0) {
    throw new Error(
      `Cannot predict household ${household.household_id}: ` +
      'no household member records are available.'
    );
  }

  // 2. Retrieve active assistance programs.
  const programs = await query(
    `
      SELECT
        program_id,
        program_name,
        description,
        eligibility_rules
      FROM assistance_programs
      WHERE is_active = TRUE
      ORDER BY program_name
    `
  );

  // 3. Prepare the model features.
  const modelHousehold = {
    member_count: memberRows.length,

    head_education:
      household.highest_education ?? null,

    monthly_income: toNumberOrNull(
      household.monthly_income
    ),

    family_size: toNumberOrNull(
      household.family_number
    ),

    all_members_explicitly_unemployed:
      getAllMembersExplicitlyUnemployed(memberRows),

    provisional_disability_indicator:
      getDisabilityIndicator(memberRows),

    // No confirmed illness data source is available yet.
    illness_indicator: null,

    senior_citizen_present:
  household.age != null
    ? Number(household.age) >= 60
    : null,
  };

  // 4. Validate required features.
  const requiredFields = [
    'head_education',
    'monthly_income',
    'family_size',
  ];

  const missingFields = requiredFields.filter((field) => {
    const value = modelHousehold[field];

    return (
      value === null ||
      value === undefined ||
      (typeof value === 'string' && value.trim() === '')
    );
  });

  if (missingFields.length > 0) {
    throw new Error(
      `Cannot predict household ${household.household_id}. ` +
      `Missing required ML features: ${missingFields.join(', ')}`
    );
  }

  if (
    !Number.isInteger(modelHousehold.member_count) ||
    modelHousehold.member_count <= 0
  ) {
    throw new Error('A valid household member count is required.');
  }

  if (
    !Number.isInteger(modelHousehold.family_size) ||
    modelHousehold.family_size <= 0
  ) {
    throw new Error('A valid household family size is required.');
  }

  // 5. Send prediction request to FastAPI.
  const response = await fetch(`${ML_SERVICE_URL}/predict`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      household: modelHousehold,
      programs: Array.isArray(programs) ? programs : [],
    }),
  });

  // 6. Parse the ML service response.
  const responseText = await response.text();

  let result;

  try {
    result = responseText ? JSON.parse(responseText) : {};
  } catch {
    throw new Error(
      `ML service returned an invalid response: ${responseText}`
    );
  }

  if (!response.ok) {
    throw new Error(
      result.detail ||
      result.error ||
      `ML service request failed with status ${response.status}`
    );
  }

  if (!result.vulnerability) {
    throw new Error(
      'ML service response does not contain a vulnerability prediction.'
    );
  }

  // 7. Normalize suggested programs for PostgreSQL text[].
  return {
    ...result,
    suggested_programs: normalizeSuggestedPrograms(
      result.suggested_programs
    ),
  };
}

module.exports = {
  predictHousehold,
};
