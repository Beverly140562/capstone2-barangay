import { NavLink, Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Archive, ChartColumnIncreasing, Check, CircleUserRound, ClipboardPen, FileStack, Gauge, HeartHandshake, LogOut, Newspaper, NotebookPen, UserRound } from 'lucide-react';
import NotificationBell from './NotificationBell';

const NAV = {
  admin: [
    { section: 'Overview', items: [{ to: '/dashboard', label: 'Dashboard', img: <Gauge className="w-10 h-10 inline-block text-white p-1.5 mr-2  " strokeWidth={3} /> }] },
    { section: 'Accounts', items: [{ to: '/users', label: 'User Accounts', img: <UserRound className="w-10 h-10 inline-block text-white p-1.5 mr-2  " strokeWidth={3} /> }] },
    {
      section: 'Household and Beneficiaries',
      items: [
        { to: '/validation', label: 'Validate Beneficiaries', img: <ClipboardPen className="w-10 h-10 inline-block text-white p-1.5 mr-2  " strokeWidth={3} /> },
        { to: '/beneficiaries', label: 'Approved Household', img: <Check className="w-8 h-8 inline-block text-[#6b1f33] p-1.5 mr-2 rounded-full bg-white " strokeWidth={3}/> },
        { to: '/programs', label: 'Assistance Program', img: <HeartHandshake className="w-10 h-10 inline-block text-white p-1.5 mr-2  " strokeWidth={3} /> }
      ]
    },
    {
      section: 'Insights',
      items: [
        { to: '/reports', label: 'Generate Report', img: <Newspaper className="w-10 h-10 inline-block text-white p-1.5 mr-2  " strokeWidth={3} /> },
        { to: '/analytics', label: 'Analytics', img: <ChartColumnIncreasing className="w-10 h-10 inline-block text-white p-1.5 mr-2  " strokeWidth={3} /> },     
        { to: '/history', label: 'History', img: <FileStack className="w-10 h-10 inline-block text-white p-1.5 mr-2  " strokeWidth={3} /> }
      ]
    }
  ],
  captain: [
    { section: 'Overview', items: [{ to: '/dashboard', label: 'Dashboard', img: <Gauge className="w-10 h-10 inline-block text-white p-1.5 mr-2  " strokeWidth={3} />}] },
    {
      section: 'Household and Beneficiaries',
      items: [{ to: '/approve', label: 'Approve Household Data', img: <Check className="w-8 h-8 inline-block text-[#6b1f33] p-1.5 mr-2 rounded-full bg-white " strokeWidth={3} />}] },
    { section: 'Insights', items: [{ to: '/analytics', label: 'Analytics', img: < ChartColumnIncreasing className="w-10 h-10 inline-block text-white p-1.5 mr-2  " strokeWidth={3} /> }] }
  ],
  staff: [
    { section: 'Overview', items: [{ to: '/dashboard', label: 'Dashboard', img: <Gauge className="w-10 h-10 inline-block text-white p-1.5 mr-2  " strokeWidth={3} /> }] },
    {
      section: 'Household and Beneficiaries',
      items: [
        { to: '/households', label: 'Household', img: <NotebookPen className="w-10 h-10 inline-block text-white p-1.5 mr-2  " strokeWidth={3} /> },
        { to: '/update', label: 'Update Records',img: <Archive className="w-10 h-10 inline-block text-white p-1.5 mr-2  " strokeWidth={3} /> },
        { to: '/suggestions', label: 'Assistance Program', img: <HeartHandshake className="w-10 h-10 inline-block text-white p-1.5 mr-2  " strokeWidth={3} /> }
      ]
    },
    { section: 'Insights', 
      items: [
        { to: '/reports', label: 'Generate Report', img: <Newspaper className="w-10 h-10 inline-block text-white p-1.5 mr-2  " strokeWidth={3} /> },
        { to: '/history', label: 'History', img: <FileStack className="w-10 h-10 inline-block text-white p-1.5 mr-2  " strokeWidth={3} /> }
      ]
    }
  ]
};

export default function Layout({ children }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const groups = NAV[user?.roles] || NAV.staff;

  const doLogout = () => {
    logout();
    navigate('/login');
  };

  const initials = (user?.surname || user?.username || '?').split(' ').map((s) => s[0]).slice(0, 2).join('');

  return (
    <div className="min-h-screen bg-page flex">
      {/* Sidebar */}
      <aside className="w-[340px] shrink-0 bg-[#6E2430] text-white flex flex-col sticky top-0 h-screen">
        <Link to="/dashboard" className="px-8 py-4 border-b border-white/12">
          <div className="text-3xl font-bold"><img src="/blpic-logo.png" alt="BLPIC-HD Logo" className="w-12 h-12 mr-3 inline-block" /> BLPIC-HD</div>
          <div className="text-sm mt-3 text-white text-[18px]">Intelligence Barangay Profiling</div>
        </Link>
        <nav className="flex-1 overflow-y-auto py-4">
          {groups.map((g) => (
            <div key={g.section} className="mb-4">
              <div className=" px-8 text-[14px] font-medium tracking-wide text-[#C0BEBE] uppercase">{g.section}</div>
              {g.items.map((i) => (
                <NavLink
                  key={i.to}
                  to={i.to}
                  className={({ isActive }) =>
                    ` block mt-3 px-8 py-2.5 text-[18px] transition ${isActive ? 'bg-[#963041] font-bold text-[18px] text-white border-l-4 border-brand' : 'hover:bg-[#963041]'}`
                  }
                >
                  {i.img}
                  {i.label}
                </NavLink>
              ))}
            </div>
          ))}
        </nav>
        <button onClick={doLogout} className="px-8 py-4 text-left text-xl font-semibold border-t border-white/10 hover:bg-[#963041]">
        <LogOut className="w-10 h-10 inline-block mr-2 text-white -scale-x-100" />
          Logout
        </button>
      </aside>

      {/* Main */}
      <main className="flex-1 min-w-0">

  {/* Fixed Top Bar */}
<div className="fixed top-0 left-85 right-0 z-50 flex items-center justify-between px-8 py-3 bg-[#6E2430] border-b border-white/10">
    <div>
      <div className="text-[20px] text-white">
        Barangay Luinab Iligan City, 9200
      </div>
    </div>

<div className="flex items-center gap-4 rounded-full px-4 py-2">

  {/* Notification */}
  <NotificationBell />

  {/* User */}
  <div className="flex items-center gap-3">
    <span className="flex h-10 w-10 items-center justify-center text-white">
      <CircleUserRound className="h-9 w-9" />
    </span>

    <span className="text-[22px] font-semibold text-white">
      {user?.roles} {user?.surname} {user?.given_name}
    </span>
  </div>

</div>
  </div>

  {/* Page Content */}
  <div className="px-8 pb-8 pt-[80px]">
    {children}
  </div>

</main>
    </div>
  );
}