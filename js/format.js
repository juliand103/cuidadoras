import { parseISO, weekday } from './dates.js';

export const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
export const DIAS_CORTOS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
export const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto',
  'septiembre', 'octubre', 'noviembre', 'diciembre'];

export const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

function miles(n) {
  return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

// centavos → "$ 938.400,00"; negativos con el signo menos tipográfico
export function money(cents, { sign = false } = {}) {
  const neg = cents < 0;
  const abs = Math.round(Math.abs(cents));
  const txt = `$ ${miles(Math.floor(abs / 100))},${String(abs % 100).padStart(2, '0')}`;
  if (neg) return `− ${txt}`;
  if (sign && cents > 0) return `+ ${txt}`;
  return txt;
}

// minutos → "8 h", "7,5 h"
export function hours(min) {
  const h = min / 60;
  const txt = Number.isInteger(h) ? String(h) : h.toFixed(1).replace('.', ',');
  return `${txt} h`;
}

export function hoursShort(min) {
  return hours(min).replace(' ', '');
}

// "30/10/2026"
export function dmy(d) {
  const [y, m, dd] = d.split('-');
  return `${dd}/${m}/${y}`;
}

// "5/10"
export function dm(d) {
  const [, m, dd] = d.split('-');
  return `${Number(dd)}/${Number(m)}`;
}

export function dayName(d) {
  return DIAS[weekday(d)];
}

// "Lunes 5/10/2026"
export function longDate(d) {
  const [y, m, dd] = d.split('-');
  return `${cap(dayName(d))} ${Number(dd)}/${Number(m)}/${y}`;
}

export function monthName(m) {
  return MESES[Number(m.slice(5, 7)) - 1];
}

// "Octubre 2026"
export function monthTitle(m) {
  return `${cap(monthName(m))} ${m.slice(0, 4)}`;
}

// "5 al 11 de octubre" / "26 de octubre al 1 de noviembre"
export function rangeTitle(a, b) {
  const da = parseISO(a).getUTCDate();
  const db = parseISO(b).getUTCDate();
  const ma = monthName(a.slice(0, 7));
  const mb = monthName(b.slice(0, 7));
  if (ma === mb) return `${da} al ${db} de ${mb}`;
  return `${da} de ${ma} al ${db} de ${mb}`;
}

// Texto de monto mientras se escribe en el teclado: "200000,5" → "$ 200.000,5"
export function typedMoney(str) {
  if (!str) return '$ 0';
  const [ent, dec] = str.split(',');
  const e = miles(Number(ent || '0'));
  return dec !== undefined ? `$ ${e},${dec}` : `$ ${e}`;
}

// Texto del teclado → centavos
export function typedToCents(str) {
  if (!str) return 0;
  const [ent, dec = ''] = str.split(',');
  return Number(ent || '0') * 100 + Number((dec + '00').slice(0, 2));
}

// centavos → texto para el teclado
export function centsToTyped(cents) {
  const c = Math.round(Math.abs(cents));
  const ent = Math.floor(c / 100);
  const dec = c % 100;
  return dec ? `${ent},${String(dec).padStart(2, '0')}` : String(ent);
}

export function percent(p) {
  return `${String(p).replace('.', ',')} %`;
}

// Nombre corto para las celdas del calendario
export function shortName(name, max = 6) {
  const first = name.trim().split(/\s+/)[0];
  return first.length <= max ? first : first.slice(0, 4);
}

export function initial(name) {
  return name.trim().charAt(0).toUpperCase();
}
