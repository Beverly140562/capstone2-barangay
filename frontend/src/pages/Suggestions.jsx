import { useEffect, useMemo, useState } from 'react';
import { api } from '../lib/api';
import toast from 'react-hot-toast';

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

import { useNavigate } from 'react-router-dom';

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

  // ==================================================
  // FILTERS
  // ==================================================

  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [purok, setPurok] = useState('');

  // ==================================================
  // HOUSEHOLD DETAIL
  // ==================================================

  const [detail, setDetail] = useState(null);

  // ==================================================
  // SELECTED PROGRAM
  // ==================================================

  const [selectedProgramId, setSelectedProgramId] = useState('');
  const [selectedProgram, setSelectedProgram] = useState('');

  // ==================================================
  // NUMBER / VULNERABILITY INPUT
  // ==================================================

  const [generateCount, setGenerateCount] = useState('');

  const [vulnerabilityFilter, setVulnerabilityFilter] =
    useState('Highly Vulnerable');

  // ==================================================
  // GENERATED HOUSEHOLDS
  // ==================================================

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

        const loadedPrograms = Array.isArray(data?.programs)
          ? data.programs
          : Array.isArray(data)
          ? data
          : [];

        setPrograms(loadedPrograms);
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
        if (mounted) {
          setProgramLoading(false);
        }
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

        const loadedHouseholds = Array.isArray(data?.households)
          ? data.households
          : Array.isArray(data)
          ? data
          : [];

        setHouseholds(loadedHouseholds);
      } catch (e) {
        if (!mounted) return;

        console.error('Load households error:', e);

        toast.error(
          e?.response?.data?.error ||
            e?.message ||
            'Failed to load households.'
        );

        setHouseholds([]);
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    };

    loadHouseholds();

    return () => {
      mounted = false;
    };
  }, []);

  // ==================================================
  // LOAD BENEFICIARY VALIDATION STATUSES
  //
  // IMPORTANT:
  // Backend returns:
  //
  // {
  //   validations: [...]
  // }
  //
  // ==================================================

  useEffect(() => {
    let mounted = true;

    const loadBeneficiaryStatuses = async () => {
      try {
        const data = await api.get(
          '/validation/beneficiary-validation/statuses'
        );

        if (!mounted) return;

        const loadedStatuses = Array.isArray(data?.validations)
          ? data.validations
          : Array.isArray(data?.statuses)
          ? data.statuses
          : Array.isArray(data)
          ? data
          : [];

        setBeneficiaryStatuses(loadedStatuses);

        console.log(
          'Loaded beneficiary validation statuses:',
          loadedStatuses
        );
      } catch (e) {
        if (!mounted) return;

        console.error(
          'Load beneficiary statuses error:',
          e
        );

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
  // GET PROGRAM-SPECIFIC VALIDATION
  //
  // Checks:
  // household_id + program_id
  //
  // This is NOT household.validation_status.
  // ==================================================

  const getProgramValidation = (
    householdId,
    programId
  ) => {
    if (!householdId || !programId) {
      return null;
    }

    return (
      beneficiaryStatuses
        .filter(
          (item) =>
            String(item.household_id) ===
              String(householdId) &&
            String(item.program_id) ===
              String(programId)
        )
        .sort(
          (a, b) =>
            new Date(b.submitted_at || 0) -
            new Date(a.submitted_at || 0)
        )[0] || null
    );
  };

  // ==================================================
  // NORMALIZE SUGGESTED PROGRAMS
  //
  // Household suggested_programs normally contains
  // program names, not program IDs.
  //
  // This converts them into:
  //
  // [
  //   {
  //     program_id,
  //     program_name
  //   }
  // ]
  // ==================================================

  const normalizeSuggestedPrograms = (
    suggestedPrograms
  ) => {
    if (!Array.isArray(suggestedPrograms)) {
      return [];
    }

    return suggestedPrograms
      .map((programValue) => {
        const name = String(
          programValue || ''
        ).trim();

        if (!name) {
          return null;
        }

        const matchingProgram = programs.find(
          (program) =>
            String(program.program_name || '')
              .trim()
              .toLowerCase() ===
            name.toLowerCase()
        );

        if (!matchingProgram) {
          return null;
        }

        return {
          program_id: matchingProgram.program_id,
          program_name:
            matchingProgram.program_name || name,
        };
      })
      .filter(Boolean);
  };

  // ==================================================
  // FILTER HOUSEHOLDS
  // ==================================================

  const filtered = useMemo(() => {
    const searchText = q.trim().toLowerCase();

    return households.filter((household) => {
      const householdName = String(
        household.household_head_name || ''
      ).toLowerCase();

      const matchesSearch =
        !searchText ||
        householdName.includes(searchText);

      const matchesStatus =
        !status ||
        household.vulnerability === status;

      const matchesPurok =
        !purok ||
        String(household.purok) === String(purok);

      return (
        matchesSearch &&
        matchesStatus &&
        matchesPurok
      );
    });
  }, [
    households,
    q,
    status,
    purok,
  ]);

  // ==================================================
  // SUGGESTED PROGRAMS
  // ==================================================

  const suggestedPrograms = useMemo(() => {
    const programMap = new Map();

    households.forEach((household) => {
      if (
        !Array.isArray(
          household.suggested_programs
        )
      ) {
        return;
      }

      household.suggested_programs.forEach(
        (programName) => {
          const name = String(
            programName || ''
          ).trim();

          if (!name) return;

          const matchingProgram =
            programs.find(
              (program) =>
                String(
                  program.program_name || ''
                )
                  .trim()
                  .toLowerCase() ===
                name.toLowerCase()
            );

          if (!matchingProgram) return;

          const programId = String(
            matchingProgram.program_id || ''
          );

          if (!programId) return;

          programMap.set(programId, {
            ...matchingProgram,
            program_name:
              matchingProgram.program_name ||
              name,
          });
        }
      );
    });

    return Array.from(
      programMap.values()
    ).sort((a, b) =>
      String(
        a.program_name || ''
      ).localeCompare(
        String(b.program_name || '')
      )
    );
  }, [households, programs]);

  // ==================================================
  // SELECT PROGRAM
  // ==================================================

  const handleSelectProgram = (
    programId
  ) => {
    if (!programId) {
      setSelectedProgramId('');
      setSelectedProgram('');
      setGenerateCount('');
      setGenerated(null);
      return;
    }

    const program =
      suggestedPrograms.find(
        (item) =>
          String(item.program_id) ===
          String(programId)
      );

    if (!program) {
      setSelectedProgramId('');
      setSelectedProgram('');
      setGenerateCount('');
      setGenerated(null);
      return;
    }

    setSelectedProgramId(
      String(program.program_id)
    );

    setSelectedProgram(
      String(
        program.program_name || ''
      ).trim()
    );

    setGenerated(null);
    setGenerateCount('');
  };

  // ==================================================
  // ELIGIBLE HOUSEHOLDS
  //
  // IMPORTANT:
  //
  // Households already:
  //
  // Pending
  // Approved
  //
  // for THIS PROGRAM are removed.
  //
  // Rejected households can appear again.
  // ==================================================

  const eligibleHouseholds = useMemo(() => {
    if (!selectedProgramId) {
      return [];
    }

    return households
      // ----------------------------------------------
      // PROGRAM WAS SUGGESTED FOR HOUSEHOLD
      // ----------------------------------------------
      .filter((household) => {
        const suggested =
          normalizeSuggestedPrograms(
            household.suggested_programs
          );

        return suggested.some(
          (program) =>
            String(
              program.program_id
            ) ===
            String(selectedProgramId)
        );
      })

      // ----------------------------------------------
      // VULNERABILITY FILTER
      // ----------------------------------------------
      .filter((household) => {
        if (
          !vulnerabilityFilter ||
          vulnerabilityFilter ===
            'All Vulnerability Levels'
        ) {
          return true;
        }

        return (
          String(
            household.vulnerability || ''
          ).toLowerCase() ===
          String(
            vulnerabilityFilter
          ).toLowerCase()
        );
      })

      // ----------------------------------------------
      // REMOVE ALREADY SUBMITTED HOUSEHOLDS
      // ----------------------------------------------
      .filter((household) => {
        const existing =
          getProgramValidation(
            household.household_id,
            selectedProgramId
          );

        const alreadySubmitted =
          existing &&
          ['Pending', 'Approved'].includes(
            String(
              existing.validation_status
            )
          );

        return !alreadySubmitted;
      })

      // ----------------------------------------------
      // PRIORITY SORT
      // ----------------------------------------------
      .sort((a, b) => {
        const order = {
          'Highly Vulnerable': 1,
          'Moderately Vulnerable': 2,
          'Low Vulnerable': 3,
          'Not Vulnerable': 4,
        };

        return (
          (order[a.vulnerability] || 99) -
            (order[b.vulnerability] || 99) ||
          Number(
            a.monthly_income || 0
          ) -
            Number(
              b.monthly_income || 0
            )
        );
      });
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
    if (
      !selectedProgramId ||
      !selectedProgram
    ) {
      toast.error(
        'Please select a suggested program first.'
      );
      return;
    }

    const count = Number(
      generateCount
    );

    if (
      !generateCount ||
      !Number.isInteger(count) ||
      count < 1
    ) {
      toast.error(
        'Please enter a valid number of households to generate.'
      );
      return;
    }

    if (
      eligibleHouseholds.length === 0
    ) {
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

    // The number input still controls how many
    // households are generated.
    const generatedHouseholds =
      eligibleHouseholds.slice(
        0,
        count
      );

    setGenerated({
      program: selectedProgram,
      program_id: selectedProgramId,
      available: generatedHouseholds,
      selected: [],
      total:
        generatedHouseholds.length,
      requestedCount: count,
    });
  };

  // ==================================================
  // ADD HOUSEHOLD
  // ==================================================

  const handleAddToProgram = (
    household
  ) => {
    if (!generated) return;

    if (!household?.household_id) {
      toast.error(
        'Invalid household.'
      );
      return;
    }

    const existingStatus =
      getProgramValidation(
        household.household_id,
        generated.program_id
      );

    if (
      existingStatus?.validation_status ===
      'Pending'
    ) {
      toast.error(
        `${
          household.household_head_name ||
          'This household'
        } is already Pending for ${generated.program}.`
      );
      return;
    }

    if (
      existingStatus?.validation_status ===
      'Approved'
    ) {
      toast.error(
        `${
          household.household_head_name ||
          'This household'
        } is already Approved for ${generated.program}.`
      );
      return;
    }

    setGenerated(
      (previous) => {
        if (!previous) {
          return previous;
        }

        const householdId =
          String(
            household.household_id
          );

        const alreadySelected =
          previous.selected.some(
            (item) =>
              String(
                item.household_id
              ) === householdId
          );

        if (alreadySelected) {
          return previous;
        }

        return {
          ...previous,

          available:
            previous.available.filter(
              (item) =>
                String(
                  item.household_id
                ) !== householdId
            ),

          selected: [
            ...previous.selected,
            household,
          ],
        };
      }
    );
  };

  // ==================================================
  // REMOVE HOUSEHOLD
  // ==================================================

  const handleRemove = (
    household
  ) => {
    if (!generated) return;

    if (!household?.household_id) {
      return;
    }

    setGenerated(
      (previous) => {
        if (!previous) {
          return previous;
        }

        const householdId =
          String(
            household.household_id
          );

        const removedHousehold =
          previous.selected.find(
            (item) =>
              String(
                item.household_id
              ) === householdId
          );

        if (!removedHousehold) {
          return previous;
        }

        const alreadyAvailable =
          previous.available.some(
            (item) =>
              String(
                item.household_id
              ) === householdId
          );

        return {
          ...previous,

          selected:
            previous.selected.filter(
              (item) =>
                String(
                  item.household_id
                ) !== householdId
            ),

          available:
            alreadyAvailable
              ? previous.available
              : [
                  ...previous.available,
                  removedHousehold,
                ],
        };
      }
    );
  };

  // ==================================================
  // ERROR HELPERS
  // ==================================================

  const getErrorStatus = (
    error
  ) => {
    return (
      error?.response?.status ||
      error?.status ||
      null
    );
  };

  const getErrorMessage = (
    error
  ) => {
    return String(
      error?.response?.data?.error ||
        error?.response?.data?.message ||
        error?.message ||
        ''
    ).toLowerCase();
  };

  // ==================================================
  // SAVE SELECTED BENEFICIARIES
  // ==================================================

  const handleSaveBeneficiaries =
    async () => {
      if (
        !generated ||
        !Array.isArray(
          generated.selected
        ) ||
        generated.selected.length === 0
      ) {
        toast.error(
          'Please click Add for at least one household before saving.'
        );
        return;
      }

      if (
        !selectedProgramId ||
        !selectedProgram
      ) {
        toast.error(
          'Please select a program first.'
        );
        return;
      }

      try {
        setSaving(true);

        let saved = 0;
        let skipped = 0;
        let failed = 0;

        for (const household of generated.selected) {
          const householdId =
            household?.household_id;

          if (!householdId) {
            console.error(
              'Missing household_id:',
              household
            );

            failed++;
            continue;
          }

          // --------------------------------------------
          // EXTRA FRONTEND DUPLICATE CHECK
          // --------------------------------------------

          const existing =
            getProgramValidation(
              householdId,
              selectedProgramId
            );

          if (
            existing &&
            ['Pending', 'Approved'].includes(
              existing.validation_status
            )
          ) {
            skipped++;
            continue;
          }

          try {
            await api.post(
              '/validation/beneficiary-validation',
              {
                household_id:
                  householdId,
                program_id:
                  selectedProgramId,
                validation_id:
                  'Pending',
              }
            );

            saved++;
          } catch (e) {
            console.error(
              'Failed to save beneficiary validation:',
              {
                household_id:
                  householdId,
                program_id:
                  selectedProgramId,
                error: e,
              }
            );

            const responseStatus =
              getErrorStatus(e);

            const errorMessage =
              getErrorMessage(e);

            if (
              responseStatus ===
                409 ||
              errorMessage.includes(
                'already'
              ) ||
              errorMessage.includes(
                'duplicate'
              ) ||
              errorMessage.includes(
                'unique constraint'
              )
            ) {
              skipped++;
            } else {
              failed++;
            }
          }
        }

        // --------------------------------------------
        // REFRESH STATUS FROM DATABASE
        // --------------------------------------------

        if (saved > 0) {
          try {
            const statusData =
              await api.get(
                '/validation/beneficiary-validation/statuses'
              );

            const updatedStatuses =
              Array.isArray(
                statusData?.validations
              )
                ? statusData.validations
                : Array.isArray(
                    statusData?.statuses
                  )
                ? statusData.statuses
                : Array.isArray(
                    statusData
                  )
                ? statusData
                : [];

            setBeneficiaryStatuses(
              updatedStatuses
            );
          } catch (refreshError) {
            console.error(
              'Failed to refresh beneficiary statuses:',
              refreshError
            );
          }
        }

        // --------------------------------------------
        // RESULT MESSAGE
        // --------------------------------------------

        let message = '';

        if (saved > 0) {
          message =
            `${saved} household(s) were saved to Beneficiary Validation for ${selectedProgram}. ` +
            `They are now Pending Captain approval.`;
        } else {
          message =
            'No new households were saved to Beneficiary Validation.';
        }

        if (skipped > 0) {
          message +=
            ` ${skipped} household(s) were already submitted for this program.`;
        }

        if (failed > 0) {
          message +=
            ` ${failed} household(s) failed to save.`;
        }

        if (
          failed > 0 &&
          saved === 0
        ) {
          toast.error(message);
        } else if (
          skipped > 0 &&
          saved === 0
        ) {
          toast.error(message);
        } else if (
          saved > 0 &&
          (skipped > 0 ||
            failed > 0)
        ) {
          toast(message, {
            icon: '⚠️',
            duration: 5000,
          });
        } else if (
          saved > 0
        ) {
          toast.success(message);
        } else {
          toast.error(message);
        }

        // --------------------------------------------
        // CLEAR AFTER SUCCESS
        // --------------------------------------------

        if (saved > 0) {
          setGenerated(null);
        }
      } catch (e) {
        console.error(
          'Save beneficiary validation error:',
          e
        );

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
  // ADD ALL
  // ==================================================

  const handleAddAll = () => {
    if (!generated) return;

    setGenerated(
      (previous) => {
        if (!previous) {
          return previous;
        }

        const existingIds =
          new Set(
            previous.selected.map(
              (item) =>
                String(
                  item.household_id
                )
            )
          );

        const newItems =
          previous.available.filter(
            (item) => {
              const householdId =
                String(
                  item.household_id
                );

              const existing =
                getProgramValidation(
                  item.household_id,
                  previous.program_id
                );

              const alreadySubmitted =
                existing &&
                ['Pending', 'Approved'].includes(
                  existing.validation_status
                );

              return (
                !existingIds.has(
                  householdId
                ) &&
                !alreadySubmitted
              );
            }
          );

        return {
          ...previous,

          selected: [
            ...previous.selected,
            ...newItems,
          ],

          available:
            previous.available.filter(
              (item) => {
                const householdId =
                  String(
                    item.household_id
                  );

                const existing =
                  getProgramValidation(
                    item.household_id,
                    previous.program_id
                  );

                const alreadySubmitted =
                  existing &&
                  ['Pending', 'Approved'].includes(
                    existing.validation_status
                  );

                return alreadySubmitted;
              }
            ),
        };
      }
    );
  };

  // ==================================================
  // REMOVE ALL
  // ==================================================

  const handleRemoveAll = () => {
    if (!generated) return;

    setGenerated(
      (previous) => {
        if (!previous) {
          return previous;
        }

        return {
          ...previous,

          available: [
            ...previous.available,
            ...previous.selected,
          ],

          selected: [],
        };
      }
    );
  };

  // ==================================================
  // CLEAR PROGRAM
  // ==================================================

  const clearProgram = () => {
    setSelectedProgramId('');
    setSelectedProgram('');
    setGenerateCount('');
    setGenerated(null);
  };

  // ==================================================
  // CLEAR FILTERS
  // ==================================================

  const clearFilters = () => {
    setQ('');
    setStatus('');
    setPurok('');
  };

  // ==================================================
  // RENDER
  // ==================================================

  return (
    <div className="space-y-6">

      {/* HEADER */}

      <div className="mt-5 ">
        <PageHeader
          title="Assistance Programs"
          subtitle="Socio-economic classification, household results, and recommendation status tracking."
        />
      </div>

      <div className="flex justify-end mb-4">
        <button
          type="button"
          onClick={() =>
            navigate(
              '/calamity-program'
            )
          }
          className="px-5 py-2 text-xl rounded-md bg-[#6E2430] text-white font-semibold hover:opacity-90 transition"
        >
          Add Household Calamity
        </button>
      </div>

      {/* FILTERS */}

      <div className="flex flex-wrap items-center gap-3">

        <Input
          placeholder="Search Household..."
          value={q}
          onChange={(e) =>
            setQ(e.target.value)
          }
          className="max-w-xs"
        />

        <Select
          value={status}
          onChange={(e) =>
            setStatus(e.target.value)
          }
          className="max-w-xs"
        >
          <option value="">
            All Vulnerable
          </option>

          <option value="Highly Vulnerable">
            Highly Vulnerable
          </option>

          <option value="Moderately Vulnerable">
            Moderately Vulnerable
          </option>

          <option value="Low Vulnerable">
            Low Vulnerable
          </option>

          <option value="Not Vulnerable">
            Not Vulnerable
          </option>
        </Select>

        <Select
          value={purok}
          onChange={(e) =>
            setPurok(e.target.value)
          }
        >
          <option value="">
            All Puroks
          </option>

          <option value="1">
            Purok 1
          </option>
          <option value="1-A">
            Purok 1-A
          </option>
          <option value="2">
            Purok 2
          </option>
          <option value="2-A">
            Purok 2-A
          </option>
          <option value="3">
            Purok 3
          </option>
          <option value="3-A">
            Purok 3-A
          </option>
          <option value="4">
            Purok 4
          </option>
          <option value="5">
            Purok 5
          </option>
          <option value="5-A">
            Purok 5-A
          </option>
          <option value="5-B">
            Purok 5-B
          </option>
          <option value="5-C">
            Purok 5-C
          </option>
          <option value="6">
            Purok 6
          </option>
          <option value="6-A">
            Purok 6-A
          </option>
          <option value="7">
            Purok 7
          </option>
          <option value="7-A">
            Purok 7-A
          </option>
          <option value="8">
            Purok 8
          </option>
          <option value="8-A">
            Purok 8-A
          </option>
          <option value="9">
            Purok 9
          </option>
          <option value="9-A">
            Purok 9-A
          </option>
        </Select>

        <Select
          value={selectedProgramId}
          onChange={(e) =>
            handleSelectProgram(
              e.target.value
            )
          }
          disabled={
            programLoading ||
            suggestedPrograms.length === 0
          }
        >
          <option value="">
            {programLoading
              ? 'Loading Programs...'
              : suggestedPrograms.length === 0
              ? 'No Suggested Programs'
              : 'Select Suggested Program'}
          </option>

          {suggestedPrograms.map(
            (program) => (
              <option
                key={
                  program.program_id
                }
                value={
                  program.program_id
                }
              >
                {program.program_name}
              </option>
            )
          )}
        </Select>

        {(q ||
          status ||
          purok) && (
          <button
            type="button"
            onClick={
              clearFilters
            }
            className="px-4 py-2 rounded-lg border border-gray-300 text-gray-600 hover:bg-gray-100 transition"
          >
            Clear Filters
          </button>
        )}
      </div>

      {/* SELECTED PROGRAM */}

      {selectedProgram && (
        <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-5">

          <div className="flex flex-wrap items-center gap-4">

            <div>
              <p className="text-2xl font-extrabold text-[#6E2430]">
                {selectedProgram}
              </p>

              <p className="text-xl text-gray-500">
                {eligibleHouseholds.length}{' '}
                household
                {eligibleHouseholds.length !==
                1
                  ? 's'
                  : ''}{' '}
                available
              </p>
            </div>

            <div className="h-10 w-px bg-gray-300" />

            <div className="flex flex-wrap items-center gap-3">

              <select
                value={
                  vulnerabilityFilter
                }
                onChange={(e) =>
                  setVulnerabilityFilter(
                    e.target.value
                  )
                }
                className="mt-1 block rounded-md font-semibold border border-gray-600 px-3 py-2 text-xl text-black focus:outline-none focus:ring-2 focus:ring-brand"
              >
                <option value="Highly Vulnerable">
                  Highly Vulnerable
                </option>

                <option value="Moderately Vulnerable">
                  Moderately Vulnerable
                </option>

                <option value="All Vulnerability Levels">
                  All Vulnerability Levels
                </option>
              </select>

              <input
                type="number"
                min="1"
                max={
                  eligibleHouseholds.length ||
                  undefined
                }
                placeholder="Number"
                value={generateCount}
                onChange={(e) =>
                  setGenerateCount(
                    e.target.value
                  )
                }
                className="mt-1 block w-32 rounded-md font-semibold border border-gray-600 px-3 py-2 text-xl text-black placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-brand"
              />

              <button
                type="button"
                onClick={
                  handleGenerateProgram
                }
                disabled={
                  eligibleHouseholds.length ===
                  0
                }
                className="mt-1 px-5 py-2 text-xl rounded-md bg-[#6E2430] text-white font-semibold hover:opacity-90 transition disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Generate
              </button>

              <button
                type="button"
                onClick={
                  clearProgram
                }
                className="mt-1 px-5 py-2 text-xl font-semibold rounded-md border border-gray-300 text-gray-600 hover:bg-gray-100 transition"
              >
                Cancel
              </button>

            </div>
          </div>


          <p className="mt-2 text-xl text-gray-500">
            Households already submitted as
            Pending or Approved for this
            program will not appear when you
            generate again.
          </p>

          <p className="mt-2 text-xl text-gray-400">
            The number entered determines how
            many new households will be
            generated.
          </p>

        </div>
      )}

      {/* GENERATED HOUSEHOLDS */}

      {generated && (
        <div className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden">

          {/* HEADER */}

          <div className="px-5 py-4 bg-maroon flex flex-wrap items-center justify-between gap-3">

            <div>
              <p className="text-2xl font-bold text-white">
                {generated.program} —
                Beneficiary Selection
              </p>

              <p className="text-xl text-white/80">
                {generated.selected.length}{' '}
                added /{' '}
                {generated.total}{' '}
                generated
              </p>
            </div>

            <button
              type="button"
              onClick={() =>
                setGenerated(null)
              }
              className="px-4 py-2 rounded-md text-xl border border-white/60 text-white font-semibold hover:bg-white/10"
            >
              Close
            </button>

          </div>

          {/* ACTION BAR */}

          <div className="px-5 py-4 border-b border-gray-200 flex flex-wrap gap-3">

            <button
              type="button"
              onClick={
                handleAddAll
              }
              disabled={
                saving ||
                generated.available
                  .length === 0
              }
              className="px-4 py-2 text-xl rounded-md bg-[#6E2430] text-white font-semibold hover:opacity-90 disabled:opacity-50"
            >
              Add All
            </button>

            <button
              type="button"
              onClick={
                handleRemoveAll
              }
              disabled={
                saving ||
                generated.selected
                  .length === 0
              }
              className="px-4 py-2 text-xl rounded-md border border-gray-700 text-gray-600 font-semibold hover:bg-gray-100 disabled:opacity-50"
            >
              Remove All
            </button>

            <div className="ml-auto flex items-center text-gray-600 font-semibold text-2xl">
              Selected:{' '}
              <span className="ml-1 text-[#6E2430]">
                {
                  generated.selected
                    .length
                }
              </span>
            </div>

          </div>

          {/* AVAILABLE HOUSEHOLDS */}

          <div className="px-5 py-4">

            <div className="mb-3">
              <h3 className="text-2xl font-bold text-[#6E2430]">
                Available Households
              </h3>

            </div>

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
              {generated.available.map(
                (
                  household,
                  index
                ) => (
                  <tr
                    key={
                      household.household_id
                    }
                  >
                    <td className="px-5 py-3 font-medium">
                      {index + 1}
                    </td>

                    <td className="px-5 py-3 font-semibold">
                      {household.household_head_name ||
                        '—'}
                    </td>

                    <td className="px-5 py-3">
                      {household.purok ||
                        '—'}
                    </td>

                    <td className="px-5 py-3">
                      ₱
                      {Number(
                        household.monthly_income ||
                          0
                      ).toLocaleString()}
                    </td>

                    <td className="px-5 py-3">
                      {household.family_number ||
                        0}
                    </td>

                    <td className="px-5 py-3">
                      <span
                        className={`font-extrabold ${
                          String(
                            household.vulnerability ||
                              ''
                          )
                            .toLowerCase()
                            .includes(
                              'highly'
                            )
                            ? 'text-alert'
                            : String(
                                household.vulnerability ||
                                  ''
                              )
                                .toLowerCase()
                                .includes(
                                  'moderately'
                                )
                            ? 'text-amber'
                            : 'text-success'
                        }`}
                      >
                        {household.vulnerability ||
                          '—'}
                      </span>
                    </td>

                    <td className="px-5 py-3">
                      <div className="flex flex-wrap gap-1">
                        {Array.isArray(
                          household.suggested_programs
                        ) &&
                        household
                          .suggested_programs
                          .length > 0
                          ? household.suggested_programs.map(
                              (
                                programName
                              ) => {
                                const isSelected =
                                  String(
                                    programName ||
                                      ''
                                  )
                                    .trim()
                                    .toLowerCase() ===
                                  String(
                                    generated.program ||
                                      ''
                                  )
                                    .trim()
                                    .toLowerCase();

                                return (
                                  <span
                                    key={`${household.household_id}-${programName}`}
                                    className={
                                      isSelected
                                        ? 'px-2 py-1 rounded bg-[#6E2430] text-white font-bold'
                                        : 'px-2 py-1 rounded text-[#6E2430]'
                                    }
                                  >
                                    {
                                      programName
                                    }
                                  </span>
                                );
                              }
                            )
                          : '—'}
                      </div>
                    </td>

                    <td className="px-5 py-3">
                      <span className="text-gray-500 font-semibold">
                        Not Submitted
                      </span>
                    </td>

                    <td className="px-5 py-3">
                      <button
                        type="button"
                        disabled={saving}
                        onClick={() =>
                          handleAddToProgram(
                            household
                          )
                        }
                        className="px-4 py-2 rounded-md bg-[#6E2430] text-white font-semibold hover:opacity-90 disabled:opacity-50"
                      >
                        Add
                      </button>
                    </td>
                  </tr>
                )
              )}

              {!generated.available
                .length && (
                <tr>
                  <td
                    colSpan={9}
                    className="px-5 py-8 text-center text-gray-400"
                  >
                    All eligible households have
                    already been submitted for
                    this program.
                  </td>
                </tr>
              )}
            </Table>
          </div>

          {/* SELECTED BENEFICIARIES */}

          <div className="px-5 py-5 border-t border-gray-200">

            <div className="mb-3">
              <h3 className="text-2xl font-bold text-[#6E2430]">
                Selected Beneficiaries
              </h3>

            </div>

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
              {generated.selected.map(
                (
                  household,
                  index
                ) => (
                  <tr
                    key={
                      household.household_id
                    }
                  >
                    <td className="px-5 py-3 font-medium">
                      {index + 1}
                    </td>

                    <td className="px-5 py-3 font-semibold text-2xl">
                      {household.household_head_name ||
                        '—'}
                    </td>

                    <td className="px-5 py-3 text-2xl">
                      {household.purok ||
                        '—'}
                    </td>

                    <td className="px-5 py-3 text-2xl">
                      ₱
                      {Number(
                        household.monthly_income ||
                          0
                      ).toLocaleString()}
                    </td>

                    <td className="px-5 py-3 text-2xl">
                      {household.family_number ||
                        0}
                    </td>

                    <td className="px-5 py-3 text-2xl">
                      <span className="font-extrabold">
                        {household.vulnerability ||
                          '—'}
                      </span>
                    </td>

                    <td className="px-5 py-3 font-semibold text-[#6E2430] text-2xl">
                      {generated.program}
                    </td>

                    <td className="px-5 py-3 text-2xl">
                      <span className="px-2 py-1 rounded bg-yellow-100 text-yellow-700 font-semibold">
                        Pending
                      </span>
                    </td>

                    <td className="px-5 py-3 text-2xl">
                      <button
                        type="button"
                        disabled={saving}
                        onClick={() =>
                          handleRemove(
                            household
                          )
                        }
                        className="px-4 py-2 rounded-md border border-red-300 text-red-600 font-semibold hover:bg-red-50 disabled:opacity-50"
                      >
                        Remove
                      </button>
                    </td>
                  </tr>
                )
              )}

              {!generated.selected
                .length && (
                <tr>
                  <td
                    colSpan={9}
                    className="px-5 py-8 text-center text-gray-400"
                  >
                    No households added yet.
                    Click Add above.
                  </td>
                </tr>
              )}
            </Table>
          </div>

          {/* SAVE ALL */}

          <div className="flex flex-wrap justify-between items-center px-5 py-5 border-t border-gray-200">

            <div className="text-2xl text-gray-600">
              <strong>
                {
                  generated.selected
                    .length
                }
              </strong>{' '}
              household
              {generated.selected.length !==
              1
                ? 's'
                : ''}{' '}
              ready to save
            </div>

            <button
              type="button"
              disabled={
                saving ||
                generated.selected
                  .length === 0
              }
              onClick={
                handleSaveBeneficiaries
              }
              className="px-6 py-3 rounded-md bg-[#6E2430] text-white text-xl font-semibold hover:opacity-90 transition disabled:opacity-50"
            >
              {saving
                ? 'Saving...'
                : `Save All to Beneficiaries (${generated.selected.length})`}
            </button>

          </div>
        </div>
      )}

      {/* HOUSEHOLD TABLE */}

      {loading ? (
        <Spinner />
      ) : (
        <Band title="Suggested Programs — Households You Encoded">

          <div className="rounded-lg border border-gray-300 overflow-hidden">

            <Table
              head={[
                'Household',
                'Purok',
                'Classification',
                'Suggested Program',
                'Status',
              ]}
            >
              {filtered.map(
                (household) => (
                  <tr
                    key={
                      household.household_id
                    }
                    className="cursor-pointer hover:bg-gray-100"
                    onClick={() =>
                      setDetail(
                        household
                      )
                    }
                  >
                    <td className="px-5 py-4 text-2xl font-medium">
                      {household.household_head_name ||
                        '—'}
                    </td>

                    <td className="px-5 py-4 text-2xl font-medium">
                      {household.purok ||
                        '—'}
                    </td>

                    <td className="px-5 py-4 text-2xl font-medium">
                      <span
                        className={`font-semibold ${
                          household.vulnerability?.includes(
                            'Highly'
                          )
                            ? 'text-alert'
                            : household.vulnerability?.includes(
                                'Moderately'
                              )
                            ? 'text-amber'
                            : 'text-success'
                        }`}
                      >
                        {household.vulnerability?.replace(
                          ' Vulnerable',
                          ''
                        ) || '—'}
                      </span>
                    </td>

                    <td className="px-5 py-4 text-2xl font-medium">
                      {Array.isArray(
                        household.suggested_programs
                      ) &&
                      household
                        .suggested_programs
                        .length > 0 ? (
                        <div className="flex flex-wrap gap-2">
                          {household.suggested_programs.map(
                            (
                              programName
                            ) => (
                              <span
                                key={`${household.household_id}-${programName}`}
                                className="text-[#6E2430] text-xl font-medium"
                              >
                                {
                                  programName
                                }
                              </span>
                            )
                          )}
                        </div>
                      ) : (
                        '—'
                      )}
                    </td>

                    <td className="px-5 py-2 text-2xl font-medium">
                      <Status
                        tone={statusTone(
                          household.validation_status
                        )}
                      >
                        {household.validation_status ||
                          'Pending'}
                      </Status>
                    </td>
                  </tr>
                )
              )}

              {!filtered.length && (
                <tr>
                  <td
                    colSpan={5}
                    className="px-3 py-6 text-center text-gray-400"
                  >
                    No households found.
                  </td>
                </tr>
              )}
            </Table>

          </div>

        </Band>
      )}

      {/* HOUSEHOLD DETAIL */}

      {detail && (
        <div className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden">

          <div className="px-5 py-3 font-extrabold text-white bg-maroon text-lg">
            Household Result Detail —{' '}
            {detail.household_head_name}
          </div>

          <div className="p-6 space-y-3 text-[17px]">

            <div>
              <span className="font-bold text-ink">
                Socio-Economic Classification:{' '}
              </span>

              <span className="text-muted">
                {detail.vulnerability ||
                  '—'}
              </span>
            </div>

            <div>
              <span className="font-bold text-ink">
                Basis:{' '}
              </span>

              <span className="text-muted">
                Income ₱
                {Number(
                  detail.monthly_income ||
                    0
                ).toLocaleString()}
                /month,{' '}
                {detail.family_number ||
                  0}{' '}
                dependents
                {detail.occupation &&
                detail.occupation !==
                  'None'
                  ? `, ${detail.occupation}`
                  : ', no stable employment'}
              </span>
            </div>

            <div>
              <span className="font-bold text-ink">
                Suggested Programs:{' '}
              </span>

              <span className="text-muted">
                {Array.isArray(
                  detail.suggested_programs
                )
                  ? detail.suggested_programs.join(
                      ', '
                    ) || 'None'
                  : 'None'}
              </span>
            </div>

            <div>
              <span className="font-bold text-ink">
                Current Status:{' '}
              </span>

              <span className="text-muted">
                {detail.validation_status ||
                  'Pending'}
              </span>
            </div>

            <div>
              <span className="font-bold text-ink">
                Encoded By:{' '}
              </span>

              <span className="text-muted">
                {detail.encoded_by ||
                  '—'}
              </span>
            </div>

          </div>
        </div>
      )}

    </div>
  );
}
