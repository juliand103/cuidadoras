// Reglas de pago y cálculos. Sin nada de pantalla: se puede probar con Node.
//
// Dinero siempre en centavos (enteros). Horarios en minutos.
// Un turno pertenece entero al día (y al mes) en que empieza.
// Las horas que caen dentro de un feriado se pagan x2, según el reloj.

import {
  addDays, addMonths, diffDays, firstDay, lastDay, monthOf, monthsBetween,
  toMin, weekday, weekDays,
} from './dates.js';

export const COLORS = {
  azul: { name: 'Azul', fg: '#2459C9', bg: '#E3EBFA' },
  naranja: { name: 'Naranja', fg: '#BF540A', bg: '#FBE9DA' },
  fucsia: { name: 'Fucsia', fg: '#B8246A', bg: '#F9E1EC' },
  verde: { name: 'Verde', fg: '#557D10', bg: '#E8F1D6' },
  violeta: { name: 'Violeta', fg: '#7440C2', bg: '#EDE5F9' },
  turquesa: { name: 'Turquesa', fg: '#0E7C86', bg: '#DDF1F2' },
  marron: { name: 'Marrón', fg: '#7A4A2A', bg: '#F1E7DF' },
  gris: { name: 'Gris', fg: '#55616E', bg: '#E6E9EC' },
};

export const PAY_TYPES = { sueldo: 'Sueldo', adelanto: 'Adelanto', aguinaldo: 'Aguinaldo' };

export function newId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return 'id-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
}

// ---------- Turnos

// Minutos desde las 00:00 del día en que empieza. Si sale antes o a la misma hora
// que entra, termina al día siguiente (06:00 a 06:00 son 24 h).
export function shiftSpan(sh) {
  const s = toMin(sh.start);
  let e = toMin(sh.end);
  if (e <= s) e += 1440;
  return { s, e };
}

export function shiftMinutes(sh) {
  const { s, e } = shiftSpan(sh);
  return e - s;
}

export function endsNextDay(sh) {
  return shiftSpan(sh).e > 1440;
}

export function holidayMinutes(sh, hol) {
  const { s, e } = shiftSpan(sh);
  let h = 0;
  if (hol.has(sh.date)) h += Math.min(e, 1440) - s;
  if (e > 1440 && hol.has(addDays(sh.date, 1))) h += e - 1440;
  return h;
}

export function holidaySet(state) {
  return new Set(state.holidays.map((h) => h.date));
}

export function indexByDate(shifts) {
  const m = new Map();
  for (const sh of shifts) {
    if (!m.has(sh.date)) m.set(sh.date, []);
    m.get(sh.date).push(sh);
  }
  for (const list of m.values()) list.sort((a, b) => toMin(a.start) - toMin(b.start));
  return m;
}

// Otro turno de la misma cuidadora que se pisa con este (se pagaría dos veces).
export function selfOverlap(shifts, cand) {
  const { s, e } = shiftSpan(cand);
  for (const sh of shifts) {
    if (sh.id === cand.id || sh.caregiverId !== cand.caregiverId) continue;
    const off = diffDays(cand.date, sh.date);
    if (Math.abs(off) > 1) continue;
    const o = shiftSpan(sh);
    const a = o.s + off * 1440;
    const b = o.e + off * 1440;
    if (a < e && s < b) return sh;
  }
  return null;
}

// Horario habitual para un turno nuevo: el turno más cercano del mismo día de la
// semana; si no hay, el más cercano de cualquier día.
export function usualTimes(shifts, cid, date) {
  const mine = shifts
    .filter((sh) => sh.caregiverId === cid && sh.date !== date)
    .sort((a, b) => Math.abs(diffDays(date, a.date)) - Math.abs(diffDays(date, b.date))
      || (a.date < b.date ? 1 : -1));
  const wd = weekday(date);
  const pick = mine.find((sh) => weekday(sh.date) === wd) || mine[0];
  return pick ? { start: pick.start, end: pick.end } : { start: '06:00', end: '14:00' };
}

