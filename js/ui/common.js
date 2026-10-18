import { html, useState } from '../vendor/preact-htm.js';
import { COLORS } from '../model.js';
import { addMonths, firstDay, mondayOf, monthDays, monthOf, todayISO, weekday } from '../dates.js';
import { cap, dayName, dmy, initial, money, monthTitle, typedMoney, typedToCents, centsToTyped, DIAS_CORTOS } from '../format.js';
import { PaidConfirm, getState, openDialog } from '../store.js';

export { html };

// ---------- Íconos (trazos del diseño)

const P = {
  resumen: '<rect x="5" y="4" width="14" height="17" rx="2.5"/><path d="M9 4.5V3h6v1.5M8.5 10h7M8.5 14h7M8.5 18h4"/>',
  calendario: '<rect x="3.5" y="5" width="17" height="15.5" rx="2.5"/><path d="M3.5 10h17M8 3v4M16 3v4"/>',
  pagos: '<rect x="2.5" y="6" width="19" height="12" rx="2.5"/><circle cx="12" cy="12" r="2.8"/><path d="M6 9.5v5M18 9.5v5"/>',
  config: '<path d="M4 7h9M17 7h3M4 12h3M11 12h9M4 17h11M19 17h1"/><circle cx="15" cy="7" r="2"/><circle cx="9" cy="12" r="2"/><circle cx="17" cy="17" r="2"/>',
  chevL: '<path d="M15 5l-7 7 7 7"/>',
  chevR: '<path d="M9 5l7 7-7 7"/>',
  chevU: '<path d="M6 15l6-6 6 6"/>',
  chevD: '<path d="M6 9l6 6 6-6"/>',
  close: '<path d="M6 6l12 12M18 6L6 18"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  edit: '<path d="M4 20l1-4L16 5l3 3L8 19l-4 1zM14 7l3 3"/>',
  trash: '<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v6M14 11v6"/>',
  del: '<path d="M9 6h10a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H9l-6-6 6-6zM12 10l4 4M16 10l-4 4"/>',
  clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
  back: '<path d="M19 12H5M11 6l-6 6 6 6"/>',
  copy: '<rect x="8" y="8" width="12" height="12" rx="2.5"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/>',
  people: '<circle cx="9" cy="8" r="3.2"/><path d="M3 19.5a6 6 0 0 1 12 0M16 5.2a3.2 3.2 0 0 1 0 5.6M17.5 14.2a6 6 0 0 1 3.5 5.3"/>',
  star: '<path d="M12 3.5l2.6 5.3 5.9.9-4.2 4.1 1 5.8-5.3-2.8-5.3 2.8 1-5.8-4.2-4.1 5.9-.9z"/>',
  archive: '<rect x="3.5" y="5" width="17" height="4" rx="1.2"/><path d="M5.5 9v10h13V9M10 13h4"/>',
  trend: '<path d="M4 17l6-6 4 4 6-7M15 8h5v5"/>',
  okCircle: '<circle cx="12" cy="12" r="9"/><path d="M7.5 12.5l3 3 6-6.5"/>',
  image: '<rect x="3.5" y="5" width="17" height="14" rx="2.5"/><circle cx="9" cy="10" r="1.6"/><path d="M4 17l5-4.5 4 3.5 3-2.5 4 3.5"/>',
  pdf: '<path d="M7 3.5h7l4 4V20a.5.5 0 0 1-.5.5h-10.5a.5.5 0 0 1-.5-.5V4a.5.5 0 0 1 .5-.5zM14 3.5v4h4"/>',
  share: '<path d="M12 3v12M7.5 7.5L12 3l4.5 4.5M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7"/>',
  warn: '<path d="M12 4l9.5 16h-19z"/><path d="M12 10v4.5M12 17.6v.2"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2.5M12 19v2.5M2.5 12H5M19 12h2.5M5.3 5.3l1.8 1.8M16.9 16.9l1.8 1.8M5.3 18.7l1.8-1.8M16.9 7.1l1.8-1.8"/>',
  down: '<path d="M12 4v11M7 10l5 5 5-5M5 20h14"/>',
  up: '<path d="M12 15V4M7 9l5-5 5 5M5 20h14"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5.5M12 7.6v.2"/>',
  undo: '<path d="M9 14L4 9l5-5"/><path d="M4 9h10a6 6 0 0 1 0 12h-3"/>',
};

export function Icon({ name, size = 26, label }) {
  if (name === 'moon') {
    return html`<svg width=${size} height=${size} viewBox="0 0 24 24" style="flex:none;fill:currentColor"
      role=${label ? 'img' : undefined} aria-label=${label} aria-hidden=${label ? undefined : 'true'}>
      <path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"></path></svg>`;
  }
  return html`<svg class="ico" width=${size} height=${size} viewBox="0 0 24 24"
    role=${label ? 'img' : undefined} aria-label=${label} aria-hidden=${label ? undefined : 'true'}
    dangerouslySetInnerHTML=${{ __html: P[name] || '' }}></svg>`;
}

