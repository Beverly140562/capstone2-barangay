-- =====================================================================
-- Barangay Luinab â€” Canonical PostgreSQL schema
-- Used by Supabase (production) and PGlite (local dev) verbatim.
-- gen_random_uuid() is core Postgres 13+ (no extension required).
-- =====================================================================

-- Table 2: users
create table if not exists users (
  user_id        uuid        primary key default gen_random_uuid(),
  email          varchar(254) unique,
  full_name      varchar(150) not null,
  password       varchar(255) not null,
  roles          varchar(20)  not null check (roles in ('admin','captain','staff')),
  username       varchar(150) not null unique,
  account_status boolean      not null default true,
  date_created   timestamptz  not null default now()
);

-- Table 3: households

CREATE TABLE IF NOT EXISTS households (
    household_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(user_id),

    -- Household head name
    household_head_name VARCHAR(150) NOT NULL,
    surname VARCHAR(100),
    given_name VARCHAR(100),
    middle_name VARCHAR(100),

    -- Household information
    family_position VARCHAR(50),
    family_number INT NOT NULL DEFAULT 1 CHECK (family_number >= 1),
    address TEXT NOT NULL,
    purok VARCHAR(50),
    residence VARCHAR(30)
        CHECK (residence IN ('Owned', 'Rent', 'Living with relatives')),
    length_residency INT CHECK (length_residency >= 0),
    household_status VARCHAR(20) NOT NULL DEFAULT 'Active',

    -- Personal information of the household head
    sex VARCHAR(10) CHECK (sex IN ('male', 'female')),
    age INT CHECK (age BETWEEN 0 AND 120),
    birthday DATE,
    birth_place VARCHAR(150),
    civil_status VARCHAR(50),
    blood_type VARCHAR(5),
    highest_education VARCHAR(150),
    contact_number VARCHAR(20),
    religion VARCHAR(100),
    ethnicity VARCHAR(100),

    -- Employment and financial information
    occupation VARCHAR(150),
    occupation_details VARCHAR(200),
    business VARCHAR(200),
    monthly_income DECIMAL(12,2)
        CHECK (monthly_income IS NULL OR monthly_income >= 0),

    -- Disability and health information
disability_present BOOLEAN DEFAULT FALSE,
    disability_details TEXT,
    leading_illnesses TEXT,

    -- Household utilities and facilities
    with_electricity VARCHAR(10)
        CHECK (with_electricity IN ('Yes', 'No')),
    sanitary_toilet VARCHAR(10)
        CHECK (sanitary_toilet IN ('Yes', 'No')),
    potable_water_supply VARCHAR(10)
        CHECK (potable_water_supply IN ('Yes', 'No')),

    -- Household housing and assistance indicators
    four_ps_member VARCHAR(10)
        CHECK (four_ps_member IN ('Yes', 'No')),
    house_owner VARCHAR(10)
        CHECK (house_owner IN ('Yes', 'No')),
    renter VARCHAR(10)
        CHECK (renter IN ('Yes', 'No')),
    sharer VARCHAR(10)
        CHECK (sharer IN ('Yes', 'No')),
    caretaker VARCHAR(10)
        CHECK (caretaker IN ('Yes', 'No')),
    consent VARCHAR(10)
        CHECK (consent IN ('Yes', 'No')),

    -- Existing ML classification results
    vulnerability VARCHAR(30),
    vulnerability_prob NUMERIC(5,4),
    suggested_programs TEXT[],

    -- Validation workflow
    validation_status VARCHAR(20) NOT NULL DEFAULT 'Validated'
        CHECK (
            validation_status IN (
             'Validated', 'Approved', 'Rejected'
            )
        ),

    -- Migration information
    migration_type VARCHAR(50),
    migration_destination TEXT,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


-- Table 4: household_members
create table if not exists household_members (
  member_id            uuid         primary key default gen_random_uuid(),
  household_id         uuid         not null references households(household_id) on delete cascade,
  relationship_hh      varchar(50),
  full_name            varchar(150) not null,
  birthday             date,
  age                  int,
  sex                  varchar(10)  check (sex in ('male','female')),
  civil_status         varchar(50),
  education_attainment varchar(100),
  occupation           varchar(100),
  occupation_details   varchar(200),
  disability_present   varchar(150),
  monthly_income       NUMERIC(12, 2)
);

-- Table 5: assistance_programs

create table if not exists assistance_programs (
  program_id        uuid         primary key default gen_random_uuid(),
  user_id           uuid         not null references users(user_id),
  program_name      varchar(150) not null,
  description       text,
  eligibility_rules text,
  created_at        timestamptz  not null default now(),
  is_active         BOOLEAN NOT NULL DEFAULT TRUE
); 


-- Table 6: beneficiary_validation
CREATE TABLE IF NOT EXISTS beneficiary_validation (
  validation_id     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id      UUID NOT NULL REFERENCES households(household_id) ON DELETE CASCADE,
  program_id        UUID NOT NULL REFERENCES assistance_programs(program_id) ON DELETE CASCADE,
 
  validation_status VARCHAR(20) NOT NULL DEFAULT 'Pending'
                    CHECK (validation_status IN ('Pending', 'Approved', 'Rejected')),
 
  submitted_by      UUID REFERENCES users(user_id),
  submitted_at      TIMESTAMP NOT NULL DEFAULT NOW(),
 
  approved_by       UUID REFERENCES users(user_id),
  approved_at       TIMESTAMP,
  remarks           TEXT,
 
  UNIQUE (household_id, program_id)
);



-- Table 7: ml_assistance_distribution
create table if not exists ml_assistance_distribution (
  distribution_id uuid   primary key default gen_random_uuid(),
  household_id    uuid   not null references households(household_id) on delete cascade,
  program_id      uuid   not null references assistance_programs(program_id) on delete cascade,
  release_status  varchar(50) not null default 'Released',
  approved_by     uuid   references users(user_id),
  approved_at     timestamptz,
  amount_released numeric(12,2),
  release_date   DATE,
  status          VARCHAR(30) DEFAULT 'Pending',
  created_at      date   not null default current_date
);

-- Table 8: reports
create table if not exists reports (
  report_id   uuid         primary key default gen_random_uuid(),
  user_id     uuid         references users(user_id),
  report_type varchar(100) not null,
  report_date timestamptz  not null default now(),
  format      VARCHAR(20)  DEFAULT 'PDF',
  filters     JSONB        DEFAULT '{}'::jsonb,
  report_data JSONB        DEFAULT '[]'::jsonb
);

-- Table 9: activity_logs
create table if not exists activity_logs (
  log_id              uuid        primary key default gen_random_uuid(),
  user_id             uuid        references users(user_id),
  action              varchar(100) not null,
  activity_description text,
  timestamp           timestamptz not null default now()
);

create table if not exists calamity_programs (
    calamity_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    household_id UUID NOT NULL
        REFERENCES households(household_id)
        ON DELETE CASCADE,

    program_id UUID NOT NULL
        REFERENCES assistance_programs(program_id),

    house_type VARCHAR(100),

    roof_damage VARCHAR(50),
    wall_damage VARCHAR(50),
    flooding_level VARCHAR(50),

    damage_risk NUMERIC(5,2) DEFAULT 0,
    risk_level VARCHAR(50),

    status VARCHAR(30) DEFAULT 'Pending',

    approved_by UUID NULL
        REFERENCES users(user_id),

    approved_at TIMESTAMP NULL,

    rejection_reason TEXT NULL,

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS notifications (
    notification_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    message TEXT NOT NULL,
    notification_type VARCHAR(50) NOT NULL,
    reference_id UUID NULL,
    is_read BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


create index if not exists idx_households_validation on households(validation_status);
create index if not exists idx_households_vulnerability on households(vulnerability);
create index if not exists idx_members_household on household_members(household_id);
create index if not exists idx_distribution_program on ml_assistance_distribution(program_id);
create index if not exists idx_calamity_programs_household on calamity_programs(household_id);
CREATE INDEX IF NOT EXISTS idx_beneficiary_validation_status ON beneficiary_validation (validation_status);
CREATE INDEX IF NOT EXISTS idx_beneficiary_validation_program ON beneficiary_validation (program_id);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, is_read, created_at DESC);