// Copia los turnos de una semana (lunes a domingo) a otras semanas.
// targets: [{ monday, until? }]; `until` corta la copia en esa fecha inclusive.
// Lo que ya había en los días destino se reemplaza. Las vacaciones se copian como turnos normales.
export function copyWeek(shifts, srcMonday, targets) {
  const srcDays = new Set(weekDays(srcMonday));
  const src = shifts.filter((sh) => srcDays.has(sh.date));
  const removeDays = new Set();
  const added = [];
  for (const t of targets) {
    const off = diffDays(srcMonday, t.monday);
    for (const d of weekDays(t.monday)) if (!t.until || d <= t.until) removeDays.add(d);
    for (const sh of src) {
      const nd = addDays(sh.date, off);
      if (t.until && nd > t.until) continue;
      added.push({ ...sh, id: newId(), date: nd, vacation: false });
    }
  }
  const removed = shifts.filter((sh) => removeDays.has(sh.date));
  return { shifts: shifts.filter((sh) => !removeDays.has(sh.date)).concat(added), removed, added };
}

// ---------- Precios

export function sortedPrices(prices) {
  return [...prices].sort((a, b) => (a.from < b.from ? -1 : a.from > b.from ? 1 : 0));
}

export function priceEntryAt(prices, date) {
  const sp = sortedPrices(prices);
  let cur = null;
  for (const p of sp) {
    if (p.from <= date) cur = p;
    else break;
  }
  return cur || sp[0] || null;
}

export function priceAt(prices, date) {
  return priceEntryAt(prices, date)?.amount ?? 0;
}

// Aumento en %, redondeado a pesos enteros.
export function raisePrice(baseCents, pct) {
  return Math.round((baseCents * (1 + pct / 100)) / 100) * 100;
}

// ---------- Medio año (aguinaldo)

export function semesterOf(month) {
  const y = month.slice(0, 4);
  const first = Number(month.slice(5, 7)) <= 6;
  return first
    ? { key: `${y}-H1`, from: `${y}-01`, to: `${y}-06`, start: `${y}-01-01`, end: `${y}-06-30` }
    : { key: `${y}-H2`, from: `${y}-07`, to: `${y}-12`, start: `${y}-07-01`, end: `${y}-12-31` };
}

const isAguinaldoMonth = (month) => month.endsWith('-06') || month.endsWith('-12');

// ---------- Cálculos sobre todo el estado

const calcCache = new WeakMap();

export function calc(state) {
  let c = calcCache.get(state);
  if (!c) {
    c = createCalc(state);
    calcCache.set(state, c);
  }
  return c;
}

