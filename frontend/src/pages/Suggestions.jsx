import { useEffect, useMemo, useState } from 'react';
import { api } from '../lib/api';
import toast from 'react-hot-toast';
import { useNavigate } from 'react-router-dom';

import {
  PageHeader,
  Band,
  Table,
  Status,
  statusTone,
  Spinner,
  Input,
  Select,
} from '../components/ui';

const PUROKS = [
  '1', '1-A', '2', '2-A', '3', '3-A', '4', '5', '5-A', '5-B', '5-C',
  '6', '6-A', '7', '7-A', '8', '8-A', '9', '9-A',
];

function hasIncomeProof(household) {
  const images = household?.income_proof_images;

  return (
    Array.isArray(images) &&
    images.some((image) =>
      typeof image === 'string' ? image.trim().length > 0 : Boolean(image)
    )
  );
}

/* ==========================================================================
   PRESENTATION HELPERS
========================================================================== */

function levelOf(vulnerability) {
  const v = String(vulnerability || '').toLowerCase();
  if (v.includes('high')) return 'High';
  if (v.includes('moderate')) return 'Moderate';
  if (v.includes('low')) return 'Low';
  return null;
}

const LEVEL_STYLES = {
  High: 'bg-red-50 text-red-700 ring-red-200',
  Moderate: 'bg-amber-50 text-amber-700 ring-amber-200',
  Low: 'bg-green-50 text-green-700 ring-green-200',
};

const LEVEL_DOTS = {
  High: 'bg-red-500',
  Moderate: 'bg-amber-500',
  Low: 'bg-green-500',
};

