import React, { useEffect, useMemo, useState } from 'react';
import { Search, ChevronDown } from 'lucide-react';

import { api } from '../lib/api';
import { Spinner } from '../components/ui';

/* =========================================================
   DROPDOWN
========================================================= */

function Dropdown({
  label,
  options,
  value,
  onChange,
}) {
  return (
    <div className="relative">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="
          appearance-none
          bg-white
          border border-slate-200
          rounded-lg
          pl-3 pr-9 py-2
          text-2xl
          text-slate-600
          focus:outline-none
          focus:ring-2
          focus:ring-rose-900/20
          cursor-pointer
        "
      >
        <option value="All">{label}</option>

        {options.map((option) => (
          <option
            key={option}
            value={option}
          >
            {option}
          </option>
        ))}
      </select>

      <ChevronDown
        size={30}
        className="
          pointer-events-none
          absolute right-2.5 top-1/2
          -translate-y-1/2
          text-slate-400
        "
      />
    </div>
  );
}

/* =========================================================
   ARRAY / PROGRAM HELPERS
========================================================= */

function normalizePrograms(programs) {
  if (!programs) {
    return [];
  }

  if (Array.isArray(programs)) {
    return programs
      .filter(Boolean)
      .map((item) => String(item).trim())
      .filter(Boolean);
  }

  if (typeof programs === 'string') {
    const value = programs.trim();

    if (!value) {
      return [];
    }

    /*
     * Handle JSON array stored as text.
     */
    if (
      value.startsWith('[') &&
      value.endsWith(']')
    ) {
      try {
        const parsed = JSON.parse(value);

        if (Array.isArray(parsed)) {
          return parsed
            .filter(Boolean)
            .map((item) => String(item).trim())
            .filter(Boolean);
        }
      } catch (error) {
        // Continue with normal string handling.
      }
    }

    /*
     * Handle comma-separated programs.
     */
    return value
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);
  }

  return [String(programs)];
}

function formatPrograms(programs) {
  const values = normalizePrograms(programs);

  return values.length
    ? values.join(', ')
    : '—';
}

/* =========================================================
   PRIORITY
========================================================= */

function getPriority(vulnerability) {
  const value = String(
    vulnerability || ''
  ).trim().toLowerCase();

  if (
    value.includes('highly') ||
    value.includes('high')
  ) {
    return 'High';
  }

  if (
    value.includes('moderate') ||
    value.includes('medium')
  ) {
    return 'Medium';
  }

  if (
    value.includes('low') ||
    value.includes('not vulnerable')
  ) {
    return 'Low';
  }

  return 'Low';
}

/* =========================================================
   PRIORITY STYLE
========================================================= */

function priorityClass(priority) {
  switch (priority) {
    case 'High':
      return 'bg-rose-100 text-rose-600';

    case 'Medium':
      return 'bg-amber-100 text-amber-700';

    case 'Low':
      return 'bg-emerald-100 text-emerald-700';

    default:
      return 'bg-slate-100 text-slate-500';
  }
}

/* =========================================================
   STATUS
========================================================= */

function normalizeStatus(value) {
  return String(
    value || ''
  )
    .trim()
    .toLowerCase();
}

function getDisplayStatus(
  household,
  validationRecords = []
) {
  const householdId =
    household?.household_id ||
    household?.id;

  /*
   * Look for beneficiary-validation records
   * belonging to this household.
   */
  const records = validationRecords.filter(
    (record) =>
      String(
        record?.household_id || ''
      ) === String(householdId || '')
  );

  const hasApproved = records.some(
    (record) =>
      normalizeStatus(
        record?.validation_status
      ) === 'approved'
  );

  const hasPending = records.some(
    (record) =>
      normalizeStatus(
        record?.validation_status
      ) === 'pending'
  );

  const hasRejected = records.some(
    (record) =>
      normalizeStatus(
        record?.validation_status
      ) === 'rejected'
  );

  /*
   * Approved beneficiary records are Active.
   */
  if (hasApproved) {
    return 'Active';
  }

  /*
   * Pending beneficiary records are
   * waiting for Captain approval.
   */
  if (hasPending) {
    return 'For Approval';
  }

  /*
   * If records were rejected and there
   * are no approved/pending records.
   */
  if (hasRejected) {
    return 'Rejected';
  }

  /*
   * Fallback to household status.
   */
  const householdStatus =
    normalizeStatus(
      household?.validation_status
    );

  if (
    householdStatus === 'approved' ||
    householdStatus === 'active'
  ) {
    return 'Active';
  }

  if (
    householdStatus === 'rejected'
  ) {
    return 'Rejected';
  }

  return 'For Approval';
}

