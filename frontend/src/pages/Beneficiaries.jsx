import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Award,
  BadgeCheck,
  CalendarCheck,
  HeartHandshake,
  Inbox,
  Search,
} from 'lucide-react';

import { api } from '../lib/api';

import { PageHeader, Table, Status, Spinner } from '../components/ui';

/* ==========================================================================
   PRESENTATION
========================================================================== */

function StatCard({ label, value, note, Icon, truncateValue = false }) {
  return (
    <div className="flex items-center gap-4 rounded-2xl border border-[#EBD3D3] bg-white p-5 shadow-sm">
      <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-[#F8E9EB] text-[#6E2430]">
        <Icon className="h-7 w-7" aria-hidden="true" />
      </span>

      <div className="min-w-0">
        <p className="text-xl font-semibold text-gray-500">{label}</p>

        <p
          className={`font-extrabold leading-tight text-[#6E2430] ${
            truncateValue ? 'truncate text-2xl' : 'text-4xl'
          }`}
          title={truncateValue ? String(value) : undefined}
        >
          {value}
        </p>

        <p className="flex items-center gap-1.5 text-lg font-medium text-gray-500">
          <span className="h-2 w-2 shrink-0 rounded-full bg-green-500" />
          <span className="truncate">{note}</span>
        </p>
      </div>
    </div>
  );
}

function initialsOf(name) {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  return (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
}

function LevelPill({ vulnerability }) {
  if (!vulnerability) return <span className="text-gray-400">—</span>;

  const v = String(vulnerability).toLowerCase();

  const tone = v.includes('high')
    ? 'bg-red-50 text-red-700 ring-red-200'
    : v.includes('moderate') || v.includes('medium')
    ? 'bg-amber-50 text-amber-700 ring-amber-200'
    : 'bg-green-50 text-green-700 ring-green-200';

  const dot = v.includes('high')
    ? 'bg-red-500'
    : v.includes('moderate') || v.includes('medium')
    ? 'bg-amber-500'
    : 'bg-green-500';

  return (
    <span
      className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xl font-semibold ring-1 ${tone}`}
    >
      <span className={`h-2 w-2 rounded-full ${dot}`} />
      {vulnerabilityLabel(vulnerability)}
    </span>
  );
}

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
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth()
  );
}

/* ==========================================================================
   RECORD HELPERS
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

function getProgramName(record) {
  return record?.program_name ?? record?.name ?? record?.title ?? '—';
}

function vulnerabilityLabel(vulnerability) {
  if (!vulnerability) {
    return '—';
  }

  const value = String(vulnerability).replace(/\s*vulnerable\s*/gi, '').trim();

  return value || '—';
}

function isApproved(record) {
  return (
    String(record?.validation_status ?? '')
      .trim()
      .toLowerCase() === 'approved'
  );
}

function getHouseholdId(record) {
  return record?.household_id ?? record?.householdId ?? null;
}

function getProgramId(record) {
  return record?.program_id ?? record?.programId ?? null;
}

/* ==========================================================================
   MOST ENROLLED PROGRAM
========================================================================== */

function calculateMostEnrolledProgram(approvedRecords) {
  const counts = {};

  /*
   * beneficiary_validation already represents approved
   * household-program records, so each approved record
   * counts as one household enrolled in that program.
   */
  approvedRecords.forEach((record) => {
    const programId = getProgramId(record);
    const programName = getProgramName(record);

    // Prefer program ID because it is stable.
    if (programId) {
      const key = String(programId);

      if (!counts[key]) {
        counts[key] = { count: 0, displayName: programName };
      }

      counts[key].count += 1;

      if (counts[key].displayName === '—' && programName !== '—') {
        counts[key].displayName = programName;
      }

      return;
    }

    // Fallback to program name.
    if (programName && programName !== '—') {
      const key = programName.trim().toLowerCase();

      if (!counts[key]) {
        counts[key] = { count: 0, displayName: programName };
      }

      counts[key].count += 1;
    }
  });

  const sorted = Object.values(counts).sort((a, b) => b.count - a.count);

  if (!sorted.length) {
    return { name: '—', count: 0 };
  }

  const top = sorted[0];

  if (top.displayName && top.displayName !== '—') {
    return { name: top.displayName, count: top.count };
  }

  return { name: '—', count: top.count };
}

/* ==========================================================================
   COMPONENT
========================================================================== */

export default function Beneficiaries() {
  const [approvedRecords, setApprovedRecords] = useState([]);
  const [programs, setPrograms] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');

  /* =========================================================================
     LOAD DATA
  ========================================================================= */

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError('');

      /*
       * beneficiary_validation/history is the authoritative source
       * for approved beneficiaries. Programs are loaded separately
       * so the Programs card can show all assistance programs.
       */
      const [historyResponse, programsResponse] = await Promise.all([
        api.get('/history/beneficiary-validation'),
        api.get('/programs'),
      ]);

      // The history endpoint returns Approved and Rejected; keep Approved.
      const history = getArray(historyResponse);
      const approved = history.filter(isApproved);

      setApprovedRecords(approved);
      setPrograms(getArray(programsResponse, ['programs']));
    } catch (e) {
      console.error('Beneficiaries load error:', e);

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
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  /* =========================================================================
     DYNAMIC STATISTICS
  ========================================================================= */

  // Unique approved households (one household can have several programs).
  const totalApprovedHouseholds = useMemo(() => {
    const ids = new Set();

    approvedRecords.forEach((record) => {
      const id = getHouseholdId(record);

      if (id) {
        ids.add(String(id));
      }
    });

    return ids.size;
  }, [approvedRecords]);

  const approvedThisMonth = useMemo(
    () =>
      approvedRecords.filter((record) => isThisMonth(getApprovalDate(record)))
        .length,
    [approvedRecords]
  );

  const mostEnrolled = useMemo(
    () => calculateMostEnrolledProgram(approvedRecords),
    [approvedRecords]
  );

  const newest = useMemo(() => {
    return (
      [...approvedRecords].sort((a, b) => {
        const aDate = new Date(getApprovalDate(a) || 0).getTime();
        const bDate = new Date(getApprovalDate(b) || 0).getTime();

        return bDate - aDate;
      })[0] || null
    );
  }, [approvedRecords]);

  const filteredRecords = useMemo(() => {
    const q = search.trim().toLowerCase();

    if (!q) return approvedRecords;

    return approvedRecords.filter((record) =>
      [record?.household_head_name, record?.purok, getProgramName(record)].some(
        (value) => String(value ?? '').toLowerCase().includes(q)
      )
    );
  }, [approvedRecords, search]);

  /* =========================================================================
     RENDER
  ========================================================================= */

  return (
    <div className="space-y-6">
      {/* HEADER */}
      <div className="mt-5">
        <PageHeader
          title="Approved Household Beneficiaries"
        />
      </div>

      {/* ERROR */}
      {error && (
        <div
          role="alert"
          className="flex items-center justify-between gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-lg font-medium text-red-700"
        >
          <span>{error}</span>
          <button
            type="button"
            onClick={load}
            className="shrink-0 rounded-lg border border-red-300 bg-white px-3 py-1 font-semibold hover:bg-red-100"
          >
            Retry
          </button>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-12">
          <Spinner />
        </div>
      ) : (
        <>
          {/* STAT CARDS */}
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
            <StatCard
              label="Total approved"
              value={totalApprovedHouseholds.toLocaleString()}
              note={`${approvedThisMonth} approved this month`}
              Icon={BadgeCheck}
            />

            <StatCard
              label="Programs"
              value={programs.length.toLocaleString()}
              note="Active programs"
              Icon={HeartHandshake}
            />

            <StatCard
              label="Most enrolled program"
              value={mostEnrolled.name}
              note={`${mostEnrolled.count} approved household${
                mostEnrolled.count === 1 ? '' : 's'
              }`}
              Icon={Award}
              truncateValue
            />

            <StatCard
              label="Newest approval"
              value={newest?.household_head_name || '—'}
              note={formatDate(getApprovalDate(newest))}
              Icon={CalendarCheck}
              truncateValue
            />
          </div>

          {/* APPROVED BENEFICIARIES TABLE */}
          <section className="overflow-hidden rounded-2xl border border-[#EBD3D3] bg-white shadow-sm">
            <div className="flex items-center justify-between gap-3 bg-gradient-to-r from-[#6E2430] to-[#8A2D3C] px-6 py-4">
              <h2 className="text-2xl font-bold text-white">
                Approved Household Beneficiaries
              </h2>

              <span className="rounded-full bg-white/20 px-3 py-1 text-xl font-semibold text-white">
                {filteredRecords.length} of {approvedRecords.length}
              </span>
            </div>

            <div className="border-b border-[#EBD3D3] bg-[#FBF6F6] px-6 py-4">
              <div className="relative max-w-md">
                <Search
                  size={25}
                  className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400"
                />

                <input
                  type="search"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search household, purok or program..."
                  className="w-full rounded-xl border border-gray-300 bg-white py-2.5 pl-11 pr-4 text-xl text-gray-900 placeholder:text-gray-400 focus:border-[#6E2430] focus:outline-none focus:ring-4 focus:ring-[#6E2430]/15"
                />
              </div>
            </div>

            <div className="max-h-[560px] overflow-auto scrollbar-hide">
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
                {filteredRecords.map((record, index) => (
                  <tr
                    key={
                      record?.validation_id ??
                      `${getHouseholdId(record)}-${getProgramId(record)}-${index}`
                    }
                    className="border-t border-gray-100 transition hover:bg-[#FBF6F6]"
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#F8E9EB] text-lg font-bold text-[#6E2430]">
                          {initialsOf(record?.household_head_name)}
                        </span>

                        <span className="text-2xl font-semibold text-gray-900">
                          {record?.household_head_name || '—'}
                        </span>
                      </div>
                    </td>

                    <td className="px-4 py-3 text-2xl">
                      {record?.purok ? (
                        <span className="rounded-lg bg-gray-100 px-2.5 py-1 font-medium text-gray-700">
                          {record.purok}
                        </span>
                      ) : (
                        '—'
                      )}
                    </td>

                    <td className="px-4 py-3">
                      <span className="rounded-full bg-[#F8E9EB] px-3 py-1 text-xl font-medium text-[#6E2430]">
                        {getProgramName(record)}
                      </span>
                    </td>

                    <td className="px-4 py-3">
                      <LevelPill vulnerability={record?.vulnerability} />
                    </td>

                    <td className="whitespace-nowrap px-4 py-3 text-xl text-gray-700">
                      {formatDate(getApprovalDate(record))}
                    </td>

                    <td className="px-4 py-3">
                      <Status tone="success">Active</Status>
                    </td>
                  </tr>
                ))}

                {!filteredRecords.length && (
                  <tr>
                    <td colSpan={6} className="px-3 py-14 text-center">
                      <Inbox className="mx-auto h-9 w-9 text-gray-300" aria-hidden="true" />
                      <p className="mt-2 text-lg text-gray-500">
                        {approvedRecords.length
                          ? 'No beneficiaries match your search.'
                          : 'No approved beneficiaries yet.'}
                      </p>
                    </td>
                  </tr>
                )}
              </Table>
            </div>
          </section>
        </>
      )}
    </div>
  );
}