import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  calc, copyWeek, holidayMinutes, paidChanges, raisePrice, rotationShifts, seedState,
  selfOverlap, shiftMinutes, usualTimes,
} from '../js/model.js';
import { money, hours, rangeTitle, shortName, typedToCents } from '../js/format.js';

// Datos de prueba inventados (los reales no se publican): cinco cuidadoras,
// rotación de 24 h y $ 4.000 la hora.
const RATE = 400000;
const ROT = {
  1: [['c-a', '06:00', '14:00'], ['c-b', '14:00', '22:00'], ['c-c', '22:00', '06:00']],
  2: [['c-a', '06:00', '14:00'], ['c-b', '14:00', '22:00'], ['c-c', '22:00', '06:00']],
  3: [['c-a', '06:00', '14:00'], ['c-b', '14:00', '22:00'], ['c-c', '22:00', '06:00']],
  4: [['c-a', '06:00', '14:00'], ['c-b', '14:00', '22:00'], ['c-c', '22:00', '06:00']],
  5: [['c-a', '06:00', '14:00'], ['c-b', '14:00', '22:00'], ['c-e', '22:00', '06:00']],
  6: [['c-d', '06:00', '18:00'], ['c-e', '18:00', '06:00']],
  0: [['c-d', '06:00', '18:00'], ['c-e', '18:00', '06:00']],
};

function base(from, to, startMonth) {
  const s = seedState(from);
  const cg = (id, name, color) => ({ id, name, color, startDate: '2026-01-01', endDate: null, archived: false, priorBest: {} });
  s.caregivers = [cg('c-a', 'Anabella', 'azul'), cg('c-b', 'Bea', 'naranja'), cg('c-c', 'Caro', 'fucsia'), cg('c-d', 'Dora', 'verde'), cg('c-e', 'Eva', 'violeta')];
  s.prices = [{ id: 'p-1', from: '2026-01-01', amount: RATE, kind: 'inicial' }];
  s.shifts = rotationShifts(ROT, from, to);
  s.settings.startMonth = startMonth;
  s.settings.startDate = from;
  return s;
}

// Un octubre completo con feriado el lunes 12 y algunos pagos.
function octubre() {
  const s = base('2026-10-01', '2026-10-31', '2026-10');
  s.holidays = [{ date: '2026-10-12', name: 'Feriado' }];
  const pay = (id, caregiverId, type, amount) =>
    ({ id, caregiverId, type, amount, date: '2026-10-15', month: '2026-10', note: '' });
  s.payments = [
    pay('a1', 'c-a', 'adelanto', 20000000),
    pay('a2', 'c-b', 'adelanto', 15000000),
    pay('a3', 'c-e', 'adelanto', 10000000),
    pay('s1', 'c-d', 'sueldo', 108 * RATE),
  ];
  return s;
}

const novDic = () => base('2026-11-01', '2026-12-31', '2026-11');

test('la app publicada arranca vacía', () => {
  const s = seedState('2026-10-17');
  assert.equal(s.caregivers.length, 0);
  assert.equal(s.shifts.length, 0);
  assert.equal(s.settings.startMonth, '2026-10');
  assert.equal(calc(s).monthTotals('2026-10').toPay, 0);
});

test('turnos: horas, noche y feriado por reloj', () => {
  const hol = new Set(['2026-10-12']);
  assert.equal(shiftMinutes({ start: '22:00', end: '06:00' }), 480);
  assert.equal(shiftMinutes({ start: '06:00', end: '06:00' }), 1440);
  assert.equal(shiftMinutes({ start: '06:30', end: '14:00' }), 450);
  // entra el lunes feriado a las 22: 2 h x2
  assert.equal(holidayMinutes({ date: '2026-10-12', start: '22:00', end: '06:00' }, hol), 120);
  // entra el domingo 11 a las 18 y sale el lunes feriado a las 06: 6 h x2
  assert.equal(holidayMinutes({ date: '2026-10-11', start: '18:00', end: '06:00' }, hol), 360);
  assert.equal(holidayMinutes({ date: '2026-10-12', start: '06:00', end: '14:00' }, hol), 480);
});

