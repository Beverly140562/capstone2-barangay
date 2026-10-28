-- =====================================================================
-- Seed data — run after 0001_schema.sql
-- User accounts are seeded by the backend bootstrap (bcrypt hashes).
-- =====================================================================

insert into assistance_programs (user_id, program_name, description, eligibility_rules)
select user_id,
       'AICS - Cash Assistance',
       'Assistance to Individuals in Crisis Situation: one-time financial aid.',
       'Highly or Moderately Vulnerable; monthly income below poverty threshold'
  from users where roles = 'admin'
union all
select user_id,
       '4Ps - Pantawid Pamilya',
       'Conditional cash transfer for education and health of children.',
       'Households with children 0-18; income below poverty threshold'
  from users where roles = 'admin'
union all
select user_id,
       'Rice Subsidy Program',
       'Monthly rice ration for low-income households.',
       'Monthly income below 8,000 PHP'
  from users where roles = 'admin'
union all
select user_id,
       'Medical Assistance Program',
       'Financial support for hospitalization and medicine.',
       'Households with disabled member or senior citizen'
  from users where roles = 'admin';

