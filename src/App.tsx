import { HashRouter as BrowserRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from '@/components/ui/toaster';
import Layout from '@/components/Layout';
import Home from '@/pages/Home';
import AddTransaction from '@/pages/AddTransaction';
import Transactions from '@/pages/Transactions';
import Reports from '@/pages/Reports';
import MonthlyReports from '@/pages/MonthlyReports';
import Assets from '@/pages/Assets';
import Import from '@/pages/Import';
import Settings from '@/pages/Settings';

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 1000 * 30, retry: false } },
});

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <Toaster>
        <BrowserRouter>
          <Layout>
            <Routes>
              <Route path="/" element={<Home />} />
              <Route path="/add-transaction" element={<AddTransaction />} />
              <Route path="/transactions" element={<Transactions />} />
              <Route path="/reports" element={<Reports />} />
              <Route path="/monthly-reports" element={<MonthlyReports />} />
              <Route path="/assets" element={<Assets />} />
              <Route path="/import" element={<Import />} />
              <Route path="/settings" element={<Settings />} />
            </Routes>
          </Layout>
        </BrowserRouter>
      </Toaster>
    </QueryClientProvider>
  );
}
