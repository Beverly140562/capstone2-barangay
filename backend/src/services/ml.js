
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
          program.program_name || program.name || ''
        ).trim();
      }

      return '';
    })
    .filter(Boolean);
}

async function predictHousehold(household) {
  if (!household?.household_id) {
    throw new Error(
      'A valid household_id is required for ML prediction.'
    );
  }

  console.log('[ML] Starting prediction:', household.household_id);
  console.log('[ML] Service URL:', ML_SERVICE_URL);

  // Fetch additional household members.
  const memberRows = await query(
    `
      SELECT *
      FROM household_members
      WHERE household_id = $1
      ORDER BY full_name ASC
    `,
    [household.household_id]
  );

  const members = Array.isArray(memberRows) ? memberRows : [];
  const totalFamilySize = members.length + 1;

  // Fetch active assistance programs.
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

  const modelHousehold = {
    // This is the head's individual income, not total household income.
    monthly_income: toNumberOrNull(household.monthly_income),

    family_number: toNumberOrNull(household.family_number),
    age: toNumberOrNull(household.age),
    length_residency: toNumberOrNull(household.length_residency),

    sex: household.sex ?? null,
    civil_status: household.civil_status ?? null,
    highest_education: household.highest_education ?? null,
    head_education: household.highest_education ?? null,
    occupation: household.occupation ?? null,
    residence: household.residence ?? null,
    family_position: household.family_position ?? null,

    disability_present: household.disability_present ?? null,
    four_ps_member: household.four_ps_member ?? null,
    leading_illnesses: household.leading_illnesses ?? null,

    member_count: totalFamilySize,
    family_size: totalFamilySize,
  };

  console.log('[ML] Household members:', members.length);
  console.log('[ML] Total family size:', totalFamilySize);
  console.log('[ML] Active programs:', Array.isArray(programs) ? programs.length : 0);

  let response;

  try {
    response = await fetch(`${ML_SERVICE_URL}/predict`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        household: modelHousehold,
        members,
        programs: Array.isArray(programs) ? programs : [],
      }),
    });
  } catch (error) {
    console.error('[ML] Could not connect to ML service:', error);

    throw new Error(
      `Could not connect to ML service at ${ML_SERVICE_URL}: ${error.message}`
    );
  }

  const responseText = await response.text();

  let result;

  try {
    result = responseText ? JSON.parse(responseText) : {};
  } catch {
    console.error('[ML] Invalid response:', responseText);

    throw new Error(
      `ML service returned an invalid response: ${responseText}`
    );
  }

  if (!response.ok) {
    console.error('[ML] Service returned an error:', {
      status: response.status,
      result,
    });

    throw new Error(
      result.detail ||
      result.error ||
      `ML service request failed with status ${response.status}`
    );
  }

  if (!result.vulnerability) {
    console.error('[ML] Missing vulnerability in response:', result);

    throw new Error(
      'ML service response does not contain a vulnerability prediction.'
    );
  }

  console.log('[ML] Prediction successful:', result.vulnerability);

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
