import { useCallback, useEffect, useMemo, useState } from 'react';

import { api } from '../lib/api';

import {
  PageHeader,
  Band,
  Table,
  Status,
  Spinner,
} from '../components/ui';

/* ==========================================================================
   RESPONSE HELPERS
========================================================================== */

function getArray(response, keys = []) {
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

/* ==========================================================================
   PROGRAM TEXT
========================================================================== */

function normalizePrograms(programs) {
  if (
    programs === null ||
    programs === undefined ||
    programs === ''
  ) {
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
     * PostgreSQL array format:
     *
     * {Food Assistance,Medical Assistance}
     */
    if (
      value.startsWith('{') &&
      value.endsWith('}')
    ) {
      return value
        .slice(1, -1)
        .split(',')
        .map((item) =>
          item
            .trim()
            .replace(/^"|"$/g, '')
        )
        .filter(Boolean);
    }

    /*
     * JSON array:
     *
     * ["Food Assistance","Medical Assistance"]
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
            .map((item) =>
              String(item).trim()
            )
            .filter(Boolean);
        }
      } catch (error) {
        // Continue with normal string handling.
      }
    }

    /*
     * Comma-separated text.
     */
    if (value.includes(',')) {
      return value
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean);
    }

    return [value];
  }

  return [String(programs)];
}

function programsText(programs) {
  const values = normalizePrograms(programs);

  return values.length
    ? values.join(', ')
    : '—';
}

/* ==========================================================================
   DATE HELPERS
========================================================================== */

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

function isThisMonth(value) {
  if (!value) {
    return false;
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return false;
  }

  const now = new Date();

  return (
    date.getFullYear() ===
      now.getFullYear() &&
    date.getMonth() ===
      now.getMonth()
  );
}

/* ==========================================================================
   APPROVAL DATE
========================================================================== */

function getApprovalDate(record) {
  return (
    record?.approved_at ??
    record?.approvedAt ??
    record?.submitted_at ??
    record?.submittedAt ??
    null
  );
}

/* ==========================================================================
   PROGRAM NAME
========================================================================== */

function getProgramName(record) {
  return (
    record?.program_name ??
    record?.name ??
    record?.title ??
    '—'
  );
}

/* ==========================================================================
   VULNERABILITY
========================================================================== */

function vulnerabilityClass(
  vulnerability
) {
  const value = String(
    vulnerability ?? ''
  ).toLowerCase();

  if (
    value.includes('highly') ||
    value.includes('high')
  ) {
    return 'text-alert';
  }

  if (
    value.includes('moderately') ||
    value.includes('moderate') ||
    value.includes('medium')
  ) {
    return 'text-amber';
  }

  return 'text-success';
}

function vulnerabilityLabel(
  vulnerability
) {
  if (!vulnerability) {
    return '—';
  }

  const value = String(
    vulnerability
  )
    .replace(
      /\s*vulnerable\s*/gi,
      ''
    )
    .trim();

  return value || '—';
}

/* ==========================================================================
   APPROVED RECORD CHECK
========================================================================== */

function isApproved(record) {
  return (
    String(
      record?.validation_status ?? ''
    )
      .trim()
      .toLowerCase() === 'approved'
  );
}

/* ==========================================================================
   HOUSEHOLD ID
========================================================================== */

function getHouseholdId(record) {
  return (
    record?.household_id ??
    record?.householdId ??
    null
  );
}

/* ==========================================================================
   PROGRAM ID
========================================================================== */

function getProgramId(record) {
  return (
    record?.program_id ??
    record?.programId ??
    null
  );
}

/* ==========================================================================
   MOST ENROLLED PROGRAM
========================================================================== */

function calculateMostEnrolledProgram(
  approvedRecords,
  programs
) {
  const counts = {};

  /*
   * beneficiary_validation already represents
   * approved household-program records.
   *
   * Therefore each approved record counts as
   * one household enrolled in that program.
   */
  approvedRecords.forEach((record) => {
    const programId =
      getProgramId(record);

    const programName =
      getProgramName(record);

    /*
     * Prefer program ID because it is stable.
     */
    if (programId) {
      const key = String(
        programId
      );

      if (!counts[key]) {
        counts[key] = {
          count: 0,
          displayName:
            programName,
        };
      }

      counts[key].count += 1;

      if (
        counts[key].displayName ===
          '—' &&
        programName !== '—'
      ) {
        counts[key].displayName =
          programName;
      }

      return;
    }

    /*
     * Fallback to program name.
     */
    if (
      programName &&
      programName !== '—'
    ) {
      const key =
        programName
          .trim()
          .toLowerCase();

      if (!counts[key]) {
        counts[key] = {
          count: 0,
          displayName:
            programName,
        };
      }

      counts[key].count += 1;
    }
  });

  const sorted = Object.values(
    counts
  ).sort(
    (a, b) =>
      b.count - a.count
  );

  if (!sorted.length) {
    return {
      name: '—',
      count: 0,
    };
  }

  /*
   * If the history record did not have
   * program_name, try finding it from
   * assistance_programs.
   */
  const top = sorted[0];

  if (
    top.displayName &&
    top.displayName !== '—'
  ) {
    return {
      name: top.displayName,
      count: top.count,
    };
  }

  return {
    name: '—',
    count: top.count,
  };
}

