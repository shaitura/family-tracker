// Deterministic seed for the reports-page live harness.
// Amounts are month-indexed so any total is uniquely decodable, and two
// deliberate outliers sit OUTSIDE the short windows: if a period slicer is not
// filtering, the KPI shows a six-figure number instead of a four-figure one.
export const MONTHS = (() => {
  const out = [];
  for (let y = 2024; y <= 2026; y++) {
    for (let m = 1; m <= 12; m++) {
      const key = `${y}-${String(m).padStart(2, '0')}`;
      if (key > '2026-08') break;
      out.push(key);
    }
  }
  return out;
})();

export function buildSeed() {
  const txs = [];
  let n = 0;
  const push = (t) => txs.push({ id: `t${++n}`, status: 'paid', payment_method: 'אשראי', ...t });
  MONTHS.forEach((m, i) => {
    push({ date: `${m}-05`, type: 'expense', category: 'מצרכים',  amount: 1000 + i, payer: 'Shi',   expense_class: 'קבועה'  });
    push({ date: `${m}-11`, type: 'expense', category: 'פנאי',    amount: 2000 + i, payer: 'Ortal', expense_class: 'משתנה' });
    push({ date: `${m}-17`, type: 'expense', category: 'ילדים',   amount:  300 + i, payer: 'Joint', expense_class: 'משתנה', child: 'Yuval' });
    push({ date: `${m}-02`, type: 'income',  category: 'משכורת',  amount: 5000 + i, payer: 'Shi',   expense_class: 'קבועה'  });
    push({ date: `${m}-20`, type: 'income',  category: 'בונוס',   amount:  700 + i, payer: 'Ortal', expense_class: 'משתנה' });
  });
  // Traps — loud values in months no short window should reach.
  push({ date: '2024-03-09', type: 'expense', category: 'שונות', amount: 999999, payer: 'Joint', expense_class: 'משתנה' });
  push({ date: '2025-07-09', type: 'income',  category: 'מתנה',  amount: 888888, payer: 'Joint', expense_class: 'משתנה' });
  return txs;
}
