import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import { useAuth } from '../context/AuthContext';

import {
  Stat,
  Table,
  Status,
  Spinner,
} from '../components/ui';

import {
  Archive,
  ChartColumnIncreasing,
  Check,
  HeartHandshake,
  Newspaper,
  NotebookPen,
  UserRound,
} from 'lucide-react';

/* ==========================================================================
   TILE
========================================================================== */

function Tile({ to, title, desc, icon }) {
  return (
    <Link
      to={to}
      className="
        block
        rounded-lg
        border-l-4
        border-black
        bg-white
        p-5
        transition
        hover:border-brand
        hover:shadow-md
      "
    >
      <div className="mb-3 flex h-10 w-10 items-center justify-center rounded bg-[#E2BEBE] text-white">
        {icon}
      </div>

      <div className="text-xl font-bold text-ink">
        {title}
      </div>

      <div className="mt-1 text-lg text-muted-light">
        {desc}
      </div>
    </Link>
  );
}

/* ==========================================================================
   PROGRAM TEXT
========================================================================== */

function programsText(programs) {
  if (
    programs === null ||
    programs === undefined ||
    programs === ''
  ) {
    return '—';
  }

  if (Array.isArray(programs)) {
    return programs.length
      ? programs.join(', ')
      : '—';
  }

  if (typeof programs === 'string') {
    const value = programs.trim();

    if (!value) {
      return '—';
    }

    return value
      .replace(/^\{/, '')
      .replace(/\}$/, '')
      .replace(/"/g, '')
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean)
      .join(', ') || '—';
  }

  return String(programs);
}

/* ==========================================================================
   VULNERABILITY
========================================================================== */

function vulnerabilityTone(vulnerability) {
  if (!vulnerability) {
    return 'low';
  }

  const value = String(vulnerability)
    .trim()
    .toLowerCase();

  if (
    value.includes('high') ||
    value.includes('highly')
  ) {
    return 'high';
  }

  if (
    value.includes('moderate') ||
    value.includes('medium')
  ) {
    return 'medium';
  }

  return 'low';
}

function vulnerabilityLabel(vulnerability) {
  if (
    vulnerability === null ||
    vulnerability === undefined ||
    vulnerability === ''
  ) {
    return '—';
  }

  return (
    String(vulnerability)
      .replace(/\bvulnerable\b/gi, '')
      .trim() || '—'
  );
}

/* ==========================================================================
   ROLE
========================================================================== */

function getRole(user) {
  const rawRoles =
    user?.roles ??
    user?.role ??
    null;

  let role = null;

  if (Array.isArray(rawRoles)) {
    const first = rawRoles[0];

    if (typeof first === 'string') {
      role = first;
    } else if (
      first &&
      typeof first === 'object'
    ) {
      role =
        first.name ??
        first.role ??
        first.title ??
        null;
    }
  } else if (
    rawRoles &&
    typeof rawRoles === 'object'
  ) {
    role =
      rawRoles.name ??
      rawRoles.role ??
      rawRoles.title ??
      null;
  } else if (rawRoles) {
    role = String(rawRoles);
  }

  return role
    ? String(role)
        .trim()
        .toLowerCase()
    : null;
}

/* ==========================================================================
   HOUSEHOLD ID
========================================================================== */

function getHouseholdId(household, index) {
  return (
    household?.household_id ??
    household?.id ??
    household?.householdId ??
    `household-${index}`
  );
}

/* ==========================================================================
   DATE
========================================================================== */

function formatDate(value) {
  if (!value) {
    return '—';
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return '—';
  }

  return date.toLocaleDateString();
}

