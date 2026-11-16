import { useCallback, useEffect, useState } from 'react';
import { Link, useLocation, useSearchParams } from 'react-router-dom';
import { api } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import {
  PageHeader,
  Band,
  Table,
  Status,
  Badge,
  statusTone,
  Button,
  Spinner,
  Input,
} from '../components/ui';
import toast from 'react-hot-toast';

/* ======================================================
   HELPERS (logic unchanged)
   ====================================================== */

function normalizeSuggestedPrograms(value) {
  if (!value) return [];

  // Decode JSON strings, including strings nested inside arrays.
  const decode = (item) => {
    if (typeof item !== 'string') return item;

    const trimmed = item.trim();

    if (
      (trimmed.startsWith('{') && trimmed.endsWith('}')) ||
      (trimmed.startsWith('[') && trimmed.endsWith(']'))
    ) {
      try {
        return decode(JSON.parse(trimmed));
      } catch {
        return item;
      }
    }

    return item;
  };

  let decoded = decode(value);

  if (!Array.isArray(decoded)) {
    decoded = [decoded];
  }

  return decoded
    .flat(Infinity)
    .map((program) => {
      program = decode(program);

      if (typeof program === 'string') {
        return { program_name: program, description: '' };
      }

      if (program && typeof program === 'object') {
        return {
          program_name:
            program.program_name || program.name || 'Unnamed Program',
          description: program.description || '',
        };
      }

      return null;
    })
    .filter(Boolean);
}

function getVulnerabilityProbability(household) {
  const vulnerability = household?.vulnerability;

  const probabilityClass = {
    'High Vulnerable': 'High',
    'Moderate Vulnerable': 'Medium',
    'Low Vulnerable': 'Low',
  }[vulnerability];

  if (!probabilityClass) return null;

  let probabilities = household?.probabilities;

  // Support JSON-string responses too.
  if (typeof probabilities === 'string') {
    try {
      probabilities = JSON.parse(probabilities);
    } catch {
      return null;
    }
  }

  const probability = probabilities?.[probabilityClass];

  if (probability == null || !Number.isFinite(Number(probability))) {
    return null;
  }

  return Number(probability) * 100;
}

/* ======================================================
   SMALL UI HELPERS
   ====================================================== */

// 'High' | 'Moderate' | 'Low' | null
function getLevel(vulnerability) {
  const v = String(vulnerability || '');
  if (v.includes('High')) return 'High';
  if (v.includes('Moderate')) return 'Moderate';
  if (v.includes('Low')) return 'Low';
  return null;
}

const LEVEL_STYLES = {
  High: {
    pill: 'bg-red-50 text-red-700 ring-red-200',
    dot: 'bg-red-500',
  },
  Moderate: {
    pill: 'bg-amber-50 text-amber-700 ring-amber-200',
    dot: 'bg-amber-500',
  },
  Low: {
    pill: 'bg-green-50 text-green-700 ring-green-200',
    dot: 'bg-green-500',
  },
};

function LevelPill({ vulnerability }) {
  const level = getLevel(vulnerability);

  if (!level) return <span className="text-gray-400">—</span>;

  const s = LEVEL_STYLES[level];

  return (
    <span
      className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xl font-semibold ring-1 ${s.pill}`}
    >
      <span className={`h-2 w-2 rounded-full ${s.dot}`} />
      {level}
    </span>
  );
}

function initialsOf(...parts) {
  const letters = parts
    .map((p) => String(p || '').trim()[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();

  return letters || '?';
}

function Avatar({ text, size = 'md' }) {
  const sizes = {
    md: 'h-11 w-11 text-base',
    lg: 'h-16 w-16 text-2xl',
  };

  return (
    <span
      className={`flex shrink-0 items-center justify-center rounded-full bg-[#F8E9EB] font-bold text-[#6E2430] ${sizes[size]}`}
    >
      {text}
    </span>
  );
}

function ProgramChips({ programs, max = 2 }) {
  if (!programs.length) return <span className="text-gray-400">—</span>;

  const shown = programs.slice(0, max);
  const extra = programs.length - shown.length;

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {shown.map((program, index) => (
        <span
          key={`${program.program_name}-${index}`}
          className="rounded-full bg-[#F8E9EB] px-3 py-1 text-xl font-medium text-[#6E2430]"
        >
          {program.program_name}
        </span>
      ))}

      {extra > 0 && (
        <span
          className="rounded-full bg-gray-100 px-2.5 py-1 text-xl font-semibold text-gray-600"
          title={programs
            .slice(max)
            .map((p) => p.program_name)
            .join(', ')}
        >
          +{extra}
        </span>
      )}
    </div>
  );
}

