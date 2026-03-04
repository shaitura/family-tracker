import { ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Home, List, PlusCircle, BarChart2, Shield, Settings, Database } from 'lucide-react';
import { cn } from '@/lib/utils';
import { createPageUrl } from '@/utils';

const NAV_ITEMS = [
  { label: 'בית', icon: Home, href: createPageUrl('Home') },
  { label: 'עסקאות', icon: List, href: createPageUrl('Transactions') },
  { label: 'הוסף', icon: PlusCircle, href: createPageUrl('AddTransaction'), accent: true },
  { label: 'דוחות', icon: BarChart2, href: createPageUrl('Reports') },
  { label: 'נכסים', icon: Shield, href: createPageUrl('Assets') },
  { label: 'Admin', icon: Database, href: '/admin' },
  { label: 'הגדרות', icon: Settings, href: createPageUrl('Settings') },
];

export default function Layout({ children }: { children: ReactNode }) {
  const location = useLocation();

  return (
    <div className="min-h-screen flex flex-col" dir="rtl">
      {/* Header */}
      <header className="fixed top-0 inset-x-0 z-40 h-14 flex items-center justify-center glass-dark border-b border-white/10">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-cyan-500 via-purple-500 to-pink-500 flex items-center justify-center shadow-lg shadow-purple-500/30">
            <span className="text-white font-black text-xs">FT</span>
          </div>
          <span className="text-base font-bold gradient-text tracking-tight">Family Tracker</span>
        </div>
      </header>

      {/* Content */}
      <main className="flex-1 pt-14 pb-20 overflow-y-auto">
        <div className={location.pathname === '/admin' ? 'h-full' : 'max-w-md mx-auto px-4 py-4'}>
          {children}
        </div>
      </main>

      {/* Bottom Nav */}
      <nav className="fixed bottom-0 inset-x-0 z-40 h-16 glass-dark border-t border-white/10">
        <div className="max-w-md mx-auto h-full flex items-center justify-around px-2">
          {NAV_ITEMS.map(({ label, icon: Icon, href, accent }) => {
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
                <Icon className={cn('w-5 h-5', accent && 'text-white')} strokeWidth={accent || active ? 2.5 : 1.8} />
                <span className={cn('text-[10px] font-medium', accent ? 'text-white' : active ? 'text-cyan-400' : 'text-white/40')}>
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
