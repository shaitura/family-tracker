import { useState, useRef, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/lib/base44Client';
import { Transaction, CATEGORIES, PAYMENT_METHODS } from '@/types';

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
  { key: 'date',           label: 'תאריך',        type: 'date',   width: 120 },
  { key: 'type',           label: 'סוג',           type: 'select', options: ['expense', 'income'], width: 90 },
  { key: 'category',       label: 'קטגוריה',       type: 'select', options: [...CATEGORIES],       width: 110 },
  { key: 'sub_category',   label: 'תת-קטגוריה',    type: 'text',   width: 120 },
  { key: 'amount',         label: 'סכום',          type: 'number', width: 90 },
  { key: 'payer',          label: 'מי שילם',       type: 'select', options: ['Shi', 'Ortal', 'Joint'], width: 90 },
  { key: 'payment_method', label: 'אמצעי תשלום',   type: 'select', options: PAYMENT_METHODS,        width: 120 },
  { key: 'expense_class',  label: 'סיווג',         type: 'select', options: ['קבועה', 'משתנה'],     width: 80 },
  { key: 'status',         label: 'סטטוס',         type: 'select', options: ['paid', 'pending', 'future'], width: 90 },
  { key: 'notes',          label: 'הערות',         type: 'text',   width: 200 },
] as const;

const PASTE_COL_ORDER = [
  'date', 'type', 'category', 'sub_category', 'amount',
  'payer', 'payment_method', 'expense_class', 'status', 'notes',
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

export default function Admin() {
  const queryClient = useQueryClient();
  const [editingCell, setEditingCell] = useState<EditingCell>(null);
  const [sortField, setSortField] = useState<string>('date');
  const [sortDir, setSortDir]   = useState<'asc' | 'desc'>('desc');
  const [search, setSearch]     = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [pasteOpen, setPasteOpen]         = useState(false);
  const [confirmClear, setConfirmClear]   = useState(false);
  const [pasteRows, setPasteRows]     = useState<Partial<Transaction>[]>([]);
  const [pasteText, setPasteText]     = useState('');
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
