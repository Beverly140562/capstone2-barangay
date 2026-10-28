import { Link } from 'react-router-dom';
import { MapPin, Phone, Globe } from 'lucide-react';

export default function Contact() {
  const navItem = 'text-white text-[22px] font-bold hover:text-red-200';
  return (
    <div className="relative min-h-screen bg-maroon flex flex-col">
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

      <div className="relative z-10 flex-1 flex items-start justify-center px-4 py-20">
        <div className="w-full max-w-5xl bg-[#E2BEBE]/70 rounded-[10px] border-[3px] border-black p-10 backdrop-blur-sm">
          <h1 className="text-[50px] font-extrabold text-maroon text-center mb-15">Contact Us</h1>

          <div className="space-y-10 text-xl font-semibold text-gray-800 max-w-3xl mx-auto">
            <div className="flex items-center gap-3">
              <MapPin className="h-15 w-15 text-green-800 shrink-0" />
              <span className="underline text-2xl text-black">Purok-2 Barangay Luinab, Iligan City, Philippines, 9200</span>
            </div>
            <div className="flex items-center gap-3">
              <Phone className="h-15 w-15 text-blue-800 shrink-0" />
              <span className='text-2xl text-black'>(063) 225-0765</span>
            </div>
            <div className="flex items-center gap-3">
              <Globe className="h-15 w-15 text-blue-600 shrink-0" />
              <a href="https://www.facebook.com" target="_blank" rel="noreferrer" className="underline hover:text-brand text-2xl text-black">https://www.facebook.com</a>
            </div>
          </div>

          <p className="mt-16 text-2xl text-black text-center">© 2026 Household Data IBP</p>
        </div>
      </div>
    </div>
  );
}