function getHouseholdDate(household) {
  return (
    household?.created_at ??
    household?.createdAt ??
    household?.date_created ??
    household?.visited_date ??
    household?.updated_at ??
    household?.updatedAt ??
    null
  );
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
   API RESPONSE HELPERS
========================================================================== */

function getHouseholds(response) {
  if (Array.isArray(response?.households)) {
    return response.households;
  }

  if (Array.isArray(response?.data)) {
    return response.data;
  }

  if (Array.isArray(response)) {
    return response;
  }

  return [];
}

function getUsers(response) {
  if (Array.isArray(response?.users)) {
    return response.users;
  }

  if (Array.isArray(response?.data)) {
    return response.data;
  }

  if (Array.isArray(response)) {
    return response;
  }

  return [];
}

function getHistory(response) {
  if (Array.isArray(response?.validation_records)) {
    return response.validation_records;
  }

  if (Array.isArray(response?.history)) {
    return response.history;
  }

  if (Array.isArray(response?.data)) {
    return response.data;
  }

  if (Array.isArray(response?.rows)) {
    return response.rows;
  }

  if (Array.isArray(response)) {
    return response;
  }

  return [];
}

/* ==========================================================================
   STATUS HELPERS
========================================================================== */

function getValidationStatus(household) {
  return String(
    household?.validation_status ??
    household?.status ??
    ''
  )
    .trim()
    .toLowerCase();
}

function isValidated(household) {
  return (
    getValidationStatus(household) ===
    'validated'
  );
}

function isApproved(household) {
  return (
    getValidationStatus(household) ===
    'approved'
  );
}

function isRejected(household) {
  return (
    getValidationStatus(household) ===
    'rejected'
  );
}

/* ==========================================================================
   PRIORITY
========================================================================== */

function isPriorityHousehold(household) {
  const priorityValue =
    household?.priority ??
    household?.is_priority ??
    household?.priority_status;

  if (priorityValue === true) {
    return true;
  }

  if (
    typeof priorityValue === 'string' &&
    [
      'yes',
      'true',
      'priority',
      'high',
      'highly vulnerable',
      'highly vulnerable household',
    ].includes(
      priorityValue
        .trim()
        .toLowerCase()
    )
  ) {
    return true;
  }

  const vulnerability = String(
    household?.vulnerability ?? ''
  )
    .trim()
    .toLowerCase();

  return (
    vulnerability.includes('high') ||
    vulnerability.includes('highly')
  );
}

/* ==========================================================================
   HISTORY STATUS
========================================================================== */

function isHistoryApproved(record) {
  return (
    String(
      record?.validation_status ??
      record?.status ??
      ''
    )
      .trim()
      .toLowerCase() === 'approved'
  );
}

function isHistoryRejected(record) {
  return (
    String(
      record?.validation_status ??
      record?.status ??
      ''
    )
      .trim()
      .toLowerCase() === 'rejected'
  );
}

/* ==========================================================================
   HISTORY DATE
========================================================================== */

function historyDate(record) {
  return (
    record?.approved_at ??
    record?.submitted_at ??
    record?.created_at ??
    null
  );
}

/* ==========================================================================
   ONLINE USER
========================================================================== */

function isUserOnline(user) {
  return (
    user?.is_online === true ||
    user?.online === true ||
    user?.isOnline === true ||
    String(
      user?.status ?? ''
    ).trim().toLowerCase() === 'online'
  );
}

/* ==========================================================================
   DASHBOARD
========================================================================== */

export default function Dashboard() {
  const { user } = useAuth();

  const role = getRole(user);

  const [summary, setSummary] = useState({});
  const [households, setHouseholds] = useState([]);
  const [users, setUsers] = useState([]);
  const [history, setHistory] = useState([]);

  const [
    householdsThisMonth,
    setHouseholdsThisMonth,
  ] = useState(0);

  const [
    approvedThisMonth,
    setApprovedThisMonth,
  ] = useState(0);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  /* ==========================================================================
     LOAD DASHBOARD
  ========================================================================== */

  useEffect(() => {
    let cancelled = false;

    async function loadDashboard() {
      if (!role) {
        setSummary({});
        setHouseholds([]);
        setUsers([]);
        setHistory([]);
        setHouseholdsThisMonth(0);
        setApprovedThisMonth(0);
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        setError('');

        const requests = [
          api.get('/analytics/summary'),
          api.get('/households'),
          api.get('/history/beneficiary-validation'),
        ];

        if (role === 'admin') {
          requests.push(
            api.get('/users')
          );
        }

        const results =
          await Promise.all(requests);

        if (cancelled) {
          return;
        }

        const summaryResponse =
          results[0] ?? {};

        const householdResponse =
          results[1] ?? {};

        const historyResponse =
          results[2] ?? {};

        /* ------------------------------------------------------
           SUMMARY
        ------------------------------------------------------ */

        const summaryData =
          summaryResponse?.summary ??
          summaryResponse?.data ??
          summaryResponse ??
          {};

        /* ------------------------------------------------------
           HOUSEHOLDS
        ------------------------------------------------------ */

        const householdData =
          getHouseholds(
            householdResponse
          );

        /* ------------------------------------------------------
           HISTORY
        ------------------------------------------------------ */

        const historyData =
          getHistory(
            historyResponse
          );

        console.log(
          'Dashboard summary:',
          summaryData
        );

        console.log(
          'Dashboard households:',
          householdData
        );

        console.log(
          'Dashboard validation history:',
          historyData
        );

        setSummary(summaryData);
        setHouseholds(householdData);
        setHistory(historyData);

        /* ------------------------------------------------------
           HOUSEHOLDS THIS MONTH
        ------------------------------------------------------ */

        const monthlyHouseholds =
          householdData.filter(
            (household) =>
              isThisMonth(
                getHouseholdDate(
                  household
                )
              )
          ).length;

        setHouseholdsThisMonth(
          monthlyHouseholds
        );

        /* ------------------------------------------------------
           APPROVED BENEFICIARIES THIS MONTH
        ------------------------------------------------------ */

        const monthlyApproved =
          historyData.filter(
            (record) =>
              isHistoryApproved(
                record
              ) &&
              isThisMonth(
                historyDate(record)
              )
          ).length;

        setApprovedThisMonth(
          monthlyApproved
        );

        /* ------------------------------------------------------
           ADMIN USERS
        ------------------------------------------------------ */

        if (role === 'admin') {
          setUsers(
            getUsers(
              results[3] ?? {}
            )
          );
        } else {
          setUsers([]);
        }
      } catch (e) {
        if (cancelled) {
          return;
        }

        console.error(
          'Dashboard data load error:',
          e
        );

        setError(
          e?.response?.data?.error ||
          e?.response?.data?.message ||
          e?.message ||
          'Failed to load dashboard data.'
        );
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    loadDashboard();

    return () => {
      cancelled = true;
    };
  }, [role]);

  /* ==========================================================================
     HOUSEHOLD GROUPS
  ========================================================================== */

  const validatedHouseholds =
    useMemo(
      () =>
        households.filter(
          isValidated
        ),
      [households]
    );

  const approvedHouseholds =
    useMemo(
      () =>
        households.filter(
          isApproved
        ),
      [households]
    );

  const rejectedHouseholds =
    useMemo(
      () =>
        households.filter(
          isRejected
        ),
      [households]
    );

  const priorityHouseholds =
    useMemo(
      () =>
        households.filter(
          isPriorityHousehold
        ),
      [households]
    );

  /* ==========================================================================
     BENEFICIARY VALIDATION HISTORY
  ========================================================================== */

  const approvedHistory =
    useMemo(
      () =>
        history.filter(
          isHistoryApproved
        ),
      [history]
    );

  const rejectedHistory =
    useMemo(
      () =>
        history.filter(
          isHistoryRejected
        ),
      [history]
    );

  /* ==========================================================================
     UNIQUE APPROVED HOUSEHOLDS
  ========================================================================== */

  const approvedHouseholdIds =
    useMemo(() => {
      return new Set(
        approvedHistory
          .map(
            (record) =>
              record?.household_id
          )
          .filter(Boolean)
          .map((id) =>
            String(id)
          )
      );
    }, [approvedHistory]);

  const rejectedHouseholdIds =
    useMemo(() => {
      return new Set(
        rejectedHistory
          .map(
            (record) =>
              record?.household_id
          )
          .filter(Boolean)
          .map((id) =>
            String(id)
          )
      );
    }, [rejectedHistory]);

  /* ==========================================================================
     CAPTAIN
  ========================================================================== */

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <Spinner />
      </div>
    );
  }

  if (!role) {
    return (
      <div className="p-6">
        <div
          role="alert"
          className="
            rounded-lg
            border
            border-red-200
            bg-red-50
            p-4
            text-red-700
          "
        >
          Unable to determine your dashboard role.
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6">
        <div
          role="alert"
          className="
            rounded-lg
            border
            border-red-200
            bg-red-50
            p-4
            text-red-700
          "
        >
          <div className="font-semibold">
            Unable to load dashboard
          </div>

          <div className="mt-1">
            {error}
          </div>
        </div>
      </div>
    );
  }

  /* ==========================================================================
     CAPTAIN DASHBOARD
  ========================================================================== */

  if (role === 'captain') {
    const pendingHouseholds =
      validatedHouseholds;

    const approvedCount =
      approvedHouseholdIds.size;

    const rejectedCount =
      rejectedHouseholdIds.size;

    const decidedCount =
      new Set([
        ...approvedHouseholdIds,
        ...rejectedHouseholdIds,
      ]).size;

    const approvalRate =
      decidedCount > 0
        ? Math.round(
            (approvedCount /
              decidedCount) *
              100
          )
        : 0;

    return (
      <div className="space-y-6 ">

        <h1 className="text-[32px] font-extrabold text-ink">
          <span className="mt-5 pt-5 block text-[25px] font-medium ">
            Overview
          </span>

          Captain Dashboard
        </h1>

        {/* STATS */}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">

          <Stat
            label="AWAITING REVIEW"
            value={pendingHouseholds.length}
            note="ML validated"
            noteTone="text-amber-soft"
          />

          <Stat
            label="APPROVED"
            value={approvedCount}
            note="Approved beneficiaries"
          />

          <Stat
            label="RETURNED"
            value={rejectedCount}
            note="For further review"
            noteTone="text-amber-soft"
          />

          <Stat
            label="APPROVAL RATE"
            value={`${approvalRate}%`}
            note="Of decided households"
          />

        </div>

        {/* ACTION TILES */}

        <div className="grid gap-4 md:grid-cols-2">

          <Tile
            to="/approve"
            icon={
              <Check
                className="text-black"
                strokeWidth={2}
              />
            }
            title="Approve Household Data"
            desc="Review ML-validated households and make the final Captain decision."
          />

          <Tile
            to="/analytics"
            icon={
              <ChartColumnIncreasing
                className="text-black"
                strokeWidth={2}
              />
            }
            title="View Analytics"
            desc="Explore household demographics and assistance distribution statistics."
          />

        </div>

        {/* APPROVAL QUEUE */}

        <div className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">

          <div className="bg-[#6E2430] px-6 py-4 text-xl font-extrabold text-white">
            ML-Validated Households Awaiting Approval
          </div>

          <div className="overflow-x-auto">

            <Table
              head={[
                'Household',
                'Purok',
                'Recommended Program',
                'Priority',
                'Status',
              ]}
            >
              {pendingHouseholds
                .slice(0, 10)
                .map((h, index) => (
                  <tr
                    key={getHouseholdId(
                      h,
                      index
                    )}
                  >

                    <td className="px-3 py-2">
                      {h?.household_head_name ||
                        '—'}
                    </td>

                    <td className="px-3 py-2">
                      {h?.purok || '—'}
                    </td>

                    <td className="px-3 py-2">
                      {programsText(
                        h?.suggested_programs
                      )}
                    </td>

                    <td className="px-3 py-2">
                      <Status
                        tone={vulnerabilityTone(
                          h?.vulnerability
                        )}
                      >
                        {vulnerabilityLabel(
                          h?.vulnerability
                        )}
                      </Status>
                    </td>

                    <td className="px-3 py-2">
                      <Status tone="await">
                        Validated
                      </Status>
                    </td>

                  </tr>
                ))}

              {!pendingHouseholds.length && (
                <tr>
                  <td
                    colSpan={5}
                    className="px-3 py-8 text-center text-gray-400"
                  >
                    No ML-validated households are
                    currently awaiting approval.
                  </td>
                </tr>
              )}
            </Table>

          </div>
        </div>

      </div>
    );
  }

  /* ==========================================================================
     STAFF DASHBOARD
  ========================================================================== */

  if (role === 'staff') {
    const recentHouseholds =
      [...households]
        .sort((a, b) => {
          const aDate =
            new Date(
              getHouseholdDate(a) || 0
            ).getTime();

          const bDate =
            new Date(
              getHouseholdDate(b) || 0
            ).getTime();

          return bDate - aDate;
        })
        .slice(0, 8);

    return (
      <div className="space-y-6">

        <h1 className="text-[32px] font-extrabold text-ink pt-5">
          <span className="mt-4 block text-[25px] font-medium">
            Overview
          </span>

          Staff Dashboard
        </h1>

        {/* STATS */}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">

          <Stat
            label="HOUSEHOLDS ENCODED"
            value={
              Number(
                summary?.total_households
              ) ||
              households.length
            }
            note="Total household records"
          />

          <Stat
            label="VALIDATED"
            value={
              validatedHouseholds.length
            }
            note="Ready for Captain"
          />

          <Stat
            label="APPROVED"
            value={
              approvedHouseholdIds.size
            }
            note="Approved beneficiaries"
          />

          <Stat
            label="RETURNED"
            value={
              rejectedHouseholdIds.size
            }
            note="Needs further review"
            noteTone="text-amber-soft"
          />

        </div>

        {/* ACTION TILES */}

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">

          <Tile
            to="/encode"
            icon={
              <NotebookPen
                className="text-black"
                strokeWidth={2}
              />
            }
            title="Encode Household"
            desc="Input household and residence information into the system."
          />

          <Tile
            to="/suggestions"
            icon={
              <HeartHandshake
                className="text-black"
                strokeWidth={2}
              />
            }
            title="Assistance Programs"
            desc="Track recommendation status for encoded households."
          />

          <Tile
            to="/update"
            icon={
              <Archive
                className="text-black"
                strokeWidth={2}
              />
            }
            title="Update Records"
            desc="Edit existing household and residence data."
          />

          <Tile
            to="/reports"
            icon={
              <Newspaper
                className="text-black"
                strokeWidth={2}
              />
            }
            title="Generate Reports"
            desc="View dashboards, assistance tracking, and summaries."
          />

        </div>

        {/* RECENT RECORDS */}

        <div className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">

          <div className="bg-[#6E2430] px-6 py-5 text-xl font-bold text-white">
            Recently Encoded Households
          </div>

          <div className="overflow-x-auto">

            <Table
              head={[
                'Household',
                'Purok',
                'Programs',
                'Date',
                'Status',
              ]}
            >
              {recentHouseholds.map(
                (h, index) => (
                  <tr
                    key={getHouseholdId(
                      h,
                      index
                    )}
                  >

                    <td className="px-3 py-2">
                      {h?.household_head_name ||
                        '—'}
                    </td>

                    <td className="px-3 py-2">
                      {h?.purok || '—'}
                    </td>

                    <td className="px-3 py-2">
                      {programsText(
                        h?.suggested_programs
                      )}
                    </td>

                    <td className="px-3 py-2">
                      {formatDate(
                        h?.visited_date ||
                        h?.created_at
                      )}
                    </td>

                    <td className="px-3 py-2">
                      <Status
                        tone={vulnerabilityTone(
                          h?.vulnerability
                        )}
                      >
                        {vulnerabilityLabel(
                          h?.vulnerability
                        )}
                      </Status>
                    </td>

                  </tr>
                )
              )}

              {!recentHouseholds.length && (
                <tr>
                  <td
                    colSpan={5}
                    className="px-3 py-8 text-center text-gray-400"
                  >
                    No households encoded yet.
                  </td>
                </tr>
              )}

            </Table>

          </div>
        </div>

      </div>
    );
  }

  /* ==========================================================================
     ADMIN DASHBOARD
  ========================================================================== */

  if (role === 'admin') {
    const pendingHouseholds =
      validatedHouseholds;

    const onlineAccounts =
      users.filter(
        isUserOnline
      ).length;

    const staffCount =
      users.filter(
        (account) => {
          const roles =
            account?.roles ??
            account?.role ??
            '';

          if (Array.isArray(roles)) {
            return roles.some(
              (item) =>
                String(
                  typeof item === 'object'
                    ? item?.name ??
                      item?.role ??
                      ''
                    : item
                )
                  .trim()
                  .toLowerCase() ===
                'staff'
            );
          }

          return String(roles)
            .trim()
            .toLowerCase()
            .includes('staff');
        }
      ).length;

    const totalHouseholds =
      Number(
        summary?.total_households
      ) || households.length;

    return (
      <div className="space-y-6">

        <h1 className="pt-5 mt-5 text-[32px] font-bold text-ink">
          Admin Dashboard
        </h1>

        {/* STATS */}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">

          <Stat
            label="TOTAL HOUSEHOLDS"
            value={Number(
              totalHouseholds
            ).toLocaleString()}
            note={`+ ${householdsThisMonth} this month`}
          />

          <Stat
            label="PRIORITY BENEFICIARIES"
            value={priorityHouseholds.length.toLocaleString()}
            note={`${pendingHouseholds.length} pending validation`}
            noteTone="text-amber-soft"
          />

          <Stat
            label="STAFF ACCOUNTS"
            value={staffCount}
            note={`${onlineAccounts} online accounts`}
          />

          <Stat
            label="APPROVED BENEFICIARIES"
            value={approvedHouseholdIds.size.toLocaleString()}
            note={`+ ${approvedThisMonth} this month`}
          />

        </div>

        {/* ACTION TILES */}

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">

          <Tile
            to="/users"
            icon={
              <UserRound
                className="text-black"
                strokeWidth={2}
              />
            }
            title="User Accounts"
            desc="Create, update, and remove staff accounts."
          />

          <Tile
            to="/programs"
            icon={
              <HeartHandshake
                className="text-black"
                strokeWidth={2}
              />
            }
            title="Assistance"
            desc="Manage automatically generated assistance recommendations."
          />

          <Tile
            to="/validation"
            icon={
              <Check
                className="text-black"
                strokeWidth={2}
              />
            }
            title="Approval Beneficiaries"
            desc="Review ML-validated households and Captain decisions."
          />

          <Tile
            to="/analytics"
            icon={
              <ChartColumnIncreasing
                className="text-black"
                strokeWidth={2}
              />
            }
            title="Analytics"
            desc="Explore demographics and assistance distribution trends."
          />

        </div>

        {/* ADMIN TABLES */}

        <div className="grid gap-5 md:grid-cols-2">

          {/* PENDING */}

          <div className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">

            <div className="flex items-center justify-between bg-maroon px-5 py-3">

              <span className="text-lg font-extrabold text-white">
                Priority Beneficiaries — Pending Approval
              </span>

              <Link
                to="/validation"
                className="text-xl font-semibold text-success-light hover:underline"
              >
                View All
              </Link>

            </div>

            <div className="overflow-x-auto">

              <Table
                head={[
                  'Household',
                  'Purok',
                  'Program',
                  'Priority',
                  'Status',
                ]}
              >
                {pendingHouseholds
                  .slice(0, 6)
                  .map((h, index) => (
                    <tr
                      key={getHouseholdId(
                        h,
                        index
                      )}
                    >

                      <td className="px-3 py-2 font-semibold">
                        {h?.household_head_name ||
                          '—'}
                      </td>

                      <td className="px-3 py-2 font-semibold">
                        {h?.purok || '—'}
                      </td>

                      <td className="px-3 py-2 font-semibold">
                        {programsText(
                          h?.suggested_programs
                        )}
                      </td>

                      <td className="px-3 py-2">
                        <Status
                          tone={vulnerabilityTone(
                            h?.vulnerability
                          )}
                        >
                          {vulnerabilityLabel(
                            h?.vulnerability
                          )}
                        </Status>
                      </td>

                      <td className="px-3 py-2">
                        <Status tone="await">
                          Pending
                        </Status>
                      </td>

                    </tr>
                  ))}

                {!pendingHouseholds.length && (
                  <tr>
                    <td
                      colSpan={5}
                      className="px-3 py-6 text-center text-gray-400"
                    >
                      No priority beneficiaries
                      are awaiting approval.
                    </td>
                  </tr>
                )}

              </Table>

            </div>
          </div>

          {/* APPROVED */}

          <div className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">

            <div className="flex items-center justify-between bg-maroon px-5 py-3">

              <span className="text-lg font-extrabold text-white">
                Approved Household Beneficiaries
              </span>

              <Link
                to="/reports"
                className="text-xl font-semibold text-success-light hover:underline"
              >
                Generate Report
              </Link>

            </div>

            <div className="overflow-x-auto">

              <Table
                head={[
                  'Household',
                  'Purok',
                  'Program',
                  'Date',
                  'Status',
                ]}
              >
                {approvedHistory
                  .slice(0, 6)
                  .map(
                    (
                      record,
                      index
                    ) => (
                      <tr
                        key={
                          record?.validation_id ??
                          `${record?.household_id}-${record?.program_id}-${index}`
                        }
                      >

                        <td className="px-3 py-2">
                          {record?.household_head_name ||
                            '—'}
                        </td>

                        <td className="px-3 py-2">
                          {record?.purok ||
                            '—'}
                        </td>

                        <td className="px-3 py-2">
                          {record?.program_name ||
                            '—'}
                        </td>

                        <td className="px-3 py-2">
                          {formatDate(
                            record?.approved_at ||
                            record?.submitted_at
                          )}
                        </td>

                        <td className="px-3 py-2">
                          <Status tone="success">
                            Approved
                          </Status>
                        </td>

                      </tr>
                    )
                  )}

                {!approvedHistory.length && (
                  <tr>
                    <td
                      colSpan={5}
                      className="px-3 py-6 text-center text-gray-400"
                    >
                      No approved beneficiaries
                      yet.
                    </td>
                  </tr>
                )}

              </Table>

            </div>
          </div>

        </div>
      </div>
    );
  }

  /* ==========================================================================
     UNKNOWN ROLE
  ========================================================================== */

  return (
    <div className="p-6">
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
        Unauthorized dashboard role:{' '}
        {String(role)}
      </div>
    </div>
  );
}