test('un mes completo: horas, ganado, saldos y total a pagar', () => {
  const s = octubre();
  const c = calc(s);
  const esperado = {
    'c-a': { normal: 168, fer: 8, paid: 20000000 },
    'c-b': { normal: 168, fer: 8, paid: 15000000 },
    'c-c': { normal: 134, fer: 2, paid: 0 },
    'c-d': { normal: 108, fer: 0, paid: 108 * RATE },
    'c-e': { normal: 142, fer: 6, paid: 10000000 },
  };
  let toPay = 0;
  for (const [cid, e] of Object.entries(esperado)) {
    const r = c.summary(cid, '2026-10');
    const ganado = (e.normal + 2 * e.fer) * RATE;
    assert.equal(r.workedMin / 60, e.normal + e.fer, cid);
    assert.equal(r.workedHolMin / 60, e.fer, cid);
    assert.equal(r.earned, ganado, cid);
    assert.equal(r.saldo, ganado - e.paid, cid);
    toPay += ganado - e.paid;
  }
  assert.equal(c.summary('c-d', '2026-10').status, 'pagado');
  assert.equal(c.summary('c-a', '2026-10').status, 'pendiente');
  const t = c.monthTotals('2026-10');
  assert.equal(t.workedMin / 60, 744); // 31 días x 24 h
  assert.equal(t.toPay, toPay);
  assert.equal(money(c.summary('c-a', '2026-10').earned), '$ 736.000,00');
});

test('el turno del 31 cuenta entero en su mes', () => {
  const c = calc(octubre());
  const e = c.summary('c-e', '2026-10');
  assert.ok(e.shifts.some((sh) => sh.date === '2026-10-31' && sh.start === '18:00'));
  assert.equal(c.summary('c-e', '2026-11').workedMin, 0);
});

test('precio por turno según la fecha de inicio, aumento redondeado', () => {
  assert.equal(raisePrice(400000, 2), 408000);
  assert.equal(raisePrice(408000, 3.5), 422300); // 4.222,80 → 4.223
  const s = octubre();
  s.prices.push({ id: 'p-2', from: '2026-10-15', amount: 408000, kind: 'aumento', percent: 2 });
  const r = calc(s).summary('c-a', '2026-10');
  assert.deepEqual(r.prices, [RATE, 408000]);
  const dias = r.shifts.filter((sh) => sh.date >= '2026-10-15').length;
  assert.equal(r.earned, 184 * RATE + dias * 8 * 8000);
});

test('vacaciones: se pagan como horas trabajadas, x2 en feriado, aparte', () => {
  const s = octubre();
  for (const sh of s.shifts) {
    if (sh.caregiverId === 'c-a' && sh.date >= '2026-10-12' && sh.date <= '2026-10-16') sh.vacation = true;
  }
  const r = calc(s).summary('c-a', '2026-10');
  assert.equal(r.vacMin, 5 * 480);
  assert.equal(r.vacHolMin, 480);
  assert.equal(r.vacPay, (5 * 8 + 8) * RATE);
  assert.equal(r.earned, 184 * RATE);
  // las vacaciones no cubren la casa
  assert.deepEqual(calc(s).coverage('2026-10-13').gaps, [[360, 840]]);
});

test('aguinaldo de diciembre: 50 % del mejor mes, con el mejor mes previo cargado a mano', () => {
  const s = novDic();
  const c = calc(s);
  const nov = c.summary('c-a', '2026-11').earned;
  const dic = c.base('c-a', '2026-12');
  const ag = c.aguinaldo('c-a', '2026-12');
  assert.equal(ag.priorMissing, true);
  assert.equal(ag.amount, Math.round(Math.max(nov, dic.workedPay) / 2));
  assert.equal(c.aguinaldo('c-a', '2026-11'), null);
  s.caregivers[0].priorBest = { '2026-H2': 120000000 };
  const ag2 = calc(s).aguinaldo('c-a', '2026-12');
  assert.equal(ag2.amount, 60000000);
  assert.equal(ag2.priorMissing, false);
  assert.equal(calc(s).summary('c-a', '2026-12').earned, dic.workedPay + 60000000);
});

test('aguinaldo proporcional por fecha de ingreso y de salida', () => {
  const s = novDic();
  s.caregivers[1].startDate = '2026-10-01';
  const ag = calc(s).aguinaldo('c-b', '2026-12');
  assert.equal(ag.needsPrior, true);
  assert.ok(Math.abs(ag.factor - 92 / 184) < 1e-9);
  // deja de trabajar el 20/11: el aguinaldo proporcional aparece en noviembre
  s.caregivers[2].endDate = '2026-11-20';
  s.caregivers[2].archived = true;
  const c = calc(s);
  assert.ok(c.aguinaldo('c-c', '2026-11'));
  assert.equal(c.aguinaldo('c-c', '2026-12'), null);
  assert.ok(Math.abs(c.aguinaldo('c-c', '2026-11').factor - 143 / 184) < 1e-9);
});

