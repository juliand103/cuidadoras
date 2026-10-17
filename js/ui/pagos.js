import { html, useState } from '../vendor/preact-htm.js';
import {
  Icon, Avatar, MonthNav, Dialog, Keypad, AmountBox, DateButton, ConfirmDialog, rememberMonth, currentMonth,
} from './common.js';
import { calc, newId, PAY_TYPES } from '../model.js';
import { addMonths, monthOf, todayISO } from '../dates.js';
import { centsToTyped, dmy, money, monthName, monthTitle, typedToCents } from '../format.js';
import { getState, go, openDialog, setState, toast, useStore } from '../store.js';
import { validMonth } from './resumen.js';

export function Pagos({ args }) {
  const st = useStore();
  const month = validMonth(args[0], st);
  rememberMonth(month);
  const filter = args[1] || 'todas';
  const c = calc(st);
  const shown = c.caregiversFor(month);
  const all = st.payments.filter((p) => p.month === month);
  const list = all
    .filter((p) => filter === 'todas' || p.caregiverId === filter)
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  const total = list.reduce((s, p) => s + p.amount, 0);
  const setFilter = (f) => go(`pagos/${month}${f === 'todas' ? '' : '/' + f}`, { replace: true });

  return html`<main class="screen">
    <header class="topbar">
      <h1>Pagos</h1>
      <${MonthNav} month=${month} min=${st.settings.startMonth}
        onChange=${(m) => go(`pagos/${m}${filter === 'todas' ? '' : '/' + filter}`)} />
    </header>
    <div class="pad" style="padding-top:0;padding-bottom:8px">
      <div class="chips" role="group" aria-label="Filtrar por cuidadora">
        <span class="muted" style="font-weight:700;margin-right:4px">Ver pagos de</span>
        <button class="chip text" aria-pressed=${filter === 'todas' ? 'true' : 'false'} onClick=${() => setFilter('todas')}>Todas</button>
        ${shown.map((cg) => html`<button class="chip" aria-pressed=${filter === cg.id ? 'true' : 'false'} onClick=${() => setFilter(cg.id)}>
          <${Avatar} cg=${cg} size="xs" /><span>${cg.name}</span></button>`)}
      </div>
    </div>
    <div class="scroll pad" style="padding-bottom:100px">
      <div class="rows">
        ${list.map((p) => html`<${PaymentRow} key=${p.id} p=${p} cg=${c.caregiver(p.caregiverId)} month=${month} />`)}
        ${!list.length && html`<div class="empty">No hay pagos anotados en ${monthName(month)}${filter !== 'todas' ? ` para ${c.caregiver(filter)?.name}` : ''}.</div>`}
        <p class="muted" style="text-align:center;line-height:26px;margin-top:8px">Para anotar un pago nuevo, tocá el botón «Nuevo pago».</p>
      </div>
    </div>
    <footer class="totals">
      <div class="head">Totales de<br />${monthName(month)}</div>
      <div><div class="lbl">Pagos anotados</div><div class="big">${list.length}</div></div>
      <div><div class="lbl">Total pagado</div><div class="big teal">${money(total)}</div></div>
    </footer>
    <button class="fab" onClick=${() => openDialog(PaymentDialog, {
      preset: { month, caregiverId: filter === 'todas' ? null : filter },
    })}><${Icon} name="plus" size=${30} />Nuevo pago</button>
  </main>`;
}

function PaymentRow({ p, cg, month }) {
  const remove = async () => {
    const ok = await openDialog(ConfirmDialog, {
      title: 'Borrar este pago',
      message: `${PAY_TYPES[p.type]} de ${money(p.amount)} a ${cg?.name}, del ${dmy(p.date)}. ¿Lo borro?`,
      ok: 'Sí, borrar', cancel: 'No', danger: true,
    });
    if (!ok) return;
    const st = getState();
    await setState({ ...st, payments: st.payments.filter((x) => x.id !== p.id) });
    toast('Pago borrado');
  };
  const other = monthOf(p.date) !== month;
  const sub = [dmy(p.date), other ? `corresponde a ${monthName(month)}` : null, p.note || null].filter(Boolean).join(' · ');
  return html`<article class="row">
    <${Avatar} cg=${cg} />
    <div class="grow">
      <div class="t1"><span>${cg?.name}</span><span class="tag ${p.type === 'adelanto' ? 'gray' : 'soft'}">${PAY_TYPES[p.type]}</span></div>
      <div class="t2">${sub}</div>
    </div>
    <div class="amt">${money(p.amount)}</div>
    <button class="btn secondary small" onClick=${() => openDialog(PaymentDialog, { payment: p })}><${Icon} name="edit" size=${24} />Editar</button>
    <button class="btn danger small" onClick=${remove}><${Icon} name="trash" size=${24} />Borrar</button>
  </article>`;
}

