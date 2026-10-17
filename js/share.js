// Arma la imagen o el PDF del resumen y lo comparte con el menú del iPad (WhatsApp).

import { html, useMemo } from './vendor/preact-htm.js';
import { COLORS, calc, holidayMinutes, priceAt, shiftMinutes, PAY_TYPES } from './model.js';
import { todayISO } from './dates.js';
import { DIAS_CORTOS, dm, dmy, hours, initial, money, monthName, monthTitle } from './format.js';
import { getState, openDialog, toast } from './store.js';
import { Dialog, Icon } from './ui/common.js';

const FONT = '"Atkinson Hyperlegible Next", Verdana, sans-serif';
const SCALE = 2;
const INK = '#17211F';
const MUTED = '#55615D';
const LINE = '#D5DCD8';
const TEAL = '#0B6B5E';
const TEAL_DARK = '#084F46';
const TINT = '#DDEFEA';
const GROUND = '#EEF2EF';
const HOL = '#FFEFB0';
const HOL_INK = '#5E4200';

export async function shareFile(file, title) {
  try {
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share({ files: [file], title });
      return true;
    }
  } catch (e) {
    if (e.name === 'AbortError') return false;
    console.warn('No se pudo compartir', e);
  }
  // Sin menú de compartir (por ejemplo en una compu): se descarga el archivo.
  const url = URL.createObjectURL(file);
  const a = document.createElement('a');
  a.href = url;
  a.download = file.name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
  return true;
}

// ---------- Dibujo

async function fontsReady() {
  try {
    await Promise.all([400, 700, 800].map((w) => document.fonts.load(`${w} 20px "Atkinson Hyperlegible Next"`)));
  } catch {}
}

function painter(width, height) {
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(width * SCALE);
  canvas.height = Math.round(height * SCALE);
  const ctx = canvas.getContext('2d');
  ctx.scale(SCALE, SCALE);
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, width, height);
  ctx.textBaseline = 'alphabetic';
  const p = {
    canvas,
    text(str, x, y, { size = 20, weight = 400, color = INK, align = 'left' } = {}) {
      ctx.font = `${weight} ${size}px ${FONT}`;
      ctx.fillStyle = color;
      ctx.textAlign = align;
      ctx.fillText(str, x, y);
    },
    width(str, { size = 20, weight = 400 } = {}) {
      ctx.font = `${weight} ${size}px ${FONT}`;
      return ctx.measureText(str).width;
    },
    rect(x, y, w, h, { fill, stroke, radius = 0, lineWidth = 1 } = {}) {
      ctx.beginPath();
      if (ctx.roundRect) ctx.roundRect(x, y, w, h, radius);
      else ctx.rect(x, y, w, h);
      if (fill) {
        ctx.fillStyle = fill;
        ctx.fill();
      }
      if (stroke) {
        ctx.strokeStyle = stroke;
        ctx.lineWidth = lineWidth;
        ctx.stroke();
      }
    },
    line(x1, y1, x2, y2, color = LINE, w = 1) {
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.strokeStyle = color;
      ctx.lineWidth = w;
      ctx.stroke();
    },
    avatar(cg, cx, cy, r) {
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fillStyle = (COLORS[cg?.color] || COLORS.gris).fg;
      ctx.fill();
      p.text(initial(cg?.name || '?'), cx, cy + r * 0.38, { size: r * 1.05, weight: 800, color: '#FFFFFF', align: 'center' });
    },
  };
  return p;
}

const priceList = (prices) => prices.map((x) => money(x)).join(' / ');

// ---------- Resumen del mes (todas)

