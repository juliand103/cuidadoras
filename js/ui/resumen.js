import { html, Icon, Avatar, MonthNav, MoneyDialog, Dialog, rememberMonth, currentMonth } from './common.js';
import { calc } from '../model.js';
import { diffDays, monthOf, todayISO } from '../dates.js';
import { dmy, hours, money, monthName, monthTitle } from '../format.js';
import { commit, getState, go, openDialog, useStore } from '../store.js';
import { PaymentDialog } from './pagos.js';
import { shareCaregiver, shareMonth } from '../share.js';
import { makeBackup } from '../backup.js';

export function validMonth(arg, st) {
  const min = st.settings.startMonth;
  let m = /^\d{4}-\d{2}$/.test(arg || '') ? arg : currentMonth();
  if (m < min) m = min;
  return m;
}

export function Resumen({ args }) {
  const st = useStore();
  const month = validMonth(args[0], st);
  rememberMonth(month);
  const today = todayISO();
  const c = calc(st);
  const cgs = c.caregiversFor(month);
  const totals = c.monthTotals(month);
  const pending = c.pendingEarlier(month, today);
  const lastCopy = st.settings.lastBackup || st.settings.installedAt;
  const backupDue = !lastCopy || diffDays(lastCopy, today) > 30;

  const byMonth = new Map();
  for (const p of pending) {
    if (!byMonth.has(p.month)) byMonth.set(p.month, []);
    byMonth.get(p.month).push(p);
  }

  return html`<main class="screen">
    <header class="topbar">
      <h1>Resumen del mes</h1>
      <${MonthNav} month=${month} min=${st.settings.startMonth} onChange=${(m) => go(`resumen/${m}`)} />
    </header>
    <div class="scroll pad" style="padding-bottom:100px;display:flex;flex-direction:column;gap:12px">
      ${!st.caregivers.length && html`
        <div class="notice teal" style="display:flex;align-items:center;gap:12px">
          <${Icon} name="info" size=${30} />
          <span style="flex:1"><b>Para empezar</b>, cargá el archivo de datos iniciales en Configuración › Copia de seguridad › Recuperar copia.
            También se pueden agregar las cuidadoras a mano.</span>
          <button class="btn secondary" onClick=${() => go('config/copia')}><${Icon} name="up" />Recuperar copia</button>
        </div>`}
      ${[...byMonth].map(([m, list]) => html`
        <button class="notice" onClick=${() => go(`resumen/${m}`)}>
          <${Icon} name="warn" size=${30} />
          <span style="flex:1">
            <b>${monthTitle(m)} quedó con diferencias.</b><br />
            ${list.map((p, i) => html`${i ? ' · ' : ''}${c.caregiver(p.cid)?.name}: ${p.saldo > 0 ? `falta pagar ${money(p.saldo)}` : `se pagó de más ${money(-p.saldo)}`}`)}
          </span>
          <span style="font-weight:800">Ver</span>
        </button>`)}
      ${backupDue && html`
        <div class="notice teal" style="display:flex;align-items:center;gap:12px">
          <${Icon} name="info" size=${30} />
          <span style="flex:1">${st.settings.lastBackup
            ? html`La última copia de seguridad es del <b>${dmy(st.settings.lastBackup)}</b>. Conviene hacer una nueva.`
            : html`Todavía no se hizo ninguna <b>copia de seguridad</b>. Conviene hacer una y mandarla por WhatsApp.`}</span>
          <button class="btn secondary" onClick=${makeBackup}><${Icon} name="down" />Hacer copia</button>
        </div>`}
      <div class="cards">
        ${cgs.map((cg) => html`<${Card} key=${cg.id} cg=${cg} month=${month} s=${c.summary(cg.id, month)} />`)}
        ${cgs.length > 0 && html`<section class="card share-card" aria-label="Compartir el resumen">
          <h2>Mandar el resumen</h2>
          <p class="muted" style="line-height:26px">Compartilo por WhatsApp como imagen o como PDF.</p>
          <button class="btn secondary" onClick=${() => shareMonth(month, 'image')}><${Icon} name="image" />Compartir imagen</button>
          <button class="btn secondary" onClick=${() => shareMonth(month, 'pdf')}><${Icon} name="pdf" />Compartir PDF</button>
        </section>`}
      </div>
    </div>
    <footer class="totals">
      <div class="head">Totales de<br />${monthName(month)}</div>
      <div><div class="lbl">Total horas</div><div class="big">${hours(totals.workedMin)}</div></div>
      <div><div class="lbl">Total a pagar</div><div class="big teal">${money(totals.toPay)}</div></div>
    </footer>
    <button class="fab" onClick=${() => openDialog(PaymentDialog, { preset: { month } })}>
      <${Icon} name="plus" size=${30} />Nuevo pago
    </button>
  </main>`;
}

function Line({ label, value, cls = '' }) {
  return html`<div class="line ${cls}"><span>${label}</span><span>${value}</span></div>`;
}

