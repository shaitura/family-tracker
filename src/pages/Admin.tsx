import { useState, useRef, useEffect, Fragment } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import * as XLSX from 'xlsx';
import { base44, migrateLocalToFirestore, hasLocalData } from '@/lib/base44Client';
import { Transaction, RecurringRule, CATEGORIES, INCOME_CATEGORIES, PAYMENT_METHODS, CHILD_TAGS, Category, IncomeCategory, PaymentMethod } from '@/types';
import { CHILD_LABELS } from '@/utils';

// Child-tag column: '' is a real, selectable value meaning "no child assigned".
// Stored as null (never undefined — base44Client.update strips undefined, which
// would silently leave a stale tag behind instead of clearing it).
const NO_CHILD = '';
// Sentinel used ONLY by the column-filter dropdown, where '' already means "all".
const FILTER_NO_CHILD = '__none__';
const CHILD_COL_OPTIONS: string[] = [NO_CHILD, ...CHILD_TAGS];

// Display labels for enum values stored in English
const OPTION_LABELS: Record<string, Record<string, string>> = {
  type:   { expense: 'הוצאה',  income: 'הכנסה' },
  payer:  { Shi: 'שי', Ortal: 'אורטל', Joint: 'משותפת' },
  status: { paid: 'שולם', pending: 'ממתין', future: 'עתידי' },
  child:  { [NO_CHILD]: 'ללא שיוך', ...CHILD_LABELS },
};

function displayLabel(field: string, value: string): string {
  return OPTION_LABELS[field]?.[value] ?? value;
}

const COLUMNS = [
  { key: 'date',           label: 'תאריך',              type: 'date',   width: 110 },
  { key: 'expense_class',  label: 'סוג הוצאה',          type: 'select', options: ['קבועה', 'משתנה'],                   width: 90  },
  { key: 'sub_category',   label: 'פרטים',               type: 'text',   width: 160 },
  { key: 'payer',          label: 'משולם / משותפת',      type: 'select', options: ['Shi', 'Ortal', 'Joint'],           width: 120 },
  { key: 'amount',         label: 'סכום',                type: 'number', width: 90  },
  { key: 'payment_method', label: 'שיטת הוצאה',          type: 'select', options: PAYMENT_METHODS,                    width: 120 },
  { key: 'category',       label: 'סיווג הוצאה',         type: 'select', options: [...CATEGORIES],                    width: 120 },
  { key: 'notes',          label: 'הערות',               type: 'text',   width: 200 },
  { key: 'type',           label: 'הכנסה / הוצאה',       type: 'select', options: ['expense', 'income'],              width: 110 },
  { key: 'status',         label: 'סטטוס',               type: 'select', options: ['paid', 'pending', 'future'],      width: 90  },
  // Appended LAST on purpose: PASTE_COL_ORDER maps clipboard cells by index, so a
  // new column must not shift indices 0-9 of the existing Excel paste layout.
  { key: 'child', label: 'שיוך לילד', type: 'select', options: CHILD_COL_OPTIONS, width: 110 },
] as const;

// Paste column order — matches the Excel column order (right→left = A→last)
const PASTE_COL_ORDER = [
  'date', 'expense_class', 'sub_category', 'payer', 'amount',
  'payment_method', 'category', 'notes', 'type', 'status',
];

type EditingCell = { id: string; field: string } | null;

// ── Finetune Wizard ───────────────────────────────────────────────────────────

interface WizardAnomaly {
  id: string;
  merchant: string;
  field: string;
  fieldLabel: string;
  priority: 'high' | 'medium' | 'low';
  dominant: string;
  dominantCount: number;
  totalCount: number;
  outlierRows: Transaction[];
  fixValue: string;
  isAmount: boolean;
}

const WIZARD_FIELDS: { key: string; label: string; priority: WizardAnomaly['priority'] }[] = [
  { key: 'category',       label: 'קטגוריה',      priority: 'high'   },
  { key: 'type',           label: 'סוג עסקה',     priority: 'high'   },
  { key: 'expense_class',  label: 'קבועה/משתנה',  priority: 'medium' },
  { key: 'payment_method', label: 'אמצעי תשלום',  priority: 'medium' },
  { key: 'payer',          label: 'משלם',         priority: 'medium' },
];

function scanForAnomalies(txs: Transaction[]): WizardAnomaly[] {
  const MIN_GROUP = 4;
  const DOMINANCE = 0.60;

  const groups = new Map<string, Transaction[]>();
  for (const tx of txs) {
    const key = (tx.sub_category || '').toLowerCase().trim();
    if (!key) continue;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(tx);
  }

  const anomalies: WizardAnomaly[] = [];

  for (const [, group] of groups) {
    if (group.length < MIN_GROUP) continue;
    const merchantDisplay = group[0].sub_category || '';

    // Categorical fields
    for (const { key, label, priority } of WIZARD_FIELDS) {
      const counts: Record<string, number> = {};
      for (const tx of group) {
        const v = String((tx as unknown as Record<string, unknown>)[key] ?? '');
        counts[v] = (counts[v] ?? 0) + 1;
      }
      const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
      if (sorted.length < 2) continue;
      const [dom, domCount] = sorted[0];
      if (domCount / group.length < DOMINANCE) continue;
      const outliers = group.filter(tx => String((tx as unknown as Record<string, unknown>)[key] ?? '') !== dom);
      if (!outliers.length) continue;
      anomalies.push({
        id: `${merchantDisplay}::${key}`,
        merchant: merchantDisplay,
        field: key, fieldLabel: label, priority,
        dominant: dom, dominantCount: domCount,
        totalCount: group.length,
        outlierRows: outliers,
        fixValue: dom,
        isAmount: false,
      });
    }

    // Amount outliers — IQR method
    const amounts = group.map(tx => tx.amount).filter(a => a > 0).sort((a, b) => a - b);
    if (amounts.length >= MIN_GROUP) {
      const q1 = amounts[Math.floor(amounts.length * 0.25)];
      const q3 = amounts[Math.floor(amounts.length * 0.75)];
      const iqr = q3 - q1;
      if (iqr > 0) {
        const upper = q3 + 2.5 * iqr;
        const outliers = group.filter(tx => tx.amount > upper);
        if (outliers.length) {
          anomalies.push({
            id: `${merchantDisplay}::amount`,
            merchant: merchantDisplay,
            field: 'amount', fieldLabel: 'סכום חריג', priority: 'low',
            dominant: `₪${Math.round(q1)}–₪${Math.round(q3)}`,
            dominantCount: group.length - outliers.length,
            totalCount: group.length,
            outlierRows: outliers,
            fixValue: '',
            isAmount: true,
          });
        }
      }
    }
  }

  const pOrd = { high: 0, medium: 1, low: 2 };
  return anomalies.sort((a, b) => {
    const pd = pOrd[a.priority] - pOrd[b.priority];
    return pd !== 0 ? pd : b.outlierRows.length - a.outlierRows.length;
  });
}

function parseDate(v: string): string {
  const m = v.match(/(\d{1,2})[./](\d{1,2})(?:[./](\d{2,4}))?/);
  if (m) {
    const d = m[1].padStart(2, '0');
    const mo = m[2].padStart(2, '0');
    const yr = m[3] ? (m[3].length === 2 ? '20' + m[3] : m[3]) : new Date().getFullYear();
    return `${yr}-${mo}-${d}`;
  }
  // if already YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return v;
  return new Date().toISOString().split('T')[0];
}

function parsePasteText(text: string): Partial<Transaction>[] {
  const lines = text.trim().split('\n').filter((l) => l.trim());
  const results: Partial<Transaction>[] = [];

  for (const line of lines) {
    const cells = line.split('\t');
    const row: Partial<Transaction> = {
      type: 'expense', category: 'שונות', payer: 'Shi',
      payment_method: 'אשראי', expense_class: 'משתנה',
      status: 'paid', date: new Date().toISOString().split('T')[0],
    };

    cells.forEach((cell, i) => {
      const col = PASTE_COL_ORDER[i];
      if (!col) return;
      const v = cell.trim();
      if (!v) return;

      if (col === 'amount') {
        const n = parseFloat(v.replace(/[₪,\s]/g, ''));
        if (!isNaN(n) && n > 0) row.amount = n;
      } else if (col === 'date') {
        row.date = parseDate(v);
      } else {
        (row as Record<string, unknown>)[col] = v;
      }
    });

    if (row.amount && row.amount > 0) results.push(row);
  }
  return results;
}

// ── Annual Excel import helpers ──────────────────────────────────────────────

const MONTH_NAMES = ['ינואר','פברואר','מרץ','אפריל','מאי','יוני','יולי','אוגוסט','ספטמבר','אוקטובר','נובמבר','דצמבר'];

type MonthPreview = {
  month: number;
  monthName: string;
  expenses: Partial<Transaction>[];
  incomes: Partial<Transaction>[];
};

function parseAmount(v: unknown): number {
  if (v == null || v === '') return 0;
  const n = parseFloat(String(v).replace(/[,₪\s]/g, ''));
  return isNaN(n) ? 0 : n;
}

function mapPayer(raw: string): 'Shi' | 'Ortal' | 'Joint' {
  const v = raw.trim();
  if (v === 'אורטל') return 'Ortal';
  if (v === 'משותפת' || v === 'משותף') return 'Joint';
  return 'Shi'; // שי / אישי / default
}

function mapPaymentMethod(v: unknown): PaymentMethod {
  const s = String(v ?? '').trim();
  if (s === 'מזומן')       return 'מזומן';
  if (s === 'ביט')         return 'ביט';
  if (s === "צ'ק")         return "צ'ק";
  if (s === 'הוראת קבע')   return 'הוראת קבע';
  if (s === 'העברה')       return 'העברה';
  return 'אשראי';
}

const LEGACY_CATEGORY_MAP: Record<string, Category> = {
  'מזון':    'מצרכים',
  'סופר':    'מצרכים',
  'מסעדות':  'אוכל בחוץ',
  'מתנות':   'מתנות/אירועים',
};

function mapCategory(raw: string): Category {
  const s = String(raw ?? '').trim();
  if (!s) return 'שונות';
  // Explicit legacy renames first
  if (LEGACY_CATEGORY_MAP[s]) return LEGACY_CATEGORY_MAP[s];
  if (CATEGORIES.includes(s as Category)) return s as Category;
  // partial match: "דיור - שכירות" → "דיור"
  for (const cat of CATEGORIES) {
    if (s.startsWith(cat) || s.includes(cat)) return cat;
  }
  return 'שונות';
}

