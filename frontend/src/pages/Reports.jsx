import { useEffect, useState } from 'react';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import toast from 'react-hot-toast';
import ExcelJS from 'exceljs';

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
  ['incomplete', 'Incomplete Assistance Information Report'],
  ['analytics', 'Analytical Summary'],
];

const PUROKS = ['1', '1-A', '2', '2-A', '3', '3-A', '4', '5', '5-A', '5-B', '5-C', '6', '6-A', '7', '7-A', '8', '8-A', '9', '9A'];

const MAROON = [116, 31, 45];
const LIGHT_RED = [250, 235, 237];
const RED = [220, 20, 45];
const GRAY = [105, 105, 105];
const DARK = [35, 35, 35];

/* Shared look-and-feel classes */
const ui = {
  th: 'px-4 py-3 text-xl font-bold text-[#6E2430] whitespace-nowrap',
  td: 'px-4 py-3 text-xl text-gray-700',
  tdStrong: 'px-4 py-3 text-xl font-semibold text-gray-900',
  label: 'text-lg font-semibold text-gray-500',
  card: 'rounded-2xl border border-gray-200 bg-white shadow-sm',
  link: 'text-xl font-semibold text-[#6E2430] hover:underline disabled:opacity-50',
};

const PILL_TONES = {
  red: 'bg-red-50 text-red-700 ring-red-200',
  amber: 'bg-amber-50 text-amber-700 ring-amber-200',
  green: 'bg-green-50 text-green-700 ring-green-200',
  blue: 'bg-blue-50 text-blue-700 ring-blue-200',
  gray: 'bg-gray-100 text-gray-600 ring-gray-200',
};

/* ======================================================
   GENERAL HELPERS
   ====================================================== */

function fmt(value) {
  if (value === null || value === undefined || value === '') return '—';
  if (Array.isArray(value)) return value.join('; ');
  return String(value);
}

function getReportLabel(type) {
  return TYPES.find(([reportType]) => reportType === type)?.[1] || type || 'Report';
}

function toneForVulnerability(value) {
  const v = String(value || '').toLowerCase();
  if (v.includes('high')) return 'red';
  if (v.includes('moderate') || v.includes('medium')) return 'amber';
  if (v.includes('low')) return 'green';
  return 'gray';
}

function toneForFormat(format) {
  const f = String(format || 'PDF').toUpperCase();
  if (f === 'CSV') return 'green';
  if (f === 'EXCEL') return 'blue';
  return 'red';
}

/* ======================================================
   RECORD HELPERS
   ====================================================== */

function getRecordKey(row, index) {
  const base =
    row?.validation_id ||
    row?.household_id ||
    row?.report_id ||
    row?.id ||
    `${row?.classification || 'record'}-${row?.household_head_name || row?.household_name || 'household'}-${row?.purok || ''}`;

  return `${base}-${index}`;
}

function getHouseholdName(row) {
  return row?.household_head_name || row?.household_name || row?.household || row?.head_name || row?.name || null;
}

function getPurok(row) {
  return row?.purok ?? row?.purok_number ?? row?.purok_name ?? null;
}

function getClassification(row) {
  return row?.vulnerability || row?.classification || row?.vulnerability_level || row?.vulnerability_status || null;
}

function getStatus(row) {
  return row?.validation_status || row?.approval_status || null;
}

function parseReportValue(value, fallback = null) {
  if (value === null || value === undefined || value === '') return fallback;
  if (typeof value !== 'string') return value;

  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

function getHistoryFilters(report) {
  const parsed = parseReportValue(report?.filters, {});
  return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
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
  return rows.map((row) => row.map(escapeCsv).join(',')).join('\n');
}

function isHighOrMediumVulnerability(row) {
  const value = String(row?.vulnerability || row?.classification || row?.vulnerability_level || '')
    .trim()
    .toLowerCase();

  return [
    'high',
    'medium',
    'high vulnerable',
    'moderate vulnerable',
    'high vulnerability',
    'moderate vulnerability',
  ].includes(value);
}

function hasNonEmptyItem(list) {
  return list.some((item) => String(item || '').trim() !== '');
}

function hasIncomeProofValue(value) {
  if (Array.isArray(value)) return hasNonEmptyItem(value);

  if (typeof value === 'string') {
    const text = value.trim();
    if (!text || text === '[]' || text === 'null') return false;

    try {
      const parsed = JSON.parse(text);
      if (Array.isArray(parsed)) return hasNonEmptyItem(parsed);
    } catch {
      // A non-empty storage path is also valid.
    }

    return true;
  }

  return false;
}

function hasSuggestedProgram(row) {
  const programs = row?.suggested_programs;

  if (Array.isArray(programs)) return hasNonEmptyItem(programs);

  if (typeof programs === 'string') {
    const value = programs.trim();
    if (!value || value === '{}' || value === '[]') return false;

    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) return parsed.length > 0;
    } catch {
      // Continue checking a non-JSON string.
    }

    return true;
  }

  return false;
}

function isIncompleteAssistanceInformation(row) {
  return isHighOrMediumVulnerability(row) && !hasSuggestedProgram(row);
}

/* ======================================================
   DATE HELPERS
   ====================================================== */

function getRecordDate(row) {
  return row?.approved_at || row?.report_date || row?.created_at || null;
}

function formatDate(value) {
  if (!value) return '—';

  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [year, month, day] = value.split('-').map(Number);
    return new Date(year, month - 1, day).toLocaleDateString('en-US', {
      month: 'short',
      day: '2-digit',
      year: 'numeric',
    });
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return fmt(value);

  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: '2-digit',
    year: 'numeric',
  });
}

function formatDateTime(value) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return fmt(value);
  return date.toLocaleString();
}

/* ======================================================
   REPORT COLUMNS
   ====================================================== */

function firstDefined(row, keys) {
  for (const key of keys) {
    const value = row?.[key];
    if (value !== null && value !== undefined && value !== '') return value;
  }
  return null;
}

function reportCell(value) {
  if (value === null || value === undefined || value === '') return '—';
  if (Array.isArray(value)) return value.join('; ');
  return String(value);
}

function formatPeso(value, { fixed = false } = {}) {
  if (value === null || value === undefined || value === '') return '—';

  const amount = Number(value);
  if (!Number.isFinite(amount)) return String(value);

  return `₱ ${amount.toLocaleString('en-PH', {
    minimumFractionDigits: fixed ? 2 : 0,
    maximumFractionDigits: 2,
  })}`;
}

