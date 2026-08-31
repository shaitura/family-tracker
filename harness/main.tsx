import React from 'react';
import ReactDOM from 'react-dom/client';
import { Toaster } from '@/components/ui/toaster';
import Reports from '@/pages/Reports';
import '@/index.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Toaster>
      <div className="min-h-screen bg-slate-900 p-4">
        <Reports />
      </div>
    </Toaster>
  </React.StrictMode>,
);
