import React, { useEffect, useMemo, useState } from 'react';
import {
  ChevronDown,
  ChevronUp,
  Search,
  CheckCircle,
  XCircle,
  Clock,
  Eye,
  X,
  Users,
  FileText,
  RefreshCw,
} from 'lucide-react';
import { api } from '../lib/api';
import {useNavigate} from 'react-router-dom';


function History() {
  const [history, setHistory] = useState([]);
  const [releases, setReleases] = useState([]);
  const [releaseError, setReleaseError] = useState('');
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');
  const [expandedHousehold, setExpandedHousehold] = useState(null);
  const [selectedHousehold, setSelectedHousehold] = useState(null);
  const [error, setError] = useState('');
  const navigate = useNavigate();
 


  useEffect(() => {
    loadHistory();
  }, []);

  // ============================================================
  // LOAD HISTORY
  // GET /api/history
  // ============================================================
  const loadHistory = async () => {
  try {
    setLoading(true);
    setError('');
    setReleaseError('');

    const [historyResponse, releaseResponse] =
      await Promise.all([
        api.get('/history/beneficiary-validation'),
        api.get('/history/household-releases'),
      ]);

    const historyRecords = Array.isArray(historyResponse)
      ? historyResponse
      : Array.isArray(historyResponse?.data)
        ? historyResponse.data
        : Array.isArray(historyResponse?.rows)
          ? historyResponse.rows
          : [];

    const releaseRecords = Array.isArray(releaseResponse)
      ? releaseResponse
      : Array.isArray(releaseResponse?.data)
        ? releaseResponse.data
        : Array.isArray(releaseResponse?.rows)
          ? releaseResponse.rows
          : [];

    setHistory(historyRecords);
    setReleases(releaseRecords);
  } catch (err) {
    console.error('Failed to load history or releases:', err);
    setError(
      err?.message || 'Failed to load beneficiary history.'
    );
  } finally {
    setLoading(false);
  }
};
  // ============================================================
  // FILTER
  // ============================================================
  const filteredHistory = useMemo(() => {
    const searchText = search.toLowerCase().trim();

    return history.filter((item) => {
      const status = String(
        item.validation_status || ''
      ).toLowerCase();

      const matchesStatus =
        statusFilter === 'All' ||
        status === statusFilter.toLowerCase();

      const matchesSearch =
        !searchText ||
        String(item.household_head_name || '')
          .toLowerCase()
          .includes(searchText) ||
        String(item.purok || '')
          .toLowerCase()
          .includes(searchText) ||
        String(item.address || '')
          .toLowerCase()
          .includes(searchText) ||
        String(item.program_name || '')
          .toLowerCase()
          .includes(searchText);

      return matchesStatus && matchesSearch;
    });
  }, [history, statusFilter, search]);

  // ============================================================
  // GROUP BY HOUSEHOLD
  // ============================================================
  const groupedHouseholds = useMemo(() => {
    const groups = {};

    filteredHistory.forEach((item) => {
      const householdId = item.household_id;

      if (!householdId) return;

      if (!groups[householdId]) {
        groups[householdId] = {
          household_id: householdId,
          household_head_name:
            item.household_head_name,
          purok: item.purok,
          address: item.address,
          vulnerability: item.vulnerability,
          programs: [],
        };
      }

      groups[householdId].programs.push(item);
    });

    return Object.values(groups);
  }, [filteredHistory]);

  const householdReleaseSummary = useMemo(() => {
  const summary = {};

  releases.forEach((release) => {
    const id = release.household_id;
    if (!id) return;

    if (!summary[id]) {
      summary[id] = {
        timesReceived: 0,
        totalAmount: 0,
        records: [],
      };
    }

    const amount = Number(release.amount_released);

    summary[id].timesReceived += 1;
    summary[id].totalAmount += Number.isFinite(amount)
      ? amount
      : 0;

    summary[id].records.push(release);
  });

  return summary;
}, [releases]);

const formatCurrency = (amount) =>
  new Intl.NumberFormat('en-PH', {
    style: 'currency',
    currency: 'PHP',
    minimumFractionDigits: 2,
  }).format(Number(amount) || 0);

  // ============================================================
  // STATUS HELPERS
  // ============================================================
  const getStatusStyle = (status) => {
    switch (String(status).toLowerCase()) {
      case 'approved':
        return 'bg-green-100 text-green-700 border-green-200';

      case 'rejected':
        return 'bg-red-100 text-red-700 border-red-200';

      case 'pending':
        return 'bg-yellow-100 text-yellow-700 border-yellow-200';

      default:
        return 'bg-gray-100 text-gray-700 border-gray-200';
    }
  };

  const getStatusIcon = (status) => {
    switch (String(status).toLowerCase()) {
      case 'approved':
        return <CheckCircle size={18} />;

      case 'rejected':
        return <XCircle size={18} />;

      default:
        return <Clock size={18} />;
    }
  };

  // ============================================================
  // DATE
  // ============================================================
  const formatDate = (date) => {
    if (!date) return '—';

    const parsedDate = new Date(date);

    if (Number.isNaN(parsedDate.getTime())) {
      return '—';
    }

    return parsedDate.toLocaleString('en-PH', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  };

  // ============================================================
  // DECISION DATE
  // ============================================================
const getDecisionDate = (program) => {
  return (
    program.approved_at ||
    program.approval_date ||
    program.decided_at ||
    program.submitted_at
  );
};

const getDecisionMaker = (program) => {
  return (
    program.approved_by_name ||
    program.decided_by_name ||
    program.approver_name ||
    '—'
  );
};

  // ============================================================
  // COUNTS
  // ============================================================
  const approvedCount = history.filter(
    (item) =>
      String(item.validation_status || '').toLowerCase() ===
      'approved'
  ).length;

  const rejectedCount = history.filter(
    (item) =>
      String(item.validation_status || '').toLowerCase() ===
      'rejected'
  ).length;

  // ============================================================
  // RENDER
  // ============================================================
  return (
    <div className="min-h-screen p-6">

      {/* HEADER */}
      <div className="mb-6 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-4xl font-bold text-black pt-5">
            History
          </h1>

          <p className="mt-1 text-gray-600 text-xl">
            View approved and rejected beneficiary records,
            assistance programs, decision makers, dates, and remarks.
          </p>

        </div>

        <button
          type="button"
          onClick={() => navigate('/distribution-program')}
          className="w-fit rounded-lg bg-[#6E2430] px-4 py-2 font-medium text-xl text-white transition hover:bg-[#581c26]"
        >
          + Manage Distribution
        </button>

        <button
          type="button"
          onClick={loadHistory}
          disabled={loading}
          className="flex w-fit items-center text-xl gap-2 rounded-lg bg-[#6E2430] px-4 py-2 font-medium text-white transition hover:bg-[#581c26] disabled:cursor-not-allowed disabled:opacity-60"
        >
          <RefreshCw
            size={20}
            className={loading ? 'animate-spin' : ''}
          />
          Refresh
        </button>
      </div>

      {/* ERROR */}
      {error && (
        <div className="mb-5 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* SUMMARY CARDS */}
      <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-3">

        {/* TOTAL */}
        <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-2xl font-medium text-gray-500">
                Total Records
              </p>

              <p className="mt-1 text-4xl font-bold text-[#6E2430]">
                {history.length}
              </p>
            </div>

            <div className="rounded-full bg-[#F4E3E5] p-3 text-[#6E2430]">
              <FileText size={30} />
            </div>
          </div>
        </div>

        {/* APPROVED */}
        <div className="rounded-xl border border-green-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-2xl font-medium text-gray-500">
                Approved
              </p>

              <p className="mt-1 text-4xl font-bold text-green-600">
                {approvedCount}
              </p>
            </div>

            <div className="rounded-full bg-green-100 p-3 text-green-600">
              <CheckCircle size={30} />
            </div>
          </div>
        </div>

        {/* REJECTED */}
        <div className="rounded-xl border border-red-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-2xl ont-medium text-gray-500">
                Rejected
              </p>

              <p className="mt-1 text-4xl font-bold text-red-600">
                {rejectedCount}
              </p>
            </div>

            <div className="rounded-full bg-red-100 p-3 text-red-600">
              <XCircle size={30} />
            </div>
          </div>
        </div>

      </div>

      {/* FILTERS */}
      <div className="mb-5 rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-4 md:flex-row md:items-center">

          {/* SEARCH */}
          <div className="relative flex-1">
            <Search
              size={20}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
            />

            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search household, Purok, address, or program..."
              className="w-full text-2xl rounded-lg border border-gray-300 py-3 pl-10 pr-4 outline-none focus:border-[#6E2430] focus:ring-1 focus:ring-[#6E2430]"
            />
          </div>

          {/* STATUS */}
          <div className="relative w-full md:w-56">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="w-full text-2xl appearance-none rounded-lg border border-gray-300 bg-white px-4 py-3 pr-10 font-medium outline-none focus:border-[#6E2430] focus:ring-1 focus:ring-[#6E2430]"
            >
              <option value="All">All Status</option>
              <option value="Approved">Approved</option>
              <option value="Rejected">Rejected</option>
            </select>

            <ChevronDown
              size={30}
              className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-gray-500"
            />
          </div>

        </div>
      </div>

      {/* CONTENT */}
      <div className="rounded-xl border border-gray-200 bg-white shadow-sm">

        {/* CONTENT HEADER */}
        <div className="border-b border-gray-200 bg-[#FFF7F7] px-5 py-4">
          <h2 className="text-3xl font-bold text-[#6E2430]">
            Beneficiary Records
          </h2>

          <p className="text-xl text-gray-500">
            {groupedHouseholds.length} household
            {groupedHouseholds.length !== 1 ? 's' : ''} found
          </p>
        </div>

        {/* LOADING */}
        {loading ? (
          <div className="flex justify-center py-16">
            <div className="h-10 w-10 animate-spin rounded-full border-4 border-gray-200 border-t-[#6E2430]" />
          </div>

        ) : groupedHouseholds.length === 0 ? (

          /* EMPTY */
          <div className="py-16 text-center">
            <FileText
              size={55}
              className="mx-auto mb-3 text-gray-300"
            />

            <p className="font-semibold text-xl text-gray-500">
              No history records found.
            </p>

            <p className="mt-1 text-lg text-gray-400">
              Approved and rejected beneficiary records will appear here.
            </p>
          </div>

        ) : (

          /* HOUSEHOLDS */
          <div className="divide-y divide-gray-200">

            {groupedHouseholds.map((household) => {
              const isExpanded =
                expandedHousehold === household.household_id;

              const releaseSummary =
              householdReleaseSummary[household.household_id] || {
                timesReceived: 0,
                totalAmount: 0,
                records: [],
              };

              return (
                <div key={household.household_id}>

                  {/* HOUSEHOLD ROW */}
                  <div className="flex flex-col gap-4 p-3 lg:flex-row lg:items-center lg:justify-between">

                    <div className="flex items-start gap-4">

                      <div className="rounded-full bg-[#F4E3E5] p-3 text-[#6E2430]">
                        <Users size={30} />
                      </div>
                      <div className="mt-3 grid grid-cols-3 gap-3 sm:grid-cols-2">
  <div className="rounded-lg border border-green-200 bg-green-50 p-3">
    <p className="text-lg font-medium text-green-800">
       Assistance Received
    </p>
    <p className="mt-1 text-2xl font-bold text-green-900">
      {releaseSummary.timesReceived}
    </p>
  </div>

  <div className="rounded-lg border border-blue-200 bg-blue-50 p-3">
    <p className="text-lg font-medium text-blue-800">
      Total Amount Received
    </p>
    <p className="mt-1 text-2xl font-bold text-blue-900">
      {formatCurrency(releaseSummary.totalAmount)}
    </p>
  </div>
</div>

                      <div>
                        <h3 className="text-2xl font-bold text-gray-800">
                          {household.household_head_name ||
                            'Unnamed Household'}
                        </h3>

                        <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xl text-gray-500">

                          <span>
                            Purok: {household.purok || '—'}
                          </span>

                          <span>
                            Vulnerability:{' '}
                            {household.vulnerability || '—'}
                          </span>

                          <span>
                            {household.programs.length} program
                            {household.programs.length !== 1
                              ? 's'
                              : ''}
                          </span>

                        </div>
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-2">

                      {/* VIEW */}
                      <button
                        type="button"
                        onClick={() =>
                          setSelectedHousehold(household)
                        }
                        className="flex items-center gap-2 text-xl rounded-lg border border-[#6E2430] px-4 py-2 font-medium text-[#6E2430] transition hover:bg-[#6E2430] hover:text-white"
                      >
                        <Eye size={25} />
                        View
                      </button>

                      {/* PROGRAMS */}
                      <button
                        type="button"
                        onClick={() =>
                          setExpandedHousehold(
                            isExpanded
                              ? null
                              : household.household_id
                          )
                        }
                        className="flex text-xl items-center gap-2 rounded-lg bg-[#6E2430] px-4 py-2 font-medium text-white transition hover:bg-[#581c26]"
                      >
                        {isExpanded ? (
                          <>
                            <ChevronUp size={25} />
                            Hide
                          </>
                        ) : (
                          <>
                            <ChevronDown size={25} />
                            Programs
                          </>
                        )}
                      </button>

                    </div>
                  </div>

                  {/* PROGRAM DETAILS */}
                  {isExpanded && (
                    <div className="border-t border-gray-100 bg-gray-50 px-5 py-4">

                      <div className="mb-5 rounded-xl border border-gray-200 bg-white p-4">
  <h3 className="mb-3 text-2xl font-bold text-[#6E2430]">
    Actual Assistance Received
  </h3>

  <p className="mb-4 text-xl text-gray-600">
    Total releases: {releaseSummary.timesReceived}
    {' · '}
    Total amount: {formatCurrency(releaseSummary.totalAmount)}
  </p>

  {releaseSummary.records.length === 0 ? (
    <p className="text-gray-500">
      No released assistance has been recorded for this household.
    </p>
  ) : (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[700px] text-left">
        <thead>
          <tr className="border-b text-xl text-gray-500">
            <th className="px-3 py-3">Program</th>
            <th className="px-3 py-3">Amount Received</th>
            <th className="px-3 py-3">Release Date</th>
            <th className="px-3 py-3">Covered Period</th>
          </tr>
        </thead>

        <tbody className=" text-xl">
          {releaseSummary.records.map((release) => (
            <tr
              key={release.distribution_id}
              className="border-b last:border-0"
            >
              <td className="px-3 py-3 font-medium">
                {release.program_name || '—'}
              </td>

              <td className="px-3 py-3 font-semibold text-green-700">
                {formatCurrency(release.amount_released)}
              </td>

              <td className="px-3 py-3">
                {release.release_date
                  ? new Date(
                      `${String(release.release_date).slice(0, 10)}T00:00:00`
                    ).toLocaleDateString('en-PH', {
                      year: 'numeric',
                      month: 'short',
                      day: 'numeric',
                    })
                  : '—'}
              </td>

              <td className="px-3 py-3">
                {release.period_start && release.period_end
                  ? `${String(release.period_start).slice(0, 10)} to ${String(release.period_end).slice(0, 10)}`
                  : 'Not specified'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )}
</div>

                      <div className="overflow-x-auto">
                        <table className="w-full min-w-[950px] text-left">

                          <thead>
                            <tr className="border-b border-gray-200 text-xl text-gray-500">

                              <th className="px-4 py-3">
                                Assistance Program
                              </th>

                              <th className="px-4 py-3">
                                Status
                              </th>

                              <th className="px-4 py-3">
                                Decided By
                              </th>

                              <th className="px-4 py-3">
                                Decision Date
                              </th>

                              <th className="px-4 py-3">
                                Remarks
                              </th>

                            </tr>
                          </thead>

                          <tbody>
                            {household.programs.map((program) => (
                              <tr
                                key={program.validation_id}
                                className="border-b border-gray-100 last:border-0"
                              >

                                {/* PROGRAM */}
                                <td className="px-4 py-4 text-xl font-semibold text-gray-800">
                                  {program.program_name || '—'}
                                </td>

                                {/* STATUS */}
                                <td className="px-4 py-4">
                                  <span
                                    className={`inline-flex text-xl items-center gap-2 rounded-full border px-3 py-1 text-sm font-semibold ${getStatusStyle(
                                      program.validation_status
                                    )}`}
                                  >
                                    {getStatusIcon(
                                      program.validation_status
                                    )}

                                    {program.validation_status || '—'}
                                  </span>
                                </td>

                                {/* DECISION MAKER */}
                                <td className="px-4 py-4 text-gray-700 text-xl">
                                  {getDecisionMaker(program)}
                                </td>

                                {/* DATE */}
                                <td className="px-4 py-4 text-gray-600 text-xl">
                                  {formatDate(
                                    getDecisionDate(program)
                                  )}
                                </td>

                                {/* REMARKS */}
                                <td className="max-w-xs text-xl px-4 py-4 text-gray-600">
                                  {program.remarks || 'No remarks'}
                                </td>

                              </tr>
                            ))}
                          </tbody>

                        </table>
                      </div>
                    </div>
                  )}

                </div>
              );
            })}

          </div>
        )}
      </div>

      {/* ========================================================
          HOUSEHOLD DETAILS MODAL
      ======================================================== */}
      {selectedHousehold && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={() => setSelectedHousehold(null)}
        >
          <div
            className="max-h-[90vh] w-full max-w-4xl overflow-y-auto rounded-2xl bg-white shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >

            {/* MODAL HEADER */}
            <div className="sticky top-0 z-10 flex items-center justify-between border-b bg-white px-6 py-5">

              <div>
                <h2 className="text-3xl font-bold text-[#6E2430]">
                  Household Details
                </h2>

                <p className="text-xl text-gray-500">
                  Assistance program history
                </p>
              </div>

              <button
                type="button"
                onClick={() => setSelectedHousehold(null)}
                className="rounded-full p-2 text-gray-500 hover:bg-gray-100"
              >
                <X size={30} />
              </button>

            </div>

            {/* HOUSEHOLD INFORMATION */}
            <div className="grid grid-cols-1 gap-4 p-6 md:grid-cols-2">

              <div className="rounded-lg bg-gray-50 p-4">
                <p className="text-xl text-gray-500">
                  Household Head
                </p>

                <p className="mt-1 text-xl font-bold text-gray-800">
                  {selectedHousehold.household_head_name || '—'}
                </p>
              </div>

              <div className="rounded-lg bg-gray-50 p-4">
                <p className="text-xl text-gray-500">
                  Purok
                </p>

                <p className="mt-1 text-xl font-bold text-gray-800">
                  {selectedHousehold.purok || '—'}
                </p>
              </div>

              <div className="rounded-lg bg-gray-50 p-4">
                <p className="text-xl text-gray-500">
                  Vulnerability
                </p>

                <p className="mt-1 text-xl font-bold text-gray-800">
                  {selectedHousehold.vulnerability || '—'}
                </p>
              </div>

              <div className="rounded-lg bg-gray-50 p-4">
                <p className="text-xl text-gray-500">
                  Address
                </p>

                <p className="mt-1 text-xl font-bold text-gray-800">
                  {selectedHousehold.address || '—'}
                </p>
              </div>

            </div>

            {/* PROGRAM HISTORY */}
            <div className="px-6 pb-6">

              <h3 className="mb-3 text-2xl font-bold text-[#6E2430]">
                Assistance Program History
              </h3>

              <div className="space-y-3">

                {selectedHousehold.programs.map((program) => (
                  <div
                    key={program.validation_id}
                    className="rounded-xl border border-gray-200 p-4"
                  >

                    <div className="flex flex-col text-xl gap-3 md:flex-row md:items-start md:justify-between">

                      <div>

                        <p className="font-bold text-gray-800">
                          {program.program_name || '—'}
                        </p>

                        <p className="mt-1 text-xl text-gray-500">
                          Decision by:{' '}
                          <span className="font-medium text-gray-700">
                            {getDecisionMaker(program)}
                          </span>
                        </p>

                        <p className="text-xl text-gray-500">
                          Date:{' '}
                          {formatDate(
                            getDecisionDate(program)
                          )}
                        </p>

                      </div>

                      <span
                        className={`inline-flex w-fit items-center gap-2 rounded-full border px-3 py-1 text-xl font-semibold ${getStatusStyle(
                          program.validation_status
                        )}`}
                      >
                        {getStatusIcon(
                          program.validation_status
                        )}

                        {program.validation_status || '—'}
                      </span>

                    </div>

                    {/* PROGRAM DESCRIPTION */}
                    {program.description && (
                      <div className="mt-3 rounded-lg bg-gray-50 p-3">
                        <p className="text-xl font-semibold uppercase text-gray-500">
                          Program Description
                        </p>

                        <p className="mt-1 text-xl text-gray-700">
                          {program.description}
                        </p>
                      </div>
                    )}

                    {/* REMARKS */}
                    <div className="mt-3 rounded-lg bg-gray-50 p-3">
                      <p className="text-xl font-semibold uppercase text-gray-500">
                        Remarks
                      </p>

                      <p className="mt-1 text-xl text-gray-700">
                        {program.remarks || 'No remarks'}
                      </p>
                    </div>

                  </div>
                ))}

              </div>
            </div>

          </div>
        </div>
      )}

    </div>
  );
}

export default History;