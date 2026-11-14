import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

import {
  User,
  Lock,
  Eye,
  EyeOff,
  LogIn,
  AlertCircle,
  Loader2,
  ShieldCheck,
} from 'lucide-react';

const VALID_ROLES = ['admin', 'captain', 'staff'];

const inputBase =
  'w-full rounded-xl border border-gray-300 bg-white py-3.5 pl-14 text-base text-gray-900 ' +
  'placeholder:text-gray-400 transition focus:border-[#6E2430] focus:outline-none ' +
  'focus:ring-4 focus:ring-[#6E2430]/15';

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');

    try {
      const user = await login(username.trim(), password);

      const userRole = String(user?.roles || user?.role || '')
        .trim()
        .toLowerCase();

      if (!VALID_ROLES.includes(userRole)) {
        throw new Error(
          'Your account has no valid assigned role. Please contact the administrator.'
        );
      }

      navigate('/dashboard', { replace: true });
    } catch (err) {
      setError(err.message || 'Unable to sign in. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  const navItem =
    'rounded-md px-3 py-2 text-lg font-semibold text-white/85 transition hover:bg-white/10 ' +
    'hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white md:text-xl';

  return (
    <div className="flex min-h-screen flex-col bg-[#FBF6F6]">
      {/* HEADER */}
      <header className="sticky top-0 z-30 flex shrink-0 items-center gap-2 bg-[#6E2430] px-4 py-3 shadow-md md:px-10">
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
          <Link to="/about" className={navItem}>
            About
          </Link>
          <Link to="/contact" className={navItem}>
            Contact
          </Link>
        </nav>
      </header>

      <main className="grid flex-1 grid-cols-1 md:grid-cols-2">
        {/* LEFT: BARANGAY HALL PHOTO */}
        <section className="relative order-first h-56 overflow-hidden bg-[#3a1219] sm:h-72 md:h-auto">
          <img
            src="/luina-background.png"
            alt="Luinab Barangay Hall"
            className="absolute inset-0 h-full w-full object-cover"
          />

          {/* Maroon fade so the caption stays readable */}
          <div className="absolute inset-0 bg-gradient-to-t from-[#3a1219]/90 via-[#3a1219]/35 to-transparent" />

          <div className="absolute inset-x-0 bottom-0 p-6 md:p-10 lg:p-14">
            <h2 className="max-w-md text-2xl font-extrabold leading-tight text-white sm:text-3xl lg:text-4xl">
              Barangay Luinab, Iligan City
            </h2>
            <p className="mt-2 hidden max-w-md text-base leading-relaxed text-white/85 sm:block md:text-lg">
              Keep household records organized and make sure assistance reaches
              the families who need it most.
            </p>
          </div>
        </section>

        {/* RIGHT: SIGN IN */}
        <section
          className="relative flex items-center justify-center overflow-hidden bg-gradient-to-br from-[#7A2837] via-[#5A1C28] to-[#2E0B13] px-5 py-10 md:px-10 lg:px-16"
          style={{
            backgroundImage:
              'radial-gradient(circle at 1px 1px, rgba(255,255,255,0.08) 1px, transparent 0), linear-gradient(135deg, #7A2837 0%, #5A1C28 50%, #2E0B13 100%)',
            backgroundSize: '22px 22px, 100% 100%',
          }}
        >
          {/* Soft light glows */}
          <div className="pointer-events-none absolute -right-24 -top-24 h-80 w-80 rounded-full bg-[#E8B4BC]/20 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-28 -left-20 h-80 w-80 rounded-full bg-[#C9485B]/30 blur-3xl" />

          <div className="relative w-full max-w-xl overflow-hidden rounded-3xl bg-white shadow-2xl shadow-black/40 ring-1 ring-white/10">
            {/* Brand band */}
            <div className="relative bg-gradient-to-br from-[#8A2D3C] via-[#6E2430] to-[#4A1620] px-8 pb-12 pt-10 text-center">
              <div className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-white/10" />
              <div className="pointer-events-none absolute -bottom-12 -left-8 h-32 w-32 rounded-full bg-white/5" />

              <h1 className="relative text-3xl font-extrabold text-white md:text-4xl">
                Household Data
              </h1>
              <p className="relative mt-1.5 text-base text-white/80 md:text-lg">
                Intelligent Barangay Profiling
              </p>
            </div>

            {/* Logo overlapping the band */}
            <div className="relative z-10 -mt-10 flex justify-center">
              <div className="rounded-full bg-white p-1.5 shadow-lg ring-1 ring-[#6E2430]/10">
                <img
                  src="/blpic-logo.png"
                  alt="BLPIC-HD logo"
                  className="h-22 w-22 rounded-full object-cover"
                />
              </div>
            </div>

            <form onSubmit={submit} className="px-6 pb-8 pt-5 sm:px-9">
              <div className="mb-7 text-center">
                <h2 className="text-2xl font-bold text-gray-900">
                  Welcome back
                </h2>
                <p className="mt-1 text-lg text-gray-500">
                  Sign in with your barangay account to continue.
                </p>
              </div>

              {/* USERNAME */}
              <div className="mb-5">
                <label
                  htmlFor="username"
                  className="mb-2 block text-lg font-semibold text-gray-800"
                >
                  Username or email
                </label>

                <div className="relative">
                  <span className="pointer-events-none absolute left-2 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-lg bg-[#F8E9EB] text-[#6E2430]">
                    <User aria-hidden="true" className="h-5 w-5" />
                  </span>
                  <input
                    id="username"
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="Enter your username or email"
                    required
                    autoComplete="username"
                    className={`${inputBase} pr-4`}
                  />
                </div>
              </div>

              {/* PASSWORD */}
              <div className="mb-6">
                <label
                  htmlFor="password"
                  className="mb-2 block text-lg font-semibold text-gray-800"
                >
                  Password
                </label>

                <div className="relative">
                  <span className="pointer-events-none absolute left-2 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-lg bg-[#F8E9EB] text-[#6E2430]">
                    <Lock aria-hidden="true" className="h-5 w-5" />
                  </span>
                  <input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter your password"
                    required
                    autoComplete="current-password"
                    className={`${inputBase} pr-12`}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((s) => !s)}
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                    className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-2 text-gray-500 transition hover:bg-gray-100 hover:text-[#6E2430] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#6E2430]"
                  >
                    {showPassword ? (
                      <EyeOff className="h-5 w-5" />
                    ) : (
                      <Eye className="h-5 w-5" />
                    )}
                  </button>
                </div>
              </div>

              {/* ERROR */}
              {error && (
                <div
                  role="alert"
                  className="mb-5 flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-3.5 text-lg font-medium text-red-800"
                >
                  <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              {/* SUBMIT */}
              <button
                type="submit"
                disabled={busy}
                className="flex w-full items-center justify-center gap-2.5 rounded-xl bg-gradient-to-r from-[#7A2837] to-[#5A1C28] py-3.5 text-base font-bold text-white shadow-lg shadow-[#6E2430]/30 transition hover:brightness-110 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#6E2430]/30 disabled:cursor-not-allowed disabled:opacity-60 md:text-lg"
              >
                {busy ? (
                  <>
                    <Loader2 className="h-5 w-5 animate-spin" />
                    Signing in…
                  </>
                ) : (
                  <>
                    <LogIn className="h-5 w-5" />
                    Sign in
                  </>
                )}
              </button>

              <p className="mt-8 flex items-center justify-center gap-1.5 text-center text-lg text-gray-500">
                <ShieldCheck className="h-6 w-6 text-[#6E2430]" />
                Authorized barangay personnel only
              </p>
            </form>
          </div>
        </section>
      </main>
    </div>
  );
}