export function colorOf(cg) {
  return COLORS[cg?.color] || COLORS.gris;
}

export function Avatar({ cg, size = '' }) {
  return html`<span class="avatar ${size}" aria-hidden="true" style=${{ background: colorOf(cg).fg }}>${initial(cg?.name || '?')}</span>`;
}

// ---------- Menú lateral

let lastMonth = null;
export function rememberMonth(m) {
  lastMonth = m;
}
export function currentMonth() {
  return lastMonth || monthOf(todayISO());
}

export function Rail({ screen }) {
  const today = todayISO();
  const m = currentMonth();
  const items = [
    ['resumen', 'Resumen', 'resumen', `#/resumen/${m}`],
    ['calendario', 'Calendario', 'calendario', `#/calendario/${m}`],
    ['pagos', 'Pagos', 'pagos', `#/pagos/${m}`],
    ['config', 'Configuración', 'config', '#/config/cuidadoras'],
  ];
  const active = screen === 'semana' ? 'calendario' : screen;
  return html`<nav class="rail" aria-label="Secciones">
    <div class="brand"><img src="icons/logo.svg" alt="" width="80" height="80" /><span>Sueldos Tata</span></div>
    ${items.map(([key, label, icon, href]) => html`
      <a href=${href} aria-current=${active === key ? 'page' : undefined}>
        <${Icon} name=${icon} size=${34} /><span>${label}</span>
      </a>`)}
    <div class="today">Hoy es ${dayName(today)}<br /><b>${dmy(today)}</b></div>
  </nav>`;
}

export function MonthNav({ month, onChange, min, short = false }) {
  const prevOk = !min || month > min;
  return html`<div class="monthnav">
    <button class="btn" style="padding:0 18px 0 12px" disabled=${!prevOk} onClick=${() => onChange(addMonths(month, -1))}>
      <${Icon} name="chevL" size=${24} /><span class="lbl">${short ? 'Anterior' : 'Mes anterior'}</span>
    </button>
    <div class="title">${monthTitle(month)}</div>
    <button class="btn" style="padding:0 12px 0 18px" onClick=${() => onChange(addMonths(month, 1))}>
      <span class="lbl">${short ? 'Siguiente' : 'Mes siguiente'}</span><${Icon} name="chevR" size=${24} />
    </button>
  </div>`;
}

// ---------- Ventanas

export function Dialog({ title, sub, onClose, children, narrow, lead }) {
  return html`<div class="overlay">
    <div class="dialog ${narrow ? 'narrow' : ''}" role="dialog" aria-modal="true" aria-label=${title}>
      <div class="dhead">
        <div style="display:flex;align-items:center;gap:12px;min-width:0">
          ${lead}
          <div style="min-width:0">
            <h2>${title}</h2>
            ${sub && html`<div class="muted" style="line-height:26px">${sub}</div>`}
          </div>
        </div>
        ${onClose && html`<button class="btn" style="flex:none" onClick=${onClose}><${Icon} name="close" size=${24} />Cerrar</button>`}
      </div>
      ${children}
    </div>
  </div>`;
}

export function ConfirmDialog({ close, title, message, ok = 'Sí', cancel = 'No', danger = false }) {
  return html`<${Dialog} title=${title} narrow>
    ${message && html`<p style="font-size:22px;line-height:30px">${message}</p>`}
    <div class="dfoot">
      <button class="btn cancel" onClick=${() => close(false)}>${cancel}</button>
      <button class="btn go ${danger ? 'danger' : 'primary'}" onClick=${() => close(true)}>${ok}</button>
    </div>
  <//>`;
}

function PaidConfirmDialog({ close, changes, describe }) {
  const st = getState();
  const name = (id) => st.caregivers.find((c) => c.id === id)?.name || '';
  return html`<${Dialog} title="Este mes ya está pagado" narrow>
    <p style="font-size:22px;line-height:30px">${describe || 'Este cambio modifica lo que ganó'}:</p>
    <div class="rows">
      ${changes.map((c) => html`<div class="notice">
        <b>${name(c.cid)} · ${monthTitle(c.month)}</b><br />
        Ganaba ${money(c.before)}, pasaría a ${money(c.after)}.
      </div>`)}
    </div>
    <p class="muted" style="line-height:26px">Si seguís, la diferencia va a aparecer como saldo en ese mes.</p>
    <div class="dfoot">
      <button class="btn cancel" onClick=${() => close(false)}>No cambiar</button>
      <button class="btn go primary" onClick=${() => close(true)}>Sí, cambiar igual</button>
    </div>
  <//>`;
}
PaidConfirm.component = PaidConfirmDialog;

// ---------- Teclado numérico

