import { useEffect, useState } from 'react';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import toast, { Toaster } from 'react-hot-toast';

import { api } from '../lib/api';
import { mlApi } from '../lib/mlApi';

import {
  PageHeader,
  Band,
  Table,
  Badge,
  Spinner,
  Button,
  Select,
  Input,
} from '../components/ui';

/* ======================================================
   CONSTANTS
   ====================================================== */

const TYPES = [
  ['households', 'Household Profile Report'],
  ['approved', 'Approved Beneficiaries Report'],
  ['distribution', 'Assistance Distribution Report'],
  ['analytics', 'Analytical Summary'],
];

const PUROKS = ["1", "1-A", "2", "2-A", "3","3-A", "4", "5", "5-A", "5-B", "5-C", "6", "6-A", "7", "7-A", "8", "8-A", "9", "9A"];

const MAROON = [116, 31, 45];
const LIGHT_RED = [250, 235, 237];
const RED = [220, 20, 45];
const GRAY = [105, 105, 105];
const DARK = [35, 35, 35];

/* ======================================================
   GENERAL HELPERS
   ====================================================== */

function fmt(value) {
  if (
    value === null ||
    value === undefined ||
    value === ''
  ) {
    return '—';
  }

  if (Array.isArray(value)) {
    return value.join('; ');
  }

  return String(value);
}

function getReportLabel(type) {
  return (
    TYPES.find(([reportType]) => reportType === type)?.[1] ||
    type ||
    'Report'
  );
}

/* ======================================================
   RECORD HELPERS
   ====================================================== */

function getRecordKey(row, index) {
  const base =
    row?.validation_id ||
    row?.distribution_id ||
    row?.household_id ||
    row?.report_id ||
    row?.id ||
    `${row?.classification || 'record'}-${
      row?.household_head_name ||
      row?.household_name ||
      'household'
    }-${row?.purok || ''}`;

  return `${base}-${index}`;
}

function getHouseholdName(row) {
  return (
    row?.household_head_name ||
    row?.household_name ||
    row?.household ||
    row?.head_name ||
    row?.name ||
    null
  );
}

function getPurok(row) {
  return (
    row?.purok ??
    row?.purok_number ??
    row?.purok_name ??
    null
  );
}

function getClassification(row) {
  return (
    row?.vulnerability ||
    row?.classification ||
    row?.vulnerability_level ||
    row?.vulnerability_status ||
    null
  );
}

function getStatus(row) {
  return (
    row?.validation_status ||
    row?.release_status ||
    row?.approval_status ||
    null
  );
}

function parseReportValue(value, fallback = null) {
  if (
    value === null ||
    value === undefined ||
    value === ''
  ) {
    return fallback;
  }

  if (typeof value !== 'string') {
    return value;
  }

  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

function getHistoryFilters(report) {
  const parsed = parseReportValue(report?.filters, {});

  return parsed &&
    typeof parsed === 'object' &&
    !Array.isArray(parsed)
    ? parsed
    : {};
}

function getHistoryData(report) {
  return parseReportValue(report?.report_data, null);
}

function getHistoryRows(report) {
  const parsed = getHistoryData(report);

  return Array.isArray(parsed) ? parsed : [];
}

function escapeCsv(value) {
  return `"${fmt(value).replaceAll('"', '""')}"`;
}

function rowsToCsv(rows) {
  return rows
    .map((row) => row.map(escapeCsv).join(','))
    .join('\n');
}

/* ======================================================
   DATE HELPERS
   ====================================================== */

function getRecordDate(row) {
  return (
    row?.approved_at ||
    row?.release_date ||
    row?.released_at ||
    row?.releaseDate ||
    row?.distributed_at ||
    row?.distribution_date ||
    row?.distributionDate ||
    row?.report_date ||
    row?.created_at ||
    null
  );
}


function firstDefined(row, keys) {
  for (const key of keys) {
    const value = row?.[key];
    if (value !== null && value !== undefined && value !== '') {
      return value;
    }
  }
  return null;
}

function reportCell(value) {
  if (value === null || value === undefined || value === '') return '—';
  if (Array.isArray(value)) return value.join('; ');
  return String(value);
}

function getReportColumns(reportType) {
  const column = (header, keys, formatter = reportCell) => ({
    header,
    value: (row) => formatter(firstDefined(row, keys)),
  });

  
if (reportType === 'households') {
  return [
    column('Household Head', [
      'household_head_name',
      'household_name',
      'head_name',
      'name'
    ]),
    column('Family Position', [
      'family_position'
    ]),
    column('Family Size', [
      'family_number',
      'family_size',
      'household_size'
    ]),
    column('Address', [
      'address',
      'complete_address'
    ]),
    column('Purok', [
      'purok',
      'purok_number',
      'purok_name'
    ]),
    column('Occupation', [
      'occupation'
    ]),
    column('Monthly Income', [
      'monthly_income',
      'income'
    ], (value) => {
      if (
        value === null ||
        value === undefined ||
        value === ''
      ) {
        return '—';
      }

      const amount = Number(value);

      return Number.isFinite(amount)
        ? `₱ ${amount.toLocaleString('en-PH', {
            maximumFractionDigits: 2
          })}`
        : String(value);
    }),
    column('Date Encoded', [
      'created_at',
      'createdAt',
      'report_date'
    ], formatDate)
  ];
}


  if (reportType === 'approved') {
    return [
      column('Household', ['household_head_name', 'household_name', 'head_name', 'name']),
      column('Purok', ['purok', 'purok_number', 'purok_name']),
      column('Vulnerability', ['vulnerability', 'classification', 'vulnerability_level']),
      column('Assistance Program', ['program_name', 'assistance_program', 'program', 'program_title']),
      column('Validation Status', ['validation_status', 'approval_status', 'status']),
      column('Approved By', ['approved_by_name', 'approved_by', 'approver_name']),
      column('Approval Date', ['approved_at', 'approval_date', 'created_at'], formatDate),
    ];
  }

  if (reportType === 'distribution') {
    return [
      column('Household', ['household_head_name', 'household_name', 'head_name', 'name']),
      column('Purok', ['purok', 'purok_number', 'purok_name']),
      column('Assistance Program', ['program_name', 'assistance_program', 'program', 'program_title']),
      column('Amount / Quantity', ['amount_released']),
      column('Distribution Status', ['distribution_status', 'release_status',]),
      column('Release Date', ['release_date', 'released_at', 'distributed_at', 'distribution_date', 'created_at'], formatDate),
    ];
  }

  return [
    column('Household', ['household_head_name', 'household_name', 'head_name', 'name']),
    column('Purok', ['purok', 'purok_number', 'purok_name']),
    column('Classification', ['vulnerability', 'classification', 'vulnerability_level']),
    column('Status', ['release_status']),
    column('Date', ['approved_at', 'release_date', 'released_at', 'distributed_at', 'created_at'], formatDate),
  ];
}

function formatDate(value) {
  if (!value) {
    return '—';
  }

  if (
    typeof value === 'string' &&
    /^\d{4}-\d{2}-\d{2}$/.test(value)
  ) {
    const [year, month, day] = value.split('-').map(Number);

    const date = new Date(year, month - 1, day);

    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: '2-digit',
      year: 'numeric',
    });
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return fmt(value);
  }

  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: '2-digit',
    year: 'numeric',
  });
}

function formatDateTime(value) {
  if (!value) {
    return '—';
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return fmt(value);
  }

  return date.toLocaleString();
}

/* ======================================================
   ANALYTICS HELPERS
   ====================================================== */

function emptyAnalytics() {
  return {
    total_households: 0,
    by_purok: [],
    by_vulnerability: [],
    validation_records: [],
    distribution: [],
    approved_household_count: 0,
    rejected_count: 0,
    decided_household_count: 0,
    approval_rate: 0,
    coverage: 0,
    highly_vulnerable: 0,
  };
}

