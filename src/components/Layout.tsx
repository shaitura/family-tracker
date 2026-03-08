import { ReactNode, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  Home, List, PlusCircle, BarChart2, Shield, Settings,
  Database, LogOut, TrendingUp, Maximize2, Minimize2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { createPageUrl } from '@/utils';
import { UserInfo } from '@/lib/auth';

const NAV_ITEMS = [
  { label: 'בית',     icon: Home,       href: createPageUrl('Home') },
  { label: 'עסקאות', icon: List,       href: createPageUrl('Transactions') },
  { label: 'הוסף',   icon: PlusCircle, href: createPageUrl('AddTransaction'), accent: true },
  { label: 'דוחות',  icon: BarChart2,  href: createPageUrl('Reports') },
  { label: 'שנתי',   icon: TrendingUp, href: '/annual-analysis' },
  { label: 'נכסים',  icon: Shield,     href: createPageUrl('Assets') },
  { label: 'Admin',  icon: Database,   href: '/admin', adminOnly: true },
  { label: 'הגדרות', icon: Settings,   href: createPageUrl('Settings') },
];

export default function Layout({
  children,
  user,
  onLogout,
}: {
  children: ReactNode;
  user: UserInfo;
  onLogout: () => void;
}) {
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const [wideView, setWideView] = useState(true);

  const isAdmin = location.pathname === '/admin';

  // Content max-width: admin always full, else controlled by wideView toggle
  const contentClass = isAdmin
    ? 'h-full'
    : wideView
    ? 'w-full max-w-6xl mx-auto px-4 py-4'
    : 'w-full max-w-md mx-auto px-4 py-4';

  return (
    <div className="min-h-screen flex flex-col" dir="rtl">

      {/* ── Header ─────────────────────────────────────────────────────── */}
      <header className="fixed top-0 inset-x-0 z-40 h-14 ls:h-10 flex items-center justify-between px-4 glass-dark border-b border-white/10">
        {/* Logo */}
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-cyan-500 via-purple-500 to-pink-500 flex items-center justify-center shadow-lg shadow-purple-500/30">
            <span className="text-white font-black text-xs">FT</span>
          </div>
          <span className="text-base font-bold gradient-text tracking-tight">Family Tracker</span>
        </div>

        <div className="flex items-center gap-2">
          {/* Wide / Compact toggle — visible on tablet+ */}
          <button
            onClick={() => setWideView((v) => !v)}
            className="hidden md:flex items-center gap-1.5 h-8 rounded-xl border border-white/15 bg-white/5 px-3 text-white/70 hover:text-white hover:bg-white/10 transition-colors"
            title={wideView ? 'תצוגה מצומצמת' : 'תצוגה רחבה'}
          >
            {wideView ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
            <span className="text-xs hidden lg:inline">{wideView ? 'מצומצם' : 'רחב'}</span>
          </button>

          {/* User avatar + dropdown */}
          <div className="relative">
            <button
              onClick={() => setMenuOpen((v) => !v)}
              className="flex items-center gap-2 rounded-full focus:outline-none"
              title={user.name}
            >
              <img
                src={user.picture}
                alt={user.name}
                className="w-8 h-8 rounded-full border-2 border-white/20 object-cover"
                referrerPolicy="no-referrer"
              />
            </button>

            {menuOpen && (
              <div
                className="absolute left-0 top-10 bg-white rounded-xl shadow-xl border border-gray-100 py-1 w-44 z-50"
                dir="rtl"
              >
                <div className="px-3 py-2 border-b border-gray-100">
                  <p className="text-xs font-semibold text-gray-800 truncate">{user.name}</p>
                  <p className="text-[10px] text-gray-400 truncate">{user.email}</p>
                </div>
                <button
                  onClick={() => { setMenuOpen(false); onLogout(); }}
                  className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-600 hover:bg-red-50 transition-colors"
                >
                  <LogOut className="w-4 h-4" />
                  התנתק
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* ── Sidebar — tablet / desktop only ────────────────────────────── */}
      {/*
          RTL layout: sidebar is fixed on the RIGHT (the "start" side in Hebrew).
          On md  (768px+): icon-only, w-16.
          On lg (1024px+): icons + labels, w-52.
      */}
      <aside className="hidden md:flex flex-col fixed right-0 top-14 bottom-0 z-30 w-16 lg:w-52 glass-dark border-l border-white/10 overflow-y-auto">
        <nav className="flex flex-col gap-1 p-2 pt-4">
          {NAV_ITEMS.map(({ label, icon: Icon, href, accent, adminOnly }) => {
            const active = location.pathname === href;
            return (
              <Link
                key={href}
                to={href}
                title={label}
                className={cn(
                  'flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-200',
                  accent
                    ? 'bg-gradient-to-r from-cyan-500 via-purple-500 to-pink-500 text-white shadow-lg shadow-purple-500/30'
                    : active
                    ? 'bg-white/10 text-cyan-400'
                    : 'text-white/50 hover:text-white hover:bg-white/5',
                  adminOnly && 'mt-auto',
                )}
              >
                <Icon className="w-5 h-5 flex-shrink-0" strokeWidth={active || accent ? 2.5 : 1.8} />
                <span className="hidden lg:inline text-sm font-medium">{label}</span>
              </Link>
            );
          })}
        </nav>
      </aside>

      {/* ── Main content ────────────────────────────────────────────────── */}
      <main
        className={cn(
          'flex-1 overflow-y-auto',
          'pt-14 ls:pt-10',          // clear fixed header (slim in mobile-landscape)
          'pb-20 md:pb-4',           // clear bottom nav on mobile; small padding on desktop
          'md:mr-16 lg:mr-52',       // RTL: push left to make room for right-side sidebar
        )}
      >
        <div className={contentClass}>
          {children}
        </div>
      </main>

      {/* ── Bottom nav — mobile only ────────────────────────────────────── */}
      <nav className="fixed bottom-0 inset-x-0 z-40 h-16 ls:h-11 glass-dark border-t border-white/10 md:hidden">
        <div className="h-full flex items-center justify-around px-2">
          {NAV_ITEMS.map(({ label, icon: Icon, href, accent, adminOnly }) => {
            if (adminOnly) return null;
            const active = location.pathname === href;
            return (
              <Link
                key={href}
                to={href}
                className={cn(
                  'flex flex-col items-center justify-center gap-0.5 w-14 h-12 rounded-2xl transition-all duration-200',
                  accent
                    ? 'bg-gradient-to-br from-cyan-500 via-purple-500 to-pink-500 shadow-lg shadow-purple-500/30 scale-110 -mt-4'
                    : active
                    ? 'text-cyan-400'
                    : 'text-white/40 hover:text-white/70',
                )}
              >
                <Icon
                  className={cn('w-5 h-5 ls:w-4 ls:h-4', accent && 'text-white')}
                  strokeWidth={accent || active ? 2.5 : 1.8}
                />
                <span
                  className={cn(
                    'text-[10px] font-medium ls:hidden',
                    accent ? 'text-white' : active ? 'text-cyan-400' : 'text-white/40',
                  )}
                >
                  {label}
                </span>
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
