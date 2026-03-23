#!/usr/bin/env node
/**
 * Monthly Family Financial Report
 * Runs on the 1st of each month via GitHub Actions.
 * Reads Firestore data, generates a PDF, and emails it via Resend.
 *
 * Required GitHub Secrets:
 *   FIREBASE_SERVICE_ACCOUNT  — Base64-encoded Firebase service account JSON
 *   RESEND_API_KEY            — API key from resend.com
 *   RESEND_FROM_EMAIL         — Verified "from" address (e.g. report@yourdomain.com)
 */

import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore }        from 'firebase-admin/firestore';
import puppeteer               from 'puppeteer';
import { Resend }              from 'resend';

// ─── Firebase Admin ───────────────────────────────────────────────────────────
const saBase64 = process.env.FIREBASE_SERVICE_ACCOUNT;
if (!saBase64) { console.error('❌ Missing FIREBASE_SERVICE_ACCOUNT'); process.exit(1); }
const serviceAccount = JSON.parse(Buffer.from(saBase64, 'base64').toString('utf8'));
initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();

// ─── Check if feature is enabled ─────────────────────────────────────────────
const settingsSnap = await db.doc('settings/notifications').get();
const notifyMonthly = settingsSnap.data()?.notifyMonthly ?? false;
if (!notifyMonthly) {
  console.log('ℹ️  סיכום חודשי כבוי — לא נשלח דו"ח.');
  process.exit(0);
}

// ─── Determine previous month ─────────────────────────────────────────────────
const now       = new Date();
const prevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
const year      = prevMonth.getFullYear();
const month     = String(prevMonth.getMonth() + 1).padStart(2, '0');
const prefix    = `${year}-${month}`;
const monthLabel = prevMonth.toLocaleString('he-IL', { month: 'long', year: 'numeric' });

console.log(`📅 מייצר דו"ח לחודש ${monthLabel} (${prefix})…`);

// ─── Fetch transactions ────────────────────────────────────────────────────────
const txSnap = await db.collection('transactions').get();
const allTx  = txSnap.docs.map(d => ({ id: d.id, ...d.data() }));
const monthTx = allTx.filter(t => t.date?.startsWith(prefix));
console.log(`   נמצאו ${monthTx.length} עסקאות`);

// ─── Aggregate ────────────────────────────────────────────────────────────────
const expenses     = monthTx.filter(t => t.type === 'expense');
const income       = monthTx.filter(t => t.type === 'income');
const totalExpense = expenses.reduce((s, t) => s + (t.amount || 0), 0);
const totalIncome  = income.reduce((s, t)  => s + (t.amount || 0), 0);
const balance      = totalIncome - totalExpense;

const byCat = {};
expenses.forEach(t => {
  if (t.category) byCat[t.category] = (byCat[t.category] || 0) + (t.amount || 0);
});
const catData = Object.entries(byCat).sort((a, b) => b[1] - a[1]);

const fixedTotal = expenses.filter(t => t.expense_class === 'קבועה').reduce((s, t) => s + (t.amount || 0), 0);
const varTotal   = expenses.filter(t => t.expense_class === 'משתנה').reduce((s, t) => s + (t.amount || 0), 0);

const fmt = n => '₪' + Math.round(n).toLocaleString('he-IL');
const pct = (part, total) => total > 0 ? Math.round(part / total * 100) : 0;

// ─── Build HTML report ────────────────────────────────────────────────────────
const balanceColor = balance >= 0 ? '#10b981' : '#f43f5e';

const catRows = catData.map(([cat, amount]) => `
  <div class="bar-wrap">
    <div class="bar-label">
      <span>${cat}</span>
      <span>${fmt(amount)} <span class="pct">(${pct(amount, totalExpense)}%)</span></span>
    </div>
    <div class="bar-track">
      <div class="bar-fill" style="width:${pct(amount, totalExpense)}%"></div>
    </div>
  </div>`).join('');

