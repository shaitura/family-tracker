import React from 'react';
import ReactDOM from 'react-dom/client';
import { HashRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from '@/components/ui/toaster';
import Assets from '@/pages/Assets';
import { base44 } from '@/lib/base44Client';
import '@/index.css';

// The real Assets page with its two queries pre-filled, so percent mode can be
// checked in a real browser without Firestore. staleTime: Infinity keeps the
// page from ever calling the real queryFn.
//
// The figures are chosen to be recognisable: every amount contains a run of
// digits ("123,457", "8,765"...) that verify-assets.mjs hunts for in percent
// mode. One holding is tiny (<1% of the whole) and one insurance policy has
// matching payments, so the hidden-payments path is exercised too.
const assets = [
  { id: 'a1', owner: 'Shi',   asset_class: 'נכס/השקעה', type: 'ניירות ערך',  provider: 'IBI',    product_name: 'תיק מסחר',      balance: 1234567, risk_level: 'מנייתי' },
  { id: 'a2', owner: 'Ortal', asset_class: 'נכס/השקעה', type: 'קרן השתלמות', provider: 'מיטב',  product_name: 'השתלמות אורטל', balance: 345678,  risk_level: 'כללי' },
  { id: 'a3', owner: 'Joint', asset_class: 'נכס/השקעה', type: 'נדל"ן',       provider: 'דירה',   product_name: 'דירה בחיפה',    balance: 2109876, risk_level: 'נדל"ן' },
  { id: 'a4', owner: 'Yuval', asset_class: 'נכס/השקעה', type: 'חיסכון לכל ילד', provider: 'הראל', product_name: 'חיסכון יובל', balance: 9876 },
  // A second fund of an existing type: the by-type grouping needs a group of
  // more than one card, and this one is larger than a2, so it must lead its group.
  { id: 'a5', owner: 'Shi',   asset_class: 'נכס/השקעה', type: 'קרן השתלמות', provider: 'אלטשולר', product_name: 'השתלמות שי', balance: 456789, risk_level: 'מנייתי' },
  // No balance at all: its group has a zero total and must still render, last.
  { id: 'a6', owner: 'Joint', asset_class: 'נכס/השקעה', type: 'עו"ש',        provider: 'לאומי',  product_name: 'עו"ש משותף' },
  { id: 'i1', owner: 'Shi',   asset_class: 'ביטוח/קרן', type: 'בריאות',      provider: 'הפניקס', product_name: 'בריאות שי',     policy_number: '55443322', monthly_premium: 387, end_date: '2027-06-30' },
  { id: 'i2', owner: 'Ortal', asset_class: 'ביטוח/קרן', type: 'ריסק',        provider: 'מגדל',   product_name: 'ריסק אורטל',    monthly_premium: 159, end_date: '2026-11-30' },
  { id: 'i3', owner: 'Joint', asset_class: 'ביטוח/קרן', type: 'מבנה + תכולה', provider: 'ביטוח ישיר', product_name: 'דירה',      monthly_premium: 213 },
  { id: 'i4', owner: 'Shi',   asset_class: 'ביטוח/קרן', type: 'פנסיה',       provider: 'כלל',    product_name: 'פנסיה שי',      monthly_premium: 2468 },
];
const transactions = ['2026-10-05', '2026-09-05', '2026-08-05'].map((date, i) => ({
  id: `t${i}`, date, type: 'expense', category: 'ביטוחים', amount: 391, notes: 'הפניקס פוליסה 55443322',
}));

// The Asset entity talks to Firestore; here its delete and filter work on the
// in-memory seed instead, and every deleted id is recorded in __DELETED__ so
// the check can assert exactly which asset was removed (and that cancel removed
// nothing). The invalidate after a delete refetches through filter().
(window as any).__DELETED__ = [] as string[];
base44.entities.Asset.delete = async (id: string) => {
  // window.__FAIL_DELETE__ = true simulates a rejected write (offline, rules).
  if ((window as any).__FAIL_DELETE__) throw new Error('harness: simulated delete failure');
  (window as any).__DELETED__.push(id);
  const i = assets.findIndex((a) => a.id === id);
  if (i >= 0) assets.splice(i, 1);
};
base44.entities.Asset.filter = async () => [...assets] as any;

const qc = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity, retry: false } } });
qc.setQueryData(['assets'], assets);
qc.setQueryData(['transactions'], transactions);
(window as any).__ASSETS_SEED__ = { assets, transactions };

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={qc}>
      <Toaster>
        <HashRouter>
          <div className="max-w-xl mx-auto p-4">
            <Assets />
          </div>
        </HashRouter>
      </Toaster>
    </QueryClientProvider>
  </React.StrictMode>,
);