export function pressKey(value, k, decimals = 2, maxInt = 9) {
  if (k === 'del') return value.slice(0, -1);
  if (k === ',') {
    if (decimals === 0 || value.includes(',')) return value;
    return (value || '0') + ',';
  }
  const [ent, dec] = value.split(',');
  if (dec !== undefined && dec.length >= decimals) return value;
  if (dec === undefined && ent.replace(/^0+/, '').length >= maxInt) return value;
  let nv = value + k;
  if (/^0\d/.test(nv)) nv = nv.slice(1);
  return nv;
}

export function Keypad({ value, onChange, decimals = 2, maxInt = 9 }) {
  const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', ',', '0'];
  return html`<div class="keypad">
    ${keys.map((k) => html`<button type="button" aria-label=${k === ',' ? 'Coma decimal' : undefined}
      disabled=${k === ',' && decimals === 0} onClick=${() => onChange(pressKey(value, k, decimals, maxInt))}>${k}</button>`)}
    <button type="button" class="del" onClick=${() => onChange(pressKey(value, 'del'))}><${Icon} name="del" />Borrar</button>
  </div>`;
}

export function AmountBox({ value, onClear, id }) {
  return html`<div style="display:flex;gap:8px;align-items:stretch">
    <div id=${id} class="amount" role="status" style="flex:1">${typedMoney(value)}</div>
    ${value && html`<button type="button" class="btn small" style="min-height:76px" onClick=${onClear}>Borrar<br />todo</button>`}
  </div>`;
}

// Ventana para escribir un monto. Devuelve centavos o undefined.
export function MoneyDialog({ close, title, sub, value = 0, label = 'Monto', okLabel = 'Guardar', note }) {
  const [v, setV] = useState(value ? centsToTyped(value) : '');
  const cents = typedToCents(v);
  return html`<${Dialog} title=${title} sub=${sub} onClose=${() => close()}>
    <div class="cols">
      <div>
        <span class="field-label">${label}</span>
        <${AmountBox} value=${v} onClear=${() => setV('')} />
        ${note && html`<p class="muted" style="line-height:26px">${note}</p>`}
      </div>
      <div><${Keypad} value=${v} onChange=${setV} /></div>
    </div>
    <div class="dfoot">
      <button class="btn cancel" onClick=${() => close()}>Cancelar</button>
      <button class="btn go primary" disabled=${!cents} onClick=${() => close(cents)}>
        <${Icon} name="check" size=${28} />${typeof okLabel === 'function' ? okLabel(cents) : okLabel}
      </button>
    </div>
  <//>`;
}

// ---------- Elegir fecha

export function DatePickerDialog({ close, title = 'Elegir fecha', value, min, max }) {
  const today = todayISO();
  const [month, setMonth] = useState(monthOf(value || today));
  const st = getState();
  const hol = new Set(st.holidays.map((h) => h.date));
  const days = monthDays(month);
  const lead = (weekday(firstDay(month)) + 6) % 7;
  return html`<${Dialog} title=${title} narrow onClose=${() => close()}>
    <div class="dp-head">
      <button class="btn" aria-label="Mes anterior" onClick=${() => setMonth(addMonths(month, -1))}><${Icon} name="chevL" /></button>
      <div class="title">${monthTitle(month)}</div>
      <button class="btn" aria-label="Mes siguiente" onClick=${() => setMonth(addMonths(month, 1))}><${Icon} name="chevR" /></button>
    </div>
    <div class="dp-grid">
      ${['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'].map((d) => html`<div class="dow">${d}</div>`)}
      ${Array.from({ length: lead }, () => html`<div></div>`)}
      ${days.map((d) => html`<button type="button"
        class="${d === today ? 'today' : ''} ${hol.has(d) ? 'hol' : ''}"
        aria-pressed=${d === value ? 'true' : 'false'}
        aria-label=${`${cap(dayName(d))} ${dmy(d)}`}
        disabled=${(min && d < min) || (max && d > max)}
        onClick=${() => close(d)}>${Number(d.slice(8))}</button>`)}
    </div>
    <div class="dfoot">
      <button class="btn cancel" onClick=${() => close()}>Cancelar</button>
      <button class="btn go secondary" disabled=${(min && today < min) || (max && today > max)} onClick=${() => close(today)}>Hoy, ${dmy(today)}</button>
    </div>
  <//>`;
}

export function DateButton({ value, onPick, id, title, min, max, extra }) {
  return html`<button type="button" class="pick" aria-labelledby=${id}
    onClick=${async () => {
      const d = await openDialog(DatePickerDialog, { value, title, min, max });
      if (d) onPick(d);
    }}>
    <${Icon} name="calendario" />
    ${value ? html`<span>${dmy(value)}</span><span class="hint wd">(${extra || dayName(value)})</span>` : html`<span class="hint">dd/mm/aaaa</span>`}
    <span class="go">${value ? 'Cambiar' : 'Elegir'}</span>
  </button>`;
}

export { DIAS_CORTOS, mondayOf };
