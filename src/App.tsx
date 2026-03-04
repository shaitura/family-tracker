import { useState } from 'react';
import { HashRouter as BrowserRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { GoogleOAuthProvider } from '@react-oauth/google';
import { Toaster } from '@/components/ui/toaster';
import Layout from '@/components/Layout';
import LoginScreen from '@/components/LoginScreen';
import { getSession, clearSession, UserInfo } from '@/lib/auth';
import Home from '@/pages/Home';
import AddTransaction from '@/pages/AddTransaction';
import Transactions from '@/pages/Transactions';
import Reports from '@/pages/Reports';
import MonthlyReports from '@/pages/MonthlyReports';
import Assets from '@/pages/Assets';
import Import from '@/pages/Import';
import Settings from '@/pages/Settings';
import Admin from '@/pages/Admin';

// ─── הכנס כאן את ה-Client ID מ-Google Cloud Console ─────────────────────────
// הוראות: https://console.cloud.google.com → APIs & Services → Credentials
// צור OAuth 2.0 Client ID מסוג "Web application"
// הוסף ל-Authorized JavaScript origins: https://shaitura.github.io
const GOOGLE_CLIENT_ID = 'YOUR_GOOGLE_CLIENT_ID.apps.googleusercontent.com';
// ─────────────────────────────────────────────────────────────────────────────

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 1000 * 30, retry: false } },
});

export default function App() {
  const [user, setUser] = useState<UserInfo | null>(() => getSession());

  function handleLogout() {
    clearSession();
    setUser(null);
  }

  return (
    <GoogleOAuthProvider clientId={GOOGLE_CLIENT_ID}>
      {!user ? (
        <LoginScreen onLogin={setUser} />
      ) : (
        <QueryClientProvider client={queryClient}>
          <Toaster>
            <BrowserRouter>
              <Layout user={user} onLogout={handleLogout}>
                <Routes>
                  <Route path="/" element={<Home />} />
                  <Route path="/add-transaction" element={<AddTransaction />} />
                  <Route path="/transactions" element={<Transactions />} />
                  <Route path="/reports" element={<Reports />} />
                  <Route path="/monthly-reports" element={<MonthlyReports />} />
                  <Route path="/assets" element={<Assets />} />
                  <Route path="/import" element={<Import />} />
                  <Route path="/settings" element={<Settings />} />
                  <Route path="/admin" element={<Admin />} />
                </Routes>
              </Layout>
            </BrowserRouter>
          </Toaster>
        </QueryClientProvider>
      )}
    </GoogleOAuthProvider>
  );
}
