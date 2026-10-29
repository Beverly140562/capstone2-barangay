
import { useCallback, useEffect, useMemo, useState } from 'react';
import toast, { Toaster } from 'react-hot-toast';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api';

import {
  PageHeader,
  Band,
  Badge,
  Spinner,
  Button,
  Input,
} from '../components/ui';

/* ======================================================
   HELPERS
====================================================== */

const getRows = (data) => {
  if (Array.isArray(data)) return data;
  if (!data || typeof data !== 'object') return [];

  for (const key of [
    'programs',
    'households',
    'distributions',
    'rows',
    'results',
  ]) {
    if (Array.isArray(data[key])) return data[key];
  }

  return data.data && data.data !== data ? getRows(data.data) : [];
};

const householdId = (row) =>
  row?.household_id ?? row?.id ?? '';

const householdName = (row) =>
  row?.household_head_name ??
  row?.household_name ??
  row?.head_name ??
  row?.name ??
  'Unnamed household';

const householdPurok = (row) =>
  row?.purok ?? row?.purok_number ?? row?.purok_name ?? '—';

const distributionId = (row) =>
  row?.distribution_id ?? row?.id ?? '';

const amountOf = (row) =>
  row?.amount_released ?? row?.amount ?? null;

const isReleased = (row) =>
  String(row?.release_status ?? '').trim().toLowerCase() === 'released';

const hasValidAmount = (row) => {
  const amount = amountOf(row);

  return (
    amount !== null &&
    amount !== undefined &&
    amount !== '' &&
    Number.isFinite(Number(amount)) &&
    Number(amount) > 0
  );
};

const canConfirmReceipt = (row) =>
  String(row?.status ?? '').trim().toLowerCase() === 'approved' &&
  !isReleased(row) &&
  hasValidAmount(row);

const formatAmount = (value) => {
  if (value === null || value === undefined || value === '') {
    return '—';
  }

  const number = Number(value);

  if (!Number.isFinite(number)) return '—';

  return `₱${number.toLocaleString('en-PH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
};

const formatDate = (value) => {
  if (!value) return '—';

  const date =
    typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
      ? new Date(`${value}T00:00:00`)
      : new Date(value);

  if (Number.isNaN(date.getTime())) return String(value);

  return date.toLocaleDateString('en-PH', {
    month: 'short',
    day: '2-digit',
    year: 'numeric',
  });
};

const todayISO = () => {
  const now = new Date();
  const pad = (number) => String(number).padStart(2, '0');

  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(
    now.getDate()
  )}`;
};

const currentMonth = () => todayISO().slice(0, 7);

const validDateOnly = (value) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value || '')) return false;

  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));

  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
};

const monthStart = (month) => `${month}-01`;

const monthEnd = (month) => {
  const match = /^(\d{4})-(\d{2})$/.exec(month || '');

  if (!match) return '';

  const year = Number(match[1]);
  const monthNumber = Number(match[2]);

  if (monthNumber < 1 || monthNumber > 12) return '';

  const lastDay = new Date(
    Date.UTC(year, monthNumber, 0)
  ).getUTCDate();

  return `${month}-${String(lastDay).padStart(2, '0')}`;
};

const programIdentifier = (program) =>
  String(program?.program_id ?? program?.id ?? '');

const distributionQuery = (programId, period) => {
  const params = new URLSearchParams();

  params.set('program_id', String(programId));

  if (period) {
    params.set('period_start', period.period_start);
    params.set('period_end', period.period_end);
  }

  return `/distributions?${params.toString()}`;
};

/* ======================================================
   COMPONENT
====================================================== */