const txRows = [...monthTx]
  .sort((a, b) => (a.date || '').localeCompare(b.date || ''))
  .map(t => {
    const isExp = t.type === 'expense';
    const color = isExp ? '#f43f5e' : '#10b981';
    return `<tr>
      <td>${t.date || '—'}</td>
      <td>${t.sub_category || '—'}</td>
      <td>${t.category || '—'}</td>
      <td style="color:${color}">${isExp ? 'הוצאה' : 'הכנסה'}</td>
      <td style="color:${color};font-weight:600">${isExp ? '-' : '+'}${fmt(t.amount || 0)}</td>
    </tr>`;
  }).join('');

const html = `<!DOCTYPE html>
<html lang="he" dir="rtl">
<head>
  <meta charset="UTF-8">
  <link href="https://fonts.googleapis.com/css2?family=Heebo:wght@300;400;600;700;800&display=swap" rel="stylesheet">
  <style>
    *{margin:0;padding:0;box-sizing:border-box}
    body{font-family:'Heebo',Arial,sans-serif;background:#0f1117;color:#e5e7eb;padding:36px;direction:rtl}
    h1{font-size:30px;font-weight:800;background:linear-gradient(135deg,#22d3ee,#a855f7);-webkit-background-clip:text;-webkit-text-fill-color:transparent;margin-bottom:4px}
    .sub{color:#6b7280;font-size:13px;margin-bottom:28px}
    .cards{display:grid;grid-template-columns:repeat(3,1fr);gap:14px;margin-bottom:28px}
    .card{background:#1a1d27;border-radius:12px;padding:18px;border:1px solid #2d3148}
    .card-label{font-size:11px;color:#6b7280;margin-bottom:6px}
    .card-value{font-size:22px;font-weight:700}
    .sec-title{font-size:15px;font-weight:600;color:#d1d5db;margin-bottom:12px;padding-bottom:6px;border-bottom:1px solid #2d3148}
    .fv{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:28px}
    .fv-card{background:#1a1d27;border-radius:12px;padding:16px;border:1px solid #2d3148}
    .fv-card .lbl{font-size:11px;color:#6b7280;margin-bottom:4px}
    .fv-card .val{font-size:20px;font-weight:700;color:#e5e7eb}
    .fv-card .p{font-size:11px;color:#6b7280;margin-top:2px}
    .bar-wrap{background:#1a1d27;border-radius:10px;padding:14px;margin-bottom:10px}
    .bar-label{display:flex;justify-content:space-between;font-size:13px;margin-bottom:7px}
    .pct{color:#6b7280;font-size:11px}
    .bar-track{background:#2d3148;border-radius:4px;height:7px;overflow:hidden}
    .bar-fill{height:7px;border-radius:4px;background:linear-gradient(90deg,#22d3ee,#a855f7)}
    .cats{margin-bottom:28px}
    table{width:100%;border-collapse:collapse;margin-bottom:28px;font-size:13px}
    th{background:#1a1d27;color:#6b7280;font-weight:500;font-size:11px;padding:9px 14px;text-align:right;border-bottom:1px solid #2d3148}
    td{padding:9px 14px;border-bottom:1px solid #1e2130}
    tr:nth-child(even) td{background:#14161f}
    .footer{text-align:center;color:#4b5563;font-size:11px;margin-top:20px}
  </style>
</head>
<body>
  <h1>סיכום חודשי — ${monthLabel}</h1>
  <p class="sub">נוצר ב-${new Date().toLocaleDateString('he-IL')} · Family Tracker</p>

  <div class="cards">
    <div class="card">
      <div class="card-label">סה"כ הכנסות</div>
      <div class="card-value" style="color:#10b981">${fmt(totalIncome)}</div>
    </div>
    <div class="card">
      <div class="card-label">סה"כ הוצאות</div>
      <div class="card-value" style="color:#f43f5e">${fmt(totalExpense)}</div>
    </div>
    <div class="card">
      <div class="card-label">מאזן</div>
      <div class="card-value" style="color:${balanceColor}">${balance >= 0 ? '+' : ''}${fmt(balance)}</div>
    </div>
  </div>

  <div class="sec-title">הוצאות קבועות vs משתנות</div>
  <div class="fv">
    <div class="fv-card">
      <div class="lbl">קבועות</div>
      <div class="val">${fmt(fixedTotal)}</div>
      <div class="p">${pct(fixedTotal, totalExpense)}% מסה"כ הוצאות</div>
    </div>
    <div class="fv-card">
      <div class="lbl">משתנות</div>
      <div class="val">${fmt(varTotal)}</div>
      <div class="p">${pct(varTotal, totalExpense)}% מסה"כ הוצאות</div>
    </div>
  </div>

  <div class="sec-title">פירוט לפי קטגוריה</div>
  <div class="cats">${catRows}</div>

  <div class="sec-title">כל העסקאות (${monthTx.length})</div>
  <table>
    <thead><tr><th>תאריך</th><th>תיאור</th><th>קטגוריה</th><th>סוג</th><th>סכום</th></tr></thead>
    <tbody>${txRows}</tbody>
  </table>

  <div class="footer">דו"ח זה נשלח אוטומטית ב-1 לחודש · Family Tracker</div>
</body>
</html>`;

