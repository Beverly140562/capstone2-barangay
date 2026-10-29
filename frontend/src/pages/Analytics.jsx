import { useEffect, useMemo, useState } from 'react';
import { PageHeader, Spinner } from '../components/ui';

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
} from 'recharts';

import { mlApi } from '../lib/mlApi';

/* =========================================================
   COLORS
========================================================= */

const COLORS = [
  '#ef4444',
  '#f59e0b',
  '#10b981',
  '#3b82f6',
  '#8b5cf6',
];



const ML_API_URL = (
  import.meta.env.VITE_ML_API_URL ||
  "http://127.0.0.1:5001"
).replace(/\/+$/, "");


function SeabornCharts() {
  const [dateRange, setDateRange] = useState("All Time");
const [purok, setPurok] = useState("All Puroks");

const params = new URLSearchParams({
  dateRange,
  purok,
}).toString();

  const charts = [
  { title: "Household Vulnerability", endpoint: "vulnerability" },
  { title: "Monthly Income Distribution", endpoint: "income" },
  { title: "Household Feature Relationships", endpoint: "relationships" },
];

  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-4xl font-bold text-ink">
         Data Analysis
        </h2>
        <p className="mt-1 text-xl text-gray-500">
          Statistical visualizations
        </p>
      </div>

      {/* Chart filters */}
      <div className="flex flex-wrap gap-3">
        <select
          value={dateRange}
          onChange={(e) => setDateRange(e.target.value)}
          className="rounded-lg border border-gray-300 bg-white p-2 text-xl"
        >
          <option value="All Time">All Time</option>
          <option value="This Month">This Month</option>
          <option value="Last Month">Last Month</option>
          <option value="This Year">This Year</option>
        </select>

        <select
          value={purok}
          onChange={(e) => setPurok(e.target.value)}
          className="rounded-lg border border-gray-300 bg-white p-2 text-xl"
        >
          <option value="All Puroks">All Puroks</option>
          {["1", "1-A", "2", "2-A", "3","3-A", "4", "5", "5-A", "5-B", "5-C", "6", "6-A", "7", "7-A", "8", "8-A", "9", "9-A"].map(
            (p) => (
              <option key={p} value={p}>
                Purok {p}
              </option>
            )
          )}
        </select>
      </div>

      {/* Seaborn chart images */}
      
<div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
  {charts.map((chart) => {
    const chartUrl = `${ML_API_URL}/analytics/charts/${chart.endpoint}?${params}`;

    return (
      <article
        key={chart.endpoint}
        className="min-w-0 rounded-xl border border-gray-200 bg-white p-5 shadow-sm"
      >
        <h3 className="text-2xl font-bold text-ink">
          {chart.title}
        </h3>

        <p className="mt-1 text-4xl text-gray-500">
          {chart.description}
        </p>

        <img
          key={chartUrl}
          src={chartUrl}
          alt={chart.title}
          className="mt-4 min-h-58 w-full object-contain"
          loading="lazy"
          onError={(event) => {
            console.error("Chart failed to load:", chartUrl);
            console.error("Check that the Python endpoint exists and returns an image.");
            event.currentTarget.style.display = "none";
          }}
        />

      
      </article>
    );
  })}
</div>

    </section>
  );
}


/* =========================================================
   HELPERS
========================================================= */

function normalizeStatus(value) {
  return String(value ?? '')
    .trim()
    .toLowerCase();
}

function normalizeId(value) {
  if (
    value === null ||
    value === undefined ||
    value === ''
  ) {
    return '';
  }

  return String(value).trim();
}

/* =========================================================
   NORMALIZE PUROK DATA
========================================================= */

function normalizePurokData(data) {
  if (!Array.isArray(data)) {
    return [];
  }

  return data
    .map((item) => ({
      purok:
        item?.purok ??
        item?.Purok ??
        item?.name ??
        item?.label ??
        'Unknown',

      n:
        Number(
          item?.n ??
          item?.count ??
          item?.total ??
          item?.households ??
          0
        ) || 0,
    }))
    .filter((item) => item.n >= 0);
}

/* =========================================================
   NORMALIZE VULNERABILITY DATA
========================================================= */

function normalizeVulnerabilityData(data) {
  if (!Array.isArray(data)) {
    return [];
  }

  return data
    .map((item) => ({
      vulnerability:
        item?.vulnerability ??
        item?.classification ??
        item?.label ??
        'Unknown',

      n:
        Number(
          item?.n ??
          item?.count ??
          item?.total ??
          item?.households ??
          0
        ) || 0,
    }))
    .filter((item) => item.n >= 0);
}

/* =========================================================
   LIST BAR
========================================================= */