function getAnalyticsData(value) {
  if (!value || typeof value !== 'object') {
    return emptyAnalytics();
  }

  if (Array.isArray(value)) {
    const by_vulnerability = value.map((row) => ({
      vulnerability:
        getClassification(row) || 'Unclassified',
      n: Number(row?.count || 0),
    }));

    return {
      ...emptyAnalytics(),
      by_vulnerability,
      total_households: by_vulnerability.reduce(
        (sum, row) => sum + row.n,
        0
      ),
    };
  }

  const arr = (value) =>
    Array.isArray(value) ? value : [];

  const num = (value) =>
    Number(value || 0);

  return {
    total_households: num(value.total_households),
    by_purok: arr(value.by_purok),
    by_vulnerability: arr(value.by_vulnerability),
    validation_records: arr(value.validation_records),
    distribution: arr(value.distribution),
    approved_household_count: num(
      value.approved_household_count
    ),
    rejected_count: num(value.rejected_count),
    decided_household_count: num(
      value.decided_household_count
    ),
    approval_rate: num(value.approval_rate),
    coverage: num(value.coverage),
    highly_vulnerable: num(value.highly_vulnerable),
  };
}

function getAnalyticsPurokRows(analytics) {
  return getAnalyticsData(analytics).by_purok.map((item) => ({
    label:
      item?.purok === undefined ||
      item?.purok === null ||
      String(item.purok).trim() === ''
        ? 'Unknown'
        : `Purok ${String(item.purok)}`,
    value: Number(item?.n || 0),
  }));
}

function getAnalyticsVulnerabilityRows(analytics) {
  return getAnalyticsData(analytics).by_vulnerability.map(
    (item) => ({
      label: item?.vulnerability || 'Unclassified',
      value: Number(item?.n || 0),
    })
  );
}

function getAnalyticsDistributionRows(analytics) {
  return getAnalyticsData(analytics).distribution.map(
    (item) => ({
      label: item?.program_name || 'Unknown Program',
      value: Number(item?.released || 0),
    })
  );
}

function getAnalyticsValidationRows(analytics) {
  const data = getAnalyticsData(analytics);

  const undecided = Math.max(
    data.total_households -
      data.decided_household_count,
    0
  );

  return [
    {
      label: 'Approved',
      value: data.approved_household_count,
    },
    {
      label: 'Rejected',
      value: data.rejected_count,
    },
    {
      label: 'Undecided',
      value: undecided,
    },
  ];
}

function normalizeChartRows(
  rows,
  {
    sort = true,
    max = 8,
  } = {}
) {
  if (!Array.isArray(rows)) {
    return [];
  }

  const clean = rows
    .map((row) => ({
      label: String(row?.label ?? 'Unknown'),
      value: Number(row?.value ?? 0),
    }))
    .filter(
      (row) =>
        Number.isFinite(row.value) &&
        row.value >= 0
    );

  if (sort) {
    clean.sort((a, b) => b.value - a.value);
  }

  return clean.slice(0, max);
}

/* ======================================================
   PDF HELPERS
   ====================================================== */

function drawSectionTitle(doc, text, x, y) {
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.setTextColor(...RED);
  doc.text(text, x, y);
}

function drawStatCards(
  doc,
  cards,
  {
    x,
    y,
    width,
  }
) {
  const gap = 5;

  const cardWidth =
    (width - gap * (cards.length - 1)) /
    cards.length;

  cards.forEach(([title, value], index) => {
    const cx =
      x + index * (cardWidth + gap);

    doc.setFillColor(...LIGHT_RED);
    doc.setDrawColor(230, 215, 215);

    doc.roundedRect(
      cx,
      y,
      cardWidth,
      25,
      2,
      2,
      'FD'
    );

    doc.setTextColor(...RED);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(22);

    doc.text(
      String(value),
      cx + cardWidth / 2,
      y + 12,
      {
        align: 'center',
      }
    );

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.setTextColor(...GRAY);

    doc.text(
      title,
      cx + cardWidth / 2,
      y + 20,
      {
        align: 'center',
      }
    );
  });
}


function drawBarChart(
  doc,
  {
    title,
    rows,
    x,
    y,
    width,
    height = 70,
    color = MAROON,
    colorMode = 'single',
    sort = true,
  }
) {

  const safeRows = normalizeChartRows(rows, {
    sort,
  });

  const pageHeight =
    doc.internal.pageSize.getHeight();

  const rowHeight = Math.min(
    8,
    height /
      Math.max(
        safeRows.length,
        1
      )
  );

  const needed =
    7 +
    Math.max(
      safeRows.length,
      2
    ) *
      rowHeight +
    8;

  if (y + needed > pageHeight - 20) {
    doc.addPage();
    y = 14;
  }

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(...MAROON);
  doc.text(title, x, y);

  if (!safeRows.length) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.setTextColor(...GRAY);
    doc.text(
      'No data available.',
      x,
      y + 12
    );

    return y + 20;
  }

  const chartY = y + 7;

  const labelWidth = 60;
  const valueWidth = 10;

  const chartWidth =
    width -
    labelWidth -
    valueWidth;

  const maxValue = Math.max(
    ...safeRows.map(
      (row) => row.value
    ),
    1
  );

  safeRows.forEach((row, index) => {
    const rowY =
      chartY +
      index * rowHeight;

    const label =
      row.label.length > 21
        ? `${row.label.substring(0, 21)}...`
        : row.label;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9.5);
    doc.setTextColor(...GRAY);

    doc.text(
      label,
      x,
      rowY + 4
    );

    const barX =
      x + labelWidth;

    doc.setFillColor(
      238,
      238,
      238
    );

    doc.roundedRect(
      barX,
      rowY,
      chartWidth,
      4,
      1,
      1,
      'F'
    );

    const actualWidth =
      (row.value / maxValue) *
      chartWidth;

    if (actualWidth > 0) {
      
let barColor = MAROON;

if (colorMode === 'individual') {
  barColor = color[index % color.length];
} else if (colorMode === 'category') {
  const key = String(row.label || '')
    .trim()
    .toLowerCase();

  barColor = color[key] || [120, 120, 120];
} else {
  barColor = color;
}

doc.setFillColor(...barColor);


      doc.roundedRect(
        barX,
        rowY,
        Math.max(actualWidth, 1.5),
        4,
        1,
        1,
        'F'
      );
    }

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(...DARK);

    doc.text(
      String(row.value),
      x + width,
      rowY + 4,
      {
        align: 'right',
      }
    );
  });

  return (
    chartY +
    safeRows.length *
      rowHeight +
    8
  );
}

/* ======================================================
   WEB COMPONENTS
   ====================================================== */

function AnalyticsBarChart({
  title,
  rows,
  maxItems = 8,
  sort = true,
}) {
  const safeRows =
    normalizeChartRows(
      rows,
      {
        sort,
        max: maxItems,
      }
    );

  const maxValue = Math.max(
    ...safeRows.map(
      (row) => row.value
    ),
    1
  );

  const barColors = [
    'bg-[#16A34A]',
    'bg-[#2563EB]',
    'bg-[#D97706]',
    'bg-[#7C3AED]',
    'bg-[#DB2777]',
    'bg-[#0891B2]',
    'bg-[#65A30D]',
  ];

  return (
    <div className="rounded-xl border bg-white p-5 shadow-xl">
      <h3 className="mb-5 text-2xl font-bold text-[#6E2430]">
        {title}
      </h3>

      {!safeRows.length ? (
        <p className="py-8 text-center text-gray-400">
          No data available.
        </p>
      ) : (
        <div className="space-y-4">
          {safeRows.map(
            (row, index) => {
              const percentage =
                (row.value /
                  maxValue) *
                100;

              const barColor =
                barColors[
                  index %
                    barColors.length
                ];

              return (
                <div
                  key={`${row.label}-${index}`}
                >
                  <div className="mb-1 flex items-center justify-between gap-3">
                    <span className="truncate text-xl font-semibold text-gray-700">
                      {row.label}
                    </span>

                    <span className="shrink-0 text-xl font-bold text-[#6E2430]">
                      {row.value}
                    </span>
                  </div>

                  <div className="h-3 overflow-hidden rounded-full bg-gray-200">
                    <div
                      className={`h-full rounded-full ${barColor} transition-all duration-500`}
                      style={{
                        width: `${Math.max(
                          percentage,
                          row.value > 0
                            ? 3
                            : 0
                        )}%`,
                      }}
                    />
                  </div>
                </div>
              );
            }
          )}
        </div>
      )}
    </div>
  );
}

