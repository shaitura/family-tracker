import {
  collection, getDocs, addDoc, updateDoc, deleteDoc, doc, writeBatch, serverTimestamp,
  query, where,
} from 'firebase/firestore';
import { db } from './firebase';
import { Transaction, Budget, Asset, Category } from '@/types';

// ────────────────────────────────────────────────────────────────────────────
// Firestore entity factory  (same public API as the old localStorage version)
// ────────────────────────────────────────────────────────────────────────────
function makeEntity<T extends { id: string }>(collectionName: string) {
  return {
    async filter(opts?: {
      filters?: { field: string; operator: string; value: unknown }[];
      dateRange?: { start: string; end: string };
    }): Promise<T[]> {
      const base = collection(db, collectionName);
      const q = opts?.dateRange
        ? query(base, where('date', '>=', opts.dateRange.start), where('date', '<=', opts.dateRange.end))
        : base;
      const snap = await getDocs(q);
      let data = snap.docs.map((d) => ({ id: d.id, ...d.data() } as T));
      if (opts?.filters) {
        for (const f of opts.filters) {
          data = data.filter((item) => {
            const val = (item as Record<string, unknown>)[f.field];
            if (f.operator === 'eq')  return val === f.value;
            if (f.operator === 'gte') return (val as number) >= (f.value as number);
            if (f.operator === 'lte') return (val as number) <= (f.value as number);
            return true;
          });
        }
      }
      return data;
    },

    async create(item: Omit<T, 'id'>): Promise<T> {
      const clean = Object.fromEntries(
        Object.entries(item as Record<string, unknown>).filter(([, v]) => v !== undefined),
      );
      const ref = await addDoc(collection(db, collectionName), clean);
      return { ...item, id: ref.id } as T;
    },

    // bulk-create using sequential Firestore batch commits (100 per batch for reliability)
    async bulkCreate(items: Omit<T, 'id'>[], onProgress?: (done: number, total: number) => void): Promise<void> {
      const CHUNK = 100;
      const total = items.length;
      let done = 0;
      for (let i = 0; i < total; i += CHUNK) {
        const batch = writeBatch(db);
        const chunk = items.slice(i, i + CHUNK);
        chunk.forEach((item) => {
          const ref = doc(collection(db, collectionName));
          // strip undefined values — Firestore rejects them
          const clean = Object.fromEntries(
            Object.entries(item as Record<string, unknown>).filter(([, v]) => v !== undefined),
          );
          batch.set(ref, clean);
        });
        await batch.commit();
        done += chunk.length;
        onProgress?.(done, total);
      }
    },

    async update(id: string, updates: Partial<T>): Promise<T> {
      await updateDoc(doc(db, collectionName, id), updates as Record<string, unknown>);
      return { id, ...updates } as T;
    },

    async delete(id: string): Promise<void> {
      await deleteDoc(doc(db, collectionName, id));
    },

    // bulk-delete by IDs — chunked batches
    async bulkDelete(ids: string[]): Promise<void> {
      for (let i = 0; i < ids.length; i += 400) {
        const batch = writeBatch(db);
        ids.slice(i, i + 400).forEach((id) => batch.delete(doc(db, collectionName, id)));
        await batch.commit();
      }
    },

    // bulk-delete all documents — uses chunked batches (Firestore limit: 500 per batch)
    async deleteAll(): Promise<void> {
      const snap = await getDocs(collection(db, collectionName));
      const refs = snap.docs.map((d) => d.ref);
      for (let i = 0; i < refs.length; i += 400) {
        const batch = writeBatch(db);
        refs.slice(i, i + 400).forEach((ref) => batch.delete(ref));
        await batch.commit();
      }
    },
  };
}

// ────────────────────────────────────────────────────────────────────────────
// Migration helper — reads old localStorage data and writes to Firestore
// ────────────────────────────────────────────────────────────────────────────
function getLocal<T>(key: string): T[] {
  try { return JSON.parse(localStorage.getItem(`ft_${key}`) || '[]'); }
  catch { return []; }
}

export async function migrateLocalToFirestore(
  onProgress?: (msg: string) => void,
): Promise<{ transactions: number; budgets: number; assets: number }> {
  const transactions = getLocal<Transaction>('transaction');
  const budgets      = getLocal<Budget>('budget');
  const assets       = getLocal<Asset>('asset');

  let counts = { transactions: 0, budgets: 0, assets: 0 };

  for (const t of transactions) {
    const { id: _id, ...data } = t;
    await base44.entities.Transaction.create(data);
    counts.transactions++;
    onProgress?.(`מעביר עסקאות… ${counts.transactions}/${transactions.length}`);
  }
  for (const b of budgets) {
    const { id: _id, ...data } = b;
    await base44.entities.Budget.create(data);
    counts.budgets++;
  }
  for (const a of assets) {
    const { id: _id, ...data } = a;
    await base44.entities.Asset.create(data);
    counts.assets++;
  }

  // Mark local storage as migrated
  localStorage.setItem('ft_migrated', 'true');
  onProgress?.('העברה הושלמה!');
  return counts;
}

export function hasLocalData(): boolean {
  if (localStorage.getItem('ft_migrated')) return false;
  try {
    const t = JSON.parse(localStorage.getItem('ft_transaction') || '[]');
    return Array.isArray(t) && t.length > 0;
  } catch { return false; }
}

// ────────────────────────────────────────────────────────────────────────────
// Historical-context AI  (replaces static mock)
// ────────────────────────────────────────────────────────────────────────────