/* =========================================================
   STATUS STYLE
========================================================= */

function statusClass(status) {
  switch (status) {
    case 'Active':
      return 'bg-emerald-100 text-emerald-700';

    case 'Rejected':
      return 'bg-red-100 text-red-700';

    case 'For Approval':
    default:
      return 'bg-slate-100 text-slate-500';
  }
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

  return date.toLocaleDateString(
    'en-US',
    {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    }
  );
}

/* =========================================================
   CONDITION
========================================================= */

function getCondition(household) {
  const parts = [];

  /*
   * IMPORTANT:
   * Use monthly_income / income only.
   *
   * The previous code accidentally used:
   * household.occupation
   * as the income value.
   */
  const income = Number(
    household?.monthly_income ??
    household?.income ??
    0
  );

  const familyNumber = Number(
    household?.family_number
  );

  const disability =
    household?.disability_present;

  /* -------------------------------------------------------
     INCOME
  ------------------------------------------------------- */

  if (
    Number.isFinite(income) &&
    income > 0
  ) {
    parts.push(
      `₱${income.toLocaleString()} income`
    );
  } else {
    parts.push(
      'No stable income source'
    );
  }

  /* -------------------------------------------------------
     FAMILY SIZE
  ------------------------------------------------------- */

  if (
    Number.isFinite(familyNumber) &&
    familyNumber > 0
  ) {
    parts.push(
      `${familyNumber} family members`
    );
  }

  /* -------------------------------------------------------
     DISABILITY
  ------------------------------------------------------- */

  const disabilityValue =
    String(disability || '')
      .trim()
      .toLowerCase();

  if (
    disability === true ||
    disabilityValue === 'true' ||
    disabilityValue === 'yes'
  ) {
    parts.push(
      'Person with disability'
    );
  }

  /* -------------------------------------------------------
     SENIOR HOUSEHOLD HEAD
  ------------------------------------------------------- */

  const age = Number(
    household?.age
  );

  if (
    Number.isFinite(age) &&
    age >= 60
  ) {
    parts.push(
      'Senior-headed household'
    );
  }

  return parts.join(', ');
}

/* =========================================================
   APPROVAL DATE
========================================================= */

