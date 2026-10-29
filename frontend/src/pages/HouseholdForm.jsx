import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { api } from '../lib/api';

import {
  PageHeader,
  Input,
  Select,
  Button
} from '../components/ui';


// ============================================================
// OCCUPATIONS THAT HAVE DETAILS
// ============================================================

const OCCUPATIONS_WITH_DETAILS = [
  'Self-employed',
  'Government',
  'Private'
];


// ============================================================
// DEFAULT HOUSEHOLD FORM
// ============================================================

const EMPTY = {
  surname: '',
  given_name: '',
  middle_name: '',

  family_position: '',
  family_number: 1,
  address: '',
  purok: '',
  residence: 'Owned',
  household_status: 'Active',
  length_residency: 0,

  sex: 'male',
  age: '',
  birthday: '',
  birth_place: '',
  blood_type: '',
  civil_status: 'Single',
  disability_present: false,
  disability_details: '',
  leading_illnesses: '',
  highest_education: '',
  occupation: '',
  occupation_details: '',
  business: '',
  contact_number: '',
  religion: '',
  ethnicity: '',
  monthly_income: '',

  with_electricity: '',
  sanitary_toilet: '',
  potable_water_supply: '',
  four_ps_member: '',
  house_owner: '',
  renter: '',
  sharer: '',
  caretaker: '',
  consent: '',

  created_at: '',
};


// ============================================================
// DEFAULT MEMBER FORM
// ============================================================

const EMPTY_MEMBER = {
  full_name: '',
  relationship_hh: '',
  birthday: '',
  age: '',
  sex: 'male',
  civil_status: 'Single',
  education_attainment: '',
  occupation: '',
  occupation_details: '',
  disability_present: ''
};


// ============================================================
// PUROKS
// ============================================================

const PUROKS = [
  ['1', 'Purok 1'],
  ['1-A','Purok 1-A'],
  ['2', 'Purok 2'],
  ['2-A', 'Purok 2-A'],
  ['3', 'Purok 3'],
  ['3-A', 'Purok 3-A'],
  ['4', 'Purok 4'],
  ['5', 'Purok 5'],
  ['5-A', 'Purok 5-A'],
  ['5-B', 'Purok 5-B'],
  ['5-C', 'Purok 5-C'],
  ['6', 'Purok 6'],
  ['6-A', 'Purok 6-A'],
  ['7', 'Purok 7'],
  ['7-A', 'Purok 7-A'],
  ['8', 'Purok 8'],
  ['8-A', 'Purok 8-A'],
  ['9', 'Purok 9'],
  ['9-A', 'Purok 9-A'],
];


// ============================================================
// FORM ROW
// ============================================================

const Row = ({ label, children }) => (
  <div className="flex flex-col gap-1">
    <span className="text-[18px] font-semibold text-gray-700">
      {label}
    </span>

    {children}
  </div>
);

const YesNoUnknown = ({ label, value, onChange }) => (
  <Row label={label}>
    <Select value={value} onChange={onChange}>
      <option value="">Not specified</option>
      <option value="Yes">Yes</option>
      <option value="No">No</option>
    </Select>
  </Row>
);


// ============================================================
// MAIN COMPONENT
// ============================================================

