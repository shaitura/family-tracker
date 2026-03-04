import { useState, useRef, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import * as XLSX from 'xlsx';
import { base44 } from '@/lib/base44Client';
import { Transaction, CATEGORIES, PAYMENT_METHODS, Category, PaymentMethod } from '@/types';

// Display labels for enum values stored in English
const OPTION_LABELS: Record<string, Record<string, string>> = {
  type:   { expense: 'הוצאה',  income: 'הכנסה' },
  payer:  { Shi: 'שי', Ortal: 'אורטל', Joint: 'משותפת' },
  status: { paid: 'שולם', pending: 'ממתין', future: 'עתידי' },
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
] as const;

// Paste column order — matches the Excel column order (right→left = A→last)
const PASTE_COL_ORDER = [
  'date', 'expense_class', 'sub_category', 'payer', 'amount',
  'payment_method', 'category', 'notes', 'type', 'status',
];

type EditingCell = { id: string; field: string } | null;

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

function mapCategory(raw: string): Category {
  const s = String(raw ?? '').trim();
  if (!s) return 'שונות';
  if (CATEGORIES.includes(s as Category)) return s as Category;
  // partial match: "דיור - שכירות" → "דיור"
  for (const cat of CATEGORIES) {
    if (s.startsWith(cat) || s.includes(cat)) return cat;
  }
  return 'שונות';
}

function parseAnnualExcel(workbook: XLSX.WorkBook, year: number): MonthPreview[] {
  const results: MonthPreview[] = [];

  for (let month = 1; month <= 12; month++) {
    const ws = workbook.Sheets[String(month)];
    if (!ws) continue;

    const date = `${year}-${String(month).padStart(2, '0')}-01`;
    const expenses: Partial<Transaction>[] = [];
    const incomes:  Partial<Transaction>[] = [];

    for (let row = 9; row <= 100; row++) {
      // ── Expenses: columns A–H ──────────────────────────────────────────
      const expAmt = parseAmount(ws[`D${row}`]?.v);
      if (expAmt > 0) {
        const cls = String(ws[`A${row}`]?.v ?? '').trim();
        const g   = String(ws[`G${row}`]?.v ?? '').trim();
        const h   = String(ws[`H${row}`]?.v ?? '').trim();
        expenses.push({
          date,
          type:            'expense',
          expense_class:   cls === 'קבועה' ? 'קבועה' : 'משתנה',
          sub_category:    String(ws[`B${row}`]?.v ?? '').trim() || undefined,
          payer:           mapPayer(String(ws[`C${row}`]?.v ?? '')),
          amount:          expAmt,
          payment_method:  mapPaymentMethod(ws[`E${row}`]?.v),
          category:        mapCategory(String(ws[`F${row}`]?.v ?? '')),
          notes:           [g, h].filter(Boolean).join(' ') || undefined,
          status:          'paid',
        });
      }

      // ── Incomes: columns L–R ───────────────────────────────────────────
      const incAmt = parseAmount(ws[`O${row}`]?.v);
      if (incAmt > 0) {
        const cls = String(ws[`L${row}`]?.v ?? '').trim();
        const q   = String(ws[`Q${row}`]?.v ?? '').trim();
        const r   = String(ws[`R${row}`]?.v ?? '').trim();
        incomes.push({
          date,
          type:            'income',
          expense_class:   cls === 'קבועה' ? 'קבועה' : 'משתנה',
          sub_category:    String(ws[`M${row}`]?.v ?? '').trim() || undefined,
          payer:           mapPayer(String(ws[`N${row}`]?.v ?? '')),
          amount:          incAmt,
          payment_method:  mapPaymentMethod(ws[`P${row}`]?.v),
          category:        'שונות',
          notes:           [q, r].filter(Boolean).join(' ') || undefined,
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

export default function Admin() {
  const queryClient = useQueryClient();
  const [editingCell, setEditingCell] = useState<EditingCell>(null);
  const [sortField, setSortField] = useState<string>('date');
  const [sortDir, setSortDir]   = useState<'asc' | 'desc'>('desc');
  const [search, setSearch]     = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [pasteOpen, setPasteOpen]         = useState(false);
  const [confirmClear, setConfirmClear]   = useState(false);
  const [pasteRows, setPasteRows]         = useState<Partial<Transaction>[]>([]);
  const [pasteText, setPasteText]         = useState('');
  const [annualOpen, setAnnualOpen]             = useState(false);
  const [annualYear, setAnnualYear]             = useState(2025);
  const [annualPreview, setAnnualPreview]       = useState<MonthPreview[]>([]);
  const [annualLoading, setAnnualLoading]       = useState(false);
  const [annualSheetNames, setAnnualSheetNames] = useState<string[]>([]);
  const [annualDiag, setAnnualDiag]             = useState<string[][]>([]);
  const containerRef = useRef<HTMLDivElement>(null);

  const { data: transactions = [], isLoading } = useQuery({
    queryKey: ['transactions'],
    queryFn: () => base44.entities.Transaction.filter(),
  });

  // ── filtered + sorted rows ──────────────────────────────────────────────
  const rows = [...transactions]
    .filter((t) => {
      if (!search) return true;
      const s = search.toLowerCase();
      return (
        t.notes?.toLowerCase().includes(s) ||
        t.category.includes(s) ||
        t.amount.toString().includes(s) ||
        t.date.includes(s)
      );
    })
    .sort((a, b) => {
      const av = String(a[sortField as keyof Transaction] ?? '');
      const bv = String(b[sortField as keyof Transaction] ?? '');
      const cmp = av.localeCompare(bv, 'he');
      return sortDir === 'asc' ? cmp : -cmp;
    });

  // ── CRUD helpers ────────────────────────────────────────────────────────
  async function updateCell(id: string, field: string, value: string | number) {
    await base44.entities.Transaction.update(id, { [field]: value } as Partial<Transaction>);
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
    for (const id of selectedIds) await base44.entities.Transaction.delete(id);
    setSelectedIds(new Set());
    queryClient.invalidateQueries({ queryKey: ['transactions'] });
  }

  function clearAllData() {
    ['ft_transaction', 'ft_budget', 'ft_initialized'].forEach((k) => localStorage.removeItem(k));
    queryClient.invalidateQueries({ queryKey: ['transactions'] });
    setSelectedIds(new Set());
    setConfirmClear(false);
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

      // Diagnostic: show first 15 rows × 18 cols of first sheet
      const ws1 = workbook.Sheets[workbook.SheetNames[0]];
      if (ws1) {
        const cols = 'ABCDEFGHIJKLMNOPQR'.split('');
        const rows: string[][] = [['שורה', ...cols]];
        for (let r = 1; r <= 20; r++) {
          const rowCells = cols.map(c => {
            const cell = ws1[`${c}${r}`];
            return cell?.v != null ? String(cell.v).substring(0, 15) : '';
          });
          if (rowCells.some(v => v !== '')) rows.push([String(r), ...rowCells]);
        }
        setAnnualDiag(rows);
        // Also log to console for debugging
        console.log('Sheet names:', workbook.SheetNames);
        console.log('First sheet rows (1-20):', rows);
      }
    };
    reader.readAsArrayBuffer(file);
    e.target.value = '';
  }

  async function importAnnualData() {
    setAnnualLoading(true);
    for (const m of annualPreview) {
      for (const row of [...m.expenses, ...m.incomes]) {
        await base44.entities.Transaction.create(row as Omit<Transaction, 'id'>);
      }
    }
    queryClient.invalidateQueries({ queryKey: ['transactions'] });
    setAnnualLoading(false);
    setAnnualOpen(false);
    setAnnualPreview([]);
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
        return (
          <div data-cell className="relative h-full" style={{ zIndex: 200 }}>
            {/* Current value bar */}
            <div className="px-2 py-1 text-sm bg-yellow-50 h-full flex items-center font-medium cursor-default">
              {displayLabel(col.key, String(value))}
            </div>
            {/* Options list */}
            <div className="absolute top-full right-0 bg-white border border-gray-300 rounded shadow-xl"
                 style={{ minWidth: '130px', zIndex: 9999 }}>
              {(col.options as readonly string[]).map((opt) => (
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
          placeholder="חיפוש..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="border rounded px-3 py-1.5 text-sm w-44 mr-2"
        />

        <div className="flex gap-2 mr-auto flex-wrap">
          <button onClick={addRow}           className="bg-green-500 text-white px-3 py-1.5 rounded text-sm hover:bg-green-600">+ שורה חדשה</button>
          <button onClick={openPasteDialog}  className="bg-blue-500  text-white px-3 py-1.5 rounded text-sm hover:bg-blue-600">📋 הדבק מאקסל</button>
          <button onClick={() => { setAnnualPreview([]); setAnnualSheetNames([]); setAnnualDiag([]); setAnnualOpen(true); }} className="bg-purple-600 text-white px-3 py-1.5 rounded text-sm hover:bg-purple-700">📂 יבא קובץ שנתי</button>
          {selectedIds.size > 0 && (
            <button onClick={deleteSelected} className="bg-red-500   text-white px-3 py-1.5 rounded text-sm hover:bg-red-600">
              🗑 מחק נבחרים ({selectedIds.size})
            </button>
          )}
          <button onClick={exportCSV}        className="bg-gray-200  text-gray-700 px-3 py-1.5 rounded text-sm hover:bg-gray-300">⬇ ייצא CSV</button>
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
                  onChange={(e) =>
                    setSelectedIds(e.target.checked ? new Set(rows.map((r) => r.id)) : new Set())
                  }
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
                </th>
              ))}
              <th className="w-14 px-2 py-2 border-b bg-gray-100" />
            </tr>
          </thead>

          <tbody>
            {rows.map((row, idx) => (
              <tr
                key={row.id}
                style={{ height: 36 }}
                className={[
                  'border-b',
                  selectedIds.has(row.id)    ? 'bg-blue-50'  :
                  row.type === 'income'      ? 'bg-green-50' :
                  idx % 2 === 0              ? 'bg-white'    : 'bg-gray-50',
                  'hover:brightness-95',
                ].join(' ')}
              >
                <td className="px-2 text-center border-l">
                  <input
                    type="checkbox"
                    checked={selectedIds.has(row.id)}
                    onChange={(e) =>
                      setSelectedIds((prev) => {
                        const n = new Set(prev);
                        e.target.checked ? n.add(row.id) : n.delete(row.id);
                        return n;
                      })
                    }
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
                    {[2023,2024,2025,2026].map(y => <option key={y} value={y}>{y}</option>)}
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
                    🔍 תוכן הלשונית "{annualSheetNames[0]}" (שורות עם נתונים):
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

            <div className="flex gap-3 justify-end p-4 border-t">
              <button onClick={() => { setAnnualOpen(false); setAnnualPreview([]); setAnnualSheetNames([]); }} className="px-4 py-2 border rounded hover:bg-gray-50 text-sm">ביטול</button>
              {annualPreview.length > 0 && (
                <button
                  onClick={importAnnualData}
                  disabled={annualLoading}
                  className="px-5 py-2 bg-purple-600 text-white rounded hover:bg-purple-700 text-sm font-medium disabled:opacity-60"
                >
                  {annualLoading ? 'מייבא...' : `יבא ${annualPreview.reduce((s,m)=>s+m.expenses.length+m.incomes.length,0)} רשומות →`}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Confirm Clear Dialog ── */}
      {confirmClear && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl p-6 w-full max-w-sm text-center" dir="rtl">
            <div className="text-4xl mb-3">⚠️</div>
            <h2 className="text-lg font-bold mb-2">אפס את כל הנתונים?</h2>
            <p className="text-gray-500 text-sm mb-6">
              פעולה זו תמחק את כל ההכנסות וההוצאות לצמיתות.<br />לא ניתן לשחזר אותן.
            </p>
            <div className="flex gap-3 justify-center">
              <button onClick={() => setConfirmClear(false)} className="px-5 py-2 border rounded-lg hover:bg-gray-50 text-sm">ביטול</button>
              <button onClick={clearAllData} className="px-5 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 text-sm font-medium">כן, מחק הכל</button>
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