function drawMonth(month) {
  const st = getState();
  const c = calc(st);
  const cgs = c.caregiversFor(month);
  const rows = cgs.map((cg) => ({ cg, s: c.summary(cg.id, month) }));
  const totals = c.monthTotals(month);
  const prices = [...new Set(rows.flatMap((r) => r.s.prices))].sort((a, b) => a - b);
  const ags = rows.filter((r) => r.s.aguinaldo?.amount);

  const W = 1400;
  const M = 48;
  const ROW = 62;
  const cols = [
    { k: 'name', label: 'Cuidadora', w: 250, align: 'left' },
    { k: 'h', label: 'Horas', w: 140 },
    { k: 'f', label: 'Feriado x2', w: 150 },
    { k: 'v', label: 'Vacaciones', w: 150 },
    { k: 'g', label: 'Total ganado', w: 200 },
    { k: 'p', label: 'Pagado', w: 200 },
    { k: 's', label: 'Saldo', w: 214 },
  ];
  const H = M + 50 + 40 + 30 + 56 + ROW * (rows.length + 1) + 30 + 100 + (ags.length ? 44 : 0) + 44 + M;
  const p = painter(W, H);
  let y = M + 40;
  p.text(`Resumen de ${monthName(month)} ${month.slice(0, 4)}`, M, y, { size: 44, weight: 800 });
  y += 40;
  p.text(`Precio por hora: ${priceList(prices) || '—'}  ·  Hecho el ${dmy(todayISO())}`, M, y, { size: 22, color: MUTED });
  y += 30;

  // encabezado
  p.rect(M, y, W - 2 * M, 56, { fill: GROUND, radius: 12 });
  let x = M;
  const colX = [];
  for (const col of cols) {
    colX.push(x);
    const tx = col.align === 'left' ? x + 16 : x + col.w - 16;
    p.text(col.label, tx, y + 36, { size: 20, weight: 700, color: MUTED, align: col.align || 'right' });
    x += col.w;
  }
  y += 56;

  const cell = (i, str, rowY, opts = {}) => {
    const col = cols[i];
    const tx = col.align === 'left' ? colX[i] + 16 : colX[i] + col.w - 16;
    p.text(str, tx, rowY + 40, { size: 22, weight: 700, align: col.align || 'right', ...opts });
  };

  rows.forEach(({ cg, s }, i) => {
    if (i % 2) p.rect(M, y, W - 2 * M, ROW, { fill: '#F7F9F8' });
    p.avatar(cg, M + 34, y + ROW / 2, 18);
    p.text(cg.name, M + 62, y + 40, { size: 24, weight: 800 });
    cell(1, hours(s.workedMin), y);
    cell(2, s.workedHolMin ? hours(s.workedHolMin) : '—', y, { color: s.workedHolMin ? HOL_INK : MUTED });
    cell(3, s.vacMin ? hours(s.vacMin) : '—', y, { color: s.vacMin ? INK : MUTED });
    cell(4, money(s.earned), y);
    cell(5, s.paid ? money(s.paid) : '—', y, { color: s.paid ? INK : MUTED });
    cell(6, s.saldo < 0 ? `De más ${money(-s.saldo)}` : money(s.saldo), y, { weight: 800, color: s.saldo < 0 ? '#8A3A04' : TEAL_DARK });
    y += ROW;
    p.line(M, y, W - M, y);
  });
  // fila de totales
  p.text('Total', M + 16, y + 40, { size: 24, weight: 800 });
  cell(1, hours(totals.workedMin), y, { weight: 800 });
  cell(2, hours(rows.reduce((t, r) => t + r.s.workedHolMin, 0)), y, { weight: 800 });
  cell(3, hours(rows.reduce((t, r) => t + r.s.vacMin, 0)), y, { weight: 800 });
  cell(4, money(totals.earned), y, { weight: 800 });
  cell(5, money(totals.paid), y, { weight: 800 });
  y += ROW + 30;

  p.rect(M, y, W - 2 * M, 84, { fill: TINT, radius: 16 });
  p.text('Total a pagar', M + 24, y + 52, { size: 26, weight: 700, color: TEAL_DARK });
  p.text(money(totals.toPay), W - M - 24, y + 58, { size: 44, weight: 800, color: TEAL_DARK, align: 'right' });
  y += 100;
  if (ags.length) {
    p.text(`El total ganado incluye aguinaldo: ${ags.map((r) => `${r.cg.name} ${money(r.s.aguinaldo.amount)}`).join(' · ')}`, M, y + 26, { size: 20, color: MUTED });
    y += 44;
  }
  p.text('Las horas trabajadas en un feriado se pagan doble.', M, y + 26, { size: 20, color: MUTED });
  return { canvas: p.canvas, name: `Resumen ${monthName(month)} ${month.slice(0, 4)}` };
}

// ---------- Detalle de una cuidadora

