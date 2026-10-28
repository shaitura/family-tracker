import React from 'react';
import ReactDOM from 'react-dom/client';
import { HashRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from '@/components/ui/toaster';
import Layout from '@/components/Layout';
import ErrorBoundary from '@/components/ErrorBoundary';
import Transactions from '@/pages/Transactions';
import '@/index.css';

// The real Layout + Expenses page (only the data hook is swapped), so the
// search crash and the sticky search row can be checked in a real browser.
// #/boom renders a component that throws, to exercise the ErrorBoundary.
function Boom(): JSX.Element { throw new Error('harness: deliberate render error'); }

const user = { name: 'Harness', email: 'harness@example.test', photo: '' } as any;

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={new QueryClient()}>
      <Toaster>
        <HashRouter>
          <Layout user={user} onLogout={() => {}}>
            <ErrorBoundary>
              <Routes>
                <Route path="/" element={<Transactions />} />
                <Route path="/boom" element={<Boom />} />
              </Routes>
            </ErrorBoundary>
          </Layout>
        </HashRouter>
      </Toaster>
    </QueryClientProvider>
  </React.StrictMode>,
);
