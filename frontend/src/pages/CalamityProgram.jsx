import { useState, useEffect, useMemo } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

import { api } from '../lib/api';
import {
  PageHeader,
  Input,
  Select,
  Button,
} from '../components/ui';

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

  const [selectedHousehold, setSelectedHousehold] =
    useState(passedHousehold);

  const [purok, setPurok] = useState(
    passedHousehold?.purok || ''
  );

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

        const res = await api.get(
          '/programs?type=Calamity'
        );

        const loadedPrograms = Array.isArray(res?.programs)
          ? res.programs
          : Array.isArray(res)
          ? res
          : [];

        setPrograms(loadedPrograms);
      } catch (err) {
        console.error(
          'Failed to load assistance programs:',
          err
        );

        setError(
          'Failed to load assistance programs.'
        );
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
    const search = householdSearch
      .trim()
      .toLowerCase();

    return households
      .filter((household) => {
        // Purok filter
        if (
          purok &&
          String(household.purok || '') !== String(purok)
        ) {
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
        String(
          a.household_head_name || ''
        ).localeCompare(
          String(b.household_head_name || '')
        )
      );
  }, [households, purok, householdSearch]);

  // --------------------------------------------------
  // SELECT HOUSEHOLD
  // --------------------------------------------------
  const handleSelectHousehold = (household) => {
    setSelectedHousehold(household);

    setPurok(
      household.purok
        ? String(household.purok)
        : ''
    );

    setHouseholdSearch(
      household.household_head_name || ''
    );

    // Reset program and damage assessment
    // when selecting another household.
    setProgram('');

    setHouseType(
      household.house_type || 'Light Materials'
    );

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
      setError(
        'Please select a household first.'
      );
      return;
    }

    if (!program) {
      setError(
        'Please select a calamity assistance program.'
      );
      return;
    }

    if (!selectedHousehold.household_id) {
      setError(
        'The selected household does not have a valid household ID.'
      );
      return;
    }

    setSaving(true);

    try {
      const data = {
        household_id:
          selectedHousehold.household_id,

        program_id: program,

        house_type: houseType,

        roof_damage: roofDamage,

        wall_damage: wallDamage,

        flooding_level: floodingLevel,

        damage_risk: damageRisk,

        risk_level: getRiskLabel(),
      };

      console.log(
        'Saving calamity program:',
        data
      );

      await api.post(
        '/programs/calamity-programs',
        data
      );

      navigate('/suggestions', {
        state: {
          success:
            'Household added to calamity assistance and sent for Captain approval.',
        },
      });
    } catch (err) {
      console.error(
        'Failed to save calamity program:',
        err
      );

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

      {/* FORM CARD */}
      <div className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden">

        {/* CARD HEADER */}
        <div className="px-5 py-3 bg-[#6E2430] text-white text-xl font-semibold">
          Add Household to Calamity Program
        </div>

        <div className="p-6">

          {/* ERROR */}
          {error && (
            <div className="mb-5 rounded-md bg-red-100 border border-red-300 text-red-800 px-4 py-3 font-semibold">
              {error}
            </div>
          )}

          {/* --------------------------------------------------
              FIND HOUSEHOLD
          -------------------------------------------------- */}
          {!selectedHousehold && (
            <div className="mb-6 bg-gray-50 border border-gray-200 rounded-lg p-5">

              <h3 className="font-extrabold text-lg mb-4">
                Select Household
              </h3>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

                {/* PUROK */}
                <div>
                  <Select
                    label="Select Purok"
                    value={purok}
                    onChange={(e) =>
                      setPurok(e.target.value)
                    }
                    className="w-full"
                  >
                    <option value="">
                      -- All Puroks --
                    </option>

                    <option value="1">
                      Purok 1
                    </option>

                    <option value="2">
                      Purok 2
                    </option>

                    <option value="3">
                      Purok 3
                    </option>

                    <option value="4">
                      Purok 4
                    </option>

                    <option value="5">
                      Purok 5
                    </option>

                    <option value="6">
                      Purok 6
                    </option>

                    <option value="7">
                      Purok 7
                    </option>
                  </Select>
                </div>

                {/* HOUSEHOLD SEARCH */}
                <div>
                  <Input
                    label="Household Name"
                    value={householdSearch}
                    onChange={(e) =>
                      setHouseholdSearch(
                        e.target.value
                      )
                    }
                    placeholder="Type household name..."
                    className="w-full"
                  />
                </div>

              </div>

              {/* MATCHING HOUSEHOLDS */}
              <div className="mt-5">

                <div className="flex justify-between items-center mb-3">
                  <h4 className="font-bold text-lg">
                    Available Households
                  </h4>

                  {!loadingHouseholds && (
                    <span className="text-gray-600 font-semibold">
                      {filteredHouseholds.length}{' '}
                      household
                      {filteredHouseholds.length !== 1
                        ? 's'
                        : ''}
                    </span>
                  )}
                </div>

                {loadingHouseholds ? (
                  <div className="py-8 text-center text-gray-500 font-semibold">
                    Loading households...
                  </div>
                ) : filteredHouseholds.length === 0 ? (
                  <div className="py-8 text-center border border-dashed border-gray-300 rounded-lg text-gray-500 font-semibold">
                    No households found.

                    <div className="text-sm mt-1 font-normal">
                      Try another Purok or household name.
                    </div>
                  </div>
                ) : (
                  <div className="max-h-[400px] overflow-y-auto border border-gray-200 rounded-lg">

                    <table className="w-full text-left">

                      <thead className="sticky top-0 z-10 bg-[#FFD7D7]">
                        <tr>
                          <th className="px-4 py-3 font-extrabold">
                            Household
                          </th>

                          <th className="px-4 py-3 font-extrabold">
                            Purok
                          </th>

                          <th className="px-4 py-3 font-extrabold">
                            Address
                          </th>

                          <th className="px-4 py-3 text-center font-extrabold">
                            Action
                          </th>
                        </tr>
                      </thead>

                      <tbody>

                        {filteredHouseholds.map(
                          (item) => (
                            <tr
                              key={
                                item.household_id
                              }
                              className="border-t border-gray-200 hover:bg-gray-50"
                            >

                              <td className="px-4 py-3 font-semibold">
                                {item.household_head_name ||
                                  'Unnamed Household'}
                              </td>

                              <td className="px-4 py-3">
                                Purok{' '}
                                {item.purok || '-'}
                              </td>

                              <td className="px-4 py-3">
                                {item.address ||
                                  '-'}
                              </td>

                              <td className="px-4 py-3 text-center">

                                <button
                                  type="button"
                                  onClick={() =>
                                    handleSelectHousehold(
                                      item
                                    )
                                  }
                                  className="px-4 py-2 rounded-md bg-[#6E2430] text-white font-bold hover:opacity-90 transition"
                                >
                                  Select
                                </button>

                              </td>

                            </tr>
                          )
                        )}

                      </tbody>

                    </table>

                  </div>
                )}

              </div>

            </div>
          )}

          {/* --------------------------------------------------
              SELECTED HOUSEHOLD
          -------------------------------------------------- */}
          {selectedHousehold && (
            <div className="mb-6 bg-gray-50 border border-gray-200 rounded-lg p-4">

              <div className="flex flex-col md:flex-row md:justify-between md:items-center gap-3 mb-3">

                <h3 className="font-extrabold text-lg">
                  Selected Household
                </h3>

                <button
                  type="button"
                  onClick={handleChangeHousehold}
                  disabled={saving}
                  className="px-4 py-2 rounded-md bg-gray-300 text-gray-800 font-bold hover:bg-gray-400 transition disabled:opacity-50"
                >
                  Change Household
                </button>

              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

                {/* HOUSEHOLD NAME */}
                <div>
                  <label className="block font-bold mb-1">
                    Household Name
                  </label>

                  <Input
                    value={
                      selectedHousehold.household_head_name ||
                      ''
                    }
                    readOnly
                    className="w-full"
                  />
                </div>

                {/* PUROK */}
                <div>
                  <label className="block font-bold mb-1">
                    Purok
                  </label>

                  <Input
                    value={
                      selectedHousehold.purok
                        ? `Purok ${selectedHousehold.purok}`
                        : ''
                    }
                    readOnly
                    className="w-full"
                  />
                </div>

                {/* ADDRESS */}
                <div className="md:col-span-2">
                  <label className="block font-bold mb-1">
                    Address
                  </label>

                  <Input
                    value={
                      selectedHousehold.address ||
                      ''
                    }
                    readOnly
                    className="w-full"
                  />
                </div>

              </div>

            </div>
          )}

          {/* --------------------------------------------------
              ASSISTANCE PROGRAM
          -------------------------------------------------- */}
          {selectedHousehold && (
            <div className="mb-6">

              <h3 className="font-extrabold text-lg mb-4">
                Calamity Assistance Program
              </h3>

              <Select
                label="Select program"
                value={program}
                onChange={(e) =>
                  setProgram(e.target.value)
                }
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
                    <option
                      key={item.program_id}
                      value={item.program_id}
                    >
                      {item.program_name}
                    </option>
                  ))}

              </Select>

            </div>
          )}

          {/* --------------------------------------------------
              HOUSE TYPE
          -------------------------------------------------- */}
          {selectedHousehold && (
            <div className="mb-6">

              <label className="block font-bold mb-1">
                House Type
              </label>

              <Select
                value={houseType}
                onChange={(e) =>
                  setHouseType(
                    e.target.value
                  )
                }
                className="w-full"
              >

                <option value="Light Materials">
                  Light Materials
                </option>

                <option value="Mixed Materials">
                  Mixed Materials
                </option>

                <option value="Concrete">
                  Concrete
                </option>

              </Select>

            </div>
          )}

          {/* --------------------------------------------------
              DAMAGE ASSESSMENT
          -------------------------------------------------- */}
          {selectedHousehold && (
            <div className="mt-5">

              <h3 className="font-extrabold text-lg mb-4">
                Damage Assessment
              </h3>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-x-5 gap-y-4">

                {/* ROOF */}
                <div>

                  <label className="block font-bold mb-1">
                    Roof Damage
                  </label>

                  <Select
                    value={roofDamage}
                    onChange={(e) =>
                      setRoofDamage(
                        e.target.value
                      )
                    }
                    className="w-full"
                  >

                    <option value="None">
                      None
                    </option>

                    <option value="Minor">
                      Minor
                    </option>

                    <option value="Moderate">
                      Moderate
                    </option>

                    <option value="Severe">
                      Severe
                    </option>

                  </Select>

                </div>

                {/* WALL */}
                <div>

                  <label className="block font-bold mb-1">
                    Wall Damage
                  </label>

                  <Select
                    value={wallDamage}
                    onChange={(e) =>
                      setWallDamage(
                        e.target.value
                      )
                    }
                    className="w-full"
                  >

                    <option value="None">
                      None
                    </option>

                    <option value="Minor">
                      Minor
                    </option>

                    <option value="Moderate">
                      Moderate
                    </option>

                    <option value="Severe">
                      Severe
                    </option>

                  </Select>

                </div>

                {/* FLOODING */}
                <div>

                  <label className="block font-bold mb-1">
                    Flooding Level
                  </label>

                  <Select
                    value={floodingLevel}
                    onChange={(e) =>
                      setFloodingLevel(
                        e.target.value
                      )
                    }
                    className="w-full"
                  >

                    <option value="None">
                      None
                    </option>

                    <option value="Low">
                      Low
                    </option>

                    <option value="Moderate">
                      Moderate
                    </option>

                    <option value="High">
                      High
                    </option>

                  </Select>

                </div>

              </div>

            </div>
          )}

          {/* --------------------------------------------------
              RISK
          -------------------------------------------------- */}
          {selectedHousehold && (
            <div className="mt-7">

              <div className="flex justify-between items-center mb-2">

                <span className="font-bold text-lg">
                  Computed Damage Risk
                </span>

                <span className="font-extrabold text-lg">
                  {damageRisk}%
                </span>

              </div>

              <div className="w-full h-3 bg-gray-200 rounded-full overflow-hidden">

                <div
                  className="h-full bg-yellow-600 rounded-full transition-all duration-300"
                  style={{
                    width: `${damageRisk}%`,
                  }}
                />

              </div>

              <div className="mt-3">

                <span
                  className={`inline-block px-4 py-1 rounded-full font-medium ${
                    damageRisk >= 70
                      ? 'bg-red-200 text-red-800'
                      : damageRisk >= 40
                      ? 'bg-yellow-200 text-gray-800'
                      : 'bg-green-200 text-green-800'
                  }`}
                >
                  {getRiskLabel()}
                </span>

              </div>

            </div>
          )}

          {/* --------------------------------------------------
              APPROVAL NOTICE
          -------------------------------------------------- */}
          {selectedHousehold && (
            <div className="mt-7 rounded-lg border border-yellow-300 bg-yellow-50 p-4">

              <div className="font-bold text-yellow-900">
                Approval Required
              </div>

              <p className="text-sm text-yellow-800 mt-1">
                After saving, this household will have
                a <strong>Pending</strong> status. The
                Barangay Captain must review and approve
                the calamity assistance request before it
                becomes an approved beneficiary.
              </p>

            </div>
          )}

          {/* --------------------------------------------------
              BUTTONS
          -------------------------------------------------- */}
          <div className="flex justify-end gap-4 mt-8">

            <button
              type="button"
              onClick={() =>
                navigate('/suggestions')
              }
              disabled={saving}
              className="px-6 py-2 rounded-md bg-gray-300 text-gray-800 font-bold hover:bg-gray-400 transition disabled:opacity-50"
            >
              Cancel
            </button>

            {selectedHousehold && (
              <button
                type="button"
                onClick={handleSave}
                disabled={
                  saving ||
                  !selectedHousehold ||
                  !program
                }
                className="px-6 py-2 rounded-md bg-[#6E2430] text-white font-bold hover:opacity-90 transition disabled:opacity-50"
              >
                {saving
                  ? 'Saving...'
                  : 'Submit for Captain Approval'}
              </button>
            )}

          </div>

        </div>

      </div>

    </div>
  );
}
