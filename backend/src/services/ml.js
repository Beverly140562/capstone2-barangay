
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

function isYes(value) {
  return ['yes', 'true', '1', 'present'].includes(
    String(value ?? '').trim().toLowerCase()
  );
}

function isExplicitlyUnemployed(occupation) {
  const value = String(occupation ?? '')
    .trim()
    .toLowerCase();

  return [
    'unemployed',
    'not employed',
    'none',
    'no occupation',
  ].includes(value);
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

function calculateHouseholdIncome(household, members) {
  const incomes = [
    household.monthly_income,
    ...members.map((member) => member.monthly_income),
  ].map(toNumberOrNull);

  // Do not assume missing individual incomes are zero.
  if (incomes.some((income) => income === null)) {
    return null;
  }

  return incomes.reduce((total, income) => total + income, 0);
}

async function predictHousehold(household) {
  if (!household?.household_id) {
    throw new Error(
      'A valid household_id is required for ML prediction.'
    );
  }

  console.log(
    '[ML] Starting prediction:',
    household.household_id
  );

  console.log('[ML] Service URL:', ML_SERVICE_URL);

  // Fetch all additional household members.
  const memberRows = await query(
    `
      SELECT *
      FROM household_members
      WHERE household_id = $1
      ORDER BY full_name ASC
    `,
    [household.household_id]
  );

  const members = Array.isArray(memberRows)
    ? memberRows
    : [];

  // Household head + additional members.
  const totalFamilySize = members.length + 1;

  // Calculate actual combined monthly household income.
  const householdMonthlyIncome = calculateHouseholdIncome(
    household,
    members
  );

  // Disability indicator across the household.
  const hasDisability = [
    household.disability_present,
    ...members.map((member) => member.disability_present),
  ].some(isYes);

  // Check whether the household has an illness indicator.
  const hasIllness = isYes(household.leading_illnesses);

  const allMembersExplicitlyUnemployed = [
  household.occupation,
  ...members.map((member) => member.occupation),
].every(isExplicitlyUnemployed);

  // Retrieve active assistance programs dynamically.
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
    // Preserve individual household-head income.
    monthly_income: toNumberOrNull(
      household.monthly_income
    ),

    // Exact income feature expected by the Random Forest.
    household_monthly_income: householdMonthlyIncome,

    // Income proof images used to control assistance suggestions.
income_proof_images: household.income_proof_images ?? [],
    // Household size.
    member_count: totalFamilySize,
    family_size: totalFamilySize,
    family_number: toNumberOrNull(
      household.family_number
    ),

    age: toNumberOrNull(household.age),
    length_residency: toNumberOrNull(
      household.length_residency
    ),

    sex: household.sex ?? null,
    civil_status: household.civil_status ?? null,

    highest_education:
      household.highest_education ?? null,

    head_education:
      household.highest_education ?? null,

    occupation: household.occupation ?? null,

    all_members_explicitly_unemployed:
      allMembersExplicitlyUnemployed,

    residence: household.residence ?? null,
    family_position: household.family_position ?? null,

    disability_present:
      household.disability_present ?? null,

    provisional_disability_indicator: hasDisability,

    illness_indicator: hasIllness,

    four_ps_member: household.four_ps_member ?? null,

    leading_illnesses:
      household.leading_illnesses ?? null,
  };

  console.log('[ML] Household members:', members.length);
  console.log('[ML] Total family size:', totalFamilySize);

  console.log(
    '[ML] Combined household monthly income:',
    householdMonthlyIncome
  );

  console.log(
    '[ML] Disability indicator:',
    hasDisability
  );

  console.log(
    '[ML] Active assistance programs:',
    Array.isArray(programs) ? programs.length : 0
  );

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
    console.error(
      '[ML] Could not connect to ML service:',
      error
    );

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
    console.error(
      '[ML] Missing vulnerability in response:',
      result
    );

    throw new Error(
      'ML service response does not contain a vulnerability prediction.'
    );
  }

  console.log('[ML] Prediction successful:', {
    vulnerability: result.vulnerability,
    vulnerability_prob: result.vulnerability_prob,
    household_monthly_income: householdMonthlyIncome,
    suggested_programs: result.suggested_programs,
  });

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
