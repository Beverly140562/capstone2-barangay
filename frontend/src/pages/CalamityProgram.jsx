import { useState, useEffect, useMemo } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

import { api } from '../lib/api';
import { PageHeader, Input, Select } from '../components/ui';

const PUROKS = [
  '1', '1-A', '2', '2-A', '3', '3-A', '4', '5', '5-A', '5-B', '5-C',
  '6', '6-A', '7', '7-A', '8', '8-A', '9', '9-A',
];

/* ==========================================================================
   PRESENTATION HELPERS
========================================================================== */

function initialsOf(name) {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  const letters = parts.slice(0, 2).map((p) => p[0]).join('').toUpperCase();
  return letters || '?';
}

function Avatar({ name, large = false }) {
  return (
    <span
      className={`flex shrink-0 items-center justify-center rounded-full bg-[#F8E9EB] font-bold text-[#6E2430] ${
        large ? 'h-14 w-14 text-xl' : 'h-10 w-10 text-base'
      }`}
    >
      {initialsOf(name)}
    </span>
  );
}

function Card({ title, subtitle, children }) {
  return (
    <section className="rounded-2xl border border-[#EBD3D3] bg-white p-6 shadow-sm">
      <div className="mb-5">
        <h3 className="text-2xl font-bold text-[#6E2430]">{title}</h3>
        {subtitle && <p className="mt-1 text-base text-gray-500">{subtitle}</p>}
      </div>
      {children}
    </section>
  );
}

function Stepper({ step }) {
  const steps = ['Choose household', 'Assessment & program'];

  return (
    <ol className="flex flex-wrap items-center gap-3">
      {steps.map((label, index) => {
        const number = index + 1;
        const done = step > number;
        const active = step === number;

        return (
          <li key={label} className="flex items-center gap-3">
            <span
              className={`flex h-9 w-9 items-center justify-center rounded-full text-base font-bold ${
                done || active
                  ? 'bg-[#6E2430] text-white'
                  : 'bg-gray-200 text-gray-500'
              }`}
            >
              {done ? '✓' : number}
            </span>
            <span
              className={`text-xl font-semibold ${
                active || done ? 'text-gray-900' : 'text-gray-400'
              }`}
            >
              {label}
            </span>
            {index < steps.length - 1 && (
              <span className="mx-1 hidden h-px w-10 bg-gray-300 sm:block" />
            )}
          </li>
        );
      })}
    </ol>
  );
}