test('pagos por mes elegido, saldo de más y meses anteriores pendientes', () => {
  const s = octubre();
  s.payments.push({ id: 'x', caregiverId: 'c-c', type: 'sueldo', amount: 80000000, date: '2026-11-02', month: '2026-10', note: '' });
  const c = calc(s);
  assert.equal(c.summary('c-c', '2026-10').status, 'demas');
  assert.equal(c.summary('c-c', '2026-11').paid, 0);
  const pend = c.pendingEarlier('2026-11', '2026-11-05');
  assert.equal(pend.length, 4); // c-d está pagada
  assert.ok(pend.every((p) => p.month === '2026-10'));
  assert.equal(c.pendingEarlier('2026-10', '2026-11-05').length, 0);
});

test('cambios que tocan un mes ya pagado', () => {
  const s = octubre();
  assert.equal(paidChanges(s, { ...s, holidays: [] }).length, 0); // c-d no trabajó el feriado
  const after = { ...s, shifts: s.shifts.filter((sh) => !(sh.caregiverId === 'c-d' && sh.date === '2026-10-31')) };
  const ch = paidChanges(s, after);
  assert.equal(ch.length, 1);
  assert.equal(ch[0].cid, 'c-d');
});

test('cobertura: huecos y superposiciones', () => {
  const s = novDic();
  const c = calc(s);
  assert.deepEqual(c.coverage('2026-11-03').gaps, []);
  assert.deepEqual(c.coverage('2026-11-01').gaps, []); // primer día: sin la noche anterior
  const s2 = { ...s, shifts: s.shifts.filter((sh) => !(sh.date === '2026-11-04' && sh.caregiverId === 'c-b')) };
  assert.deepEqual(calc(s2).coverage('2026-11-04').gaps, [[840, 1320]]);
  const s3 = { ...s, shifts: s.shifts.concat({ id: 'z', caregiverId: 'c-d', date: '2026-11-04', start: '13:00', end: '15:00', vacation: false }) };
  assert.equal(calc(s3).coverage('2026-11-04').overlaps.length, 2);
});

test('la misma cuidadora no puede tener dos turnos encimados', () => {
  const s = novDic();
  const noche = s.shifts.find((sh) => sh.caregiverId === 'c-c' && sh.date === '2026-11-02');
  assert.ok(selfOverlap(s.shifts, { caregiverId: 'c-c', date: '2026-11-03', start: '04:00', end: '08:00' }));
  assert.equal(selfOverlap(s.shifts, { caregiverId: 'c-c', date: '2026-11-03', start: '06:00', end: '08:00' }), null);
  assert.equal(selfOverlap(s.shifts, { ...noche }), null);
});

test('horario habitual y copiar semana', () => {
  const s = novDic();
  assert.deepEqual(usualTimes(s.shifts, 'c-c', '2027-01-04'), { start: '22:00', end: '06:00' });
  assert.deepEqual(usualTimes([], 'c-c', '2027-01-04'), { start: '06:00', end: '14:00' });
  const r = copyWeek(s.shifts, '2026-11-02', [{ monday: '2027-01-04' }, { monday: '2027-01-11', until: '2027-01-13' }]);
  assert.equal(r.added.filter((sh) => sh.date <= '2027-01-10').length, 19);
  assert.equal(r.added.filter((sh) => sh.date >= '2027-01-11').length, 9);
  assert.ok(r.added.every((sh) => !sh.vacation));
});

test('formatos', () => {
  assert.equal(money(93840000), '$ 938.400,00');
  assert.equal(money(-20000000), '− $ 200.000,00');
  assert.equal(hours(450), '7,5 h');
  assert.equal(hours(480), '8 h');
  assert.equal(rangeTitle('2026-10-05', '2026-10-11'), '5 al 11 de octubre');
  assert.equal(rangeTitle('2026-10-26', '2026-11-01'), '26 de octubre al 1 de noviembre');
  assert.equal(shortName('Anabella'), 'Anab');
  assert.equal(shortName('Bea'), 'Bea');
  assert.equal(typedToCents('200000,5'), 20000050);
});