function mapIncomeCategory(raw: string): IncomeCategory {
  const s = String(raw ?? '').trim();
  if (INCOME_CATEGORIES.includes(s as IncomeCategory)) return s as IncomeCategory;
  return 'משכורת';
}

function parseAnnualExcel(workbook: XLSX.WorkBook, year: number): MonthPreview[] {
  const results: MonthPreview[] = [];

  for (let month = 1; month <= 12; month++) {
    const ws = workbook.Sheets[String(month)];
    if (!ws) continue;

    const date = `${year}-${String(month).padStart(2, '0')}-01`;
    const expenses: Partial<Transaction>[] = [];
    const incomes:  Partial<Transaction>[] = [];

    for (let row = 9; row <= 200; row++) {
      // ── Expenses: A=יום B=קבועה/משתנה C=פרטים D=משלם E=סכום F=שיטה G=סיווג H=הערות
      const expAmt = parseAmount(ws[`E${row}`]?.v);
      if (expAmt > 0) {
        const cls = String(ws[`B${row}`]?.v ?? '').trim();
        expenses.push({
          date,
          type:            'expense',
          expense_class:   cls === 'קבועה' ? 'קבועה' : 'משתנה',
          sub_category:    String(ws[`C${row}`]?.v ?? '').trim() || undefined,
          payer:           mapPayer(String(ws[`D${row}`]?.v ?? '')),
          amount:          expAmt,
          payment_method:  mapPaymentMethod(ws[`F${row}`]?.v),
          category:        (String(ws[`G${row}`]?.v ?? '').trim() || 'שונות') as Category,
          notes:           String(ws[`H${row}`]?.v ?? '').trim() || undefined,
          status:          'paid',
        });
      }

      // ── Incomes: M=קבועה/משתנה N=פירוט O=משלם P=סכום Q=שיטה R=הערות
      const incAmt = parseAmount(ws[`P${row}`]?.v);
      if (incAmt > 0) {
        const cls = String(ws[`M${row}`]?.v ?? '').trim();
        incomes.push({
          date,
          type:            'income',
          expense_class:   cls === 'קבועה' ? 'קבועה' : 'משתנה',
          sub_category:    String(ws[`N${row}`]?.v ?? '').trim() || undefined,
          payer:           mapPayer(String(ws[`O${row}`]?.v ?? '')),
          amount:          incAmt,
          payment_method:  mapPaymentMethod(ws[`Q${row}`]?.v),
          category:        'שונות',
          notes:           String(ws[`R${row}`]?.v ?? '').trim() || undefined,
          status:          'paid',
        });
      }
    }

    if (expenses.length > 0 || incomes.length > 0) {
      results.push({ month, monthName: MONTH_NAMES[month - 1], expenses, incomes });
    }
  }

  return results;
}

// ────────────────────────────────────────────────────────────────────────────

function getWizardOptions(field: string): string[] {
  if (field === 'category') return [...CATEGORIES, ...INCOME_CATEGORIES];
  const col = COLUMNS.find(c => c.key === field);
  return col && 'options' in col ? [...(col.options as readonly string[])] : [];
}

function matchesAllFields(t: Transaction, q: string): boolean {
  const s = q.toLowerCase();
  return [
    t.date, t.sub_category ?? '', t.category, t.notes ?? '',
    t.payer, OPTION_LABELS.payer?.[t.payer] ?? '',
    t.payment_method, t.expense_class ?? '',
    t.type, OPTION_LABELS.type?.[t.type] ?? '',
    t.status, OPTION_LABELS.status?.[t.status] ?? '',
    t.child ?? '', CHILD_LABELS[t.child ?? ''] ?? '',
    String(t.amount),
  ].some((v) => v.toLowerCase().includes(s));
}

