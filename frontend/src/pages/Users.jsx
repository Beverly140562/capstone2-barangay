import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { PageHeader, Band, Table, Status, Spinner, Button, Input, Select } from '../components/ui';

export default function Users() {
  const [users, setUsers] = useState([]);
  const [form, setForm] = useState({ full_name: '', username: '', email: '', password: '', roles: 'staff' });
  const [editing, setEditing] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [activityLogs, setActivityLogs] = useState([]);
  const [activityLoading, setActivityLoading] = useState(false);
  const [activityError, setActivityError] = useState('');

  const loadActivityLogs = async () => {
  try {
    setActivityLoading(true);
    setActivityError('');

    const response = await api.get('/users/activity-logs');

    setActivityLogs(
      Array.isArray(response?.logs) ? response.logs : []
    );
  } catch (err) {
    console.error('Failed to load activity logs:', err);
    setActivityError(err.message || 'Failed to load activity logs.');
  } finally {
    setActivityLoading(false);
  }
};

  const load = () => {
    api.get('/users').then((d) => setUsers(d.users)).catch((e) => setError(e.message)).finally(() => setLoading(false));
  };
useEffect(() => {
  load();
  loadActivityLogs();
}, []);

  const submit = async (e) => {
    e.preventDefault();
    try {
      if (editing) {
        const { password, ...rest } = form;
        await api.put(`/users/${editing}`, password ? { ...rest, password } : rest);
      } else {
        await api.post('/users', form);
      }
      setForm({ full_name: '', username: '', email: '', password: '', roles: 'staff' });
      setEditing(null);
      load();
    } catch (err) {
      setError(err.message);
    }
  };

  const toggle = async (u) => {
    await api.patch(`/users/${u.user_id}/status`, { account_status: !u.account_status });
    load();
  };

  const remove = async (u) => {
    await api.del(`/users/${u.user_id}`);
    load();
  };

  return (
    <div className="space-y-6">
      <div className='mt-4'>
        <PageHeader title="User Accounts" subtitle="Create, view, update, and remove staff accounts." />
      </div>

      {error && <p className="text-red-600">{error}</p>}
      {loading ? <Spinner /> : (
        <>
          <Band
            title="Staff Accounts"
          >
            <form onSubmit={submit} className="grid md:grid-cols-5 gap-3 border-b border-gray-100 p-5">
              <Input label="Full Name" value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} required />
              <Input label="Username" value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} required />
              <Input label="Email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
              <Select label="Role" value={form.roles} onChange={(e) => setForm({ ...form, roles: e.target.value })}>
                <option value="admin">Admin</option><option value="captain">Captain</option><option value="staff">Staff</option>
              </Select>
              <div className="flex items-end gap-2">
                <Input label={editing ? 'New Password' : 'Password'} type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required={!editing} />
                <Button>{editing ? 'Update' : 'Create'}</Button>
              </div>
            </form>
            <Table head={['Name', 'Username', 'Role', 'Purok Assigned', 'Status', 'Last Login', 'Actions']}>
              {users.map((u) => (
                <tr key={u.user_id}>
                  <td className="px-3 py-2">{u.full_name}</td>
                  <td className="px-3 py-2">{u.username}</td>
                  <td className="px-3 py-2 capitalize">{u.roles}</td>
                  <td className="px-3 py-2">All Puroks</td>
                  <td className="px-3 py-2"><Status tone={u.account_status ? 'success' : 'await'}>{u.account_status ? 'Active' : 'Inactive'}</Status></td>
                  <td className="px-3 py-2">{u.date_created ? new Date(u.date_created).toLocaleDateString() : '—'}</td>
                  <td className="px-3 py-2 flex gap-2">
                    <Button variant="outline" onClick={() => { setEditing(u.user_id); setForm({ full_name: u.full_name, username: u.username, email: u.email || '', password: '', roles: u.roles }); }}>Edit</Button>
                    <Button variant={u.account_status ? 'danger' : 'success'} onClick={() => toggle(u)}>{u.account_status ? 'Deactivate' : 'Activate'}</Button>
                    <Button variant="danger" onClick={() => remove(u)}>Delete</Button>
                  </td>
                </tr>
              ))}
            </Table>
          </Band>

          <Band title="Staff and Captain Activity Logs">
  <div className="flex items-center justify-between border-b border-gray-100 p-4">
    <div>
      <p className="font-semibold text-gray-800">
        User Activity Monitoring
      </p>
      <p className="text-sm text-gray-500">
        Monitor recent actions performed by Staff and Captain.
      </p>
    </div>

    <Button
      variant="outline"
      onClick={loadActivityLogs}
      disabled={activityLoading}
    >
      {activityLoading ? 'Loading...' : 'Refresh Logs'}
    </Button>
  </div>

  {activityError && (
    <p className="p-4 text-red-600">{activityError}</p>
  )}

  {activityLoading ? (
    <Spinner />
  ) : activityLogs.length === 0 ? (
    <p className="p-6 text-center text-gray-500">
      No activity logs found.
    </p>
  ) : (
    <div className="overflow-x-auto">
      <table className="w-full text-left">
        <thead className="bg-gray-50">
          <tr className="text-sm text-gray-500">
            <th className="px-4 py-3">User</th>
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
              <td className="px-4 py-3 font-medium text-gray-800">
                {log.user_name || 'Unknown User'}
                {log.username && (
                  <p className="text-xs text-gray-500">
                    @{log.username}
                  </p>
                )}
              </td>

              <td className="px-4 py-3">
                <span className="rounded-full bg-blue-100 px-3 py-1 text-xs font-semibold capitalize text-blue-700">
                  {log.user_role || 'Unknown'}
                </span>
              </td>

              <td className="px-4 py-3 font-semibold text-[#6E2430]">
                {log.action || '—'}
              </td>

              <td className="max-w-sm px-4 py-3 text-gray-600">
                {log.activity_description || 'No description'}
              </td>

              <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-600">
                {log.timestamp
                  ? new Date(log.timestamp).toLocaleString('en-PH', {
                      year: 'numeric',
                      month: 'short',
                      day: 'numeric',
                      hour: 'numeric',
                      minute: '2-digit',
                    })
                  : '—'}
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