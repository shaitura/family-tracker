import { Transaction, Budget, Asset, Category } from '@/types';

// ────────────────────────────────────────────────────────────────────────────
// localStorage helpers
// ────────────────────────────────────────────────────────────────────────────
const KEY = (name: string) => `ft_${name.toLowerCase()}`;

function getAll<T>(name: string): T[] {
  try {
    return JSON.parse(localStorage.getItem(KEY(name)) || '[]');
  } catch {
    return [];
  }
}

function saveAll<T>(name: string, data: T[]) {
  localStorage.setItem(KEY(name), JSON.stringify(data));
}

function newId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2);
}

// ────────────────────────────────────────────────────────────────────────────
// Generic entity factory
// ────────────────────────────────────────────────────────────────────────────
function makeEntity<T extends { id: string }>(name: string) {
  return {
    async filter(opts?: { filters?: { field: string; operator: string; value: unknown }[] }): Promise<T[]> {
      let data = getAll<T>(name);
      if (opts?.filters) {
        for (const f of opts.filters) {
          data = data.filter((item) => {
            const val = (item as Record<string, unknown>)[f.field];
            if (f.operator === 'eq') return val === f.value;
            if (f.operator === 'gte') return (val as number) >= (f.value as number);
            if (f.operator === 'lte') return (val as number) <= (f.value as number);
            return true;
          });
        }
      }
      return data;
    },
    async create(item: Omit<T, 'id'>): Promise<T> {
      const data = getAll<T>(name);
      const newItem = { ...item, id: newId() } as T;
      data.push(newItem);
      saveAll(name, data);
      return newItem;
    },
    async update(id: string, updates: Partial<T>): Promise<T> {
      const data = getAll<T>(name);
      const idx = data.findIndex((d) => d.id === id);
      if (idx === -1) throw new Error('Not found');
      data[idx] = { ...data[idx], ...updates };
      saveAll(name, data);
      return data[idx];
    },
    async delete(id: string): Promise<void> {
      const data = getAll<T>(name).filter((d) => d.id !== id);
      saveAll(name, data);
    },
  };
}