function drawCaregiver(cid, month) {
  const st = getState();
  const c = calc(st);
  const cg = c.caregiver(cid);
  const s = c.summary(cid, month);
  const W = 1000;
  const M = 48;
  const ROW = 44;
  const lines = [];
  lines.push(['Horas trabajadas', `${hours(s.workedMin)}${s.workedHolMin ? ` (${hours(s.workedHolMin)} en feriado x2)` : ''}`]);
  if (s.vacMin) lines.push(['Vacaciones', hours(s.vacMin)]);
  if (s.vacMin || s.aguinaldo) lines.push(['Por horas trabajadas', money(s.workedPay)]);
  if (s.vacMin) lines.push(['Por vacaciones', money(s.vacPay)]);
  if (s.aguinaldo) lines.push(['Aguinaldo', money(s.aguinaldo.amount)]);
  const H = M + 50 + 36 + 30 + 30 + 48 + ROW * Math.max(1, s.shifts.length) + 30
    + 40 * (lines.length + 1) + 30 + 40 + 36 * Math.max(1, s.payments.length) + 30 + 96 + M;
  const p = painter(W, H);

  let y = M;
  p.avatar(cg, M + 26, y + 26, 26);
  p.text(cg.name, M + 68, y + 40, { size: 44, weight: 800 });
  y += 50 + 36;
  p.text(`Detalle de ${monthName(month)} ${month.slice(0, 4)}`, M, y, { size: 26, weight: 700, color: MUTED });
  y += 30;
  p.text(`Precio por hora: ${priceList(s.prices) || money(priceAt(st.prices, `${month}-01`))}`, M, y + 4, { size: 22, color: MUTED });
  y += 30;

  const cols = [
    { label: 'Día', w: 200, align: 'left' },
    { label: 'Horario', w: 200, align: 'left' },
    { label: 'Horas', w: 110, align: 'right' },
    { label: 'Detalle', w: 214, align: 'left' },
    { label: 'Importe', w: 180, align: 'right' },
  ];
  const colX = [];
  let x = M;
  p.rect(M, y, W - 2 * M, 48, { fill: GROUND, radius: 12 });
  for (const col of cols) {
    colX.push(x);
    p.text(col.label, col.align === 'left' ? x + 14 : x + col.w - 14, y + 32, { size: 20, weight: 700, color: MUTED, align: col.align });
    x += col.w;
  }
  y += 48;
  const cell = (i, str, rowY, opts = {}) => {
    const col = cols[i];
    p.text(str, col.align === 'left' ? colX[i] + 14 : colX[i] + col.w - 14, rowY + 30, { size: 20, align: col.align, ...opts });
  };
  if (!s.shifts.length) {
    p.text('No tiene turnos este mes.', M + 14, y + 30, { size: 20, color: MUTED });
    y += ROW;
  }
  s.shifts.forEach((sh, i) => {
    const min = shiftMinutes(sh);
    const hol = holidayMinutes(sh, c.hol);
    const pay = Math.round(((min + hol) * priceAt(st.prices, sh.date)) / 60);
    if (hol) p.rect(M, y, W - 2 * M, ROW, { fill: HOL });
    else if (i % 2) p.rect(M, y, W - 2 * M, ROW, { fill: '#F7F9F8' });
    const wd = DIAS_CORTOS[new Date(`${sh.date}T12:00:00Z`).getUTCDay()];
    cell(0, `${wd} ${dm(sh.date)}`, y, { weight: 700 });
    cell(1, `${sh.start} a ${sh.end}`, y);
    cell(2, hours(min), y);
    cell(3, sh.vacation ? `Vacaciones${hol ? ` · ${hours(hol)} x2` : ''}` : hol ? `Feriado: ${hours(hol)} x2` : '', y, { color: hol ? HOL_INK : INK, weight: hol ? 700 : 400 });
    cell(4, money(pay), y, { weight: 700 });
    y += ROW;
  });
  y += 30;

  for (const [label, value] of lines) {
    p.text(label, M, y + 28, { size: 22, color: MUTED });
    p.text(value, W - M, y + 28, { size: 22, weight: 700, align: 'right' });
    y += 40;
  }
  p.line(M, y + 4, W - M, y + 4, INK, 1.5);
  p.text('Total ganado', M, y + 32, { size: 24, weight: 800 });
  p.text(money(s.earned), W - M, y + 32, { size: 24, weight: 800, align: 'right' });
  y += 40 + 30;

  p.text('Pagos del mes', M, y + 28, { size: 22, weight: 800 });
  y += 40;
  if (!s.payments.length) {
    p.text('Todavía no hay pagos.', M, y + 26, { size: 20, color: MUTED });
    y += 36;
  }
  for (const pay of s.payments) {
    p.text(`${dmy(pay.date)} · ${PAY_TYPES[pay.type]}${pay.note ? ` · ${pay.note}` : ''}`, M, y + 26, { size: 20 });
    p.text(money(-pay.amount), W - M, y + 26, { size: 20, weight: 700, align: 'right' });
    y += 36;
  }
  y += 30;
  const demas = s.saldo < 0;
  p.rect(M, y, W - 2 * M, 80, { fill: demas ? '#FFE6D2' : TINT, radius: 16 });
  p.text(demas ? 'Pagado de más' : 'Saldo a pagar', M + 24, y + 50, { size: 26, weight: 700, color: demas ? '#8A3A04' : TEAL_DARK });
  p.text(money(Math.abs(s.saldo)), W - M - 24, y + 54, { size: 40, weight: 800, color: demas ? '#8A3A04' : TEAL_DARK, align: 'right' });
  return { canvas: p.canvas, name: `${cg.name} ${monthName(month)} ${month.slice(0, 4)}` };
}