function ListBar({ label, value, color }) {
  return (
    <div className="flex items-center gap-3 py-1.5">
      <span className="w-70 truncate text-xl text-black">
        {label}
      </span>

      <div className="h-4 flex-1 overflow-hidden rounded-full bg-gray-200">
        <div
          className="h-full rounded-full"
          style={{
            width: `${Math.min(
              100,
              Number(value) || 0
            )}%`,
            background: color,
          }}
        />
      </div>

      <span className="w-12 text-right text-xl font-bold text-ink">
        {value}
      </span>
    </div>
  );
}

/* =========================================================
   ANALYTICS
========================================================= */

export default function Analytics() {
  const [summary, setSummary] = useState(null);
  const [distribution, setDistribution] = useState([]);
  const [validationRecords, setValidationRecords] = useState([]);
  const [error, setError] = useState('');

  /* =======================================================
     LOAD ANALYTICS
  ======================================================= */

  useEffect(() => {
    let cancelled = false;

    async function loadData() {
      try {
        setError('');

        const response = await mlApi.getAnalytics();

        if (cancelled) {
          return;
        }

        /*
         * Supports either:
         *
         * {
         *   total_households: 32,
         *   beneficiary_validation: [],
         *   distribution: []
         * }
         *
         * OR:
         *
         * {
         *   data: {
         *     total_households: 32,
         *     beneficiary_validation: [],
         *     distribution: []
         *   }
         * }
         */

        const data =
          response?.data &&
          typeof response.data === 'object' &&
          !Array.isArray(response.data)
            ? response.data
            : response || {};

        console.log(
          'Analytics API response:',
          response
        );

        console.log(
          'Analytics normalized data:',
          data
        );

        const records = Array.isArray(data?.beneficiary_validation)
  ? data.beneficiary_validation
  : Array.isArray(data?.validations)
    ? data.validations
    : [];

        const distributions = Array.isArray(
          data?.distribution
        )
          ? data.distribution
          : [];

        setSummary({
          ...data,

          by_purok: Array.isArray(data?.by_purok)
            ? data.by_purok
            : [],

          by_vulnerability:
            Array.isArray(data?.by_vulnerability)
              ? data.by_vulnerability
              : [],
        });

        setDistribution(distributions);

        setValidationRecords(records);

        console.log(
          'Validation records:',
          records
        );

        console.log(
          'Distribution records:',
          distributions
        );
      } catch (e) {
        if (cancelled) {
          return;
        }

        console.error(
          'Failed to load analytics:',
          e
        );

        setError(
          e?.response?.data?.error ||
          e?.response?.data?.message ||
          e?.message ||
          'Failed to load analytics data.'
        );
      }
    }

    loadData();

    return () => {
      cancelled = true;
    };
  }, []);

  /* =======================================================
     PUROK
  ======================================================= */

  const byPurok = useMemo(() => {
    return normalizePurokData(
      summary?.by_purok
    );
  }, [summary]);

  /* =======================================================
     VULNERABILITY
  ======================================================= */

  const byVulnerability = useMemo(() => {
    return normalizeVulnerabilityData(
      summary?.by_vulnerability
    );
  }, [summary]);


  /* =======================================================
     TOTAL HOUSEHOLDS
  ======================================================= */

  const totalHouseholds =
    Number(summary?.total_households) ||
    Number(summary?.summary?.total_households) ||
    0;

  /* =======================================================
     STAFF SUBMISSIONS AND CAPTAIN DECISIONS
  ======================================================= */

  const submittedHouseholdCount = Math.max(
    0,
    Number(summary?.submitted_household_count) || 0
  );

  const applicationCoverage = Math.min(
    100,
    Math.max(
      0,
      Number(
        summary?.application_coverage ??
        summary?.coverage ??
        0
      ) || 0
    )
  );


  /* =======================================================
     HIGHLY VULNERABLE
  ======================================================= */

  const highlyVulnerable = useMemo(() => {
    const record = byVulnerability.find(
      (item) => {
        const value = String(
          item?.vulnerability || ''
        )
          .trim()
          .toLowerCase();

        return (
          value === 'highly vulnerable' ||
          value === 'high'
        );
      }
    );

    return Number(record?.n) || 0;
  }, [byVulnerability]);



  /* =======================================================
     DISTRIBUTION
  ======================================================= */

  const normalizedDistribution =
    useMemo(() => {
      if (!Array.isArray(distribution)) {
        return [];
      }

      return distribution.map((item) => ({
        ...item,

        program_name:
          item?.program_name ||
          item?.program ||
          item?.name ||
          'Unknown Program',

        released:
          Number(
            item?.released ??
            item?.count ??
            item?.total ??
            0
          ) || 0,
      }));
    }, [distribution]);

  const maxDist =
    normalizedDistribution.length > 0
      ? Math.max(
          ...normalizedDistribution.map(
            (item) =>
              Number(item?.released) || 0
          )
        )
      : 1;

  /* =======================================================
     ERROR
  ======================================================= */

  if (error) {
    return (
      <div className="space-y-4">
        <PageHeader
          title="Analytics"
          subtitle="Statistical reports on household demographics and assistance distribution."
        />

        <div
          role="alert"
          className="
            rounded-lg
            border
            border-red-200
            bg-red-50
            px-4
            py-3
            text-red-700
          "
        >
          {error}
        </div>
      </div>
    );
  }

  /* =======================================================
     LOADING
  ======================================================= */

  if (!summary) {
    return (
      <div className="flex justify-center py-16">
        <Spinner />
      </div>
    );
  }

  /* =======================================================
     STAT CARDS
  ======================================================= */

  

  const cards = [
    [
      'TOTAL HOUSEHOLDS',
      totalHouseholds,
      'Registered households',
      'text-success',
    ],
    [
      'HIGH PRIORITY',
      highlyVulnerable,
      'Highly vulnerable households',
      'text-amber-soft',
    ],
    [
      'SUBMITTED HOUSEHOLDS',
      submittedHouseholdCount,
      'Households submitted by staff',
      'text-success',
    ],
    [
      'APPLICATION COVERAGE',
      `${applicationCoverage}%`,
      `${submittedHouseholdCount} of ${totalHouseholds} households`,
      'text-success',
    ],
  ];



  return (
    <div className="space-y-6">

      {/* =================================================
          HEADER
      ================================================= */}

      <div className="mt-5">
        <PageHeader
          title="Analytics"
          subtitle="Statistical reports on household demographics and assistance distribution."
        />
      </div>

      {/* =================================================
          SUMMARY CARDS
      ================================================= */}

      <div
        className="
          grid
          grid-cols-1
          gap-4
          sm:grid-cols-2
          lg:grid-cols-4
          
        "
      >
        {cards.map(
          ([
            label,
            value,
            note,
            tone,
          ]) => (
            <div
              key={label}
              className="
                rounded-lg
                border-l-4
                border-black
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
                {label}
              </div>

              <div
                className="
                  text-[36px]
                  leading-tight
                  font-extrabold
                  text-ink
                "
              >
                {value}
              </div>

              <div
                className={`
                  text-xl
                  font-semibold
                  ${tone}
                `}
              >
                {note}
              </div>
            </div>
          )
        )}
      </div>

      {/* SEABORN MACHINE LEARNING ANALYTICS */}
<SeabornCharts />

{/* EXISTING ASSISTANCE DISTRIBUTION + PUROK */}
<div className="grid gap-5 md:grid-cols-2"></div>


      {/* =================================================
          ASSISTANCE DISTRIBUTION + PUROK
      ================================================= */}

      <div
        className="
          grid
          gap-5
          md:grid-cols-2
        "
      >

        {/* =================================================
            ASSISTANCE DISTRIBUTION
        ================================================= */}

        <div
          className="
            rounded-lg
            border
            border-gray-200
            bg-white
            p-6
            shadow-sm
          "
        >
          <h3 className="text-2xl font-bold text-ink">
            Assistance Distribution by Program
          </h3>

          <div className="mt-4">

            {normalizedDistribution.map(
              (item, index) => (
                <ListBar
                  key={
                    item?.program_id ||
                    item?.program_name ||
                    `program-${index}`
                  }
                  label={
                    item?.program_name ||
                    'Unknown Program'
                  }
                  value={
                    Number(
                      item?.released
                    ) || 0
                  }
                  color={
                    Number(
                      item?.released
                    ) === maxDist
                      ? '#db0023'
                      : '#c09a00'
                  }
                />
              )
            )}

            {!normalizedDistribution.length && (
              <p className="text-sm text-gray-400">
                No assistance distributed yet.
              </p>
            )}

          </div>
        </div>

        {/* =================================================
            HOUSEHOLD DEMOGRAPHICS BY PUROK
        ================================================= */}

        <div
          className="
            rounded-lg
            border
            border-gray-200
            bg-white
            p-6
            shadow-sm
          "
        >
          <h3 className="text-2xl font-bold text-ink">
            Household Demographics by Purok
          </h3>

          {byPurok.length > 0 ? (
            <div className="mt-4 overflow-x-auto">

              <div
                style={{
                  minWidth:
                    byPurok.length > 7
                      ? `${byPurok.length * 80}px`
                      : '100%',
                }}
              >

                <ResponsiveContainer
                  width="100%"
                  height={280}
                >
                  <BarChart
                    data={byPurok}
                    margin={{
                      top: 10,
                      right: 20,
                      left: 0,
                      bottom: 10,
                    }}
                  >

                    <XAxis
                      dataKey="purok"
                      tick={{
                        fontSize: 22,
                      }}
                    />

                    <YAxis
                      allowDecimals={false}
                      tick={{
                        fontSize: 22,
                      }}
                    />

                    <Tooltip
                      formatter={(value) => [
                        value,
                        'Households',
                      ]}
                    />

                    <Bar
                      dataKey="n"
                      name="Households"
                      fill="#db0023"
                      radius={[
                        4,
                        4,
                        0,
                        0,
                      ]}
                    />

                  </BarChart>
                </ResponsiveContainer>

              </div>

            </div>
          ) : (
            <div
              className="
                flex
                h-[280px]
                items-center
                justify-center
                text-sm
                text-gray-400
              "
            >
              No Purok data available.
            </div>
          )}

        </div>

      </div>

      {/* =================================================
          SOCIO-ECONOMIC CLASSIFICATION
      ================================================= */}

      <div
        className="
          rounded-lg
          border
          border-gray-200
          bg-white
          p-6
          shadow-sm
        "
      >

        <h3 className="text-2xl font-bold text-ink">
          Socio-Economic Classification Breakdown
        </h3>

        {byVulnerability.length > 0 ? (
          <div
            className="
              mt-4
              grid
              items-center
              gap-8
              md:grid-cols-2
              text-xl
            "
          >

            {/* PIE CHART */}

            <div className="flex justify-center">

              <ResponsiveContainer
                width="100%"
                height={300}
              >

                <PieChart>

                  <Pie
                    data={byVulnerability}
                    dataKey="n"
                    nameKey="vulnerability"
                    cx="50%"
                    cy="50%"
                    outerRadius={95}
                    labelLine
                    label={({
                      vulnerability,
                      percent,
                    }) =>
                      `${vulnerability}: ${(
                        percent * 100
                      ).toFixed(0)}%`
                    }
                  >

                    {byVulnerability.map(
                      (_, index) => (
                        <Cell
                          key={`cell-${index}`}
                          fill={
                            COLORS[
                              index %
                                COLORS.length
                            ]
                          }
                        />
                      )
                    )}

                  </Pie>

                  <Tooltip
                    formatter={(
                      value,
                      name
                    ) => [
                      value,
                      name,
                    ]}
                  />

                  <Legend />

                </PieChart>

              </ResponsiveContainer>

            </div>

            {/* CLASSIFICATION DETAILS */}

            <div className="space-y-4">

              {byVulnerability.map(
                (item, index) => {
                  const count =
                    Number(
                      item?.n
                    ) || 0;

                  const percentage =
                    totalHouseholds > 0
                      ? Math.round(
                          (count /
                            totalHouseholds) *
                            100
                        )
                      : 0;

                  return (
                    <div
                      key={
                        item?.vulnerability ||
                        `classification-${index}`
                      }
                      className="
                        rounded-lg
                        border
                        border-gray-100
                        p-3
                      "
                    >

                      <div
                        className="
                          flex
                          items-center
                          justify-between
                          gap-3
                        "
                      >

                        <div className="flex items-center gap-2">

                          <span
                            className="h-5 w-5 rounded-full"
                            style={{
                              backgroundColor:
                                COLORS[
                                  index %
                                    COLORS.length
                                ],
                            }}
                          />

                          <span
                            className="
                              text-xl
                              font-semibold
                              text-ink
                              
                            "
                          >
                            {
                              item?.vulnerability ||
                              'Unknown'
                            }
                          </span>

                        </div>

                        <span
                          className="
                            text-xl
                            font-bold
                            text-ink 
                          
                          "
                        >
                          {count}
                        </span>

                      </div>

                      <div className="mt-2 flex items-center gap-3">

                        <div
                          className="
                            h-3
                            flex-1
                            overflow-hidden
                            rounded-full
                            bg-gray-200
                          "
                        >

                          <div
                            className="h-full rounded-full"
                            style={{
                              width: `${Math.min(
                                100,
                                percentage
                              )}%`,
                              backgroundColor:
                                COLORS[
                                  index %
                                    COLORS.length
                                ],
                            }}
                          />

                        </div>

                        <span
                          className="
                            w-16
                            text-right
                            text-lg
                            font-bold
                            text-ink
                          "
                        >
                          {percentage}%
                        </span>

                      </div>

                    </div>
                  );
                }
              )}

            </div>

          </div>
        ) : (
          <div
            className="
              flex
              h-[280px]
              items-center
              justify-center
              text-sm
              text-gray-400
            "
          >
            No socio-economic classification data available.
          </div>
        )}

      </div>

    </div>
  );
}
