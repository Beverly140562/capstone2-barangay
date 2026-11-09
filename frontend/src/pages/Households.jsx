import { useCallback, useEffect, useState, useRef } from 'react';
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
        return {
          program_name: program,
          description: '',
        };
      }

      if (program && typeof program === 'object') {
        return {
          program_name:
            program.program_name ||
            program.name ||
            'Unnamed Program',
          description: program.description || '',
        };
      }

      return null;
    })
    .filter(Boolean);
}
export default function Households() {
  const [params] = useSearchParams();
  const location = useLocation();
  const { user } = useAuth();

  const editMode =
    location.pathname === '/update' ||
    params.get('mode') === 'edit';

  const [households, setHouseholds] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');

  const canEdit =
    user?.roles === 'admin' ||
    user?.roles === 'staff';

  // Load household records.
  const load = useCallback(async () => {
  setLoading(true);
  setError('');

  try {
    const data = await api.get('/households');

    setHouseholds(
      Array.isArray(data?.households)
        ? data.households
        : []
    );
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

const filteredHouseholds = households.filter((household) => {
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
      [surname, givenName, middleName]
        .some((value) => value.toLowerCase().includes(word))
    )
  );
});

  // Open household details.
  // Open household details and refresh its saved ML prediction.
const open = async (id) => {
  if (!id) {
    setError('Cannot open household: household ID is missing.');
    return;
  }

  try {
    setError('');
    setSelected(null);

    const data = await api.get(
      `/households/${encodeURIComponent(id)}`
    );

    const householdData =
      data?.household
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

    // Show the existing household details immediately.
    setSelected(householdData);

    // Refresh the prediction and save it through the existing API route.
    try {
      const predictionResult = await api.post(
        `/households/${encodeURIComponent(id)}/predict`,
        {}
      );

      if (predictionResult?.household) {
        setSelected((current) => {
          if (!current) return current;

          return {
            ...current,
            household: {
              ...current.household,
              ...predictionResult.household,
            },
          };
        });
      }
    } catch (predictionError) {
      console.error(
        'Household details loaded, but prediction refresh failed:',
        predictionError
      );

      setError(
        predictionError?.message ||
        'Household details loaded, but the ML prediction could not be refreshed.'
      );
    }
  } catch (err) {
    console.error('Failed to open household:', err);
    setError(err?.message || 'Failed to open household details.');
  }
};

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="mt-4 ">
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

      {/* Search */}
      <div className="max-w-md">
        <Input
          type="text"
          placeholder="Search surname, given name, household ID..."
          value={searchTerm}
          onChange={(value) => {
            // Supports either a string or a normal input event.
            setSearchTerm(
              typeof value === 'string'
                ? value
                : value?.target?.value ?? ''
            );
          }}
        />

        {query && (
          <p className="text-sm text-gray-500 mt-2">
            {loading
              ? 'Searching households...'
              : `${filteredHouseholds.length} matching household(s)`}
          </p>
        )}
      </div>

      {/* Error */}
      {error && (
        <div className="text-red-600" role="alert">
          {error}
          <button
            type="button"
            className="ml-3 underline"
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
            editMode
              ? 'Household & Residence Records'
              : 'Household Records'
          }
        >
        <div className="max-h-[500px] overflow-auto scrollbar-hide"> 
          <Table
            head={[
              'Household',
              'Purok',
              'Classification',
              'Suggested Program',
              'Household Status',
              'Validation Status',
              'Action',
            ]}
          >
            {filteredHouseholds.map((h) => {
              const householdStatus =
                h.household_status || 'Active';

              const programs = normalizeSuggestedPrograms(
  h.suggested_programs
);

const programNames = programs
  .map((program) => program.program_name)
  .join(', ') || '—';

              return (
                <tr
                  key={h.household_id}
                  className="cursor-pointer hover:bg-gray-100"
                  onClick={() => open(h.household_id)}
                >
                  <td className="px-5 py-2 text-2xl font-medium">
                    {h.surname || '—'}, {h.given_name || '—'}
                  </td>

                  <td className="px-5 py-2">
                    {h.purok || '—'}
                  </td>

                  <td className="px-3 py-2">
                    <span
                      className={`font-semibold ${
                        h.vulnerability?.includes('Highly')
                          ? 'text-alert'
                          : h.vulnerability?.includes('Moderately')
                          ? 'text-amber'
                          : 'text-success'
                      }`}
                    >
                      {h.vulnerability?.replace(
                        ' Vulnerable',
                        ''
                      ) || '—'}
                    </span>
                  </td>

                  <td className="px-5 py-2 text-[#6E2430]">
  {programNames}
</td>

                  <td
                    className="px-5 py-2"
                    onClick={(event) =>
                      event.stopPropagation()
                    }
                  >
                    <Status
                      tone={
                        householdStatus === 'Active'
                          ? 'success'
                          : 'alert'
                      }
                    >
                      {householdStatus}
                    </Status>
                  </td>

                  <td className="px-5 py-2">
                    <Status
                      tone={statusTone(h.validation_status)}
                    >
                      {h.validation_status || '—'}
                    </Status>
                  </td>

                  <td
                    className="px-5 py-2"
                    onClick={(event) =>
                      event.stopPropagation()
                    }
                  >
                    {canEdit && (
                      <Link
                        to={`/encode?id=${h.household_id}`}
                      >
                        <Button variant="outline">
                          {editMode ? '✏️ Update' : '✏️ Edit'}
                        </Button>
                      </Link>
                    )}
                  </td>
                </tr>
              );
            })}

            {!filteredHouseholds.length && (
              <tr>
                <td
                  colSpan={7}
                  className="px-3 py-6 text-center text-gray-400"
                >
                  {query
                    ? 'No households match your search.'
                    : 'No households found.'}
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

function HouseholdDrawer({ data, onClose, reload }) {
  const { user } = useAuth();
  const [incomeProofs, setIncomeProofs] = useState([]);
  const [selectedFiles, setSelectedFiles] = useState([]);
  const [uploadingProofs, setUploadingProofs] = useState(false);
  const [loadingProofs, setLoadingProofs] = useState(false);
  const [previewImage, setPreviewImage] = useState(null);

  const fileInputRef = useRef(null);

  const MAX_FILES = 5;
  const MAX_FILE_SIZE = 5 * 1024 * 1024;

  const allowedImageTypes = [
    'image/jpeg',
    'image/png',
    'image/webp',
  ];

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


  const canEdit =
    user?.roles === 'admin' ||
    user?.roles === 'staff';

 const loadIncomeProofs = useCallback(async () => {
  if (!household?.household_id) return;

  setLoadingProofs(true);

  try {
    const result = await api.get(
      `/households/${encodeURIComponent(
        household.household_id
      )}/income-proofs`
    );

    setIncomeProofs(
      Array.isArray(result?.images) ? result.images : []
    );
  } catch (err) {
    console.error('Failed to load income proofs:', err);

    toast.error(
      err?.message || 'Failed to load income-proof images.'
    );
  } finally {
    setLoadingProofs(false);
  }
}, [household?.household_id]);

if (!household) {
  return null;
}

  const handleProofSelection = (event) => {
  const files = Array.from(event.target.files || []);

  if (!files.length) {
    setSelectedFiles([]);
    return;
  }

  if (files.length > MAX_FILES) {
    toast.error('You can select a maximum of 5 images at a time.');
    event.target.value = '';
    return;
  }

  const invalidType = files.find(
    (file) => !allowedImageTypes.includes(file.type)
  );

  if (invalidType) {
    toast.error('Only JPG, PNG, and WEBP images are allowed.');
    event.target.value = '';
    return;
  }

  const oversized = files.find(
    (file) => file.size > MAX_FILE_SIZE
  );

  if (oversized) {
    toast.error('Each image must be 5 MB or smaller.');
    event.target.value = '';
    return;
  }

  setSelectedFiles(files);
};

  const uploadIncomeProofs = async () => {
  if (!selectedFiles.length) {
    toast.error('Please select at least one image.');
    return;
  }

  if (!canEdit) {
    toast.error('You do not have permission to upload images.');
    return;
  }

  setUploadingProofs(true);

  try {
    const formData = new FormData();

    selectedFiles.forEach((file) => {
      formData.append('files', file);
    });

    await api.postForm(
      `/households/${encodeURIComponent(
        household.household_id
      )}/income-proofs`,
      formData
    );

    setSelectedFiles([]);

    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }

    toast.success('Income-proof images uploaded successfully.');

    await loadIncomeProofs();
  } catch (err) {
    console.error('Income-proof upload failed:', err);

    toast.error(
      err?.message || 'Failed to upload income-proof images.'
    );
  } finally {
    setUploadingProofs(false);
  }
};
  

  const removeIncomeProof = async (image) => {
  if (!canEdit || !image?.path) return;

  const confirmed = window.confirm(
    'Are you sure you want to remove this income-proof image?'
  );

  if (!confirmed) return;

  try {
    await api.del(
      `/households/${encodeURIComponent(
        household.household_id
      )}/income-proofs`,
      { path: image.path }
    );

    toast.success('Income-proof image removed successfully.');

    await loadIncomeProofs();
  } catch (err) {
    console.error('Failed to remove income proof:', err);

    toast.error(
      err?.message || 'Failed to remove income-proof image.'
    );
  }
};

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

    toast.error(
      err?.message || 'Failed to validate household.'
    );
  }
};

  const programs = normalizeSuggestedPrograms(
  household.suggested_programs
);

    const formatDate = (value) => {
  if (!value) return '—';
  return String(value).split('T')[0];
};

  const householdFields = [
    ['Surname', household.surname],
    ['Given Name', household.given_name],
    ['Middle Name', household.middle_name],
    ['Family Size', totalFamilySize],
    ['Gender', household.sex],
    ['Age', household.age],
    ['Birthday', formatDate(household.birthday)],
    ['Civil Status', household.civil_status],
    ['Education', household.highest_education],
    ['Occupation', household.occupation],
    [
      'Monthly Income',
      household.monthly_income != null
        ? `₱${Number(
            household.monthly_income
          ).toLocaleString('en-PH')}`
        : '—',
    ],
    [
      'Disability',
      household.disability_present || 'Not specified',
    ],
    ['Residence', household.residence],
    [
      'Household Status',
      household.household_status || 'Active',
    ],
    [
      'Length of Residency',
      household.length_residency != null
        ? `${household.length_residency} years`
        : '—',
    ],
    ['Contact', household.contact_number],
    ['Religion', household.religion],
  ];


  return (
    <div
      className="fixed inset-0 bg-black/40 flex justify-end z-50"
      onClick={onClose}
    >
      <div
        className="bg-white w-full max-w-lg h-full overflow-auto p-6"
        onClick={(event) => event.stopPropagation()}
      >
        {/* Header */}
        <div className="flex justify-between items-start gap-3">
          <div>
            <h2 className="text-2xl font-bold text-ink">
              {household.household_head_name ||
                `${household.surname || ''} ${household.given_name || ''}`.trim() ||
                'Household Details'}
            </h2>

            <p className="text-xl text-muted mt-1">
              {household.address || 'No address recorded'}
              {' · '}Purok {household.purok || '—'}
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600"
            aria-label="Close household details"
          >
            ✕
          </button>
        </div>

        {/* Household Information */}
        <section className="mt-5">
          <h3 className="font-bold text-lg mb-3">
            Household Information
          </h3>

          <div className="grid grid-cols-2 gap-3 text-xl">
            {householdFields.map(([label, value]) => (
              <div
                key={label}
                className="border border-gray-100 rounded-lg p-3"
              >
                <div className="text-gray-500">{label}</div>
                <div className="text-ink font-medium mt-1">
                  {value ?? '—'}
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* ML Classification */}
        <section className="mt-5 rounded-lg bg-maroon p-4 text-white">
          <div className="flex items-center justify-between gap-3">
            <span className="text-lg font-semibold">
              ML Classification
            </span>

            <Badge tone={statusTone(household.vulnerability)}>
              {household.vulnerability || 'Unclassified'}
            </Badge>
          </div>

          <div className="text-lg text-red-200 mt-2">
            Probability:{' '}
            {household.vulnerability_prob != null
              ? `${(
                  Number(household.vulnerability_prob) * 100
                ).toFixed(1)}%`
              : '—'}
          </div>

          <div className="text-xl mt-3 font-semibold">
            Suggested Programs
          </div>

          <div className="mt-2 space-y-3">
  {programs.length > 0 ? (
    programs.map((program, index) => (
      <div
        key={`${program.program_name}-${index}`}
        className="rounded-lg bg-white/10 border border-white/20 p-3"
      >
        <div className="font-semibold text-white">
          {program.program_name}
        </div>

        {program.description && (
          <p className="text-sm text-red-100 mt-1">
            {program.description}
          </p>
        )}
      </div>
    ))
  ) : (
    <p className="text-red-200">
      No suggested programs.
    </p>
  )}
</div>
        </section>

        {/* Income Proof Images */}
<section className="mt-6">
  <div className="flex items-center justify-between gap-3 mb-3">
    <div>
      <h3 className="font-bold text-lg">
        Household Income Proof
      </h3>
      <p className="text-sm text-gray-700">
        Supporting income documents and images
      </p>
    </div>

    <Badge>
      {incomeProofs.length} image(s)
    </Badge>
  </div>

  {canEdit && (
    <div className="border border-dashed border-gray-300 rounded-lg p-4">
      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        multiple
        onChange={handleProofSelection}
        className="block w-full text-lg"
      />

      <p className="text-sm text-gray-500 mt-2">
        JPG, PNG, or WEBP. Maximum 5 images per upload.
      </p>

      {selectedFiles.length > 0 && (
        <div className="mt-3 space-y-2">
          <p className="font-medium text-lg">
            Selected images ({selectedFiles.length})
          </p>

          {selectedFiles.map((file, index) => (
            <div
              key={`${file.name}-${index}`}
              className="text-sm text-gray-600 flex justify-between"
            >
              <span className="truncate">{file.name}</span>
              <span>
                {(file.size / 1024 / 1024).toFixed(2)} MB
              </span>
            </div>
          ))}

          <Button
            onClick={uploadIncomeProofs}
            disabled={uploadingProofs}
          >
            {uploadingProofs
              ? 'Uploading...'
              : 'Upload Images'}
          </Button>
        </div>
      )}
    </div>
  )}


  {loadingProofs ? (
    <p className="text-sm text-gray-500 mt-4">
      Loading income-proof images...
    </p>
  ) : incomeProofs.length > 0 ? (
    <div className="grid grid-cols-2 gap-3 mt-4">
      {incomeProofs.map((image) => (
        <div
          key={image.path}
          className="border rounded-lg overflow-hidden"
        >
          <button
            type="button"
            onClick={() => setPreviewImage(image)}
            className="block w-full"
          >
            <img
              src={image.url}
              alt="Household income proof"
              className="w-full h-36 object-cover"
            />
          </button>

          <div className="p-2 flex justify-between items-center gap-2">
            <span className="text-sm text-gray-500 truncate">
              {image.name || 'Income proof'}
            </span>

            {canEdit && (
              <button
                type="button"
                onClick={() => removeIncomeProof(image)}
                className="text-red-600 text-sm hover:underline"
              >
                Remove
              </button>
            )}
          </div>
        </div>
      ))}
    </div>
  ) : (
    <p className="text-sm text-gray-400 mt-4">
      No income-proof images uploaded.
    </p>
  )}
</section>

{/* Full Image Preview */}
{previewImage && (
  <div
    className="fixed inset-0 z-[70] bg-black/80 flex items-center justify-center p-4"
    onClick={() => setPreviewImage(null)}
  >
    <div
      className="relative max-w-4xl max-h-[90vh]"
      onClick={(event) => event.stopPropagation()}
    >
      <button
        type="button"
        onClick={() => setPreviewImage(null)}
        className="absolute -top-10 right-0 text-white text-2xl"
        aria-label="Close image preview"
      >
        ✕
      </button>

      <img
        src={previewImage.url}
        alt="Income proof preview"
        className="max-w-full max-h-[85vh] object-contain rounded-lg"
      />
    </div>
  </div>
)}

        {/* Household Members */}
        <section className="mt-6">
          <h3 className="font-bold text-lg mb-3">
            Additional Household Members ({members.length})
          </h3>

          <div className="space-y-3">
            {members.map((member) => (
              <div
                key={member.member_id}
                className="border border-gray-200 rounded-lg p-3"
              >
                <div className="font-semibold text-xl">
                  {member.full_name || 'Unnamed member'}
                </div>

                <div className="text-xl text-gray-500 mt-2">
                  Relationship:{' '}
                  {member.relationship_hh || '—'}
                  {' · '} | Age: {member.age ?? '—'}
                </div>

                <div className="grid grid-cols-2 gap-3 mt-3 text-xl">
                  <MemberDetail
                    label="Gender"
                    value={member.sex}
                  />
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
                    value={member.disability_present}
                  />
                  <MemberDetail
                    label="Birthday"
                    value={formatDate(member.birthday)}
                  />

                  <MemberDetail
  label="Monthly Income"
  value={
    member.monthly_income != null
      ? `₱${Number(member.monthly_income).toLocaleString('en-PH')}`
      : '—'
  }
/>
                </div>
              </div>
            ))}

            {!members.length && (
              <p className="text-xl text-gray-400">
                No members recorded.
              </p>
            )}
          </div>
        </section>

        {/* Actions */}
        <div className="mt-6 flex gap-2">
          {user?.roles === 'admin' &&
            household.validation_status === 'Pending' && (
              <Button onClick={validate}>
                Validate Data
              </Button>
            )}

          {canEdit && (
            <Link
              to={`/encode?id=${household.household_id}`}
            >
              <Button variant="outline">Edit</Button>
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}

function MemberDetail({ label, value }) {
  return (
    <div>
      <div className="text-gray-500">{label}</div>
      <div className="text-xl font-medium mt-1">
        {value || '—'}
      </div>
    </div>
  );
}
