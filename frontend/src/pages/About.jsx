import { Link } from 'react-router-dom';
import { useEffect, useState } from 'react';
import {
  Users,
  Home,
  Wallet,
  HeartPulse,
  GraduationCap,
} from 'lucide-react';
import { api } from '../lib/api';

const DATA_TOPICS = [
  { label: 'Demographic', Icon: Users },
  { label: 'Economic', Icon: Wallet },
  { label: 'Health', Icon: HeartPulse },
  { label: 'Education', Icon: GraduationCap },
  { label: 'Housing', Icon: Home },
];

export default function About() {
  const [stats, setStats] = useState({
    totalHouseholds: 0,
    totalResidents: 0,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    const loadStats = async () => {
      try {
        setLoading(true);

        // Must be a PUBLIC endpoint (no authentication required).
        const data = await api.get('/public/stats');

        const totalHouseholds =
          Number(
            data?.totalHouseholds ??
              data?.total_households ??
              data?.households ??
              0
          ) || 0;

        const totalResidents =
          Number(
            data?.totalResidents ??
              data?.total_residents ??
              data?.residents ??
              0
          ) || 0;

        if (mounted) setStats({ totalHouseholds, totalResidents });
      } catch (error) {
        // The page stays usable if the stats endpoint is unavailable.
        console.error('Failed to load public About statistics:', error);
        if (mounted) setStats({ totalHouseholds: 0, totalResidents: 0 });
      } finally {
        if (mounted) setLoading(false);
      }
    };

    loadStats();

    return () => {
      mounted = false;
    };
  }, []);

  const show = (n) => (loading ? '—' : n.toLocaleString());

  const navItem =
    'rounded-md px-3 py-2 text-sm font-semibold text-white/85 transition hover:bg-white/10 ' +
    'hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white md:text-2xl';
  const navActive = 'bg-white/15 text-white';

  return (
    <div className="flex min-h-screen flex-col bg-[#3a1219] lg:h-screen lg:overflow-hidden">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500;9..144,700&display=swap');
        .about-display { font-family: 'Fraunces', Georgia, serif; }
      `}</style>

      {/* HEADER */}
      <header className="relative z-30 flex shrink-0 items-center gap-2 bg-[#6E2430] px-4 py-3 shadow-md md:px-10">
        <Link
          to="/login"
          className="mr-auto flex items-center gap-3 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
        >
          <img
            src="/blpic-logo.png"
            alt="BLPIC-HD logo"
            className="h-10 w-10 rounded-full bg-white object-cover ring-2 ring-white/70 md:h-12 md:w-12"
          />
          <span className="text-xl font-extrabold tracking-tight text-white md:text-2xl">
            BLPIC-HD
          </span>
        </Link>

        <nav className="flex items-center gap-1">
          <Link to="/login" className={navItem}>
            Home
          </Link>
          <Link
            to="/about"
            aria-current="page"
            className={`${navItem} ${navActive}`}
          >
            About
          </Link>
          <Link to="/contact" className={navItem}>
            Contact
          </Link>
        </nav>
      </header>

      {/* ONE-SCREEN CONTENT */}
      <main className="relative flex min-h-0 flex-1 items-center">
        <img
          src="/luina-background.png"
          alt=""
          aria-hidden="true"
          className="absolute inset-0 h-full w-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-r from-[#3a1219]/95 via-[#3a1219]/75 to-[#3a1219]/45" />

        <div className="relative mx-auto flex w-full max-w-6xl flex-col gap-5 px-5 py-6 md:px-10 lg:gap-6">
          {/* Title */}
          <div>
            <h1 className="about-display text-4xl font-bold leading-tight text-white lg:text-5xl">
              About Barangay Luinab
            </h1>
            <p className="mt-2 max-w-xl text-xl text-white/85 lg:text-xl">
              A barangay in Iligan City, and the community this system was
              built to serve.
            </p>
          </div>

          {/* Stats + description in one card */}
          <div className="overflow-hidden rounded-3xl bg-white shadow-2xl shadow-black/30 ring-1 ring-white/10">
            <div className="grid border-b border-[#EBD3D3] sm:grid-cols-2">
              <div className="flex items-center gap-4 p-5 lg:p-6">
                <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[#F8E9EB] text-[#6E2430]">
                  <Users className="h-6 w-6" aria-hidden="true" />
                </span>
                <div>
                  <p className="about-display text-4xl font-bold leading-none text-[#6E2430] lg:text-5xl">
                    {show(stats.totalResidents)}
                  </p>
                  <p className="mt-1.5 text-xl text-gray-600 lg:text-xl">
                    Residents recorded 
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-4 border-t border-[#EBD3D3] p-5 sm:border-t-0 lg:p-6">
                
                <div>
                  <p className="about-display text-4xl font-bold leading-none text-[#6E2430] lg:text-5xl">
                    
                  </p>
                  <p className="mt-1.5 text-xl text-gray-600 lg:text-xl">
                  </p>
                </div>
              </div>
            </div>

            <div className="grid gap-6 p-5 md:grid-cols-2 md:gap-10 lg:p-7">
              <div>
                <h2 className="about-display text-xl font-bold text-[#6E2430] lg:text-2xl">
                  The barangay
                </h2>
                <p className="mt-2 text-xl leading-relaxed text-gray-700 lg:text-[20px]">
                  Luinab is a barangay in the city of Iligan. The system keeps
                  household records covering demographic, economic, education,
                  housing, and other information to support community
                  profiling and social assistance planning.
                </p>
              </div>

              <div>
                <h2 className="about-display text-xl font-bold text-[#6E2430] lg:text-2xl">
                  Barangay Profiling &amp; Social Assistance
                </h2>
                <p className="mt-2 text-xl leading-relaxed text-gray-700 lg:text-[20px]">
                  An intelligent system for barangay officials to plan for
                  their community and direct social assistance where it is
                  needed, with all household data in one profile.
                </p>

                <ul className="mt-4 flex flex-wrap gap-2">
                  {DATA_TOPICS.map(({ label, Icon }) => (
                    <li
                      key={label}
                      className="flex items-center gap-1.5 rounded-full border border-[#EBD3D3] bg-[#FBF6F6] px-3 py-1.5 text-sm font-semibold text-[#6E2430]"
                    >
                      <Icon className="h-4 w-4" aria-hidden="true" />
                      {label}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}