function LevelPill({ vulnerability }) {
  const level = levelOf(vulnerability);

  if (!level) {
    return (
      <span className="rounded-full bg-gray-100 px-3 py-1 text-2xl font-semibold text-gray-500 ring-1 ring-gray-200">
        Not vulnerable
      </span>
    );
  }

  return (
    <span
      className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xl font-semibold ring-1 ${LEVEL_STYLES[level]}`}
    >
      <span className={`h-2 w-2 rounded-full ${LEVEL_DOTS[level]}`} />
      {level}
    </span>
  );
}

function ProgramChips({ programs }) {
  if (!programs.length) return <span className="text-gray-400">—</span>;

  return (
    <div className="flex flex-wrap gap-1.5">
      {programs.map((program) => (
        <span
          key={program.program_id}
          className="rounded-full bg-[#F8E9EB] px-3 py-1 text-xl font-medium text-[#6E2430]"
        >
          {program.program_name}
        </span>
      ))}
    </div>
  );
}

function PrimaryButton({ className = '', ...props }) {
  return (
    <button
      type="button"
      className={`rounded-xl bg-gradient-to-r from-[#7A2837] to-[#5A1C28] px-5 py-2.5 text-lg font-semibold text-white shadow-sm shadow-[#6E2430]/25 transition hover:brightness-110 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#6E2430]/30 disabled:cursor-not-allowed disabled:opacity-50 ${className}`}
      {...props}
    />
  );
}

function GhostButton({ className = '', ...props }) {
  return (
    <button
      type="button"
      className={`rounded-xl border border-gray-300 bg-white px-5 py-2.5 text-lg font-semibold text-gray-700 transition hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#6E2430] disabled:cursor-not-allowed disabled:opacity-50 ${className}`}
      {...props}
    />
  );
}

function SubHeading({ title, count, hint }) {
  return (
    <div className="mb-3 flex flex-wrap items-center gap-3">
      <h3 className="text-2xl font-bold text-[#6E2430]">{title}</h3>
      <span className="rounded-full bg-[#F8E9EB] px-3 py-0.5 text-base font-bold text-[#6E2430]">
        {count}
      </span>
      {hint && <span className="text-base text-gray-500">{hint}</span>}
    </div>
  );
}

const cell = 'px-4 py-3 text-2xl';
const fieldClass =
  'rounded-xl border border-gray-300 bg-white px-4 py-2.5 text-lg font-medium text-gray-900 ' +
  'focus:border-[#6E2430] focus:outline-none focus:ring-4 focus:ring-[#6E2430]/15';

export default function Suggestions() {
  // ==================================================
  // STATE
  // ==================================================

  const navigate = useNavigate();

  const [households, setHouseholds] = useState([]);
  const [programs, setPrograms] = useState([]);
  const [beneficiaryStatuses, setBeneficiaryStatuses] = useState([]);

  const [loading, setLoading] = useState(true);
  const [programLoading, setProgramLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Filters
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [purok, setPurok] = useState('');

  // Household detail
  const [detail, setDetail] = useState(null);

  // Selected program
  const [selectedProgramId, setSelectedProgramId] = useState('');
  const [selectedProgram, setSelectedProgram] = useState('');

  // Number / vulnerability input
  const [generateCount, setGenerateCount] = useState('');
  const [vulnerabilityFilter, setVulnerabilityFilter] =
    useState('High Vulnerable');

  // Generated households
  const [generated, setGenerated] = useState(null);

  // ==================================================
  // LOAD PROGRAMS
  // ==================================================

  useEffect(() => {
    let mounted = true;

    const loadPrograms = async () => {
      try {
        setProgramLoading(true);

        const data = await api.get('/programs');

        if (!mounted) return;

        setPrograms(
          Array.isArray(data?.programs)
            ? data.programs
            : Array.isArray(data)
            ? data
            : []
        );
      } catch (e) {
        if (!mounted) return;

        console.error('Load programs error:', e);

        toast.error(
          e?.response?.data?.error ||
            e?.message ||
            'Failed to load assistance programs.'
        );

        setPrograms([]);
      } finally {
        if (mounted) setProgramLoading(false);
      }
    };

    loadPrograms();

    return () => {
      mounted = false;
    };
  }, []);

  // ==================================================
  // LOAD HOUSEHOLDS
  // ==================================================

  useEffect(() => {
    let mounted = true;

    const loadHouseholds = async () => {
      try {
        setLoading(true);

        const data = await api.get('/households');

        if (!mounted) return;

        setHouseholds(
          Array.isArray(data?.households)
            ? data.households
            : Array.isArray(data)
            ? data
            : []
        );
      } catch (e) {
        if (!mounted) return;

        console.error('Load households error:', e);

        toast.error(
          e?.response?.data?.error || e?.message || 'Failed to load households.'
        );

        setHouseholds([]);
      } finally {
        if (mounted) setLoading(false);
      }
    };

    loadHouseholds();

    return () => {
      mounted = false;
    };
  }, []);

  // ==================================================
  // LOAD BENEFICIARY VALIDATION STATUSES
  // Backend returns { validations: [...] }
  // ==================================================

  useEffect(() => {
    let mounted = true;

    const loadBeneficiaryStatuses = async () => {
      try {
        const data = await api.get(
          '/validation/beneficiary-validation/statuses'
        );

        if (!mounted) return;

        setBeneficiaryStatuses(
          Array.isArray(data?.validations)
            ? data.validations
            : Array.isArray(data?.statuses)
            ? data.statuses
            : Array.isArray(data)
            ? data
            : []
        );
      } catch (e) {
        if (!mounted) return;

        console.error('Load beneficiary statuses error:', e);

        toast.error(
          e?.response?.data?.error ||
            e?.message ||
            'Failed to load beneficiary statuses.'
        );

        setBeneficiaryStatuses([]);
      }
    };

    loadBeneficiaryStatuses();

    return () => {
      mounted = false;
    };
  }, []);

  // ==================================================
  // PROGRAM-SPECIFIC VALIDATION (household_id + program_id)
  // This is NOT household.validation_status.
  // ==================================================

  const getProgramValidation = (householdId, programId) => {
    if (!householdId || !programId) return null;

    return (
      beneficiaryStatuses
        .filter(
          (item) =>
            String(item.household_id) === String(householdId) &&
            String(item.program_id) === String(programId)
        )
        .sort(
          (a, b) =>
            new Date(b.submitted_at || 0).getTime() -
            new Date(a.submitted_at || 0).getTime()
        )[0] || null
    );
  };

  // ==================================================
  // NORMALIZE SUGGESTED PROGRAMS
  // suggested_programs normally holds program names, so this maps them to
  // [{ program_id, program_name }].
  // ==================================================

  const normalizeSuggestedPrograms = (suggestedPrograms) => {
    if (!suggestedPrograms) return [];

    let items = suggestedPrograms;

    if (typeof items === 'string') {
      const value = items.trim();

      if (!value) return [];

      try {
        items = JSON.parse(value);
      } catch {
        // Handle PostgreSQL array text such as: {"Rice Subsidy Program","4Ps"}
        if (value.startsWith('{') && value.endsWith('}')) {
          items = value
            .slice(1, -1)
            .split(',')
            .map((item) => item.trim().replace(/^"|"$/g, ''))
            .filter(Boolean);
        } else {
          items = value.split(',').map((item) => item.trim());
        }
      }
    }

    if (!Array.isArray(items)) {
      items = [items];
    }

    return items
      .map((value) => {
        if (!value) return null;

        const programId =
          typeof value === 'object' ? String(value.program_id || '').trim() : '';

        const programName =
          typeof value === 'object'
            ? String(value.program_name || value.name || value.title || '').trim()
            : String(value).trim();

        const matchingProgram = programs.find((program) => {
          const sameId =
            programId && String(program.program_id) === programId;

          const sameName =
            programName &&
            String(program.program_name || '').trim().toLowerCase() ===
              programName.toLowerCase();

          return sameId || sameName;
        });

        if (!matchingProgram && !programId) {
          return null;
        }

        return {
          ...(typeof value === 'object' ? value : {}),
          ...(matchingProgram || {}),
          program_id: matchingProgram?.program_id || programId,
          program_name: matchingProgram?.program_name || programName,
        };
      })
      .filter((program) => program?.program_id && program?.program_name);
  };

  // ==================================================
  // FILTER HOUSEHOLDS (income proof + suggested programs only)
  // ==================================================

  const filtered = useMemo(() => {
    const searchText = q.trim().toLowerCase();

    return households.filter((household) => {
      // Must have an income-proof image
      if (!hasIncomeProof(household)) return false;

      // Must have at least one suggested program
      const normalized = normalizeSuggestedPrograms(household.suggested_programs);

      if (normalized.length === 0) return false;

      const householdName = String(household.household_head_name || '').toLowerCase();

      const matchesSearch = !searchText || householdName.includes(searchText);
      const matchesStatus = !status || household.vulnerability === status;
      const matchesPurok = !purok || String(household.purok) === String(purok);

      return matchesSearch && matchesStatus && matchesPurok;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [households, q, status, purok, programs]);

  // ==================================================
  // SUGGESTED PROGRAMS (dropdown)
  // ==================================================

  const suggestedPrograms = useMemo(() => {
    const programMap = new Map();

    households.filter(hasIncomeProof).forEach((household) => {
      const normalized = normalizeSuggestedPrograms(household.suggested_programs);

      normalized.forEach((program) => {
        if (!program.program_id) return;

        programMap.set(String(program.program_id), program);
      });
    });

    return Array.from(programMap.values()).sort((a, b) =>
      String(a.program_name || '').localeCompare(String(b.program_name || ''))
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [households, programs]);

  // ==================================================
  // SELECT PROGRAM
  // ==================================================

  const handleSelectProgram = (programId) => {
    if (!programId) {
      setSelectedProgramId('');
      setSelectedProgram('');
      setGenerateCount('');
      setGenerated(null);
      return;
    }

    const program = suggestedPrograms.find(
      (item) => String(item.program_id) === String(programId)
    );

    if (!program) {
      setSelectedProgramId('');
      setSelectedProgram('');
      setGenerateCount('');
      setGenerated(null);
      return;
    }

    setSelectedProgramId(String(program.program_id));
    setSelectedProgram(String(program.program_name || '').trim());
    setGenerated(null);
    setGenerateCount('');
  };

  // ==================================================
  // ELIGIBLE HOUSEHOLDS
  // Households already Pending/Approved for THIS program are removed.
  // Rejected households can appear again.
  // ==================================================

  const eligibleHouseholds = useMemo(() => {
    if (!selectedProgramId) return [];

    const priority = {
      'High Vulnerable': 1,
      'Moderate Vulnerable': 2,
      'Low Vulnerable': 3,
      'Not Vulnerable': 4,
    };

    return households
      .filter(hasIncomeProof)
      .filter((household) => {
        const suggested = normalizeSuggestedPrograms(household.suggested_programs);

        return suggested.some(
          (program) => String(program.program_id) === String(selectedProgramId)
        );
      })
      .filter((household) => {
        if (
          !vulnerabilityFilter ||
          vulnerabilityFilter === 'All Vulnerability Levels'
        ) {
          return true;
        }

        return (
          String(household.vulnerability || '').toLowerCase() ===
          vulnerabilityFilter.toLowerCase()
        );
      })
      .filter((household) => {
        const existing = getProgramValidation(
          household.household_id,
          selectedProgramId
        );

        return !(
          existing &&
          ['Pending', 'Approved'].includes(String(existing.validation_status))
        );
      })
      .sort((a, b) => {
        const priorityDifference =
          (priority[a.vulnerability] || 99) - (priority[b.vulnerability] || 99);

        if (priorityDifference !== 0) return priorityDifference;

        return Number(a.monthly_income || 0) - Number(b.monthly_income || 0);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    households,
    selectedProgramId,
    vulnerabilityFilter,
    beneficiaryStatuses,
    programs,
  ]);

  // ==================================================
  // GENERATE
  // ==================================================

  const handleGenerateProgram = () => {
    if (!selectedProgramId || !selectedProgram) {
      toast.error('Please select a suggested program first.');
      return;
    }

    const count = Number(generateCount);

    if (!generateCount || !Number.isInteger(count) || count < 1) {
      toast.error('Please enter a valid number of households to generate.');
      return;
    }

    if (eligibleHouseholds.length === 0) {
      toast.error(
        `No new households are available for ${selectedProgram} under the selected vulnerability level.`
      );

      setGenerated({
        program: selectedProgram,
        program_id: selectedProgramId,
        available: [],
        selected: [],
        total: 0,
        requestedCount: count,
      });

      return;
    }

    // The number input controls how many households are generated.
    const safeCount = Math.min(count, eligibleHouseholds.length);
    const generatedHouseholds = eligibleHouseholds.slice(0, safeCount);

    setGenerated({
      program: selectedProgram,
      program_id: selectedProgramId,
      available: generatedHouseholds,
      selected: [],
      total: generatedHouseholds.length,
      requestedCount: count,
    });
  };

  // ==================================================
  // ADD HOUSEHOLD
  // ==================================================

  const handleAddToProgram = (household) => {
    if (!generated) return;

    if (!hasIncomeProof(household)) {
      toast.error(
        'This household cannot be added because no income-proof image has been uploaded.'
      );
      return;
    }

    if (!household?.household_id) {
      toast.error('Invalid household.');
      return;
    }

    const existingStatus = getProgramValidation(
      household.household_id,
      generated.program_id
    );

    if (existingStatus?.validation_status === 'Pending') {
      toast.error(
        `${household.household_head_name || 'This household'} is already Pending for ${generated.program}.`
      );
      return;
    }

    if (existingStatus?.validation_status === 'Approved') {
      toast.error(
        `${household.household_head_name || 'This household'} is already Approved for ${generated.program}.`
      );
      return;
    }

    setGenerated((previous) => {
      if (!previous) return previous;

      const householdId = String(household.household_id);

      const alreadySelected = previous.selected.some(
        (item) => String(item.household_id) === householdId
      );

      if (alreadySelected) return previous;

      return {
        ...previous,
        available: previous.available.filter(
          (item) => String(item.household_id) !== householdId
        ),
        selected: [...previous.selected, household],
      };
    });
  };

  // ==================================================
  // REMOVE HOUSEHOLD
  // ==================================================

  const handleRemove = (household) => {
    if (!generated) return;

    if (!household?.household_id) return;

    setGenerated((previous) => {
      if (!previous) return previous;

      const householdId = String(household.household_id);

      const removedHousehold = previous.selected.find(
        (item) => String(item.household_id) === householdId
      );

      if (!removedHousehold) return previous;

      const alreadyAvailable = previous.available.some(
        (item) => String(item.household_id) === householdId
      );

      return {
        ...previous,
        selected: previous.selected.filter(
          (item) => String(item.household_id) !== householdId
        ),
        available: alreadyAvailable
          ? previous.available
          : [...previous.available, removedHousehold],
      };
    });
  };

  // ==================================================
  // ERROR HELPERS
  // ==================================================

  const getErrorStatus = (error) =>
    error?.response?.status || error?.status || null;

  const getErrorMessage = (error) =>
    String(
      error?.response?.data?.error ||
        error?.response?.data?.message ||
        error?.message ||
        ''
    ).toLowerCase();

  // ==================================================
  // SAVE SELECTED BENEFICIARIES
  // ==================================================

  const handleSaveBeneficiaries = async () => {
    if (
      !generated ||
      !Array.isArray(generated.selected) ||
      generated.selected.length === 0
    ) {
      toast.error('Please click Add for at least one household before saving.');
      return;
    }

    if (!selectedProgramId || !selectedProgram) {
      toast.error('Please select a program first.');
      return;
    }

    try {
      setSaving(true);

      let saved = 0;
      let skipped = 0;
      let failed = 0;

      for (const household of generated.selected) {
        const householdId = household?.household_id;

        if (!hasIncomeProof(household)) {
          console.warn('Skipped household without income proof:', householdId);
          skipped++;
          continue;
        }

        if (!householdId) {
          console.error('Missing household_id:', household);
          failed++;
          continue;
        }

        // Extra frontend duplicate check
        const existing = getProgramValidation(householdId, selectedProgramId);

        if (
          existing &&
          ['Pending', 'Approved'].includes(existing.validation_status)
        ) {
          skipped++;
          continue;
        }

        try {
          await api.post('/validation/beneficiary-validation', {
            household_id: householdId,
            program_id: selectedProgramId,
          });

          saved++;
        } catch (e) {
          console.error('Failed to save beneficiary validation:', {
            household_id: householdId,
            program_id: selectedProgramId,
            error: e,
          });

          const responseStatus = getErrorStatus(e);
          const errorMessage = getErrorMessage(e);

          if (
            responseStatus === 409 ||
            errorMessage.includes('already') ||
            errorMessage.includes('duplicate') ||
            errorMessage.includes('unique constraint')
          ) {
            skipped++;
          } else {
            failed++;
          }
        }
      }

      // Refresh status from database
      if (saved > 0) {
        try {
          const statusData = await api.get(
            '/validation/beneficiary-validation/statuses'
          );

          setBeneficiaryStatuses(
            Array.isArray(statusData?.validations)
              ? statusData.validations
              : Array.isArray(statusData?.statuses)
              ? statusData.statuses
              : Array.isArray(statusData)
              ? statusData
              : []
          );
        } catch (refreshError) {
          console.error('Failed to refresh beneficiary statuses:', refreshError);
        }
      }

      // Result message
      let message = '';

      if (saved > 0) {
        message =
          `${saved} household(s) were saved to Beneficiary Validation for ${selectedProgram}. ` +
          `They are now Pending Captain approval.`;
      } else {
        message = 'No new households were saved to Beneficiary Validation.';
      }

      if (skipped > 0) {
        message += ` ${skipped} household(s) were already submitted for this program.`;
      }

      if (failed > 0) {
        message += ` ${failed} household(s) failed to save.`;
      }

      if (failed > 0 && saved === 0) {
        toast.error(message);
      } else if (skipped > 0 && saved === 0) {
        toast.error(message);
      } else if (saved > 0 && (skipped > 0 || failed > 0)) {
        toast(message, { icon: '⚠️', duration: 5000 });
      } else if (saved > 0) {
        toast.success(message);
      } else {
        toast.error(message);
      }

      // Clear after success
      if (saved > 0) {
        setGenerated(null);
      }
    } catch (e) {
      console.error('Save beneficiary validation error:', e);

      toast.error(
        e?.response?.data?.error ||
          e?.response?.data?.message ||
          e?.message ||
          'Failed to save beneficiary validation.'
      );
    } finally {
      setSaving(false);
    }
  };

  // ==================================================
  // ADD ALL / REMOVE ALL
  // ==================================================

  const handleAddAll = () => {
    if (!generated) return;

    setGenerated((previous) => {
      if (!previous) return previous;

      const selectedIds = new Set(
        previous.selected.map((item) => String(item.household_id))
      );

      const newItems = previous.available.filter((item) => {
        if (!hasIncomeProof(item)) return false;

        const householdId = String(item.household_id);

        if (selectedIds.has(householdId)) return false;

        const existing = getProgramValidation(householdId, previous.program_id);

        return !(
          existing &&
          ['Pending', 'Approved'].includes(String(existing.validation_status))
        );
      });

      return {
        ...previous,
        selected: [...previous.selected, ...newItems],
        available: previous.available.filter(
          (item) =>
            !newItems.some(
              (selected) =>
                String(selected.household_id) === String(item.household_id)
            )
        ),
      };
    });
  };

  const handleRemoveAll = () => {
    if (!generated) return;

    setGenerated((previous) => {
      if (!previous) return previous;

      return {
        ...previous,
        available: [...previous.available, ...previous.selected],
        selected: [],
      };
    });
  };

  // ==================================================
  // CLEAR
  // ==================================================

  const clearProgram = () => {
    setSelectedProgramId('');
    setSelectedProgram('');
    setGenerateCount('');
    setGenerated(null);
  };

  const clearFilters = () => {
    setQ('');
    setStatus('');
    setPurok('');
  };

  // ==================================================
  // RENDER
  // ==================================================

  const progressPct = generated?.total
    ? Math.round((generated.selected.length / generated.total) * 100)
    : 0;

  return (
    <div className="space-y-6">
      {/* HEADER */}
      <div className="mt-5 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <PageHeader
            title="Assistance Programs"
            subtitle="Socio-economic classification, household results, and recommendation status tracking."
          />
        </div>

        <PrimaryButton onClick={() => navigate('/calamity-program')}>
          + Add Household Calamity
        </PrimaryButton>
      </div>

      {/* FILTERS */}
      <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-[#EBD3D3] bg-white p-4 shadow-sm">
        <Input
          placeholder="Search household..."
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="max-w-xs"
        />

        <Select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className="max-w-xs"
        >
          <option value="">All Vulnerable</option>
          <option value="High Vulnerable">High Vulnerable</option>
          <option value="Moderate Vulnerable">Moderate Vulnerable</option>
          <option value="Low Vulnerable">Low Vulnerable</option>
          <option value="Not Vulnerable">Not Vulnerable</option>
        </Select>

        <Select value={purok} onChange={(e) => setPurok(e.target.value)}>
          <option value="">All Puroks</option>
          {PUROKS.map((p) => (
            <option key={p} value={p}>
              Purok {p}
            </option>
          ))}
        </Select>

        <Select
          value={selectedProgramId}
          onChange={(e) => handleSelectProgram(e.target.value)}
          disabled={programLoading || suggestedPrograms.length === 0}
        >
          <option value="">
            {programLoading
              ? 'Loading Programs...'
              : suggestedPrograms.length === 0
              ? 'No Suggested Programs'
              : 'Select Suggested Program'}
          </option>

          {suggestedPrograms.map((program) => (
            <option key={program.program_id} value={program.program_id}>
              {program.program_name}
            </option>
          ))}
        </Select>

        {(q || status || purok) && (
          <button
            type="button"
            onClick={clearFilters}
            className="rounded-xl px-4 py-2 text-base font-semibold text-[#6E2430] hover:bg-[#F8E9EB]"
          >
            Clear filters
          </button>
        )}
      </div>

      {/* SELECTED PROGRAM */}
      {selectedProgram && (
        <div className="rounded-2xl border border-[#6E2430]/25 bg-gradient-to-r from-[#FBF6F6] to-white p-5 shadow-sm">
          <div className="flex flex-wrap items-center gap-x-8 gap-y-4">
            <div>
              <p className="text-xl font-semibold text-gray-500">
                Selected program
              </p>
              <p className="text-3xl font-extrabold text-[#6E2430]">
                {selectedProgram}
              </p>
              <p className="mt-0.5 text-lg text-gray-600">
                <span className="font-bold text-gray-900">
                  {eligibleHouseholds.length}
                </span>{' '}
                household{eligibleHouseholds.length !== 1 ? 's' : ''} available
              </p>
            </div>

            <div className="flex flex-wrap items-end gap-3">
              <label className="block">
              
                <select
                  value={vulnerabilityFilter}
                  onChange={(e) => setVulnerabilityFilter(e.target.value)}
                  className={fieldClass}
                >
                  <option value="High Vulnerable">High Vulnerable</option>
                  <option value="Moderate Vulnerable">Moderate Vulnerable</option>
                  <option value="All Vulnerability Levels">
                    All Vulnerability Levels
                  </option>
                </select>
              </label>

              <label className="block">
                
                <input
                  type="number"
                  min="1"
                  max={eligibleHouseholds.length || undefined}
                  placeholder="Number"
                  value={generateCount}
                  onChange={(e) => setGenerateCount(e.target.value)}
                  className={`${fieldClass} w-32 placeholder:text-gray-400`}
                />
              </label>

              <PrimaryButton
                onClick={handleGenerateProgram}
                disabled={eligibleHouseholds.length === 0}
              >
                Generate
              </PrimaryButton>

              <GhostButton onClick={clearProgram}>Cancel</GhostButton>
            </div>
          </div>
        </div>
      )}

      {/* GENERATED HOUSEHOLDS */}
      {generated && (
        <div className="overflow-hidden rounded-2xl border border-[#EBD3D3] bg-white shadow-md">
          {/* Header with progress */}
          <div className="bg-gradient-to-r from-[#6E2430] to-[#8A2D3C] px-6 py-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-2xl font-bold text-white">
                  {generated.program} — Beneficiary Selection
                </p>
                <p className="mt-0.5 text-lg text-white/80">
                  {generated.selected.length} added of {generated.total} generated
                </p>
              </div>

              <button
                type="button"
                onClick={() => setGenerated(null)}
                className="rounded-xl border border-white/50 px-4 py-2 text-lg font-semibold text-white hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
              >
                Close
              </button>
            </div>

            <div className="mt-4 h-2.5 overflow-hidden rounded-full bg-white/20">
              <div
                className="h-full rounded-full bg-white transition-all duration-300"
                style={{ width: `${progressPct}%` }}
              />
            </div>
          </div>

          {/* Action bar */}
          <div className="flex flex-wrap items-center gap-3 border-b border-[#EBD3D3] bg-[#FBF6F6] px-6 py-4">
            <PrimaryButton
              onClick={handleAddAll}
              disabled={saving || generated.available.length === 0}
            >
              Add all
            </PrimaryButton>

            <GhostButton
              onClick={handleRemoveAll}
              disabled={saving || generated.selected.length === 0}
            >
              Remove all
            </GhostButton>

            <div className="ml-auto text-xl font-semibold text-gray-600">
              Selected:{' '}
              <span className="text-2xl font-extrabold text-[#6E2430]">
                {generated.selected.length}
              </span>
            </div>
          </div>

          {/* Available households */}
          <div className="px-6 py-5">
            <SubHeading
              title="Available Households"
              count={generated.available.length}
            />

            <div className="max-h-[460px] overflow-auto rounded-xl border border-[#EBD3D3] scrollbar-hide">
              <Table
                head={[
                  '#',
                  'Household',
                  'Purok',
                  'Monthly Income',
                  'Dependents',
                  'Classification',
                  'Suggested Programs',
                  'Status',
                  'Action',
                ]}
              >
                {generated.available.map((household, index) => {
                  const normalized = normalizeSuggestedPrograms(
                    household.suggested_programs
                  );

                  return (
                    <tr
                      key={household.household_id}
                      className="border-t border-gray-100 hover:bg-[#FBF6F6]"
                    >
                      <td className={`${cell} text-gray-500`}>{index + 1}</td>

                      <td className={`${cell} font-semibold text-[#6E2430]`}>
                        {household.household_head_name || '—'}
                      </td>

                      <td className={cell}>{household.purok || '—'}</td>

                      <td className={cell}>
                        ₱{Number(household.monthly_income || 0).toLocaleString()}
                      </td>

                      <td className={cell}>{household.family_number || 0}</td>

                      <td className="px-4 py-3">
                        <LevelPill vulnerability={household.vulnerability} />
                      </td>

                      <td className="px-4 py-3">
                        {!hasIncomeProof(household) ? (
                          <span className="text-lg font-semibold text-amber-700">
                            Income-proof image required
                          </span>
                        ) : (
                          <ProgramChips programs={normalized} />
                        )}
                      </td>

                      <td className="px-4 py-3">
                        <span className="rounded-full bg-gray-100 px-3 py-1 text-base font-semibold text-gray-600 ring-1 ring-gray-200">
                          Not submitted
                        </span>
                      </td>

                      <td className="px-4 py-3">
                        <PrimaryButton
                          className="!px-4 !py-2"
                          disabled={saving}
                          onClick={() => handleAddToProgram(household)}
                        >
                          Add
                        </PrimaryButton>
                      </td>
                    </tr>
                  );
                })}

                {!generated.available.length && (
                  <tr>
                    <td
                      colSpan={9}
                      className="px-5 py-10 text-center text-lg text-gray-400"
                    >
                      All eligible households have already been added or
                      submitted for this program.
                    </td>
                  </tr>
                )}
              </Table>
            </div>
          </div>

          {/* Selected beneficiaries */}
          <div className="border-t border-[#EBD3D3] px-6 py-5">
            <SubHeading
              title="Selected Beneficiaries"
              count={generated.selected.length}
            />

            <div className="max-h-[460px] overflow-auto rounded-xl border border-[#EBD3D3] scrollbar-hide">
              <Table
                head={[
                  '#',
                  'Household',
                  'Purok',
                  'Monthly Income',
                  'Dependents',
                  'Classification',
                  'Program',
                  'Status',
                  'Action',
                ]}
              >
                {generated.selected.map((household, index) => (
                  <tr
                    key={household.household_id}
                    className="border-t border-gray-100 hover:bg-[#FBF6F6]"
                  >
                    <td className={`${cell} text-gray-500`}>{index + 1}</td>

                    <td className={`${cell} font-semibold text-[#6E2430]`}>
                      {household.household_head_name || '—'}
                    </td>

                    <td className={cell}>{household.purok || '—'}</td>

                    <td className={cell}>
                      ₱{Number(household.monthly_income || 0).toLocaleString()}
                    </td>

                    <td className={cell}>{household.family_number || 0}</td>

                    <td className="px-4 py-3">
                      <LevelPill vulnerability={household.vulnerability} />
                    </td>

                    <td className={`${cell} font-semibold text-[#6E2430]`}>
                      {generated.program}
                    </td>

                    <td className="px-4 py-3">
                      <span className="rounded-full bg-amber-50 px-3 py-1 text-base font-semibold text-amber-700 ring-1 ring-amber-200">
                        Pending
                      </span>
                    </td>

                    <td className="px-4 py-3">
                      <button
                        type="button"
                        disabled={saving}
                        onClick={() => handleRemove(household)}
                        className="rounded-xl border border-red-300 px-4 py-2 text-lg font-semibold text-red-600 transition hover:bg-red-50 disabled:opacity-50"
                      >
                        Remove
                      </button>
                    </td>
                  </tr>
                ))}

                {!generated.selected.length && (
                  <tr>
                    <td
                      colSpan={9}
                      className="px-5 py-10 text-center text-lg text-gray-400"
                    >
                      No households added yet. Click Add above.
                    </td>
                  </tr>
                )}
              </Table>
            </div>
          </div>

          {/* Save */}
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[#EBD3D3] bg-[#FBF6F6] px-6 py-5">
            <div className="text-xl text-gray-600">
              <strong className="text-2xl text-[#6E2430]">
                {generated.selected.length}
              </strong>{' '}
              household{generated.selected.length !== 1 ? 's' : ''} ready to save
            </div>

            <PrimaryButton
              className="!px-7 !py-3 !text-xl"
              disabled={saving || generated.selected.length === 0}
              onClick={handleSaveBeneficiaries}
            >
              {saving ? 'Saving...' : `Save (${generated.selected.length})`}
            </PrimaryButton>
          </div>
        </div>
      )}

      {/* HOUSEHOLDS WITH SUGGESTED PROGRAMS */}
      {loading ? (
        <Spinner />
      ) : (
        <Band title="Suggested Programs Per Household">
          <p className="mb-3 ml-4 mt-4 text-2xl text-gray-500">
            <span className="text-2xl font-bold text-[#6E2430]">
              {filtered.length}
            </span>{' '}
            household(s)
          </p>

          <div className="overflow-x-auto rounded-xl border border-[#EBD3D3] scrollbar-hide">
            <Table
              head={[
                'Household',
                'Purok',
                'Classification',
                'Suggested Program',
                'Status',
              ]}
            >
              {filtered.map((household) => {
                const normalized = normalizeSuggestedPrograms(
                  household.suggested_programs
                );
                const isOpen =
                  detail?.household_id === household.household_id;

                return (
                  <tr
                    key={household.household_id}
                    className={`cursor-pointer border-t border-gray-100 transition hover:bg-[#FBF6F6] ${
                      isOpen ? 'bg-[#FFF0F0]' : ''
                    }`}
                    onClick={() => setDetail(household)}
                  >
                    <td className={`${cell} font-semibold text-[#6E2430] text-2xl`}>
                      {household.household_head_name || '—'}
                    </td>

                    <td className={cell}>{household.purok || '—'}</td>

                    <td className="px-4 py-3">
                      <LevelPill vulnerability={household.vulnerability} />
                    </td>

                    <td className="px-4 py-3">
                      <ProgramChips programs={normalized} />
                    </td>

                    <td className="px-4 py-3">
                      <Status tone={statusTone(household.validation_status)}>
                        {household.validation_status || 'Pending'}
                      </Status>
                    </td>
                  </tr>
                );
              })}

              {!filtered.length && (
                <tr>
                  <td
                    colSpan={5}
                    className="px-5 py-12 text-center text-lg text-gray-400"
                  >
                    No households with income proof and suggested assistance
                    programs found.
                  </td>
                </tr>
              )}
            </Table>
          </div>
        </Band>
      )}

      {/* HOUSEHOLD DETAIL */}
      {detail && (
        <div className="overflow-hidden rounded-2xl border border-[#EBD3D3] bg-white shadow-md">
          <div className="flex items-center justify-between gap-3 bg-gradient-to-r from-[#6E2430] to-[#8A2D3C] px-6 py-4">
            <h2 className="text-xl font-bold text-white">
              Household Result Detail — {detail.household_head_name}
            </h2>

            <button
              type="button"
              onClick={() => setDetail(null)}
              aria-label="Close household detail"
              className="rounded-lg p-1.5 text-xl leading-none text-white/80 hover:bg-white/15 hover:text-white"
            >
              ✕
            </button>
          </div>

          <dl className="grid gap-x-8 gap-y-5 p-6 md:grid-cols-2">
            <div>
              <dt className="text-xl font-semibold text-gray-500">
                Socio-economic classification
              </dt>
              <dd className="mt-1">
                <LevelPill vulnerability={detail.vulnerability} />
              </dd>
            </div>

            <div>
              <dt className="text-xl font-semibold text-gray-500">
                Current status
              </dt>
              <dd className="mt-1 text-2xl font-semibold text-gray-900">
                {detail.validation_status || 'Pending'}
              </dd>
            </div>

            <div className="md:col-span-2">
              <dt className="text-xl font-semibold text-gray-500">Basis</dt>
              <dd className="mt-1 text-2xl text-gray-800">
                Income ₱{Number(detail.monthly_income || 0).toLocaleString()}
                /month, {detail.family_number || 0} dependents
                {detail.occupation && detail.occupation !== 'None'
                  ? `, ${detail.occupation}`
                  : ', no stable employment'}
              </dd>
            </div>

            <div>
              <dt className="text-xl font-semibold text-gray-500">
                Income proof
              </dt>
              <dd className="mt-1">
                {hasIncomeProof(detail) ? (
                  <span className="rounded-full bg-green-50 px-3 py-1 text-2xl font-semibold text-green-700 ring-1 ring-green-200">
                    Uploaded
                  </span>
                ) : (
                  <span className="text-lg font-semibold text-amber-700">
                    Required — no income-proof image uploaded
                  </span>
                )}
              </dd>
            </div>

            <div>
              <dt className="text-xl font-semibold text-gray-500">
                Encoded by
              </dt>
              <dd className="mt-1 text-2xl font-semibold text-gray-900">
                {detail.encoded_by || '—'}
              </dd>
            </div>

            <div className="md:col-span-2">
              <dt className="mb-1.5 text-xl font-semibold text-gray-500">
                Suggested programs
              </dt>
              <dd>
                {!hasIncomeProof(detail) ? (
                  <span className="text-lg text-gray-500">
                    Unavailable — upload an income-proof image first.
                  </span>
                ) : normalizeSuggestedPrograms(detail.suggested_programs)
                    .length ? (
                  <ProgramChips
                    programs={normalizeSuggestedPrograms(
                      detail.suggested_programs
                    )}
                  />
                ) : (
                  <span className="text-lg text-gray-500">
                    No matching programs
                  </span>
                )}
              </dd>
            </div>
          </dl>
        </div>
      )}
    </div>
  );
}