// ────────────────────────────────────────────────────────────────────────────
// Seed data
// ────────────────────────────────────────────────────────────────────────────
function seedData() {
  if (localStorage.getItem('ft_initialized')) return;

  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth() + 1;
  const pm = m === 1 ? 12 : m - 1;
  const pmy = m === 1 ? y - 1 : y;
  const fmt = (yr: number, mo: number, day: number) =>
    `${yr}-${String(mo).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

  const transactions: Omit<Transaction, 'id'>[] = [
    // Current month – incomes
    { date: fmt(y, m, 1), type: 'income', category: 'שונות', amount: 16000, payer: 'Shi', payment_method: 'העברה', expense_class: 'קבועה', notes: 'משכורת שי', status: 'paid' },
    { date: fmt(y, m, 1), type: 'income', category: 'שונות', amount: 12500, payer: 'Ortal', payment_method: 'העברה', expense_class: 'קבועה', notes: 'משכורת אורטל', status: 'paid' },
    // Current month – fixed expenses
    { date: fmt(y, m, 1), type: 'expense', category: 'דיור', amount: 5500, payer: 'Joint', payment_method: 'הוראת קבע', expense_class: 'קבועה', notes: 'שכירות דירה', status: 'paid' },
    { date: fmt(y, m, 1), type: 'expense', category: 'ילדים', amount: 1800, payer: 'Joint', payment_method: 'הוראת קבע', expense_class: 'קבועה', notes: 'גן ילדים', status: 'paid' },
    { date: fmt(y, m, 1), type: 'expense', category: 'ביטוחים', amount: 420, payer: 'Joint', payment_method: 'הוראת קבע', expense_class: 'קבועה', notes: 'ביטוח רכב', status: 'paid' },
    { date: fmt(y, m, 1), type: 'expense', category: 'תקשורת', amount: 250, payer: 'Joint', payment_method: 'הוראת קבע', expense_class: 'קבועה', notes: 'אינטרנט ופלאפון', status: 'paid' },
    { date: fmt(y, m, 1), type: 'expense', category: 'דיור', amount: 380, payer: 'Joint', payment_method: 'הוראת קבע', expense_class: 'קבועה', notes: 'ועד בית + ארנונה', status: 'paid' },
    // Current month – variable
    { date: fmt(y, m, 5), type: 'expense', category: 'סופר', amount: 920, payer: 'Ortal', payment_method: 'אשראי', expense_class: 'משתנה', notes: 'רמי לוי', status: 'paid' },
    { date: fmt(y, m, 7), type: 'expense', category: 'דלק', amount: 340, payer: 'Shi', payment_method: 'אשראי', expense_class: 'משתנה', notes: 'תדלוק', status: 'paid' },
    { date: fmt(y, m, 9), type: 'expense', category: 'מסעדות', amount: 285, payer: 'Shi', payment_method: 'אשראי', expense_class: 'משתנה', notes: 'אוכל בחוץ', status: 'paid' },
    { date: fmt(y, m, 12), type: 'expense', category: 'ביגוד', amount: 480, payer: 'Ortal', payment_method: 'אשראי', expense_class: 'משתנה', notes: 'קניות בגדים', status: 'paid' },
    { date: fmt(y, m, 14), type: 'expense', category: 'בריאות', amount: 220, payer: 'Shi', payment_method: 'ביט', expense_class: 'משתנה', notes: 'רופא שיניים', status: 'paid' },
    { date: fmt(y, m, 16), type: 'expense', category: 'פנאי', amount: 160, payer: 'Joint', payment_method: 'אשראי', expense_class: 'משתנה', notes: 'קולנוע', status: 'paid' },
    { date: fmt(y, m, 18), type: 'expense', category: 'מזון', amount: 75, payer: 'Shi', payment_method: 'מזומן', expense_class: 'משתנה', notes: 'קפה וחטיפים', status: 'paid' },
    { date: fmt(y, m, 20), type: 'expense', category: 'סופר', amount: 640, payer: 'Ortal', payment_method: 'אשראי', expense_class: 'משתנה', notes: 'שופרסל', status: 'paid' },
    // Previous month
    { date: fmt(pmy, pm, 1), type: 'income', category: 'שונות', amount: 16000, payer: 'Shi', payment_method: 'העברה', expense_class: 'קבועה', notes: 'משכורת שי', status: 'paid' },
    { date: fmt(pmy, pm, 1), type: 'income', category: 'שונות', amount: 12500, payer: 'Ortal', payment_method: 'העברה', expense_class: 'קבועה', notes: 'משכורת אורטל', status: 'paid' },
    { date: fmt(pmy, pm, 1), type: 'expense', category: 'דיור', amount: 5500, payer: 'Joint', payment_method: 'הוראת קבע', expense_class: 'קבועה', notes: 'שכירות', status: 'paid' },
    { date: fmt(pmy, pm, 3), type: 'expense', category: 'סופר', amount: 880, payer: 'Ortal', payment_method: 'אשראי', expense_class: 'משתנה', status: 'paid' },
    { date: fmt(pmy, pm, 8), type: 'expense', category: 'דלק', amount: 290, payer: 'Shi', payment_method: 'אשראי', expense_class: 'משתנה', status: 'paid' },
    { date: fmt(pmy, pm, 10), type: 'expense', category: 'מסעדות', amount: 340, payer: 'Shi', payment_method: 'אשראי', expense_class: 'משתנה', status: 'paid' },
    { date: fmt(pmy, pm, 15), type: 'expense', category: 'ילדים', amount: 1800, payer: 'Joint', payment_method: 'הוראת קבע', expense_class: 'קבועה', status: 'paid' },
    { date: fmt(pmy, pm, 18), type: 'expense', category: 'פנאי', amount: 240, payer: 'Ortal', payment_method: 'אשראי', expense_class: 'משתנה', status: 'paid' },
    { date: fmt(pmy, pm, 22), type: 'expense', category: 'ביגוד', amount: 350, payer: 'Shi', payment_method: 'אשראי', expense_class: 'משתנה', status: 'paid' },
  ];

  const withIds = transactions.map((t) => ({ ...t, id: newId() }));
  saveAll('transaction', withIds);

  const budget: Budget = {
    id: newId(),
    month: `${y}-${String(m).padStart(2, '0')}`,
    total_limit: 20000,
    category_limits: { סופר: 2000, דיור: 6000, דלק: 500, ילדים: 2500, מסעדות: 600, ביגוד: 500 },
    alert_threshold: 80,
  };
  saveAll('budget', [budget]);

  const assets: Omit<Asset, 'id'>[] = [
    { owner: 'Shi', type: 'פנסיה', provider: 'כלל', product_name: 'פנסיה מקיפה שי', policy_number: 'P123456', start_date: '2015-01-01', monthly_premium: 1200, annual_premium: 14400, balance: 285000 },
    { owner: 'Ortal', type: 'פנסיה', provider: 'מגדל', product_name: 'פנסיה מקיפה אורטל', policy_number: 'P234567', start_date: '2017-06-01', monthly_premium: 950, annual_premium: 11400, balance: 198000 },
    { owner: 'Shi', type: 'קרן השתלמות', provider: 'כלל', product_name: 'קרן השתלמות שי', policy_number: 'KH111', start_date: '2015-01-01', monthly_premium: 400, annual_premium: 4800, balance: 92000 },
    { owner: 'Ortal', type: 'קרן השתלמות', provider: 'הראל', product_name: 'קרן השתלמות אורטל', policy_number: 'KH222', start_date: '2017-06-01', monthly_premium: 320, annual_premium: 3840, balance: 68000 },
    { owner: 'Joint', type: 'חיים', provider: 'מנורה', product_name: 'ביטוח חיים משותף', policy_number: 'BL333', start_date: '2018-03-01', monthly_premium: 180, annual_premium: 2160 },
    { owner: 'Car_Private', type: 'רכב מקיף', provider: 'הפניקס', product_name: 'ביטוח מקיף רכב', policy_number: 'RC444', start_date: fmt(y, 1, 1), end_date: fmt(y + 1, 1, 1), monthly_premium: 520, annual_premium: 6240 },
    { owner: 'Yuval', type: 'חיסכון ילדים', provider: 'בנק הפועלים', product_name: 'חיסכון יובל', monthly_premium: 200, annual_premium: 2400, balance: 8500 },
    { owner: 'Aviv', type: 'חיסכון ילדים', provider: 'בנק הפועלים', product_name: 'חיסכון אביב', monthly_premium: 200, annual_premium: 2400, balance: 6200 },
  ];
  saveAll('asset', assets.map((a) => ({ ...a, id: newId() })));

  localStorage.setItem('ft_initialized', 'true');
}

// ────────────────────────────────────────────────────────────────────────────
// Mock AI Integration
// ────────────────────────────────────────────────────────────────────────────
const CATEGORY_KEYWORDS: [Category, string[]][] = [
  ['סופר', ['סופר', 'רמי לוי', 'שופרסל', 'מגה', 'ויקטורי', 'קאשאנדקארי', 'carrefour', 'יינות ביתן']],
  ['מסעדות', ['מסעדה', 'קפה', 'פיצה', 'בורגר', 'שווארמה', 'פלאפל', 'סושי', 'דומינו']],
  ['דלק', ['דלק', 'פז', 'סונול', 'ten', 'דור אלון', 'yellow']],
  ['דיור', ['שכירות', 'ארנונה', 'ועד בית', 'חשמל', 'מים', 'גז']],
  ['בריאות', ['רופא', 'מרפאה', 'תרופה', 'בית מרקחת', 'סופר פארם', 'super pharm', 'כללית', 'מכבי', 'לאומית']],
  ['ביגוד', ['בגד', 'נעל', 'זארה', 'h&m', 'אמריקן איגל', 'קסטרו', 'fox']],
  ['פנאי', ['קולנוע', 'סרט', 'ספורט', 'חדר כושר', 'ספרייה', 'נופש', 'מלון', 'booking']],
  ['ילדים', ['גן', 'צהרון', 'חינוך', 'בית ספר', 'חוג']],
  ['תקשורת', ['בזק', 'הוט', 'סלקום', 'פרטנר', 'yes', 'yes+', 'אינטרנט']],
  ['ביטוחים', ['ביטוח', 'פוליסה', 'מגדל', 'כלל', 'הראל', 'הפניקס', 'מנורה']],
  ['מתנות', ['מתנה', 'פרח', 'אמזון', 'amazon']],
  ['מזון', ['אוכל', 'מזון', 'קניה', 'מכולת']],
];

function guessCategory(text: string): Category {
  const lower = text.toLowerCase();
  for (const [cat, keywords] of CATEGORY_KEYWORDS) {
    if (keywords.some((kw) => lower.includes(kw))) return cat;
  }
  return 'שונות';
}

function parseTransactionText(text: string): Partial<Transaction>[] {
  const lines = text.split('\n').filter((l) => l.trim().length > 5);
  const results: Partial<Transaction>[] = [];

  for (const line of lines) {
    const amountMatch = line.match(/(\d{1,6}(?:[.,]\d{1,2})?)\s*(?:₪|ש"ח|שח)?/);
    if (!amountMatch) continue;
    const amount = parseFloat(amountMatch[1].replace(',', '.'));
    if (amount < 1 || amount > 500000) continue;

    const dateMatch = line.match(/(\d{1,2})[./](\d{1,2})(?:[./](\d{2,4}))?/);
    let date = new Date().toISOString().split('T')[0];
    if (dateMatch) {
      const day = dateMatch[1].padStart(2, '0');
      const mon = dateMatch[2].padStart(2, '0');
      const yearRaw = dateMatch[3];
      const yr = yearRaw ? (yearRaw.length === 2 ? '20' + yearRaw : yearRaw) : new Date().getFullYear();
      date = `${yr}-${mon}-${day}`;
    }

    const description = line
      .replace(amountMatch[0], '')
      .replace(/\d{1,2}[./]\d{1,2}(?:[./]\d{2,4})?/, '')
      .replace(/[₪"']/g, '')
      .trim();

    const category = guessCategory(description || line);
    results.push({ date, amount, category, type: 'expense', payer: 'Shi', payment_method: 'אשראי', expense_class: 'משתנה', status: 'paid', notes: description });
  }
  return results;
}

// ────────────────────────────────────────────────────────────────────────────
// Public API
// ────────────────────────────────────────────────────────────────────────────
seedData();

export const base44 = {
  entities: {
    Transaction: makeEntity<Transaction>('transaction'),
    Budget: makeEntity<Budget>('budget'),
    Asset: makeEntity<Asset>('asset'),
  },
  integrations: {
    Core: {
      async InvokeLLM({ prompt }: { prompt: string; response_json_schema?: unknown }): Promise<{ transactions?: Partial<Transaction>[] }> {
        await new Promise((r) => setTimeout(r, 800));
        const transactions = parseTransactionText(prompt);
        return { transactions };
      },
      async ExtractDataFromUploadedFile({ file_url, prompt: _prompt }: { file_url: string; prompt: string }): Promise<{ data: Partial<Transaction>[] }> {
        await new Promise((r) => setTimeout(r, 1000));
        // In production this would parse the file; return empty for mock
        console.log('ExtractDataFromUploadedFile called for', file_url);
        return { data: [] };
      },
    },
  },
};
