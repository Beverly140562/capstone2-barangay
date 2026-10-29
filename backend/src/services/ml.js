const { query } = require('../db');

const ML_SERVICE_URL = (
  process.env.ML_SERVICE_URL ||
  'http://127.0.0.1:5001'
).replace(/\/+$/, '');

async function predictHousehold(household) {
  if (!household) {
    throw new Error('Household data is required for prediction.');
  }

  // Load the actual program rules from the database.
  const programs = await query(`
    SELECT
      program_id,
      program_name,
      description,
      eligibility_rules
    FROM assistance_programs
    WHERE is_active = TRUE
    ORDER BY program_name
  `);

  console.log('[ML] Household received:', Boolean(household.household_id));
  console.log('[ML] Active programs loaded:', programs.length);
  console.log(
    '[ML] Programs with rules:',
    programs.filter((p) => String(p.eligibility_rules || '').trim()).length
  );

  // Send only the household fields needed by the current ML service.
  const modelHousehold = {
    monthly_income: Number(household.monthly_income ?? 0),
    family_number: Number(household.family_number ?? 1),
    age: Number(household.age ?? 0),
    length_residency: Number(household.length_residency ?? 0),

    sex: household.sex ?? 'male',
    civil_status: household.civil_status ?? 'Single',
    highest_education: household.highest_education ?? 'None',
    occupation: household.occupation ?? 'None',
    residence: household.residence ?? 'Owned',

    disability_present: household.disability_present ?? null,
    four_ps_member: household.four_ps_member ?? null,
    leading_illnesses: household.leading_illnesses ?? null,

    // Explicit model fields are passed when available.
    member_count: household.member_count ?? null,
    family_size: household.family_size ?? household.family_number ?? null,
    head_education: household.head_education ?? household.highest_education ?? null,
    all_members_explicitly_unemployed:
      household.all_members_explicitly_unemployed ?? null,
    provisional_disability_indicator:
      household.provisional_disability_indicator ?? null,
    illness_indicator: household.illness_indicator ?? null,
  };

  const response = await fetch(`${ML_SERVICE_URL}/predict`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      household: modelHousehold,
      programs: programs.map((p) => ({
        program_id: String(p.program_id),
        program_name: p.program_name,
        description: p.description ?? null,
        eligibility_rules: p.eligibility_rules ?? null,
      })),
    }),
  });

  const responseText = await response.text();

  if (!response.ok) {
    throw new Error(
      `ML service returned HTTP ${response.status}: ${responseText}`
    );
  }

  let prediction;

  try {
    prediction = JSON.parse(responseText);
  } catch {
    throw new Error('ML service returned invalid JSON.');
  }

  if (!prediction || !prediction.vulnerability) {
    throw new Error('ML response is missing the vulnerability prediction.');
  }

  // Do not silently replace ML failures with an empty suggestions list.
  const suggestedPrograms = prediction.suggested_programs;

  if (!Array.isArray(suggestedPrograms)) {
    throw new Error(
      'ML response suggested_programs must be an array.'
    );
  }

  console.log('[ML] Predicted vulnerability:', prediction.vulnerability);
  console.log('[ML] Suggested programs:', suggestedPrograms);

  return {
    ...prediction,
    suggested_programs: suggestedPrograms,
  };
}

module.exports = { predictHousehold };