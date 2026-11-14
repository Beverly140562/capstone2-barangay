
import { useCallback, useEffect, useState } from 'react';
import { api } from '../lib/api';

import {
  PageHeader,
  Band,
  Table,
  Status,
  Spinner,
  Button,
  Input,
  Select,
} from '../components/ui';

import { RefreshCw, Eye, EyeOff, X } from 'lucide-react';

const EMPTY_FORM = {
  full_name: '',
  username: '',
  email: '',
  password: '',
  roles: 'staff',
  visited_date: null,
};

export default function Users() {
  const [users, setUsers] = useState([]);
  const [form, setForm] = useState({ ...EMPTY_FORM });

  const [editing, setEditing] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const [showPassword, setShowPassword] = useState(false);

  const [activityLogs, setActivityLogs] = useState([]);
  const [activityLoading, setActivityLoading] = useState(false);
  const [activityError, setActivityError] = useState('');

  // ==========================================
  // RESET FORM
  // ==========================================

  const resetForm = () => {
    setForm({ ...EMPTY_FORM });
    setEditing(null);
    setShowPassword(false);
  };

  // ==========================================
  // LOAD USERS
  // ==========================================

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError('');

      const response = await api.get('/users');

      setUsers(
        Array.isArray(response?.users) ? response.users : []
      );
    } catch (err) {
      console.error('Failed to load users:', err);
      setError(err.message || 'Failed to load user accounts.');
    } finally {
      setLoading(false);
    }
  }, []);

  // ==========================================
  // LOAD ACTIVITY LOGS
  // ==========================================

  const loadActivityLogs = useCallback(async () => {
    try {
      setActivityLoading(true);
      setActivityError('');

      const response = await api.get('/users/activity-logs');

      setActivityLogs(
        Array.isArray(response?.logs) ? response.logs : []
      );
    } catch (err) {
      console.error('Failed to load activity logs:', err);
      setActivityError(
        err.message || 'Failed to load activity logs.'
      );
    } finally {
      setActivityLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    loadActivityLogs();
  }, [load, loadActivityLogs]);

  // ==========================================
  // CREATE / UPDATE USER
  // ==========================================

  const submit = async (e) => {
    e.preventDefault();

    try {
      setSaving(true);
      setError('');

      if (editing) {
        const { password, ...rest } = form;

        const payload = password
          ? { ...rest, password }
          : rest;

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

  // ==========================================
  // EDIT USER
  // ==========================================

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

    window.scrollTo({
      top: 0,
      behavior: 'smooth',
    });
  };

  // ==========================================
  // ACTIVATE / DEACTIVATE
  // ==========================================

  const toggle = async (u) => {
    try {
      setError('');

      await api.patch(`/users/${u.user_id}/status`, {
        account_status: !u.account_status,
      });

      await load();
      await loadActivityLogs();
    } catch (err) {
      console.error('Failed to update account status:', err);
      setError(err.message || 'Failed to update account status.');
    }
  };

  // ==========================================
  // DELETE USER
  // ==========================================

  const remove = async (u) => {
    const confirmed = window.confirm(
      `Are you sure you want to delete the account of ${u.full_name}?`
    );

    if (!confirmed) return;

    try {
      setError('');

      await api.del(`/users/${u.user_id}`);

      if (editing === u.user_id) {
        resetForm();
      }

      await load();
      await loadActivityLogs();
    } catch (err) {
      console.error('Failed to delete user:', err);
      setError(err.message || 'Failed to delete user account.');
    }
  };

  // ==========================================
  // FORMAT DATE
  // ==========================================

  const formatDate = (date) => {
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
  };

  // ==========================================
  // UI
  // ==========================================

  return (
    <div className="space-y-6">

      <div className="mt-4">
        <PageHeader
          title="User Accounts"
          subtitle="Create, view, update, and remove staff accounts."
        />
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-red-700">
          {error}
        </div>
      )}

      {loading ? (
        <Spinner />
      ) : (
        <>
          {/* ==================================
              USER ACCOUNTS
          ================================== */}

          <Band title="Staff Accounts">

            <form
              onSubmit={submit}
              className="grid grid-cols-1 gap-3 border-b border-gray-100 p-5 md:grid-cols-3 lg:grid-cols-6"
            >

              <Input
                label="Full Name"
                value={form.full_name}
                onChange={(e) =>
                  setForm({ ...form, full_name: e.target.value })
                }
                required
              />

              <Input
                label="Username"
                value={form.username}
                onChange={(e) =>
                  setForm({ ...form, username: e.target.value })
                }
                required
              />

              <Input
                label="Email"
                type="email"
                value={form.email}
                onChange={(e) =>
                  setForm({ ...form, email: e.target.value })
                }
              />

              <Select
                label="Role"
                value={form.roles}
                onChange={(e) =>
                  setForm({ ...form, roles: e.target.value })
                }
              >
                <option value="admin">Admin</option>
                <option value="captain">Captain</option>
                <option value="staff">Staff</option>
              </Select>

              {/* PASSWORD WITH SHOW / HIDE */}

              <div className="relative">
                <Input
                  label={editing ? 'New Password' : 'Password'}
                  type={showPassword ? 'text' : 'password'}
                  value={form.password}
                  onChange={(e) =>
                    setForm({ ...form, password: e.target.value })
                  }
                  required={!editing}
                />

                <button
                  type="button"
                  onClick={() =>
                    setShowPassword((prev) => !prev)
                  }
                  className="absolute right-3 top-[38px] z-10 text-gray-500 transition hover:text-[#6E2430]"
                  aria-label={
                    showPassword ? 'Hide password' : 'Show password'
                  }
                  title={
                    showPassword ? 'Hide password' : 'Show password'
                  }
                >
                  {showPassword ? (
                    <EyeOff size={20} />
                  ) : (
                    <Eye size={20} />
                  )}
                </button>
              </div>

              {/* CREATE / UPDATE BUTTON */}

              <div className="flex items-end gap-2">
                <Button
                  type="submit"
                  disabled={saving}
                  className="w-full"
                >
                  {saving
                    ? 'Saving...'
                    : editing
                      ? 'Update'
                      : 'Create'}
                </Button>

                {editing && (
                  <button
                    type="button"
                    onClick={resetForm}
                    title="Cancel editing"
                    className="flex h-10 items-center justify-center rounded-lg border border-gray-700 px-3 text-gray-900 hover:bg-gray-200"
                  >
                    <X size={20} />
                  </button>
                )}
              </div>

            </form>

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
                {users.map((u) => (
                  <tr key={u.user_id}>

                    <td className="px-3 py-2 text-gray-800">
                      {u.full_name}
                    </td>

                    <td className="px-3 py-2 text-gray-800">
                      {u.username}
                    </td>

                    <td className="px-3 py-2 text-gray-800 capitalize">
                      {u.roles}
                    </td>

                    <td className="px-3 py-2 text-gray-800">
                      All Puroks
                    </td>

                    <td className="px-3 py-2">
                      <Status
                        tone={
                          u.account_status ? 'success' : 'await'
                        }
                      >
                        {u.account_status ? 'Active' : 'Inactive'}
                      </Status>
                    </td>

                    <td className="whitespace-nowrap px-3 py-2 text-gray-800">
                      {u.visited_date ? formatDate(u.visited_date) : 'Never logged in'}
                    </td>

                    <td className="px-2 py-2">
                      <div className="flex flex-wrap gap-2">

                        <Button
                          variant="outline"
                          onClick={() => editUser(u)}
                        >
                          Edit
                        </Button>

                        <Button
                          variant={
                            u.account_status ? 'danger' : 'success'
                          }
                          onClick={() => toggle(u)}
                        >
                          {u.account_status
                            ? 'Deactivate'
                            : 'Activate'}
                        </Button>

                        <Button
                          variant="danger"
                          onClick={() => remove(u)}
                        >
                          Delete
                        </Button>

                      </div>
                    </td>

                  </tr>
                ))}
              </Table>
            </div>

            {users.length === 0 && (
              <p className="p-6 text-center text-gray-500">
                No user accounts found.
              </p>
            )}

          </Band>

          {/* ==================================
              ACTIVITY LOGS
          ================================== */}

          <Band title="Activity Logs Monitoring">

            <div className="flex items-center justify-between border-b border-gray-100 p-4">

              <div>
                <p className="text-lg font-semibold text-gray-800">
                  Monitor account activities and recorded actions.
                </p>

              </div>

              <button
                type="button"
                onClick={loadActivityLogs}
                disabled={activityLoading}
                className="rounded-lg bg-[#6E2430] px-5 py-2 text-white transition hover:bg-[#581c26] disabled:opacity-50"
              >
                <RefreshCw
                  size={25}
                  className={`mr-2 inline ${
                    activityLoading ? 'animate-spin' : ''
                  }`}
                />

                {activityLoading ? 'Refreshing...' : 'Refresh'}
              </button>

            </div>

            {activityError && (
              <p className="p-4 text-red-600">
                {activityError}
              </p>
            )}

            {activityLoading ? (
              <Spinner />
            ) : activityLogs.length === 0 ? (
              <p className="p-6 text-center text-gray-500">
                No activity logs found.
              </p>
            ) : (

              <div className="max-h-[510px] w-full overflow-x-auto overflow-y-auto scrollbar-hide">

                <table className="w-full text-left">

                  <thead className="sticky top-0 z-10 bg-gray-100">
                    <tr className="text-2xl text-gray-600">
                      <th className="px-4 py-3">Name</th>
                      <th className="px-4 py-3">Role</th>
                      <th className="px-4 py-3">Action</th>
                      <th className="px-4 py-3">Description</th>
                      <th className="px-4 py-3">Date and Time</th>
                    </tr>
                  </thead>

                  <tbody>
                    {activityLogs.map((log) => (
                      <tr
                        key={log.log_id}
                        className="border-b border-gray-100 hover:bg-gray-50"
                      >

                        <td className="whitespace-nowrap px-4 py-3 text-2xl font-medium text-gray-800">
                          {log.user_name || 'Unknown User'}
                        </td>

                        <td className="px-4 py-3">
                          <span className="rounded-full bg-blue-100 px-3 py-1 text-xl font-semibold capitalize text-blue-700">
                            {log.user_role || 'Unknown'}
                          </span>
                        </td>

                        <td className="px-4 py-3 text-xl font-semibold text-[#6E2430]">
                          {log.action || '—'}
                        </td>

                        <td className="max-w-sm px-4 py-3 text-xl text-gray-600">
                          {log.activity_description || 'No description'}
                        </td>

                        <td className="whitespace-nowrap px-4 py-3 text-xl text-gray-600">
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

    </div>
  );
}