// Common Hebrew stopwords that carry no merchant signal
const HE_STOPWORDS = new Set([
  'של','עם','את','על','אל','לא','כן','רק','כל','יש','אין','כי','אם',
  'גם','כך','כבר','הם','הן','אנו','אני','הוא','היא','אנחנו','שהם',
  'ידי','בין','עוד','עצם','כמה','שם','אז','או','כן',
]);

/** Split text into lowercase tokens; filter stopwords and very-short tokens */
function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[0-9₪"'.,;:!?()\[\]{}\-\/]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length >= 2 && !HE_STOPWORDS.has(t) && !/^\d+$/.test(t));
}

/** Map: token → { category → occurrenceCount } */
export type MerchantMap = Record<string, Record<string, number>>;

/**
 * Build a statistical merchant→category map from historical transactions.
 * Uses both `notes` (merchant description) and `sub_category` as signal sources.
 * Called once in AddTransaction and cached with useMemo.
 */
export function buildMerchantMap(transactions: Transaction[]): MerchantMap {
  const map: MerchantMap = {};
  for (const tx of transactions) {
    const text = [tx.notes, tx.sub_category].filter(Boolean).join(' ');
    if (!text || !tx.category) continue;
    for (const token of tokenize(text)) {
      if (!map[token]) map[token] = {};
      map[token][tx.category] = (map[token][tx.category] ?? 0) + 1;
    }
  }
  return map;
}

/**
 * Given free-form input text and the historical map, return the most likely
 * category by summing occurrence scores for all matching tokens.
 * Falls back to null if no tokens match.
 */
function guessCategoryFromMap(text: string, map: MerchantMap): Category | null {
  const scores: Record<string, number> = {};
  for (const token of tokenize(text)) {
    const catCounts = map[token];
    if (!catCounts) continue;
    for (const [cat, count] of Object.entries(catCounts)) {
      scores[cat] = (scores[cat] ?? 0) + count;
    }
  }
  const entries = Object.entries(scores);
  if (!entries.length) return null;
  return entries.sort((a, b) => b[1] - a[1])[0][0] as Category;
}

// ────────────────────────────────────────────────────────────────────────────
// Static keyword fallback  (unchanged, used when history gives no match)
// ────────────────────────────────────────────────────────────────────────────
const CATEGORY_KEYWORDS: [Category, string[]][] = [
  ['סופר',      ['סופר', 'רמי לוי', 'שופרסל', 'מגה', 'ויקטורי', 'carrefour', 'יינות ביתן']],
  ['מסעדות',    ['מסעדה', 'קפה', 'פיצה', 'בורגר', 'שווארמה', 'פלאפל', 'סושי', 'דומינו']],
  ['דלק',       ['דלק', 'פז', 'סונול', 'ten', 'דור אלון', 'yellow']],
  ['דיור',      ['שכירות', 'ארנונה', 'ועד בית', 'חשמל', 'מים', 'גז']],
  ['בריאות',    ['רופא', 'מרפאה', 'תרופה', 'בית מרקחת', 'סופר פארם', 'כללית', 'מכבי', 'לאומית']],
  ['ביגוד',     ['בגד', 'נעל', 'זארה', 'h&m', 'קסטרו', 'fox']],
  ['פנאי',      ['קולנוע', 'סרט', 'ספורט', 'חדר כושר', 'נופש', 'מלון', 'booking']],
  ['ילדים',     ['גן', 'צהרון', 'חינוך', 'בית ספר', 'חוג']],
  ['תקשורת',    ['בזק', 'הוט', 'סלקום', 'פרטנר', 'yes', 'אינטרנט']],
  ['ביטוחים',   ['ביטוח', 'פוליסה', 'מגדל', 'כלל', 'הראל', 'הפניקס', 'מנורה']],
  ['מתנות',     ['מתנה', 'פרח', 'אמזון', 'amazon']],
  ['מזון',      ['אוכל', 'מזון', 'קניה', 'מכולת']],
];

function guessCategory(text: string): Category {
  const lower = text.toLowerCase();
  for (const [cat, keywords] of CATEGORY_KEYWORDS) {
    if (keywords.some((kw) => lower.includes(kw))) return cat;
  }
  return 'שונות';
}

function parseTransactionText(text: string, merchantMap?: MerchantMap): Partial<Transaction>[] {
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

    // Category: historical map first, then static keywords
    const descForCat = description || line;
    const category =
      (merchantMap ? guessCategoryFromMap(descForCat, merchantMap) : null)
      ?? guessCategory(descForCat);

    results.push({ date, amount, category, type: 'expense', payer: 'Shi', payment_method: 'אשראי', expense_class: 'משתנה', status: 'paid', notes: description });
  }
  return results;
}

// ────────────────────────────────────────────────────────────────────────────
// Public API
// ────────────────────────────────────────────────────────────────────────────
export const base44 = {
  entities: {
    Transaction: makeEntity<Transaction>('transactions'),
    Budget:      makeEntity<Budget>('budgets'),
    Asset:       makeEntity<Asset>('assets'),
  },
  integrations: {
    Core: {
      async InvokeLLM({ prompt, merchantMap }: { prompt: string; merchantMap?: MerchantMap; response_json_schema?: unknown }): Promise<{ transactions?: Partial<Transaction>[] }> {
        await new Promise((r) => setTimeout(r, 500));
        return { transactions: parseTransactionText(prompt, merchantMap) };
      },
      async ExtractDataFromUploadedFile({ file_url, prompt: _prompt }: { file_url: string; prompt: string }): Promise<{ data: Partial<Transaction>[] }> {
        await new Promise((r) => setTimeout(r, 1000));
        console.log('ExtractDataFromUploadedFile called for', file_url);
        return { data: [] };
      },
    },
  },
};