function FilterPill({ label, count, active, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`flex items-center gap-2 rounded-full border px-4 py-2 text-xl font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#6E2430] ${
        active
          ? 'border-[#6E2430] bg-[#6E2430] text-white shadow-sm'
          : 'border-[#EBD3D3] bg-white text-gray-700 hover:border-[#6E2430]/40 hover:bg-[#FBF6F6]'
      }`}
    >
      {label}
      <span
        className={`rounded-full px-2 py-0.5 text-xl ${
          active ? 'bg-white/20 text-white' : 'bg-gray-100 text-gray-600'
        }`}
      >
        {count}
      </span>
    </button>
  );
}

/* ======================================================
   PAGE
   ====================================================== */

export default function Households() {
  const [params] = useSearchParams();
  const location = useLocation();
  const { user } = useAuth();

  const editMode =
    location.pathname === '/update' || params.get('mode') === 'edit';

  const [households, setHouseholds] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [levelFilter, setLevelFilter] = useState('All');

  const canEdit = user?.roles === 'admin' || user?.roles === 'staff';

  // Load household records.
  const load = useCallback(async () => {
    setLoading(true);
    setError('');

    try {
      const data = await api.get('/households');

      setHouseholds(Array.isArray(data?.households) ? data.households : []);
    } catch (err) {
      console.error('Failed to load households:', err);
      setError(err?.message || 'Failed to load household records.');
      setHouseholds([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Search all available household fields returned by the API.
  const query = searchTerm.trim().toLowerCase();

  const searched = households.filter((household) => {
    if (!query) return true;

    const surname = String(household.surname ?? '').trim();
    const givenName = String(household.given_name ?? '').trim();
    const middleName = String(household.middle_name ?? '').trim();

    // Search the full name in either order.
    const fullName = `${surname} ${givenName} ${middleName}`
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase();

    const reverseName = `${givenName} ${surname} ${middleName}`
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase();

    const searchableFields = [
      fullName,
      reverseName,
      surname,
      givenName,
      middleName,
      household.household_head_name,
      household.address,
      household.household_id,
      household.purok,
      household.vulnerability,
      household.validation_status,
      household.household_status,
    ];

    // Also allow words to match across surname and given name.
    const words = query.split(/\s+/);

    return (
      searchableFields.some((value) =>
        String(value ?? '').toLowerCase().includes(query)
      ) ||
      words.every((word) =>
        [surname, givenName, middleName].some((value) =>
          value.toLowerCase().includes(word)
        )
      )
    );
  });

  // Counts follow the search, so the pills always add up.
  const counts = {
    All: searched.length,
    High: searched.filter((h) => getLevel(h.vulnerability) === 'High').length,
    Moderate: searched.filter((h) => getLevel(h.vulnerability) === 'Moderate')
      .length,
    Low: searched.filter((h) => getLevel(h.vulnerability) === 'Low').length,
  };

  const filteredHouseholds =
    levelFilter === 'All'
      ? searched
      : searched.filter((h) => getLevel(h.vulnerability) === levelFilter);

  // Open household details.
  const open = async (id) => {
    if (!id) {
      setError('Cannot open household: household ID is missing.');
      return;
    }

    try {
      setError('');
      setSelected(null);

      const data = await api.get(`/households/${encodeURIComponent(id)}`);

      const householdData = data?.household
        ? data
        : data?.data?.household
        ? data.data
        : data?.data && Array.isArray(data.data.members)
        ? data.data
        : data?.household_id
        ? { household: data, members: [] }
        : data?.data?.household_id
        ? { household: data.data, members: [] }
        : null;

      if (!householdData?.household) {
        throw new Error(
          'Household details were not returned in the expected format.'
        );
      }

      setSelected(householdData);
    } catch (err) {
      console.error('Failed to open household:', err);
      setError(err?.message || 'Failed to open household details.');
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="mt-4">
        <PageHeader
          title={editMode ? 'Update Records' : 'Household'}
          subtitle={
            editMode
              ? 'Update existing household and residence information.'
              : 'Household and residence information.'
          }
        >
          {canEdit && !editMode && (
            <Link to="/encode">
              <Button>+ Encode Household</Button>
            </Link>
          )}
        </PageHeader>
      </div>

      {/* Toolbar: search + classification filter */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="w-full lg:max-w-md">
          <Input
            type="text"
            placeholder="Search surname, given name, household ID..."
            value={searchTerm}
            onChange={(value) => {
              // Supports either a string or a normal input event.
              setSearchTerm(
                typeof value === 'string' ? value : value?.target?.value ?? ''
              );
            }}
          />
        </div>

        <div className="flex flex-wrap gap-2">
          {[
            ['All', 'All'],
            ['High', 'High'],
            ['Moderate', 'Moderate'],
            ['Low', 'Low'],
          ].map(([value, label]) => (
            <FilterPill
              key={value}
              label={label}
              count={counts[value]}
              active={levelFilter === value}
              onClick={() => setLevelFilter(value)}
            />
          ))}
        </div>
      </div>

      {/* Error */}
      {error && (
        <div
          className="flex items-center justify-between gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-base font-medium text-red-800"
          role="alert"
        >
          <span>{error}</span>
          <button
            type="button"
            className="shrink-0 rounded-lg border border-red-300 bg-white px-3 py-1 font-semibold hover:bg-red-100"
            onClick={load}
          >
            Retry
          </button>
        </div>
      )}

      {/* Household Records */}
      {loading ? (
        <Spinner />
      ) : (
        <Band
          title={
            editMode ? 'Household & Residence Records' : 'Household Records'
          }
        >
          <p className="mb-3 mt-4 ml-2 text-2xl text-gray-500">
            Showing{' '}
            <span className="font-semibold text-gray-800">
              {filteredHouseholds.length}
            </span>{' '}
            of {households.length} household(s)
            {!editMode}
          </p>

          <div className="max-h-[560px] overflow-auto rounded-xl border border-[#EBD3D3] scrollbar-hide">
            <Table
              head={[
                'Household',
                'Purok',
                'Classification',
                'Suggested Program',
                'Household Status',
                'Validation Status',
                ...(editMode ? ['Action'] : []),
              ]}
            >
              {filteredHouseholds.map((h) => {
                const householdStatus = h.household_status || 'Active';
                const programs = normalizeSuggestedPrograms(
                  h.suggested_programs
                );

                return (
                  <tr
                    key={h.household_id}
                    className="cursor-pointer border-t border-gray-100 transition hover:bg-[#FBF6F6]"
                    onClick={() => open(h.household_id)}
                  >
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-3">
                        <Avatar text={initialsOf(h.surname, h.given_name)} />
                        <div className="min-w-0">
                          <div className="truncate text-2xl font-semibold text-gray-900">
                            {h.surname || '—'}, {h.given_name || '—'}
                          </div>
                        
                        </div>
                      </div>
                    </td>

                    <td className="px-5 py-4 text-3xl text-black ml-4">
                      {h.purok 
                      }
                    </td>

                    <td className="px-5 py-3">
                      <LevelPill vulnerability={h.vulnerability} />
                    </td>

                    <td className="px-5 py-3">
                      <ProgramChips programs={programs} />
                    </td>

                    <td
                      className="px-5 py-3"
                      onClick={(event) => event.stopPropagation()}
                    >
                      <Status
                        tone={householdStatus === 'Active' ? 'success' : 'alert'}
                      >
                        {householdStatus}
                      </Status>
                    </td>

                    <td className="px-5 py-3">
                      <Status tone={statusTone(h.validation_status)}>
                        {h.validation_status || '—'}
                      </Status>
                    </td>

                    {editMode && (
                      <td
                        className="px-5 py-3"
                        onClick={(event) => event.stopPropagation()}
                      >
                        {canEdit && (
                          <Link to={`/encode?id=${h.household_id}`}>
                            <Button variant="outline">✏️ Update</Button>
                          </Link>
                        )}
                      </td>
                    )}
                  </tr>
                );
              })}

              {!filteredHouseholds.length && (
                <tr>
                  <td
                    colSpan={editMode ? 7 : 6}
                    className="px-3 py-14 text-center"
                  >
                    <p className="text-xl font-semibold text-gray-600">
                      {query || levelFilter !== 'All'
                        ? 'No households match your filters.'
                        : 'No households found.'}
                    </p>
                    {(query || levelFilter !== 'All') && (
                      <button
                        type="button"
                        className="mt-2 text-base font-semibold text-[#6E2430] hover:underline"
                        onClick={() => {
                          setSearchTerm('');
                          setLevelFilter('All');
                        }}
                      >
                        Clear search and filters
                      </button>
                    )}
                  </td>
                </tr>
              )}
            </Table>
          </div>
        </Band>
      )}

      {/* Household Details Drawer */}
      {selected && (
        <HouseholdDrawer
          data={selected}
          onClose={() => setSelected(null)}
          reload={load}
        />
      )}
    </div>
  );
}

/* ======================================================
   DRAWER
   ====================================================== */

function Section({ title, subtitle, aside, children }) {
  return (
    <section className="rounded-2xl border border-[#EBD3D3] bg-white p-5 shadow-sm">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h3 className="text-2xl font-bold text-[#6E2430]">{title}</h3>
          {subtitle && <p className="mt-0.5 text-lg text-gray-500">{subtitle}</p>}
        </div>
        {aside}
      </div>
      {children}
    </section>
  );
}

function FieldGrid({ fields }) {
  return (
    <dl className="grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2">
      {fields.map(([label, value]) => (
        <div key={label}>
          <dt className="text-xl font-medium text-gray-500">{label}</dt>
          <dd className="mt-0.5 text-2xl font-semibold text-gray-900">
            {value === null || value === undefined || value === ''
              ? '—'
              : value}
          </dd>
        </div>
      ))}
    </dl>
  );
}

function yesNo(value) {
  if (value === true || value === 'true') return 'Yes';
  if (value === false || value === 'false') return 'No';
  return value;
}

function HouseholdDrawer({ data, onClose, reload }) {
  const { user } = useAuth();
  const [incomeProofs, setIncomeProofs] = useState([]);
  const [loadingProofs, setLoadingProofs] = useState(false);
  const [previewImage, setPreviewImage] = useState(null);

  const household =
    data?.household ??
    data?.data?.household ??
    (data?.household_id ? data : null);

  const members = Array.isArray(data?.members)
    ? data.members
    : Array.isArray(data?.data?.members)
    ? data.data.members
    : [];

  // The household record represents one person.
  // The members array contains the additional people.
  const totalFamilySize = members.length + 1;

  const canEdit = user?.roles === 'admin' || user?.roles === 'staff';

  const loadIncomeProofs = useCallback(async () => {
    if (!household?.household_id) return;

    setLoadingProofs(true);

    try {
      const result = await api.get(
        `/households/${encodeURIComponent(household.household_id)}/income-proofs`
      );

      setIncomeProofs(Array.isArray(result?.images) ? result.images : []);
    } catch (err) {
      console.error('Failed to load income proofs:', err);

      toast.error(err?.message || 'Failed to load income-proof images.');
    } finally {
      setLoadingProofs(false);
    }
  }, [household?.household_id]);

  useEffect(() => {
    loadIncomeProofs();
  }, [loadIncomeProofs]);

  if (!household) {
    return null;
  }

  const validate = async () => {
    try {
      await api.patch(
        `/validation/households/${household.household_id}/validate`,
        {}
      );

      toast.success('Household validated successfully.');

      onClose();
      await reload();
    } catch (err) {
      console.error('Failed to validate household:', err);

      toast.error(err?.message || 'Failed to validate household.');
    }
  };

  const programs = normalizeSuggestedPrograms(household.suggested_programs);
  const probability = getVulnerabilityProbability(household);

  const formatDate = (value) => {
    if (!value) return '—';
    return String(value).split('T')[0];
  };

  const money = (value) =>
    value != null && value !== ''
      ? `₱${Number(value).toLocaleString('en-PH')}`
      : '—';

  const displayName =
    household.household_head_name ||
    `${household.surname || ''} ${household.given_name || ''}`.trim() ||
    'Household Details';

  const personalFields = [
    ['Surname', household.surname],
    ['Given Name', household.given_name],
    ['Middle Name', household.middle_name],
    ['Gender', household.sex],
    ['Age', household.age],
    ['Birthday', formatDate(household.birthday)],
    ['Civil Status', household.civil_status],
    ['Religion', household.religion],
    ['Contact', household.contact_number],
  ];

  const workFields = [
    ['Education', household.highest_education],
    ['Occupation', household.occupation],
    ['Monthly Income', money(household.monthly_income)],
    [
      'Disability Present',
      household.disability_present === true ||
      household.disability_present === 'true'
        ? 'Yes'
        : 'No',
    ],
  ];

  const residenceFields = [
    ['Residence', household.residence],
    ['Household Status', household.household_status || 'Active'],
    [
      'Length of Residency',
      household.length_residency != null
        ? `${household.length_residency} years`
        : '—',
    ],
    ['Family Size', totalFamilySize],
  ];

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end bg-black/50"
      onClick={onClose}
    >
      <aside
        className="flex h-full w-full max-w-2xl flex-col bg-[#FBF6F6] shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        {/* Header */}
        <div className="relative shrink-0 overflow-hidden bg-gradient-to-br from-[#8A2D3C] via-[#6E2430] to-[#4A1620] px-6 py-6 text-white">
          <div className="pointer-events-none absolute -right-10 -top-12 h-40 w-40 rounded-full bg-white/10" />

          <div className="relative flex items-start gap-4">
            <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-white text-2xl font-bold text-[#6E2430] ring-4 ring-white/30">
              {initialsOf(household.surname, household.given_name)}
            </span>

            <div className="min-w-0 flex-1">
              <h2 className="truncate text-2xl font-bold">{displayName}</h2>

              <p className="mt-1 text-xl text-white/80">
                {household.address || 'No address recorded'}
                {' · '}Purok {household.purok || '—'}
              </p>

              <div className="mt-3 flex flex-wrap items-center gap-2">
                <span className="rounded-full bg-white/15 px-3 py-1 text-sm font-semibold">
                  ID: {household.household_id}
                </span>
                <span className="rounded-full bg-white/15 px-3 py-1 text-xl font-semibold">
                  {household.validation_status || 'No validation status'}
                </span>
              </div>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="rounded-lg p-2 text-2xl leading-none text-white/80 transition hover:bg-white/15 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
              aria-label="Close household details"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 space-y-5 overflow-y-auto p-6 scrollbar-hide">
          {/* ML Classification */}
          <section className="rounded-2xl bg-gradient-to-br from-[#7A2837] to-[#4A1620] p-5 text-white shadow-md">
            <div className="flex items-center justify-between gap-3">
              <span className="text-lg font-semibold">ML Classification</span>

              <Badge tone={statusTone(household.vulnerability)}>
                {household.vulnerability || 'Unclassified'}
              </Badge>
            </div>

            <div className="mt-4">
              <div className="flex items-baseline justify-between">
                <span className="text-base text-red-100">Probability</span>
                <span className="text-2xl font-bold">
                  {probability !== null ? `${probability.toFixed(2)}%` : '—'}
                </span>
              </div>

              <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-white/20">
                <div
                  className="h-full rounded-full bg-white transition-all duration-500"
                  style={{
                    width: `${probability !== null ? Math.min(probability, 100) : 0}%`,
                  }}
                />
              </div>
            </div>

            <div className="mt-5 text-lg font-semibold">Suggested Programs</div>

            <div className="mt-2 space-y-2.5">
              {programs.length > 0 ? (
                programs.map((program, index) => (
                  <div
                    key={`${program.program_name}-${index}`}
                    className="rounded-xl border border-white/20 bg-white/10 p-3.5"
                  >
                    <div className="text-lg font-semibold text-white">
                      {program.program_name}
                    </div>

                    {program.description && (
                      <p className="mt-1 text-base leading-snug text-red-100">
                        {program.description}
                      </p>
                    )}
                  </div>
                ))
              ) : (
                <p className="text-base text-red-200">No suggested programs.</p>
              )}
            </div>
          </section>

          <Section title="Personal Information">
            <FieldGrid fields={personalFields} />
          </Section>

          <Section title="Work & Income">
            <FieldGrid fields={workFields} />
          </Section>

          <Section title="Residence">
            <FieldGrid fields={residenceFields} />
          </Section>

          {/* Household Income Proof - View Only */}
          <Section
            title="Household Income Proof"
            subtitle="Uploaded supporting income documents and images"
            aside={<Badge>{incomeProofs.length} image(s)</Badge>}
          >
            {loadingProofs ? (
              <div className="flex items-center justify-center py-6">
                <p className="text-base text-gray-500">
                  Loading income-proof images...
                </p>
              </div>
            ) : incomeProofs.length > 0 ? (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {incomeProofs.map((image) => (
                  <button
                    key={image.path}
                    type="button"
                    onClick={() => setPreviewImage(image)}
                    title="Click to view full image"
                    className="group overflow-hidden rounded-xl border border-gray-200 bg-white text-left transition hover:border-[#6E2430]/50 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#6E2430]"
                  >
                    <img
                      src={image.url}
                      alt={image.name || 'Household income proof'}
                      className="h-32 w-full cursor-zoom-in object-cover transition group-hover:opacity-90"
                    />
                    <p className="truncate px-2.5 py-2 text-sm text-gray-600">
                      {image.name || 'Income proof'}
                    </p>
                  </button>
                ))}
              </div>
            ) : (
              <div className="rounded-xl border border-dashed border-gray-300 p-6 text-center">
                <p className="text-base text-gray-400">
                  No income-proof images uploaded.
                </p>
              </div>
            )}
          </Section>

          {/* Household Members */}
          <Section
            title="Additional Household Members"
            aside={<Badge>{members.length}</Badge>}
          >
            <div className="space-y-3">
              {members.map((member) => (
                <div
                  key={member.member_id}
                  className="rounded-xl border border-gray-200 bg-[#FBF6F6] p-4"
                >
                  <div className="flex items-center gap-3">
                    <Avatar text={initialsOf(member.full_name)} />

                    <div className="min-w-0 flex-1">
                      <div className="truncate text-2xl font-semibold text-gray-900">
                        {member.full_name || 'Unnamed member'}
                      </div>
                      <div className="text-xl text-gray-500">
                        {member.relationship_hh || '—'} · Age{' '}
                        {member.age ?? '—'}
                      </div>
                    </div>
                  </div>

                  <div className="mt-4 grid grid-cols-2 gap-x-6 gap-y-3 border-t border-gray-200 pt-4">
                    <MemberDetail label="Gender" value={member.sex} />
                    <MemberDetail
                      label="Civil Status"
                      value={member.civil_status}
                    />
                    <MemberDetail
                      label="Educational Attainment"
                      value={member.education_attainment}
                    />
                    <MemberDetail
                      label="Occupation"
                      value={member.occupation}
                    />
                    <MemberDetail
                      label="Disability"
                      value={yesNo(member.disability_present)}
                    />
                    <MemberDetail
                      label="Birthday"
                      value={formatDate(member.birthday)}
                    />
                    <MemberDetail
                      label="Monthly Income"
                      value={money(member.monthly_income)}
                    />
                  </div>
                </div>
              ))}

              {!members.length && (
                <p className="py-2 text-center text-base text-gray-400">
                  No members recorded.
                </p>
              )}
            </div>
          </Section>
        </div>

        {/* Sticky actions */}
        {((user?.roles === 'admin' &&
          household.validation_status === 'Pending') ||
          canEdit) && (
          <div className="flex shrink-0 gap-3 border-t border-[#EBD3D3] bg-white px-6 py-4">
            {user?.roles === 'admin' &&
              household.validation_status === 'Pending' && (
                <Button onClick={validate}>Validate Data</Button>
              )}

            {canEdit && (
              <Link to={`/encode?id=${household.household_id}`}>
                <Button variant="outline">Edit</Button>
              </Link>
            )}
          </div>
        )}
      </aside>

      {/* Full Image Preview */}
      {previewImage && (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center bg-black/80 p-4"
          onClick={(event) => {
            event.stopPropagation();
            setPreviewImage(null);
          }}
        >
          <div
            className="relative flex max-h-[90vh] w-full max-w-4xl flex-col items-center"
            onClick={(event) => event.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => setPreviewImage(null)}
              className="absolute -top-10 right-0 text-2xl text-white hover:text-gray-300"
              aria-label="Close image preview"
            >
              ✕
            </button>

            <img
              src={previewImage.url}
              alt={previewImage.name || 'Income proof preview'}
              className="max-h-[85vh] max-w-full rounded-lg object-contain"
            />

            <p className="mt-3 text-sm text-white">
              {previewImage.name || 'Household Income Proof'}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

function MemberDetail({ label, value }) {
  return (
    <div>
      <div className="text-xl font-medium text-gray-500">{label}</div>
      <div className="mt-0.5 text-2xl font-semibold text-gray-900">
        {value || '—'}
      </div>
    </div>
  );
}