import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import toast from 'react-hot-toast';

import {
  PageHeader,
  Band,
  Input,
  Button,
} from '../components/ui';

const EMPTY = {
  program_name: '',
  description: '',
};

const ELIGIBILITY_OPTIONS = [
  {
    group: 'Vulnerability Level',
    options: [
      'Highly Vulnerable',
      'Moderately Vulnerable',
      'Low Vulnerable',
    ],
  },
  {
    group: 'Household Conditions',
    options: [
      'Senior Citizen',
      'Person with Disability',
      'Family Size ≥ 6',
      'Family Size ≥ 5',
    ],
  },
  {
    group: 'Monthly Income',
    options: [
      'Monthly Income ≤ ₱5,000',
      'Monthly Income ≤ ₱8,000',
      'Monthly Income ≤ ₱10,000',
      'Monthly Income ≤ ₱12,000',
    ],
  },
];

const RULE_MAP = {
  'Highly Vulnerable': 'Highly Vulnerable',
  'Moderately Vulnerable': 'Moderately Vulnerable',
  'Low Vulnerable': 'Low Vulnerable',

  'Senior Citizen': 'Senior Citizen',
  'Person with Disability': 'Person with Disability',

  'Family Size ≥ 6': 'Family Size >= 6',
  'Family Size ≥ 5': 'Family Size >= 5',

  'Monthly Income ≤ ₱5,000': 'Monthly Income <= 5000',
  'Monthly Income ≤ ₱8,000': 'Monthly Income <= 8000',
  'Monthly Income ≤ ₱10,000': 'Monthly Income <= 10000',
  'Monthly Income ≤ ₱12,000': 'Monthly Income <= 12000',
};