/* ==========================================================================
   COMPONENT
========================================================================== */

export default function Beneficiaries() {
  const [
    approvedRecords,
    setApprovedRecords,
  ] = useState([]);

  const [
    programs,
    setPrograms,
  ] = useState([]);

  const [loading, setLoading] =
    useState(true);

  const [error, setError] =
    useState('');

  /* =========================================================================
     LOAD DATA
  ========================================================================= */

  const load = useCallback(
    async () => {
      try {
        setLoading(true);
        setError('');

        /*
         * beneficiary_validation/history is the
         * authoritative source for approved
         * beneficiaries.
         *
         * Programs are loaded separately so the
         * PROGRAMS card can show all available
         * assistance programs.
         */
        const [
          historyResponse,
          programsResponse,
        ] = await Promise.all([
          api.get(
            '/history/beneficiary-validation'
          ),
          api.get('/programs'),
        ]);

        /*
         * History endpoint already returns only:
         *
         * Approved
         * Rejected
         *
         * We still filter Approved on the
         * frontend for safety.
         */
        const history =
          getArray(
            historyResponse
          );

        const approved =
          history.filter(
            isApproved
          );

        const programList =
          getArray(
            programsResponse,
            ['programs']
          );

        setApprovedRecords(
          approved
        );

        setPrograms(
          programList
        );
      } catch (e) {
        console.error(
          'Beneficiaries load error:',
          e
        );

        setApprovedRecords([]);
        setPrograms([]);

        setError(
          e?.response?.data?.error ||
          e?.response?.data?.message ||
          e?.message ||
          'Failed to load approved beneficiaries.'
        );
      } finally {
        setLoading(false);
      }
    },
    []
  );

  useEffect(() => {
    load();
  }, [load]);

  /* =========================================================================
     DYNAMIC STATISTICS
  ========================================================================= */

  /*
   * Total approved records.
   *
   * One record = one approved household-program
   * beneficiary entry.
   */
  const totalApproved =
    approvedRecords.length;

  /*
   * Number of unique approved households.
   *
   * This is useful when one household is approved
   * for more than one program.
   */
  const totalApprovedHouseholds =
    useMemo(() => {
      const ids = new Set();

      approvedRecords.forEach(
        (record) => {
          const id =
            getHouseholdId(
              record
            );

          if (id) {
            ids.add(String(id));
          }
        }
      );

      return ids.size;
    }, [approvedRecords]);

  /*
   * Approved records this month.
   */
  const approvedThisMonth =
    useMemo(
      () =>
        approvedRecords.filter(
          (record) =>
            isThisMonth(
              getApprovalDate(
                record
              )
            )
        ).length,
      [approvedRecords]
    );

  /*
   * Most enrolled program.
   */
  const mostEnrolled =
    useMemo(
      () =>
        calculateMostEnrolledProgram(
          approvedRecords,
          programs
        ),
      [
        approvedRecords,
        programs,
      ]
    );

  /*
   * Newest approval.
   */
  const newest =
    useMemo(() => {
      return (
        [...approvedRecords].sort(
          (a, b) => {
            const aDate =
              new Date(
                getApprovalDate(
                  a
                ) || 0
              ).getTime();

            const bDate =
              new Date(
                getApprovalDate(
                  b
                ) || 0
              ).getTime();

            return (
              bDate - aDate
            );
          }
        )[0] || null
      );
    }, [approvedRecords]);

  /* =========================================================================
     RENDER
  ========================================================================= */

  return (
    <div className="space-y-6">

      {/* ================================================================
          HEADER
      ================================================================= */}

      <div className="mt-5">
        <PageHeader
          title="Approved Household Beneficiaries"
          subtitle="All households currently approved and active in social assistance programs."
        />
      </div>

      {/* ================================================================
          ERROR
      ================================================================= */}

      {error && (
        <div
          role="alert"
          className="
            rounded-lg
            border
            border-red-200
            bg-red-50
            p-4
            text-red-600
          "
        >
          {error}
        </div>
      )}

      {/* ================================================================
          LOADING
      ================================================================= */}

      {loading ? (
        <div className="flex justify-center py-12">
          <Spinner />
        </div>
      ) : (
        <>
          {/* ============================================================
              STAT CARDS
          ============================================================= */}

          <div
            className="
              grid
              grid-cols-1
              gap-4
              md:grid-cols-2
              xl:grid-cols-4
            "
          >

            {/* TOTAL APPROVED */}

            <div
              className="
                rounded-lg
                border
                border-gray-200
                bg-white
                p-4
                shadow-sm
              "
            >
              <div
                className="
                  text-xl
                  font-bold
                  tracking-wide
                  text-head
                "
              >
                TOTAL APPROVED
              </div>

              <div
                className="
                  text-[36px]
                  font-extrabold
                  leading-tight
                  text-ink
                "
              >
                {totalApprovedHouseholds.toLocaleString()}
              </div>

              <div
                className="
                  text-xl
                  font-semibold
                  text-success
                "
              >
                {approvedThisMonth}{' '}
                approved this month
              </div>
            </div>

            {/* PROGRAMS */}

            <div
              className="
                rounded-lg
                border
                border-gray-200
                bg-white
                p-4
                shadow-sm
              "
            >
              <div
                className="
                  text-xl
                  font-bold
                  tracking-wide
                  text-head
                "
              >
                PROGRAMS
              </div>

              <div
                className="
                  text-[36px]
                  font-extrabold
                  leading-tight
                  text-ink
                "
              >
                {programs.length.toLocaleString()}
              </div>

              <div
                className="
                  text-xl
                  font-semibold
                  text-success
                "
              >
                Active assistance programs
              </div>
            </div>

            {/* MOST ENROLLED PROGRAM */}

            <div
              className="
                rounded-lg
                border
                border-gray-200
                bg-white
                p-4
                shadow-sm
              "
            >
              <div
                className="
                  text-xl
                  font-bold
                  tracking-wide
                  text-head
                "
              >
                MOST ENROLLED PROGRAM
              </div>

              <div
                className="
                  truncate
                  text-[28px]
                  font-extrabold
                  leading-tight
                  text-ink
                "
                title={
                  mostEnrolled.name
                }
              >
                {mostEnrolled.name}
              </div>

              <div
                className="
                  text-xl
                  font-semibold
                  text-success
                "
              >
                {mostEnrolled.count}{' '}
                approved household
                {mostEnrolled.count === 1
                  ? ''
                  : 's'}
              </div>
            </div>

            {/* NEWEST APPROVAL */}

            <div
              className="
                rounded-lg
                border
                border-gray-200
                bg-white
                p-4
                shadow-sm
              "
            >
              <div
                className="
                  text-xl
                  font-bold
                  tracking-wide
                  text-head
                "
              >
                NEWEST APPROVAL
              </div>

              <div
                className="
                  truncate
                  text-[28px]
                  font-extrabold
                  leading-tight
                  text-ink
                "
                title={
                  newest?.household_head_name ||
                  '—'
                }
              >
                {newest?.household_head_name ||
                  '—'}
              </div>

              <div
                className="
                  text-xl
                  font-semibold
                  text-success
                "
              >
                {formatDate(
                  getApprovalDate(
                    newest
                  )
                )}
              </div>
            </div>

          </div>

          {/* ============================================================
              APPROVED BENEFICIARIES TABLE
          ============================================================= */}

          <Band title="Approved Household Beneficiaries">

  <div className="max-h-[500px] overflow-y-auto overflow-x-auto rounded-lg">

    <Table
      head={[
        'Household',
        'Purok',
        'Program',
        'Classification',
        'Date Approved',
        'Status',
      ]}
    >
      {approvedRecords.map((record, index) => (
        <tr
          key={
            record?.validation_id ??
            `${getHouseholdId(record)}-${getProgramId(record)}-${index}`
          }
        >
          <td className="px-3 py-4 font-medium text-2xl">
            {record?.household_head_name || '—'}
          </td>

          <td className="px-3 py-2 text-2xl">
            {record?.purok || '—'}
          </td>

          <td className="px-3 py-2 text-2xl">
            {getProgramName(record)}
          </td>

          <td className="px-3 py-2 text-2xl">
            <span
              className={`font-extrabold ${vulnerabilityClass(
                record?.vulnerability
              )}`}
            >
              {vulnerabilityLabel(record?.vulnerability)}
            </span>
          </td>

          <td className="px-3 py-2 text-2xl">
            {formatDate(getApprovalDate(record))}
          </td>

          <td className="px-3 py-2 text-2xl">
            <Status tone="success">
              Active
            </Status>
          </td>
        </tr>
      ))}

      {!approvedRecords.length && (
        <tr>
          <td
            colSpan={6}
            className="px-3 py-6 text-center text-gray-400"
          >
            No approved beneficiaries yet.
          </td>
        </tr>
      )}
    </Table>

  </div>

</Band>

        </>
      )}
    </div>
  );
}