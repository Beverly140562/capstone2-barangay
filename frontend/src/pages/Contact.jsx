import { Link } from 'react-router-dom';
import { MapPin, Phone, Globe, ArrowUpRight } from 'lucide-react';

const CONTACTS = [
  {
    label: 'Address',
    value: 'Purok-2 Barangay Luinab, Iligan City, Philippines, 9200',
    href: 'https://www.google.com/maps/search/?api=1&query=Barangay+Luinab+Iligan+City',
    external: true,
    Icon: MapPin,
  },
  {
    label: 'Phone',
    value: '(063) 225-0765',
    href: 'tel:0632250765',
    external: false,
    Icon: Phone,
  },
  {
    label: 'Website',
    value: 'https://www.facebook.com',
    href: 'https://www.facebook.com',
    external: true,
    Icon: Globe,
  },
];

export default function Contact() {
  const navItem =
    'rounded-md px-3 py-2 text-sm font-semibold text-white/85 transition hover:bg-white/10 ' +
    'hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white md:text-xl';
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
          className="mr-auto flex items-center gap-5 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
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
          <Link
            to="/contact"
            aria-current="page"
            className={`${navItem} ${navActive}`}
          >
            Contact
          </Link>
        </nav>
      </header>

      {/* CONTENT */}
      <main className="relative flex min-h-0 flex-1 flex-col">
        <img
          src="/luina-background.png"
          alt=""
          aria-hidden="true"
          className="absolute inset-0 h-full w-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-r from-[#3a1219]/95 via-[#3a1219]/75 to-[#3a1219]/45" />

        <div className="relative mx-auto grid w-full max-w-6xl flex-1 items-center gap-8 px-5 py-10 md:px-10 lg:grid-cols-[1fr_1.15fr] lg:gap-14">
          {/* Title */}
          <div>
            <h1 className="about-display text-4xl font-bold leading-tight text-white md:text-5xl lg:text-6xl">
              Contact us
            </h1>
            <p className="mt-4 max-w-md text-lg leading-relaxed text-white/85 md:text-xl">
              Visit the barangay hall or reach the office using the details
              here.
            </p>
          </div>

          {/* Contact card */}
          <div className="overflow-hidden rounded-3xl bg-white shadow-2xl shadow-black/30 ring-1 ring-white/10">
            <ul className="divide-y divide-[#EBD3D3]">
              {CONTACTS.map(({ label, value, href, external, Icon }) => (
                <li key={label}>
                  <a
                    href={href}
                    {...(external
                      ? { target: '_blank', rel: 'noreferrer' }
                      : {})}
                    className="group flex items-center gap-5 p-6 transition hover:bg-[#FBF6F6] focus-visible:bg-[#FBF6F6] focus-visible:outline-none lg:p-7"
                  >
                    <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-[#F8E9EB] text-[#6E2430] transition group-hover:bg-[#6E2430] group-hover:text-white">
                      <Icon className="h-7 w-7" aria-hidden="true" />
                    </span>

                    <span className="min-w-0 flex-1">
                      <span className="block text-lg font-semibold text-gray-500">
                        {label}
                      </span>
                      <span className="mt-0.5 block break-words text-lg font-semibold text-gray-900 md:text-xl">
                        {value}
                      </span>
                    </span>

                    <ArrowUpRight
                      className="h-5 w-5 shrink-0 text-gray-400 transition group-hover:text-[#6E2430]"
                      aria-hidden="true"
                    />
                  </a>
                </li>
              ))}
            </ul>

            <p className="border-t border-[#EBD3D3] bg-[#FBF6F6] px-7 py-4 text-center text-lg text-gray-500">
              © 2026 Household Data IBP
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}