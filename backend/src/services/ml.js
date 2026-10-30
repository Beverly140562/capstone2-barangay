
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

/**
 * Returns:
 * true  - Every member explicitly has occupation "none".
 * false - At least one member has another recorded occupation.
 * null  - No members or insufficient occupation information.
 */
function getAllMembersExplicitlyUnemployed(members) {
  if (!Array.isArray(members) || members.length === 0) {
    return null;
  }

  const occupations = members.map((member) =>
    normalizeText(member.occupation)
  );

  // At least one explicitly recorded occupation other than "none".
  if (
    occupations.some(
      (occupation) => occupation !== '' && occupation !== 'none'
    )
  ) {
    return false;
  }

  // Every member must explicitly have occupation "none".
  if (occupations.every((occupation) => occupation === 'none')) {
    return true;
  }

  // At least one occupation is missing.
  return null;
}

/**
 * Returns:
 * true  - At least one member is explicitly marked Yes.
 * false - Every member is explicitly marked No.
 * null  - No members or disability status is incomplete/unknown.
 */
function getDisabilityIndicator(members) {
  if (!Array.isArray(members) || members.length === 0) {
    return null;
  }

  const statuses = members.map((member) =>
    normalizeText(member.disability_present)
  );

  if (statuses.includes('yes')) {
    return true;
  }

  if (statuses.every((status) => status === 'no')) {
    return false;
  }

  return null;
}

async function predictHousehold(household) {
  if (!household?.household_id) {
    throw new Error(
      'A valid household_id is required for ML prediction.'
    );
  }

  // 1. Retrieve actual household members.
  const members = await query(
    `SELECT
       member_id,
       occupation,
       disability_present
     FROM household_members
     WHERE household_id = $1`,
    [household.household_id]
  );

  const memberRows = Array.isArray(members) ? members : [];

  // 2. Do not predict when no actual member records exist.
  if (memberRows.length === 0) {
    throw new Error(
      `Cannot predict household ${household.household_id}: ` +
      'no household member records are available.'
    );
  }

  // 3. Retrieve active assistance programs.
  const programs = await query(
    `SELECT
       program_id,
       program_name,
       description,
       eligibility_rules
     FROM assistance_programs
     WHERE is_active = TRUE
     ORDER BY program_name`
  );

  // 4. Prepare the seven model features.
  //
  // Database source:
  // households.monthly_income = household-level income.
  //
  // Do not use the sum of household member incomes.
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

    // No confirmed illness source is currently available.
    illness_indicator: null,
  };

  // 5. Validate required household-level features.
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
    throw new Error(
      'A valid actual household member count is required.'
    );
  }

  if (
    !Number.isInteger(modelHousehold.family_size) ||
    modelHousehold.family_size <= 0
  ) {
    throw new Error(
      'A valid household family size is required.'
    );
  }

  // 6. Send prediction request to FastAPI.
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

  // 7. Parse service response.
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

  return result;
}

module.exports = {
  predictHousehold,
};
