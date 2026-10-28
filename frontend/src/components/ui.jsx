// Card with optional dark banded header (design: white page -> maroon band + white title)
export function Card({ title, band, children, action, className = '' }) {
  return (
    <div className={`bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden ${className}`}>
      <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100 bg-white">
        <h3 className="font-bold text-gray-900">{title}</h3>
        {action}
      </div>
      <div className="p-5">{children}</div>
    </div>
  );
}

// Banded card: maroon header bar with white title (design: "Staff Accounts", "Active Assistance Programs"...)
export function Band({ title, subtitle, action, children, className = '' }) {
  return (
    <div className={`bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden ${className}`}>
      <div className="flex items-center justify-between px-5 py-4 bg-[#6E2430]">
        <div>
          <h3 className="font-bold text-white text-2xl">{title}</h3>
          {subtitle && <div className="text-xs text-red-200">{subtitle}</div>}
        </div>
        {action}
      </div>
      <div className=" mt-4">{children}</div>
    </div>
  );
}

export function PageHeader({ title, subtitle, children }) {
  return (
    <div className="flex items-start justify-between mb-5">
      <div>
        <h1 className="text-[32px] font-extrabold text-ink">{title}</h1>
        {subtitle && <p className="mt-1 text-[20px] text-muted">{subtitle}</p>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

const TONES = {
  gray: 'bg-gray-100 text-gray-700',
  green: 'bg-green-100 text-success',
  red: 'bg-[#6E2430] text-brand',
  amber: 'bg-amber-100 text-amber',
  blue: 'bg-blue-100 text-blue-700'
};

export function Badge({ children, tone = 'gray' }) {
  return (
    <span className={`inline-block rounded-full px-2.5 py-0.5 text-lg font-semibold ${TONES[tone]}`}>
      {children}
    </span>
  );
}

// Design "status" labels are plain bold colored text (no pill)
export function Status({ children, tone = 'await' }) {
  const colors = {
    success: 'text-success',
    amber: 'text-amber',
    await: 'text-await',
    alert: 'text-brand',
    high: 'text-alert',
    medium: 'text-amber',
    low: 'text-success'
  };
  return <span className={`text-2xl font-semibold ${colors[tone]}`}>{children}</span>;
}

export function statusTone(status = '') {
  const s = String(status).toLowerCase();
  if (s.includes('approved') || s.includes('active')) return 'success';
  if (s.includes('validated')) return 'amber';
  if (s.includes('reject') || s.includes('return')) return 'alert';
  if (s.includes('high') || s.includes('highly')) return 'high';
  if (s.includes('medium') || s.includes('moderate')) return 'medium';
  if (s.includes('low') || s.includes('low')) return 'low';
  return 'await';
}



export function Input({ label, ...props }) {
  return (
    <label className="block text-sm">
      <span className="text-gray-700 font-semibold mb-1 block text-xl">{label}</span>
      <input
        {...props}
        className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-gray-900 text-xl focus:outline-none focus:ring-2 focus:ring-brand"
      />
    </label>
  );
}

export function Select({ label, children, ...props }) {
  return (
    <label className="block text-lg p-2">
      <span className="text-gray-700 font-semibold mb-1 block">{label}</span>
      <select
        {...props}
        className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-gray-900 text-xl focus:outline-none focus:ring-2 focus:ring-brand"
      >
        {children}
      </select>
    </label>
  );
}

export function Button({ children, variant = 'primary', ...props }) {
  const variants = {
    primary: 'bg-[#6E2430] hover:bg-[#963041] text-white',
    success: 'bg-success hover:bg-green-700 text-white',
    danger: 'bg-muted hover:bg-gray-700 text-white',
    outline: 'border border-gray-300 text-gray-700 hover:bg-gray-50',
    maroon: 'bg-[#6E2430] text-white'
  };
  return (
    <button
      {...props}
      className={`rounded-md px-6 py-2 text-2xl font-medium transition ${variants[variant]} disabled:opacity-50`}
    >
      {children}
    </button>
  );
}

export function Table({ head, children }) {
  return (
    <div className="max-h-[530px] overflow-y-auto overflow-x-auto rounded-lg">
      <table className="w-full min-w-[1000px] text-xl text-left text-gray-900 border border-gray-300">
        
        <thead className="sticky top-0 z-20 bg-[#FFD7D7] w-full">
          <tr className="border-b border-gray-400 text-xl uppercase tracking-wide text-brand ">
            {head.map((h, i) => (
              <th
                key={i}
                className="px-5 py-3 font-bold bg-[#FFD7D7]"
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>

        <tbody className="divide-y divide-gray-100 text-muted">
          {children}
        </tbody>

      </table>
    </div>
  );
}

export function Stat({ label, value, note, noteTone = 'text-success' }) {
  return (
    <div className="bg-white rounded-lg border-l-4 border-black shadow-sm p-4">
      <div className="text-xl font-bold tracking-wide text-head">{label}</div>
      <div className="text-[40px] leading-tight font-extrabold text-ink">{value}</div>
      {note && <div className={`text-xl font-semibold ${noteTone}`}>{note}</div>}
    </div>
  );
}

export function Spinner() {
  return <div className="flex justify-center py-10 text-gray-400">Loading…</div>;
}

export function BarChart({ title, rows }) {
  const barColors = [
    'bg-[#741F2D]',
    'bg-[#2563EB]',
    'bg-[#16A34A]',
    'bg-[#D97706]',
    'bg-[#7C3AED]',
    'bg-[#DB2777]',
    'bg-[#0891B2]',
  ];
}