// ─── Generate PDF via Puppeteer ───────────────────────────────────────────────
console.log('📄 מייצר PDF…');
const browser = await puppeteer.launch({
  args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
});
const page = await browser.newPage();
await page.setContent(html, { waitUntil: 'networkidle0' });
const pdfBuffer = await page.pdf({ format: 'A4', printBackground: true, margin: { top: '10mm', bottom: '10mm', left: '10mm', right: '10mm' } });
await browser.close();
console.log(`   PDF נוצר (${Math.round(pdfBuffer.length / 1024)} KB)`);

// ─── Send email via Resend ────────────────────────────────────────────────────
const resendKey  = process.env.RESEND_API_KEY;
const fromEmail  = process.env.RESEND_FROM_EMAIL || 'onboarding@resend.dev';
if (!resendKey) { console.error('❌ Missing RESEND_API_KEY'); process.exit(1); }

const resend = new Resend(resendKey);
const { error } = await resend.emails.send({
  from:    `Family Tracker <${fromEmail}>`,
  to:      ['shaitura@gmail.com', 'ortalas@gmail.com'],
  subject: `סיכום חודשי — ${monthLabel}`,
  html: `<div dir="rtl" style="font-family:Arial,sans-serif;padding:20px;color:#111">
    <h2 style="color:#6d28d9">סיכום חודש ${monthLabel}</h2>
    <p>שלום! מצורף הדו"ח החודשי של משפחת שי ואורטל.</p>
    <ul style="margin:16px 0;line-height:2">
      <li>💰 הכנסות: <strong style="color:#059669">${fmt(totalIncome)}</strong></li>
      <li>💸 הוצאות: <strong style="color:#dc2626">${fmt(totalExpense)}</strong></li>
      <li>${balance >= 0 ? '✅' : '⚠️'} מאזן: <strong style="color:${balanceColor}">${balance >= 0 ? '+' : ''}${fmt(balance)}</strong></li>
    </ul>
    <p style="color:#6b7280;font-size:12px">דו"ח זה נשלח אוטומטית ב-1 לכל חודש.</p>
  </div>`,
  attachments: [{
    filename: `family-tracker-${prefix}.pdf`,
    content:  Buffer.from(pdfBuffer).toString('base64'),
  }],
});

if (error) {
  console.error('❌ שגיאה בשליחת מייל:', error);
  process.exit(1);
}

console.log(`✅ דו"ח ${monthLabel} נשלח בהצלחה!`);