// ---------- PDF con la imagen adentro (sin librerías)

function buildPdf(jpg, w, h) {
  const enc = new TextEncoder();
  const pageW = 595.28;
  const pageH = Number(((pageW * h) / w).toFixed(2));
  const chunks = [];
  let len = 0;
  const offsets = [];
  const add = (x) => {
    const b = typeof x === 'string' ? enc.encode(x) : x;
    chunks.push(b);
    len += b.length;
  };
  const obj = (n, body) => {
    offsets[n] = len;
    add(`${n} 0 obj\n${body}\nendobj\n`);
  };
  add('%PDF-1.4\n');
  obj(1, '<< /Type /Catalog /Pages 2 0 R >>');
  obj(2, '<< /Type /Pages /Kids [3 0 R] /Count 1 >>');
  obj(3, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageW} ${pageH}] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>`);
  offsets[4] = len;
  add(`4 0 obj\n<< /Type /XObject /Subtype /Image /Width ${w} /Height ${h} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpg.length} >>\nstream\n`);
  add(jpg);
  add('\nendstream\nendobj\n');
  const content = `q ${pageW} 0 0 ${pageH} 0 0 cm /Im0 Do Q`;
  obj(5, `<< /Length ${content.length} >>\nstream\n${content}\nendstream`);
  const xref = len;
  let table = 'xref\n0 6\n0000000000 65535 f \n';
  for (let i = 1; i <= 5; i++) table += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
  add(table);
  add(`trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
  return new Blob(chunks, { type: 'application/pdf' });
}

const toBlob = (canvas, type, q) => new Promise((resolve) => canvas.toBlob(resolve, type, q));

async function makeFile({ canvas, name }, kind) {
  const png = await toBlob(canvas, 'image/png');
  if (kind === 'image') return { file: new File([png], `${name}.png`, { type: 'image/png' }), preview: png };
  const jpg = new Uint8Array(await (await toBlob(canvas, 'image/jpeg', 0.92)).arrayBuffer());
  const pdf = buildPdf(jpg, canvas.width, canvas.height);
  return { file: new File([pdf], `${name}.pdf`, { type: 'application/pdf' }), preview: png };
}

// El iPad solo deja compartir justo después de un toque, así que primero se arma
// el archivo y después se muestra una ventana con el botón para mandarlo.
async function prepareAndShow(draw, kind, title) {
  try {
    toast('Preparando…');
    await fontsReady();
    const made = await makeFile(draw(), kind);
    toast(null);
    await openDialog(SharePreview, { ...made, title });
  } catch (e) {
    console.error(e);
    toast('No se pudo armar el archivo.');
  }
}

export function shareMonth(month, kind) {
  return prepareAndShow(() => drawMonth(month), kind, `Resumen de ${monthTitle(month).toLowerCase()}`);
}

export function shareCaregiver(cid, month, kind) {
  const cg = getState().caregivers.find((x) => x.id === cid);
  return prepareAndShow(() => drawCaregiver(cid, month), kind, `Detalle de ${cg?.name}, ${monthTitle(month).toLowerCase()}`);
}

function SharePreview({ close, file, preview, title }) {
  const url = useMemo(() => URL.createObjectURL(preview), [preview]);
  const isPdf = file.type === 'application/pdf';
  const send = () => {
    shareFile(file, title).then((done) => {
      if (done) {
        URL.revokeObjectURL(url);
        close(true);
      }
    });
  };
  return html`<${Dialog} title=${title} sub=${isPdf ? 'Se manda como PDF.' : 'Se manda como imagen.'}
    onClose=${() => { URL.revokeObjectURL(url); close(); }}>
    <div style="max-height:52vh;overflow:auto;border:1px solid var(--line);border-radius:14px;background:var(--ground)">
      <img src=${url} alt=${`Vista previa: ${title}`} style="display:block;width:100%;height:auto" />
    </div>
    <div class="dfoot">
      <button class="btn cancel" onClick=${() => { URL.revokeObjectURL(url); close(); }}>Cancelar</button>
      <button class="btn go primary" onClick=${send}><${Icon} name="share" size=${28} />Compartir (WhatsApp)</button>
    </div>
  <//>`;
}
