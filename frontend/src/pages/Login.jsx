import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Mail, Lock, User, Eye, EyeOff, LogIn, Building2, ChevronDown } from 'lucide-react';

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      if (!role) throw new Error('Please select a role (Admin, Captain, or Staff).');
      const user = await login(email.trim(), password);
      if (user.roles !== role) throw new Error(`Credentials are for role "${user.roles}", not "${role}".`);
      navigate('/dashboard');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const quick = (u, p, r) => {
    setEmail(u);
    setPassword(p);
    setRole(r);
  };

  const navItem = 'text-white text-[20px] font-bold hover:text-red-200';

  return (
    <div className="relative min-h-screen bg-[#6E2430] flex flex-col">
      <img
        src="/luina-background.png"
        alt=""
        className="absolute inset-0 h-full w-full object-cover"
      />

      <header className="relative z-10 flex items-center gap-10 px-16 py-4 bg-[#6E2430] shrink-0">
        <Link to="/login" className="flex items-center gap-3 mr-auto">
          <img src="/blpic-logo.png" alt="BLPIC-HD" className="h-14 w-14 rounded-full object-cover" />
          <span className="text-3xl font-bold text-white">BLPIC-HD</span>
        </Link>
        <Link to="/login" className={navItem}>HOME</Link>
        <Link to="/about" className={navItem}>ABOUT</Link>
        <Link to="/contact" className={navItem}>CONTACT</Link>
      </header>

      <div className="relative z-10 flex-1 flex items-center justify-center px-4 py-10">
        <form
          onSubmit={submit}
          className="bg-[#E2BEBE]/70 rounded-[10px] border-[3px] border-black p-10 w-full max-w-2xl flex flex-col items-center backdrop-blur-sm"
        >
          <Building2 className="h-14 w-14 text-maroon mb-2" strokeWidth={1.5} />
          <h1 className="text-[40px] leading-tight font-extrabold text-maroon text-center">Household Data</h1>
          <p className="text-[20px] text-gray-700 mb-6 text-center">Intelligence Barangay Profiling</p>

          <label className="block text-lg mb-3 w-full">
            <span className="font-bold text-black">EMAIL</span>
            <div className="relative mt-1">
              <Mail className="absolute left-4 top-1/2 -translate-y-1/2 h-8 w-8 text-blue-800" />
              <input
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="@gmail.com"
                required
                className="w-full rounded-lg border border-gray-300 pl-15 pr-4 py-2.5 text-xl bg-white focus:outline-none focus:ring-2 focus:ring-brand"
              />
            </div>
          </label>

          <label className="block text-lg mb-3 w-full">
            <span className="font-bold text-black">PASSWORD</span>
            <div className="relative mt-1">
              <Lock className="absolute left-4 top-1/2 -translate-y-1/2 h-8 w-8 text-blue-800" />
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••"
                required
                className="w-full rounded-lg border border-gray-300 pl-15 pr-12 py-2.5 text-lg bg-white focus:outline-none focus:ring-2 focus:ring-brand"
              />
              <button
                type="button"
                onClick={() => setShowPassword((s) => !s)}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-black hover:text-gray-600"
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? <EyeOff className="h-8 w-8" /> : <Eye className="h-8 w-8" />}
              </button>
            </div>
          </label>

          <label className="block text-lg mb-4 w-full">
            <span className="font-bold text-black">ROLE</span>
            <div className="relative mt-1">
  <User className="absolute left-4 top-1/2 -translate-y-1/2 h-8 w-8 text-blue-800" />

  <select
    value={role}
    onChange={(e) => setRole(e.target.value)}
    className="w-full appearance-none rounded-lg border border-gray-300 bg-white pl-15 pr-10 py-2.5 text-xl text-black focus:outline-none focus:ring-2 focus:ring-brand"
  >
    <option value="" disabled>
      Select Role
    </option>
    <option value="admin">Admin</option>
    <option value="captain">Captain</option>
    <option value="staff">Staff</option>
  </select>

  <ChevronDown
  className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-black"
  width={35}
  height={35}
  strokeWidth={2.5}
/>
</div>
          </label>

          {error && <p className="text-sm text-brand mb-2 font-semibold text-center">{error}</p>}

          <button
            disabled={busy}
            className="w-full flex items-center justify-center gap-2 rounded-lg bg-[#6E2430] hover:bg-brand-dark text-white py-3 text-lg font-bold disabled:opacity-50"
          >
            <LogIn className="h-8 w-8" />
            {busy ? 'Signing in…' : 'Sign In'}
          </button>

        </form>
      </div>
    </div>
  );
}