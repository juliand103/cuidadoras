// Fechas como texto 'AAAA-MM-DD' y meses como 'AAAA-MM'.
// Se calcula en UTC para que los cambios de horario no muevan los días.

export function parseISO(d) {
  const [y, m, dd] = d.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, dd));
}

export function toISO(dt) {
  return dt.toISOString().slice(0, 10);
}

export function addDays(d, n) {
  const t = parseISO(d);
  t.setUTCDate(t.getUTCDate() + n);
  return toISO(t);
}

export function diffDays(a, b) {
  return Math.round((parseISO(b) - parseISO(a)) / 86400000);
}

// 0 = domingo … 6 = sábado
export function weekday(d) {
  return parseISO(d).getUTCDay();
}

export function mondayOf(d) {
  return addDays(d, -((weekday(d) + 6) % 7));
}

export function weekDays(monday) {
  return Array.from({ length: 7 }, (_, i) => addDays(monday, i));
}

export function monthOf(d) {
  return d.slice(0, 7);
}

export function addMonths(m, n) {
  let [y, mm] = m.split('-').map(Number);
  mm += n;
  y += Math.floor((mm - 1) / 12);
  mm = (((mm - 1) % 12) + 12) % 12 + 1;
  return `${y}-${String(mm).padStart(2, '0')}`;
}

export function daysInMonth(m) {
  const [y, mm] = m.split('-').map(Number);
  return new Date(Date.UTC(y, mm, 0)).getUTCDate();
}

export function firstDay(m) {
  return `${m}-01`;
}

export function lastDay(m) {
  return `${m}-${String(daysInMonth(m)).padStart(2, '0')}`;
}

export function monthDays(m) {
  return Array.from({ length: daysInMonth(m) }, (_, i) => `${m}-${String(i + 1).padStart(2, '0')}`);
}

export function monthsBetween(from, to) {
  // meses desde `from` hasta `to` inclusive
  const out = [];
  for (let m = from; m <= to; m = addMonths(m, 1)) out.push(m);
  return out;
}

export function toMin(hhmm) {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

export function fromMin(min) {
  const t = ((min % 1440) + 1440) % 1440;
  return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
}

// Hoy en la hora local del iPad. Para probar se puede abrir con ?hoy=2026-11-30
export function todayISO() {
  try {
    const q = new URLSearchParams(globalThis.location?.search || '').get('hoy');
    if (q && /^\d{4}-\d{2}-\d{2}$/.test(q)) return q;
  } catch {}
  const n = new Date();
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}`;
}