function AnalyticsMiniTable({
  title,
  rows = [],
}) {
  return (
    <div className="overflow-hidden rounded-xl border bg-white shadow-sm">
      <div className="bg-[#FFD7D7] px-4 py-3 text-xl font-bold text-[#6E2430]">
        {title}
      </div>

      <table className="w-full">
        <tbody>
          {rows.length > 0 ? (
            rows.map(
              (row, index) => (
                <tr
                  key={`${row.label}-${index}`}
                  className="border-t hover:bg-gray-50"
                >
                  <td className="px-4 py-3 text-xl text-gray-700">
                    {row.label}
                  </td>

                  <td className="px-4 py-3 text-right text-xl font-semibold text-black">
                    {row.value}
                  </td>
                </tr>
              )
            )
          ) : (
            <tr className="border-t">
              <td
                className="px-4 py-4 text-center text-gray-400"
                colSpan={2}
              >
                No data available.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function AnalyticsSummary({
  analytics,
}) {
  const data =
    getAnalyticsData(
      analytics
    );

  const cards = [
    {
      label:
        'TOTAL HOUSEHOLDS',
      value:
        data.total_households,
    },
    {
      label:
        'HIGHLY VULNERABLE',
      value:
        data.highly_vulnerable,
    },
    {
      label:
        'APPROVAL RATE',
      value: `${data.approval_rate}%`,
    },
    {
      label: 'COVERAGE',
      value: `${data.coverage}%`,
    },
  ];

  const purokRows =
    getAnalyticsPurokRows(
      data
    );

  const vulnerabilityRows =
    getAnalyticsVulnerabilityRows(
      data
    );

  const distributionRows =
    getAnalyticsDistributionRows(
      data
    );

  const validationRows =
    getAnalyticsValidationRows(
      data
    );

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
        {cards.map(
          (card) => (
            <div
              key={card.label}
              className="rounded-xl border bg-[#FFF5F5] p-5"
            >
              <p className="text-xl font-bold text-gray-700">
                {card.label}
              </p>

              <p className="mt-2 text-4xl font-bold text-[#6E2430]">
                {card.value}
              </p>
            </div>
          )
        )}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <AnalyticsBarChart
          title="Households by Purok"
          rows={purokRows}
          sort={false}
        />

        <AnalyticsBarChart
          title="Vulnerability Distribution"
          rows={vulnerabilityRows}
        />

        <AnalyticsBarChart
          title="Assistance Distribution by Program"
          rows={distributionRows}
        />

        <AnalyticsBarChart
          title="Validation Outcome"
          rows={validationRows}
          sort={false}
        />
      </div>

    </div>
  );
}

function ReadOnlyRowsTable({
  rows,
  type = 'households',
  minWidth = 900,
  maxHeight = false,
}) {
  const columns = getReportColumns(type);

  return (
    <div
      className={`overflow-x-auto rounded-lg border ${
        maxHeight ? 'max-h-[500px] overflow-y-auto' : ''
      }`}
    >
      <table className="w-full text-left" style={{ minWidth }}>
        <thead className="sticky top-0 z-20 bg-[#FFD7D7] text-lg">
          <tr>
            <th className="px-4 py-3 text-left font-bold text-[#6E2430]">#</th>
            {columns.map((column) => (
              <th
                key={column.header}
                className="px-4 py-3 text-left font-bold text-[#6E2430]"
              >
                {column.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={getRecordKey(row, index)} className="border-t text-sm">
              <td className="px-4 py-3">{index + 1}</td>
              {columns.map((column) => (
                <td key={column.header} className="px-4 py-3">
                  {column.value(row)}
                </td>
              ))}
            </tr>
          ))}
          {!rows.length && (
            <tr>
              <td colSpan={columns.length + 1} className="px-4 py-8 text-center text-gray-500">
                No saved report data.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function InfoBox({
  label,
  children,
  sub,
}) {
  return (
    <div className="rounded-lg border bg-gray-50 p-4">
      <p className="text-xl font-bold text-gray-500">
        {label}
      </p>

      <p className="mt-1 text-xl font-semibold">
        {children}
      </p>

      {sub && (
        <p className="mt-1 text-xl text-gray-500">
          {sub}
        </p>
      )}
    </div>
  );
}

/* ======================================================
   MAIN COMPONENT
   ====================================================== */

export default function Reports() {
  const [reports, setReports] =
    useState([]);

  const [loading, setLoading] =
    useState(true);

  const [loadingRecords, setLoadingRecords] =
    useState(false);

  const [busy, setBusy] =
    useState('');

  const [type, setType] =
    useState('households');

  const [dateRange, setDateRange] =
    useState('This Month');

  const [purok, setPurok] =
    useState('All Puroks');
  const [assistanceProgram, setAssistanceProgram] = useState('');
  const [assistancePrograms, setAssistancePrograms] = useState([]);
  const [loadingPrograms, setLoadingPrograms] = useState(false);

  const [startDate, setStartDate] =
    useState('');

  const [endDate, setEndDate] =
    useState('');

  const [records, setRecords] =
    useState([]);

  const [analyticsData, setAnalyticsData] =
    useState(null);

  const [selectedIds, setSelectedIds] =
    useState([]);

  const [showPreview, setShowPreview] =
    useState(false);

  const [viewingReport, setViewingReport] =
    useState(null);

  const isAnalytics =
    type === 'analytics';

  /* ======================================================
     RESET
     ====================================================== */

  const resetLoaded = () => {
    setRecords([]);
    setAnalyticsData(null);
    setSelectedIds([]);
    setShowPreview(false);
  };

  /* ======================================================
     FILTERS
     ====================================================== */

  const getEffectiveFilters = () => ({
    dateRange,
    startDate:
      dateRange === 'Custom'
        ? startDate
        : '',
    endDate:
      dateRange === 'Custom'
        ? endDate
        : '',
    purok,
  });

  const buildQuery = () => {
  const params = new URLSearchParams();

  params.set('dateRange', dateRange);
  params.set('purok', purok);

  if (dateRange === 'Custom') {
    params.set('startDate', startDate);
    params.set('endDate', endDate);
  }

  if (type === 'distribution' && assistanceProgram) {
    params.set('programId', assistanceProgram);
  }

  return params.toString();
};

  const validateFilters = () => {
  if (type === 'distribution' && !assistanceProgram) {
    toast.error('Please select an assistance program first.');
    return false;
  }

  if (dateRange !== 'Custom') {
    return true;
  }

  if (!startDate || !endDate) {
    toast.error(
      'Please select both start and end dates for the custom date range.'
    );
    return false;
  }

  if (startDate > endDate) {
    toast.error('Start date cannot be later than end date.');
    return false;
  }

  return true;
};

  /* ======================================================
     REPORT HISTORY
     ====================================================== */

  const load = async () => {
    try {
      setLoading(true);

      const data =
        await api.get('/reports');

      setReports(
        Array.isArray(
          data?.reports
        )
          ? data.reports
          : Array.isArray(data)
            ? data
            : []
      );
    } catch (error) {
      console.error(
        'Failed to load report history:',
        error
      );

      toast.error(
        error?.message ||
          'Failed to load report history.'
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  /* ======================================================
     LOAD RECORDS
     ====================================================== */

  
const loadRecords = async () => {
  if (!validateFilters()) return;
  if (loadingRecords) return;

  setLoadingRecords(true);
  setSelectedIds([]);
  setShowPreview(false);

  try {
    const queryString = buildQuery();

    console.log('REPORT TYPE:', type);
    console.log('REPORT FILTERS:', getEffectiveFilters());

    if (isAnalytics) {
      // Keep the existing ML analytics endpoint.
      // Unwrap common response formats safely.
      const response = await mlApi.getAnalytics(
        `?${queryString}`
      );

      let result = response;

      // Support Axios responses and wrapped API responses.
      for (let i = 0; i < 3; i++) {
        if (
          result &&
          typeof result === 'object' &&
          !Array.isArray(result)
        ) {
          if (result.analytics !== undefined) {
            result = result.analytics;
            continue;
          }

          if (
            result.data !== undefined &&
            result.rows === undefined &&
            result.total_households === undefined &&
            result.by_vulnerability === undefined
          ) {
            result = result.data;
            continue;
          }
        }

        break;
      }

      console.log('ANALYTICS RESPONSE:', response);
      console.log('NORMALIZED ANALYTICS:', result);

      if (
        !result ||
        typeof result !== 'object' ||
        Array.isArray(result)
      ) {
        throw new Error(
          'Analytics returned an unexpected response format.'
        );
      }

      setAnalyticsData(result);
      setRecords([]);

      toast.success('Analytical summary loaded.');
      return;
    }

    setAnalyticsData(null);

    const response = await api.get(
      `/reports/data/${type}?${queryString}`
    );

    const payload = response?.data ?? response;

    const rows = Array.isArray(payload?.rows)
      ? payload.rows
      : Array.isArray(payload)
        ? payload
        : [];

    console.log('REPORT RESPONSE:', response);
    console.log('LOADED REPORT ROWS:', rows);

    setRecords(rows);

    if (rows.length === 0) {
      toast.error(
        'No records found for the selected filters.'
      );
    } else {
      toast.success(
        `${rows.length} record(s) loaded successfully.`
      );
    }
  } catch (error) {
    console.error('LOAD REPORT ERROR:', error);
    console.error('ERROR RESPONSE:', error?.response?.data);

    toast.error(
      error?.response?.data?.error ||
      error?.response?.data?.message ||
      error?.message ||
      'Failed to load report records.'
    );

    setRecords([]);
    setAnalyticsData(null);
  } finally {
    setLoadingRecords(false);
  }
};


const loadAssistancePrograms = async () => {
  try {
    const response = await api.get(
      '/reports/assistance-programs'
    );

    const programs =
      response?.programs ??
      response?.data?.programs ??
      response?.data ??
      [];

    setAssistancePrograms(
      Array.isArray(programs) ? programs : []
    );
  } catch (error) {
    console.error(
      'Failed to load assistance programs:',
      error
    );
  }
};


useEffect(() => {
  if (type === 'distribution') {
    loadAssistancePrograms();
  }
}, [type]);


  /* ======================================================
     SELECTION
     ====================================================== */

  const isSelected = (
    row,
    index
  ) =>
    selectedIds.includes(
      getRecordKey(
        row,
        index
      )
    );

  const toggleRecord = (
    row,
    index
  ) => {
    const id =
      getRecordKey(
        row,
        index
      );

    setSelectedIds(
      (current) =>
        current.includes(id)
          ? current.filter(
              (selectedId) =>
                selectedId !== id
            )
          : [
              ...current,
              id,
            ]
    );
  };

  const selectAll = () => {
    setSelectedIds(
      records.map(
        (row, index) =>
          getRecordKey(
            row,
            index
          )
      )
    );
  };

  const clearSelection = () => {
    setSelectedIds([]);
  };

  const selectedRecords =
    records.filter(
      (row, index) =>
        selectedIds.includes(
          getRecordKey(
            row,
            index
          )
        )
    );

  const allSelected =
    records.length > 0 &&
    selectedIds.length ===
      records.length;

  const hasLoadedData =
    isAnalytics
      ? Boolean(
          analyticsData
        )
      : records.length > 0;

  /* ======================================================
     PREVIEW
     ====================================================== */

  const handlePreview = () => {
    if (!hasLoadedData) {
      toast.error(
        'Please load records first.'
      );

      return;
    }

    if (
      !isAnalytics &&
      !selectedRecords.length
    ) {
      toast.error(
        'Please select at least one record to preview.'
      );

      return;
    }

    setShowPreview(true);
  };

  /* ======================================================
     DOWNLOAD HELPERS
     ====================================================== */

  const triggerDownload = (blob, filename) => {
  if (!(blob instanceof Blob) || blob.size === 0) {
    throw new Error('The generated file is empty.');
  }

  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');

  link.href = url;
  link.download = filename;
  link.rel = 'noopener';
  link.style.display = 'none';

  document.body.appendChild(link);
  link.click();
  link.remove();

  // keep the URL alive long enough for slow downloads
  setTimeout(() => URL.revokeObjectURL(url), 60000);
};

  const downloadCsvText = (
    csvText,
    filename
  ) => {
    if (
      !csvText ||
      !String(csvText).trim()
    ) {
      throw new Error(
        'The generated CSV is empty.'
      );
    }

    const blob =
      new Blob(
        [`\uFEFF${csvText}`],
        {
          type:
            'text/csv;charset=utf-8',
        }
      );

    triggerDownload(
      blob,
      filename
    );
  };

  /* ======================================================
     SAVE HISTORY
     ====================================================== */

  const saveReportHistory = ({
    reportType,
    format,
    reportData,
    filters,
  }) =>
    api.post(
      '/reports/record',
      {
        report_type:
          reportType,
        format,
        filters,
        report_data:
          reportData,
      }
    );

  /* ======================================================
     GENERATE PDF
     ====================================================== */

  const downloadPdf =
    async () => {
      console.log('=== DOWNLOAD PDF BUTTON CLICKED ===');
      if (
        !isAnalytics &&
        !selectedRecords.length
      ) {
        toast.error(
          'Please select at least one record before generating the PDF.'
        );

        return;
      }

      if (
        isAnalytics &&
        !analyticsData
      ) {
        toast.error(
          'Please load the analytical summary first.'
        );

        return;
      }

      if (
        !validateFilters()
      ) {
        return;
      }

      if (busy === 'pdf') {
        return;
      }

      setBusy('pdf');

      try {
        const reportType =
          type;

        const label =
          getReportLabel(
            reportType
          );

        const filters =
          getEffectiveFilters();

        const doc =
          new jsPDF({
            orientation:
              'portrait',
            unit: 'mm',
            format: 'letter',
          });

        const pageWidth =
          doc.internal.pageSize.getWidth();

        const pageHeight =
          doc.internal.pageSize.getHeight();

        const margin = 14;

        const contentWidth =
          pageWidth -
          margin * 2;

        const tableBase = {
          theme: 'grid',
          margin: {
            left: margin,
            right: margin,
            bottom: 20,
          },
          headStyles: {
            fillColor: [
              250,
              220,
              222,
            ],
            textColor: RED,
            fontStyle:
              'bold',
          },
        };

        /* ==================================================
           HEADER
           ================================================== */

        const now =
          new Date();

        const pad =
          (number) =>
            String(
              number
            ).padStart(
              2,
              '0'
            );

        const generatedText =
          now.toLocaleString();

        const reportId =
          `RPT-${now.getFullYear()}-${pad(
            now.getMonth() + 1
          )}${pad(
            now.getDate()
          )}-${pad(
            now.getHours()
          )}${pad(
            now.getMinutes()
          )}${pad(
            now.getSeconds()
          )}`;

        const generatedBy =
          localStorage.getItem(
            'username'
          ) ||
          localStorage.getItem(
            'full_name'
          ) ||
          'Staff';

        doc.setFillColor(
          ...MAROON
        );

        doc.rect(
          0,
          0,
          pageWidth,
          34,
          'F'
        );

        doc.setTextColor(
          255,
          255,
          255
        );

        doc.setFont(
          'helvetica',
          'bold'
        );

        doc.setFontSize(16);

        doc.text(
          label,
          margin,
          20
        );

        doc.setFont(
          'helvetica',
          'normal'
        );

        doc.setFontSize(10);

        doc.text(
          `Generated ${generatedText} • Report ID: ${reportId}`,
          margin,
          28
        );

        /* ==================================================
           INFO BOXES
           ================================================== */

        const infoY = 40;
        const infoH = 30;

        const boxWidth =
          contentWidth / 4;

        const info = [
          [
            'REPORT TYPE',
            label,
          ],
          [
            'DATE RANGE',
            filters.dateRange,
          ],
          [
            'PUROK',
            filters.purok,
          ],
          [
            'GENERATED BY',
            generatedBy,
          ],
        ];

        info.forEach(
          (
            [heading, value],
            index
          ) => {
            const x =
              margin +
              index *
                boxWidth;

            doc.setFillColor(
              255,
              255,
              255
            );

            doc.setDrawColor(
              210,
              210,
              210
            );

            doc.rect(
              x,
              infoY,
              boxWidth,
              infoH,
              'FD'
            );

            doc.setFont(
              'helvetica',
              'bold'
            );

            doc.setFontSize(
              9.5
            );

            doc.setTextColor(
              ...GRAY
            );

            doc.text(
              heading,
              x + 4,
              infoY + 12
            );

            doc.setFontSize(
              9
            );

            doc.setTextColor(
              ...DARK
            );

            const text =
              String(
                value
              );

            doc.text(
              text.length >
                25
                ? `${text.substring(
                    0,
                    25
                  )}...`
                : text,
              x + 4,
              infoY + 19
            );
          }
        );

        let currentY =
          infoY +
          infoH +
          10;

        if (
          filters.dateRange ===
          'Custom'
        ) {
          doc.setFont(
            'helvetica',
            'normal'
          );

          doc.setFontSize(7);

          doc.setTextColor(
            ...GRAY
          );

          doc.text(
            `Custom Date Range: ${filters.startDate} to ${filters.endDate}`,
            margin,
            currentY - 3
          );
        }

        /* ==================================================
           ANALYTICS PDF
           ================================================== */

        if (
          reportType ===
          'analytics'
        ) {
          const data =
            getAnalyticsData(
              analyticsData
            );

          drawSectionTitle(
            doc,
            'Analytical Summary',
            margin,
            currentY
          );

          currentY += 6;

          drawStatCards(
            doc,
            [
              [
                'HOUSEHOLDS',
                data.total_households,
              ],
              [
                'HIGHLY VULNERABLE',
                data.highly_vulnerable,
              ],
              [
                'APPROVAL RATE',
                `${data.approval_rate}%`,
              ],
              [
                'COVERAGE',
                `${data.coverage}%`,
              ],
            ],
            {
              x: margin,
              y: currentY,
              width:
                contentWidth,
            }
          );

          currentY += 35;

          const CHART_COLORS = [
          [116, 31, 45],   // Maroon
          [178, 58, 72],   // Red
          [201, 137, 68],  // Gold
          [69, 105, 144],  // Blue
          [84, 122, 87],   // Green
          [126, 87, 194],  // Purple
          [0, 140, 140],   // Teal
          [120, 120, 120], // Gray
          [224, 167, 181], // Light pink
          [82, 65, 56],    // Brown
        ];

        const VULNERABILITY_COLORS = {
          'highly vulnerable': [116, 31, 45],
          'high vulnerability': [116, 31, 45],
          'moderately vulnerable': [201, 137, 68],
          'moderate vulnerability': [201, 137, 68],
          'low vulnerability': [84, 122, 87],
          'not vulnerable': [69, 105, 144],
          'unclassified': [120, 120, 120],
        };

        const VALIDATION_COLORS = {
          approved: [84, 122, 87],
          rejected: [178, 58, 72],
          pending: [201, 137, 68],
          validated: [69, 105, 144],
        };

          
const charts = [
  {
    title: 'Households by Purok',
    rows: getAnalyticsPurokRows(data),
    color: CHART_COLORS,
    colorMode: 'individual',
    height: 65,
    sort: false,
  },
  {
    title: 'Vulnerability Distribution',
    rows: getAnalyticsVulnerabilityRows(data),
    color: VULNERABILITY_COLORS,
    colorMode: 'category',
    height: 65,
  },
  {
    title: 'Assistance Distribution by Program',
    rows: getAnalyticsDistributionRows(data),
    color: CHART_COLORS,
    colorMode: 'individual',
    height: 70,
  },
  {
    title: 'Validation Outcome',
    rows: getAnalyticsValidationRows(data),
    color: VALIDATION_COLORS,
    colorMode: 'category',
    height: 45,
    sort: false,
  },
];

          charts.forEach(
            (chart) => {
              currentY =
                drawBarChart(
                  doc,
                  {
                    ...chart,
                    x: margin,
                    y: currentY,
                    width:
                      contentWidth,
                  }
                );

              currentY += 4;
            }
          );

          if (
            currentY >
            pageHeight - 60
          ) {
            doc.addPage();
            currentY = 20;
          }

          drawSectionTitle(
            doc,
            'Detailed Analytics',
            margin,
            currentY
          );

          currentY += 5;

          autoTable(doc, {
            ...tableBase,
            startY:
              currentY,

            head: [
              [
                'METRIC',
                'VALUE',
              ],
            ],

            body: [
              [
                'Total Households',
                data.total_households,
              ],
              [
                'Highly Vulnerable',
                data.highly_vulnerable,
              ],
              [
                'Approved Households',
                data.approved_household_count,
              ],
              [
                'Rejected',
                data.rejected_count,
              ],
              [
                'Decided Households',
                data.decided_household_count,
              ],
              [
                'Approval Rate',
                `${data.approval_rate}%`,
              ],
              [
                'Coverage',
                `${data.coverage}%`,
              ],
            ],

            styles: {
              font:
                'helvetica',
              fontSize: 10,
              cellPadding: 3,
              textColor: [
                80,
                80,
                80,
              ],
            },
          });

          currentY =
            (
              doc
                .lastAutoTable
                ?.finalY ||
              currentY + 40
            ) + 8;

          if (
            currentY >
            pageHeight - 50
          ) {
            doc.addPage();
            currentY = 20;
          }

          autoTable(doc, {
            ...tableBase,
            startY:
              currentY,

            head: [
              [
                'VULNERABILITY',
                'HOUSEHOLDS',
              ],
            ],

            body:
              getAnalyticsVulnerabilityRows(
                data
              ).map(
                (row) => [
                  row.label,
                  row.value,
                ]
              ),

            styles: {
              font:
                'helvetica',
              fontSize: 9.5,
              cellPadding: 2.5,
              textColor: [
                80,
                80,
                80,
              ],
            },
          });
        }

        /* ==================================================
           NORMAL REPORT PDF
           ================================================== */

        else {
          const rows =
            selectedRecords;

          const purokSet =
            new Set(
              rows
                .map(
                  (row) =>
                    String(
                      getPurok(
                        row
                      ) ?? ''
                    ).trim()
                )
                .filter(
                  Boolean
                )
            );

          const statusOf =
            (row) =>
              String(
                getStatus(
                  row
                ) || ''
              ).toLowerCase();

          const validatedCount =
            rows.filter(
              (row) => {
                const status =
                  statusOf(
                    row
                  );

                return (
                  status.includes(
                    'valid'
                  ) &&
                  !status.includes(
                    'invalid'
                  )
                );
              }
            ).length;

          const approvedCount =
            rows.filter(
              (row) =>
                statusOf(
                  row
                ).includes(
                  'approved'
                )
            ).length;

          drawSectionTitle(
            doc,
            'Summary',
            margin,
            currentY
          );

          currentY += 6;

          drawStatCards(
            doc,
            [
              [
                'SELECTED RECORDS',
                rows.length,
              ],
              [
                'PUROKS',
                purokSet.size,
              ],
              [
                'VALIDATED',
                validatedCount,
              ],
              [
                'APPROVED',
                approvedCount,
              ],
            ],
            {
              x: margin,
              y: currentY,
              width:
                contentWidth,
            }
          );

          currentY += 35;

          drawSectionTitle(
            doc,
            'Selected Records',
            margin,
            currentY
          );

          currentY += 5;

          const reportColumns = getReportColumns(reportType);

          autoTable(doc, {
            ...tableBase,
            startY: currentY,
            head: [reportColumns.map((column) => column.header.toUpperCase())],
            body: rows.map((row) =>
              reportColumns.map((column) => column.value(row))
            ),
            styles: {
              font: 'helvetica',
              fontSize: 9.5,
              cellPadding: 2.5,
              overflow: 'linebreak',
              textColor: [80, 80, 80],
            },
            headStyles: {
              ...tableBase.headStyles,
              fontSize: 9.5,
            },
            alternateRowStyles: {
              fillColor: [248, 248, 248],
            },
            columnStyles: Object.fromEntries(
              reportColumns.map((_, index) => [index, { cellWidth: 'auto' }])
            ),
          });
        }

        /* ==================================================
           FOOTER
           ================================================== */

        const pageCount =
          doc.getNumberOfPages();

        for (
          let page = 1;
          page <= pageCount;
          page++
        ) {
          doc.setPage(page);

          doc.setDrawColor(
            215,
            215,
            215
          );

          doc.line(
            margin,
            pageHeight - 15,
            pageWidth -
              margin,
            pageHeight - 15
          );

          doc.setFont(
            'helvetica',
            'normal'
          );

          doc.setFontSize(10);

          doc.setTextColor(
            ...GRAY
          );

          doc.text(
            'BPLPIC-HD — Barangay Luinab, Iligan City, 9200',
            margin,
            pageHeight - 8
          );

          doc.text(
            `Page ${page} of ${pageCount}`,
            pageWidth -
              margin,
            pageHeight - 8,
            {
              align:
                'right',
            }
          );
        }

        /* ==================================================
           ACTUAL PDF DOWNLOAD
           ================================================== */

        const safeType =
          String(
            reportType
          ).replace(
            /[^a-zA-Z0-9-_]/g,
            '-'
          );

        const timestamp =
          new Date()
            .toISOString()
            .replace(
              /[:.]/g,
              '-'
            );

        const filename =
          `${safeType}-report-${timestamp}.pdf`;

        /*
         * IMPORTANT:
         *
         * Convert jsPDF to a Blob first.
         * Then use the browser's download
         * mechanism.
         */
        const pdfBlob = new Blob([doc.output('arraybuffer')], {
  type: 'application/octet-stream', // stops browsers/extensions from hijacking the PDF
});

try {
  triggerDownload(pdfBlob, filename);
} catch (downloadError) {
  console.warn('Blob download failed, falling back to doc.save():', downloadError);
  doc.save(filename);
}

        toast.success(
          'PDF downloaded successfully.'
        );

        setShowPreview(false);

        /* ==================================================
           SAVE HISTORY
           ================================================== */

        try {
          await saveReportHistory({
            reportType,
            format: 'PDF',
            filters,
            reportData:
              isAnalytics
                ? analyticsData
                : selectedRecords,
          });

          await load();
        } catch (
          historyError
        ) {
          console.error(
            'Failed to save PDF history:',
            historyError
          );

          toast.error(
            'PDF downloaded, but report history could not be saved.'
          );
        }
      } catch (error) {
        console.error(
          'PDF generation error:',
          error
        );

        toast.error(
          error?.message ||
            'Failed to generate PDF report.'
        );
      } finally {
        setBusy('');
      }
    };

  /* ======================================================
     CSV BUILDERS
     ====================================================== */

  const buildAnalyticsCsv =
    (analytics) => {
      const data =
        getAnalyticsData(
          analytics
        );

      const section = (
        title,
        headers,
        rows
      ) => [
        [title, ''],
        headers,
        ...rows.map(
          (row) => [
            row.label,
            row.value,
          ]
        ),
        ['', ''],
      ];

      return rowsToCsv([
        [
          'ANALYTICAL SUMMARY',
          '',
        ],

        [
          'Metric',
          'Value',
        ],

        [
          'Total Households',
          data.total_households,
        ],

        [
          'Highly Vulnerable',
          data.highly_vulnerable,
        ],

        [
          'Approved Households',
          data.approved_household_count,
        ],

        [
          'Rejected',
          data.rejected_count,
        ],

        [
          'Decided Households',
          data.decided_household_count,
        ],

        [
          'Approval Rate',
          `${data.approval_rate}%`,
        ],

        [
          'Coverage',
          `${data.coverage}%`,
        ],

        ['', ''],

        ...section(
          'HOUSEHOLDS BY PUROK',
          [
            'Purok',
            'Households',
          ],
          getAnalyticsPurokRows(
            data
          )
        ),

        ...section(
          'VULNERABILITY DISTRIBUTION',
          [
            'Classification',
            'Households',
          ],
          getAnalyticsVulnerabilityRows(
            data
          )
        ),

        ...section(
          'ASSISTANCE DISTRIBUTION',
          [
            'Program',
            'Released',
          ],
          getAnalyticsDistributionRows(
            data
          )
        ),

        ...section(
          'VALIDATION OUTCOME',
          [
            'Outcome',
            'Households',
          ],
          getAnalyticsValidationRows(
            data
          )
        ),
      ]);
    };

  const buildRecordsCsv = (rows, reportType = type) => {
    const columns = getReportColumns(reportType);

    return rowsToCsv([
      columns.map((column) => column.header),
      ...rows.map((row) => columns.map((column) => column.value(row))),
    ]);
  };

  /* ======================================================
     DOWNLOAD CSV
     ====================================================== */

  const downloadCsv = async (
    reportType = type,
    historyReport = null
  ) => {
    const isHistoryDownload =
      Boolean(
        historyReport
      );

    if (
      !isHistoryDownload &&
      !validateFilters()
    ) {
      return;
    }

    const busyKey =
      `csv-${reportType}`;

    if (busy === busyKey) {
      return;
    }

    setBusy(busyKey);

    try {
      /* ================================================
         HISTORY CSV
         ================================================ */

      if (isHistoryDownload) {
        const savedData =
          getHistoryData(
            historyReport
          );

        if (
          reportType ===
          'analytics'
        ) {
          if (
            !savedData ||
            typeof savedData !==
              'object'
          ) {
            throw new Error(
              'No saved analytical data is available.'
            );
          }

          const csv =
            buildAnalyticsCsv(
              savedData
            );

          downloadCsvText(
            csv,
            `analytics-history-${Date.now()}.csv`
          );

          toast.success(
            'Historical analytical CSV downloaded successfully.'
          );

          return;
        }

        const rows =
          Array.isArray(
            savedData
          )
            ? savedData
            : [];

        if (!rows.length) {
          throw new Error(
            'No saved report data is available.'
          );
        }

        const csv = buildRecordsCsv(rows, reportType);

        downloadCsvText(
          csv,
          `${reportType}-history-${Date.now()}.csv`
        );

        toast.success(
          'Historical CSV downloaded successfully.'
        );

        return;
      }

      /* ================================================
         CURRENT CSV
         ================================================ */

      let csvText;
      let reportData;

      if (
        reportType ===
        'analytics'
      ) {
        if (!analyticsData) {
          throw new Error(
            'Please load the analytical summary first.'
          );
        }

        csvText =
          buildAnalyticsCsv(
            analyticsData
          );

        reportData =
          analyticsData;
      } else {
        if (
          !selectedRecords.length
        ) {
          throw new Error(
            'Please select at least one record for CSV export.'
          );
        }

        csvText = buildRecordsCsv(selectedRecords, reportType);

        reportData =
          selectedRecords;
      }

      const filename =
        `${reportType}-report-${Date.now()}.csv`;

      downloadCsvText(
        csvText,
        filename
      );

      toast.success(
        'CSV downloaded successfully.'
      );

      /* ================================================
         SAVE HISTORY
         ================================================ */

      try {
        await saveReportHistory({
          reportType,
          format: 'CSV',
          filters:
            getEffectiveFilters(),
          reportData,
        });

        await load();
      } catch (
        historyError
      ) {
        console.error(
          'Failed to save CSV history:',
          historyError
        );

        toast.error(
          'CSV downloaded, but report history could not be saved.'
        );
      }
    } catch (error) {
      console.error(
        'CSV download error:',
        error
      );

      toast.error(
        error?.message ||
          'Failed to download CSV report.'
      );
    } finally {
      setBusy('');
    }
  };

  /* ======================================================
     RENDER
     ====================================================== */

  const previewFilters =
    getEffectiveFilters();

  const viewingFilters =
    viewingReport
      ? getHistoryFilters(
          viewingReport
        )
      : {};

  return (
    <div className="space-y-6">
      <Toaster
        position="top-right"
        toastOptions={{
          duration: 3000,
        }}
      />

      {/* PAGE HEADER */}

      <div className="mt-5 ">
        <PageHeader
          title="Generate Reports"
          subtitle="Barangay reports."
        />
      </div> 
      

      {/* REPORT BUILDER */}

      <Band title="Report Builder">
        <form
          className="grid grid-cols-1 items-end gap-5 md:grid-cols-4"
          onSubmit={(event) => {
            event.preventDefault();
            loadRecords();
          }}
        >
          <Select
            label="REPORT TYPE"
            value={type}
            onChange={(event) => {
  setType(event.target.value);
  setAssistanceProgram('');
  resetLoaded();
}}
          >
            {TYPES.map(
              ([
                reportType,
                label,
              ]) => (
                <option
                  key={
                    reportType
                  }
                  value={
                    reportType
                  }
                >
                  {label}
                </option>
              )
            )}
          </Select>

          <Select
            label="DATE RANGE"
            value={dateRange}
            onChange={(event) => {
              const value =
                event.target.value;

              setDateRange(
                value
              );

              resetLoaded();

              if (
                value !==
                'Custom'
              ) {
                setStartDate(
                  ''
                );
                setEndDate(
                  ''
                );
              }
            }}
          >
            <option value="This Month">
              This Month
            </option>

            <option value="Last Month">
              Last Month
            </option>

            <option value="This Year">
              This Year
            </option>

            <option value="Custom">
              Custom
            </option>
          </Select>

          <Select
            label="PUROK"
            value={purok}
            onChange={(event) => {
              setPurok(
                event.target.value
              );

              resetLoaded();
            }}
          >
            <option value="All Puroks">
              All Puroks
            </option>

            {PUROKS.map(
              (purokNumber) => (
                <option
                  key={
                    purokNumber
                  }
                  value={
                    purokNumber
                  }
                >
                  Purok {purokNumber}
                </option>
              )
            )}
          </Select>
          {type === 'distribution' && (
  <Select
    label="ASSISTANCE PROGRAM"
    value={assistanceProgram}
    onChange={(event) => {
      setAssistanceProgram(event.target.value);
      resetLoaded();
    }}
  >
    <option value="">
      {loadingPrograms
        ? 'Loading programs...'
        : 'Select an assistance program'}
    </option>

    {assistancePrograms.map((program) => {
      const id =
        program.program_id ??
        program.id;

      const name =
        program.program_name ??
        program.name ??
        program.title;

      if (id == null || !name) return null;

      return (
        <option key={id} value={String(id)}>
          {name}
        </option>
      );
    })}
  </Select>
)}

          <div className="flex justify-start">
            <Button
              type="submit"
              variant="maroon"
              disabled={
                loadingRecords
              }
              className="w-full"
            >
              {loadingRecords
                ? 'Loading…'
                : '▣ Load Records'}
            </Button>
            
          </div>

          {dateRange ===
            'Custom' && (
            <>
              <Input
                label="START DATE"
                type="date"
                value={
                  startDate
                }
                onChange={(event) => {
                  setStartDate(
                    event.target
                      .value
                  );
                  resetLoaded();
                }}
              />

              <Input
                label="END DATE"
                type="date"
                value={
                  endDate
                }
                onChange={(event) => {
                  setEndDate(
                    event.target
                      .value
                  );
                  resetLoaded();
                }}
              />
            </>
          )}
        </form>
      </Band>

      {/* ANALYTICS */}

      {isAnalytics &&
        analyticsData && (
          <Band title="Analytical Summary">
            <AnalyticsSummary
              analytics={
                analyticsData
              }
            />

            <div className="mt-6 flex flex-wrap gap-3">
              <Button
                type="button"
                variant="maroon"
                onClick={
                  handlePreview
                }
              >
                Preview Report
              </Button>

              <Button
                type="button"
                variant="maroon"
                disabled={
                  busy ===
                  'csv-analytics'
                }
                onClick={() =>
                  downloadCsv(
                    'analytics'
                  )
                }
              >
                {busy ===
                'csv-analytics'
                  ? 'Preparing…'
                  : 'Generate CSV'}
              </Button>
            </div>
          </Band>
        )}

      {/* NORMAL RECORD SELECTION */}

      {!isAnalytics &&
        records.length >
          0 && (
          <Band
            title={`Select Records (${selectedRecords.length} selected)`}
          >
            <div className="mb-4 flex flex-wrap items-center gap-3">
              <Button
                type="button"
                variant="maroon"
                onClick={
                  selectAll
                }
                disabled={
                  allSelected
                }
              >
                Select All
              </Button>

              <Button
                type="button"
                variant="secondary"
                onClick={
                  clearSelection
                }
                disabled={
                  !selectedIds.length
                }
              >
                Clear Selection
              </Button>

              <Button
                type="button"
                variant="maroon"
                onClick={
                  handlePreview
                }
                disabled={
                  !selectedRecords.length
                }
              >
                Preview Report
              </Button>
            </div>

            <div className="max-h-[500px] overflow-x-auto overflow-y-auto rounded-lg border border-gray-200">
              <table className="w-full text-left">
                <thead className="sticky top-0 z-20 bg-[#FFD7D7]">
                  <tr className="border-b text-2xl font-semibold text-[#6E2430]">
                    {[
                      'Select',
                      'Household',
                      'Purok',
                      'Classification',
                      'Status',
                      'Date',
                    ].map(
                      (
                        heading
                      ) => (
                        <th
                          key={
                            heading
                          }
                          className="px-4 py-3"
                        >
                          {
                            heading
                          }
                        </th>
                      )
                    )}
                  </tr>
                </thead>

                <tbody>
                  {records.map(
                    (
                      row,
                      index
                    ) => {
                      const selected =
                        isSelected(
                          row,
                          index
                        );

                      return (
                        <tr
                          key={getRecordKey(
                            row,
                            index
                          )}
                          className={`border-t ${
                            selected
                              ? 'bg-[#FFF0F0]'
                              : ''
                          }`}
                        >
                          <td className="px-4 py-3">
                            <input
                              type="checkbox"
                              checked={
                                selected
                              }
                              onChange={() =>
                                toggleRecord(
                                  row,
                                  index
                                )
                              }
                              className="h-5 w-5"
                            />
                          </td>

                          <td className="px-4 py-3 text-xl font-semibold">
                            {getHouseholdName(
                              row
                            ) || '—'}
                          </td>

                          <td className="px-4 py-3 text-xl font-semibold">
                            {fmt(
                              getPurok(
                                row
                              )
                            )}
                          </td>

                          <td className="px-4 py-3 text-xl font-semibold">
                            {getClassification(
                              row
                            ) || '—'}
                          </td>

                          <td className="px-4 py-3 text-xl font-semibold">
                            {getStatus(
                              row
                            ) || '—'}
                          </td>

                          <td className="px-4 py-3 text-xl font-semibold">
                            {formatDate(
                              getRecordDate(
                                row
                              )
                            )}
                          </td>
                        </tr>
                      );
                    }
                  )}
                </tbody>
              </table>
            </div>
          </Band>
        )}

      {/* REPORT HISTORY */}

      {loading ? (
        <Spinner />
      ) : (
        <Band title="Report History">
          <div className="overflow-y-auto rounded-lg">
            <Table
              head={[
                'Report Name',
                'Type',
                'Format',
                'Generated By',
                'Date',
                'Action',
              ]}
            >
              {reports.map(
                (
                  report,
                  index
                ) => (
                  <tr
                    key={
                      report.report_id ||
                      report.id ||
                      `${report.report_type}-${report.report_date}-${report.format}-${index}`
                    }
                  >
                    <td className="px-3 py-2 text-xl font-semibold">
                      {getReportLabel(
                        report.report_type
                      )}
                    </td>

                    <td className="px-3 py-2">
                      <Badge tone="blue">
                        {
                          report.report_type
                        }
                      </Badge>
                    </td>

                    <td className="px-3 py-2 text-xl font-semibold">
                      {report.format ||
                        'PDF'}
                    </td>

                    <td className="px-3 py-2 text-xl font-semibold">
                      {report.generated_by ||
                        '—'}
                    </td>

                    <td className="px-3 py-2 text-xl font-semibold">
                      {formatDateTime(
                        report.report_date
                      )}
                    </td>

                    <td className="px-3 py-2">
                      <div className="flex gap-4">
                        <button
                          type="button"
                          className="text-xl font-semibold text-[#6E2430] hover:underline"
                          onClick={() =>
                            setViewingReport(
                              report
                            )
                          }
                        >
                          View
                        </button>

                        <button
                          type="button"
                          className="text-xl font-semibold text-[#6E2430] hover:underline disabled:opacity-50"
                          disabled={
                            busy ===
                            `csv-${report.report_type}`
                          }
                          onClick={() =>
                            downloadCsv(
                              report.report_type,
                              report
                            )
                          }
                        >
                          Download CSV
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              )}

              {!reports.length && (
                <tr>
                  <td
                    colSpan={6}
                    className="px-3 py-6 text-center text-gray-400"
                  >
                    No reports generated yet.
                  </td>
                </tr>
              )}
            </Table>
          </div>
        </Band>
      )}

      {/* CURRENT REPORT PREVIEW */}

      {showPreview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="flex max-h-[90vh] w-full max-w-7xl flex-col overflow-hidden rounded-xl bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b bg-[#6E2430] px-6 py-4 text-white">
              <div>
                <h2 className="text-3xl font-bold">
                  Report Preview
                </h2>

                <p className="mt-1 text-xl opacity-90">
                  {getReportLabel(
                    type
                  )}
                </p>
              </div>

              <button
                type="button"
                onClick={() =>
                  setShowPreview(
                    false
                  )
                }
                className="text-4xl font-bold hover:opacity-75"
              >
                ×
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6">
              <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-4">
                <InfoBox label="REPORT TYPE">
                  {getReportLabel(
                    type
                  )}
                </InfoBox>

                <InfoBox
                  label="DATE RANGE"
                  sub={
                    previewFilters.dateRange ===
                    'Custom'
                      ? `${previewFilters.startDate} to ${previewFilters.endDate}`
                      : null
                  }
                >
                  {
                    previewFilters.dateRange
                  }
                </InfoBox>

                <InfoBox label="PUROK">
                  {
                    previewFilters.purok
                  }
                </InfoBox>

                <InfoBox label="RECORDS">
                  {isAnalytics
                    ? getAnalyticsData(
                        analyticsData
                      ).total_households
                    : selectedRecords.length}
                </InfoBox>
              </div>

              {isAnalytics ? (
                <AnalyticsSummary
                  analytics={
                    analyticsData
                  }
                />
              ) : (
                <ReadOnlyRowsTable
                  rows={selectedRecords}
                  type={type}
                  minWidth={1200}
                  maxHeight
                />
              )}
            </div>

            <div className="flex flex-wrap justify-end gap-3 border-t bg-gray-50 px-6 py-4">
              <Button
                type="button"
                variant="secondary"
                onClick={() =>
                  setShowPreview(
                    false
                  )
                }
              >
                Back
              </Button>

              <Button
  type="button"
  onClick={downloadPdf}
  disabled={busy === 'pdf'}
>
  {busy === 'pdf' ? 'Generating...' : 'Generate PDF'}
</Button>
            </div>
          </div>
        </div>
      )}

      {/* HISTORY VIEWER */}

      {viewingReport && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4">
          <div className="flex max-h-[90vh] w-full max-w-6xl flex-col overflow-hidden rounded-xl bg-white shadow-2xl">
            <div className="flex items-center justify-between bg-[#6E2430] px-6 py-4 text-white">
              <div>
                <h2 className="text-2xl font-bold">
                  Report History
                </h2>

                <p className="text-xl opacity-90">
                  {getReportLabel(
                    viewingReport.report_type
                  )}
                </p>
              </div>

              <button
                type="button"
                onClick={() =>
                  setViewingReport(
                    null
                  )
                }
                className="text-3xl font-bold hover:opacity-75"
              >
                ×
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6">
              <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-4">
                <InfoBox label="REPORT TYPE">
                  {getReportLabel(
                    viewingReport.report_type
                  )}
                </InfoBox>

                <InfoBox label="FORMAT">
                  {viewingReport.format ||
                    'PDF'}
                </InfoBox>

                <InfoBox label="GENERATED BY">
                  {viewingReport.generated_by ||
                    '—'}
                </InfoBox>

                <InfoBox label="GENERATED DATE">
                  {formatDateTime(
                    viewingReport.report_date
                  )}
                </InfoBox>
              </div>

              {Object.keys(
                viewingFilters
              ).length > 0 && (
                <div className="mb-6 rounded-lg border bg-gray-50 p-4">
                  <h3 className="mb-3 text-xl font-bold text-[#6E2430]">
                    Saved Filters
                  </h3>

                  <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
                    <div>
                      <p className="text-sm font-bold text-gray-500">
                        DATE RANGE
                      </p>

                      <p className="text-lg font-semibold">
                        {viewingFilters.dateRange ||
                          '—'}
                      </p>
                    </div>

                    <div>
                      <p className="text-sm font-bold text-gray-500">
                        PUROK
                      </p>

                      <p className="text-lg font-semibold">
                        {viewingFilters.purok ||
                          '—'}
                      </p>
                    </div>

                    <div>
                      <p className="text-sm font-bold text-gray-500">
                        START DATE
                      </p>

                      <p className="text-lg font-semibold">
                        {viewingFilters.startDate
                          ? formatDate(
                              viewingFilters.startDate
                            )
                          : '—'}
                      </p>
                    </div>

                    <div>
                      <p className="text-sm font-bold text-gray-500">
                        END DATE
                      </p>

                      <p className="text-lg font-semibold">
                        {viewingFilters.endDate
                          ? formatDate(
                              viewingFilters.endDate
                            )
                          : '—'}
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {viewingReport.report_type ===
              'analytics' ? (
                <AnalyticsSummary
                  analytics={getHistoryData(
                    viewingReport
                  )}
                />
              ) : (
                <ReadOnlyRowsTable
                  rows={getHistoryRows(viewingReport)}
                  type={viewingReport.report_type}
                />
              )}
            </div>

            <div className="flex flex-wrap justify-end gap-3 border-t bg-gray-50 px-6 py-4">
              <Button
                type="button"
                variant="maroon"
                disabled={
                  busy ===
                  `csv-${viewingReport.report_type}`
                }
                onClick={() =>
                  downloadCsv(
                    viewingReport.report_type,
                    viewingReport
                  )
                }
              >
                {busy ===
                `csv-${viewingReport.report_type}`
                  ? 'Preparing…'
                  : 'Download CSV'}
              </Button>

              <Button
                type="button"
                variant="secondary"
                onClick={() =>
                  setViewingReport(
                    null
                  )
                }
              >
                Close
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}