import { Link } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { api } from '../lib/api';

export default function About() {
  const [stats, setStats] = useState({
    totalHouseholds: 0,
    totalResidents: 0,
  });

  const [loading, setLoading] = useState(true);

  const navItem =
    'relative z-50 cursor-pointer text-white text-[22px] font-bold hover:text-red-200 transition-colors';

  useEffect(() => {
    let mounted = true;

    const loadStats = async () => {
      try {
        setLoading(true);

        /*
         * IMPORTANT:
         * This must be a PUBLIC backend endpoint.
         * Do not use /households here because /households
         * requires authentication.
         */
        const data = await api.get('/public/stats');

        console.log('ABOUT PUBLIC STATS RESPONSE:', data);

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

        if (mounted) {
          setStats({
            totalHouseholds,
            totalResidents,
          });
        }
      } catch (error) {
        /*
         * The About page must remain usable even if
         * the public statistics endpoint is unavailable.
         */
        console.error('Failed to load public About statistics:', error);

        if (mounted) {
          setStats({
            totalHouseholds: 0,
            totalResidents: 0,
          });
        }
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    };

    loadStats();

    return () => {
      mounted = false;
    };
  }, []);

  const totalHouseholds = stats.totalHouseholds;
  const totalResidents = stats.totalResidents;

  return (
    <div className="relative min-h-screen bg-[#6E2430] flex flex-col overflow-hidden">
      {/* Background */}
      <img
        src="/luina-background.png"
        alt=""
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 h-full w-full object-cover"
      />

      {/* Header */}
      <header className="relative z-50 flex items-center gap-10 px-16 py-4 bg-[#6E2430] shrink-0">
        {/* Logo */}
        <Link
          to="/login"
          className="relative z-50 flex items-center gap-3 mr-auto"
        >
          <img
            src="/blpic-logo.png"
            alt="BLPIC-HD"
            className="h-14 w-14 rounded-full object-cover"
          />

          <span className="text-3xl font-bold text-white">
            BLPIC-HD
          </span>
        </Link>

        {/* Navigation */}
        <Link
          to="/login"
          className={navItem}
        >
          HOME
        </Link>

        <Link
          to="/about"
          className={navItem}
          aria-current="page"
        >
          ABOUT
        </Link>

        <Link
          to="/contact"
          className={navItem}
        >
          CONTACT
        </Link>
      </header>

      {/* Main */}
      <section className="relative z-10 flex-1 flex items-start justify-center px-4 py-20">
        <style>{`
          @import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,600&display=swap');

          .about-display {
            font-family: 'Fraunces', serif;
          }
        `}</style>

        <div className="w-full max-w-7xl border-[3px] border-black rounded-[10px] bg-[#E2BEBE]/70 backdrop-blur-sm overflow-hidden">

          {/* Heading */}
          <div className="px-10 pt-10 pb-8 border-b-[3px] border-black">
            <h1 className="about-display text-center text-[42px] leading-none font-semibold text-maroon">
              About Barangay Luinab
            </h1>

          </div>

          {/* Body */}
          <div className="grid md:grid-cols-[1fr_3px_1fr]">

            {/* Left */}
            <div className="px-10 py-9">

              {/* Residents */}
              <div className="about-display text-[70px] leading-none text-maroon">
                {loading
                  ? '—'
                  : totalResidents.toLocaleString()}
              </div>

              <p className="mt-2 text-2xl text-black font-semibold">
                Residents recorded in the system
              </p>

              <p className="mt-6 text-[23px] leading-relaxed text-black">
                Luinab is a barangay in the city of Iligan. The system
                maintains household records containing demographic,
                economic, education, housing, and other information
                to support community profiling and social assistance
                planning.
              </p>

              {/* Household count */}
              <div className="mt-6">
                <div className="text-4xl about-display text-maroon">
                  {loading
                    ? '—'
                    : totalHouseholds.toLocaleString()}
                </div>

                <p className="mt-1 text-2xl text-black">
                  Households recorded
                </p>
              </div>
            </div>

            {/* Divider */}
            <div className="hidden md:block bg-black" />

            {/* Right */}
            <div className="px-10 py-9">

              <h2 className="about-display text-[30px] text-maroon">
                Barangay Profiling &amp; Social Assistance
              </h2>

              <p className="mt-4 text-[25px] leading-relaxed text-black">
                An intelligent system for barangay officials to plan
                for their community and direct social assistance where
                it is needed. It brings together demographic, economic,
                health, education, and housing data into one household
                profile, built to make community planning clearer and
                assistance decisions more informed.
              </p>

            </div>

          </div>
        </div>
      </section>
    </div>
  );
}