// Ventana para anotar o cambiar un pago.
export function PaymentDialog({ close, payment, preset = {} }) {
  const st = getState();
  const today = todayISO();
  const init = payment || {
    caregiverId: preset.caregiverId || null,
    type: preset.type || 'adelanto',
    date: today,
    month: preset.month || currentMonth(),
    amount: preset.amount || 0,
    note: '',
  };
  const [cid, setCid] = useState(init.caregiverId);
  const [type, setType] = useState(init.type);
  const [date, setDate] = useState(init.date);
  const [month, setMonth] = useState(init.month);
  const [typed, setTyped] = useState(init.amount ? centsToTyped(init.amount) : '');
  const [note, setNote] = useState(init.note || '');

  const c = calc(st);
  const choices = st.caregivers.filter((cg) => !cg.archived || cg.id === init.caregiverId
    || c.caregiversFor(month).some((x) => x.id === cg.id));
  const cg = c.caregiver(cid);
  const cents = typedToCents(typed);
  // Saldo del mes sin contar este mismo pago (si se está editando)
  const saldo = cg ? c.summary(cg.id, month).saldo + (payment && payment.caregiverId === cid && payment.month === month ? payment.amount : 0) : 0;
  const min = st.settings.startMonth;

  const save = async () => {
    const data = { caregiverId: cid, type, date, month, amount: cents, note: note.trim() };
    const cur = getState();
    const payments = payment
      ? cur.payments.map((x) => (x.id === payment.id ? { ...x, ...data } : x))
      : [...cur.payments, { id: newId(), ...data }];
    await setState({ ...cur, payments });
    close(true);
    toast(payment ? 'Pago cambiado' : 'Pago guardado');
  };

  const label = payment
    ? 'Guardar cambios'
    : `Guardar ${PAY_TYPES[type].toLowerCase()} de ${money(cents)}${cg ? ` para ${cg.name}` : ''}`;

  return html`<${Dialog} title=${payment ? 'Cambiar pago' : 'Nuevo pago'} onClose=${() => close()}>
    <div class="cols">
      <div>
        <div role="group" aria-labelledby="np-quien">
          <span class="field-label" id="np-quien">¿A quién le pagás?</span>
          <div class="chips">
            ${choices.map((x) => html`<button class="chip" aria-pressed=${cid === x.id ? 'true' : 'false'} onClick=${() => setCid(x.id)}>
              <${Avatar} cg=${x} size="xs" /><span>${x.name}</span></button>`)}
          </div>
        </div>
        <div role="group" aria-labelledby="np-tipo">
          <span class="field-label" id="np-tipo">Tipo de pago</span>
          <div class="seg">
            ${Object.entries(PAY_TYPES).map(([k, v]) => html`<button aria-pressed=${type === k ? 'true' : 'false'} onClick=${() => setType(k)}>${v}</button>`)}
          </div>
        </div>
        <div>
          <span class="field-label" id="np-mes">Corresponde al mes</span>
          <div class="pick" style="padding:0 4px;justify-content:space-between" role="group" aria-labelledby="np-mes">
            <button class="btn small" style="border:0;padding:0 10px" aria-label="Mes anterior" disabled=${month <= min}
              onClick=${() => setMonth(addMonths(month, -1))}><${Icon} name="chevL" /></button>
            <span>${monthTitle(month)}</span>
            <button class="btn small" style="border:0;padding:0 10px" aria-label="Mes siguiente"
              onClick=${() => setMonth(addMonths(month, 1))}><${Icon} name="chevR" /></button>
          </div>
        </div>
        <div>
          <span class="field-label" id="np-fecha">Fecha del pago</span>
          <${DateButton} id="np-fecha" value=${date} onPick=${setDate} title="Fecha del pago" extra=${date === today ? 'hoy' : null} />
        </div>
      </div>
      <div>
        <span class="field-label" id="np-monto">Monto</span>
        <${AmountBox} id="np-monto" value=${typed} onClear=${() => setTyped('')} />
        ${cg && saldo > 0 && cents !== saldo && html`
          <button class="btn secondary block wrap" onClick=${() => setTyped(centsToTyped(saldo))}>
            Usar el saldo de ${monthName(month)}: ${money(saldo)}
          </button>`}
        <${Keypad} value=${typed} onChange=${setTyped} />
        <div>
          <label class="field-label" for="np-nota">Nota <span class="muted" style="font-weight:400">(opcional)</span></label>
          <input id="np-nota" class="text-input" type="text" placeholder="Por ejemplo: en efectivo" value=${note}
            onInput=${(e) => setNote(e.target.value)} />
        </div>
      </div>
    </div>
    <div class="dfoot">
      <button class="btn cancel" onClick=${() => close()}>Cancelar</button>
      <button class="btn go primary" disabled=${!cid || !cents} onClick=${save}><${Icon} name="check" size=${28} />${label}</button>
    </div>
  <//>`;
}