export default function CreateProgram() {
  const navigate = useNavigate();
  const location = useLocation();

  const editingProgram = location.state?.program || null;
  const isEditing = Boolean(
    location.state?.editing && editingProgram
  );

  const [form, setForm] = useState(EMPTY);
  const [selectedRules, setSelectedRules] = useState([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // ============================================================
  // LOAD PROGRAM DATA WHEN EDITING
  // ============================================================

  useEffect(() => {
    if (!isEditing || !editingProgram) {
      setForm(EMPTY);
      setSelectedRules([]);
      return;
    }

    setForm({
      program_name:
        editingProgram.program_name || '',
      description:
        editingProgram.description || '',
    });

    const existingRules = String(
      editingProgram.eligibility_rules || ''
    )
      .split(',')
      .map((rule) => rule.trim())
      .filter(Boolean);

    const selected = existingRules
      .map((savedRule) => {
        const found = Object.entries(
          RULE_MAP
        ).find(([label, mapped]) => {
          return (
            savedRule.toLowerCase() ===
              label.toLowerCase() ||
            savedRule.toLowerCase() ===
              mapped.toLowerCase()
          );
        });

        return found ? found[0] : null;
      })
      .filter(Boolean);

    setSelectedRules(selected);
  }, [isEditing, editingProgram]);

  // ============================================================
  // TOGGLE ELIGIBILITY
  // ============================================================

  const toggleRule = (rule) => {
    setSelectedRules((previous) => {
      if (previous.includes(rule)) {
        return previous.filter(
          (item) => item !== rule
        );
      }

      return [...previous, rule];
    });
  };

  // ============================================================
  // BUILD ELIGIBILITY RULES
  // ============================================================

  const buildEligibilityRules = () => {
    return selectedRules
      .map(
        (rule) =>
          RULE_MAP[rule] || rule
      )
      .join(', ');
  };

  // ============================================================
  // CREATE / UPDATE
  // ============================================================

  const submit = async (e) => {
    e.preventDefault();

    if (!form.program_name.trim()) {
      toast.error('Program name is required.');
      return;
    }

    if (selectedRules.length === 0) {
      toast.error(
  'Please select at least one eligibility criterion.'
);
      return;
    }

    try {
      setSaving(true);
      setError('');

      const payload = {
        program_name:
          form.program_name.trim(),

        description:
          form.description.trim(),

        eligibility_rules:
          buildEligibilityRules(),
      };

      if (isEditing) {
        await api.put(
          `/programs/${editingProgram.program_id}`,
          payload
        );
      } else {
        await api.post(
          '/programs',
          payload
        );
      }

      toast.success('Assistance program created successfully.');
navigate('/programs');
    } catch (err) {
      console.toast.error(
  err?.response?.data?.error ||
    err?.message ||
    (isEditing
      ? 'Failed to update assistance program.'
      : 'Failed to create assistance program.')
);

    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="mt-5" />

      <div className="relative">
        <PageHeader
          title={
            isEditing
              ? 'Edit Assistance Program'
              : 'Create Assistance Program'
          }
          subtitle={
            isEditing
              ? 'Update the assistance program and define which households are eligible to receive it.'
              : 'Create an assistance program and define which households are eligible to receive it.'
          }
        />

        <div className="absolute right-0 top-0">
          <Button
            type="button"
            variant="outline"
            onClick={() =>
              navigate('/programs')
            }
          >
            All Programs
          </Button>
        </div>
      </div>

      <Band
        title={
          isEditing
            ? 'Edit Assistance Program'
            : 'New Assistance Program'
        }
      >
        <form
          onSubmit={submit}
          className="p-5"
        >
          {/* PROGRAM NAME */}
          <div>
            <Input
              label="Program Name"
              value={form.program_name}
              onChange={(e) =>
                setForm({
                  ...form,
                  program_name:
                    e.target.value,
                })
              }
              placeholder="Enter assistance program name"
              required
            />
          </div>

          {/* DESCRIPTION */}
          <div className="mt-5">
            <Input
              label="Description"
              value={form.description}
              onChange={(e) =>
                setForm({
                  ...form,
                  description:
                    e.target.value,
                })
              }
              placeholder="Enter program description"
            />
          </div>

          {/* ELIGIBILITY */}
          <div className="mt-5">
            <label className="block text-lg font-semibold text-gray-700 mb-2">
              Eligibility Criteria
            </label>

            <div className="rounded-md border border-gray-300 bg-white p-4 space-y-5">
              {ELIGIBILITY_OPTIONS.map(
                (group) => (
                  <div key={group.group}>
                    <p className="text-lg font-bold text-ink mb-2">
                      {group.group}
                    </p>

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
                      {group.options.map(
                        (option) => (
                          <label
                            key={option}
                            className="flex items-center gap-2 cursor-pointer text-lg text-gray-700"
                          >
                            <input
                              type="checkbox"
                              checked={selectedRules.includes(
                                option
                              )}
                              onChange={() =>
                                toggleRule(
                                  option
                                )
                              }
                              className="h-5 w-5"
                            />

                            <span>
                              {option}
                            </span>
                          </label>
                        )
                      )}
                    </div>
                  </div>
                )
              )}
            </div>

            <p className="text-base text-muted mt-2">
              Select the household conditions
              that qualify for this program.
            </p>
          </div>

          {/* SELECTED ELIGIBILITY */}
          {selectedRules.length > 0 && (
            <div className="mt-5">
              <p className="text-lg font-semibold text-ink mb-2">
                Selected Eligibility:
              </p>

              <div className="flex flex-wrap gap-2">
                {selectedRules.map(
                  (rule) => (
                    <span
                      key={rule}
                      className="rounded-full bg-[#E2BEBE] px-3 py-1 text-sm font-semibold text-[#6E2430]"
                    >
                      {rule}
                    </span>
                  )
                )}
              </div>
            </div>
          )}

          {/* BUTTONS */}
          <div className="mt-6 flex justify-end gap-3">
            <Button
              type="button"
              variant="outline"
              onClick={() =>
                navigate('/programs')
              }
              disabled={saving}
            >
              Cancel
            </Button>

            <Button
              type="submit"
              disabled={saving}
            >
              {saving
                ? isEditing
                  ? 'Updating...'
                  : 'Creating...'
                : isEditing
                ? 'Update Program'
                : 'Create Program'}
            </Button>
          </div>
        </form>
      </Band>
    </div>
  );
}