function getReportColumns(reportType) {
  const column = (header, keys, formatter = reportCell) => ({
    header,
    key: header,
    value: (row) => formatter(firstDefined(row, keys)),
  });

  if (reportType === 'households') {
    return [
      column('Household Head', ['household_head_name', 'household_name', 'head_name', 'name']),
      column('Family Position', ['family_position']),
      column('Family Size', ['family_number', 'family_size', 'household_size']),
      column('Address', ['address', 'complete_address']),
      column('Purok', ['purok', 'purok_number', 'purok_name']),
      column('Occupation', ['occupation']),
      column('Monthly Income', ['monthly_income', 'income'], (value) => formatPeso(value)),
      column('Date Encoded', ['created_at', 'createdAt', 'report_date'], formatDate),
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

  if (reportType === 'incomplete') {
    return [
      column('Household Head', ['household_head_name', 'household_name', 'head_name', 'name']),
      column('Purok', ['purok', 'purok_number', 'purok_name']),
      column('Vulnerability', ['vulnerability', 'classification', 'vulnerability_level']),
      column('Monthly Income', ['household_monthly_income', 'monthly_income', 'income'], (value) =>
        formatPeso(value, { fixed: true })
      ),
      column('Income Proof', ['income_proof_images'], (value) =>
        hasIncomeProofValue(value) ? 'Uploaded' : 'Missing'
      ),
      column('Assistance Program', ['suggested_programs'], (value) =>
        hasSuggestedProgram({ suggested_programs: value }) ? reportCell(value) : 'No program detected'
      ),
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

/* Renders a table cell with a colored pill where it helps scanning. */
function renderCell(column, row) {
  const text = column.value(row);

  if (['Vulnerability', 'Classification'].includes(column.header) && text !== '—') {
    return <Pill tone={toneForVulnerability(text)}>{text}</Pill>;
  }

  if (column.header === 'Income Proof') {
    return <Pill tone={text === 'Uploaded' ? 'green' : 'red'}>{text}</Pill>;
  }

  if (column.header === 'Assistance Program' && text === 'No program detected') {
    return <span className="italic text-gray-400">{text}</span>;
  }

  if (['Validation Status', 'Status'].includes(column.header) && text !== '—') {
    const lower = String(text).toLowerCase();
    const tone = lower.includes('approved') || lower.includes('released')
      ? 'green'
      : lower.includes('reject') || lower.includes('invalid')
        ? 'red'
        : 'amber';
    return <Pill tone={tone}>{text}</Pill>;
  }

  return text;
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
    approved_household_count: 0,
    rejected_count: 0,
    decided_household_count: 0,
    approval_rate: 0,
    coverage: 0,
    high_vulnerable: 0,
  };
}

function getAnalyticsData(value) {
  if (!value || typeof value !== 'object') return emptyAnalytics();

  if (Array.isArray(value)) {
    const by_vulnerability = value.map((row) => ({
      vulnerability: getClassification(row) || 'Unclassified',
      n: Number(row?.count || 0),
    }));

    return {
      ...emptyAnalytics(),
      by_vulnerability,
      total_households: by_vulnerability.reduce((sum, row) => sum + row.n, 0),
    };
  }

  const arr = (v) => (Array.isArray(v) ? v : []);
  const num = (v) => Number(v || 0);

  return {
    total_households: num(value.total_households),
    by_purok: arr(value.by_purok),
    by_vulnerability: arr(value.by_vulnerability),
    validation_records: arr(value.validation_records),
    approved_household_count: num(value.approved_household_count),
    rejected_count: num(value.rejected_count),
    decided_household_count: num(value.decided_household_count),
    approval_rate: num(value.approval_rate),
    coverage: num(value.coverage),
    high_vulnerable: num(value.high_vulnerable),
  };
}

function getAnalyticsPurokRows(analytics) {
  return getAnalyticsData(analytics).by_purok.map((item) => ({
    label:
      item?.purok === undefined || item?.purok === null || String(item.purok).trim() === ''
        ? 'Unknown'
        : `Purok ${String(item.purok)}`,
    value: Number(item?.n || 0),
  }));
}

function getAnalyticsVulnerabilityRows(analytics) {
  return getAnalyticsData(analytics).by_vulnerability.map((item) => ({
    label: item?.vulnerability || 'Unclassified',
    value: Number(item?.n || 0),
  }));
}

function getAnalyticsValidationRows(analytics) {
  const data = getAnalyticsData(analytics);
  const undecided = Math.max(data.total_households - data.decided_household_count, 0);

  return [
    { label: 'Approved', value: data.approved_household_count },
    { label: 'Rejected', value: data.rejected_count },
    { label: 'Undecided', value: undecided },
  ];
}

function normalizeChartRows(rows, { sort = true, max = 8 } = {}) {
  if (!Array.isArray(rows)) return [];

  const clean = rows
    .map((row) => ({
      label: String(row?.label ?? 'Unknown'),
      value: Number(row?.value ?? 0),
    }))
    .filter((row) => Number.isFinite(row.value) && row.value >= 0);

  if (sort) clean.sort((a, b) => b.value - a.value);

  return clean.slice(0, max);
}

/*
 * One layout shared by CSV and Excel exports.
 * titles / headers hold row indexes so Excel can style every section.
 */
function buildAnalyticsSheet(analytics) {
  const data = getAnalyticsData(analytics);
  const rows = [];
  const titles = [];
  const headers = [];

  const addTitle = (text) => {
    titles.push(rows.length);
    rows.push([text, '']);
  };
  const addHeader = (cells) => {
    headers.push(rows.length);
    rows.push(cells);
  };
  const addSection = (title, head, items) => {
    addTitle(title);
    addHeader(head);
    items.forEach((row) => rows.push([row.label, row.value]));
    rows.push(['', '']);
  };

  addTitle('ANALYTICAL SUMMARY');
  addHeader(['Metric', 'Value']);
  rows.push(['Total Households', data.total_households]);
  rows.push(['Approved Households', data.approved_household_count]);
  rows.push(['Rejected', data.rejected_count]);
  rows.push(['Decided Households', data.decided_household_count]);
  rows.push(['Approval Rate', `${data.approval_rate}%`]);
  rows.push(['Coverage', `${data.coverage}%`]);
  rows.push(['', '']);

  addSection('HOUSEHOLDS BY PUROK', ['Purok', 'Households'], getAnalyticsPurokRows(data));
  addSection('HOUSEHOLDS BY VULNERABILITY', ['Classification', 'Households'], getAnalyticsVulnerabilityRows(data));
  addSection('VALIDATION OUTCOME', ['Outcome', 'Households'], getAnalyticsValidationRows(data));

  return { rows, titles, headers };
}

function buildRecordsSheet(rows, reportType) {
  const columns = getReportColumns(reportType);

  return {
    rows: [columns.map((c) => c.header), ...rows.map((row) => columns.map((c) => c.value(row)))],
    titles: [],
    headers: [0],
  };
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

function drawStatCards(doc, cards, { x, y, width }) {
  const gap = 5;
  const cardWidth = (width - gap * (cards.length - 1)) / cards.length;

  cards.forEach(([title, value], index) => {
    const cx = x + index * (cardWidth + gap);

    doc.setFillColor(...LIGHT_RED);
    doc.setDrawColor(230, 215, 215);
    doc.roundedRect(cx, y, cardWidth, 25, 2, 2, 'FD');

    doc.setTextColor(...RED);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(22);
    doc.text(String(value), cx + cardWidth / 2, y + 12, { align: 'center' });

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.setTextColor(...GRAY);
    doc.text(title, cx + cardWidth / 2, y + 20, { align: 'center' });
  });
}

function drawBarChart(
  doc,
  { title, rows, x, y, width, height = 70, color = MAROON, colorMode = 'single', sort = true }
) {
  const safeRows = normalizeChartRows(rows, { sort });
  const pageHeight = doc.internal.pageSize.getHeight();
  const rowHeight = Math.min(8, height / Math.max(safeRows.length, 1));
  const needed = 7 + Math.max(safeRows.length, 2) * rowHeight + 8;

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
    doc.text('No data available.', x, y + 12);
    return y + 20;
  }

  const chartY = y + 7;
  const labelWidth = 60;
  const valueWidth = 10;
  const chartWidth = width - labelWidth - valueWidth;
  const maxValue = Math.max(...safeRows.map((row) => row.value), 1);

  safeRows.forEach((row, index) => {
    const rowY = chartY + index * rowHeight;
    const label = row.label.length > 21 ? `${row.label.substring(0, 21)}...` : row.label;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9.5);
    doc.setTextColor(...GRAY);
    doc.text(label, x, rowY + 4);

    const barX = x + labelWidth;

    doc.setFillColor(238, 238, 238);
    doc.roundedRect(barX, rowY, chartWidth, 4, 1, 1, 'F');

    const actualWidth = (row.value / maxValue) * chartWidth;

    if (actualWidth > 0) {
      let barColor = MAROON;

      if (colorMode === 'individual') {
        barColor = color[index % color.length];
      } else if (colorMode === 'category') {
        const key = String(row.label || '').trim().toLowerCase();
        barColor = color[key] || [120, 120, 120];
      } else {
        barColor = color;
      }

      doc.setFillColor(...barColor);
      doc.roundedRect(barX, rowY, Math.max(actualWidth, 1.5), 4, 1, 1, 'F');
    }

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(...DARK);
    doc.text(String(row.value), x + width, rowY + 4, { align: 'right' });
  });

  return chartY + safeRows.length * rowHeight + 8;
}

/* ======================================================
   WEB COMPONENTS
   ====================================================== */

function Pill({ tone = 'gray', children }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xl font-semibold ring-1 ring-inset ${
        PILL_TONES[tone] || PILL_TONES.gray
      }`}
    >
      {children}
    </span>
  );
}

function StatCard({ label, value, hint }) {
  return (
    <div className="rounded-2xl border border-[#F3D3D6] bg-gradient-to-br from-[#FFF5F5] to-white p-5 shadow-sm">
      <p className={ui.label}>{label}</p>
      <p className="mt-2 text-4xl font-extrabold text-[#6E2430]">{value}</p>
      {hint && <p className="mt-1 text-sm text-gray-500">{hint}</p>}
    </div>
  );
}

function AnalyticsBarChart({ title, rows, maxItems = 8, sort = true }) {
  const safeRows = normalizeChartRows(rows, { sort, max: maxItems });
  const maxValue = Math.max(...safeRows.map((row) => row.value), 1);

  const barColors = [
    'bg-[#6E2430]',
    'bg-[#B23A48]',
    'bg-[#C98944]',
    'bg-[#456990]',
    'bg-[#547A57]',
    'bg-[#7E57C2]',
    'bg-[#008C8C]',
  ];

  return (
    <div className={`${ui.card} p-6`}>
      <h3 className="mb-5 text-xl font-bold text-[#6E2430]">{title}</h3>

      {!safeRows.length ? (
        <p className="py-8 text-center text-gray-400">No data available.</p>
      ) : (
        <div className="space-y-4">
          {safeRows.map((row, index) => {
            const percentage = (row.value / maxValue) * 100;
            const barColor = barColors[index % barColors.length];

            return (
              <div key={`${row.label}-${index}`}>
                <div className="mb-1.5 flex items-center justify-between gap-3">
                  <span className="truncate text-xl font-medium text-gray-700">{row.label}</span>
                  <span className="shrink-0 text-xl font-bold text-[#6E2430]">{row.value}</span>
                </div>

                <div className="h-2.5 overflow-hidden rounded-full bg-gray-100">
                  <div
                    className={`h-full rounded-full ${barColor} transition-all duration-700 ease-out`}
                    style={{ width: `${Math.max(percentage, row.value > 0 ? 3 : 0)}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function AnalyticsSummary({ analytics }) {
  const data = getAnalyticsData(analytics);

  const cards = [
    { label: 'Total households', value: data.total_households },
    { label: 'Approval rate', value: `${data.approval_rate}%` },
    { label: 'Coverage', value: `${data.coverage}%` },
  ];

  return (
    <div className="space-y-6">
      <div className="mt-4 m-2 grid grid-cols-2 gap-5 md:grid-cols-3">
        {cards.map((card) => (
          <StatCard key={card.label} {...card} />
        ))}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <AnalyticsBarChart title="Households by Purok" rows={getAnalyticsPurokRows(data)} sort={false} />
        <AnalyticsBarChart title="Households by Vulnerability" rows={getAnalyticsVulnerabilityRows(data)} />
        <AnalyticsBarChart title="Validation Outcome" rows={getAnalyticsValidationRows(data)} sort={false} />
      </div>
    </div>
  );
}

/* One table for the selection list, the preview, and the history viewer. */
function RecordsTable({
  rows,
  type,
  selectable = false,
  isSelected,
  onToggle,
  onToggleAll,
  allSelected,
  maxHeight = false,
  emptyText = 'No records to show.',
}) {
  const columns = getReportColumns(type);

  return (
    <div
      className={`scrollbar-hide overflow-auto rounded-xl border border-gray-200 bg-white ${
        maxHeight ? 'max-h-[500px]' : ''
      }`}
    >
      <table className="w-full min-w-[900px] text-left">
        <thead className="sticky top-0 z-10 bg-[#FFD7D7]">
          <tr>
            {selectable ? (
              <th className="w-12 px-4 py-3">
                <input
                  type="checkbox"
                  aria-label="Select all records"
                  checked={Boolean(allSelected)}
                  onChange={onToggleAll}
                  className="h-5 w-5 accent-[#6E2430]"
                />
              </th>
            ) : (
              <th className={`${ui.th} w-12`}>#</th>
            )}
            {columns.map((c) => (
              <th key={c.key} className={ui.th}>
                {c.header}
              </th>
            ))}
          </tr>
        </thead>

        <tbody className="divide-y divide-gray-100">
          {rows.map((row, index) => {
            const selected = selectable && isSelected(row, index);

            return (
              <tr
                key={getRecordKey(row, index)}
                className={`transition-colors ${selected ? 'bg-[#FFF0F0]' : 'hover:bg-gray-50'}`}
              >
                <td className="px-4 py-3">
                  {selectable ? (
                    <input
                      type="checkbox"
                      aria-label={`Select ${getHouseholdName(row) || 'record'}`}
                      checked={selected}
                      onChange={() => onToggle(row, index)}
                      className="h-5 w-5 accent-[#6E2430]"
                    />
                  ) : (
                    <span className="text-sm text-gray-400">{index + 1}</span>
                  )}
                </td>
                {columns.map((c, i) => (
                  <td key={c.key} className={i === 0 ? ui.tdStrong : ui.td}>
                    {renderCell(c, row)}
                  </td>
                ))}
              </tr>
            );
          })}

          {!rows.length && (
            <tr>
              <td colSpan={columns.length + 1} className="px-4 py-10 text-center text-xl text-gray-400">
                {emptyText}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function InfoBox({ label, children, sub }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
      <p className={ui.label}>{label}</p>
      <p className="mt-1 text-xl font-semibold text-gray-900">{children}</p>
      {sub && <p className="mt-1 text-xl text-gray-500">{sub}</p>}
    </div>
  );
}

function ModalShell({ title, subtitle, onClose, z = 'z-50', width = 'max-w-[90vw]', children, footer }) {
  return (
    <div className={`fixed inset-0 ${z} flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm`}>
      <div className={`flex max-h-[90vh] w-full ${width} flex-col overflow-hidden rounded-2xl bg-white shadow-2xl`}>
        <div className="flex items-center justify-between bg-[#6E2430] px-6 py-4 text-white">
          <div>
            <h2 className="text-2xl font-bold">{title}</h2>
            {subtitle && <p className="mt-0.5 text-xl opacity-90">{subtitle}</p>}
          </div>

          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="rounded-full px-3 py-1 text-3xl leading-none hover:bg-white/15"
          >
            ×
          </button>
        </div>

        <div className="scrollbar-hide flex-1 overflow-y-auto p-6">{children}</div>

        <div className="flex flex-wrap justify-end gap-3 border-t bg-gray-50 px-6 py-4">{footer}</div>
      </div>
    </div>
  );
}

/* ======================================================
   MAIN COMPONENT
   ====================================================== */

export default function Reports() {
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingRecords, setLoadingRecords] = useState(false);
  const [busy, setBusy] = useState('');

  const [type, setType] = useState('households');
  const [dateRange, setDateRange] = useState('This Month');
  const [purok, setPurok] = useState('All Puroks');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  const [records, setRecords] = useState([]);
  const [analyticsData, setAnalyticsData] = useState(null);
  const [selectedIds, setSelectedIds] = useState([]);
  const [showPreview, setShowPreview] = useState(false);
  const [viewingReport, setViewingReport] = useState(null);

  const isAnalytics = type === 'analytics';

  /* ======================================================
     RESET + FILTERS
     ====================================================== */

  const resetLoaded = () => {
    setRecords([]);
    setAnalyticsData(null);
    setSelectedIds([]);
    setShowPreview(false);
  };

  const buildQuery = () => {
    const params = new URLSearchParams();

    params.set('dateRange', dateRange);
    params.set('purok', purok);

    if (dateRange === 'Custom') {
      params.set('startDate', startDate);
      params.set('endDate', endDate);
    }

    return params.toString();
  };

  // Shared filter values used by loading, preview, PDF, CSV, and Excel.
  const getEffectiveFilters = () => ({
    dateRange,
    purok,
    startDate: dateRange === 'Custom' ? startDate : '',
    endDate: dateRange === 'Custom' ? endDate : '',
  });

  const validateFilters = () => {
    if (dateRange !== 'Custom') return true;

    if (!startDate || !endDate) {
      toast.error('Select both a start date and an end date.');
      return false;
    }

    const start = new Date(`${startDate}T00:00:00`);
    const end = new Date(`${endDate}T00:00:00`);

    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      toast.error('Enter valid custom dates.');
      return false;
    }

    if (start > end) {
      toast.error('The start date must be on or before the end date.');
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

      const response = await api.get('/reports');
      let payload = response?.data ?? response;

      // Accept direct arrays and common API response wrappers.
      for (let i = 0; i < 3; i += 1) {
        if (Array.isArray(payload)) break;
        if (Array.isArray(payload?.reports)) {
          payload = payload.reports;
          break;
        }
        if (payload?.data !== undefined) {
          payload = payload.data;
          continue;
        }
        if (payload?.result !== undefined) {
          payload = payload.result;
          continue;
        }
        break;
      }

      setReports(Array.isArray(payload) ? payload : []);
    } catch (error) {
      console.error('Failed to load report history:', error);
      toast.error(error?.message || 'Failed to load report history.');
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

      // ANALYTICAL SUMMARY
      if (isAnalytics) {
        const response = await mlApi.getAnalytics(`?${queryString}`);
        let result = response;

        // Unwrap common API response formats.
        for (let i = 0; i < 3; i++) {
          if (result && typeof result === 'object' && !Array.isArray(result)) {
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

        if (!result || typeof result !== 'object' || Array.isArray(result)) {
          throw new Error('Analytics returned an unexpected response format.');
        }

        setAnalyticsData(result);
        setRecords([]);
        toast.success('Analytical summary loaded.');
        return;
      }

      // NORMAL REPORTS
      setAnalyticsData(null);

      const reportEndpoint = type === 'incomplete' ? 'households' : type;
      const response = await api.get(`/reports/data/${reportEndpoint}?${queryString}`);

      let payload = response?.data ?? response;

      // Accept rows wrapped by data, result, or report properties.
      for (let i = 0; i < 4; i += 1) {
        if (Array.isArray(payload) || Array.isArray(payload?.rows)) break;
        if (payload?.data !== undefined) {
          payload = payload.data;
          continue;
        }
        if (payload?.result !== undefined) {
          payload = payload.result;
          continue;
        }
        if (payload?.report !== undefined) {
          payload = payload.report;
          continue;
        }
        break;
      }

      const rows = Array.isArray(payload?.rows) ? payload.rows : Array.isArray(payload) ? payload : [];
      const finalRows = type === 'incomplete' ? rows.filter(isIncompleteAssistanceInformation) : rows;

      setRecords(finalRows);

      if (finalRows.length === 0) {
        toast.error(
          type === 'incomplete'
            ? 'No households matched the incomplete assistance information criteria.'
            : 'No records found for the selected filters.'
        );
      } else {
        toast.success(`${finalRows.length} record(s) loaded.`);
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

  /* ======================================================
     SELECTION
     ====================================================== */

  const isSelected = (row, index) => selectedIds.includes(getRecordKey(row, index));

  const toggleRecord = (row, index) => {
    const id = getRecordKey(row, index);

    setSelectedIds((current) =>
      current.includes(id) ? current.filter((selectedId) => selectedId !== id) : [...current, id]
    );
  };

  const selectAll = () => setSelectedIds(records.map((row, index) => getRecordKey(row, index)));
  const clearSelection = () => setSelectedIds([]);

  const selectedRecords = records.filter((row, index) => selectedIds.includes(getRecordKey(row, index)));
  const allSelected = records.length > 0 && selectedIds.length === records.length;
  const hasLoadedData = isAnalytics ? Boolean(analyticsData) : records.length > 0;

  /* ======================================================
     PREVIEW
     ====================================================== */

  const handlePreview = () => {
    if (!hasLoadedData) {
      toast.error('Load records first.');
      return;
    }

    if (!isAnalytics && !selectedRecords.length) {
      toast.error('Select at least one record to preview.');
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

    // Keep the URL alive long enough for slow downloads.
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  };

  const downloadCsvText = (csvText, filename) => {
    if (!csvText || !String(csvText).trim()) {
      throw new Error('The generated CSV is empty.');
    }

    const blob = new Blob([`\uFEFF${csvText}`], { type: 'text/csv;charset=utf-8' });
    triggerDownload(blob, filename);
  };

  async function downloadExcelFile(sheet, filename) {
    try {
      const workbook = new ExcelJS.Workbook();
      workbook.creator = 'Barangay Luinab';
      workbook.created = new Date();

      const worksheet = workbook.addWorksheet('Report');

      sheet.rows.forEach((row) => {
        worksheet.addRow(row.map((value) => value ?? ''));
      });

      // Style every header row, not only the first one.
      sheet.headers.forEach((rowIndex) => {
        const row = worksheet.getRow(rowIndex + 1);

        row.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
        row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF6E2430' } };
        row.alignment = { vertical: 'middle', horizontal: 'center' };
        row.height = 24;
      });

      // Section titles in the analytics export.
      sheet.titles.forEach((rowIndex) => {
        const row = worksheet.getRow(rowIndex + 1);
        row.font = { bold: true, color: { argb: 'FF6E2430' }, size: 12 };
      });

      worksheet.columns.forEach((column) => {
        let maxLength = 12;

        column.eachCell({ includeEmpty: true }, (cell) => {
          maxLength = Math.max(maxLength, String(cell.value ?? '').length);
        });

        column.width = Math.min(maxLength + 4, 40);
      });

      const buffer = await workbook.xlsx.writeBuffer();

      const blob = new Blob([buffer], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });

      triggerDownload(blob, filename);
    } catch (error) {
      console.error('Excel export error:', error);
      throw error;
    }
  }

  /* ======================================================
     SAVE HISTORY
     ====================================================== */

  const saveReportHistory = ({ reportType, format, reportData, filters }) =>
    api.post('/reports/record', {
      report_type: reportType,
      format,
      filters,
      report_data: reportData,
    });

  /* ======================================================
     GENERATE PDF
     ====================================================== */

  const downloadPdf = async () => {
    if (!isAnalytics && !selectedRecords.length) {
      toast.error('Select at least one record before generating the PDF.');
      return;
    }

    if (isAnalytics && !analyticsData) {
      toast.error('Load the analytical summary first.');
      return;
    }

    if (!validateFilters()) return;
    if (busy === 'pdf') return;

    setBusy('pdf');

    try {
      const reportType = type;
      const label = getReportLabel(reportType);
      const filters = getEffectiveFilters();

      const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'letter' });

      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();
      const margin = 14;
      const contentWidth = pageWidth - margin * 2;

      const tableBase = {
        theme: 'grid',
        margin: { left: margin, right: margin, bottom: 20 },
        headStyles: {
          fillColor: [250, 220, 222],
          textColor: RED,
          fontStyle: 'bold',
        },
      };

      /* ---------- HEADER ---------- */

      const now = new Date();
      const pad = (number) => String(number).padStart(2, '0');
      const generatedText = now.toLocaleString();

      const reportId = `RPT-${now.getFullYear()}-${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(
        now.getHours()
      )}${pad(now.getMinutes())}${pad(now.getSeconds())}`;

      const generatedBy = localStorage.getItem('username') || localStorage.getItem('full_name') || 'Staff';

      doc.setFillColor(...MAROON);
      doc.rect(0, 0, pageWidth, 34, 'F');

      doc.setTextColor(255, 255, 255);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(16);
      doc.text(label, margin, 20);

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(10);
      doc.text(`Generated ${generatedText} • Report ID: ${reportId}`, margin, 28);

      /* ---------- INFO BOXES ---------- */

      const infoY = 40;
      const infoH = 30;
      const boxWidth = contentWidth / 4;

      const info = [
        ['REPORT TYPE', label],
        ['DATE RANGE', filters.dateRange],
        ['PUROK', filters.purok],
        ['GENERATED BY', generatedBy],
      ];

      info.forEach(([heading, value], index) => {
        const x = margin + index * boxWidth;

        doc.setFillColor(255, 255, 255);
        doc.setDrawColor(210, 210, 210);
        doc.rect(x, infoY, boxWidth, infoH, 'FD');

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(9.5);
        doc.setTextColor(...GRAY);
        doc.text(heading, x + 4, infoY + 12);

        doc.setFontSize(9);
        doc.setTextColor(...DARK);

        const text = String(value);
        doc.text(text.length > 25 ? `${text.substring(0, 25)}...` : text, x + 4, infoY + 19);
      });

      let currentY = infoY + infoH + 10;

      if (filters.dateRange === 'Custom') {
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(9);
        doc.setTextColor(...GRAY);
        doc.text(`Custom Date Range: ${filters.startDate} to ${filters.endDate}`, margin, currentY - 3);
      }

      /* ---------- ANALYTICS PDF ---------- */

      if (reportType === 'analytics') {
        const data = getAnalyticsData(analyticsData);

        drawSectionTitle(doc, 'Analytical Summary', margin, currentY);
        currentY += 6;

        drawStatCards(
          doc,
          [
            ['HOUSEHOLDS', data.total_households],
            ['APPROVAL RATE', `${data.approval_rate}%`],
            ['COVERAGE', `${data.coverage}%`],
          ],
          { x: margin, y: currentY, width: contentWidth }
        );

        currentY += 35;

        const CHART_COLORS = [
          [116, 31, 45],
          [178, 58, 72],
          [201, 137, 68],
          [69, 105, 144],
          [84, 122, 87],
          [126, 87, 194],
          [0, 140, 140],
          [120, 120, 120],
          [224, 167, 181],
          [82, 65, 56],
        ];

        const VULNERABILITY_COLORS = {
          'high vulnerable': [116, 31, 45],
          'high vulnerability': [116, 31, 45],
          'moderately vulnerable': [201, 137, 68],
          'moderate vulnerability': [201, 137, 68],
          'low vulnerability': [84, 122, 87],
          'not vulnerable': [69, 105, 144],
          unclassified: [120, 120, 120],
        };

        const VALIDATION_COLORS = {
          approved: [84, 122, 87],
          rejected: [178, 58, 72],
          pending: [201, 137, 68],
          validated: [69, 105, 144],
          undecided: [201, 137, 68],
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
            title: 'Households by Vulnerability',
            rows: getAnalyticsVulnerabilityRows(data),
            color: VULNERABILITY_COLORS,
            colorMode: 'category',
            height: 65,
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

        charts.forEach((chart) => {
          currentY = drawBarChart(doc, { ...chart, x: margin, y: currentY, width: contentWidth });
          currentY += 4;
        });

        if (currentY > pageHeight - 60) {
          doc.addPage();
          currentY = 20;
        }

        drawSectionTitle(doc, 'Detailed Analytics', margin, currentY);
        currentY += 5;

        autoTable(doc, {
          ...tableBase,
          startY: currentY,
          head: [['METRIC', 'VALUE']],
          body: [
            ['Total Households', data.total_households],
            ['High Vulnerable', data.high_vulnerable],
            ['Approved Households', data.approved_household_count],
            ['Rejected', data.rejected_count],
            ['Decided Households', data.decided_household_count],
            ['Approval Rate', `${data.approval_rate}%`],
            ['Coverage', `${data.coverage}%`],
          ],
          styles: { font: 'helvetica', fontSize: 10, cellPadding: 3, textColor: [80, 80, 80] },
        });

        currentY = (doc.lastAutoTable?.finalY || currentY + 40) + 8;

        if (currentY > pageHeight - 50) {
          doc.addPage();
          currentY = 20;
        }

        autoTable(doc, {
          ...tableBase,
          startY: currentY,
          head: [['VULNERABILITY', 'HOUSEHOLDS']],
          body: getAnalyticsVulnerabilityRows(data).map((row) => [row.label, row.value]),
          styles: { font: 'helvetica', fontSize: 9.5, cellPadding: 2.5, textColor: [80, 80, 80] },
        });
      } else {
        /* ---------- NORMAL REPORT PDF ---------- */

        const rows = selectedRecords;

        const purokSet = new Set(
          rows.map((row) => String(getPurok(row) ?? '').trim()).filter(Boolean)
        );

        const statusOf = (row) => String(getStatus(row) || '').toLowerCase();

        const validatedCount = rows.filter((row) => {
          const status = statusOf(row);
          return status.includes('valid') && !status.includes('invalid');
        }).length;

        const approvedCount = rows.filter((row) => statusOf(row).includes('approved')).length;

        drawSectionTitle(doc, 'Summary', margin, currentY);
        currentY += 6;

        drawStatCards(
          doc,
          [
            ['SELECTED RECORDS', rows.length],
            ['PUROKS', purokSet.size],
            ['VALIDATED', validatedCount],
            ['APPROVED', approvedCount],
          ],
          { x: margin, y: currentY, width: contentWidth }
        );

        currentY += 35;

        drawSectionTitle(doc, 'Selected Records', margin, currentY);
        currentY += 5;

        const reportColumns = getReportColumns(reportType);

        autoTable(doc, {
          ...tableBase,
          startY: currentY,
          head: [reportColumns.map((column) => column.header.toUpperCase())],
          body: rows.map((row) => reportColumns.map((column) => column.value(row))),
          styles: {
            font: 'helvetica',
            fontSize: 9.5,
            cellPadding: 2.5,
            overflow: 'linebreak',
            textColor: [80, 80, 80],
          },
          headStyles: { ...tableBase.headStyles, fontSize: 9.5 },
          alternateRowStyles: { fillColor: [248, 248, 248] },
          columnStyles: Object.fromEntries(reportColumns.map((_, index) => [index, { cellWidth: 'auto' }])),
        });
      }

      /* ---------- FOOTER ---------- */

      const pageCount = doc.getNumberOfPages();

      for (let page = 1; page <= pageCount; page++) {
        doc.setPage(page);

        doc.setDrawColor(215, 215, 215);
        doc.line(margin, pageHeight - 15, pageWidth - margin, pageHeight - 15);

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(10);
        doc.setTextColor(...GRAY);

        doc.text('BPLPIC-HD — Barangay Luinab, Iligan City, 9200', margin, pageHeight - 8);
        doc.text(`Page ${page} of ${pageCount}`, pageWidth - margin, pageHeight - 8, { align: 'right' });
      }

      /* ---------- DOWNLOAD ---------- */

      const safeType = String(reportType).replace(/[^a-zA-Z0-9-_]/g, '-');
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const filename = `${safeType}-report-${timestamp}.pdf`;

      const pdfBlob = new Blob([doc.output('arraybuffer')], { type: 'application/pdf' });

      try {
        triggerDownload(pdfBlob, filename);
      } catch (downloadError) {
        console.warn('Blob download failed, falling back to doc.save():', downloadError);
        doc.save(filename);
      }

      toast.success('PDF downloaded.');
      setShowPreview(false);

      /* ---------- SAVE HISTORY ---------- */

      try {
        await saveReportHistory({
          reportType,
          format: 'PDF',
          filters,
          reportData: isAnalytics ? analyticsData : selectedRecords,
        });

        await load();
      } catch (historyError) {
        console.error('Failed to save PDF history:', historyError);
        toast.error('PDF downloaded, but the report history could not be saved.');
      }
    } catch (error) {
      console.error('PDF generation error:', error);
      toast.error(error?.message || 'Failed to generate the PDF report.');
    } finally {
      setBusy('');
    }
  };

  /* ======================================================
     DOWNLOAD CSV
     ====================================================== */

  const downloadCsv = async (reportType = type, historyReport = null) => {
    const isHistoryDownload = Boolean(historyReport);

    if (!isHistoryDownload && !validateFilters()) return;

    const busyKey = `csv-${reportType}`;
    if (busy === busyKey) return;

    setBusy(busyKey);

    try {
      /* ---------- HISTORY CSV ---------- */

      if (isHistoryDownload) {
        const savedData = getHistoryData(historyReport);

        if (reportType === 'analytics') {
          if (!savedData || typeof savedData !== 'object') {
            throw new Error('No saved analytical data is available.');
          }

          downloadCsvText(rowsToCsv(buildAnalyticsSheet(savedData).rows), `analytics-history-${Date.now()}.csv`);
          toast.success('Historical analytical CSV downloaded.');
          return;
        }

        const rows = Array.isArray(savedData) ? savedData : [];
        if (!rows.length) throw new Error('No saved report data is available.');

        downloadCsvText(rowsToCsv(buildRecordsSheet(rows, reportType).rows), `${reportType}-history-${Date.now()}.csv`);
        toast.success('Historical CSV downloaded.');
        return;
      }

      /* ---------- CURRENT CSV ---------- */

      let csvText;
      let reportData;

      if (reportType === 'analytics') {
        if (!analyticsData) throw new Error('Load the analytical summary first.');

        csvText = rowsToCsv(buildAnalyticsSheet(analyticsData).rows);
        reportData = analyticsData;
      } else {
        if (!selectedRecords.length) throw new Error('Select at least one record for CSV export.');

        csvText = rowsToCsv(buildRecordsSheet(selectedRecords, reportType).rows);
        reportData = selectedRecords;
      }

      downloadCsvText(csvText, `${reportType}-report-${Date.now()}.csv`);
      toast.success('CSV downloaded.');

      try {
        await saveReportHistory({
          reportType,
          format: 'CSV',
          filters: getEffectiveFilters(),
          reportData,
        });

        await load();
      } catch (historyError) {
        console.error('Failed to save CSV history:', historyError);
        toast.error('CSV downloaded, but the report history could not be saved.');
      }
    } catch (error) {
      console.error('CSV download error:', error);
      toast.error(error?.message || 'Failed to download the CSV report.');
    } finally {
      setBusy('');
    }
  };

  /* ======================================================
     DOWNLOAD EXCEL
     ====================================================== */

  const downloadExcel = async (reportType = type, historyReport = null) => {
    const isHistoryDownload = Boolean(historyReport);
    const busyKey = `excel-${reportType}`;

    if (!isHistoryDownload && !validateFilters()) return;
    if (busy === busyKey) return;

    setBusy(busyKey);

    try {
      let savedData;
      let sheet;

      if (isHistoryDownload) {
        savedData = getHistoryData(historyReport);

        if (reportType === 'analytics') {
          if (!savedData || typeof savedData !== 'object') {
            throw new Error('No saved analytical data is available.');
          }

          sheet = buildAnalyticsSheet(savedData);
        } else {
          if (!Array.isArray(savedData) || !savedData.length) {
            throw new Error('No saved report data is available.');
          }

          sheet = buildRecordsSheet(savedData, reportType);
        }
      } else if (reportType === 'analytics') {
        if (!analyticsData) throw new Error('Load the analytical summary first.');

        savedData = analyticsData;
        sheet = buildAnalyticsSheet(analyticsData);
      } else {
        if (!selectedRecords.length) throw new Error('Select at least one record.');

        savedData = selectedRecords;
        sheet = buildRecordsSheet(selectedRecords, reportType);
      }

      const filename = `${reportType}-${isHistoryDownload ? 'history-' : ''}${Date.now()}.xlsx`;

      await downloadExcelFile(sheet, filename);
      toast.success('Excel file downloaded.');

      if (!isHistoryDownload) {
        try {
          await saveReportHistory({
            reportType,
            format: 'EXCEL',
            filters: getEffectiveFilters(),
            reportData: savedData,
          });

          await load();
        } catch (historyError) {
          console.error('Failed to save Excel report history:', historyError);
          toast.error('Excel downloaded, but the report history could not be saved.');
        }
      }
    } catch (error) {
      console.error('Excel download error:', error);
      toast.error(error?.message || 'Failed to download the Excel report.');
    } finally {
      setBusy('');
    }
  };

  /* ======================================================
     RENDER
     ====================================================== */

  const previewFilters = getEffectiveFilters();
  const viewingFilters = viewingReport ? getHistoryFilters(viewingReport) : {};

  const excelBusy = (reportType) => busy === `excel-${reportType}`;
  const csvBusy = (reportType) => busy === `csv-${reportType}`;

  return (
    <div className="space-y-6">
      {/* PAGE HEADER */}

      <div className="mt-5">
        <PageHeader title="Generate Reports" subtitle="Build, preview, and export barangay reports." />
      </div>

      {/* REPORT BUILDER */}

      <Band title="Report Builder">
        <form
          className="grid grid-cols-1 items-end gap-4 md:grid-cols-4"
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
              resetLoaded();
            }}
          >
            {TYPES.map(([reportType, label]) => (
              <option key={reportType} value={reportType}>
                {label}
              </option>
            ))}
          </Select>

          <Select
            label="DATE RANGE"
            value={dateRange}
            onChange={(event) => {
              const value = event.target.value;

              setDateRange(value);
              resetLoaded();

              if (value !== 'Custom') {
                setStartDate('');
                setEndDate('');
              }
            }}
          >
            <option value="This Month">This Month</option>
            <option value="Last Month">Last Month</option>
            <option value="This Year">This Year</option>
            <option value="Custom">Custom</option>
          </Select>

          <Select
            label="PUROK"
            value={purok}
            onChange={(event) => {
              setPurok(event.target.value);
              resetLoaded();
            }}
          >
            <option value="All Puroks">All Puroks</option>
            {PUROKS.map((purokNumber) => (
              <option key={purokNumber} value={purokNumber}>
                Purok {purokNumber}
              </option>
            ))}
          </Select>

          <Button type="submit" variant="maroon" disabled={loadingRecords} className="w-full">
            {loadingRecords ? (
              <span className="inline-flex items-center justify-center gap-2">
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
                Loading…
              </span>
            ) : (
              'Load records'
            )}
          </Button>

          {dateRange === 'Custom' && (
            <>
              <div className="md:col-span-2">
                <Input
                  label="START DATE"
                  type="date"
                  value={startDate}
                  onChange={(event) => {
                    setStartDate(event.target.value);
                    resetLoaded();
                  }}
                />
              </div>

              <div className="md:col-span-2">
                <Input
                  label="END DATE"
                  type="date"
                  value={endDate}
                  onChange={(event) => {
                    setEndDate(event.target.value);
                    resetLoaded();
                  }}
                />
              </div>
            </>
          )}
        </form>
      </Band>

      {/* ANALYTICS */}

      {isAnalytics && analyticsData && (
        <Band title="Analytical Summary">
          <AnalyticsSummary analytics={analyticsData} />

          <div className="mt-6 flex flex-wrap gap-3">
            <Button type="button" variant="maroon" onClick={handlePreview}>
              Preview report
            </Button>

            <Button
              type="button"
              variant="secondary"
              disabled={csvBusy('analytics')}
              onClick={() => downloadCsv('analytics')}
            >
              {csvBusy('analytics') ? 'Preparing…' : 'Download CSV'}
            </Button>

            <Button
              type="button"
              variant="secondary"
              disabled={excelBusy('analytics')}
              onClick={() => downloadExcel('analytics')}
            >
              {excelBusy('analytics') ? 'Preparing…' : 'Download Excel'}
            </Button>
          </div>
        </Band>
      )}

      {/* RECORD SELECTION */}

      {!isAnalytics && records.length > 0 && (
        <Band title="Select Records">
          <div className="mb-4 mt-5 flex flex-wrap items-center justify-between gap-3 rounded-xl bg-gray-50 px-4 py-3">
            <span className="text-2xl text-gray-600">
              <span className="font-bold text-[#6E2430]">{selectedRecords.length}</span> of {records.length} selected
            </span>

            <div className="flex flex-wrap items-center gap-3">
              <Button type="button" variant="secondary" onClick={clearSelection} disabled={!selectedIds.length}>
                Clear selection
              </Button>

              <Button type="button" variant="maroon" onClick={handlePreview} disabled={!selectedRecords.length}>
                Preview report
              </Button>
            </div>
          </div>

          <RecordsTable
            rows={records}
            type={type}
            selectable
            maxHeight
            isSelected={isSelected}
            onToggle={toggleRecord}
            onToggleAll={() => (allSelected ? clearSelection() : selectAll())}
            allSelected={allSelected}
          />
        </Band>
      )}

      {/* REPORT HISTORY */}

      {loading ? (
        <Spinner />
      ) : (
        <Band title="Report History">
          <div className="scrollbar-hide overflow-y-auto rounded-xl">
            <Table head={['Report Name', 'Type', 'Format', 'Generated By', 'Date', 'Action']}>
              {reports.map((report, index) => (
                <tr
                  key={
                    report.report_id ||
                    report.id ||
                    `${report.report_type}-${report.report_date}-${report.format}-${index}`
                  }
                  className="hover:bg-gray-50"
                >
                  <td className={ui.tdStrong}>{getReportLabel(report.report_type)}</td>

                  <td className="px-4 py-3">
                    <Badge tone="blue">{report.report_type}</Badge>
                  </td>

                  <td className="px-4 py-3">
                    <Pill tone={toneForFormat(report.format)}>{report.format || 'PDF'}</Pill>
                  </td>

                  <td className={ui.td}>{report.generated_by || '—'}</td>

                  <td className="px-4 py-3 text-xl text-gray-500">{formatDateTime(report.report_date)}</td>

                  <td className="px-4 py-3">
                    <div className="flex gap-4">
                      <button type="button" className={ui.link} onClick={() => setViewingReport(report)}>
                        View
                      </button>

                      <button
                        type="button"
                        disabled={excelBusy(report.report_type)}
                        onClick={() => downloadExcel(report.report_type, report)}
                        className={ui.link}
                      >
                        {excelBusy(report.report_type) ? 'Preparing…' : 'Excel'}
                      </button>

                      <button
                        type="button"
                        disabled={csvBusy(report.report_type)}
                        onClick={() => downloadCsv(report.report_type, report)}
                        className={ui.link}
                      >
                        {csvBusy(report.report_type) ? 'Preparing…' : 'CSV'}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}

              {!reports.length && (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-sm text-gray-400">
                    No reports yet. Load records above and export one to see it here.
                  </td>
                </tr>
              )}
            </Table>
          </div>
        </Band>
      )}

      {/* CURRENT REPORT PREVIEW */}

      {showPreview && (
        <ModalShell
          title="Report Preview"
          subtitle={getReportLabel(type)}
          onClose={() => setShowPreview(false)}
          footer={
            <>
              <Button type="button" variant="secondary" onClick={() => setShowPreview(false)}>
                Back
              </Button>

              <Button
                type="button"
                variant="secondary"
                disabled={csvBusy(type)}
                onClick={() => downloadCsv(type)}
              >
                {csvBusy(type) ? 'Preparing…' : 'Download CSV'}
              </Button>

              <Button
                type="button"
                variant="secondary"
                disabled={excelBusy(type)}
                onClick={() => downloadExcel(type)}
              >
                {excelBusy(type) ? 'Preparing…' : 'Download Excel'}
              </Button>

              <Button type="button" variant="maroon" onClick={downloadPdf} disabled={busy === 'pdf'}>
                {busy === 'pdf' ? 'Generating…' : 'Generate PDF'}
              </Button>
            </>
          }
        >
          <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-4">
            <InfoBox label="Report type">{getReportLabel(type)}</InfoBox>

            <InfoBox
              label="Date range"
              sub={
                previewFilters.dateRange === 'Custom'
                  ? `${previewFilters.startDate} to ${previewFilters.endDate}`
                  : null
              }
            >
              {previewFilters.dateRange}
            </InfoBox>

            <InfoBox label="Purok">{previewFilters.purok}</InfoBox>

            <InfoBox label="Records">
              {isAnalytics ? getAnalyticsData(analyticsData).total_households : selectedRecords.length}
            </InfoBox>
          </div>

          {isAnalytics ? (
            <AnalyticsSummary analytics={analyticsData} />
          ) : (
            <RecordsTable rows={selectedRecords} type={type} maxHeight />
          )}
        </ModalShell>
      )}

      {/* HISTORY VIEWER */}

      {viewingReport && (
        <ModalShell
          title="Report History"
          subtitle={getReportLabel(viewingReport.report_type)}
          z="z-[60]"
          width="max-w-[80vw]"
          onClose={() => setViewingReport(null)}
          footer={
            <>
              <Button
                type="button"
                variant="secondary"
                disabled={csvBusy(viewingReport.report_type)}
                onClick={() => downloadCsv(viewingReport.report_type, viewingReport)}
              >
                {csvBusy(viewingReport.report_type) ? 'Preparing…' : 'Download CSV'}
              </Button>

              <Button
                type="button"
                variant="maroon"
                disabled={excelBusy(viewingReport.report_type)}
                onClick={() => downloadExcel(viewingReport.report_type, viewingReport)}
              >
                {excelBusy(viewingReport.report_type) ? 'Preparing…' : 'Download Excel'}
              </Button>

              <Button type="button" variant="secondary" onClick={() => setViewingReport(null)}>
                Close
              </Button>
            </>
          }
        >
          <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-4">
            <InfoBox label="Report type">{getReportLabel(viewingReport.report_type)}</InfoBox>
            <InfoBox label="Format">{viewingReport.format || 'PDF'}</InfoBox>
            <InfoBox label="Generated by">{viewingReport.generated_by || '—'}</InfoBox>
            <InfoBox label="Generated date">{formatDateTime(viewingReport.report_date)}</InfoBox>
          </div>

          {Object.keys(viewingFilters).length > 0 && (
            <div className="mb-6 rounded-xl border border-gray-200 bg-gray-50 p-4">
              <h3 className="mb-3 text-lg font-bold text-[#6E2430]">Saved filters</h3>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
                {[
                  ['Date range', viewingFilters.dateRange || '—'],
                  ['Purok', viewingFilters.purok || '—'],
                  ['Start date', viewingFilters.startDate ? formatDate(viewingFilters.startDate) : '—'],
                  ['End date', viewingFilters.endDate ? formatDate(viewingFilters.endDate) : '—'],
                ].map(([label, value]) => (
                  <div key={label}>
                    <p className={ui.label}>{label}</p>
                    <p className="text-lg font-semibold text-gray-900">{value}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {viewingReport.report_type === 'analytics' ? (
            <AnalyticsSummary analytics={getHistoryData(viewingReport)} />
          ) : (
            <RecordsTable
              rows={getHistoryRows(viewingReport)}
              type={viewingReport.report_type}
              emptyText="No saved report data."
            />
          )}
        </ModalShell>
      )}
    </div>
  );
}