function Card({ cg, month, s }) {
  const ag = s.aguinaldo;
  const hasVac = s.vacMin > 0;
  const extra = hasVac || ag;
  const payLabel = s.hasFinal ? 'Ya pagado' : 'Adelantos';
  const pay = () => openDialog(PaymentDialog, {
    preset: { caregiverId: cg.id, type: 'sueldo', month, amount: Math.max(0, s.saldo) },
  });
  const send = () => openDialog(SendDialog, { cg, month });
  const showSend = s.earned || s.paid;

  return html`<section class="card" aria-label=${cg.name}>
    <div class="who">
      <${Avatar} cg=${cg} />
      <h2>${cg.name}</h2>
      ${cg.archived && html`<span class="tag gray">Archivada</span>`}
      ${showSend && html`<button class="btn secondary small" style="flex:none;min-height:44px;padding:0 10px;gap:6px;font-size:18px"
        aria-label=${`Mandar el detalle a ${cg.name}`} onClick=${send}><${Icon} name="share" size=${20} />Mandar</button>`}
    </div>
    <div class="hrs">
      <div><b>${hours(s.workedMin - s.workedHolMin)}</b><span>Normales</span></div>
      <div><b>${hours(s.workedHolMin)}</b><span>Feriado x2</span></div>
      <div style="text-align:right"><b>${hours(s.workedMin)}</b><span>Total</span></div>
    </div>
    <div class="lines">
      ${extra && html`<${Line} label="Por horas" value=${money(s.workedPay)} />`}
      ${hasVac && html`<${Line} label=${`Vacaciones · ${hours(s.vacMin)}`} value=${money(s.vacPay)} />`}
      ${ag && html`<${Line} label=${cg.endDate && monthOf(cg.endDate) === month ? 'Aguinaldo proporcional' : 'Aguinaldo'} value=${money(ag.amount)} />`}
      <${Line} label="Total ganado" value=${money(s.earned)} cls=${extra ? 'total' : ''} />
      <${Line} label=${payLabel} value=${s.paid ? money(-s.paid) : money(0)} />
    </div>
    ${ag?.priorMissing && html`
      <button class="notice" style="padding:8px 12px;line-height:24px" onClick=${() => askPriorBest(cg, ag)}>
        <span style="flex:1">Para el aguinaldo falta el mejor mes de ${monthName(ag.priorFrom)} a ${monthName(ag.priorTo)}.</span>
        <b>Cargar</b>
      </button>`}
    <div class="saldo ${s.saldo < 0 ? 'demas' : ''}">
      <div class="lbl">${s.saldo < 0 ? 'Pagado de más' : 'Saldo a pagar'}</div>
      <div class="amt">${money(Math.abs(s.saldo))}</div>
    </div>
    ${s.saldo > 0
      ? html`<button class="btn primary" onClick=${pay}><${Icon} name="pagos" />Pagar saldo</button>`
      : s.paid > 0 && s.saldo === 0
        ? html`<div class="paidchip"><${Icon} name="okCircle" size=${28} /><span>Pagado el ${dmy(s.lastFinalDate || s.payments[s.payments.length - 1].date)}</span></div>`
        : null}
  </section>`;
}

async function askPriorBest(cg, ag) {
  const from = monthName(ag.priorFrom);
  const to = monthName(ag.priorTo);
  const cents = await openDialog(MoneyDialog, {
    title: `Mejor mes de ${from} a ${to}`,
    sub: `Lo que más ganó ${cg.name} en un mes, para calcular el aguinaldo.`,
    value: cg.priorBest?.[ag.semKey] || 0,
    label: 'Total ganado en ese mes',
    note: 'Se carga una sola vez, mirando los papeles de esos meses.',
  });
  if (cents == null) return;
  const st = getState();
  await commit({
    ...st,
    caregivers: st.caregivers.map((x) => (x.id === cg.id
      ? { ...x, priorBest: { ...(x.priorBest || {}), [ag.semKey]: cents } } : x)),
  }, { describe: 'Este cambio modifica el aguinaldo de' });
}

function SendDialog({ close, cg, month }) {
  return html`<${Dialog} title=${`Mandar a ${cg.name}`} sub=${`Su detalle de ${monthTitle(month).toLowerCase()}: turnos, horas, pagos y saldo.`} narrow onClose=${() => close()}>
    <div class="seg" style="grid-auto-rows:88px">
      <button onClick=${() => { close(); shareCaregiver(cg.id, month, 'image'); }}>
        <span style="display:flex;align-items:center;justify-content:center;gap:10px"><${Icon} name="image" size=${30} />Como imagen</span>
      </button>
      <button onClick=${() => { close(); shareCaregiver(cg.id, month, 'pdf'); }}>
        <span style="display:flex;align-items:center;justify-content:center;gap:10px"><${Icon} name="pdf" size=${30} />Como PDF</span>
      </button>
    </div>
    <p class="muted" style="line-height:26px">Se abre el menú de compartir del iPad: elegí WhatsApp y después a ${cg.name}.</p>
  <//>`;
}
