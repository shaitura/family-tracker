import { useState, useEffect } from 'react';
import { HashRouter as BrowserRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import { isAllowedEmail, toUserInfo, UserInfo } from '@/lib/auth';
import { Toaster } from '@/components/ui/toaster';
import Layout from '@/components/Layout';
import LoginScreen from '@/components/LoginScreen';
import Home from '@/pages/Home';
import AddTransaction from '@/pages/AddTransaction';
import Transactions from '@/pages/Transactions';
import Reports from '@/pages/Reports';
import MonthlyReports from '@/pages/MonthlyReports';
import Assets from '@/pages/Assets';
import Import from '@/pages/Import';
import Settings from '@/pages/Settings';
import Admin from '@/pages/Admin';
import AnnualAnalysis from '@/pages/AnnualAnalysis';

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 1000 * 30, retry: false } },
});

export default function App() {
  const [user, setUser] = useState<UserInfo | null | 'loading'>('loading');

  useEffect(() => {
    return onAuthStateChanged(auth, (firebaseUser) => {
      if (firebaseUser && isAllowedEmail(firebaseUser.email ?? '')) {
        setUser(toUserInfo(firebaseUser));
      } else {
        setUser(null);
      }
    });
  }, []);

  // ── Loading ──
  if (user === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900">
        <div className="w-10 h-10 border-2 border-white/20 border-t-white rounded-full animate-spin" />
      </div>
    );
  }

  // ── Not logged in ──
  if (!user) {
    return <LoginScreen />;
  }

  // ── App ──
  return (
    <QueryClientProvider client={queryClient}>
      <Toaster>
        <BrowserRouter>
          <Layout user={user} onLogout={() => signOut(auth)}>
            <Routes>
              <Route path="/"                  element={<Home />} />
              <Route path="/add-transaction"   element={<AddTransaction />} />
              <Route path="/transactions"      element={<Transactions />} />
              <Route path="/reports"           element={<Reports />} />
              <Route path="/monthly-reports"   element={<MonthlyReports />} />
              <Route path="/assets"            element={<Assets />} />
              <Route path="/import"            element={<Import />} />
              <Route path="/settings"          element={<Settings />} />
              <Route path="/annual-analysis"   element={<AnnualAnalysis />} />
              <Route path="/admin"             element={<Admin />} />
            </Routes>
          </Layout>
        </BrowserRouter>
      </Toaster>
    </QueryClientProvider>
  );
}