export default function HouseholdForm() {
  const [params] = useSearchParams();

  const editId = params.get('id');

  const navigate = useNavigate();

  const [form, setForm] = useState({ ...EMPTY });
  const [members, setMembers] = useState([]);
  const [member, setMember] = useState({ ...EMPTY_MEMBER });

  const [busy, setBusy] = useState(false);
  const [memberBusy, setMemberBusy] = useState(false);

  const [editingMemberId, setEditingMemberId] = useState(null);


  // ============================================================
  // OCCUPATION DETAILS
  //
  // Each occupation has its own details.
  //
  // Example:
  // Private     -> Construction Worker
  // Government  -> Barangay Employee
  // Self-employed -> Sari-sari Store
  // ============================================================

  const [occupationDetails, setOccupationDetails] = useState({
    'Self-employed': '',
    Government: '',
    Private: '',
  });


  // ============================================================
  // COMMON INPUT CLASS
  // ============================================================

  const textCls =
    'w-full rounded-md border border-gray-300 px-3 py-2 text-lg text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-brand';


  // ============================================================
  // LOAD HOUSEHOLD FOR EDITING
  // ============================================================

  useEffect(() => {
    if (!editId) {
      setForm({ ...EMPTY });
      setMembers([]);

      setOccupationDetails({
        'Self-employed': '',
        Government: '',
        Private: '',
      });

      return;
    }

    const loadHousehold = async () => {
      try {
        const data = await api.get(
          `/households/${editId}`
        );

        const household =
          data?.household || {};

        const loadedMembers =
          Array.isArray(data?.members)
            ? data.members
            : [];


        // --------------------------------------------------------
        // LOAD OCCUPATION DETAILS
        //
        // Important:
        // The saved detail belongs to the currently selected
        // occupation.
        // --------------------------------------------------------

        const loadedOccupation =
          household.occupation ?? '';

        const loadedOccupationDetails =
          household.occupation_details ?? '';


        setForm({
          surname: household.surname ?? '',
          given_name: household.given_name ?? '',
          middle_name: household.middle_name ?? '',
          birth_place: household.birth_place ?? '',
          blood_type: household.blood_type ?? '',
          disability_details: household.disability_details ?? '',
          leading_illnesses: household.leading_illnesses ?? '',
          ethnicity: household.ethnicity ?? '',
          business: household.business ?? '',

          with_electricity: household.with_electricity ?? '',
          sanitary_toilet: household.sanitary_toilet ?? '',
          potable_water_supply: household.potable_water_supply ?? '',
          four_ps_member: household.four_ps_member ?? '',
          house_owner: household.house_owner ?? '',
          renter: household.renter ?? '',
          sharer: household.sharer ?? '',
          caretaker: household.caretaker ?? '',
          consent: household.consent ?? '',

          family_position:
            household.family_position ?? '',

          family_number:
            household.family_number ?? 1,

          address:
            household.address ?? '',

          purok:
            household.purok ?? '',

          residence:
            household.residence ?? 'Owned',

          length_residency:
            household.length_residency ?? 0,

          household_status:
            household.household_status ?? 'Active',

          sex:
            household.sex ?? 'male',

          age:
            household.age ?? '',

          birthday:
            household.birthday
              ? String(
                  household.birthday
                ).slice(0, 10)
              : '',

          civil_status:
            household.civil_status ?? 'Single',

          disability_present:
            household.disability_present === true ||
            String(household.disability_present).toLowerCase() === 'true' ||
            String(household.disability_present) === '1',

          highest_education:
            household.highest_education ?? '',

          occupation:
            loadedOccupation,

          occupation_details:
            loadedOccupationDetails,

          contact_number:
            household.contact_number ?? '',

          religion:
            household.religion ?? '',

          monthly_income:
            household.monthly_income ?? '',

          created_at:
            household.created_at ?? ''
        });


        // --------------------------------------------------------
        // Put the saved detail into the correct occupation.
        // --------------------------------------------------------

        setOccupationDetails({
          'Self-employed':
            loadedOccupation === 'Self-employed'
              ? loadedOccupationDetails
              : '',

          Government:
            loadedOccupation === 'Government'
              ? loadedOccupationDetails
              : '',

          Private:
            loadedOccupation === 'Private'
              ? loadedOccupationDetails
              : '',
        });


        setMembers(loadedMembers);

      } catch (err) {
        toast.error(
          err?.response?.data?.error ||
          err?.message ||
          'Failed to load household.'
        );
      }
    };

    loadHousehold();
  }, [editId]);


  // ============================================================
  // HOUSEHOLD INPUT HANDLER
  // ============================================================

  const set = (key) => (event) => {
    const value = event.target.value;

    setForm((previous) => ({
      ...previous,
      [key]: value
    }));
  };


  // ============================================================
  // MEMBER INPUT HANDLER
  // ============================================================

  const setM = (key) => (event) => {
    const value = event.target.value;

    setMember((previous) => ({
      ...previous,
      [key]: value
    }));
  };


  // ============================================================
  // HOUSEHOLD OCCUPATION CHANGE
  // ============================================================

  const handleOccupationChange = (event) => {
    const occupation = event.target.value;

    setForm((previous) => ({
      ...previous,
      occupation,
      occupation_details:
        OCCUPATIONS_WITH_DETAILS.includes(occupation)
          ? occupationDetails[occupation] || ''
          : ''
    }));
  };


  // ============================================================
  // HOUSEHOLD OCCUPATION DETAILS CHANGE
  // ============================================================

  const handleOccupationDetailsChange = (event) => {
    const value = event.target.value;

    const occupation = form.occupation;

    if (!OCCUPATIONS_WITH_DETAILS.includes(occupation)) {
      return;
    }

    // Save details separately for the selected occupation.
    setOccupationDetails((previous) => ({
      ...previous,
      [occupation]: value
    }));

    // Also keep form state synchronized.
    setForm((previous) => ({
      ...previous,
      occupation_details: value
    }));
  };


  // ============================================================
  // ADD MEMBER
  // ============================================================

  
const addMember = async () => {
  if (!member.full_name.trim()) {
    toast.error('Please enter the member full name.');
    return;
  }

  setMemberBusy(true);

  try {
    const occupation = member.occupation?.trim() || '';

    const payload = {
      full_name: member.full_name.trim(),
      relationship_hh: member.relationship_hh || null,
      birthday: member.birthday || null,
      age: member.age === '' ? null : Number(member.age),
      sex: member.sex || null,
      civil_status: member.civil_status || null,
      education_attainment: member.education_attainment || null,
      occupation,
      occupation_details:
        OCCUPATIONS_WITH_DETAILS.includes(occupation)
          ? member.occupation_details?.trim() || ''
          : '',
      disability_present: member.disability_present || null,
    };

    if (editingMemberId) {
      // Update an existing saved member.
      const response = await api.put(
        `/households/members/${editingMemberId}`,
        payload
      );

      const updatedMember = response?.member || {
        ...payload,
        member_id: editingMemberId,
      };

      setMembers((previous) =>
        previous.map((item) =>
          String(item.member_id) === String(editingMemberId)
            ? { ...item, ...updatedMember }
            : item
        )
      );

      toast.success('Household member updated.');
    } else if (editId) {
      // Add a member to an existing household.
      const response = await api.post(
        `/households/${editId}/members`,
        payload
      );

      if (!response?.member) {
        throw new Error('The server did not return the saved member.');
      }

      setMembers((previous) => [...previous, response.member]);
      toast.success('Household member added.');
    } else {
      // Keep the member temporarily until the new household is saved.
      setMembers((previous) => [
        ...previous,
        {
          ...payload,
          member_id: `temp-${Date.now()}-${previous.length}`,
        },
      ]);

      toast.success('Member added to the form.');
    }

    setMember({ ...EMPTY_MEMBER });
    setEditingMemberId(null);
  } catch (err) {
    console.error('Failed to save household member:', err);
    toast.error(err?.message || 'Failed to save household member.');
  } finally {
    setMemberBusy(false);
  }
};


const editMember = (item) => {
  setMember({
    full_name: item.full_name || '',
    relationship_hh: item.relationship_hh || '',
    birthday: item.birthday
      ? String(item.birthday).slice(0, 10)
      : '',
    age: item.age ?? '',
    sex: item.sex || '',
    civil_status: item.civil_status || '',
    education_attainment: item.education_attainment || '',
    occupation: item.occupation || '',
    occupation_details: item.occupation_details || '',
    disability_present: item.disability_present || '',
  });

  // Temporary members are edited locally, not through the API.
  setEditingMemberId(
    String(item.member_id).startsWith('temp-')
      ? null
      : item.member_id
  );

  // Remember which temporary member is being edited.
  setEditingTemporaryMemberId(
    String(item.member_id).startsWith('temp-')
      ? item.member_id
      : null
  );
};

const [editingTemporaryMemberId, setEditingTemporaryMemberId] =
  useState(null);

const deleteMember = async (item) => {
  const confirmed = window.confirm(
    `Delete household member "${item.full_name || 'Unnamed member'}"?`
  );

  if (!confirmed) return;

  try {
    const isTemporary = String(item.member_id).startsWith('temp-');

    if (!isTemporary) {
      await api.delete(`/households/members/${item.member_id}`);
    }

    setMembers((previous) =>
      previous.filter(
        (m) => String(m.member_id) !== String(item.member_id)
      )
    );

    if (
      String(editingMemberId) === String(item.member_id) ||
      editingTemporaryMemberId === item.member_id
    ) {
      setMember({ ...EMPTY_MEMBER });
      setEditingMemberId(null);
      setEditingTemporaryMemberId(null);
    }

    toast.success('Household member deleted.');
  } catch (err) {
    console.error('Failed to delete household member:', err);
    toast.error(err?.message || 'Failed to delete household member.');
  }
};



  // ============================================================
  // SAVE HOUSEHOLD
  // ============================================================

  const save = async (event) => {
    event.preventDefault();

    setBusy(true);

    try {

      // --------------------------------------------------------
      // VALIDATION
      // --------------------------------------------------------

      if (!form.surname.trim()) {
        toast.error(
          'Please enter the household head name.'
        );

        setBusy(false);
        return;
      }


      if (!form.address.trim()) {
        toast.error(
          'Please enter the household address.'
        );

        setBusy(false);
        return;
      }


      if (!form.purok) {
        toast.error(
          'Please select a Purok.'
        );

        setBusy(false);
        return;
      }


      // --------------------------------------------------------
      // OCCUPATION
      // --------------------------------------------------------

      const selectedOccupation =
        form.occupation?.trim() || '';


      const selectedOccupationDetails =
        OCCUPATIONS_WITH_DETAILS.includes(
          selectedOccupation
        )
          ? occupationDetails[selectedOccupation]
              ?.trim() || ''
          : '';


          // --------------------------------------------------------
// CHECK FOR DUPLICATE HOUSEHOLD
// --------------------------------------------------------


const duplicateCheck = await api.post('/households/check-duplicate', {
  surname: form.surname.trim(),
  given_name: form.given_name.trim(),
  middle_name: form.middle_name.trim(),
  address: form.address.trim(),
  purok: form.purok,
  exclude_household_id: editId || null,
});

if (duplicateCheck?.duplicate) {
  toast.error('This household has already been entered!', {
    duration: 5000,
  });
  return;
}


      // --------------------------------------------------------
      // DATABASE PAYLOAD
      // --------------------------------------------------------

      const payload = {

        surname: form.surname.trim() || null,
        given_name: form.given_name.trim() || null,
        middle_name: form.middle_name.trim() || null,
        birth_place: form.birth_place.trim() || null,
        blood_type: form.blood_type || null,
        disability_details: form.disability_details.trim() || null,
        leading_illnesses: form.leading_illnesses.trim() || null,
        ethnicity: form.ethnicity.trim() || null,
        business: form.business.trim() || null,

        with_electricity: form.with_electricity || null,
        sanitary_toilet: form.sanitary_toilet || null,
        potable_water_supply: form.potable_water_supply || null,
        four_ps_member: form.four_ps_member || null,
        house_owner: form.house_owner || null,
        renter: form.renter || null,
        sharer: form.sharer || null,
        caretaker: form.caretaker || null,
        consent: form.consent || null,

        family_position:
          form.family_position.trim() || null,

        family_number:
          form.family_number === '' ||
          form.family_number == null
            ? 1
            : Number(form.family_number),

        address:
          form.address.trim(),

        purok:
          form.purok,

        residence:
          form.residence || 'Owned',

        length_residency:
          form.length_residency === '' ||
          form.length_residency == null
            ? null
            : Number(form.length_residency),

        household_status:
          form.household_status || 'Active',

        sex:
          form.sex || 'male',

        age:
          form.age === '' ||
          form.age == null
            ? null
            : Number(form.age),

        birthday:
          form.birthday || null,

        civil_status:
          form.civil_status || 'Single',

        disability_present: 
          Boolean(form.disability_present),

        highest_education:
          form.highest_education || null,

        occupation:
          selectedOccupation,

        occupation_details:
          selectedOccupationDetails,

        contact_number:
          form.contact_number.trim() || null,

        religion:
          form.religion.trim() || null,

        monthly_income:
          form.monthly_income === '' ||
          form.monthly_income == null
            ? null
            : Number(form.monthly_income)
        
      };


      // --------------------------------------------------------
      // SAVE HOUSEHOLD
      // --------------------------------------------------------

      let householdId = editId;


      if (editId) {

        await api.put(
          `/households/${editId}`,
          payload
        );

      } else {

        const result = await api.post(
          '/households',
          payload
        );

        householdId =
          result?.household?.household_id ||
          result?.household_id ||
          result?.id;
      }


      // --------------------------------------------------------
      // CHECK HOUSEHOLD ID
      // --------------------------------------------------------

      if (!householdId) {
        throw new Error(
          'Household was saved, but no household ID was returned by the server.'
        );
      }


      // --------------------------------------------------------
      // SAVE TEMPORARY MEMBERS
      // --------------------------------------------------------

      if (
        !editId &&
        members.length > 0
      ) {

        for (const currentMember of members) {

          const {
            member_id,
            ...memberData
          } = currentMember;


          const memberOccupation =
            memberData.occupation?.trim() || '';


          const memberPayload = {

            full_name:
              memberData.full_name?.trim(),

            relationship_hh:
              memberData.relationship_hh?.trim() ||
              null,

            birthday:
              memberData.birthday || null,

            age:
              memberData.age === '' ||
              memberData.age == null
                ? null
                : Number(memberData.age),

            sex:
              memberData.sex || 'male',

            civil_status:
              memberData.civil_status ||
              'Single',

            education_attainment:
              memberData.education_attainment?.trim() ||
              null,

            occupation:
              memberOccupation,

            occupation_details:
              OCCUPATIONS_WITH_DETAILS.includes(
                memberOccupation
              )
                ? memberData.occupation_details?.trim() || ''
                : '',

            disability_present:
              memberData.disability_present?.trim() ||
              null
          };


          await api.post(
            `/households/${householdId}/members`,
            memberPayload
          );
        }
      }


      // --------------------------------------------------------
      // SUCCESS
      // --------------------------------------------------------

      toast.success(
        editId
          ? 'Household information updated successfully.'
          : 'Household successfully saved.'
      );


      navigate('/households');

    } catch (err) {

      toast.error(
        err?.response?.data?.error ||
        err?.message ||
        'Failed to save household.'
      );

    } finally {
      setBusy(false);
    }
  };


  // ============================================================
  // RENDER
  // ============================================================

  return (
    <form
      onSubmit={save}
      className="space-y-6 max-w-8xl mx-auto"
    >

      {/* ======================================================
          PAGE HEADER
      ====================================================== */}

      <div className="mt-5 pt-5">

        <PageHeader
          title="Household & Residence Information"
          subtitle={
            editId
              ? 'Update household and residence information.'
              : 'Input household and residence information into the system.'
          }
        />

      </div>


      {/* ======================================================
          MAIN CONTAINER
      ====================================================== */}

      <div className="bg-gray-290 rounded-lg border border-gray-300 shadow-sm p-10">

        {/* ====================================================
            HOUSEHOLD INFORMATION
        ==================================================== */}

        <div className="bg-white rounded-lg border-r-5 border-b-5 border-gray-300 shadow-xl p-6">

          <div className="grid md:grid-cols-2 gap-x-10 gap-y-5">

            <Row label="Surname">
              <input
                className={textCls}
                value={form.surname}
                onChange={set('surname')}
              />
            </Row>

            <Row label="Given Name">
              <input
                className={textCls}
                value={form.given_name}
                onChange={set('given_name')}
                required
              />
            </Row>

            <Row label="Middle Name">
              <input
                className={textCls}
                value={form.middle_name}
                onChange={set('middle_name')}
              />
            </Row>

            <Row label="Birth Place">
              <input
                className={textCls}
                value={form.birth_place}
                onChange={set('birth_place')}
              />
            </Row>

            <Row label="Blood Type">
              <Select
                value={form.blood_type}
                onChange={set('blood_type')}
              >
                <option value="">Select Blood Type</option>
                {['A', 'A+', 'A-', 'B', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-', 'O', 'Unknown'].map(
                  (value) => (
                    <option key={value} value={value}>{value}</option>
                  )
                )}
              </Select>
            </Row>


            <Row label="Family Position">
              <input
                className={textCls}
                value={form.family_position}
                onChange={set('family_position')}
              />
            </Row>


            <Row label="Address">
              <input
                className={textCls}
                value={form.address}
                onChange={set('address')}
                required
              />
            </Row>


            <Row label="Family Number">
              <input
                className={textCls}
                type="number"
                min="1"
                value={form.family_number}
                onChange={set('family_number')}
                required
              />
            </Row>


            <Row label="Purok">
              <Select
                value={form.purok}
                onChange={set('purok')}
                required
              >

                <option value="">
                  Select Purok
                </option>

                {PUROKS.map(
                  ([value, label]) => (
                    <option
                      key={value}
                      value={value}
                    >
                      {label}
                    </option>
                  )
                )}

              </Select>
            </Row>


            <Row label="Length Residency (years)">
              <input
                className={textCls}
                type="number"
                min="0"
                value={form.length_residency}
                onChange={set('length_residency')}
              />
            </Row>


            <Row label="Residence">

              <div className="flex gap-6 text-lg text-gray-800">

                {[
                  'Owned',
                  'Rent',
                  'Living with relatives'
                ].map((residence) => (

                  <label
                    key={residence}
                    className="flex items-center gap-2"
                  >

                    <input
                      type="radio"
                      name="residence"
                      value={residence}
                      checked={
                        form.residence === residence
                      }
                      onChange={set('residence')}
                      className="accent-brand"
                    />

                    {residence}

                  </label>

                ))}

              </div>

            </Row>


            <Row label="Household Status">

              <div className="flex items-center gap-8 text-lg text-gray-800">

                <label className="flex items-center gap-2 cursor-pointer">

                  <input
                    type="radio"
                    name="household_status"
                    value="Active"
                    checked={
                      form.household_status === 'Active'
                    }
                    onChange={set('household_status')}
                    className="accent-[#6E2430]"
                  />

                  Active

                </label>


                <label className="flex items-center gap-2 cursor-pointer">

                  <input
                    type="radio"
                    name="household_status"
                    value="Inactive"
                    checked={
                      form.household_status === 'Inactive'
                    }
                    onChange={set('household_status')}
                    className="accent-[#6E2430]"
                  />

                  Inactive

                </label>

              </div>

            </Row>


            <Row label="Gender">

              <div className="flex gap-6 text-lg text-gray-800">

                {[
                  'female',
                  'male'
                ].map((gender) => (

                  <label
                    key={gender}
                    className="flex items-center gap-2"
                  >

                    <input
                      type="radio"
                      name="sex"
                      value={gender}
                      checked={
                        form.sex === gender
                      }
                      onChange={set('sex')}
                      className="accent-brand"
                    />

                    {gender
                      .charAt(0)
                      .toUpperCase() +
                      gender.slice(1)}

                  </label>

                ))}

              </div>

            </Row>


            <Row label="Date of Birth">

              <input
                className={textCls}
                type="date"
                value={form.birthday}
                onChange={set('birthday')}
              />

            </Row>


            <Row label="Age">

              <input
                className={textCls}
                type="number"
                min="0"
                max="120"
                value={form.age}
                onChange={set('age')}
              />

            </Row>


            <Row label="Status">

              <Select
                value={form.civil_status}
                onChange={set('civil_status')}
              >

                <option value="Single">
                  Single
                </option>

                <option value="Married">
                  Married
                </option>

                <option value="Widowed">
                  Widowed
                </option>

                <option value="Separated">
                  Separated
                </option>

                <option value="Live-in">
                  Live-in
                </option>

              </Select>

            </Row>



<Row label="Disability Present">
  <Select
    value={form.disability_present ? 'Yes' : 'No'}
    onChange={(event) => {
      const hasDisability = event.target.value === 'Yes';

      setForm((prev) => ({
        ...prev,
        disability_present: hasDisability,
        disability_details: hasDisability
          ? prev.disability_details || ''
          : '',
      }));
    }}
    required
  >
    <option value="Yes">Yes</option>
    <option value="No">No</option>
  </Select>
</Row>

{form.disability_present && (
  <Row label="Disability Details">
    <input
      type="text"
      className={textCls}
      value={form.disability_details || ''}
      onChange={(event) =>
        setForm((prev) => ({
          ...prev,
          disability_details: event.target.value,
        }))
      }
      placeholder="Enter disability details"
      required
    />
  </Row>
)}



            <Row label="Leading Illnesses">
              <input
                className={textCls}
                value={form.leading_illnesses}
                onChange={set('leading_illnesses')}
                placeholder="Optional; enter only if reported"
              />
            </Row>

            <Row label="Ethnicity">
              <input
                className={textCls}
                value={form.ethnicity}
                onChange={set('ethnicity')}
              />
            </Row>

            <Row label="Business">
              <input
                className={textCls}
                value={form.business}
                onChange={set('business')}
                placeholder="Business or livelihood, if any"
              />
            </Row>


            <Row label="Education">

              <Select
                value={form.highest_education}
                onChange={set('highest_education')}
              >

                <option value="">
                  Select Education
                </option>

                <option value="None">
                  None
                </option>

                <option value="Elementary Level">
                  Elementary Level
                </option>

                <option value="Junior High Level">
                  Junior High Level 
                </option>

                <option value="Senior High School Level">
                  Senior High School Level
                </option>

                <option value="Senior High Graduate">
                  Senior High Graduate
                </option>

                <option value="ALS">
                  Alternative Learning System
                </option>

                <option value="Vocational">
                  Vocational
                </option>

                <option value="College Level">
                  College Level
                </option>

                <option value="College Graduate">
                  College Graduate
                </option>

                <option value="Master's Degree">
                  Master's Degree
                </option>

              </Select>

            </Row>


            <Row label="Contact Number">

              <input
                className={textCls}
                value={form.contact_number}
                onChange={set('contact_number')}
              />

            </Row>


            {/* ==================================================
                OCCUPATION
            ================================================== */}

            <Row label="Occupation">

              <Select
                value={form.occupation}
                onChange={handleOccupationChange}
                required
              >

                <option value="">
                  Select Occupation
                </option>

                <option value="Unemployed">
                  Unemployed
                </option>

                <option value="Self-employed">
                  Self-employed
                </option>

                <option value="Government">
                  Government Employee
                </option>

                <option value="Private">
                  Private Employee
                </option>

              </Select>

            </Row>


            {/* ==================================================
                OCCUPATION DETAILS
            ================================================== */}

            {OCCUPATIONS_WITH_DETAILS.includes(
              form.occupation
            ) && (

              <Row
                label={
                  form.occupation === 'Self-employed'
                    ? 'Self-employed'
                    : form.occupation === 'Government'
                    ? 'Government Position'
                    : 'Private Position'
                }
              >

                <input
                  type="text"
                  className={textCls}
                  value={
                    occupationDetails[
                      form.occupation
                    ] || ''
                  }
                  onChange={
                    handleOccupationDetailsChange
                  }
                />

              </Row>

            )}


            <Row label="Religion">

              <input
                className={textCls}
                value={form.religion}
                onChange={set('religion')}
              />

            </Row>

            <YesNoUnknown
              label="With Electricity"
              value={form.with_electricity}
              onChange={set('with_electricity')}
            />

            <YesNoUnknown
              label="Sanitary Toilet"
              value={form.sanitary_toilet}
              onChange={set('sanitary_toilet')}
            />

            <YesNoUnknown
              label="Potable Water Supply"
              value={form.potable_water_supply}
              onChange={set('potable_water_supply')}
            />

            <YesNoUnknown
              label="4Ps Member"
              value={form.four_ps_member}
              onChange={set('four_ps_member')}
            />

            <YesNoUnknown
              label="House Owner"
              value={form.house_owner}
              onChange={set('house_owner')}
            />

            <YesNoUnknown
              label="Renter"
              value={form.renter}
              onChange={set('renter')}
            />

            <YesNoUnknown
              label="Sharer"
              value={form.sharer}
              onChange={set('sharer')}
            />

            <YesNoUnknown
              label="Caretaker"
              value={form.caretaker}
              onChange={set('caretaker')}
            />

            <YesNoUnknown
              label="Consent"
              value={form.consent}
              onChange={set('consent')}
            />


            <Row label="Monthly Income">

              <input
                className={textCls}
                type="number"
                min="0"
                step="0.01"
                value={form.monthly_income}
                onChange={set('monthly_income')}
              />

            </Row>

          </div>

        </div>


        {/* ====================================================
            HOUSEHOLD MEMBERS
        ==================================================== */}

<div className="bg-white rounded-lg border border-gray-200 shadow-sm p-6 mt-6">
  <h3 className="text-lg font-bold text-ink mb-4">
    Household Members
  </h3>

  <div className="grid md:grid-cols-3 gap-3 mb-3">
    <Input
      label="Full Name"
      value={member.full_name || ''}
      onChange={setM('full_name')}
    />

    <Input
      label="Relationship"
      value={member.relationship_hh || ''}
      onChange={setM('relationship_hh')}
    />

    <Input
      label="Age"
      type="number"
      min="0"
      max="120"
      value={member.age ?? ''}
      onChange={setM('age')}
    />

      <Input
      label="BirthDate"
      value={member.birthday || ''}
      onChange={setM('birthday')}
    />
    

    {/* Sex */}
    <div>
      <label className="block text-xl text-gray-700 font-bold mb-1">
        Gender
      </label>
      <select
        className="w-full border border-gray-300 rounded-md px-3 py-2 text-xl"
        value={member.sex || ''}
        onChange={setM('sex')}
      >
        <option value="">Select gender</option>
        <option value="male">Male</option>
        <option value="female">Female</option>
      </select>
    </div>

    {/* Civil Status */}
    <div>
      <label className="block text-xl text-gray-700 font-bold mb-1">
        Civil Status
      </label>
      <select
        className="w-full border border-gray-300 rounded-md px-3 py-2 text-xl"
        value={member.civil_status || ''}
        onChange={setM('civil_status')}
      >
        <option value="">Select civil status</option>
        <option value="Single">Single</option>
        <option value="Married">Married</option>
        <option value="Widowed">Widowed</option>
        <option value="Separated">Separated</option>
        <option value="Divorced">Divorced</option>
        <option value="Live-in">Live-in</option>
      </select>
    </div>

    {/* Educational Attainment */}
    <div>
      <label className="block text-xl text-gray-700 font-bold mb-1">
        Educational Attainment
      </label>
      <select
        className="w-full border border-gray-300 rounded-md px-3 py-2 text-xl"
        value={member.education_attainment || ''}
        onChange={setM('education_attainment')}
      >
                <option value="">
                  Select Education
                </option>

                <option value="None">
                  None
                </option>

                <option value="Elementary Level">
                  Elementary Level
                </option>

                <option value="Junior High Level">
                  Junior High Level 
                </option>

                <option value="Senior High School Level">
                  Senior High School Level
                </option>

                <option value="Senior High Graduate">
                  Senior High Graduate
                </option>

                <option value="ALS">
                  Alternative Learning System
                </option>

                <option value="Vocational">
                  Vocational
                </option>

                <option value="College Level">
                  College Level
                </option>

                <option value="College Graduate">
                  College Graduate
                </option>

                <option value="Master's Degree">
                  Master's Degree
                </option>
      </select>
    </div>

    {/* Occupation */}
    <Input
      label="Occupation"
      value={member.occupation || ''}
      onChange={setM('occupation')}
    />

    {/* Disability */}
    <div>
      <label className="block text-xl text-gray-700 font-bold mb-1">
        Disability
      </label>
      <select
        className="w-full border border-gray-300 rounded-md px-3 py-2 text-xl"
        value={member.disability_present || ''}
        onChange={setM('disability_present')}
      >
        <option value="">Not specified</option>
        <option value="No">No</option>
        <option value="Yes">Yes</option>
      </select>
    </div>

    {/* Add Member Button */}
    <div className="flex items-end">
      <Button
  type="button"
  variant="outline"
  onClick={addMember}
  disabled={memberBusy}
>
  {memberBusy
    ? 'Saving…'
    : editingMemberId || editingTemporaryMemberId
      ? 'Save Member Changes'
      : '+ Add Member'}
</Button>

{(editingMemberId || editingTemporaryMemberId) && (
  <Button
    type="button"
    variant="outline"
    onClick={() => {
      setMember({ ...EMPTY_MEMBER });
      setEditingMemberId(null);
      setEditingTemporaryMemberId(null);
    }}
  >
    Cancel Edit
  </Button>
)}
    </div>
  </div>

  {members.length > 0 && (
    <ul className="mt-3 space-y-2 text-base">
      {members.map((m) => (
        
<li
  key={m.member_id}
  className="border border-gray-100 rounded px-3 py-3 text-muted"
>
  <div className="flex items-start justify-between gap-3">
    <div className="min-w-0">
      <strong className="text-ink">
        {m.full_name || 'Unnamed member'}
      </strong>

      <div className="text-sm text-gray-600 mt-1">
        Relationship: {m.relationship_hh || '—'} ·
        Age: {m.age ?? '—'} ·
        Sex: {m.sex || '—'} ·
        Civil Status: {m.civil_status || '—'}
      </div>

      <div className="text-sm text-gray-600">
        Education: {m.education_attainment || '—'} ·
        Occupation: {m.occupation || '—'} ·
        Disability: {m.disability_present || 'Not specified'}
      </div>
    </div>

    <div className="flex shrink-0 gap-2">
      <Button
        type="button"
        variant="outline"
        onClick={() => editMember(m)}
      >
        Edit
      </Button>

      <Button
        type="button"
        variant="outline"
        onClick={() => deleteMember(m)}
      >
        Delete
      </Button>
    </div>
  </div>
</li>

      ))}
    </ul>
  )}
</div>


        {/* ====================================================
            BUTTONS
        ==================================================== */}

        <div className="flex gap-2 justify-end mt-6">

          <Button
            type="button"
            variant="outline"
            onClick={() =>
              navigate('/households')
            }
            disabled={busy}
          >
            Cancel
          </Button>


          <Button
            type="submit"
            disabled={busy}
          >

            {busy
              ? 'Saving…'
              : editId
                ? 'Save Changes'
                : 'Save'}

          </Button>

        </div>

      </div>

    </form>
  );
}