// Button group used instead of a dropdown for short option lists.
function OptionGroup({ label, value, options, onChange, disabled }) {
  return (
    <div>
      <p className="mb-2 text-xl font-semibold text-gray-800">{label}</p>

      <div
        role="radiogroup"
        aria-label={label}
        className="grid grid-cols-2 gap-2 sm:grid-cols-4"
      >
        {options.map((option) => {
          const active = value === option;

          return (
            <button
              key={option}
              type="button"
              role="radio"
              aria-checked={active}
              disabled={disabled}
              onClick={() => onChange(option)}
              className={`rounded-xl border px-3 py-2.5 text-lg font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#6E2430] disabled:opacity-50 ${
                active
                  ? 'border-[#6E2430] bg-[#6E2430] text-white shadow-sm'
                  : 'border-gray-300 bg-white text-gray-700 hover:border-[#6E2430]/50 hover:bg-[#FBF6F6]'
              }`}
            >
              {option}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default function CalamityProgram() {
  const navigate = useNavigate();
  const location = useLocation();

  // --------------------------------------------------
  // HOUSEHOLD FROM SUGGESTIONS PAGE
  // --------------------------------------------------
  const passedHousehold = location.state?.household || null;

  // --------------------------------------------------
  // STATE
  // --------------------------------------------------
  const [households, setHouseholds] = useState([]);
  const [loadingHouseholds, setLoadingHouseholds] = useState(true);

  const [programs, setPrograms] = useState([]);
  const [loadingPrograms, setLoadingPrograms] = useState(true);

  const [selectedHousehold, setSelectedHousehold] = useState(passedHousehold);

  const [purok, setPurok] = useState(passedHousehold?.purok || '');

  const [householdSearch, setHouseholdSearch] = useState(
    passedHousehold?.household_head_name || ''
  );

  const [program, setProgram] = useState('');

  const [houseType, setHouseType] = useState(
    passedHousehold?.house_type || 'Light Materials'
  );

  const [roofDamage, setRoofDamage] = useState('None');
  const [wallDamage, setWallDamage] = useState('None');
  const [floodingLevel, setFloodingLevel] = useState('None');

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // --------------------------------------------------
  // LOAD HOUSEHOLDS
  // --------------------------------------------------
  useEffect(() => {
    const loadHouseholds = async () => {
      try {
        setLoadingHouseholds(true);
        setError('');

        const res = await api.get('/households');

        const loadedHouseholds = Array.isArray(res?.households)
          ? res.households
          : Array.isArray(res)
          ? res
          : [];

        setHouseholds(loadedHouseholds);
      } catch (err) {
        console.error('Failed to load households:', err);

        setError(
          err?.response?.data?.message ||
            err?.response?.data?.error ||
            err?.message ||
            'Failed to load households.'
        );
      } finally {
        setLoadingHouseholds(false);
      }
    };

    loadHouseholds();
  }, []);

  // --------------------------------------------------
  // LOAD CALAMITY ASSISTANCE PROGRAMS
  // --------------------------------------------------
  useEffect(() => {
    const loadPrograms = async () => {
      try {
        setLoadingPrograms(true);

        const res = await api.get('/programs?type=Calamity');

        const loadedPrograms = Array.isArray(res?.programs)
          ? res.programs
          : Array.isArray(res)
          ? res
          : [];

        setPrograms(loadedPrograms);
      } catch (err) {
        console.error('Failed to load assistance programs:', err);

        setError('Failed to load assistance programs.');
      } finally {
        setLoadingPrograms(false);
      }
    };

    loadPrograms();
  }, []);

  // --------------------------------------------------
  // FILTER HOUSEHOLDS
  // --------------------------------------------------
  const filteredHouseholds = useMemo(() => {
    const search = householdSearch.trim().toLowerCase();

    return households
      .filter((household) => {
        // Purok filter
        if (purok && String(household.purok || '') !== String(purok)) {
          return false;
        }

        // Household name search
        if (!search) {
          return true;
        }

        const householdName = String(
          household.household_head_name || ''
        ).toLowerCase();

        return householdName.includes(search);
      })
      .sort((a, b) =>
        String(a.household_head_name || '').localeCompare(
          String(b.household_head_name || '')
        )
      );
  }, [households, purok, householdSearch]);

  // --------------------------------------------------
  // SELECT HOUSEHOLD
  // --------------------------------------------------
  const handleSelectHousehold = (household) => {
    setSelectedHousehold(household);

    setPurok(household.purok ? String(household.purok) : '');

    setHouseholdSearch(household.household_head_name || '');

    // Reset program and damage assessment
    // when selecting another household.
    setProgram('');

    setHouseType(household.house_type || 'Light Materials');

    setRoofDamage('None');
    setWallDamage('None');
    setFloodingLevel('None');

    setError('');

    window.scrollTo({
      top: 0,
      behavior: 'smooth',
    });
  };

  // --------------------------------------------------
  // CLEAR SELECTED HOUSEHOLD
  // --------------------------------------------------
  const handleChangeHousehold = () => {
    setSelectedHousehold(null);
    setProgram('');
    setError('');
  };

  // --------------------------------------------------
  // COMPUTE DAMAGE RISK
  // --------------------------------------------------
  const calculateRisk = () => {
    let risk = 0;

    // Roof damage
    if (roofDamage === 'Minor') risk += 15;
    if (roofDamage === 'Moderate') risk += 25;
    if (roofDamage === 'Severe') risk += 35;

    // Wall damage
    if (wallDamage === 'Minor') risk += 15;
    if (wallDamage === 'Moderate') risk += 25;
    if (wallDamage === 'Severe') risk += 35;

    // Flooding
    if (floodingLevel === 'Low') risk += 10;
    if (floodingLevel === 'Moderate') risk += 20;
    if (floodingLevel === 'High') risk += 30;

    // House type
    if (houseType === 'Light Materials') risk += 7;
    if (houseType === 'Mixed Materials') risk += 4;

    return Math.min(risk, 100);
  };

  const damageRisk = calculateRisk();

  // --------------------------------------------------
  // RISK LABEL
  // --------------------------------------------------
  const getRiskLabel = () => {
    if (damageRisk >= 70) {
      return 'High Risk';
    }

    if (damageRisk >= 40) {
      return 'Medium Risk';
    }

    return 'Low Risk';
  };

  // --------------------------------------------------
  // SAVE CALAMITY PROGRAM
  // --------------------------------------------------
  const handleSave = async () => {
    setError('');

    if (!selectedHousehold) {
      setError('Please select a household first.');
      return;
    }

    if (!program) {
      setError('Please select a calamity assistance program.');
      return;
    }

    if (!selectedHousehold.household_id) {
      setError('The selected household does not have a valid household ID.');
      return;
    }

    setSaving(true);

    try {
      const data = {
        household_id: selectedHousehold.household_id,
        program_id: program,
        house_type: houseType,
        roof_damage: roofDamage,
        wall_damage: wallDamage,
        flooding_level: floodingLevel,
        damage_risk: damageRisk,
        risk_level: getRiskLabel(),
      };

      console.log('Saving calamity program:', data);

      await api.post('/programs/calamity-programs', data);

      navigate('/suggestions', {
        state: {
          success:
            'Household added to calamity assistance and sent for Captain approval.',
        },
      });
    } catch (err) {
      console.error('Failed to save calamity program:', err);

      setError(
        err?.response?.data?.message ||
          err?.response?.data?.error ||
          err?.message ||
          'Failed to save calamity program.'
      );
    } finally {
      setSaving(false);
    }
  };

  // --------------------------------------------------
  // RISK STYLING
  // --------------------------------------------------
  const riskStyle =
    damageRisk >= 70
      ? { bar: 'bg-red-500', pill: 'bg-red-50 text-red-700 ring-red-200' }
      : damageRisk >= 40
      ? { bar: 'bg-amber-500', pill: 'bg-amber-50 text-amber-700 ring-amber-200' }
      : { bar: 'bg-green-500', pill: 'bg-green-50 text-green-700 ring-green-200' };

  const selectedProgramName =
    programs.find((item) => String(item.program_id) === String(program))
      ?.program_name || '';

  // --------------------------------------------------
  // RENDER
  // --------------------------------------------------
  return (
    <div className="space-y-6">
      {/* HEADER */}
      <div className="mt-5">
        <PageHeader
          title="Add Household to Calamity Program"
          subtitle="Select an existing household, choose a calamity assistance program, and record the household damage assessment."
        />
      </div>

      <Stepper step={selectedHousehold ? 2 : 1} />

      {/* ERROR */}
      {error && (
        <div
          role="alert"
          className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-lg font-semibold text-red-800"
        >
          {error}
        </div>
      )}

      {/* --------------------------------------------------
          STEP 1: FIND HOUSEHOLD
      -------------------------------------------------- */}
      {!selectedHousehold && (
        <Card
          title="Select Household"
        >
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <Select
              label="Select Purok"
              value={purok}
              onChange={(e) => setPurok(e.target.value)}
              className="w-full"
            >
              <option value="">-- All Puroks --</option>
              {PUROKS.map((p) => (
                <option key={p} value={p}>
                  Purok {p}
                </option>
              ))}
            </Select>

            <Input
              label="Household Name"
              value={householdSearch}
              onChange={(e) => setHouseholdSearch(e.target.value)}
              placeholder="Type household name..."
              className="w-full"
            />
          </div>

          <div className="mb-3 mt-6 flex items-center justify-between">
            <h4 className="text-xl font-bold text-gray-900">
              Available Households
            </h4>

            {!loadingHouseholds && (
              <span className="rounded-full bg-[#F8E9EB] px-3 py-1 text-xl font-bold text-[#6E2430]">
                {filteredHouseholds.length} household
                {filteredHouseholds.length !== 1 ? 's' : ''}
              </span>
            )}
          </div>

          {loadingHouseholds ? (
            <div className="py-10 text-center text-lg font-semibold text-gray-500">
              Loading households...
            </div>
          ) : filteredHouseholds.length === 0 ? (
            <div className="rounded-xl border border-dashed border-gray-300 py-10 text-center">
              <p className="text-lg font-semibold text-gray-500">
                No households found.
              </p>
              <p className="mt-1 text-base text-gray-400">
                Try another Purok or household name.
              </p>
            </div>
          ) : (
            <div className="max-h-[440px] overflow-y-auto rounded-xl border border-[#EBD3D3] scrollbar-hide">
              <table className="w-full text-left">
                <thead className="sticky top-0 z-10 bg-[#FFD7D7] text-lg">
                  <tr>
                    <th className="px-4 py-3 font-bold text-2xl text-[#6E2430]">
                      Household
                    </th>
                    <th className="px-4 py-3 font-bold text-2xl text-[#6E2430]">Purok</th>
                    <th className="px-4 py-3 font-bold text-2xl text-[#6E2430]">
                      Address
                    </th>
                    <th className="px-4 py-3 text-center font-bold text-2xl text-[#6E2430]">
                      Action
                    </th>
                  </tr>
                </thead>

                <tbody>
                  {filteredHouseholds.map((item) => (
                    <tr
                      key={item.household_id}
                      onClick={() => handleSelectHousehold(item)}
                      className="cursor-pointer border-t border-gray-100 transition hover:bg-[#FBF6F6]"
                    >
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <Avatar name={item.household_head_name} />
                          <span className="text-2xl font-semibold text-gray-900">
                            {item.household_head_name || 'Unnamed Household'}
                          </span>
                        </div>
                      </td>

                      <td className="px-4 py-3 text-2xl">
                        <span className="rounded-lg bg-gray-100 px-2.5 py-1 font-medium text-gray-700">
                          Purok {item.purok || '-'}
                        </span>
                      </td>

                      <td className="px-4 py-3 text-2xl text-gray-600">
                        {item.address || '-'}
                      </td>

                      <td className="px-4 py-3 text-center">
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            handleSelectHousehold(item);
                          }}
                          className="rounded-xl bg-gradient-to-r from-[#7A2837] to-[#5A1C28] px-4 py-2 text-lg font-semibold text-white shadow-sm transition hover:brightness-110"
                        >
                          Select
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}

      {/* --------------------------------------------------
          STEP 2: ASSESSMENT
      -------------------------------------------------- */}
      {selectedHousehold && (
        <div className="grid items-start gap-6 xl:grid-cols-[1fr_380px]">
          {/* LEFT: FORM */}
          <div className="space-y-6">
            {/* Selected household */}
            <section className="flex flex-wrap items-center gap-4 rounded-2xl border border-[#6E2430]/25 bg-gradient-to-r from-[#FBF6F6] to-white p-5 shadow-sm">
              <Avatar name={selectedHousehold.household_head_name} large />

              <div className="min-w-0 flex-1">
                
                <p className="truncate text-2xl font-extrabold text-[#6E2430]">
                  {selectedHousehold.household_head_name || 'Unnamed Household'}
                </p>
                <p className="text-lg text-gray-600">
                  {selectedHousehold.address || 'No address recorded'}
                  {selectedHousehold.purok
                    ? ` · Purok ${selectedHousehold.purok}`
                    : ''}
                </p>
              </div>

              <button
                type="button"
                onClick={handleChangeHousehold}
                disabled={saving}
                className="rounded-xl border border-gray-300 bg-white px-4 py-2 text-lg font-semibold text-gray-700 transition hover:bg-gray-50 disabled:opacity-50"
              >
                Change household
              </button>
            </section>

            {/* Program */}
            <Card
              title="Calamity Assistance Program"
            >
              <Select
                label="Select program"
                value={program}
                onChange={(e) => setProgram(e.target.value)}
                className="w-full"
                disabled={loadingPrograms}
              >
                <option value="">
                  {loadingPrograms
                    ? 'Loading programs...'
                    : '-- Select Assistance Program --'}
                </option>

                {!loadingPrograms &&
                  programs.map((item) => (
                    <option key={item.program_id} value={item.program_id}>
                      {item.program_name}
                    </option>
                  ))}
              </Select>
            </Card>

            {/* Damage assessment */}
            <Card
              title="Damage Assessment"
            >
              <div className="space-y-6">
                <OptionGroup
                  label="House type"
                  value={houseType}
                  options={['Light Materials', 'Mixed Materials', 'Concrete']}
                  onChange={setHouseType}
                  disabled={saving}
                />

                <OptionGroup
                  label="Roof damage"
                  value={roofDamage}
                  options={['None', 'Minor', 'Moderate', 'Severe']}
                  onChange={setRoofDamage}
                  disabled={saving}
                />

                <OptionGroup
                  label="Wall damage"
                  value={wallDamage}
                  options={['None', 'Minor', 'Moderate', 'Severe']}
                  onChange={setWallDamage}
                  disabled={saving}
                />

                <OptionGroup
                  label="Flooding level"
                  value={floodingLevel}
                  options={['None', 'Low', 'Moderate', 'High']}
                  onChange={setFloodingLevel}
                  disabled={saving}
                />
              </div>
            </Card>
          </div>

          {/* RIGHT: SUMMARY (sticky on wide screens) */}
          <aside className="space-y-5 xl:sticky xl:top-4">
            <section className="rounded-2xl border border-[#EBD3D3] bg-white p-6 shadow-md">
              <p className="text-xl font-semibold text-gray-500">
                Computed damage risk
              </p>

              <div className="mt-1 flex items-end justify-between">
                <span className="text-5xl font-extrabold text-[#6E2430]">
                  {damageRisk}%
                </span>

                <span
                  className={`rounded-full px-4 py-1 text-lg font-semibold ring-1 ${riskStyle.pill}`}
                >
                  {getRiskLabel()}
                </span>
              </div>

              <div className="mt-4 h-3 overflow-hidden rounded-full bg-gray-200">
                <div
                  className={`h-full rounded-full transition-all duration-300 ${riskStyle.bar}`}
                  style={{ width: `${damageRisk}%` }}
                />
              </div>

              <dl className="mt-5 space-y-2 border-t border-gray-100 pt-4 text-xl">
                <div className="flex justify-between gap-3">
                  <dt className="text-gray-500">Program</dt>
                  <dd className="text-right font-semibold text-gray-900">
                    {selectedProgramName || '—'}
                  </dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-gray-500">House type</dt>
                  <dd className="font-semibold text-gray-900">{houseType}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-gray-500">Roof / Wall</dt>
                  <dd className="font-semibold text-gray-900">
                    {roofDamage} / {wallDamage}
                  </dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-gray-500">Flooding</dt>
                  <dd className="font-semibold text-gray-900">
                    {floodingLevel}
                  </dd>
                </div>
              </dl>
            </section>

            

            <div className="flex flex-col gap-3">
              <button
                type="button"
                onClick={handleSave}
                disabled={saving || !selectedHousehold || !program}
                className="rounded-xl bg-gradient-to-r from-[#7A2837] to-[#5A1C28] px-6 py-3.5 text-xl font-bold text-white shadow-md shadow-[#6E2430]/25 transition hover:brightness-110 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#6E2430]/30 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {saving ? 'Saving...' : 'Submit for Captain Approval'}
              </button>

              {!program && (
                <p className="text-center text-sm text-gray-500">
                  Choose a calamity assistance program to enable submit.
                </p>
              )}

              <button
                type="button"
                onClick={() => navigate('/suggestions')}
                disabled={saving}
                className="rounded-xl border border-gray-300 bg-white px-6 py-3 text-lg font-semibold text-gray-700 transition hover:bg-gray-50 disabled:opacity-50"
              >
                Cancel
              </button>
            </div>
          </aside>
        </div>
      )}

      {/* Cancel while still choosing a household */}
      {!selectedHousehold && (
        <div className="flex justify-end">
          <button
            type="button"
            onClick={() => navigate('/suggestions')}
            className="rounded-xl border border-gray-300 bg-white px-6 py-3 text-2xl font-semibold text-gray-700 transition hover:bg-gray-50"
          >
            Cancel
          </button>
        </div>
      )}
    </div>
  );
}