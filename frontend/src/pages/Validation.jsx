import React, { useEffect, useMemo, useState } from 'react';
import {
  CalendarCheck,
  ChevronDown,
  ClipboardList,
  Percent,
  Search,
  ShieldAlert,
} from 'lucide-react';

import { api } from '../lib/api';
import { Spinner } from '../components/ui';

/* =========================================================
   PRESENTATION
========================================================= */

const selectClass =
  'appearance-none cursor-pointer rounded-xl border border-gray-300 bg-white py-2.5 pl-4 pr-10 ' +
  'text-xl font-medium text-gray-800 focus:border-[#6E2430] focus:outline-none ' +
  'focus:ring-4 focus:ring-[#6E2430]/15';

function Dropdown({ label, options, value, onChange }) {
  return (
    <div className="relative">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-label={label}
        className={selectClass}
      >
        <option value="All">{label}</option>

        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>

      <ChevronDown
        size={30}
        className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-gray-400"
      />
    </div>
  );
}

function StatCard({ label, value, note, noteTone = 'text-gray-500', Icon }) {
  return (
    <div className="flex items-center gap-4 rounded-2xl border border-[#EBD3D3] bg-white p-5 shadow-sm">
      <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-[#F8E9EB] text-[#6E2430]">
        <Icon className="h-7 w-7" aria-hidden="true" />
      </span>

      <div className="min-w-0">
        <p className="text-xl font-semibold text-gray-500">{label}</p>
        <p className="text-4xl font-extrabold leading-tight text-[#6E2430]">
          {value}
        </p>
        <p className={`truncate text-lg font-medium ${noteTone}`}>{note}</p>
      </div>
    </div>
  );
}

const PRIORITY_STYLES = {
  High: { pill: 'bg-red-50 text-red-700 ring-red-200', dot: 'bg-red-500' },
  Medium: { pill: 'bg-amber-50 text-amber-700 ring-amber-200', dot: 'bg-amber-500' },
  Low: { pill: 'bg-green-50 text-green-700 ring-green-200', dot: 'bg-green-500' },
};

function PriorityPill({ priority }) {
  const s = PRIORITY_STYLES[priority] || PRIORITY_STYLES.Low;

  return (
    <span
      className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xl font-semibold ring-1 ${s.pill}`}
    >
      <span className={`h-2 w-2 rounded-full ${s.dot}`} />
      {priority}
    </span>
  );
}

const STATUS_STYLES = {
  Active: 'bg-green-50 text-green-700 ring-green-200',
  Rejected: 'bg-red-50 text-red-700 ring-red-200',
  'For Approval': 'bg-amber-50 text-amber-700 ring-amber-200',
  'Not Submitted': 'bg-gray-100 text-gray-600 ring-gray-200',
};

function StatusPill({ status }) {
  return (
    <span
      className={`inline-flex whitespace-nowrap rounded-full px-3 py-1 text-lg font-semibold ring-1 ${
        STATUS_STYLES[status] || STATUS_STYLES['Not Submitted']
      }`}
    >
      {status}
    </span>
  );
}

function ProgramChips({ programs, max = 2 }) {
  if (!programs.length) return <span className="text-gray-400">—</span>;

  const shown = programs.slice(0, max);
  const extra = programs.length - shown.length;

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {shown.map((program) => (
        <span
          key={program}
          className="rounded-full bg-[#F8E9EB] px-3 py-1 text-lg font-medium text-[#6E2430]"
        >
          {program}
        </span>
      ))}

      {extra > 0 && (
        <span
          className="rounded-full bg-gray-100 px-2.5 py-1 text-lg font-semibold text-gray-600"
          title={programs.slice(max).join(', ')}
        >
          +{extra}
        </span>
      )}
    </div>
  );
}

const th = 'whitespace-nowrap px-4 py-3 text-left text-xl font-bold text-[#6E2430]';

/* =========================================================
   ARRAY / PROGRAM HELPERS
========================================================= */

function normalizePrograms(programs) {
  if (!programs) {
    return [];
  }

  // Handle arrays.
  if (Array.isArray(programs)) {
    return programs
      .map((item) => {
        if (!item) return '';

        // Handle JSON objects.
        if (typeof item === 'object') {
          return String(item.program_name || item.name || '').trim();
        }

        // Handle JSON strings.
        if (typeof item === 'string') {
          const value = item.trim();

          if (!value) return '';

          try {
            const parsed = JSON.parse(value);

            if (parsed && typeof parsed === 'object') {
              return String(parsed.program_name || parsed.name || '').trim();
            }
          } catch {
            // Treat it as an ordinary program name.
          }

          return value;
        }

        return '';
      })
      .filter(Boolean);
  }

  // Handle a JSON array or ordinary string.
  if (typeof programs === 'string') {
    const value = programs.trim();

    if (!value) return [];

    try {
      const parsed = JSON.parse(value);

      if (Array.isArray(parsed)) {
        return normalizePrograms(parsed);
      }

      if (parsed && typeof parsed === 'object') {
        return normalizePrograms([parsed]);
      }
    } catch {
      // Continue with ordinary string handling.
    }

    return value
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);
  }

  // Handle a single program object.
  if (typeof programs === 'object') {
    const name = programs.program_name || programs.name;
    return name ? [String(name).trim()] : [];
  }

  return [];
}

function formatPrograms(programs) {
  const values = normalizePrograms(programs);

  return values.length > 0 ? values.join(', ') : '—';
}

/* =========================================================
   PRIORITY
========================================================= */

function getPriority(vulnerability) {
  const value = String(vulnerability || '').trim().toLowerCase();

  if (value.includes('high')) return 'High';
  if (value.includes('moderate') || value.includes('medium')) return 'Medium';
  if (value.includes('low') || value.includes('not vulnerable')) return 'Low';

  return 'Low';
}

/* =========================================================
   STATUS
========================================================= */

function normalizeStatus(value) {
  return String(value || '').trim().toLowerCase();
}

function getDisplayStatus(household, validationRecords = []) {
  const householdId = household?.household_id || household?.id;

  const records = validationRecords.filter(
    (record) => String(record?.household_id || '') === String(householdId || '')
  );

  const hasPending = records.some(
    (record) => normalizeStatus(record?.validation_status) === 'pending'
  );

  const hasApproved = records.some(
    (record) => normalizeStatus(record?.validation_status) === 'approved'
  );

  const hasRejected = records.some(
    (record) => normalizeStatus(record?.validation_status) === 'rejected'
  );

  if (hasPending) return 'For Approval';
  if (hasApproved) return 'Active';
  if (hasRejected) return 'Rejected';

  return 'Not Submitted';
}

/* =========================================================
   DATE
========================================================= */

function formatDate(value) {
  if (!value) {
    return '—';
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return '—';
  }

  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

/* =========================================================
   CONDITION
========================================================= */

function getCondition(household) {
  const parts = [];

  // Use monthly_income / income only.
  const income = Number(household?.monthly_income ?? household?.income ?? 0);

  const familyNumber = Number(household?.family_number);

  const disability = household?.disability_present;

  // Income
  if (Number.isFinite(income) && income > 0) {
    parts.push(`₱${income.toLocaleString()} income`);
  } else {
    parts.push('No stable income source');
  }

  // Family size
  if (Number.isFinite(familyNumber) && familyNumber > 0) {
    parts.push(`${familyNumber} family members`);
  }

  // Disability
  const disabilityValue = String(disability || '').trim().toLowerCase();

  if (disability === true || disabilityValue === 'true' || disabilityValue === 'yes') {
    parts.push('Person with disability');
  }

  // Senior household head
  const age = Number(household?.age);

  if (Number.isFinite(age) && age >= 60) {
    parts.push('Senior-headed household');
  }

  return parts.join(', ');
}

/* =========================================================
   APPROVAL DATE
========================================================= */

function getApprovalDate(household, validationRecords = []) {
  const householdId = household?.household_id || household?.id;

  const approvedRecords = validationRecords
    .filter(
      (record) =>
        String(record?.household_id || '') === String(householdId || '') &&
        normalizeStatus(record?.validation_status) === 'approved' &&
        record?.approved_at
    )
    .sort((a, b) => new Date(b.approved_at) - new Date(a.approved_at));

  return (
    approvedRecords[0]?.approved_at ||
    household?.approval_date ||
    household?.approved_at ||
    null
  );
}

/* =========================================================
   RESPONSE HELPERS
========================================================= */

function extractArray(response, keys = []) {
  if (Array.isArray(response)) {
    return response;
  }

  for (const key of keys) {
    if (Array.isArray(response?.[key])) {
      return response[key];
    }

    if (Array.isArray(response?.data?.[key])) {
      return response.data[key];
    }
  }

  if (Array.isArray(response?.data)) {
    return response.data;
  }

  if (Array.isArray(response?.rows)) {
    return response.rows;
  }

  return [];
}

/* =========================================================
   COMPONENT
========================================================= */

export default function Validation() {
  const [households, setHouseholds] = useState([]);
  const [validationRecords, setValidationRecords] = useState([]);
  const [search, setSearch] = useState('');
  const [priorityFilter, setPriorityFilter] = useState('All');
  const [programFilter, setProgramFilter] = useState('All');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  /* =======================================================
     LOAD DATA
  ======================================================= */

  useEffect(() => {
    let cancelled = false;

    async function loadData() {
      try {
        setLoading(true);
        setError('');

        const [householdResponse, validationResponse] = await Promise.all([
          api.get('/households'),
          api.get('/validation/beneficiary-validation/statuses'),
        ]);

        if (cancelled) return;

        setHouseholds(extractArray(householdResponse, ['households']));
        setValidationRecords(
          extractArray(validationResponse, ['statuses', 'validations'])
        );
      } catch (e) {
        if (cancelled) return;

        console.error('Failed to load validation data:', e);

        setHouseholds([]);
        setValidationRecords([]);

        setError(
          e?.response?.data?.error ||
            e?.response?.data?.message ||
            e?.message ||
            'Failed to load household validation data.'
        );
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    loadData();

    return () => {
      cancelled = true;
    };
  }, []);

  /* =======================================================
     PRIORITIES
  ======================================================= */

  const priorities = useMemo(() => {
    const values = households.map((household) =>
      getPriority(household?.vulnerability)
    );

    return Array.from(new Set(values));
  }, [households]);

  /* =======================================================
     PROGRAMS
  ======================================================= */

  const programs = useMemo(() => {
    const values = [];

    households.forEach((household) => {
      normalizePrograms(household?.suggested_programs).forEach((program) => {
        if (program) {
          values.push(program);
        }
      });
    });

    // Also include program names from beneficiary validation records.
    validationRecords.forEach((record) => {
      if (record?.program_name) {
        values.push(String(record.program_name).trim());
      }
    });

    return Array.from(new Set(values.filter(Boolean))).sort();
  }, [households, validationRecords]);

  /* =======================================================
     FILTERED DATA
  ======================================================= */

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();

    return households.filter((household) => {
      const name = String(household?.household_head_name || '').toLowerCase();
      const address = String(household?.address || '').toLowerCase();
      const purok = String(household?.purok || '').toLowerCase();

      const programText = formatPrograms(household?.suggested_programs).toLowerCase();

      const priority = getPriority(household?.vulnerability);

      const matchesSearch =
        !query ||
        name.includes(query) ||
        address.includes(query) ||
        purok.includes(query) ||
        programText.includes(query);

      const matchesPriority =
        priorityFilter === 'All' || priority === priorityFilter;

      const householdPrograms = normalizePrograms(household?.suggested_programs);

      const matchesProgram =
        programFilter === 'All' || householdPrograms.includes(programFilter);

      return matchesSearch && matchesPriority && matchesProgram;
    });
  }, [households, search, priorityFilter, programFilter]);

  /* =======================================================
     STATISTICS
  ======================================================= */

  const stats = useMemo(() => {
    // Pending beneficiary validation records.
    const pendingRecords = validationRecords.filter(
      (record) => normalizeStatus(record?.validation_status) === 'pending'
    );

    // Unique households waiting for Captain review.
    const awaitingReview = new Set(
      pendingRecords.map((record) => record?.household_id).filter(Boolean)
    ).size;

    // High priority households.
    const highPriority = households.filter(
      (household) => getPriority(household?.vulnerability) === 'High'
    ).length;

    // Approved / rejected beneficiary records.
    const approvedRecords = validationRecords.filter(
      (record) => normalizeStatus(record?.validation_status) === 'approved'
    );

    const rejectedRecords = validationRecords.filter(
      (record) => normalizeStatus(record?.validation_status) === 'rejected'
    );

    // Unique approved households.
    const approvedHouseholdIds = new Set(
      approvedRecords.map((record) => record?.household_id).filter(Boolean)
    );

    // Unique households with a final decision.
    const decidedHouseholdIds = new Set(
      [...approvedRecords, ...rejectedRecords]
        .map((record) => record?.household_id)
        .filter(Boolean)
    );

    // Approved households / all households with a decision.
    const approvalPercent =
      decidedHouseholdIds.size > 0
        ? Math.round((approvedHouseholdIds.size / decidedHouseholdIds.size) * 100)
        : 0;

    // Approvals made today.
    const today = new Date();

    const approvalToday = approvedRecords.filter((record) => {
      if (!record?.approved_at) return false;

      const date = new Date(record.approved_at);

      return (
        !Number.isNaN(date.getTime()) &&
        date.toDateString() === today.toDateString()
      );
    }).length;

    const latestApproval = [...approvedRecords]
      .filter((record) => record?.approved_at)
      .sort((a, b) => new Date(b.approved_at) - new Date(a.approved_at))[0];

    return {
      awaitingReview,
      highPriority,
      approvalToday,
      approvalPercent,
      approvedRecords,
      rejectedRecords,
      captain: latestApproval?.approved_by_name || 'Captain',
    };
  }, [households, validationRecords]);

  /* =======================================================
     LOADING
  ======================================================= */

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <Spinner />
      </div>
    );
  }

  /* =======================================================
     RENDER
  ======================================================= */

  const hasFilters = search || priorityFilter !== 'All' || programFilter !== 'All';

  return (
    <div className="space-y-6 py-6">
      {/* HEADER */}
      <div className="pt-4">
        <h1 className="text-xl font-bold tracking-tight text-ink md:text-4xl">
          Validated Household
        </h1>

      </div>

      {/* ERROR */}
      {error && (
        <div
          role="alert"
          className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-lg font-medium text-red-700"
        >
          {error}
        </div>
      )}

      {/* STAT CARDS */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Flagged households"
          value={stats.awaitingReview}
          note="Awaiting review"
          noteTone="text-amber-700"
          Icon={ClipboardList}
        />

        <StatCard
          label="High priority"
          value={stats.highPriority}
          note="Needs urgent review"
          noteTone="text-red-600"
          Icon={ShieldAlert}
        />

        <StatCard
          label="Approvals today"
          value={stats.approvalToday}
          note={`By ${stats.captain}`}
          Icon={CalendarCheck}
        />

        <StatCard
          label="Approval rate"
          value={`${stats.approvalPercent}%`}
          note={formatDate(new Date())}
          Icon={Percent}
        />
      </div>

      {/* TABLE CARD */}
      <section className="overflow-hidden rounded-2xl border border-[#EBD3D3] bg-white shadow-sm">
        <div className="flex items-center justify-between gap-3 bg-gradient-to-r from-[#6E2430] to-[#8A2D3C] px-6 py-4">
          <h2 className="text-2xl font-bold text-white">Validated Households</h2>

          <span className="rounded-full bg-white/20 px-3 py-1 text-xl font-semibold text-white">
            {filtered.length} of {households.length}
          </span>
        </div>

        {/* FILTERS */}
        <div className="flex flex-wrap items-center gap-3 border-b border-[#EBD3D3] bg-[#FBF6F6] px-6 py-4">
          <div className="relative min-w-[220px] flex-1">
            <Search
              size={20}
              className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400"
            />

            <input
              type="search"
              placeholder="Search household, address, purok or program..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-xl border border-gray-300 bg-white py-2.5 pl-11 pr-4 text-xl text-gray-900 placeholder:text-gray-400 focus:border-[#6E2430] focus:outline-none focus:ring-4 focus:ring-[#6E2430]/15"
            />
          </div>

          <Dropdown
            label="All Classifications"
            options={priorities}
            value={priorityFilter}
            onChange={setPriorityFilter}
          />

          <Dropdown
            label="All Programs"
            options={programs}
            value={programFilter}
            onChange={setProgramFilter}
          />

          {hasFilters && (
            <button
              type="button"
              onClick={() => {
                setSearch('');
                setPriorityFilter('All');
                setProgramFilter('All');
              }}
              className="rounded-xl px-4 py-2 text-base font-semibold text-[#6E2430] hover:bg-[#F8E9EB]"
            >
              Clear filters
            </button>
          )}
        </div>

        {/* TABLE */}
        <div className="max-h-[560px] overflow-auto scrollbar-hide">
          <table className="w-full text-xl">
            <thead className="sticky top-0 z-20 bg-[#FFD7D7]">
              <tr>
                <th className={`${th} px-6`}>Household</th>
                <th className={th}>Purok</th>
                <th className={th}>Priority</th>
                <th className={th}>Recommended program</th>
                <th className={th}>Socio-economic condition</th>
                <th className={th}>Approval date</th>
                <th className={`${th} px-6`}>Status</th>
              </tr>
            </thead>

            <tbody>
              {filtered.map((household, index) => {
                const priority = getPriority(household?.vulnerability);
                const status = getDisplayStatus(household, validationRecords);
                const date = getApprovalDate(household, validationRecords);

                return (
                  <tr
                    key={
                      household?.household_id ||
                      household?.id ||
                      `${household?.household_head_name}-${index}`
                    }
                    className="border-b border-gray-100 transition last:border-b-0 hover:bg-[#FBF6F6]"
                  >
                    <td className="whitespace-nowrap px-6 py-4 text-xl font-semibold text-gray-900">
                      {household?.household_head_name || 'Unnamed Household'}
                    </td>

                    <td className="whitespace-nowrap px-4 py-4 text-xl">
                      {household?.purok ? (
                        <span className="rounded-lg bg-gray-100 px-2.5 py-1 font-medium text-gray-700">
                          {household.purok}
                        </span>
                      ) : (
                        '—'
                      )}
                    </td>

                    <td className="px-4 py-4">
                      <PriorityPill priority={priority} />
                    </td>

                    <td className="px-4 py-4">
                      <ProgramChips
                        programs={normalizePrograms(household?.suggested_programs)}
                      />
                    </td>

                    <td className="min-w-[260px] max-w-sm px-4 py-4 text-xl leading-snug text-gray-600">
                      {getCondition(household)}
                    </td>

                    <td className="whitespace-nowrap px-4 py-4 text-xl text-gray-700">
                      {formatDate(date)}
                    </td>

                    <td className="px-6 py-4">
                      <StatusPill status={status} />
                    </td>
                  </tr>
                );
              })}

              {!filtered.length && (
                <tr>
                  <td colSpan={7} className="px-6 py-14 text-center text-lg text-gray-400">
                    {households.length
                      ? 'No households match your filters.'
                      : 'No validated household records found.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}