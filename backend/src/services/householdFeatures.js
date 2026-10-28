
const { query } = require('../db');

const UNEMPLOYED_VALUES = new Set([
  'unemployed',
  'currently unemployed',
]);

const UNKNOWN_OCCUPATION_VALUES = new Set([
  '',
  'none',
  'not specified',
  'unknown',
  'n/a',
  'na',
]);

const EXPLICIT_NO_ILLNESS_VALUES = new Set([
  'none',
  'no',
  'no illness',
  'no known illness',
  'none reported',
]);

function toNumberOrNull(value) {
  if (
    value === null ||
    value === undefined ||
    String(value).trim() === ''
  ) {
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
 * Calculate total household income only when:
 * - the head's income is recorded;
 * - all other members' incomes are recorded; and
 * - the number of recorded people matches family_number.
 *
 * household_members contains only people other than the head.
 */
function calculateHouseholdIncome(
  headIncome,
  memberIncomes,
  expectedFamilySize,
  recordedFamilySize
) {
  if (
    expectedFamilySize === null ||
    recordedFamilySize !== expectedFamilySize ||
    headIncome === null ||
    memberIncomes.some((income) => income === null)
  ) {
    return null;
  }

  return [
    headIncome,
    ...memberIncomes,
  ].reduce((total, income) => total + income, 0);
}

/**
 * true: every person is explicitly recorded as unemployed.
 * false: at least one person has an explicitly recorded occupation.
 * null: the available records are insufficient or ambiguous.
 */
function calculateAllMembersUnemployed(occupations) {
  const normalized = occupations.map(normalizeText);

  if (normalized.length === 0) {
    return null;
  }

  if (
    normalized.some((occupation) =>
      UNEMPLOYED_VALUES.has(occupation)
    )
  ) {
    // An explicit occupation other than unemployment means
    // the entire household is not explicitly unemployed.
    // Unknown occupation values do not count as evidence.
    const hasExplicitEmployment = normalized.some(
      (occupation) =>
        occupation !== '' &&
        !UNKNOWN_OCCUPATION_VALUES.has(occupation) &&
        !UNEMPLOYED_VALUES.has(occupation)
    );

    if (hasExplicitEmployment) {
      return false;
    }
  }

  if (
    normalized.every((occupation) =>
      UNEMPLOYED_VALUES.has(occupation)
    )
  ) {
    return true;
  }

  const hasExplicitEmployment = normalized.some(
    (occupation) =>
      occupation !== '' &&
      !UNKNOWN_OCCUPATION_VALUES.has(occupation) &&
      !UNEMPLOYED_VALUES.has(occupation)
  );

  if (hasExplicitEmployment) {
    return false;
  }

  return null;
}

/**
 * illness_indicator:
 * true  = a recorded illness is present
 * false = an explicit no-illness value is recorded
 * null  = missing or ambiguous information
 */
function calculateIllnessIndicator(value) {
  const illness = normalizeText(value);

  if (!illness) {
    return null;
  }

  if (EXPLICIT_NO_ILLNESS_VALUES.has(illness)) {
    return false;
  }

  return true;
}

async function buildHouseholdFeatures(householdId) {
  const householdRows = await query(
    `
      SELECT
        household_id,
        family_number,
        monthly_income,
        highest_education,
        occupation,
        leading_illnesses
      FROM households
      WHERE household_id = $1
      LIMIT 1
    `,
    [householdId]
  );

  const household = householdRows?.[0];

  if (!household) {
    throw new Error(
      `Household not found: ${householdId}`
    );
  }

  const memberRows = await query(
    `
      SELECT
        member_id,
        monthly_income,
        occupation
      FROM household_members
      WHERE household_id = $1
    `,
    [householdId]
  );

  const familySize = toNumberOrNull(
    household.family_number
  );

  const headIncome = toNumberOrNull(
    household.monthly_income
  );

  const memberIncomes = memberRows.map((member) =>
    toNumberOrNull(member.monthly_income)
  );

  const recordedFamilySize = memberRows.length + 1;

  const householdMonthlyIncome = calculateHouseholdIncome(
    headIncome,
    memberIncomes,
    familySize,
    recordedFamilySize
  );

  const occupations = [
    household.occupation,
    ...memberRows.map((member) => member.occupation),
  ];

  return {
    household_monthly_income: householdMonthlyIncome,

    family_size: familySize,

    all_members_explicitly_unemployed:
      calculateAllMembersUnemployed(occupations),

    head_education:
      household.highest_education?.trim() || null,

    illness_indicator:
      calculateIllnessIndicator(household.leading_illnesses),
  };
}

module.exports = {
  buildHouseholdFeatures,
  calculateHouseholdIncome,
  calculateAllMembersUnemployed,
  calculateIllnessIndicator,
};