function createCalc(state) {
  const hol = holidaySet(state);
  const byDate = indexByDate(state.shifts);
  const cgById = new Map(state.caregivers.map((cg) => [cg.id, cg]));
  const shiftsByKey = new Map();
  const paysByKey = new Map();
  const push = (map, k, v) => {
    if (!map.has(k)) map.set(k, []);
    map.get(k).push(v);
  };
  for (const sh of state.shifts) push(shiftsByKey, `${sh.caregiverId}|${monthOf(sh.date)}`, sh);
  for (const p of state.payments) push(paysByKey, `${p.caregiverId}|${p.month}`, p);

  const baseCache = new Map();
  const summaryCache = new Map();
  const startMonth = state.settings.startMonth;

  // Horas y plata por horas (trabajadas y de vacaciones) de un mes, sin aguinaldo.
  function base(cid, month) {
    const k = `${cid}|${month}`;
    if (baseCache.has(k)) return baseCache.get(k);
    const r = { workedMin: 0, workedHolMin: 0, vacMin: 0, vacHolMin: 0, workedPay: 0, vacPay: 0, prices: [] };
    let wp = 0;
    let vp = 0;
    const priceSet = new Set();
    for (const sh of shiftsByKey.get(k) || []) {
      const min = shiftMinutes(sh);
      const h = holidayMinutes(sh, hol);
      const price = priceAt(state.prices, sh.date);
      priceSet.add(price);
      const pay = ((min + h) * price) / 60;
      if (sh.vacation) {
        r.vacMin += min;
        r.vacHolMin += h;
        vp += pay;
      } else {
        r.workedMin += min;
        r.workedHolMin += h;
        wp += pay;
      }
    }
    r.workedPay = Math.round(wp);
    r.vacPay = Math.round(vp);
    r.prices = [...priceSet].sort((a, b) => a - b);
    baseCache.set(k, r);
    return r;
  }

  // Aguinaldo: 50 % del mejor mes del medio año, proporcional a los días trabajados.
  // Aparece en junio y diciembre; si la cuidadora dejó de trabajar antes, aparece
  // en su último mes (aguinaldo proporcional).
  function aguinaldo(cid, month) {
    const cg = cgById.get(cid);
    if (!cg) return null;
    const sem = semesterOf(month);
    const endMonth = cg.endDate ? monthOf(cg.endDate) : null;
    const endsInSem = cg.endDate && cg.endDate >= sem.start && cg.endDate <= sem.end;
    if (endsInSem) {
      if (endMonth !== month) return null;
    } else if (!isAguinaldoMonth(month)) {
      return null;
    }
    const empStart = cg.startDate && cg.startDate > sem.start ? cg.startDate : sem.start;
    const empEnd = endsInSem ? cg.endDate : sem.end;
    if (empEnd < empStart) return null;
    const factor = (diffDays(empStart, empEnd) + 1) / (diffDays(sem.start, sem.end) + 1);
    let best = 0;
    let bestMonth = null;
    for (const m of monthsBetween(sem.from, month)) {
      const b = base(cid, m);
      const t = b.workedPay + b.vacPay;
      if (t > best) {
        best = t;
        bestMonth = m;
      }
    }
    // Medio año que empezó antes que la app: el mejor mes anterior se carga a mano, una vez.
    const needsPrior = startMonth > sem.from && (!cg.startDate || cg.startDate < firstDay(startMonth));
    const prior = cg.priorBest?.[sem.key];
    if (needsPrior && prior != null && prior > best) {
      best = prior;
      bestMonth = 'antes';
    }
    return {
      amount: Math.round(best * 0.5 * factor),
      best,
      bestMonth,
      factor,
      semKey: sem.key,
      needsPrior,
      priorMissing: needsPrior && prior == null,
      priorFrom: sem.from,
      priorTo: addMonths(startMonth, -1),
    };
  }

  function summary(cid, month) {
    const k = `${cid}|${month}`;
    if (summaryCache.has(k)) return summaryCache.get(k);
    const b = base(cid, month);
    const ag = aguinaldo(cid, month);
    const payments = (paysByKey.get(k) || []).slice().sort((x, y) => (x.date < y.date ? -1 : 1));
    const paid = payments.reduce((s, p) => s + p.amount, 0);
    const finals = payments.filter((p) => p.type !== 'adelanto');
    const earned = b.workedPay + b.vacPay + (ag ? ag.amount : 0);
    const saldo = earned - paid;
    let status = 'pendiente';
    if (saldo < 0) status = 'demas';
    else if (saldo === 0 && paid > 0) status = 'pagado';
    else if (finals.length && saldo > 0) status = 'parcial';
    const r = {
      ...b,
      aguinaldo: ag,
      earned,
      payments,
      paid,
      hasFinal: finals.length > 0,
      lastFinalDate: finals.length ? finals[finals.length - 1].date : null,
      saldo,
      status,
      shifts: (shiftsByKey.get(k) || []).slice().sort((x, y) =>
        x.date < y.date ? -1 : x.date > y.date ? 1 : toMin(x.start) - toMin(y.start)),
    };
    summaryCache.set(k, r);
    return r;
  }

  // Cuidadoras que se muestran en un mes.
  function caregiversFor(month) {
    const last = lastDay(month);
    const first = firstDay(month);
    return state.caregivers.filter((cg) => {
      const k = `${cg.id}|${month}`;
      if (shiftsByKey.get(k)?.length || paysByKey.get(k)?.length) return true;
      if (cg.startDate && cg.startDate > last) return false;
      if (cg.archived) return !!(cg.endDate && cg.endDate >= first && cg.endDate <= last);
      return true;
    });
  }

  function monthTotals(month) {
    let workedMin = 0;
    let toPay = 0;
    let earned = 0;
    let paid = 0;
    for (const cg of caregiversFor(month)) {
      const s = summary(cg.id, month);
      workedMin += s.workedMin;
      toPay += Math.max(0, s.saldo);
      earned += s.earned;
      paid += s.paid;
    }
    return { workedMin, toPay, earned, paid };
  }

  // Meses anteriores que quedaron con diferencia (saldo sin pagar o pagado de más).
  function pendingEarlier(viewMonth, today) {
    const bound = [viewMonth, monthOf(today)].sort()[0];
    const out = [];
    for (let m = startMonth; m < bound; m = addMonths(m, 1)) {
      for (const cg of caregiversFor(m)) {
        const s = summary(cg.id, m);
        if (s.saldo !== 0) out.push({ month: m, cid: cg.id, saldo: s.saldo });
      }
    }
    return out;
  }

  // Cobertura de un día (00:00 a 24:00): huecos sin nadie y momentos con dos personas.
  function coverage(date) {
    const iv = [];
    for (const sh of byDate.get(date) || []) {
      if (sh.vacation) continue;
      const { s, e } = shiftSpan(sh);
      iv.push({ a: s, b: Math.min(e, 1440), cid: sh.caregiverId });
    }
    for (const sh of byDate.get(addDays(date, -1)) || []) {
      if (sh.vacation) continue;
      const { e } = shiftSpan(sh);
      if (e > 1440) iv.push({ a: 0, b: e - 1440, cid: sh.caregiverId });
    }
    let gaps = [];
    if (iv.length) {
      const sorted = [...iv].sort((x, y) => x.a - y.a);
      let cur = 0;
      for (const x of sorted) {
        if (x.a > cur) gaps.push([cur, x.a]);
        cur = Math.max(cur, x.b);
      }
      if (cur < 1440) gaps.push([cur, 1440]);
      // El primer día de la app no tiene el turno de la noche anterior cargado.
      if (date === state.settings.startDate) gaps = gaps.filter(([a]) => a !== 0);
    }
    const overlaps = [];
    for (let i = 0; i < iv.length; i++) {
      for (let j = i + 1; j < iv.length; j++) {
        if (iv[i].cid === iv[j].cid) continue;
        const a = Math.max(iv[i].a, iv[j].a);
        const b = Math.min(iv[i].b, iv[j].b);
        if (a < b) overlaps.push({ cids: [iv[i].cid, iv[j].cid], a, b });
      }
    }
    return { gaps, overlaps };
  }

  return {
    hol,
    byDate,
    caregiver: (id) => cgById.get(id),
    base,
    aguinaldo,
    summary,
    caregiversFor,
    monthTotals,
    pendingEarlier,
    coverage,
    shiftsOn: (date) => byDate.get(date) || [],
    isHoliday: (date) => hol.has(date),
  };
}

