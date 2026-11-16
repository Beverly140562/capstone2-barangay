import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../lib/api';

import { PageHeader, Band, Table, Status, Spinner } from '../components/ui';

import {
  Edit,
  Eye,
  EyeOff,
  RefreshCw,
  Search,
  ShieldCheck,
  Trash2,
  UserCheck,
  UserKey,
  UserLock,
  UserX,
  Users as UsersIcon,
  X,
} from 'lucide-react';

/* ======================================================
   CONSTANTS + STYLE HELPERS
   ====================================================== */

const EMPTY_FORM = {
  full_name: '',
  username: '',
  email: '',
  password: '',
  roles: 'staff',
};

const ROLE_TABS = [
  ['all', 'All'],
  ['admin', 'Admin'],
  ['captain', 'Captain'],
  ['staff', 'Staff'],
];

const fieldClass =
  'w-full rounded-xl border border-gray-300 bg-white px-4 py-3 text-xl text-gray-900 ' +
  'placeholder:text-gray-400 transition focus:border-[#6E2430] focus:outline-none ' +
  'focus:ring-4 focus:ring-[#6E2430]/15';

const th = 'px-4 py-3 text-xl font-bold text-[#6E2430] whitespace-nowrap';

const PILL_TONES = {
  red: 'bg-red-50 text-red-700 ring-red-200',
  amber: 'bg-amber-50 text-amber-700 ring-amber-200',
  green: 'bg-green-50 text-green-700 ring-green-200',
  blue: 'bg-blue-50 text-blue-700 ring-blue-200',
  maroon: 'bg-[#FFF0F0] text-[#6E2430] ring-[#F3D3D6]',
  gray: 'bg-gray-100 text-gray-600 ring-gray-200',
};

function toneForRole(role) {
  const r = String(role || '').toLowerCase();
  if (r === 'admin') return 'maroon';
  if (r === 'captain') return 'blue';
  return 'gray';
}

function toneForAction(action) {
  const a = String(action || '').toLowerCase();
  if (a.includes('delete') || a.includes('remove') || a.includes('deactivat') || a.includes('reject')) return 'red';
  if (a.includes('create') || a.includes('add') || a.includes('activat') || a.includes('approve')) return 'green';
  if (a.includes('update') || a.includes('edit') || a.includes('change')) return 'amber';
  if (a.includes('login') || a.includes('logout')) return 'blue';
  return 'maroon';
}

