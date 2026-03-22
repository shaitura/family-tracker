import { ReactNode, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  Home, List, ListPlus, BarChart2, Shield, Settings,
  Database, LogOut, TrendingUp, Maximize2, Minimize2, Camera, X, Mail, Download,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { createPageUrl } from '@/utils';
import { UserInfo } from '@/lib/auth';

const NAV_ITEMS = [
  { label: 'בית',     icon: Home,       href: createPageUrl('Home') },
  { label: 'הוצאות', icon: ListPlus,   href: createPageUrl('Transactions'), accent: true },
  { label: 'דוחות',  icon: BarChart2,  href: createPageUrl('Reports') },
  { label: 'שנתי',   icon: TrendingUp, href: '/annual-analysis' },
  { label: 'נכסים',  icon: Shield,     href: createPageUrl('Assets') },
  { label: 'Admin',  icon: Database,   href: '/admin', adminOnly: true },
  { label: 'הגדרות', icon: Settings,   href: createPageUrl('Settings'), headerOnly: true },
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
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);
  const [wideView, setWideView] = useState(true);
  const [screenshotDataUrl, setScreenshotDataUrl] = useState<string | null>(null);
  const [screenshotLoading, setScreenshotLoading] = useState(false);

  const takeScreenshot = async () => {
    setScreenshotLoading(true);
    try {
      const html2canvas = (await import('html2canvas')).default;
      const canvas = await html2canvas(document.body, {
        useCORS: true,
        allowTaint: true,
        scale: window.devicePixelRatio || 1,
        scrollY: 0,
        windowHeight: document.body.scrollHeight,
        height: document.body.scrollHeight,
      });
      setScreenshotDataUrl(canvas.toDataURL('image/png'));
    } catch (e) {
      console.error(e);
    }
    setScreenshotLoading(false);
  };

  const copyImageToClipboard = async (): Promise<boolean> => {
    try {
      const blob = await (await fetch(screenshotDataUrl!)).blob();
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
      return true;
    } catch { return false; }
  };

  const shareViaEmail = async () => {
    if (!screenshotDataUrl) return;
    const shared = await shareNative();
    if (!shared) {
      await copyImageToClipboard();
      window.open(`mailto:?subject=${encodeURIComponent('צילום מסך - Family Tracker')}&body=${encodeURIComponent('התמונה הועתקה ללוח — הדבק אותה כקובץ מצורף.')}`);
    }
  };

  const shareViaWhatsApp = async () => {
    if (!screenshotDataUrl) return;
    const shared = await shareNative();
    if (!shared) {
      const copied = await copyImageToClipboard();
      window.open(`https://web.whatsapp.com/`);
      if (copied) alert('התמונה הועתקה ללוח — פתח שיחה ב-WhatsApp Web והדבק (Ctrl+V / ⌘V).');
    }
  };

  const saveToDevice = () => {
    if (!screenshotDataUrl) return;
    const a = document.createElement('a');
    a.href = screenshotDataUrl;
    a.download = `family-tracker-${new Date().toISOString().slice(0, 10)}.png`;
    a.click();
  };

  const shareNative = async () => {
    if (!screenshotDataUrl) return;
    try {
      const blob = await (await fetch(screenshotDataUrl)).blob();
      const file = new File([blob], 'family-tracker.png', { type: 'image/png' });
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: 'Family Tracker' });
        return true;
      }
    } catch (e) { /* fall through */ }
    return false;
  };

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
          {/* Settings button */}
          <Link
            to={createPageUrl('Settings')}
            className="flex items-center gap-1.5 h-8 rounded-xl border border-white/15 bg-white/5 px-3 text-white/70 hover:text-white hover:bg-white/10 transition-colors"
            title="הגדרות"
          >
            <Settings size={14} />
          </Link>

          {/* Screenshot button */}
          <button
            onClick={takeScreenshot}
            disabled={screenshotLoading}
            className="flex items-center gap-1.5 h-8 rounded-xl border border-white/15 bg-white/5 px-3 text-white/70 hover:text-white hover:bg-white/10 transition-colors disabled:opacity-50"
            title="צלם מסך"
          >
            {screenshotLoading
              ? <span className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
              : <Camera size={14} />}
          </button>

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

      {/* ── Screenshot share modal ──────────────────────────────────────── */}
      {screenshotDataUrl && (
        <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-4 bg-black/70 backdrop-blur-sm" onClick={() => setScreenshotDataUrl(null)}>
          <div className="w-full max-w-sm bg-slate-900 border border-white/15 rounded-2xl shadow-2xl overflow-hidden" dir="rtl" onClick={(e) => e.stopPropagation()}>
            {/* Preview */}
            <div className="relative">
              <img src={screenshotDataUrl} alt="צילום מסך" className="w-full max-h-52 object-cover object-top" />
              <button onClick={() => setScreenshotDataUrl(null)} className="absolute top-2 left-2 w-7 h-7 rounded-full bg-black/60 flex items-center justify-center text-white hover:bg-black/80">
                <X size={14} />
              </button>
            </div>

            {/* Actions */}
            <div className="p-4 space-y-2">
              <p className="text-xs text-white/50 text-center mb-3">שתף את צילום המסך</p>

              {'share' in navigator && (
                <button
                  onClick={async () => { const ok = await shareNative(); if (!ok) saveToDevice(); }}
                  className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-gradient-to-r from-cyan-500 via-purple-500 to-pink-500 text-white text-sm font-semibold"
                >
                  <Camera size={16} /> שתף
                </button>
              )}

              <div className="grid grid-cols-3 gap-2">
                <button
                  onClick={() => shareViaWhatsApp()}
                  className="flex flex-col items-center gap-1 py-2.5 rounded-xl bg-green-500/20 border border-green-500/30 text-green-400 text-xs font-medium hover:bg-green-500/30 transition-colors"
                >
                  <span className="text-lg">💬</span>
                  WhatsApp
                </button>
                <button
                  onClick={() => shareViaEmail()}
                  className="flex flex-col items-center gap-1 py-2.5 rounded-xl bg-blue-500/20 border border-blue-500/30 text-blue-400 text-xs font-medium hover:bg-blue-500/30 transition-colors"
                >
                  <Mail size={18} />
                  מייל
                </button>
                <button
                  onClick={saveToDevice}
                  className="flex flex-col items-center gap-1 py-2.5 rounded-xl bg-white/10 border border-white/15 text-white/70 text-xs font-medium hover:bg-white/15 transition-colors"
                >
                  <Download size={18} />
                  שמור
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Bottom nav — mobile only ────────────────────────────────────── */}
      <nav className="fixed bottom-0 inset-x-0 z-40 h-[4.5rem] ls:h-11 glass-dark border-t border-white/10 md:hidden">
        <div className="h-full flex items-center justify-around px-1">
          {NAV_ITEMS.map(({ label, icon: Icon, href, accent, adminOnly, headerOnly }) => {
            if (adminOnly || headerOnly) return null;
            const active = location.pathname === href;
            const isTransactions = href === createPageUrl('Transactions');
            return (
              <Link
                key={href}
                to={href}
                onClick={active && isTransactions ? (e) => { e.preventDefault(); navigate(href, { state: { openForm: Date.now() } }); } : undefined}
                className={cn(
                  'flex flex-col items-center justify-center gap-1 flex-1 h-14 rounded-2xl transition-all duration-200',
                  accent
                    ? 'bg-gradient-to-br from-cyan-500 via-purple-500 to-pink-500 shadow-lg shadow-purple-500/30 scale-110 -mt-5 mx-1'
                    : active
                    ? 'text-cyan-400'
                    : 'text-white/40 hover:text-white/70',
                )}
              >
                <Icon
                  className={cn('w-6 h-6 ls:w-4 ls:h-4', accent && 'text-white')}
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