export default function Admin() {
  const queryClient = useQueryClient();
  const [editingCell, setEditingCell] = useState<EditingCell>(null);
  const [sortField, setSortField] = useState<string>('date');
  const [sortDir, setSortDir]   = useState<'asc' | 'desc'>('desc');
  const [search, setSearch]     = useState('');
  const [colFilters, setColFilters] = useState<Record<string, string>>({});
  const [showColFilters, setShowColFilters] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const lastCheckedIdx = useRef<number | null>(null);
  const [pasteOpen, setPasteOpen]         = useState(false);
  const [confirmClear, setConfirmClear]   = useState(false);
  const [confirmText, setConfirmText]     = useState('');
  const [pasteRows, setPasteRows]         = useState<Partial<Transaction>[]>([]);
  const [pasteText, setPasteText]         = useState('');
  const [migrateOpen, setMigrateOpen]           = useState(false);
  const [migrateStatus, setMigrateStatus]       = useState('');
  const [migrateLoading, setMigrateLoading]     = useState(false);
  const [fixCatOpen, setFixCatOpen]             = useState(false);
  const [fixCatStatus, setFixCatStatus]         = useState('');
  const [fixCatLoading, setFixCatLoading]       = useState(false);
  const [fixCatRows, setFixCatRows]             = useState<{ from: string; to: string; count: number; txType: 'expense' | 'income' }[]>([]);
  const [deleteYearOpen, setDeleteYearOpen]     = useState(false);
  const [deleteYear, setDeleteYear]             = useState(new Date().getFullYear());
  const [deleteYearLoading, setDeleteYearLoading] = useState(false);
  const [deleteYearStatus, setDeleteYearStatus] = useState('');
  const [annualOpen, setAnnualOpen]             = useState(false);
  const [annualYear, setAnnualYear]             = useState(2025);
  const [annualPreview, setAnnualPreview]       = useState<MonthPreview[]>([]);
  const [annualLoading, setAnnualLoading]       = useState(false);
  const [annualProgress, setAnnualProgress]     = useState({ done: 0, total: 0 });
  const [annualSheetNames, setAnnualSheetNames] = useState<string[]>([]);
  const [annualDiag, setAnnualDiag]             = useState<string[][]>([]);
  const containerRef = useRef<HTMLDivElement>(null);

  const { data: transactions = [], isLoading } = useQuery({
    queryKey: ['transactions'],
    queryFn: () => base44.entities.Transaction.filter(),
  });

  // Recurring rules never appear as table rows (they are projected at read time),
  // so the child wizard exposes them as its own selectable section.
  const { data: recurringRules = [] } = useQuery({
    queryKey: ['recurringRules'],
    queryFn: () => base44.entities.RecurringRule.filter(),
  });

  const activeColFilters = Object.values(colFilters).filter(Boolean).length;
  const [reviewIds, setReviewIds] = useState<Set<string>>(() => {
    try { return new Set(JSON.parse(localStorage.getItem('ft_review_ids') || '[]')); }
    catch { return new Set(); }
  });
  const [showReviewOnly, setShowReviewOnly] = useState(false);

  useEffect(() => {
    try { localStorage.setItem('ft_review_ids', JSON.stringify([...reviewIds])); } catch { /* ignore */ }
  }, [reviewIds]);

  // ── filtered + sorted rows ──────────────────────────────────────────────
  const rows = [...transactions]
    .filter((t) => {
      if (showReviewOnly && !reviewIds.has(t.id)) return false;
      if (search && !matchesAllFields(t, search)) return false;
      for (const [key, val] of Object.entries(colFilters)) {
        if (!val) continue;
        // child filters exact-match (a substring test can't express "no tag at all")
        if (key === 'child') {
          const cv = String(t.child ?? '');
          if (val === FILTER_NO_CHILD ? cv !== '' : cv !== val) return false;
          continue;
        }
        const tv = String(t[key as keyof Transaction] ?? '').toLowerCase();
        if (!tv.includes(val.toLowerCase())) return false;
      }
      return true;
    })
    .sort((a, b) => {
      const av = String(a[sortField as keyof Transaction] ?? '');
      const bv = String(b[sortField as keyof Transaction] ?? '');
      const cmp = av.localeCompare(bv, 'he');
      return sortDir === 'asc' ? cmp : -cmp;
    });

  // ── CRUD helpers ────────────────────────────────────────────────────────
  async function updateCell(id: string, field: string, value: string | number) {
    // Clearing the child tag must write null: base44Client.update() strips
    // undefined, and an empty string would persist as a bogus tag value.
    const v = field === 'child' && value === NO_CHILD ? null : value;
    await base44.entities.Transaction.update(id, { [field]: v } as Partial<Transaction>);
    queryClient.invalidateQueries({ queryKey: ['transactions'] });
  }

  async function addRow() {
    await base44.entities.Transaction.create({
      date: new Date().toISOString().split('T')[0],
      type: 'expense', category: 'שונות', amount: 0,
      payer: 'Shi', payment_method: 'אשראי',
      expense_class: 'משתנה', status: 'paid',
    });
    queryClient.invalidateQueries({ queryKey: ['transactions'] });
  }

  async function deleteRow(id: string) {
    await base44.entities.Transaction.delete(id);
    setSelectedIds((prev) => { const n = new Set(prev); n.delete(id); return n; });
    queryClient.invalidateQueries({ queryKey: ['transactions'] });
  }

  async function deleteSelected() {
    await base44.entities.Transaction.bulkDelete([...selectedIds]);
    setSelectedIds(new Set());
    queryClient.invalidateQueries({ queryKey: ['transactions'] });
  }

  function openWizard() {
    setWizardOpen(true);
    setWizardAnomalies([]);
    setWizardStep(0);
    setWizardFixed(0);
    setWizardCustomValue('');
  }

  function closeWizard() {
    setWizardOpen(false);
    setWizardAnomalies([]);
    setWizardStep(0);
    setWizardCustomValue('');
  }

  function runWizardScan() {
    setWizardLoading(true);
    setWizardStep(0);
    setWizardFixed(0);
    setWizardCustomValue('');
    setTimeout(() => {
      const anomalies = scanForAnomalies(transactions);
      setWizardAnomalies(anomalies);
      setWizardLoading(false);
    }, 10);
  }

  async function applyWizardFix(targetValue: string) {
    const anomaly = wizardAnomalies[wizardStep];
    if (!anomaly || anomaly.isAmount) return;
    setWizardFixing(true);
    try {
      for (const row of anomaly.outlierRows) {
        await base44.entities.Transaction.update(row.id, { [anomaly.field]: targetValue } as Partial<Transaction>);
      }
      queryClient.invalidateQueries({ queryKey: ['transactions'] });
      setWizardFixed(f => f + 1);
      setReviewIds(prev => {
        const n = new Set(prev);
        anomaly.outlierRows.forEach(r => n.delete(r.id));
        return n;
      });
    } catch (e) {
      console.error('[WIZARD]', e);
    }
    setWizardFixing(false);
    setWizardMarkReview(false);
    setWizardCustomValue('');
    setWizardStep(s => s + 1);
  }

  function skipCurrent(markReview = false) {
    const anomaly = wizardAnomalies[wizardStep];
    if (markReview && anomaly) {
      setReviewIds(prev => {
        const n = new Set(prev);
        anomaly.outlierRows.forEach(r => n.add(r.id));
        return n;
      });
    }
    setWizardMarkReview(false);
    setWizardCustomValue('');
    setWizardStep(s => s + 1);
  }

  async function runBulkCategoryChange() {
    if (!bulkCatTarget || selectedIds.size === 0) return;
    for (const id of selectedIds) {
      await base44.entities.Transaction.update(id, { category: bulkCatTarget as Category });
    }
    queryClient.invalidateQueries({ queryKey: ['transactions'] });
    setBulkCatOpen(false);
    setBulkCatTarget('');
  }

  // ── Child-assignment wizard ────────────────────────────────────────────
  function openChildWizard() {
    setChildWizOpen(true);
    setChildWizTarget(null);
    setChildWizRuleIds(new Set());
    setChildWizStatus('');
  }

  function closeChildWizard() {
    setChildWizOpen(false);
    setChildWizTarget(null);
    setChildWizRuleIds(new Set());
    setChildWizStatus('');
  }

  async function runChildAssign() {
    if (childWizTarget === null) return;
    // '' clears the tag; it must reach Firestore as null, not undefined.
    const value = (childWizTarget === NO_CHILD ? null : childWizTarget) as Transaction['child'];
    // Selection can outlive a row (deleted elsewhere) — resolve against live data.
    const rowIds = transactions.filter((t) => selectedIds.has(t.id)).map((t) => t.id);
    const ruleIds = recurringRules.filter((r) => childWizRuleIds.has(r.id)).map((r) => r.id);
    if (rowIds.length === 0 && ruleIds.length === 0) {
      setChildWizStatus('לא נבחרו שורות או כללים');
      return;
    }
    setChildWizLoading(true);
    setChildWizStatus('מעדכן…');
    try {
      if (rowIds.length) {
        await base44.entities.Transaction.bulkUpdate(
          rowIds.map((id) => ({ id, data: { child: value } as Partial<Transaction> })),
          (done, total) => setChildWizStatus(`מעדכן עסקאות… ${done}/${total}`),
        );
      }
      if (ruleIds.length) {
        setChildWizStatus('מעדכן כללים קבועים…');
        await base44.entities.RecurringRule.bulkUpdate(
          ruleIds.map((id) => ({ id, data: { child: value } as Partial<RecurringRule> })),
        );
      }
      queryClient.invalidateQueries({ queryKey: ['transactions'] });
      queryClient.invalidateQueries({ queryKey: ['recurringRules'] });
      const label = childWizTarget === NO_CHILD ? 'הוסר השיוך' : `שויכו ל${displayLabel('child', childWizTarget)}`;
      const parts = [
        rowIds.length ? `${rowIds.length} עסקאות` : '',
        ruleIds.length ? `${ruleIds.length} כללים קבועים` : '',
      ].filter(Boolean);
      setChildWizStatus(`✅ ${label}: ${parts.join(' · ')}`);
      setChildWizRuleIds(new Set());
    } catch (e) {
      setChildWizStatus(`❌ שגיאה: ${String(e)}`);
    }
    setChildWizLoading(false);
  }

  async function createBackup() {
    const [txData, budgetData, assetData] = await Promise.all([
      base44.entities.Transaction.filter({}),
      base44.entities.Budget.filter({}),
      base44.entities.Asset.filter({}),
    ]);
    const backup = {
      exportedAt: new Date().toISOString(),
      transactions: txData,
      budgets: budgetData,
      assets: assetData,
    };
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'family-tracker-backup-' + new Date().toISOString().split('T')[0] + '.json';
    a.click();
  }

  async function clearAllData() {
    await createBackup();
    await base44.entities.Transaction.deleteAll();
    await base44.entities.Budget.deleteAll();
    await base44.entities.Asset.deleteAll();
    queryClient.invalidateQueries({ queryKey: ['transactions'] });
    setSelectedIds(new Set());
    setConfirmClear(false);
    setConfirmText('');
  }

  async function runMigration() {
    setMigrateLoading(true);
    setMigrateStatus('מתחיל העברה…');
    try {
      const counts = await migrateLocalToFirestore((msg) => setMigrateStatus(msg));
      setMigrateStatus(`✅ הועברו: ${counts.transactions} עסקאות, ${counts.budgets} תקציבים, ${counts.assets} נכסים`);
      queryClient.invalidateQueries({ queryKey: ['transactions'] });
    } catch (e) {
      setMigrateStatus(`❌ שגיאה: ${String(e)}`);
    }
    setMigrateLoading(false);
  }

  // ── Fix categories in Firestore ─────────────────────────────────────────

  async function scanFixCategories() {
    setFixCatLoading(true);
    setFixCatRows([]);
    setFixCatStatus('סורק עסקאות…');
    try {
      const all = await base44.entities.Transaction.filter();
      // Group by [txType, category] so expense and income are handled separately
      const counts: Record<string, { count: number; txType: 'expense' | 'income' }> = {};
      for (const t of all) {
        const txType = t.type === 'income' ? 'income' : 'expense';
        const cat = String(t.category ?? '').trim() || '(ריק)';
        const key = `${txType}::${cat}`;
        if (!counts[key]) counts[key] = { count: 0, txType };
        counts[key].count++;
      }
      const rows = Object.entries(counts)
        .map(([key, { count, txType }]) => {
          const from = key.slice(key.indexOf('::') + 2);
          const to = txType === 'income' ? mapIncomeCategory(from) : mapCategory(from);
          return { from, to, count, txType };
        })
        .sort((a, b) => {
          if (a.txType !== b.txType) return a.txType === 'expense' ? -1 : 1;
          return b.count - a.count;
        });
      setFixCatRows(rows);
      setFixCatStatus(`נמצאו ${rows.length} קטגוריות שונות ב-${all.length} עסקאות`);
    } catch (e) {
      setFixCatStatus(`❌ שגיאה: ${String(e)}`);
    }
    setFixCatLoading(false);
  }

  async function runFixCategories() {
    // mapping key: `txType::from` → target category string
    const mapping: Record<string, string> = {};
    for (const row of fixCatRows) {
      if (row.from !== row.to) mapping[`${row.txType}::${row.from}`] = row.to;
    }
    if (Object.keys(mapping).length === 0) {
      setFixCatStatus('✅ אין שינויים לבצע');
      return;
    }
    setFixCatLoading(true);
    setFixCatStatus('טוען עסקאות…');
    try {
      const all = await base44.entities.Transaction.filter();
      const toFix = all.filter((t) => {
        const txType = t.type === 'income' ? 'income' : 'expense';
        const cat = String(t.category ?? '').trim() || '(ריק)';
        return `${txType}::${cat}` in mapping;
      });
      if (toFix.length === 0) { setFixCatStatus('✅ אין מה לתקן'); setFixCatLoading(false); return; }
      let done = 0;
      for (const t of toFix) {
        const txType = t.type === 'income' ? 'income' : 'expense';
        const cat = String(t.category ?? '').trim() || '(ריק)';
        const newCat = mapping[`${txType}::${cat}`];
        await base44.entities.Transaction.update(t.id, { category: newCat as Category });
        done++;
        if (done % 20 === 0 || done === toFix.length) setFixCatStatus(`מתקן… ${done}/${toFix.length}`);
      }
      queryClient.invalidateQueries({ queryKey: ['transactions'] });
      setFixCatRows([]);
      setFixCatStatus(`✅ תוקנו ${toFix.length} עסקאות`);
    } catch (e) {
      setFixCatStatus(`❌ שגיאה: ${String(e)}`);
    }
    setFixCatLoading(false);
  }

  // ── Delete transactions by year ──────────────────────────────────────────
  async function runDeleteYear() {
    setDeleteYearLoading(true);
    setDeleteYearStatus(`מחפש עסקאות לשנת ${deleteYear}…`);
    try {
      const all = await base44.entities.Transaction.filter();
      const ids = all.filter((t) => t.date.startsWith(`${deleteYear}-`)).map((t) => t.id);
      if (ids.length === 0) { setDeleteYearStatus(`✅ אין עסקאות לשנת ${deleteYear}`); setDeleteYearLoading(false); return; }
      setDeleteYearStatus(`מוחק ${ids.length} עסקאות…`);
      await base44.entities.Transaction.bulkDelete(ids);
      queryClient.invalidateQueries({ queryKey: ['transactions'] });
      setDeleteYearStatus(`✅ נמחקו ${ids.length} עסקאות משנת ${deleteYear}`);
    } catch (e) {
      setDeleteYearStatus(`❌ שגיאה: ${String(e)}`);
    }
    setDeleteYearLoading(false);
  }

  // ── Annual Excel import ─────────────────────────────────────────────────
  function handleAnnualFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const workbook = XLSX.read(ev.target?.result, { type: 'array' });
      setAnnualSheetNames(workbook.SheetNames);
      const preview = parseAnnualExcel(workbook, annualYear);
      setAnnualPreview(preview);

      // Diagnostic: show rows of sheet "1" (the first monthly sheet)
      const ws1 = workbook.Sheets['1'];
      if (ws1) {
        const cols = 'ABCDEFGHIJKLMNOPQR'.split('');
        const rows: string[][] = [['שורה', ...cols]];
        for (let r = 1; r <= 30; r++) {
          const rowCells = cols.map(c => {
            const cell = ws1[`${c}${r}`];
            return cell?.v != null ? String(cell.v).substring(0, 15) : '';
          });
          if (rowCells.some(v => v !== '')) rows.push([String(r), ...rowCells]);
        }
        setAnnualDiag(rows);
        console.log('Sheet names:', workbook.SheetNames);
        console.log('Sheet "1" rows (1-20):', rows);
      }
    };
    reader.readAsArrayBuffer(file);
    e.target.value = '';
  }

  const [annualError, setAnnualError] = useState('');
  const [bulkCatOpen, setBulkCatOpen] = useState(false);
  const [bulkCatTarget, setBulkCatTarget] = useState('');
  const [wizardOpen, setWizardOpen]               = useState(false);
  const [wizardAnomalies, setWizardAnomalies]     = useState<WizardAnomaly[]>([]);
  const [wizardLoading, setWizardLoading]         = useState(false);
  const [wizardStep, setWizardStep]               = useState(0);
  const [wizardCustomValue, setWizardCustomValue] = useState('');
  const [wizardFixing, setWizardFixing]           = useState(false);
  const [wizardFixed, setWizardFixed]             = useState(0);
  const [wizardMarkReview, setWizardMarkReview]   = useState(false);
  // ── Child-assignment wizard ──
  const [childWizOpen, setChildWizOpen]           = useState(false);
  const [childWizTarget, setChildWizTarget]       = useState<string | null>(null); // null = nothing picked yet
  const [childWizRuleIds, setChildWizRuleIds]     = useState<Set<string>>(new Set());
  const [childWizLoading, setChildWizLoading]     = useState(false);
  const [childWizStatus, setChildWizStatus]       = useState('');

  async function importAnnualData() {
    setAnnualLoading(true);
    setAnnualError('');
    const allRows = annualPreview.flatMap((m) => [...m.expenses, ...m.incomes]) as Omit<Transaction, 'id'>[];
    setAnnualProgress({ done: 0, total: allRows.length });
    try {
      await base44.entities.Transaction.bulkCreate(allRows, (done, total) => {
        setAnnualProgress({ done, total });
      });
      queryClient.invalidateQueries({ queryKey: ['transactions'] });
      setAnnualOpen(false);
      setAnnualPreview([]);
    } catch (e) {
      setAnnualError(`שגיאה: ${String(e)}`);
    } finally {
      setAnnualLoading(false);
      setAnnualProgress({ done: 0, total: 0 });
    }
  }

  async function importPasteRows() {
    for (const row of pasteRows) {
      if (row.amount) await base44.entities.Transaction.create(row as Omit<Transaction, 'id'>);
    }
    queryClient.invalidateQueries({ queryKey: ['transactions'] });
    closePasteDialog();
  }

  // ── paste from clipboard on the table ───────────────────────────────────
  function handleTablePaste(e: React.ClipboardEvent) {
    if (editingCell) return; // let the input handle it
    const text = e.clipboardData.getData('text/plain');
    if (!text?.includes('\t')) return;
    e.preventDefault();
    const parsed = parsePasteText(text);
    if (parsed.length) { setPasteRows(parsed); setPasteOpen(true); }
  }

  // ── paste dialog ────────────────────────────────────────────────────────
  function openPasteDialog() { setPasteOpen(true); setPasteRows([]); setPasteText(''); }
  function closePasteDialog() { setPasteOpen(false); setPasteRows([]); setPasteText(''); }

  function handlePasteTextChange(text: string) {
    setPasteText(text);
    setPasteRows(parsePasteText(text));
  }

  // ── export CSV ──────────────────────────────────────────────────────────
  function exportCSV() {
    const header = COLUMNS.map((c) => c.label).join(',');
    const csvRows = transactions.map((t) =>
      COLUMNS.map((c) => {
        const v = t[c.key as keyof Transaction] ?? '';
        return `"${String(v).replace(/"/g, '""')}"`;
      }).join(','),
    );
    const blob = new Blob(['\ufeff' + [header, ...csvRows].join('\n')], { type: 'text/csv;charset=utf-8;' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `transactions_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
  }

  // ── toggle sort ─────────────────────────────────────────────────────────
  function toggleSort(field: string) {
    if (sortField === field) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortField(field); setSortDir('asc'); }
  }

  // Close dropdown when clicking outside
  useEffect(() => {
    if (!editingCell) return;
    const close = (e: MouseEvent) => {
      if (!(e.target as Element).closest('[data-cell]')) setEditingCell(null);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [editingCell]);

  // ── cell renderer ────────────────────────────────────────────────────────
  function renderCell(row: Transaction, col: typeof COLUMNS[number]) {
    const isEditing = editingCell?.id === row.id && editingCell?.field === col.key;
    const value = row[col.key as keyof Transaction] ?? '';

    if (isEditing) {
      // Custom dropdown for select columns
      if (col.type === 'select' && 'options' in col) {
        const cellOptions: readonly string[] = col.key === 'category'
          ? (row.type === 'income' ? INCOME_CATEGORIES : CATEGORIES)
          : (col.options as readonly string[]);
        return (
          <div data-cell className="relative h-full" style={{ zIndex: 200 }}>
            {/* Current value bar */}
            <div className="px-2 py-1 text-sm bg-yellow-50 h-full flex items-center font-medium cursor-default">
              {displayLabel(col.key, String(value))}
            </div>
            {/* Options list */}
            <div className="absolute top-full right-0 bg-white border border-gray-300 rounded shadow-xl"
                 style={{ minWidth: '130px', zIndex: 9999 }}>
              {cellOptions.map((opt) => (
                <div
                  key={opt}
                  className={[
                    'px-3 py-2 text-sm cursor-pointer whitespace-nowrap',
                    opt === String(value)
                      ? 'bg-blue-500 text-white font-medium'
                      : 'text-gray-800 hover:bg-blue-50',
                  ].join(' ')}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    updateCell(row.id, col.key, opt);
                    setEditingCell(null);
                  }}
                >
                  {displayLabel(col.key, opt)}
                </div>
              ))}
            </div>
          </div>
        );
      }

      // Text / number / date input
      return (
        <div data-cell className="h-full">
          <input
            autoFocus
            type={col.type === 'number' ? 'number' : col.type === 'date' ? 'date' : 'text'}
            className="w-full h-full bg-yellow-50 border-0 outline-none text-sm px-2"
            defaultValue={String(value)}
            onBlur={(e) => {
              const v = col.type === 'number' ? parseFloat(e.target.value) : e.target.value;
              updateCell(row.id, col.key, v);
              setEditingCell(null);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === 'Escape') {
                const inp = e.target as HTMLInputElement;
                const v = col.type === 'number' ? parseFloat(inp.value) : inp.value;
                updateCell(row.id, col.key, v);
                setEditingCell(null);
              }
            }}
          />
        </div>
      );
    }

    // ── Display (read-only) ──
    let display = displayLabel(col.key, String(value));
    if (col.key === 'amount') display = `₪${Number(value).toLocaleString()}`;
    // An untagged row shows a quiet dash — "ללא שיוך" on every row is pure noise.
    if (col.key === 'child' && !value) display = '—';

    return (
      <div
        data-cell
        className="px-2 py-1 truncate text-sm cursor-pointer hover:bg-yellow-50 h-full flex items-center"
        onClick={() => setEditingCell({ id: row.id, field: col.key })}
        title={String(value)}
      >
        {display}
      </div>
    );
  }

  // ── paste dialog column headers ──────────────────────────────────────────
  const pasteColLabels = PASTE_COL_ORDER.map((k) => COLUMNS.find((c) => c.key === k)?.label ?? k);

  // ────────────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col text-gray-900 bg-white" style={{ height: 'calc(100vh - 56px - 64px)' }} dir="rtl">

      {/* ── Toolbar ── */}
      <div className="flex flex-wrap items-center gap-2 px-3 py-2 bg-white border-b">
        <span className="font-bold text-gray-700">🗃 מנהל נתונים</span>
        <span className="text-gray-400 text-sm">{transactions.length} רשומות</span>

        <input
          type="text"
          placeholder="חיפוש בכל השדות..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="border rounded px-3 py-1.5 text-sm w-52 mr-2"
        />
        <button
          onClick={() => setShowColFilters((v) => !v)}
          className={`px-3 py-1.5 rounded text-sm border transition-all ${showColFilters || activeColFilters > 0 ? 'bg-blue-100 border-blue-400 text-blue-700 font-medium' : 'border-gray-300 text-gray-600 hover:bg-gray-50'}`}
        >
          🔽 פילטר עמודות{activeColFilters > 0 ? ` (${activeColFilters})` : ''}
        </button>
        {activeColFilters > 0 && (
          <button onClick={() => setColFilters({})} className="text-xs text-red-500 hover:underline">✕ נקה פילטרים</button>
        )}
        {reviewIds.size > 0 && (
          <button
            onClick={() => setShowReviewOnly(v => !v)}
            className={`px-3 py-1.5 rounded text-sm border transition-all ${showReviewOnly ? 'bg-amber-500 text-white border-amber-500' : 'bg-amber-50 text-amber-700 border-amber-300 hover:bg-amber-100'}`}
          >
            🔖 בחינה בהמשך ({reviewIds.size})
          </button>
        )}

        <div className="flex gap-2 mr-auto flex-wrap">
          <button onClick={addRow}           className="bg-green-500 text-white px-3 py-1.5 rounded text-sm hover:bg-green-600">+ שורה חדשה</button>
          <button onClick={openPasteDialog}  className="bg-blue-500  text-white px-3 py-1.5 rounded text-sm hover:bg-blue-600">📋 הדבק מאקסל</button>
          <button onClick={() => { setAnnualPreview([]); setAnnualSheetNames([]); setAnnualDiag([]); setAnnualOpen(true); }} className="bg-purple-600 text-white px-3 py-1.5 rounded text-sm hover:bg-purple-700">📂 יבא קובץ שנתי</button>
          {selectedIds.size > 0 && (
            <button onClick={() => { setBulkCatTarget(''); setBulkCatOpen(true); }} className="bg-indigo-500 text-white px-3 py-1.5 rounded text-sm hover:bg-indigo-600">
              🏷 שנה קטגוריה ({selectedIds.size})
            </button>
          )}
          {selectedIds.size > 0 && (
            <button onClick={deleteSelected} className="bg-red-500   text-white px-3 py-1.5 rounded text-sm hover:bg-red-600">
              🗑 מחק נבחרים ({selectedIds.size})
            </button>
          )}
          <button onClick={exportCSV}        className="bg-gray-200  text-gray-700 px-3 py-1.5 rounded text-sm hover:bg-gray-300">⬇ ייצא CSV</button>
          <button onClick={() => { setFixCatStatus(''); setFixCatRows([]); setFixCatOpen(true); }} className="bg-teal-100 text-teal-700 px-3 py-1.5 rounded text-sm hover:bg-teal-200 border border-teal-300">🔧 תקן קטגוריות</button>
          <button onClick={openChildWizard} className="bg-cyan-100 text-cyan-700 px-3 py-1.5 rounded text-sm hover:bg-cyan-200 border border-cyan-300">
            🧒 שיוך לילדים{selectedIds.size > 0 ? ` (${selectedIds.size})` : ''}
          </button>
          <button onClick={openWizard} className="bg-violet-100 text-violet-700 px-3 py-1.5 rounded text-sm hover:bg-violet-200 border border-violet-300">🔬 Finetune Wizard</button>
          <button onClick={() => { setDeleteYearStatus(''); setDeleteYearOpen(true); }} className="bg-orange-100 text-orange-700 px-3 py-1.5 rounded text-sm hover:bg-orange-200 border border-orange-300">🗓 מחק שנה</button>
          <button onClick={() => setConfirmClear(true)} className="bg-red-100 text-red-700 px-3 py-1.5 rounded text-sm hover:bg-red-200 border border-red-300">🧹 אפס נתונים</button>
        </div>
      </div>

      {/* ── Template hint ── */}
      <div className="px-3 py-1.5 bg-blue-50 border-b text-xs text-blue-700">
        סדר עמודות להדבקה מאקסל: <span className="font-mono">{pasteColLabels.join(' | ')}</span>
      </div>

      {/* ── Table ── */}
      <div
        ref={containerRef}
        className="flex-1 overflow-auto"
        onPaste={handleTablePaste}
        tabIndex={0}
      >
        <table className="border-collapse text-sm" style={{ minWidth: 1300 }}>
          <thead className="sticky top-0 bg-gray-100 z-10">
            <tr>
              <th className="w-8 px-2 py-2 text-center border-b border-l bg-gray-100">
                <input
                  type="checkbox"
                  checked={selectedIds.size === rows.length && rows.length > 0}
                  onChange={(e) => {
                    setSelectedIds(e.target.checked ? new Set(rows.map((r) => r.id)) : new Set());
                    lastCheckedIdx.current = null;
                  }}
                />
              </th>
              <th className="w-10 px-2 py-2 text-center border-b border-l bg-gray-100 text-gray-400">#</th>
              {COLUMNS.map((col) => (
                <th
                  key={col.key}
                  className="px-2 py-2 text-right border-b border-l cursor-pointer hover:bg-gray-200 whitespace-nowrap font-semibold text-gray-700"
                  style={{ minWidth: col.width }}
                  onClick={() => toggleSort(col.key)}
                >
                  {col.label}{' '}
                  {sortField === col.key ? (sortDir === 'asc' ? '▲' : '▼') : <span className="text-gray-300">↕</span>}
                  {colFilters[col.key] && <span className="mr-1 text-blue-500 text-xs">●</span>}
                </th>
              ))}
              <th className="w-14 px-2 py-2 border-b bg-gray-100" />
            </tr>

            {/* ── Column filter row ── */}
            {showColFilters && (
              <tr className="bg-blue-50">
                <th className="border-b border-l" />
                <th className="border-b border-l" />
                {COLUMNS.map((col) => (
                  <th key={col.key} className="border-b border-l px-1 py-1" style={{ minWidth: col.width }}>
                    {col.type === 'select' && 'options' in col ? (
                      <select
                        value={colFilters[col.key] ?? ''}
                        onChange={(e) => setColFilters((prev) => ({ ...prev, [col.key]: e.target.value }))}
                        className="w-full text-xs border rounded px-1 py-0.5 bg-white text-gray-800 focus:outline-none focus:ring-1 focus:ring-blue-400"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <option value="">הכל</option>
                        {(col.options as readonly string[]).map((opt) => (
                          <option
                            key={opt}
                            value={col.key === 'child' && opt === NO_CHILD ? FILTER_NO_CHILD : opt}
                          >
                            {displayLabel(col.key, opt)}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <input
                        type="text"
                        value={colFilters[col.key] ?? ''}
                        onChange={(e) => setColFilters((prev) => ({ ...prev, [col.key]: e.target.value }))}
                        placeholder="סנן..."
                        className="w-full text-xs border rounded px-1 py-0.5 bg-white text-gray-800 focus:outline-none focus:ring-1 focus:ring-blue-400"
                        onClick={(e) => e.stopPropagation()}
                      />
                    )}
                  </th>
                ))}
                <th className="border-b" />
              </tr>
            )}
          </thead>

          <tbody>
            {rows.length > 500 && (
              <tr><td colSpan={COLUMNS.length + 3} className="text-center py-2 text-xs text-amber-700 bg-amber-50 border-b">
                מציג 500 מתוך {rows.length} שורות — הוסף פילטר לצמצום התוצאות
              </td></tr>
            )}
            {rows.slice(0, 500).map((row, idx) => (
              <tr
                key={row.id}
                style={{ height: 36, borderLeft: reviewIds.has(row.id) ? '4px solid #f59e0b' : undefined }}
                className={[
                  'border-b',
                  selectedIds.has(row.id)    ? 'bg-blue-50'  :
                  reviewIds.has(row.id)      ? 'bg-amber-50' :
                  row.type === 'income'      ? 'bg-green-50' :
                  idx % 2 === 0              ? 'bg-white'    : 'bg-gray-50',
                  'hover:brightness-95',
                ].join(' ')}
              >
                <td className="px-2 text-center border-l">
                  <input
                    type="checkbox"
                    checked={selectedIds.has(row.id)}
                    onChange={(e) => {
                      const checked = e.target.checked;
                      if (e.nativeEvent instanceof MouseEvent && e.nativeEvent.shiftKey && lastCheckedIdx.current !== null) {
                        const from = Math.min(lastCheckedIdx.current, idx);
                        const to   = Math.max(lastCheckedIdx.current, idx);
                        setSelectedIds((prev) => {
                          const n = new Set(prev);
                          rows.slice(from, to + 1).forEach((r) => checked ? n.add(r.id) : n.delete(r.id));
                          return n;
                        });
                      } else {
                        setSelectedIds((prev) => {
                          const n = new Set(prev);
                          checked ? n.add(row.id) : n.delete(row.id);
                          return n;
                        });
                      }
                      lastCheckedIdx.current = idx;
                    }}
                  />
                </td>
                <td className="px-2 text-center border-l text-gray-400 text-xs">{idx + 1}</td>
                {COLUMNS.map((col) => (
                  <td key={col.key} className="border-l p-0" style={{ height: 36 }}>
                    {renderCell(row, col)}
                  </td>
                ))}
                <td className="px-2 text-center">
                  <button
                    onClick={() => deleteRow(row.id)}
                    className="text-red-300 hover:text-red-600 text-xl leading-none"
                    title="מחק שורה"
                  >
                    ×
                  </button>
                </td>
              </tr>
            ))}

            {!isLoading && rows.length === 0 && (
              <tr>
                <td colSpan={COLUMNS.length + 3} className="text-center py-12 text-gray-400">
                  אין נתונים. לחץ "+ שורה חדשה" או הדבק מאקסל.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* ── Annual Excel Import Dialog ── */}
      {annualOpen && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col" dir="rtl">

            <div className="flex items-center justify-between p-4 border-b">
              <h2 className="text-lg font-bold">📂 יבוא קובץ אקסל שנתי</h2>
              <button onClick={() => { setAnnualOpen(false); setAnnualPreview([]); setAnnualSheetNames([]); }} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">×</button>
            </div>

            <div className="flex-1 overflow-auto p-5">
              {/* Step 1 – year + upload */}
              <div className="flex items-center gap-4 mb-5 flex-wrap">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">שנת הקובץ</label>
                  <select
                    value={annualYear}
                    onChange={(e) => { setAnnualYear(Number(e.target.value)); setAnnualPreview([]); }}
                    className="border rounded px-3 py-1.5 text-sm text-gray-900"
                  >
                    {[2021,2022,2023,2024,2025,2026].map(y => <option key={y} value={y}>{y}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">קובץ אקסל</label>
                  <label className="cursor-pointer bg-purple-600 text-white px-4 py-1.5 rounded text-sm hover:bg-purple-700 inline-block">
                    בחר קובץ (.xlsx)
                    <input
                      type="file"
                      accept=".xlsx,.xls"
                      className="hidden"
                      onChange={handleAnnualFile}
                    />
                  </label>
                </div>
                {annualPreview.length > 0 && (
                  <span className="text-green-700 text-sm font-medium self-end">
                    ✓ זוהו {annualPreview.reduce((s,m)=>s+m.expenses.length+m.incomes.length,0)} רשומות ב-{annualPreview.length} חודשים
                  </span>
                )}
              </div>

              {/* Sheet names found + error if no match */}
              {annualSheetNames.length > 0 && annualPreview.length === 0 && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-sm mb-4">
                  <p className="font-medium text-red-700 mb-2">⚠️ לא נמצאו נתונים בקובץ</p>
                  <p className="text-red-600 mb-2">
                    המערכת מחפשת לשוניות בשם <strong>1, 2, 3 ... 12</strong> אבל הלשוניות בקובץ הן:
                  </p>
                  <div className="flex flex-wrap gap-1">
                    {annualSheetNames.map(n => (
                      <span key={n} className="bg-white border border-red-300 rounded px-2 py-0.5 font-mono text-xs text-red-700">{n}</span>
                    ))}
                  </div>
                  <p className="text-red-500 text-xs mt-2">
                    יש לשנות את שמות הלשוניות החודשיות ל-1, 2, 3... ולאחר מכן לנסות שוב.
                  </p>
                </div>
              )}

              {/* Format hint — shown only before any file is uploaded */}
              {annualSheetNames.length === 0 && (
                <div className="bg-gray-50 border rounded-lg p-4 text-sm text-gray-600">
                  <p className="font-medium mb-2">מבנה קובץ נדרש:</p>
                  <ul className="space-y-1 list-disc list-inside">
                    <li>לשוניות בשם <strong>1</strong> עד <strong>12</strong> (חודשים)</li>
                    <li>שורות נתונים מתחילות בשורה <strong>9</strong></li>
                    <li>הוצאות: עמודות <strong>A–H</strong> (ימין) — סוג | פרטים | משלם | סכום | שיטה | סיווג | הערות</li>
                    <li>הכנסות: עמודות <strong>L–R</strong> (שמאל) — סוג | פרטים | מקור | סכום | שיטה | הערות</li>
                    <li>תאריך: <strong>1 לחודש</strong> לפי מספר הלשונית</li>
                  </ul>
                </div>
              )}

              {/* Diagnostic: raw sheet preview when no data found */}
              {annualDiag.length > 0 && annualPreview.length === 0 && (
                <div className="mt-4">
                  <p className="text-xs font-semibold text-gray-500 mb-1">
                    🔍 תוכן הלשונית "1" (שורות עם נתונים):
                  </p>
                  <div className="overflow-auto border rounded text-xs font-mono max-h-48">
                    <table className="border-collapse w-max">
                      <tbody>
                        {annualDiag.map((row, i) => (
                          <tr key={i} className={i === 0 ? 'bg-gray-200 font-bold' : i % 2 === 0 ? 'bg-gray-50' : ''}>
                            {row.map((cell, j) => (
                              <td key={j} className="border px-1.5 py-0.5 whitespace-nowrap text-gray-700">{cell}</td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <p className="text-xs text-gray-400 mt-1">הקוד מחפש: שורה 9+, סכום הוצאה בעמודה D, סכום הכנסה בעמודה O</p>
                </div>
              )}

              {/* Preview table */}
              {annualPreview.length > 0 && (
                <table className="w-full text-sm border-collapse">
                  <thead className="bg-gray-100">
                    <tr>
                      <th className="px-3 py-2 border text-right">חודש</th>
                      <th className="px-3 py-2 border text-center">הוצאות</th>
                      <th className="px-3 py-2 border text-center">סה״כ הוצאות</th>
                      <th className="px-3 py-2 border text-center">הכנסות</th>
                      <th className="px-3 py-2 border text-center">סה״כ הכנסות</th>
                    </tr>
                  </thead>
                  <tbody>
                    {annualPreview.map((m) => {
                      const totalExp = m.expenses.reduce((s,r)=>s+(r.amount??0),0);
                      const totalInc = m.incomes.reduce((s,r)=>s+(r.amount??0),0);
                      return (
                        <tr key={m.month} className={m.month % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                          <td className="px-3 py-2 border font-medium">{m.monthName} {annualYear}</td>
                          <td className="px-3 py-2 border text-center text-red-600">{m.expenses.length} שורות</td>
                          <td className="px-3 py-2 border text-center text-red-600">₪{totalExp.toLocaleString()}</td>
                          <td className="px-3 py-2 border text-center text-green-600">{m.incomes.length} שורות</td>
                          <td className="px-3 py-2 border text-center text-green-600">₪{totalInc.toLocaleString()}</td>
                        </tr>
                      );
                    })}
                    <tr className="bg-gray-200 font-bold">
                      <td className="px-3 py-2 border">סה״כ</td>
                      <td className="px-3 py-2 border text-center text-red-700">{annualPreview.reduce((s,m)=>s+m.expenses.length,0)}</td>
                      <td className="px-3 py-2 border text-center text-red-700">₪{annualPreview.reduce((s,m)=>s+m.expenses.reduce((ss,r)=>ss+(r.amount??0),0),0).toLocaleString()}</td>
                      <td className="px-3 py-2 border text-center text-green-700">{annualPreview.reduce((s,m)=>s+m.incomes.length,0)}</td>
                      <td className="px-3 py-2 border text-center text-green-700">₪{annualPreview.reduce((s,m)=>s+m.incomes.reduce((ss,r)=>ss+(r.amount??0),0),0).toLocaleString()}</td>
                    </tr>
                  </tbody>
                </table>
              )}
            </div>

            {annualError && (
              <div className="mx-5 mb-2 bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">{annualError}</div>
            )}
            <div className="flex gap-3 justify-end p-4 border-t">
              <button onClick={() => { setAnnualOpen(false); setAnnualPreview([]); setAnnualSheetNames([]); setAnnualError(''); }} className="px-4 py-2 border rounded hover:bg-gray-50 text-sm">ביטול</button>
              {annualPreview.length > 0 && (
                <button
                  onClick={importAnnualData}
                  disabled={annualLoading}
                  className="px-5 py-2 bg-purple-600 text-white rounded hover:bg-purple-700 text-sm font-medium disabled:opacity-60"
                >
                  {annualLoading
                    ? annualProgress.total > 0
                      ? `מייבא... ${annualProgress.done}/${annualProgress.total}`
                      : 'מייבא...'
                    : `יבא ${annualPreview.reduce((s,m)=>s+m.expenses.length+m.incomes.length,0)} רשומות →`}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Migrate from localStorage Dialog ── */}
      {migrateOpen && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl p-6 w-full max-w-sm text-center" dir="rtl">
            <div className="text-4xl mb-3">☁️</div>
            <h2 className="text-lg font-bold mb-2">העבר נתונים מקומיים לענן</h2>
            <p className="text-gray-500 text-sm mb-4">
              נמצאו נתונים ישנים השמורים על המכשיר הזה.<br />
              לחץ "העבר" כדי להעלות אותם ל-Firestore.
            </p>
            {migrateStatus && (
              <p className="text-sm font-medium text-blue-700 mb-4 bg-blue-50 rounded-lg px-3 py-2">{migrateStatus}</p>
            )}
            <div className="flex gap-3 justify-center">
              <button onClick={() => { setMigrateOpen(false); setMigrateStatus(''); }} className="px-5 py-2 border rounded-lg hover:bg-gray-50 text-sm" disabled={migrateLoading}>סגור</button>
              <button onClick={runMigration} disabled={migrateLoading || migrateStatus.startsWith('✅')} className="px-5 py-2 bg-amber-500 text-white rounded-lg hover:bg-amber-600 text-sm font-medium disabled:opacity-60">
                {migrateLoading ? 'מעביר…' : 'העבר לענן →'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Fix Categories Dialog ── */}
      {fixCatOpen && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl p-6 w-full max-w-2xl" dir="rtl">
            <div className="text-4xl mb-2 text-center">🔧</div>
            <h2 className="text-lg font-bold mb-1 text-center">תיקון קטגוריות בבסיס הנתונים</h2>
            <p className="text-gray-500 text-sm mb-3 text-center">
              סרוק את כל הקטגוריות הקיימות, ערוך את מיפוי היעד לפי הצורך, ולחץ "תקן".
            </p>

            {fixCatStatus && (
              <p className="text-sm font-medium text-teal-700 mb-3 bg-teal-50 rounded-lg px-3 py-2 text-center">{fixCatStatus}</p>
            )}

            {fixCatRows.length > 0 && (
              <div className="mb-3 max-h-96 overflow-y-auto border rounded-lg text-sm">
                <table className="w-full">
                  <thead className="bg-gray-50 sticky top-0 z-10">
                    <tr>
                      <th className="px-3 py-2 text-right font-medium text-gray-600">סוג</th>
                      <th className="px-3 py-2 text-right font-medium text-gray-600 w-4/12">קטגוריה נוכחית</th>
                      <th className="px-3 py-2 text-right font-medium text-gray-600 w-5/12">קטגוריה יעד</th>
                      <th className="px-3 py-2 text-center font-medium text-gray-600">כמות</th>
                    </tr>
                  </thead>
                  <tbody>
                    {fixCatRows.map((row, i) => (
                      <tr key={`${row.txType}::${row.from}`} className={`border-t ${row.from !== row.to ? 'bg-yellow-50' : ''}`}>
                        <td className="px-3 py-1.5">
                          <span className={`text-xs font-medium px-1.5 py-0.5 rounded-full ${row.txType === 'income' ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700'}`}>
                            {row.txType === 'income' ? 'הכנסה' : 'הוצאה'}
                          </span>
                        </td>
                        <td className={`px-3 py-1.5 font-mono text-sm ${row.from !== row.to ? 'text-red-600' : 'text-gray-700'}`}>
                          {row.from}
                        </td>
                        <td className="px-2 py-1">
                          <select
                            value={row.to}
                            onChange={(e) => {
                              const updated = [...fixCatRows];
                              updated[i] = { ...row, to: e.target.value };
                              setFixCatRows(updated);
                            }}
                            className={`w-full border rounded px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-teal-400
                              ${row.from !== row.to ? 'border-teal-400 bg-teal-50 text-teal-800 font-medium' : 'border-gray-200 text-gray-700'}`}
                          >
                            {(row.txType === 'income' ? INCOME_CATEGORIES : CATEGORIES).map((cat) => (
                              <option key={cat} value={cat}>{cat}</option>
                            ))}
                          </select>
                        </td>
                        <td className="px-3 py-1.5 text-center text-gray-500 tabular-nums">{row.count}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {fixCatRows.length > 0 && (
              <p className="text-xs text-gray-400 mb-3 text-center">
                שורות מסומנות בצהוב יעודכנו · לחץ על הרשימה הנפתחת לשינוי יעד
              </p>
            )}

            <div className="flex gap-3 justify-center">
              <button
                onClick={() => { setFixCatOpen(false); setFixCatStatus(''); setFixCatRows([]); }}
                className="px-5 py-2 border rounded-lg hover:bg-gray-50 text-sm"
                disabled={fixCatLoading}
              >
                סגור
              </button>
              {fixCatRows.length === 0 && (
                <button
                  onClick={scanFixCategories}
                  disabled={fixCatLoading}
                  className="px-5 py-2 bg-slate-600 text-white rounded-lg hover:bg-slate-700 text-sm font-medium disabled:opacity-60"
                >
                  {fixCatLoading ? 'סורק…' : '🔍 סרוק'}
                </button>
              )}
              {fixCatRows.length > 0 && (
                <button
                  onClick={runFixCategories}
                  disabled={fixCatLoading || fixCatRows.every((r) => r.from === r.to)}
                  className="px-5 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 text-sm font-medium disabled:opacity-60"
                >
                  {fixCatLoading
                    ? 'מתקן…'
                    : `✅ תקן ${fixCatRows.filter((r) => r.from !== r.to).reduce((s, r) => s + r.count, 0)} עסקאות`}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Delete Year Dialog ── */}
      {deleteYearOpen && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl p-6 w-full max-w-sm text-center" dir="rtl">
            <div className="text-4xl mb-3">🗓</div>
            <h2 className="text-lg font-bold mb-2">מחיקת נתוני שנה</h2>
            <p className="text-gray-500 text-sm mb-4">
              מחיקת כל העסקאות של שנה מסוימת לפני ייבוא מחדש.
            </p>
            <div className="flex items-center justify-center gap-3 mb-4">
              <label className="text-sm font-medium text-gray-700">שנה:</label>
              <select
                value={deleteYear}
                onChange={(e) => setDeleteYear(Number(e.target.value))}
                className="border rounded px-3 py-1.5 text-sm"
                disabled={deleteYearLoading}
              >
                {[2021,2022,2023,2024,2025,2026].map(y => <option key={y} value={y}>{y}</option>)}
              </select>
            </div>
            {deleteYearStatus && (
              <p className={`text-sm font-medium mb-4 rounded-lg px-3 py-2 ${deleteYearStatus.startsWith('✅') ? 'text-green-700 bg-green-50' : 'text-orange-700 bg-orange-50'}`}>{deleteYearStatus}</p>
            )}
            <div className="flex gap-3 justify-center">
              <button onClick={() => { setDeleteYearOpen(false); setDeleteYearStatus(''); }} className="px-5 py-2 border rounded-lg hover:bg-gray-50 text-sm" disabled={deleteYearLoading}>סגור</button>
              <button onClick={runDeleteYear} disabled={deleteYearLoading || deleteYearStatus.startsWith('✅')} className="px-5 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 text-sm font-medium disabled:opacity-60">
                {deleteYearLoading ? 'מוחק…' : `מחק שנת ${deleteYear} →`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Confirm Clear Dialog ── */}
      {confirmClear && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl p-6 w-full max-w-sm text-center" dir="rtl">
            <div className="text-4xl mb-3">⚠️</div>
            <h2 className="text-lg font-bold mb-2 text-red-600">מחיקת כל הנתונים</h2>
            <p className="text-gray-500 text-sm mb-2">
              פעולה זו תמחק את כל העסקאות, התקציבים והנכסים לצמיתות.
            </p>
            <p className="text-gray-500 text-sm mb-4">
              גיבוי JSON יורד אוטומטית לפני המחיקה.<br />
              כדי לאשר הקלד: <strong>מחק הכל</strong>
            </p>
            <input
              type="text"
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder='הקלד "מחק הכל" לאישור'
              className="w-full border rounded-lg px-3 py-2 mb-4 text-right text-sm"
            />
            <div className="flex gap-3 justify-center">
              <button onClick={() => { setConfirmClear(false); setConfirmText(''); }} className="px-5 py-2 border rounded-lg hover:bg-gray-50 text-sm">ביטול</button>
              <button onClick={clearAllData} disabled={confirmText !== 'מחק הכל'} className="px-5 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 text-sm font-medium disabled:opacity-40">מחק הכל</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Finetune Wizard Dialog ── */}
      {wizardOpen && (() => {
        const isScanned  = wizardAnomalies.length > 0;
        const isDone     = isScanned && wizardStep >= wizardAnomalies.length;
        const anomaly    = isScanned && !isDone ? wizardAnomalies[wizardStep] : null;
        const fieldOpts  = anomaly ? getWizardOptions(anomaly.field) : [];
        const fixValue   = wizardCustomValue || (anomaly?.fixValue ?? '');

        const outlierCounts: Record<string, number> = {};
        if (anomaly) {
          for (const r of anomaly.outlierRows) {
            const v = String((r as unknown as Record<string, unknown>)[anomaly.field] ?? '');
            outlierCounts[v] = (outlierCounts[v] ?? 0) + 1;
          }
        }
        const sortedOutliers = Object.entries(outlierCounts).sort((a, b) => b[1] - a[1]);

        return (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg flex flex-col" dir="rtl">

            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b">
              <div>
                <h2 className="text-lg font-bold">🔬 Finetune Wizard</h2>
                {isScanned && (
                  <p className="text-xs text-gray-500 mt-0.5">
                    {isDone ? 'הסתיים' : `חריג ${wizardStep + 1} מתוך ${wizardAnomalies.length}`}
                  </p>
                )}
              </div>
              <button onClick={closeWizard} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">×</button>
            </div>

            {/* Progress bar */}
            {isScanned && (
              <div className="h-1.5 bg-gray-100">
                <div className="h-1.5 bg-violet-500 transition-all duration-300"
                  style={{ width: `${(wizardStep / wizardAnomalies.length) * 100}%` }} />
              </div>
            )}

            {/* Body */}
            <div className="p-6 min-h-[320px]">
              {!isScanned ? (
                <div className="text-center py-8">
                  <div className="text-5xl mb-4">🔬</div>
                  <p className="text-gray-600 mb-1 text-sm">יסרוק <strong>{transactions.length}</strong> עסקאות ויאתר חריגים לפי בית עסק</p>
                  <p className="text-gray-400 text-xs mb-6">מינימום 4 עסקאות · סף דומיננטיות 60%</p>
                  <button onClick={runWizardScan} disabled={wizardLoading}
                    className="px-6 py-2.5 bg-violet-600 text-white rounded-lg hover:bg-violet-700 font-medium text-sm disabled:opacity-60">
                    {wizardLoading ? '⏳ סורק…' : '🔍 התחל סריקה'}
                  </button>
                </div>
              ) : isDone ? (
                <div className="text-center py-8">
                  <div className="text-5xl mb-3">✅</div>
                  <h3 className="text-lg font-bold text-gray-800 mb-1">הוויזארד הסתיים!</h3>
                  <p className="text-gray-500 text-sm mb-6">
                    {wizardFixed} חריגים תוקנו · {wizardAnomalies.length - wizardFixed} דולגו
                  </p>
                  <button onClick={runWizardScan} className="px-5 py-2 bg-violet-600 text-white rounded-lg hover:bg-violet-700 text-sm font-medium">
                    סרוק שוב
                  </button>
                </div>
              ) : anomaly ? (
                <div>
                  {/* Merchant + field */}
                  <div className="flex items-start justify-between mb-4">
                    <div>
                      <h3 className="text-xl font-bold text-gray-800">{anomaly.merchant}</h3>
                      <p className="text-sm text-gray-400 mt-0.5">{anomaly.totalCount} עסקאות סה״כ</p>
                    </div>
                    <span className={`text-xs px-2 py-1 rounded-full font-medium shrink-0 ${{
                      high: 'bg-red-100 text-red-700', medium: 'bg-yellow-100 text-yellow-700', low: 'bg-gray-100 text-gray-600'
                    }[anomaly.priority]}`}>{anomaly.fieldLabel}</span>
                  </div>

                  {/* Dominant */}
                  <div className="bg-green-50 border border-green-200 rounded-lg p-3 mb-3">
                    <p className="text-xs font-semibold text-green-600 mb-1">
                      ✅ ערך דומיננטי — {Math.round(anomaly.dominantCount / anomaly.totalCount * 100)}% מהעסקאות
                    </p>
                    <p className="text-base font-bold text-green-800">
                      {displayLabel(anomaly.field, anomaly.dominant)}
                      <span className="text-green-500 font-normal text-sm mr-2">({anomaly.dominantCount} שורות)</span>
                    </p>
                  </div>

                  {/* Outliers */}
                  <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-4">
                    <p className="text-xs font-semibold text-red-600 mb-2">❌ חריגים — {anomaly.outlierRows.length} שורות</p>
                    <div className="flex flex-wrap gap-1.5">
                      {sortedOutliers.map(([val, count]) => (
                        <span key={val} className="bg-white border border-red-200 rounded-full px-2.5 py-0.5 text-sm text-red-700 font-medium">
                          {displayLabel(anomaly.field, val)} <span className="text-red-400 font-normal">×{count}</span>
                        </span>
                      ))}
                    </div>
                  </div>

                  {/* Fix */}
                  {!anomaly.isAmount ? (
                    <div>
                      <p className="text-sm font-medium text-gray-700 mb-2">
                        💡 שנה את {anomaly.outlierRows.length} החריגים ל:
                      </p>
                      <select
                        value={fixValue}
                        onChange={e => setWizardCustomValue(e.target.value)}
                        className="w-full border rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-violet-400"
                      >
                        {fieldOpts.map(opt => (
                          <option key={opt} value={opt}>{displayLabel(anomaly.field, opt)}</option>
                        ))}
                      </select>
                    </div>
                  ) : (
                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                      <p className="text-sm text-blue-700 font-medium mb-1">👁 חריג סכום — סקירה ידנית</p>
                      <p className="text-xs text-blue-600 mb-2">טווח רגיל: <strong>{anomaly.dominant}</strong></p>
                      <div className="flex flex-wrap gap-1">
                        {anomaly.outlierRows.map(r => (
                          <span key={r.id} className="bg-white border border-blue-200 rounded px-2 py-0.5 text-xs text-blue-800">
                            ₪{r.amount.toLocaleString()} · {r.date}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ) : null}
            </div>

            {/* Footer */}
            {isScanned && !isDone && anomaly && (
              <div className="flex flex-col gap-2 p-4 border-t">
                <label className="flex items-center gap-2 text-sm text-amber-700 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={wizardMarkReview}
                    onChange={e => setWizardMarkReview(e.target.checked)}
                    className="rounded"
                  />
                  🔖 סמן לבחינה בהמשך
                </label>
                <div className="flex items-center justify-between">
                  <button onClick={() => skipCurrent(wizardMarkReview)} disabled={wizardFixing}
                    className={`px-4 py-2 border rounded-lg text-sm disabled:opacity-50 transition-colors ${wizardMarkReview ? 'bg-amber-50 border-amber-300 text-amber-700 hover:bg-amber-100' : 'hover:bg-gray-50 text-gray-600'}`}>
                    {wizardMarkReview ? '🔖 סמן ודלג ←' : 'דלג ←'}
                  </button>
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-gray-400">{wizardStep + 1} / {wizardAnomalies.length}</span>
                    {!anomaly.isAmount ? (
                      <button onClick={() => applyWizardFix(fixValue)} disabled={wizardFixing || !fixValue}
                        className="px-5 py-2 bg-violet-600 text-white rounded-lg hover:bg-violet-700 text-sm font-medium disabled:opacity-60">
                        {wizardFixing ? 'מתקן…' : `תקן ${anomaly.outlierRows.length} שורות ✅`}
                      </button>
                    ) : (
                      <button onClick={() => skipCurrent(wizardMarkReview)}
                        className="px-5 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium">
                        הבנתי, הבא ←
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )}
            {isDone && (
              <div className="flex justify-center p-4 border-t">
                <button onClick={closeWizard} className="px-5 py-2 border rounded-lg hover:bg-gray-50 text-sm">סגור</button>
              </div>
            )}
          </div>
        </div>
        );
      })()}

      {/* ── Child Assignment Wizard ── */}
      {childWizOpen && (() => {
        const selRows   = transactions.filter((t) => selectedIds.has(t.id));
        const nonKids   = selRows.filter((t) => t.category !== 'ילדים').length;
        const breakdown: Record<string, number> = {};
        for (const t of selRows) {
          const k = String(t.child ?? NO_CHILD);
          breakdown[k] = (breakdown[k] ?? 0) + 1;
        }
        // canonical order first, then any legacy value still stored on a row
        const sortedBreakdown = [
          ...CHILD_COL_OPTIONS,
          ...Object.keys(breakdown).filter((k) => !CHILD_COL_OPTIONS.includes(k)),
        ].filter((k) => breakdown[k]);
        const totalTargets = selRows.length + childWizRuleIds.size;
        const allRulesPicked = recurringRules.length > 0 && childWizRuleIds.size === recurringRules.length;

        return (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col" dir="rtl">

            <div className="flex items-center justify-between p-4 border-b">
              <div>
                <h2 className="text-lg font-bold">🧒 שיוך לילדים</h2>
                <p className="text-xs text-gray-500 mt-0.5">שיוך רוחבי לשורות המסומנות ולכללים קבועים</p>
              </div>
              <button onClick={closeChildWizard} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">×</button>
            </div>

            <div className="flex-1 overflow-auto p-5 space-y-5">

              {/* ── Section 1: selected rows ── */}
              <div>
                <h3 className="text-sm font-bold text-gray-700 mb-2">1 · שורות מסומנות בטבלה</h3>
                {selRows.length === 0 ? (
                  <div className="bg-gray-50 border rounded-lg p-3 text-sm text-gray-500">
                    לא סומנו שורות. סגור, סמן שורות ב-☑ בתחילת השורה, ופתח שוב — או שייך כללים קבועים בלבד למטה.
                  </div>
                ) : (
                  <div className="bg-cyan-50 border border-cyan-200 rounded-lg p-3">
                    <p className="text-sm font-medium text-cyan-800 mb-2">{selRows.length} שורות נבחרו · שיוך נוכחי:</p>
                    <div className="flex flex-wrap gap-1.5">
                      {sortedBreakdown.map((k) => (
                        <span key={k || 'none'} className="bg-white border border-cyan-200 rounded-full px-2.5 py-0.5 text-sm text-cyan-700">
                          {displayLabel('child', k)} <span className="text-cyan-400">×{breakdown[k]}</span>
                        </span>
                      ))}
                    </div>
                    {nonKids > 0 && (
                      <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1.5 mt-2">
                        ℹ️ {nonKids} מהשורות אינן בקטגוריית "ילדים". השיוך יישמר עליהן, אך פילוח הילדים בדוחות מציג כרגע רק את קטגוריית "ילדים".
                      </p>
                    )}
                  </div>
                )}
              </div>

              {/* ── Section 2: recurring rules ── */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-sm font-bold text-gray-700">
                    2 · כללים קבועים <span className="font-normal text-gray-400">(לא מופיעים בטבלה)</span>
                  </h3>
                  {recurringRules.length > 0 && (
                    <button
                      onClick={() => setChildWizRuleIds(allRulesPicked ? new Set() : new Set(recurringRules.map((r) => r.id)))}
                      className="text-xs text-cyan-600 hover:underline"
                    >
                      {allRulesPicked ? 'נקה הכל' : 'בחר הכל'}
                    </button>
                  )}
                </div>
                {recurringRules.length === 0 ? (
                  <div className="bg-gray-50 border rounded-lg p-3 text-sm text-gray-500">אין כללים קבועים מוגדרים.</div>
                ) : (
                  <div className="border rounded-lg max-h-52 overflow-y-auto divide-y">
                    {recurringRules.map((r) => (
                      <label key={r.id} className="flex items-center gap-2 px-3 py-2 text-sm cursor-pointer hover:bg-gray-50">
                        <input
                          type="checkbox"
                          checked={childWizRuleIds.has(r.id)}
                          onChange={(e) => setChildWizRuleIds((prev) => {
                            const n = new Set(prev);
                            e.target.checked ? n.add(r.id) : n.delete(r.id);
                            return n;
                          })}
                        />
                        <span className="font-medium text-gray-800 truncate">{r.sub_category || r.category}</span>
                        <span className="text-gray-400 text-xs shrink-0">{r.category} · ₪{r.amount.toLocaleString()} · {r.start_month}→{r.end_month}</span>
                        <span className="mr-auto text-xs shrink-0 px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">
                          {displayLabel('child', String(r.child ?? NO_CHILD))}
                        </span>
                      </label>
                    ))}
                  </div>
                )}
                {childWizRuleIds.size > 0 && (
                  <p className="text-xs text-gray-500 mt-1.5">
                    שינוי כלל קבוע חל על כל החודשים שהוא מייצר.
                  </p>
                )}
              </div>

              {/* ── Section 3: target ── */}
              <div>
                <h3 className="text-sm font-bold text-gray-700 mb-2">3 · שייך ל:</h3>
                <div className="flex flex-wrap gap-2">
                  {CHILD_COL_OPTIONS.map((opt) => (
                    <button
                      key={opt || 'none'}
                      onClick={() => setChildWizTarget(opt)}
                      className={`px-4 py-2 rounded-lg text-sm font-medium border transition-all ${
                        childWizTarget === opt
                          ? 'bg-cyan-500 text-white border-cyan-500'
                          : 'bg-white text-gray-700 border-gray-300 hover:bg-cyan-50'
                      }`}
                    >
                      {displayLabel('child', opt)}
                    </button>
                  ))}
                </div>
                {childWizTarget === NO_CHILD && (
                  <p className="text-xs text-orange-700 bg-orange-50 border border-orange-200 rounded px-2 py-1.5 mt-2">
                    ⚠️ "ללא שיוך" ימחק את השיוך הקיים מכל הפריטים שנבחרו.
                  </p>
                )}
              </div>

              {childWizStatus && (
                <p className={`text-sm font-medium rounded-lg px-3 py-2 text-center ${
                  childWizStatus.startsWith('✅') ? 'text-green-700 bg-green-50'
                  : childWizStatus.startsWith('❌') ? 'text-red-700 bg-red-50'
                  : 'text-cyan-700 bg-cyan-50'
                }`}>{childWizStatus}</p>
              )}
            </div>

            <div className="flex gap-3 justify-end p-4 border-t">
              <button onClick={closeChildWizard} disabled={childWizLoading} className="px-4 py-2 border rounded-lg hover:bg-gray-50 text-sm disabled:opacity-60">סגור</button>
              <button
                onClick={runChildAssign}
                disabled={childWizLoading || childWizTarget === null || totalTargets === 0}
                className="px-5 py-2 bg-cyan-600 text-white rounded-lg hover:bg-cyan-700 text-sm font-medium disabled:opacity-40"
              >
                {childWizLoading ? 'מעדכן…' : `החל על ${totalTargets} פריטים →`}
              </button>
            </div>
          </div>
        </div>
        );
      })()}

      {/* ── Bulk Category Change Dialog ── */}
      {bulkCatOpen && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl p-6 w-full max-w-sm text-center" dir="rtl">
            <div className="text-3xl mb-3">🏷</div>
            <h2 className="text-lg font-bold mb-1">שנה קטגוריה לנבחרים</h2>
            <p className="text-gray-500 text-sm mb-4">{selectedIds.size} שורות נבחרו</p>
            <select
              value={bulkCatTarget}
              onChange={(e) => setBulkCatTarget(e.target.value)}
              className="w-full border rounded-lg px-3 py-2 mb-4 text-right text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-indigo-400"
            >
              <option value="">בחר קטגוריה…</option>
              <optgroup label="הוצאות">
                {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </optgroup>
              <optgroup label="הכנסות">
                {INCOME_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </optgroup>
            </select>
            <div className="flex gap-3 justify-center">
              <button onClick={() => setBulkCatOpen(false)} className="px-5 py-2 border rounded-lg hover:bg-gray-50 text-sm">ביטול</button>
              <button
                onClick={runBulkCategoryChange}
                disabled={!bulkCatTarget}
                className="px-5 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 text-sm font-medium disabled:opacity-40"
              >
                החל על {selectedIds.size} שורות →
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Paste Dialog ── */}
      {pasteOpen && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-5xl max-h-[90vh] flex flex-col" dir="rtl">

            {/* Dialog Header */}
            <div className="flex items-center justify-between p-4 border-b">
              <h2 className="text-lg font-bold">📋 הדבק נתונים מאקסל / Google Sheets</h2>
              <button onClick={closePasteDialog} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">×</button>
            </div>

            {/* Dialog Body */}
            <div className="flex-1 overflow-auto p-4">
              {pasteRows.length === 0 ? (
                <>
                  <p className="text-gray-600 mb-2">
                    סדר עמודות נדרש (כמו באקסל — מופרד בטאב):
                  </p>
                  <div className="bg-gray-100 rounded p-3 font-mono text-sm mb-4 overflow-x-auto whitespace-nowrap">
                    {pasteColLabels.join('  |  ')}
                  </div>
                  <p className="text-gray-500 text-xs mb-1">
                    דוגמה לשורה:
                  </p>
                  <div className="bg-gray-50 border rounded p-2 font-mono text-xs mb-4 overflow-x-auto whitespace-nowrap text-gray-600">
                    01/03/2026{'  '}expense{'  '}סופר{'  '}רמי לוי{'  '}450{'  '}Ortal{'  '}אשראי{'  '}משתנה{'  '}paid
                  </div>
                  <p className="text-gray-600 mb-2">הדבק כאן (Ctrl+V):</p>
                  <textarea
                    className="w-full h-52 border rounded p-3 font-mono text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-300"
                    placeholder="הדבק כאן נתונים מאקסל..."
                    value={pasteText}
                    onPaste={(e) => {
                      e.stopPropagation();
                      const text = e.clipboardData.getData('text/plain');
                      handlePasteTextChange(text);
                      e.preventDefault();
                    }}
                    onChange={(e) => handlePasteTextChange(e.target.value)}
                  />
                  {pasteText && pasteRows.length === 0 && (
                    <p className="text-red-500 text-sm mt-2">לא זוהו שורות תקינות. ודא שיש עמודת סכום (מספר גדול מ-0).</p>
                  )}
                </>
              ) : (
                <>
                  <p className="text-green-700 font-medium mb-3">✓ זוהו {pasteRows.length} שורות:</p>
                  <div className="overflow-auto max-h-96">
                    <table className="w-full text-sm border-collapse">
                      <thead className="bg-gray-100 sticky top-0">
                        <tr>
                          {pasteColLabels.map((label) => (
                            <th key={label} className="px-2 py-1 border text-right font-semibold">{label}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {pasteRows.map((row, i) => (
                          <tr key={i} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                            {PASTE_COL_ORDER.map((k) => {
                              const v = row[k as keyof Transaction] ?? '';
                              const display = k === 'amount' ? `₪${Number(v).toLocaleString()}` : String(v);
                              return <td key={k} className="px-2 py-1 border">{display}</td>;
                            })}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </div>

            {/* Dialog Footer */}
            <div className="flex gap-3 justify-end p-4 border-t">
              <button onClick={closePasteDialog} className="px-4 py-2 border rounded hover:bg-gray-50 text-sm">ביטול</button>
              {pasteRows.length > 0 && (
                <button onClick={() => { setPasteRows([]); setPasteText(''); }} className="px-4 py-2 border rounded hover:bg-gray-50 text-sm">
                  חזור לעריכה
                </button>
              )}
              {pasteRows.length > 0 && (
                <button onClick={importPasteRows} className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 text-sm font-medium">
                  יבא {pasteRows.length} שורות →
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