// Meses ya pagados (sueldo o aguinaldo) cuyo total ganado cambiaría con un nuevo estado.
export function paidChanges(before, after) {
  const cb = calc(before);
  const ca = calc(after);
  const out = [];
  const seen = new Set();
  for (const p of before.payments) {
    if (p.type === 'adelanto') continue;
    const k = `${p.caregiverId}|${p.month}`;
    if (seen.has(k)) continue;
    seen.add(k);
    const e1 = cb.summary(p.caregiverId, p.month).earned;
    const e2 = ca.summary(p.caregiverId, p.month).earned;
    if (e1 !== e2) out.push({ cid: p.caregiverId, month: p.month, before: e1, after: e2 });
  }
  return out;
}

// ---------- Datos iniciales

// Turnos a partir de una rotación semanal: { díaDeLaSemana: [[idCuidadora, entra, sale], …] }
// (lunes = 1 … domingo = 0)
export function rotationShifts(rotation, from, to) {
  const out = [];
  for (let d = from; d <= to; d = addDays(d, 1)) {
    for (const [caregiverId, start, end] of rotation[weekday(d)] || []) {
      out.push({ id: newId(), caregiverId, date: d, start, end, vacation: false });
    }
  }
  return out;
}

export const SCHEMA_VERSION = 1;

// La app publicada arranca vacía: los datos reales se cargan una vez con
// "Recuperar copia" desde el archivo de datos iniciales (que no se publica).
export function seedState(today) {
  const month = monthOf(today);
  return {
    version: SCHEMA_VERSION,
    caregivers: [],
    prices: [],
    holidays: [],
    shifts: [],
    payments: [],
    settings: { startMonth: month, startDate: firstDay(month), lastBackup: null, installedAt: today },
  };
}

// Revisa que un archivo de copia tenga la forma esperada.
export function validateBackup(data) {
  if (!data || typeof data !== 'object') return 'El archivo no es una copia de esta app.';
  const lists = ['caregivers', 'prices', 'holidays', 'shifts', 'payments'];
  for (const k of lists) if (!Array.isArray(data[k])) return 'El archivo no es una copia de esta app.';
  if (!data.settings || !data.settings.startMonth) return 'El archivo no es una copia de esta app.';
  if (data.version > SCHEMA_VERSION) return 'La copia es de una versión más nueva de la app.';
  return null;
}