function getApprovalDate(
  household,
  validationRecords = []
) {
  const householdId =
    household?.household_id ||
    household?.id;

  const approvedRecord =
    validationRecords
      .filter(
        (record) =>
          String(
            record?.household_id || ''
          ) === String(
            householdId || ''
          )
      )
      .filter(
        (record) =>
          normalizeStatus(
            record?.validation_status
          ) === 'approved'
      )
      .sort(
        (a, b) =>
          new Date(
            b?.approved_at ||
            b?.submitted_at ||
            0
          ) -
          new Date(
            a?.approved_at ||
            a?.submitted_at ||
            0
          )
      )[0];

  return (
    approvedRecord?.approved_at ||
    household?.approved_at ||
    household?.approval_date ||
    household?.updated_at ||
    household?.created_at ||
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
    if (
      Array.isArray(
        response?.[key]
      )
    ) {
      return response[key];
    }

    if (
      Array.isArray(
        response?.data?.[key]
      )
    ) {
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
  const [households, setHouseholds] =
    useState([]);

  const [
    validationRecords,
    setValidationRecords,
  ] = useState([]);

  const [search, setSearch] =
    useState('');

  const [
    priorityFilter,
    setPriorityFilter,
  ] = useState('All');

  const [
    programFilter,
    setProgramFilter,
  ] = useState('All');

  const [loading, setLoading] =
    useState(true);

  const [error, setError] =
    useState('');

  /* =======================================================
     LOAD DATA
  ======================================================= */

  useEffect(() => {
    let cancelled = false;

    async function loadData() {
      try {
        setLoading(true);
        setError('');

        /*
         * Load both:
         *
         * 1. Household data
         * 2. Beneficiary validation history
         *
         * Household data provides ML classification.
         * beneficiary_validation provides Captain decisions.
         */
        const [
          householdResponse,
          validationResponse,
        ] = await Promise.all([
          api.get('/households'),
          api.get(
            '/history/beneficiary-validation'
          ),
        ]);

        if (cancelled) {
          return;
        }

        const householdList =
          extractArray(
            householdResponse,
            ['households']
          );

        const validationList =
          extractArray(
            validationResponse
          );

        setHouseholds(
          householdList
        );

        setValidationRecords(
          validationList
        );
      } catch (e) {
        if (cancelled) {
          return;
        }

        console.error(
          'Failed to load validation data:',
          e
        );

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
    const values =
      households.map((household) =>
        getPriority(
          household?.vulnerability
        )
      );

    return Array.from(
      new Set(values)
    );
  }, [households]);

  /* =======================================================
     PROGRAMS
  ======================================================= */

  const programs = useMemo(() => {
    const values = [];

    households.forEach(
      (household) => {
        normalizePrograms(
          household?.suggested_programs
        ).forEach((program) => {
          if (program) {
            values.push(program);
          }
        });
      }
    );

    /*
     * Also include program names from
     * beneficiary validation records.
     */
    validationRecords.forEach(
      (record) => {
        if (
          record?.program_name
        ) {
          values.push(
            String(
              record.program_name
            ).trim()
          );
        }
      }
    );

    return Array.from(
      new Set(
        values.filter(Boolean)
      )
    ).sort();
  }, [
    households,
    validationRecords,
  ]);

  /* =======================================================
     FILTERED DATA
  ======================================================= */

  const filtered = useMemo(() => {
    const query =
      search
        .trim()
        .toLowerCase();

    return households.filter(
      (household) => {
        const name =
          String(
            household?.household_head_name ||
            ''
          ).toLowerCase();

        const address =
          String(
            household?.address ||
            ''
          ).toLowerCase();

        const purok =
          String(
            household?.purok ||
            ''
          ).toLowerCase();

        const programText =
          formatPrograms(
            household?.suggested_programs
          ).toLowerCase();

        const priority =
          getPriority(
            household?.vulnerability
          );

        const matchesSearch =
          !query ||
          name.includes(query) ||
          address.includes(query) ||
          purok.includes(query) ||
          programText.includes(query);

        const matchesPriority =
          priorityFilter === 'All' ||
          priority === priorityFilter;

        const householdPrograms =
          normalizePrograms(
            household?.suggested_programs
          );

        const matchesProgram =
          programFilter === 'All' ||
          householdPrograms.includes(
            programFilter
          );

        return (
          matchesSearch &&
          matchesPriority &&
          matchesProgram
        );
      }
    );
  }, [
    households,
    search,
    priorityFilter,
    programFilter,
  ]);

  /* =======================================================
     STATISTICS
  ======================================================= */

  const stats = useMemo(() => {
    /*
     * Pending beneficiary validation records.
     */
    const pendingRecords =
      validationRecords.filter(
        (record) =>
          normalizeStatus(
            record?.validation_status
          ) === 'pending'
      );

    /*
     * Unique households waiting
     * for Captain review.
     */
    const awaitingReview =
      new Set(
        pendingRecords
          .map(
            (record) =>
              record?.household_id
          )
          .filter(Boolean)
      ).size;

    /*
     * High priority households.
     */
    const highPriority =
      households.filter(
        (household) =>
          getPriority(
            household?.vulnerability
          ) === 'High'
      ).length;

    /*
     * Approved beneficiary records.
     */
    const approvedRecords =
      validationRecords.filter(
        (record) =>
          normalizeStatus(
            record?.validation_status
          ) === 'approved'
      );

    /*
     * Rejected beneficiary records.
     */
    const rejectedRecords =
      validationRecords.filter(
        (record) =>
          normalizeStatus(
            record?.validation_status
          ) === 'rejected'
      );

    /*
     * Unique approved households.
     */
    const approvedHouseholdIds =
      new Set(
        approvedRecords
          .map(
            (record) =>
              record?.household_id
          )
          .filter(Boolean)
      );

    /*
     * Unique households with a
     * final decision.
     */
    const decidedHouseholdIds =
      new Set(
        [
          ...approvedRecords,
          ...rejectedRecords,
        ]
          .map(
            (record) =>
              record?.household_id
          )
          .filter(Boolean)
      );

    /*
     * Approval percentage:
     *
     * Approved households /
     * all households with a decision.
     *
     * This is more accurate than:
     *
     * approved / all households
     */
    const approvalPercent =
      decidedHouseholdIds.size > 0
        ? Math.round(
            (approvedHouseholdIds.size /
              decidedHouseholdIds.size) *
              100
          )
        : 0;

    /*
     * Approvals made today.
     */
    const today =
      new Date();

    const approvalToday =
      approvedRecords.filter(
        (record) => {
          const value =
            record?.approved_at ||
            record?.submitted_at;

          if (!value) {
            return false;
          }

          const date =
            new Date(value);

          return (
            !Number.isNaN(
              date.getTime()
            ) &&
            date.toDateString() ===
              today.toDateString()
          );
        }
      ).length;

    /*
     * Find the Captain who made
     * the latest approval.
     */
    const latestApproval =
      [...approvedRecords]
        .sort(
          (a, b) =>
            new Date(
              b?.approved_at ||
              b?.submitted_at ||
              0
            ) -
            new Date(
              a?.approved_at ||
              a?.submitted_at ||
              0
            )
        )[0];

    return {
      awaitingReview,
      highPriority,
      approvalToday,
      approvalPercent,
      approvedRecords,
      rejectedRecords,
      captain:
        latestApproval?.approved_by_name ||
        'Barangay Captain',
    };
  }, [
    households,
    validationRecords,
  ]);

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

  return (
    <div className="min-h-screen px-2 py-6">

      <div className="mx-auto">

        {/* =================================================
            HEADER
        ================================================= */}

        <div>
          <h1 className="text-3xl font-bold tracking-tight pt-5">
            Validated Household Data
          </h1>

          <p className="mt-2 text-xl text-slate-500">
            Review socio-economic classification
            and the recommended assistance program.
          </p>
        </div>

        {/* =================================================
            ERROR
        ================================================= */}

        {error && (
          <div
            role="alert"
            className="
              mt-4
              rounded-lg
              border border-red-200
              bg-red-50
              px-4 py-3
              text-sm
              text-red-700
            "
          >
            {error}
          </div>
        )}

        {/* =================================================
            STAT CARDS
        ================================================= */}

        <div
          className="
            mt-6
            grid
            grid-cols-1
            gap-4
            sm:grid-cols-2
            lg:grid-cols-4
          "
        >

          {/* FLAGGED */}

          <div
            className="
              rounded-lg
              border-l-4
              border-slate-900
              bg-white
              px-5 py-4
              shadow-sm
            "
          >
            <div
              className="
                text-lg
                font-semibold
                tracking-wide
                text-slate-500
              "
            >
              FLAGGED HOUSEHOLD
            </div>

            <div className="mt-1 text-3xl font-bold">
              {stats.awaitingReview}
            </div>

            <div
              className="
                mt-1
                text-lg
                font-medium
                text-emerald-600
              "
            >
              Awaiting Review
            </div>
          </div>

          {/* HIGH PRIORITY */}

          <div
            className="
              rounded-lg
              border-l-4
              border-slate-900
              bg-white
              px-5 py-4
              shadow-sm
            "
          >
            <div
              className="
                text-xl
                font-semibold
                tracking-wide
                text-slate-500
              "
            >
              HIGH PRIORITY
            </div>

            <div className="mt-1 text-3xl font-bold">
              {stats.highPriority}
            </div>

            <div
              className="
                mt-1
                text-lg
                font-medium
                text-emerald-600
              "
            >
              Needs urgent review
            </div>
          </div>

          {/* APPROVAL TODAY */}

          <div
            className="
              rounded-lg
              border-l-4
              border-slate-900
              bg-white
              px-5 py-4
              shadow-sm
            "
          >
            <div
              className="
                text-lg
                font-semibold
                tracking-wide
                text-slate-500
              "
            >
              APPROVAL TODAY
            </div>

            <div className="mt-1 text-3xl font-bold">
              {stats.approvalToday}
            </div>

            <div
              className="
                mt-1
                text-lg
                font-medium
                text-emerald-600
              "
            >
              By {stats.captain}
            </div>
          </div>

          {/* APPROVAL % */}

          <div
            className="
              rounded-lg
              border-l-4
              border-slate-900
              bg-white
              px-5 py-4
              shadow-sm
            "
          >
            <div
              className="
                text-lg
                font-semibold
                tracking-wide
                text-slate-500
              "
            >
              APPROVAL %
            </div>

            <div className="mt-1 text-3xl font-bold">
              {stats.approvalPercent}%
            </div>

            <div
              className="
                mt-1
                text-lg
                font-medium
                text-emerald-600
              "
            >
              {formatDate(new Date())}
            </div>
          </div>

        </div>

        {/* =================================================
            TABLE CARD
        ================================================= */}

        <div
          className="
            mt-6
            overflow-hidden
            rounded-xl
            bg-white
            shadow-sm
          "
        >

          {/* TABLE HEADER */}

          <div className="bg-[#6E2430] px-6 py-4">
            <h2
              className="
                text-2xl
                font-semibold
                text-white
              "
            >
              Validated Households
            </h2>
          </div>

          {/* =================================================
              FILTERS
          ================================================= */}

          <div
            className="
              flex
              flex-wrap
              gap-3
              border-b
              border-slate-100
              px-6
              py-4
            "
          >

            {/* SEARCH */}

            <div
              className="
                relative
                min-w-[220px]
                flex-1
              "
            >
              <Search
                size={20}
                className="
                  absolute
                  left-3
                  top-1/2
                  -translate-y-1/2
                  text-slate-500
                "
              />

              <input
                type="text"
                placeholder="Search household..."
                value={search}
                onChange={(e) =>
                  setSearch(e.target.value)
                }
                className="
                  w-full
                  rounded-lg
                  border
                  border-slate-200
                  py-2
                  pl-9
                  pr-3
                  text-xl
                  focus:outline-none
                  focus:ring-2
                  focus:ring-rose-900/20
                "
              />
            </div>

            {/* PRIORITY */}

            <Dropdown
              label="All Classifications"
              options={priorities}
              value={priorityFilter}
              onChange={setPriorityFilter}
            />

            {/* PROGRAM */}

            <Dropdown
              label="All Programs"
              options={programs}
              value={programFilter}
              onChange={setProgramFilter}
            />

          </div>

          {/* =================================================
              TABLE
          ================================================= */}

          <div className="max-h-[500px] overflow-y-auto overflow-x-auto">

            <table className="w-full text-lg">

              <thead className="sticky top-0 z-20">
                <tr
                  className="
                    bg-[#FFD7D7]
                    text-xl
                    font-semibold
                    tracking-wide
                    text-rose-900
                  "
                >

                  <th
                    className="
                      whitespace-nowrap
                      px-6
                      py-3
                      text-left
                    "
                  >
                    HOUSEHOLD
                  </th>

                  <th
                    className="
                      whitespace-nowrap
                      px-3
                      py-3
                      text-left
                    "
                  >
                    PUROK
                  </th>

                  <th
                    className="
                      whitespace-nowrap
                      px-3
                      py-3
                      text-left
                    "
                  >
                    PRIORITY
                  </th>

                  <th
                    className="
                      whitespace-nowrap
                      px-3
                      py-3
                      text-left
                    "
                  >
                    RECOMMEND PROGRAM
                  </th>

                  <th
                    className="
                      whitespace-nowrap
                      px-3
                      py-3
                      text-left
                    "
                  >
                    SOCIO-ECONOMIC CONDITION
                  </th>

                  <th
                    className="
                      whitespace-nowrap
                      px-3
                      py-3
                      text-left
                    "
                  >
                    DATE
                  </th>

                  <th
                    className="
                      whitespace-nowrap
                      px-6
                      py-3
                      text-left
                    "
                  >
                    STATUS
                  </th>

                </tr>
              </thead>

              <tbody>

                {filtered.map(
                  (household, index) => {
                    const priority =
                      getPriority(
                        household?.vulnerability
                      );

                    const status =
                      getDisplayStatus(
                        household,
                        validationRecords
                      );

                    const date =
                      getApprovalDate(
                        household,
                        validationRecords
                      );

                    return (
                      <tr
                        key={
                          household?.household_id ||
                          household?.id ||
                          `${household?.household_head_name}-${index}`
                        }
                        className="
                          border-b
                          border-slate-100
                          transition
                          last:border-b-0
                          hover:bg-slate-50
                        "
                      >

                        {/* HOUSEHOLD */}

                        <td
                          className="
                            whitespace-nowrap
                            px-6
                            py-4
                            font-medium
                            text-2xl
                          "
                        >
                          {household?.household_head_name ||
                            'Unnamed Household'}
                        </td>

                        {/* PUROK */}

                        <td
                          className="
                            whitespace-nowrap
                            px-3
                            py-4
                            text-2xl
                          "
                        >
                          {household?.purok || '—'}
                        </td>

                        {/* PRIORITY */}

                        <td className="px-3 py-4">
                          <span
                            className={`
                              inline-block
                              rounded-md
                              px-3
                              py-1
                              text-xl
                              font-semibold
                              ${priorityClass(
                                priority
                              )}
                            `}
                          >
                            {priority}
                          </span>
                        </td>

                        {/* PROGRAM */}

                        <td
                          className="
                            whitespace-nowrap
                            px-3
                            py-4
                            text-xl
                          "
                        >
                          {formatPrograms(
                            household?.suggested_programs
                          )}
                        </td>

                        {/* CONDITION */}

                        <td
                          className="
                            min-w-[240px]
                            px-3
                            py-4
                            text-xl
                          "
                        >
                          {getCondition(
                            household
                          )}
                        </td>

                        {/* DATE */}

                        <td
                          className="
                            whitespace-nowrap
                            px-3
                            py-4
                            text-xl
                          "
                        >
                          {formatDate(
                            date
                          )}
                        </td>

                        {/* STATUS */}

                        <td className="px-6 py-4">
                          <span
                            className={`
                              inline-block
                              whitespace-nowrap
                              rounded-md
                              px-3
                              py-1
                              text-xl
                              font-semibold
                              ${statusClass(
                                status
                              )}
                            `}
                          >
                            {status}
                          </span>
                        </td>

                      </tr>
                    );
                  }
                )}

                {/* EMPTY */}

                {!filtered.length && (
                  <tr>
                    <td
                      colSpan={7}
                      className="
                        px-6
                        py-10
                        text-center
                        text-slate-400
                      "
                    >
                      {households.length
                        ? 'No households match your filters.'
                        : 'No validated household records found.'}
                    </td>
                  </tr>
                )}

              </tbody>

            </table>

          </div>

        </div>

      </div>

    </div>
  );
}