function DistributionProgram() {
  const [loading, setLoading] = useState(true);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [busy, setBusy] = useState('');

  const [programs, setPrograms] = useState([]);
  const [programStats, setProgramStats] = useState({});
  const [programId, setProgramId] = useState('');

  const [approved, setApproved] = useState([]);
  const [distributions, setDistributions] = useState([]);

  const [selectedHouseholds, setSelectedHouseholds] = useState([]);
  const [amounts, setAmounts] = useState({});
  const [bulkAmount, setBulkAmount] = useState('');

  const [receivedIds, setReceivedIds] = useState([]);
  const [releaseDate, setReleaseDate] = useState(todayISO());

  const navigate = useNavigate();


  /* ---------------- PERIOD SETTINGS ---------------- */

  const initialMonth = currentMonth();

  const [periodType, setPeriodType] = useState('month');
  const [periodMonth, setPeriodMonth] = useState(initialMonth);
  const [customStart, setCustomStart] = useState(
    monthStart(initialMonth)
  );
  const [customEnd, setCustomEnd] = useState(
    monthEnd(initialMonth)
  );

  const [periodLoaded, setPeriodLoaded] = useState(false);

  const activePeriod = useMemo(() => {
    if (periodType === 'month') {
      if (!/^\d{4}-\d{2}$/.test(periodMonth)) return null;

      const start = monthStart(periodMonth);
      const end = monthEnd(periodMonth);

      if (!validDateOnly(start) || !validDateOnly(end)) {
        return null;
      }

      return {
        period_start: start,
        period_end: end,
      };
    }

    if (
      !validDateOnly(customStart) ||
      !validDateOnly(customEnd) ||
      customEnd < customStart
    ) {
      return null;
    }

    return {
      period_start: customStart,
      period_end: customEnd,
    };
  }, [periodType, periodMonth, customStart, customEnd]);

  const periodQuery = useMemo(() => {
    if (!activePeriod) return '';

    return (
      `period_start=${encodeURIComponent(activePeriod.period_start)}` +
      `&period_end=${encodeURIComponent(activePeriod.period_end)}`
    );
  }, [activePeriod]);

  const periodLabel = useMemo(() => {
    if (!activePeriod) return 'Invalid date range';

    return `${formatDate(activePeriod.period_start)} – ${formatDate(
      activePeriod.period_end
    )}`;
  }, [activePeriod]);

  const selectedProgram = useMemo(
    () =>
      programs.find(
        (program) => programIdentifier(program) === String(programId)
      ),
    [programs, programId]
  );

  const selectedProgramName =
    selectedProgram?.program_name ??
    selectedProgram?.name ??
    selectedProgram?.title ??
    'Assistance Program';

  /* ======================================================
     LOAD PROGRAMS AND PERIOD-SPECIFIC STATISTICS
  ====================================================== */

  const loadBase = useCallback(async () => {

    try {
      const response = await api.get('/programs');
      const rows = getRows(response);

      setPrograms(rows);

      // Automatically select Rice Subsidy Program when available.
      setProgramId((current) => {
        if (current && rows.some(
          (program) => programIdentifier(program) === String(current)
        )) {
          return current;
        }

        const riceProgram = rows.find((program) =>
          String(
            program.program_name ??
            program.name ??
            program.title ??
            ''
          )
            .trim()
            .toLowerCase()
            .includes('rice subsidy program')
        );

        const defaultProgram = riceProgram ?? rows[0];

        return defaultProgram ? programIdentifier(defaultProgram) : '';
      });

      const statsEntries = await Promise.all(
        rows.map(async (program) => {
          const id = programIdentifier(program);

          if (!id) return [null, null];

          try {
            const approvedRequest = api.get(
              `/distributions/approved?program_id=${encodeURIComponent(id)}`
            );

            const distributionRequest = activePeriod
              ? api.get(distributionQuery(id, activePeriod))
              : Promise.resolve({ distributions: [] });

            const [approvedResponse, distributionResponse] =
              await Promise.all([
                approvedRequest,
                distributionRequest,
              ]);

            const approvedRows = getRows(approvedResponse);
            const distributionRows = getRows(distributionResponse);

            const approvedMap = new Map();

            approvedRows.forEach((row) => {
              const idValue = householdId(row);

              if (
                !idValue ||
                String(row.validation_status ?? '')
                  .trim()
                  .toLowerCase() !== 'approved'
              ) {
                return;
              }

              approvedMap.set(String(idValue), row);
            });

            const distributionByHousehold = new Map();

            distributionRows.forEach((row) => {
              const idValue = householdId(row);

              if (!idValue) return;

              const key = String(idValue);
              const existing = distributionByHousehold.get(key);

              // Prefer a valid amount over an empty duplicate.
              if (!existing || hasValidAmount(row)) {
                distributionByHousehold.set(key, row);
              }
            });

            const uniqueDistributions = [
              ...distributionByHousehold.values(),
            ];

            const awaitingAmount = [...approvedMap.keys()].filter(
              (householdKey) => {
                const record = distributionByHousehold.get(householdKey);

                return !record || !hasValidAmount(record);
              }
            ).length;

            return [
              id,
              {
                approved: approvedMap.size,
                awaitingAmount,
                assigned: uniqueDistributions.filter(hasValidAmount).length,
                pending: uniqueDistributions.filter(canConfirmReceipt).length,
                released: uniqueDistributions.filter(isReleased).length,
                error: false,
              },
            ];
          } catch (error) {
            console.error(
              `Failed to load statistics for program ${id}:`,
              error
            );

            return [
              id,
              {
                approved: 0,
                awaitingAmount: 0,
                assigned: 0,
                pending: 0,
                released: 0,
                error: true,
              },
            ];
          }
        })
      );

      setProgramStats(
        Object.fromEntries(
          statsEntries.filter(([id]) => id !== null)
        )
      );
    } catch (error) {
      console.error('Load programs failed:', error);
      toast.error(error?.message || 'Failed to load assistance programs.');
      setPrograms([]);
      setProgramStats({});
    } finally {
      setLoading(false);
    }
  }, [activePeriod]);

  /* ======================================================
     LOAD SELECTED PROGRAM DATA FOR THE CURRENT PERIOD
  ====================================================== */

  const loadProgramData = useCallback(async (id) => {
    if (!id || !activePeriod) {
      setApproved([]);
      setDistributions([]);
      return;
    }

    setDetailsLoading(true);

    try {
      const [approvedResponse, distributionResponse] = await Promise.all([
        api.get(
          `/distributions/approved?program_id=${encodeURIComponent(id)}`
        ),
        api.get(distributionQuery(id, activePeriod)),
      ]);

      setApproved(getRows(approvedResponse));
      setDistributions(getRows(distributionResponse));
    } catch (error) {
      console.error('Load selected program failed:', error);
      setApproved([]);
      setDistributions([]);
      toast.error(
        error?.message || 'Failed to load program beneficiaries.'
      );
    } finally {
      setDetailsLoading(false);
    }
  }, [activePeriod]);

  useEffect(() => {
    loadBase();
  }, [loadBase]);

  // Reset the loaded-period confirmation when program or period changes.
  useEffect(() => {
    setPeriodLoaded(false);
    setSelectedHouseholds([]);
    setAmounts({});
    setBulkAmount('');
    setReceivedIds([]);
  }, [programId, periodQuery]);

  useEffect(() => {
    setApproved([]);
    setDistributions([]);

    if (programId && activePeriod) {
      loadProgramData(programId);
    }
  }, [programId, periodQuery, loadProgramData]);

  /* ======================================================
     FILTER CAPTAIN-APPROVED HOUSEHOLDS
  ====================================================== */

  const approvedForProgram = useMemo(() => {
    if (!programId) return [];

    const seen = new Set();

    return approved.filter((row) => {
      const id = householdId(row);

      if (!id) return false;

      if (
        row.program_id &&
        String(row.program_id) !== String(programId)
      ) {
        return false;
      }

      const status = String(
        row.validation_status ?? row.approval_status ?? ''
      )
        .trim()
        .toLowerCase();

      if (status !== 'approved') return false;

      const key = String(id);

      if (seen.has(key)) return false;

      seen.add(key);
      return true;
    });
  }, [approved, programId]);

  /* ======================================================
     HOUSEHOLDS WITHOUT A VALID AMOUNT IN THIS PERIOD
  ====================================================== */

  const distributionByHousehold = useMemo(() => {
    const map = new Map();

    distributions.forEach((row) => {
      const id = householdId(row);

      if (!id) return;

      const key = String(id);
      const existing = map.get(key);

      if (!existing || hasValidAmount(row)) {
        map.set(key, row);
      }
    });

    return map;
  }, [distributions]);

  const assignable = useMemo(() => {
    return approvedForProgram.filter((household) => {
      const id = String(householdId(household));
      const existing = distributionByHousehold.get(id);

      // Already received in the selected period: do not offer again.
      if (existing && isReleased(existing)) return false;

      return !existing || !hasValidAmount(existing);
    });
  }, [approvedForProgram, distributionByHousehold]);

  const pending = useMemo(
    () => distributions.filter(canConfirmReceipt),
    [distributions]
  );

  const released = useMemo(
    () => distributions.filter(isReleased),
    [distributions]
  );

  /* ======================================================
     LOAD PERIOD: CREATE MISSING DISTRIBUTION ROWS
  ====================================================== */

  const loadDistributionPeriod = async () => {
    if (!programId) {
      toast.error('Please select an assistance program.');
      return;
    }

    if (!activePeriod) {
      toast.error('Select a valid month or date range.');
      return;
    }

    if (busy) return;

    setBusy('load');

    try {
      const result = await api.post('/distributions/load-period', {
        program_id: programId,
        period_start: activePeriod.period_start,
        period_end: activePeriod.period_end,
      });

      setPeriodLoaded(true);
      setSelectedHouseholds([]);
      setAmounts({});
      setBulkAmount('');
      setReceivedIds([]);

      const created = Number(result?.created ?? 0);
      const total = Number(result?.total ?? 0);

      toast.success(
        `Period loaded. ${created} new record(s) created; ${total} household distribution(s) found.`
      );

      await Promise.all([
        loadProgramData(programId),
        loadBase(),
      ]);
    } catch (error) {
      console.error('Load distribution period failed:', error);
      toast.error(
        error?.message || 'Failed to load the selected distribution period.'
      );
    } finally {
      setBusy('');
    }
  };

  /* ======================================================
     SELECTION AND AMOUNTS
  ====================================================== */

  const toggleHousehold = (id) => {
    const key = String(id);

    setSelectedHouseholds((current) =>
      current.includes(key)
        ? current.filter((value) => value !== key)
        : [...current, key]
    );
  };

  const allAssignableSelected =
    assignable.length > 0 &&
    assignable.every((row) =>
      selectedHouseholds.includes(String(householdId(row)))
    );

  const toggleAllAssignable = () => {
    setSelectedHouseholds(
      allAssignableSelected
        ? []
        : assignable.map((row) => String(householdId(row)))
    );
  };

  const applyBulkAmount = () => {
    if (!periodLoaded) {
      toast.error('Load the distribution period first.');
      return;
    }

    if (!selectedHouseholds.length) {
      toast.error('Select at least one household first.');
      return;
    }

    if (
      bulkAmount.trim() === '' ||
      !Number.isFinite(Number(bulkAmount)) ||
      Number(bulkAmount) <= 0
    ) {
      toast.error('Enter an amount greater than zero.');
      return;
    }

    setAmounts((current) => {
      const next = { ...current };

      selectedHouseholds.forEach((id) => {
        next[id] = bulkAmount;
      });

      return next;
    });

    toast.success('Amount applied to selected households.');
  };

  /* ======================================================
     SAVE AMOUNTS FOR THE SELECTED PERIOD
  ====================================================== */

  const saveDistribution = async () => {
    if (!programId) {
      toast.error('Please select an assistance program.');
      return;
    }

    if (!periodLoaded || !activePeriod) {
      toast.error('Load the distribution period first.');
      return;
    }

    if (!selectedHouseholds.length) {
      toast.error('Select at least one approved household.');
      return;
    }

    const assignableIds = new Set(
      assignable.map((row) => String(householdId(row)))
    );

    const items = selectedHouseholds.map((id) => ({
      household_id: id,
      amount: Number(amounts[id] ?? 0),
    }));

    if (items.some((item) => !assignableIds.has(item.household_id))) {
      toast.error(
        'Some selected households are no longer eligible for amount entry. Refresh and try again.'
      );
      setSelectedHouseholds([]);
      await loadProgramData(programId);
      return;
    }

    if (
      items.some(
        (item) =>
          !item.household_id ||
          !Number.isFinite(item.amount) ||
          item.amount <= 0
      )
    ) {
      toast.error(
        'Every selected household must have an amount greater than zero.'
      );
      return;
    }

    if (busy) return;

    setBusy('save');

    try {
      await api.post('/distributions/bulk', {
        program_id: programId,
        period_start: activePeriod.period_start,
        period_end: activePeriod.period_end,
        items,
      });

      toast.success(`Saved amounts for ${items.length} household(s).`);

      setSelectedHouseholds([]);
      setAmounts({});
      setBulkAmount('');

      await Promise.all([
        loadProgramData(programId),
        loadBase(),
      ]);
    } catch (error) {
      console.error('Save distribution failed:', error);
      toast.error(
        error?.message || 'Failed to save distribution amounts.'
      );
    } finally {
      setBusy('');
    }
  };

  /* ======================================================
     RELEASE / CONFIRM ACTUAL RECEIPT
  ====================================================== */

  const toggleReceived = (id) => {
    const key = String(id);

    setReceivedIds((current) =>
      current.includes(key)
        ? current.filter((value) => value !== key)
        : [...current, key]
    );
  };

  const allPendingChecked =
    pending.length > 0 &&
    pending.every((row) =>
      receivedIds.includes(String(distributionId(row)))
    );

  const toggleAllPending = () => {
    setReceivedIds(
      allPendingChecked
        ? []
        : pending.map(distributionId).filter(Boolean).map(String)
    );
  };

  const markReleased = async () => {
    if (!periodLoaded || !activePeriod) {
      toast.error('Load the distribution period first.');
      return;
    }

    if (!receivedIds.length) {
      toast.error('Select at least one eligible distribution.');
      return;
    }

    if (!validDateOnly(releaseDate)) {
      toast.error('Please select a valid receipt date.');
      return;
    }

    if (releaseDate > todayISO()) {
      toast.error('Receipt date cannot be in the future.');
      return;
    }

    const eligibleIds = new Set(
      pending.map((row) => String(distributionId(row)))
    );

    if (receivedIds.some((id) => !eligibleIds.has(id))) {
      toast.error(
        'Some selected distributions are no longer eligible. Refresh and try again.'
      );

      setReceivedIds([]);
      await loadProgramData(programId);
      return;
    }

    if (busy) return;

    setBusy('release');

    try {
      await api.post('/distributions/release', {
        distribution_ids: receivedIds,
        release_date: releaseDate,
        period_start: activePeriod.period_start,
        period_end: activePeriod.period_end,
      });

      toast.success('Selected assistance receipt recorded.');
      setReceivedIds([]);

      await Promise.all([
        loadProgramData(programId),
        loadBase(),
      ]);
    } catch (error) {
      console.error('Release distribution failed:', error);
      toast.error(
        error?.message || 'Failed to record assistance receipt.'
      );
    } finally {
      setBusy('');
    }
  };

  /* ======================================================
     RENDER
  ====================================================== */

  if (loading) return <Spinner />;

  const th = 'px-4 py-3 text-left text-xl font-bold text-[#6E2430]';
  const td = 'px-4 py-3 text-xl font-medium';

  return (
    <div className="space-y-6 mt-5 ">
      <Toaster
        position="top-right"
        toastOptions={{ duration: 3000 }}
      />

      <PageHeader
        title="Releasing Programs"
        subtitle="Select a program and distribution period, load approved households, assign amounts, and record actual receipt."
      />

      <button type="button" onClick={() => navigate('/history')}
        className="w-fit rounded-lg bg-[#6E2430] px-4 py-2 font-medium text-2xl text-white transition hover:bg-[#581c26]">
  ← Back to History
</button>

      {/* PROGRAM CARDS */}

      <Band title={`Assistance Programs (${programs.length})`}>
        {!programs.length ? (
          <p className="py-8 text-center text-gray-500">
            No assistance programs were found.
          </p>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {programs.map((item) => {
              const id = programIdentifier(item);
              const stats = programStats[id] ?? {};
              const active = id === String(programId);

              const name =
                item.program_name ??
                item.name ??
                item.title ??
                'Unnamed Program';

              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => setProgramId(id)}
                  className={`rounded-xl border p-5 text-left transition hover:-translate-y-0.5 hover:shadow-md ${
                    active
                      ? 'border-[#6E2430] bg-[#FFF0F0] ring-2 ring-[#6E2430]/20'
                      : 'border-gray-200 bg-white hover:border-[#6E2430]/50'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-[#6E2430] text-xl text-white">
                      ₱
                    </div>

                    {active && (
                      <span className="rounded-full bg-[#6E2430] px-3 py-1 text-lg font-bold text-white">
                        Selected
                      </span>
                    )}
                  </div>

                  <h3 className="mt-4 text-xl text-base font-bold text-[#6E2430]">
                    {name}
                  </h3>

                  {item.description && (
                    <p className="mt-1 line-clamp-2 text-lg text-gray-600">
                      {item.description}
                    </p>
                  )}

                  <div className="mt-4 grid grid-cols-2 gap-3">
                    <div className="rounded-lg bg-gray-50 p-3">
                      <p className="text-xl text-gray-500">Approved</p>
                      <p className="mt-1 text-2xl font-bold text-gray-800">
                        {stats.error ? '—' : stats.approved ?? '—'}
                      </p>
                    </div>

                    <div className="rounded-lg bg-gray-50 p-3">
                      <p className="text-xl text-gray-500">Awaiting Amount</p>
                      <p className="mt-1 text-2xl font-bold text-gray-800">
                        {stats.error
                          ? '—'
                          : stats.awaitingAmount ?? '—'}
                      </p>
                    </div>

                    <div className="rounded-lg bg-amber-50 p-3">
                      <p className="text-xl text-amber-700">
                        Awaiting Receipt
                      </p>
                      <p className="mt-1 text-2xl font-bold text-amber-800">
                        {stats.error ? '—' : stats.pending ?? '—'}
                      </p>
                    </div>

                    <div className="rounded-lg bg-green-50 p-3">
                      <p className="text-xl text-green-700">Released</p>
                      <p className="mt-1 text-2xl font-bold text-green-800">
                        {stats.error ? '—' : stats.released ?? '—'}
                      </p>
                    </div>
                  </div>

                  <p className="mt-4 text-sm font-bold text-[#6E2430]">
                    Open program →
                  </p>
                </button>
              );
            })}
          </div>
        )}
      </Band>

      {/* SELECTED PROGRAM */}

      {programId && (
        <>
          <div className="rounded-xl border border-[#E2BEBE] bg-[#FFF8F8] p-5">
            <h2 className="text-lg font-bold text-[#6E2430]">
              {selectedProgramName}
            </h2>

            <p className="mt-1 text-xl text-gray-600">
              {approvedForProgram.length} approved household(s) ·{' '}
              {assignable.length} awaiting amount ·{' '}
              {pending.length} awaiting receipt ·{' '}
              {released.length} released
            </p>
          </div>

          {/* DISTRIBUTION PERIOD */}

          <Band title="Distribution Period">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div>
                <label
                  htmlFor="period-type"
                  className="mb-1 block text-xl font-semibold text-gray-700"
                >
                  PERIOD TYPE
                </label>

                <select
                  id="period-type"
                  value={periodType}
                  onChange={(event) => {
                    setPeriodType(event.target.value);
                    setPeriodLoaded(false);
                    setSelectedHouseholds([]);
                    setAmounts({});
                    setReceivedIds([]);
                  }}
                  className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-xl"
                >
                  <option value="month">Monthly Distribution</option>
                  <option value="custom">Custom Date Range</option>
                </select>
              </div>

              {periodType === 'month' ? (
                <div>
                  <label
                    htmlFor="period-month"
                    className="mb-1 block text-xl font-semibold text-gray-700"
                  >
                    SELECT MONTH
                  </label>

                  <input
                    id="period-month"
                    type="month"
                    value={periodMonth}
                    onChange={(event) => {
                      setPeriodMonth(event.target.value);
                      setPeriodLoaded(false);
                      setSelectedHouseholds([]);
                      setAmounts({});
                      setReceivedIds([]);
                    }}
                    className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-xl"
                  />
                </div>
              ) : (
                <>
                  <div>
                    <label
                      htmlFor="period-start"
                      className="mb-1 block text-xl font-semibold text-gray-700"
                    >
                      START DATE
                    </label>

                    <input
                      id="period-start"
                      type="date"
                      value={customStart}
                      onChange={(event) => {
                        setCustomStart(event.target.value);
                        setPeriodLoaded(false);
                        setSelectedHouseholds([]);
                        setAmounts({});
                        setReceivedIds([]);
                      }}
                      className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-xl"
                    />
                  </div>

                  <div>
                    <label
                      htmlFor="period-end"
                      className="mb-1 block text-xl font-semibold text-gray-700"
                    >
                      END DATE
                    </label>

                    <input
                      id="period-end"
                      type="date"
                      min={customStart || undefined}
                      value={customEnd}
                      onChange={(event) => {
                        setCustomEnd(event.target.value);
                        setPeriodLoaded(false);
                        setSelectedHouseholds([]);
                        setAmounts({});
                        setReceivedIds([]);
                      }}
                      className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-xl"
                    />
                  </div>
                </>
              )}
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-3">
              <Button
                type="button"
                variant="maroon"
                onClick={loadDistributionPeriod}
                disabled={!activePeriod || Boolean(busy)}
              >
                {busy === 'load'
                  ? 'Loading Households…'
                  : 'Load Approved Households'}
              </Button>

              <p className="text-xl text-gray-600">
                Selected period: <strong>{periodLabel}</strong>
              </p>
            </div>

            {periodLoaded ? (
              <p className="mt-3 text-lg font-medium text-green-700">
                Distribution period loaded. You can enter missing amounts
                and confirm actual receipt for this period.
              </p>
            ) : (
              <p className="mt-3 text-lg text-amber-700">
                Load the selected period before entering amounts or recording
                receipt.
              </p>
            )}

            {!activePeriod && (
              <p className="mt-2 text-sm text-red-600">
                Select a valid month or ensure the custom end date is not
                earlier than the start date.
              </p>
            )}
          </Band>

          {detailsLoading ? (
            <Spinner />
          ) : !periodLoaded ? (
            <Band title="Distribution Not Loaded">
              <p className="py-6 text-center text-sm text-gray-600">
                Choose the month or custom date range, then click{' '}
                <strong>Load Approved Households</strong>. The system will
                create missing records for the selected period without
                duplicating records that already exist for that exact period.
              </p>
            </Band>
          ) : (
            <>
              {/* ASSIGN AMOUNTS */}

              <Band
                title={`1. Assign Amount (${selectedHouseholds.length} selected)`}
              >
                {!assignable.length ? (
                  <p className="py-6 text-center text-xl text-gray-500">
                    {approvedForProgram.length === 0
                      ? 'No Captain-approved households were found for this program.'
                      : 'All approved households already have a saved amount or have received this assistance for the selected period.'}
                  </p>
                ) : (
                  <>
                    <div className="mb-4 flex flex-wrap items-end gap-3">
                      <Button
                        type="button"
                        variant="maroon"
                        onClick={toggleAllAssignable}
                        disabled={Boolean(busy)}
                      >
                        {allAssignableSelected
                          ? 'Clear Selection'
                          : 'Select All'}
                      </Button>

                      <div className="w-56">
                        <Input
                          label="SAME AMOUNT"
                          type="number"
                          min="0.01"
                          step="0.01"
                          value={bulkAmount}
                          onChange={(event) =>
                            setBulkAmount(event.target.value)
                          }
                        />
                      </div>

                      <Button 
                        type="button"
                        variant="maroon"
                        onClick={applyBulkAmount}
                        disabled={Boolean(busy)}
                      >
                        Apply Amount
                      </Button>

                      <Button
                        type="button"
                        variant="maroon"
                        onClick={saveDistribution}
                        disabled={
                          Boolean(busy) || !selectedHouseholds.length
                        }
                      >
                        {busy === 'save' ? 'Saving…' : 'Save Amounts'}
                      </Button>
                    </div>

                    <div className="max-h-[500px] overflow-auto rounded-lg border">
                      <table className="w-full">
                        <thead className="sticky top-0 z-10 bg-[#FFD7D7]">
                          <tr>
                            <th className={th}>Select</th>
                            <th className={th}>Household Head</th>
                            <th className={th}>Purok</th>
                            <th className={th}>Vulnerability</th>
                            <th className={th}>Amount (₱)</th>
                          </tr>
                        </thead>

                        <tbody>
                          {assignable.map((row) => {
                            const id = String(householdId(row));
                            const selected =
                              selectedHouseholds.includes(id);

                            return (
                              <tr
                                key={id}
                                className={`border-t ${
                                  selected ? 'bg-[#FFF0F0]' : ''
                                }`}
                              >
                                <td className={td}>
                                  <input
                                    type="checkbox"
                                    className="h-5 w-5 accent-[#6E2430]"
                                    checked={selected}
                                    disabled={Boolean(busy)}
                                    onChange={() => toggleHousehold(id)}
                                  />
                                </td>

                                <td className={td}>
                                  {householdName(row)}
                                </td>

                                <td className={td}>
                                  {householdPurok(row)}
                                </td>

                                <td className={td}>
                                  {row.vulnerability ?? '—'}
                                </td>

                                <td className={td}>
                                  <input
                                    type="number"
                                    min="0.01"
                                    step="0.01"
                                    placeholder="Enter amount"
                                    value={amounts[id] ?? ''}
                                    disabled={Boolean(busy)}
                                    onChange={(event) =>
                                      setAmounts((current) => ({
                                        ...current,
                                        [id]: event.target.value,
                                      }))
                                    }
                                    className="w-40 rounded-lg border px-3 py-2"
                                  />
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </>
                )}
              </Band>

              {/* CONFIRM RECEIPT */}

              <Band
                title={`2. Confirm Receipt (${receivedIds.length} selected)`}
              >
                <p className="mb-4 text-xl text-gray-600">
                  Only mark assistance as received after it has actually
                  been handed over to the household.
                </p>

                {distributions.length === 0 ? (
                  <p className="py-6 text-center text-xl text-gray-500">
                    No distribution records were found for this period.
                    Load approved households again or check the approval
                    records for this program.
                  </p>
                ) : (
                  <>
                    <div className="mb-4 flex flex-wrap items-end gap-3">
                      <Button
                        type="button"
                        variant="maroon"
                        disabled={!pending.length || Boolean(busy)}
                        onClick={toggleAllPending}
                      >
                        {allPendingChecked
                          ? 'Clear Pending Selection'
                          : 'Select All Pending'}
                      </Button>

                      <div className="flex flex-col gap-1">
                        <label
                          htmlFor="release-date"
                          className="text-sm font-semibold"
                        >
                          ACTUAL DATE RECEIVED
                        </label>

                        <input
                          id="release-date"
                          type="date"
                          value={releaseDate}
                          max={todayISO()}
                          onChange={(event) =>
                            setReleaseDate(event.target.value)
                          }
                          className="rounded-lg border px-3 py-2"
                        />
                      </div>

                      <Button
                        type="button"
                        variant="maroon"
                        disabled={
                          !receivedIds.length || Boolean(busy)
                        }
                        onClick={markReleased}
                      >
                        {busy === 'release'
                          ? 'Saving…'
                          : 'Mark as Received'}
                      </Button>
                    </div>

                    <div className="max-h-[500px] overflow-auto rounded-lg border">
                      <table className="w-full">
                        <thead className="sticky top-0 z-10 bg-[#FFD7D7]">
                          <tr>
                            <th className={th}>Received</th>
                            <th className={th}>Household Head</th>
                            <th className={th}>Purok</th>
                            <th className={th}>Amount</th>
                            <th className={th}>Status</th>
                            <th className={th}>Release Date</th>
                          </tr>
                        </thead>

                        <tbody>
                          {distributions.map((row, index) => {
                            const id = String(distributionId(row) || '');
                            const done = isReleased(row);
                            const eligible = canConfirmReceipt(row);
                            const checked =
                              done || receivedIds.includes(id);

                            return (
                              <tr
                                key={`${id || 'distribution'}-${index}`}
                                className={`border-t ${
                                  done ? 'bg-green-50' : ''
                                }`}
                              >
                                <td className={td}>
                                  <input
                                    type="checkbox"
                                    className="h-5 w-5 accent-[#6E2430]"
                                    checked={checked}
                                    disabled={
                                      done ||
                                      !eligible ||
                                      !id ||
                                      Boolean(busy)
                                    }
                                    onChange={() => toggleReceived(id)}
                                  />
                                </td>

                                <td className={td}>
                                  {householdName(row)}
                                </td>

                                <td className={td}>
                                  {householdPurok(row)}
                                </td>

                                <td className={td}>
                                  {formatAmount(amountOf(row))}
                                </td>

                                <td className={td}>
                                  <Badge
                                    tone={
                                      done
                                        ? 'green'
                                        : eligible
                                          ? 'blue'
                                          : 'gray'
                                    }
                                  >
                                    {done
                                      ? 'Released'
                                      : eligible
                                        ? 'Not Released'
                                        : 'Not Ready'}
                                  </Badge>
                                </td>

                                <td className={td}>
                                  {formatDate(row.release_date)}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </>
                )}
              </Band>
            </>
          )}
        </>
      )}
    </div>
  );
}

export default DistributionProgram;
