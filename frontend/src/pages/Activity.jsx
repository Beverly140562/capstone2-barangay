import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { PageHeader, Band, Table, Badge, Spinner } from '../components/ui';

export default function Activity() {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    api.get('/activity')
      .then((d) => setLogs(d.logs))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="space-y-6">
      <PageHeader title="Activity Logs" subtitle="System CRUD activities performed by users." />
      {error && <p className="text-red-600">{error}</p>}
      {loading ? <Spinner /> : (
        <Band title="Audit Trail">
          <Table head={['Timestamp', 'User', 'Action', 'Details']}>
            {logs.map((l) => (
              <tr key={l.log_id}>
                <td className="px-3 py-2 text-xs">{new Date(l.timestamp).toLocaleString()}</td>
                <td className="px-3 py-2">{l.username || '—'}</td>
                <td className="px-3 py-2"><Badge tone="blue">{l.action}</Badge></td>
                <td className="px-3 py-2">{l.activity_description}</td>
              </tr>
            ))}
            {!logs.length && <tr><td colSpan={4} className="px-3 py-6 text-center text-gray-400">No activity recorded.</td></tr>}
          </Table>
        </Band>
      )}
    </div>
  );
}