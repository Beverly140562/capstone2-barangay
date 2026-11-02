import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';

import {
  PageHeader,
  Band,
  Button,
  Spinner,
} from '../components/ui';

export default function Programs() {
  const [programs, setPrograms] = useState([]);
  const [loading, setLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState(null);

  const navigate = useNavigate();

  const load = async () => {
    try {
      setLoading(true);

      const data = await api.get('/programs');

      const loadedPrograms = Array.isArray(data)
        ? data
        : Array.isArray(data?.programs)
        ? data.programs
        : [];

      // Newest created program first
      loadedPrograms.sort((a, b) => {
        const dateA = a.created_at
          ? new Date(a.created_at).getTime()
          : 0;

        const dateB = b.created_at
          ? new Date(b.created_at).getTime()
          : 0;

        return dateB - dateA;
      });

      setPrograms(loadedPrograms);
    } catch (err) {
      console.error(
        'Failed to load assistance programs:',
        err
      );

      toast.error(
        err?.response?.data?.error ||
          err?.message ||
          'Failed to load assistance programs.'
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const toggleStatus = async (program) => {
    const newStatus = !Boolean(program.is_active);

    try {
      setUpdatingId(program.program_id);

      await api.patch(
        `/programs/${program.program_id}/status`,
        {
          is_active: newStatus,
        }
      );

      setPrograms((current) =>
        current.map((item) =>
          item.program_id === program.program_id
            ? {
                ...item,
                is_active: newStatus,
              }
            : item
        )
      );

      toast.success(
        newStatus
          ? 'Assistance program activated. ML can now use this program for suggestions.'
          : 'Assistance program deactivated. ML will no longer use this program for new suggestions.'
      );
    } catch (err) {
      console.error(
        'Failed to update assistance program status:',
        err
      );

      toast.error(
        err?.response?.data?.error ||
          err?.message ||
          'Failed to update assistance program status.'
      );
    } finally {
      setUpdatingId(null);
    }
  };

  const remove = async (id) => {
    toast(
      (t) => (
        <div className="flex flex-col gap-3">
          <p className="font-semibold text-[#6E2430]">
            Are you sure you want to delete this assistance
            program?
          </p>

          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => toast.dismiss(t.id)}
              className="px-3 py-1.5 rounded-md border border-gray-300 text-gray-700 font-semibold hover:bg-gray-100 transition"
            >
              Cancel
            </button>

            <button
              type="button"
              onClick={async () => {
                toast.dismiss(t.id);

                try {
                  await api.del(`/programs/${id}`);

                  toast.success(
                    'Assistance program deleted successfully.'
                  );

                  await load();
                } catch (err) {
                  console.error(
                    'Failed to delete assistance program:',
                    err
                  );

                  toast.error(
                    err?.response?.data?.error ||
                      err?.message ||
                      'Failed to delete assistance program.'
                  );
                }
              }}
              className="px-3 py-1.5 rounded-md bg-[#6E2430] text-white font-semibold hover:opacity-90 transition"
            >
              Delete
            </button>
          </div>
        </div>
      ),
      {
        duration: Infinity,
        position: 'top-right',
      }
    );
  };

  const startEdit = (program) => {
    navigate('/programs/create', {
      state: {
        program,
        editing: true,
      },
    });
  };

  const formatEligibilityRules = (rules) => {
  if (!rules) return 'No eligibility rules specified.';

  let parsed = rules;

  // Convert JSON string into an object if necessary.
  if (typeof rules === 'string') {
    try {
      parsed = JSON.parse(rules);
    } catch {
      return rules;
    }
  }

  if (!parsed || typeof parsed !== 'object') {
    return String(parsed);
  }

  const parts = [];

  // Vulnerability levels
  if (parsed.vulnerability_levels?.length > 0) {
    parts.push(
      `Vulnerability Level: ${parsed.vulnerability_levels.join(' or ')}`
    );
  }

  // Household conditions
  if (parsed.household_conditions?.length > 0) {
    const conditions = parsed.household_conditions.map((condition) => {
      const labels = {
        person_with_disability: 'Person with Disability',
        senior_citizen: 'Senior Citizen',
        family_size_gte_5: 'Family Size of 5 or More',
        family_size_gte_6: 'Family Size of 6 or More',
      };

      return labels[condition] || condition.replaceAll('_', ' ');
    });

    parts.push(
      `Household Condition: ${conditions.join(' or ')}`
    );
  }

  // Monthly income limit
  if (
    parsed.monthly_income_max !== null &&
    parsed.monthly_income_max !== undefined
  ) {
    parts.push(
      `Maximum Monthly Income: ₱${Number(
        parsed.monthly_income_max
      ).toLocaleString('en-PH')}`
    );
  }

  return parts.length
    ? parts.join(' | ')
    : 'No eligibility rules specified.';
};


  return (
    <div className="space-y-6">
      <div className="mt-5" />

      <div className="relative">
        <PageHeader
          title="Assistance Program"
          subtitle="Assistance programs and review data-driven program suggestions."
        />

        <div className="absolute right-0 top-0">
          <Button
            type="button"
            onClick={() =>
              navigate('/programs/create')
            }
          >
            + Create Program
          </Button>
        </div>
      </div>

      {loading ? (
        <Spinner />
      ) : (
        <Band title="Assistance Programs">
          <div className="grid md:grid-cols-2 gap-4 overflow-y-auto max-h-[580px] scrollbar-hide">
            {programs.map((p) => {
              const approvedCount =
                Number(
                  p.total_approved_households
                ) || 0;

              const isActive =
                Boolean(p.is_active);

              const isUpdating =
                updatingId === p.program_id;

              return (
                <div
                  key={p.program_id}
                  className={`rounded-lg border p-5 m-5 ${
                    isActive
                      ? 'border-gray-200'
                      : 'border-gray-300 bg-gray-50'
                  }`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div
                      className={`inline-block rounded px-2 py-0.5 text-lg font-bold uppercase ${
                        isActive
                          ? 'bg-green-600 text-white'
                          : 'bg-gray-500 text-white'
                      }`}
                    >
                      {isActive
                        ? 'Active'
                        : 'Inactive'}
                    </div>

                    <span
                      className={`text-sm font-semibold ${
                        isActive
                          ? 'text-green-700'
                          : 'text-gray-500'
                      }`}
                    >
                      {isActive
                        ? 'Available to ML'
                        : 'Not available to ML'}
                    </span>
                  </div>

                  <div className="mt-2 font-bold text-xl text-ink">
                    {p.program_name}
                  </div>

                  <p className="text-xl text-muted mt-1">
                    <span className="font-semibold">
                      Date Created:
                    </span>{' '}
                    {p.created_at
                      ? new Date(
                          p.created_at
                        ).toLocaleDateString(
                          'en-PH',
                          {
                            year: 'numeric',
                            month: 'long',
                            day: 'numeric',
                          }
                        )
                      : '—'}
                  </p>

                  <p className="text-xl text-muted mt-1">
                    {p.description ||
                      'No description provided.'}
                  </p>

                  <p className="text-base text-muted mt-2 leading-relaxed">
  <span className="font-semibold">
    Eligibility:
  </span>{' '}
  {formatEligibilityRules(p.eligibility_rules)}
</p>

                  <div className="mt-4 flex items-center justify-between gap-3">
                    <span className="text-xl text-muted-light">
                      {approvedCount}{' '}
                      {approvedCount === 1
                        ? 'household'
                        : 'households'}{' '}
                      approved
                    </span>

                    <div className="flex gap-2 flex-wrap justify-end">
                      <Button
                        variant="outline"
                        onClick={() =>
                          startEdit(p)
                        }
                      >
                        Edit
                      </Button>

                      <button
                        type="button"
                        disabled={isUpdating}
                        onClick={() =>
                          toggleStatus(p)
                        }
                        className={`px-4 py-2 rounded-md font-semibold transition ${
                          isUpdating
                            ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                            : isActive
                            ? 'bg-gray-600 text-white hover:bg-gray-700'
                            : 'bg-green-600 text-white hover:bg-green-700'
                        }`}
                      >
                        {isUpdating
                          ? 'Updating...'
                          : isActive
                          ? 'Deactivate'
                          : 'Activate'}
                      </button>

                      <Button
                        variant="danger"
                        onClick={() =>
                          remove(
                            p.program_id
                          )
                        }
                      >
                        Delete
                      </Button>
                    </div>
                  </div>
                </div>
              );
            })}

            {!programs.length && (
              <p className="text-sm text-gray-400 col-span-2 text-center py-6">
                No assistance programs.
              </p>
            )}
          </div>
        </Band>
      )}
    </div>
  );
}