function initialsOf(name) {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  return (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
}

function formatDate(date) {
  if (!date) return '—';

  const parsed = new Date(date);
  if (Number.isNaN(parsed.getTime())) return '—';

  return parsed.toLocaleString('en-PH', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

/* ======================================================
   SMALL COMPONENTS
   ====================================================== */

function Pill({ tone = 'gray', children }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-3 py-1 text-xl font-semibold capitalize ring-1 ring-inset ${
        PILL_TONES[tone] || PILL_TONES.gray
      }`}
    >
      {children}
    </span>
  );
}

function Avatar({ name, active = true }) {
  return (
    <span
      className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-lg font-bold ${
        active ? 'bg-[#F8E9EB] text-[#6E2430]' : 'bg-gray-100 text-gray-400'
      }`}
    >
      {initialsOf(name)}
    </span>
  );
}

function StatTile({ label, value, Icon }) {
  return (
    <div className="flex items-center gap-4 rounded-2xl border border-[#EBD3D3] bg-white p-5 shadow-sm">
      <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-[#F8E9EB] text-[#6E2430]">
        <Icon className="h-7 w-7" aria-hidden="true" />
      </span>
      <div>
        <p className="text-xl font-semibold text-gray-500">{label}</p>
        <p className="text-4xl font-extrabold leading-tight text-[#6E2430]">{value}</p>
      </div>
    </div>
  );
}

function SearchBox({ value, onChange, placeholder }) {
  return (
    <div className="relative w-full md:max-w-sm">
      <Search
        size={25}
        className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400"
      />
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={`${fieldClass} !py-2.5 pl-11`}
      />
    </div>
  );
}

function Field({ id, label, children }) {
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-xl font-semibold text-gray-800">
        {label}
      </label>
      {children}
    </div>
  );
}

function IconButton({ label, tone = 'default', className = '', children, ...props }) {
  const tones = {
    default: 'border-gray-300 text-gray-700 hover:bg-gray-100',
    blue: 'border-blue-200 text-blue-700 hover:bg-blue-50',
    amber: 'border-amber-200 text-amber-700 hover:bg-amber-50',
    green: 'border-green-200 text-green-700 hover:bg-green-50',
    red: 'border-red-200 text-red-600 hover:bg-red-50',
  };

  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      className={`flex h-11 w-11 items-center justify-center rounded-xl border bg-white transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#6E2430] disabled:cursor-not-allowed disabled:opacity-50 ${tones[tone]} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}

function EmptyState({ children }) {
  return <p className="px-6 py-12 text-center text-xl text-gray-400">{children}</p>;
}

function ConfirmDialog({ user, busy, onCancel, onConfirm }) {
  if (!user) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={busy ? undefined : onCancel}
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="delete-title"
        className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <span className="flex h-14 w-14 items-center justify-center rounded-full bg-red-50 text-red-600">
          <Trash2 className="h-7 w-7" aria-hidden="true" />
        </span>

        <h2 id="delete-title" className="mt-4 text-2xl font-bold text-gray-900">
          Delete this account?
        </h2>

        <p className="mt-2 text-lg text-gray-600">
          The account of <strong className="text-gray-900">{user.full_name}</strong> will be
          removed. This cannot be undone.
        </p>

        <div className="mt-6 flex justify-end gap-3">
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="rounded-xl border border-gray-300 px-5 py-2.5 text-lg font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            Cancel
          </button>

          <button
            type="button"
            onClick={onConfirm}
            disabled={busy}
            className="rounded-xl bg-red-600 px-5 py-2.5 text-lg font-semibold text-white hover:bg-red-700 disabled:opacity-50"
          >
            {busy ? 'Deleting…' : 'Delete account'}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ======================================================
   PAGE
   ====================================================== */

export default function Users() {
  const [users, setUsers] = useState([]);
  const [form, setForm] = useState({ ...EMPTY_FORM });

  const [editing, setEditing] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState(null);
  const [error, setError] = useState('');

  const [showPassword, setShowPassword] = useState(false);
  const [confirmUser, setConfirmUser] = useState(null);

  const [userSearch, setUserSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');

  const [activityLogs, setActivityLogs] = useState([]);
  const [activityLoading, setActivityLoading] = useState(false);
  const [activityError, setActivityError] = useState('');
  const [logSearch, setLogSearch] = useState('');

  /* ---------- RESET FORM ---------- */

  const resetForm = () => {
    setForm({ ...EMPTY_FORM });
    setEditing(null);
    setShowPassword(false);
  };

  /* ---------- LOAD USERS ---------- */

  // Only the very first load shows the full-page spinner, so later
  // refreshes do not flash the form and table away.
  const load = useCallback(async () => {
    try {
      setError('');

      const response = await api.get('/users');
      setUsers(Array.isArray(response?.users) ? response.users : []);
    } catch (err) {
      console.error('Failed to load users:', err);
      setError(err.message || 'Failed to load user accounts.');
    } finally {
      setLoading(false);
    }
  }, []);

  /* ---------- LOAD ACTIVITY LOGS ---------- */

  const loadActivityLogs = useCallback(async () => {
    try {
      setActivityLoading(true);
      setActivityError('');

      const response = await api.get('/users/activity-logs');
      setActivityLogs(Array.isArray(response?.logs) ? response.logs : []);
    } catch (err) {
      console.error('Failed to load activity logs:', err);
      setActivityError(err.message || 'Failed to load activity logs.');
    } finally {
      setActivityLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    loadActivityLogs();
  }, [load, loadActivityLogs]);

  /* ---------- CREATE / UPDATE ---------- */

  const submit = async (e) => {
    e.preventDefault();

    try {
      setSaving(true);
      setError('');

      if (editing) {
        const { password, ...rest } = form;
        const payload = password ? { ...rest, password } : rest;

        await api.put(`/users/${editing}`, payload);
      } else {
        await api.post('/users', form);
      }

      resetForm();

      await load();
      await loadActivityLogs();
    } catch (err) {
      console.error('Failed to save user:', err);
      setError(err.message || 'Failed to save user account.');
    } finally {
      setSaving(false);
    }
  };

  /* ---------- EDIT ---------- */

  const editUser = (u) => {
    setEditing(u.user_id);

    setForm({
      full_name: u.full_name || '',
      username: u.username || '',
      email: u.email || '',
      password: '',
      roles: u.roles || 'staff',
    });

    setShowPassword(false);
    setError('');

    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  /* ---------- ACTIVATE / DEACTIVATE ---------- */

  const toggle = async (u) => {
    try {
      setBusyId(u.user_id);
      setError('');

      await api.patch(`/users/${u.user_id}/status`, {
        account_status: !u.account_status,
      });

      await load();
      await loadActivityLogs();
    } catch (err) {
      console.error('Failed to update account status:', err);
      setError(err.message || 'Failed to update account status.');
    } finally {
      setBusyId(null);
    }
  };

  /* ---------- DELETE (confirmed in a dialog) ---------- */

  const remove = async () => {
    const u = confirmUser;

    if (!u) return;

    try {
      setBusyId(u.user_id);
      setError('');

      await api.del(`/users/${u.user_id}`);

      if (editing === u.user_id) resetForm();

      await load();
      await loadActivityLogs();
    } catch (err) {
      console.error('Failed to delete user:', err);
      setError(err.message || 'Failed to delete user account.');
    } finally {
      setBusyId(null);
      setConfirmUser(null);
    }
  };

  /* ---------- DERIVED DATA ---------- */

  const stats = useMemo(
    () => ({
      total: users.length,
      active: users.filter((u) => u.account_status).length,
      inactive: users.filter((u) => !u.account_status).length,
      admins: users.filter((u) => String(u.roles).toLowerCase() === 'admin').length,
    }),
    [users]
  );

  const roleCounts = useMemo(() => {
    const counts = { all: users.length, admin: 0, captain: 0, staff: 0 };

    users.forEach((u) => {
      const role = String(u.roles).toLowerCase();
      if (role in counts) counts[role] += 1;
    });

    return counts;
  }, [users]);

  const filteredUsers = useMemo(() => {
    const q = userSearch.trim().toLowerCase();

    return users.filter((u) => {
      if (roleFilter !== 'all' && String(u.roles).toLowerCase() !== roleFilter) return false;
      if (!q) return true;

      return [u.full_name, u.username, u.email].some((v) => String(v || '').toLowerCase().includes(q));
    });
  }, [users, userSearch, roleFilter]);

  const filteredLogs = useMemo(() => {
    const q = logSearch.trim().toLowerCase();
    if (!q) return activityLogs;

    return activityLogs.filter((log) =>
      [log.user_name, log.user_role, log.action, log.activity_description].some((v) =>
        String(v || '').toLowerCase().includes(q)
      )
    );
  }, [activityLogs, logSearch]);

  /* ======================================================
     RENDER
     ====================================================== */

  return (
    <div className="space-y-6">
      <div className="mt-4">
        <PageHeader
          title="User Accounts"
          subtitle="Create, update, and remove staff accounts, and review."
        />
      </div>

      {error && (
        <div
          role="alert"
          className="flex items-start justify-between gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-lg font-medium text-red-700"
        >
          <span>{error}</span>
          <button
            type="button"
            onClick={() => setError('')}
            aria-label="Dismiss error"
            className="shrink-0 rounded p-1 hover:bg-red-100"
          >
            <X size={20} />
          </button>
        </div>
      )}

      {loading ? (
        <Spinner />
      ) : (
        <>
          {/* SUMMARY */}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatTile label="Total accounts" value={stats.total} Icon={UsersIcon} />
            <StatTile label="Active" value={stats.active} Icon={UserCheck} />
            <StatTile label="Inactive" value={stats.inactive} Icon={UserX} />
            <StatTile label="Admins" value={stats.admins} Icon={ShieldCheck} />
          </div>

          {/* STAFF ACCOUNTS */}

          <Band title="Staff Accounts">
            <form
              onSubmit={submit}
              className={`m-5 rounded-2xl border p-5 transition ${
                editing
                  ? 'border-amber-300 bg-amber-50/50'
                  : 'border-[#EBD3D3] bg-[#FBF6F6]'
              }`}
            >
              <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
                <h3 className="text-2xl font-bold text-[#6E2430]">
                  {editing ? 'Edit account' : 'New account'}
                </h3>

                {editing && (
                  <span className="rounded-full bg-amber-100 px-3 py-1 text-base font-semibold text-amber-800">
                    Editing {form.full_name || 'account'}
                  </span>
                )}
              </div>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                <Field id="u-full-name" label="Full name">
                  <input
                    id="u-full-name"
                    className={fieldClass}
                    value={form.full_name}
                    onChange={(e) => setForm({ ...form, full_name: e.target.value })}
                    required
                  />
                </Field>

                <Field id="u-username" label="Username">
                  <input
                    id="u-username"
                    className={fieldClass}
                    value={form.username}
                    onChange={(e) => setForm({ ...form, username: e.target.value })}
                    autoComplete="off"
                    required
                  />
                </Field>

                <Field id="u-email" label="Email">
                  <input
                    id="u-email"
                    type="email"
                    className={fieldClass}
                    value={form.email}
                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                  />
                </Field>

                <Field id="u-role" label="Role">
                  <select
                    id="u-role"
                    className={fieldClass}
                    value={form.roles}
                    onChange={(e) => setForm({ ...form, roles: e.target.value })}
                  >
                    <option value="admin">Admin</option>
                    <option value="captain">Captain</option>
                    <option value="staff">Staff</option>
                  </select>
                </Field>

                <Field
                  id="u-password"
                  label={editing ? 'New password (leave blank to keep)' : 'Password'}
                >
                  <div className="relative">
                    <input
                      id="u-password"
                      type={showPassword ? 'text' : 'password'}
                      className={`${fieldClass} pr-12`}
                      value={form.password}
                      onChange={(e) => setForm({ ...form, password: e.target.value })}
                      autoComplete="new-password"
                      required={!editing}
                    />

                    <button
                      type="button"
                      onClick={() => setShowPassword((prev) => !prev)}
                      className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-2 text-gray-500 transition hover:bg-gray-100 hover:text-[#6E2430] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#6E2430]"
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                      title={showPassword ? 'Hide password' : 'Show password'}
                    >
                      {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                    </button>
                  </div>
                </Field>

                <div className="flex items-end gap-2">
                  <button
                    type="submit"
                    disabled={saving}
                    className="w-full rounded-xl bg-gradient-to-r from-[#7A2837] to-[#5A1C28] px-5 py-3 text-lg font-bold text-white shadow-sm shadow-[#6E2430]/25 transition hover:brightness-110 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#6E2430]/30 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {saving ? 'Saving…' : editing ? 'Save changes' : 'Create account'}
                  </button>

                  {editing && (
                    <button
                      type="button"
                      onClick={resetForm}
                      title="Cancel editing"
                      aria-label="Cancel editing"
                      className="flex h-[52px] shrink-0 items-center justify-center rounded-xl border border-gray-300 bg-white px-4 text-gray-700 hover:bg-gray-100"
                    >
                      <X size={20} />
                    </button>
                  )}
                </div>
              </div>
            </form>

            {/* FILTER BAR */}

            <div className="flex flex-wrap items-center justify-between gap-3 border-y border-[#EBD3D3] bg-white px-5 py-4">
              <SearchBox
                value={userSearch}
                onChange={setUserSearch}
                placeholder="Search name, username, or email"
              />

              <div className="flex flex-wrap items-center gap-2">
                {ROLE_TABS.map(([value, label]) => {
                  const active = roleFilter === value;

                  return (
                    <button
                      key={value}
                      type="button"
                      aria-pressed={active}
                      onClick={() => setRoleFilter(value)}
                      className={`flex items-center gap-2 rounded-full border px-4 py-1.5 text-xl font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#6E2430] ${
                        active
                          ? 'border-[#6E2430] bg-[#6E2430] text-white'
                          : 'border-[#EBD3D3] bg-white text-gray-700 hover:bg-[#FBF6F6]'
                      }`}
                    >
                      {label}
                      <span
                        className={`rounded-full px-2 text-xl ${
                          active ? 'bg-white/20' : 'bg-gray-100 text-gray-600'
                        }`}
                      >
                        {roleCounts[value]}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* USER TABLE */}

            <div className="w-full overflow-x-auto scrollbar-hide">
              <Table
                head={[
                  'Name',
                  'Username',
                  'Role',
                  'Purok Assigned',
                  'Status',
                  'Last Login',
                  'Actions',
                ]}
              >
                {filteredUsers.map((u) => {
                  const isEditing = editing === u.user_id;
                  const isBusy = busyId === u.user_id;

                  return (
                    <tr
                      key={u.user_id}
                      className={`border-t border-gray-100 transition-colors ${
                        isEditing ? 'bg-amber-50/60' : 'hover:bg-[#FBF6F6]'
                      } ${u.account_status ? '' : 'text-gray-400'}`}
                    >
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <Avatar name={u.full_name} active={Boolean(u.account_status)} />
                          <div className="min-w-0">
                            <p className="truncate text-xl font-semibold text-gray-900">
                              {u.full_name}
                            </p>
                            {u.email && (
                              <p className="truncate text-base text-gray-500">{u.email}</p>
                            )}
                          </div>
                        </div>
                      </td>

                      <td className="px-4 py-3 text-2xl text-gray-700">{u.username}</td>

                      <td className="px-4 py-3">
                        <Pill tone={toneForRole(u.roles)}>{u.roles}</Pill>
                      </td>

                      <td className="px-4 py-3 text-2xl text-gray-700">All Puroks</td>

                      <td className="px-4 py-3">
                        <Status tone={u.account_status ? 'success' : 'await'}>
                          {u.account_status ? 'Active' : 'Inactive'}
                        </Status>
                      </td>

                      <td className="whitespace-nowrap px-4 py-3 text-xl text-gray-600">
                        {u.visited_date ? formatDate(u.visited_date) : 'Never logged in'}
                      </td>

                      <td className="px-4 py-3">
                        <div className="flex gap-2">
                          <IconButton
                            label="Edit account"
                            tone="blue"
                            disabled={isBusy}
                            onClick={() => editUser(u)}
                          >
                            <Edit size={30} />
                          </IconButton>

                          <IconButton
                            label={u.account_status ? 'Deactivate account' : 'Activate account'}
                            tone={u.account_status ? 'amber' : 'green'}
                            disabled={isBusy}
                            onClick={() => toggle(u)}
                          >
                            {isBusy ? (
                              <RefreshCw size={30} className="animate-spin" />
                            ) : u.account_status ? (
                              <UserLock size={30} />
                            ) : (
                              <UserKey size={30} />
                            )}
                          </IconButton>

                          <IconButton
                            label="Delete account"
                            tone="red"
                            disabled={isBusy}
                            onClick={() => setConfirmUser(u)}
                          >
                            <Trash2 size={30} />
                          </IconButton>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </Table>
            </div>

            {users.length === 0 && (
              <EmptyState>No accounts yet. Fill in the form above to create the first one.</EmptyState>
            )}

            {users.length > 0 && filteredUsers.length === 0 && (
              <EmptyState>No accounts match your search.</EmptyState>
            )}
          </Band>

          {/* ACTIVITY LOGS */}

          <Band title="Activity Logs Monitoring">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#EBD3D3] p-4">
              <div className="flex flex-wrap items-center gap-4">
                <SearchBox
                  value={logSearch}
                  onChange={setLogSearch}
                  placeholder="Search name, action, or description"
                />

                <span className="text-lg text-gray-500">
                  {filteredLogs.length} of {activityLogs.length} entries
                </span>
              </div>

              <button
                type="button"
                onClick={loadActivityLogs}
                disabled={activityLoading}
                className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-[#7A2837] to-[#5A1C28] px-5 py-2.5 text-lg font-semibold text-white shadow-sm transition hover:brightness-110 disabled:opacity-50"
              >
                <RefreshCw size={20} className={activityLoading ? 'animate-spin' : ''} />
                {activityLoading ? 'Refreshing…' : 'Refresh'}
              </button>
            </div>

            {activityError && (
              <p className="border-b border-red-100 bg-red-50 px-5 py-3 text-lg text-red-700">
                {activityError}
              </p>
            )}

            {activityLoading && activityLogs.length === 0 ? (
              <Spinner />
            ) : activityLogs.length === 0 ? (
              <EmptyState>No activity recorded yet.</EmptyState>
            ) : filteredLogs.length === 0 ? (
              <EmptyState>No log entries match your search.</EmptyState>
            ) : (
              <div className="max-h-[520px] w-full overflow-auto scrollbar-hide">
                <table className="w-full text-left">
                  <thead className="sticky top-0 z-10 bg-[#FFD7D7]">
                    <tr>
                      <th className={th}>Name</th>
                      <th className={th}>Role</th>
                      <th className={th}>Action</th>
                      <th className={th}>Description</th>
                      <th className={th}>Date and Time</th>
                    </tr>
                  </thead>

                  <tbody className="divide-y divide-gray-100">
                    {filteredLogs.map((log) => (
                      <tr key={log.log_id} className="transition-colors hover:bg-[#FBF6F6]">
                        <td className="whitespace-nowrap px-4 py-3">
                          <div className="flex items-center gap-3">
                            <Avatar name={log.user_name} />
                            <span className="text-xl font-semibold text-gray-900">
                              {log.user_name || 'Unknown User'}
                            </span>
                          </div>
                        </td>

                        <td className="px-4 py-3">
                          <Pill tone={toneForRole(log.user_role)}>{log.user_role || 'Unknown'}</Pill>
                        </td>

                        <td className="px-4 py-3">
                          {log.action ? (
                            <Pill tone={toneForAction(log.action)}>{log.action}</Pill>
                          ) : (
                            <span className="text-xl text-gray-400">—</span>
                          )}
                        </td>

                        <td className="max-w-md px-4 py-3 text-lg text-gray-600">
                          {log.activity_description || (
                            <span className="text-gray-400">No description</span>
                          )}
                        </td>

                        <td className="whitespace-nowrap px-4 py-3 text-lg text-gray-500">
                          {formatDate(log.timestamp)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Band>
        </>
      )}

      <ConfirmDialog
        user={confirmUser}
        busy={busyId !== null && busyId === confirmUser?.user_id}
        onCancel={() => setConfirmUser(null)}
        onConfirm={remove}
      />
    </div>
  );
}