
import { useCallback, useEffect, useState } from 'react';
import { api } from '../lib/api';
import toast from 'react-hot-toast';
import {
  PageHeader,
  Band,
  Status,
  Spinner,
  Button,
} from '../components/ui';

export default function Approve() {
  /* =========================================================
     NORMAL HOUSEHOLD APPROVAL
  ========================================================= */

  const [households, setHouseholds] = useState([]);
  const [loadingHouseholds, setLoadingHouseholds] = useState(true);

  /* =========================================================
     CALAMITY APPROVAL
  ========================================================= */

  const [calamityPrograms, setCalamityPrograms] = useState([]);
  const [loadingCalamity, setLoadingCalamity] = useState(true);

  /* =========================================================
     GENERAL STATES
  ========================================================= */

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  /* =========================================================
     MODALS
  ========================================================= */

  const [selectedHousehold, setSelectedHousehold] = useState(null);
  const [selectedCalamity, setSelectedCalamity] = useState(null);

  /* =========================================================
     LOAD NORMAL HOUSEHOLDS
  ========================================================= */

  const loadHouseholds = useCallback(async () => {
  try {
    setLoadingHouseholds(true);

    const data = await api.get(
      '/validation/beneficiary-validation'
    );

    const list = Array.isArray(data?.households)
      ? data.households
      : [];

    setHouseholds(list);
  } catch (e) {
    console.error(
      'Failed to load ML-validated households:',
      e
    );

    setHouseholds([]);

    toast.error(
      e?.response?.data?.error ||
      e?.response?.data?.message ||
      e?.message ||
      'Failed to load households awaiting Captain approval.'
    );
  } finally {
    setLoadingHouseholds(false);
  }
}, []);

  /* =========================================================
     LOAD CALAMITY PROGRAMS
  ========================================================= */

 const loadCalamityPrograms = useCallback(async () => {
  try {
    setLoadingCalamity(true);

    const data = await api.get(
      '/validation/calamity-programs'
    );

    const list = Array.isArray(
      data?.calamity_programs
    )
      ? data.calamity_programs
      : [];

    setCalamityPrograms(list);
  } catch (e) {
    console.error(
      'Failed to load calamity programs:',
      e
    );

    setCalamityPrograms([]);

    toast.error(
      e?.response?.data?.error ||
      e?.response?.data?.message ||
      e?.message ||
      'Failed to load calamity assistance.'
    );
  } finally {
    setLoadingCalamity(false);
  }
}, []);

  /* =========================================================
     INITIAL LOAD
  ========================================================= */

  useEffect(() => {
    loadHouseholds();
    loadCalamityPrograms();
  }, [
    loadHouseholds,
    loadCalamityPrograms,
  ]);

  /* =========================================================
     NORMAL HOUSEHOLD MODAL
  ========================================================= */

  const openHouseholdDecision = (household, decision) => {
  setSelectedHousehold({
    household,
    decision,
    remarks: '',
  });
};

  const closeHouseholdDecision = () => {
  if (!saving) {
    setSelectedHousehold(null);
  }
};

  /* =========================================================
     NORMAL HOUSEHOLD DECISION
  ========================================================= */

  const decideHousehold = async () => {
  const validation = selectedHousehold?.household;

  if (!validation?.validation_id) {
    toast.error('Invalid beneficiary validation ID.');
    return;
  }

  const decision = selectedHousehold.decision;
  const remarks = selectedHousehold.remarks?.trim() || '';

  if (!['Approved', 'Rejected'].includes(decision)) {
    toast.error('Invalid Captain decision.');
    return;
  }

  if (decision === 'Rejected' && !remarks) {
    toast.error(
      'Please provide a reason for returning this beneficiary.'
    );
    return;
  }

  try {
    setSaving(true);

    const response = await api.patch(
      `/validation/beneficiary-validation/${validation.validation_id}/decision`,
      {
        decision,
        remarks:
          remarks ||
          'Captain approved the beneficiary.',
      }
    );

    setSelectedHousehold(null);

    toast.success(
      decision === 'Approved'
        ? 'Household beneficiary approved successfully.'
        : 'Household beneficiary returned successfully.'
    );

    await loadHouseholds();

    console.log(
      'Beneficiary approval saved:',
      response
    );
  } catch (e) {
    console.error(
      'Failed to save beneficiary decision:',
      e
    );

    toast.error(
      e?.response?.data?.error ||
      e?.response?.data?.message ||
      e?.message ||
      'Failed to save the Captain decision.'
    );
  } finally {
    setSaving(false);
  }
};

  /* =========================================================
     CALAMITY MODAL
  ========================================================= */

  const openCalamityDecision = (calamity, decision) => {
  setSelectedCalamity({
    calamity,
    decision,
    remarks: '',
  });
};

const closeCalamityDecision = () => {
  if (!saving) {
    setSelectedCalamity(null);
  }
};

  /* =========================================================
     CALAMITY DECISION
  ========================================================= */

 const decideCalamity = async () => {
  const calamity = selectedCalamity?.calamity;

  if (!calamity?.calamity_id) {
    toast.error('Invalid calamity assistance ID.');
    return;
  }

  const decision = selectedCalamity.decision;
  const remarks = selectedCalamity.remarks?.trim() || '';

  if (!['Approved', 'Rejected'].includes(decision)) {
    toast.error('Invalid calamity decision.');
    return;
  }

  if (decision === 'Rejected' && !remarks) {
    toast.error(
      'Please provide a reason for returning this calamity assistance request.'
    );
    return;
  }

  try {
    setSaving(true);

    await api.patch(
      `/validation/calamity-programs/${calamity.calamity_id}/decision`,
      {
        decision,
        remarks:
          remarks ||
          'Captain approved the calamity assistance request.',
      }
    );

    setSelectedCalamity(null);

    toast.success(
      decision === 'Approved'
        ? 'Calamity assistance approved successfully.'
        : 'Calamity assistance returned successfully.'
    );

    await loadCalamityPrograms();
  } catch (e) {
    console.error(
      'Failed to save calamity decision:',
      e
    );

    toast.error(
      e?.response?.data?.error ||
      e?.response?.data?.message ||
      e?.message ||
      'Failed to save calamity decision.'
    );
  } finally {
    setSaving(false);
  }
};

  /* =========================================================
     COUNTS
  ========================================================= */

  const totalAwaitingApproval =
    households.length +
    calamityPrograms.length;

  return (
    <div className="space-y-6">

      {/* =====================================================
          PAGE HEADER
      ===================================================== */}

      <PageHeader
        title="Approve Household Data"
        subtitle="Review ML-validated households and calamity assistance requests before making the final Captain decision."
      />


      {/* =====================================================
          SUMMARY CARDS
      ===================================================== */}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">

        <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
          <div className="text-xl font-bold tracking-wide text-head">
            HOUSEHOLD APPROVAL
          </div>

          <div className="text-[36px] font-extrabold leading-tight text-ink">
            {households.length}
          </div>

          <div className="text-xl font-semibold text-amber-soft">
            Normal household reviews
          </div>
        </div>

        <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
          <div className="text-xl font-bold tracking-wide text-head">
            CALAMITY APPROVAL
          </div>

          <div className="text-[36px] font-extrabold leading-tight text-ink">
            {calamityPrograms.length}
          </div>

          <div className="text-xl font-semibold text-red-600">
            Calamity requests
          </div>
        </div>


        <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
          <div className="text-xl font-bold tracking-wide text-head">
            TOTAL PENDING
          </div>

          <div className="text-[36px] font-extrabold leading-tight text-ink">
            {totalAwaitingApproval}
          </div>

          <div className="text-xl font-semibold text-amber-soft">
            Requires Captain review
          </div>
        </div>

      </div>

      {/* =====================================================
          NORMAL HOUSEHOLD APPROVAL
      ===================================================== */}

      <Band title="Assistance Program Waiting For Approval">

        {loadingHouseholds ? (
          <div className="flex justify-center py-10">
            <Spinner />
          </div>
        ) : (
          <div className="max-h-[600px] overflow-y-auto overflow-x-hidden pr-2">
  <div className="space-y-4">

            {households.map((h) => {
              const householdId =
                h.household_id;

              const programs =
                Array.isArray(
                  h.suggested_programs
                )
                  ? h.suggested_programs.join(
                      ', '
                    )
                  : h.suggested_programs ||
                    '—';

              return (
                <div
                  key={h.validation_id}
                  className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm"
                >

                  {/* HEADER */}

                  <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">

                    <div>
                      <div className="text-lg font-bold text-ink">
                        Household Name: {h.household_head_name ||
                          'Unnamed Household'}
                      </div>

                      <div className="mt-1 text-lg text-ink">
                        Purok {h.purok || '—'}
                      </div>

                      <div className="mt-1">
                        <Status status={h.validation_status || 'Pending'} />
                      </div>
                    </div>

                    {/* ACTIONS */}

                    <div className="flex shrink-0 gap-2">

                      <Button
                        variant="success"
                        onClick={() =>
                          openHouseholdDecision(
                            h,
                            'Approved'
                          )
                        }
                        disabled={saving}
                      >
                        Approve
                      </Button>

                      <Button
                        variant="outline"
                        onClick={() =>
                          openHouseholdDecision(
                            h,
                            'Rejected'
                          )
                        }
                        disabled={saving}
                      >
                        Return
                      </Button>

                    </div>

                  </div>

                  {/* DETAILS */}

                  <div className="mt-5 grid grid-cols-1 gap-x-8 gap-y-3 text-lg md:grid-cols-2">

                    <div>
                      <span className="font-bold text-ink">
                        Household ID:{' '}
                      </span>

                      <span className="text-muted">
                        {householdId || '—'}
                      </span>
                    </div>

                    <div>
                      <span className="font-bold text-ink">
                        Classification:{' '}
                      </span>

                      <span className="text-muted">
                        {h.vulnerability || '—'}
                      </span>
                    </div>

                    

                    <div>
                      <span className="font-bold text-ink">
                        Encoded By:{' '}
                      </span>

                      <span className="text-muted">
                        {h.encoded_by || '—'}
                      </span>
                    </div>

                    <div>
                      <span className="font-bold text-ink">
                        Monthly Income:{' '}
                      </span>

                      <span className="text-muted">
                        ₱
                        {Number(
                          h.monthly_income || 0
                        ).toLocaleString()}
                      </span>
                    </div>

                    <div>
                      <span className="font-bold text-ink">
                        Dependents:{' '}
                      </span>

                      <span className="text-muted">
                        {h.family_number ?? 0}
                      </span>
                    </div>


                    <div>
  <span className="font-bold text-ink">
    Assistance Program:{' '}
  </span>

  <span className="text-muted">
    {h.program_name || '—'}
  </span>
</div>

                  </div>
                </div>
              );
            })}

                {households.length === 0 && (
      <div className="rounded-lg border border-dashed border-gray-300 py-12 text-center">
        <div className="text-lg font-semibold text-ink">
          No households awaiting approval
        </div>

        <p className="mt-1 text-sm text-muted">
          ML-validated households will appear here.
        </p>
      </div>
    )}

  </div>
</div>
        )}

      </Band>

      {/* =====================================================
          CALAMITY APPROVAL
      ===================================================== */}

      <Band title="Calamity Assistance Waiting For Approval">

  {loadingCalamity ? (
    <div className="flex justify-center py-10">
      <Spinner />
    </div>
  ) : (
    <div className="max-h-[600px] overflow-y-auto overflow-x-hidden pr-2">
      <div className="space-y-4">

        {calamityPrograms.map((item) => (
          <div
            key={item.calamity_id}
            className="rounded-lg border border-red-200 bg-white p-5 shadow-sm"
          >

            <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">

              <div>
                <div className="text-lg font-bold text-ink">
                  Household Name: {item.household_head_name || 'Unnamed Household'}
                </div>

                <div className="mt-1 text-xl text-muted text-ink">
                  Purok {item.purok || '—'}
                </div>
              </div>

              <div className="flex shrink-0 gap-2">
                <Button
                  variant="success"
                  onClick={() =>
                    openCalamityDecision(item, 'Approved')
                  }
                  disabled={saving}
                >
                  Approve
                </Button>

                <Button
                  variant="outline"
                  onClick={() =>
                    openCalamityDecision(item, 'Rejected')
                  }
                  disabled={saving}
                >
                  Return
                </Button>
              </div>

            </div>

            <div className="mt-5 grid grid-cols-1 gap-x-8 gap-y-3 text-xl md:grid-cols-2">

              <div>
                <span className="font-bold text-ink">
                  Household ID:{' '}
                </span>

                <span className="text-muted">
                  {item.household_id || '—'}
                </span>
              </div>

              <div>
                <span className="font-bold text-ink">
                  Assistance Program:{' '}
                </span>

                <span className="text-muted">
                  {item.program_name || '—'}
                </span>
              </div>

              <div>
                <span className="font-bold text-ink">
                  House Type:{' '}
                </span>

                <span className="text-muted">
                  {item.house_type || '—'}
                </span>
              </div>

              <div>
                <span className="font-bold text-ink">
                  Roof Damage:{' '}
                </span>

                <span className="text-muted">
                  {item.roof_damage || 'None'}
                </span>
              </div>

              <div>
                <span className="font-bold text-ink">
                  Wall Damage:{' '}
                </span>

                <span className="text-muted">
                  {item.wall_damage || 'None'}
                </span>
              </div>

              <div>
                <span className="font-bold text-ink">
                  Flooding Level:{' '}
                </span>

                <span className="text-muted">
                  {item.flooding_level || 'None'}
                </span>
              </div>

              <div>
                <span className="font-bold text-ink">
                  Damage Risk:{' '}
                </span>

                <span className="font-bold text-red-600">
                  {item.damage_risk != null
                    ? `${Number(item.damage_risk).toFixed(1)}%`
                    : '0%'}
                </span>
              </div>

              <div>
                <span className="font-bold text-ink">
                  Risk Level:{' '}
                </span>

                <span
                  className={
                    item.risk_level === 'High'
                      ? 'font-bold text-red-600'
                      : item.risk_level === 'Medium'
                      ? 'font-bold text-amber-600'
                      : 'font-bold text-success'
                  }
                >
                  {item.risk_level || 'Low'}
                </span>
              </div>

              <div>
                <span className="font-bold text-ink">
                  Monthly Income:{' '}
                </span>

                <span className="text-muted">
                  ₱
                  {Number(
                    item.monthly_income || 0
                  ).toLocaleString()}
                </span>
              </div>

              <div>
                <span className="font-bold text-ink">
                  Dependents:{' '}
                </span>

                <span className="text-muted">
                  {item.family_number ?? 0}
                </span>
              </div>

              <div>
                <span className="font-bold text-ink">
                  Status:{' '}
                </span>

                <span className="font-semibold text-amber-600">
                  Pending Captain Approval
                </span>
              </div>

            </div>
          </div>
        ))}

        {calamityPrograms.length === 0 && (
          <div className="rounded-lg border border-dashed border-gray-300 py-12 text-center">
            <div className="text-lg font-semibold text-ink">
              No calamity assistance awaiting approval
            </div>

            <p className="mt-1 text-sm text-muted">
              Calamity assistance requests will appear here after they are submitted.
            </p>
          </div>
        )}

      </div>
    </div>
  )}

</Band>

      {/* =====================================================
          NORMAL HOUSEHOLD MODAL
      ===================================================== */}

      {selectedHousehold && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          role="dialog"
          aria-modal="true"
          onClick={closeHouseholdDecision}
        >
          <div
            className="w-full max-w-xl rounded-xl bg-white p-6 shadow-xl"
            onClick={(e) =>
              e.stopPropagation()
            }
          >

            <h3 className="text-lg font-bold text-ink">
              {selectedHousehold.decision ===
              'Approved'
                ? 'Confirm Household Approval'
                : 'Return Household'}
            </h3>

            <p className="mt-2 text-xl leading-6 text-muted">
  {selectedHousehold.decision === 'Approved'
    ? `Approve "${
        selectedHousehold.household.household_head_name ||
        'this household'
      }" for ${
        selectedHousehold.household.program_name ||
        'the selected assistance program'
      }?`
    : `Return "${
        selectedHousehold.household.household_head_name ||
        'this household'
      }" for further review?`}
</p>

            {/* HOUSEHOLD SUMMARY */}

            <div className="mt-4 rounded-lg bg-gray-50 p-4 text-xl">

              <div>
                <span className="font-bold text-ink">
                  Household ID:{' '}
                </span>

                <span className="text-muted text-xl">
                  {
                    selectedHousehold.household
                      .household_id
                  }
                </span>
              </div>

              <div className="mt-1">
                <span className="font-bold text-ink">
                  ML Classification:{' '}
                </span>

                <span className="text-muted">
                  {
                    selectedHousehold.household
                      .vulnerability || '—'
                  }
                </span>
              </div>

              

              <div className="mt-1">
  <span className="font-bold text-ink">
    Assistance Program:{' '}
  </span>

  <span className="text-muted">
    {selectedHousehold.household.program_name || '—'}
  </span>
</div>

            </div>

            {/* REMARKS */}

            <div className="mt-4">

              <label
                htmlFor="household-remarks"
                className="mb-1 block text-xl font-bold text-ink"
              >
                Captain Remarks

                {selectedHousehold.decision ===
                  'Rejected' && (
                  <span className="ml-1 text-red-600">
                    *
                  </span>
                )}
              </label>

              <textarea
                id="household-remarks"
                value={
                  selectedHousehold.remarks
                }
                onChange={(e) =>
                  setSelectedHousehold(
                    (current) => ({
                      ...current,
                      remarks:
                        e.target.value,
                    })
                  )
                }
                placeholder={
                  selectedHousehold.decision ===
                  'Approved'
                    ? 'Optional approval remarks...'
                    : 'Enter the reason for returning this household...'
                }
                rows={4}
                disabled={saving}
                className="w-full resize-none rounded-lg border border-gray-300 px-3 py-2 text-xl text-ink outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 disabled:bg-gray-100"
              />

            </div>

            {/* BUTTONS */}

            <div className="mt-5 flex justify-end gap-2">

              <Button
                variant="outline"
                onClick={
                  closeHouseholdDecision
                }
                disabled={saving}
              >
                Cancel
              </Button>

              <Button
                variant={
                  selectedHousehold.decision ===
                  'Approved'
                    ? 'success'
                    : 'danger'
                }
                onClick={
                  decideHousehold
                }
                disabled={saving}
              >
                {saving
                  ? 'Saving...'
                  : selectedHousehold.decision ===
                    'Approved'
                  ? 'Confirm Approval'
                  : 'Confirm Return'}
              </Button>

            </div>

          </div>
        </div>
      )}

      {/* =====================================================
          CALAMITY MODAL
      ===================================================== */}

      {selectedCalamity && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          role="dialog"
          aria-modal="true"
          onClick={closeCalamityDecision}
        >
          <div
            className="w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-xl bg-white p-6 shadow-xl"
            onClick={(e) =>
              e.stopPropagation()
            }
          >

            <h3 className="text-lg font-bold text-ink">
              {selectedCalamity.decision ===
              'Approved'
                ? 'Confirm Calamity Approval'
                : 'Return Calamity Request'}
            </h3>

            <p className="mt-2 text-xl leading-6 text-muted">
              {selectedCalamity.decision ===
              'Approved'
                ? `Approve "${
                    selectedCalamity.calamity
                      .household_head_name ||
                    'this household'
                  }" for calamity assistance?`
                : `Return "${
                    selectedCalamity.calamity
                      .household_head_name ||
                    'this household'
                  }" for further calamity review?`}
            </p>

            {/* CALAMITY SUMMARY */}

            <div className="mt-4 rounded-lg border border-red-100 bg-red-50 p-4 text-xl">

              <div>
                <span className="font-bold text-ink">
                  Household ID:{' '}
                </span>

                <span className="text-muted">
                  {
                    selectedCalamity.calamity
                      .household_id || '—'
                  }
                </span>
              </div>

              <div className="mt-1">
                <span className="font-bold text-ink">
                  Assistance Program:{' '}
                </span>

                <span className="text-muted">
                  {
                    selectedCalamity.calamity
                      .program_name || '—'
                  }
                </span>
              </div>

              <div className="mt-1">
                <span className="font-bold text-ink">
                  House Type:{' '}
                </span>

                <span className="text-muted">
                  {
                    selectedCalamity.calamity
                      .house_type || '—'
                  }
                </span>
              </div>

              <div className="mt-1">
                <span className="font-bold text-ink">
                  Roof Damage:{' '}
                </span>

                <span className="text-muted">
                  {
                    selectedCalamity.calamity
                      .roof_damage || 'None'
                  }
                </span>
              </div>

              <div className="mt-1">
                <span className="font-bold text-ink">
                  Wall Damage:{' '}
                </span>

                <span className="text-muted">
                  {
                    selectedCalamity.calamity
                      .wall_damage || 'None'
                  }
                </span>
              </div>

              <div className="mt-1">
                <span className="font-bold text-ink">
                  Flooding Level:{' '}
                </span>

                <span className="text-muted">
                  {
                    selectedCalamity.calamity
                      .flooding_level || 'None'
                  }
                </span>
              </div>

              <div className="mt-1">
                <span className="font-bold text-ink">
                  Damage Risk:{' '}
                </span>

                <span className="font-bold text-red-600">
                  {Number(
                    selectedCalamity.calamity
                      .damage_risk || 0
                  ).toFixed(1)}
                  %
                </span>
              </div>

              <div className="mt-1">
                <span className="font-bold text-ink">
                  Risk Level:{' '}
                </span>

                <span
                  className={
                    selectedCalamity.calamity
                      .risk_level === 'High'
                      ? 'font-bold text-red-600'
                      : selectedCalamity.calamity
                          .risk_level === 'Medium'
                      ? 'font-bold text-amber-600'
                      : 'font-bold text-success'
                  }
                >
                  {
                    selectedCalamity.calamity
                      .risk_level || 'Low'
                  }
                </span>
              </div>

              <div className="mt-1">
                <span className="font-bold text-ink">
                  Monthly Income:{' '}
                </span>

                <span className="text-muted">
                  ₱
                  {Number(
                    selectedCalamity.calamity
                      .monthly_income || 0
                  ).toLocaleString()}
                </span>
              </div>

              <div className="mt-1">
                <span className="font-bold text-ink">
                  Dependents:{' '}
                </span>

                <span className="text-muted">
                  {
                    selectedCalamity.calamity
                      .family_number ?? 0
                  }
                </span>
              </div>

            </div>

            {/* REMARKS */}

            <div className="mt-4">

              <label
                htmlFor="calamity-remarks"
                className="mb-1 block text-xl font-bold text-ink"
              >
                Captain Remarks

                {selectedCalamity.decision ===
                  'Rejected' && (
                  <span className="ml-1 text-red-600">
                    *
                  </span>
                )}
              </label>

              <textarea
                id="calamity-remarks"
                value={
                  selectedCalamity.remarks
                }
                onChange={(e) =>
                  setSelectedCalamity(
                    (current) => ({
                      ...current,
                      remarks:
                        e.target.value,
                    })
                  )
                }
                placeholder={
                  selectedCalamity.decision ===
                  'Approved'
                    ? 'Optional approval remarks...'
                    : 'Enter the reason for returning this calamity request...'
                }
                rows={4}
                disabled={saving}
                className="w-full resize-none rounded-lg border border-gray-300 px-3 py-2 text-xl text-ink outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 disabled:bg-gray-100"
              />

            </div>

            {/* BUTTONS */}

            <div className="mt-2 flex justify-end gap-2">

              <Button
                variant="outline"
                onClick={
                  closeCalamityDecision
                }
                disabled={saving}
              >
                Cancel
              </Button>

              <Button
                variant={
                  selectedCalamity.decision ===
                  'Approved'
                    ? 'success'
                    : 'danger'
                }
                onClick={
                  decideCalamity
                }
                disabled={saving}
              >
                {saving
                  ? 'Saving...'
                  : selectedCalamity.decision ===
                    'Approved'
                  ? 'Confirm Calamity Approval'
                  : 'Confirm Calamity Return'}
              </Button>

            </div>

          </div>
        </div>
      )}

    </div>
  );
}

