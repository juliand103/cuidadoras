import { html, useState, useRef } from '../vendor/preact-htm.js';
import {
  Icon, Avatar, Dialog, ConfirmDialog, DateButton, Keypad, AmountBox, MoneyDialog, colorOf,
} from './common.js';
import { COLORS, calc, newId, priceAt, priceEntryAt, raisePrice, sortedPrices, semesterOf } from '../model.js';
import { addDays, addMonths, firstDay, monthOf, todayISO } from '../dates.js';
import {
  centsToTyped, dayName, dmy, money, monthName, percent, typedToCents,
} from '../format.js';
import { commit, getState, go, openDialog, setState, toast, useStore } from '../store.js';
import { makeBackup, restoreBackup } from '../backup.js';

const TABS = [
  ['cuidadoras', 'Cuidadoras', 'people'],
  ['feriados', 'Feriados', 'star'],
  ['precio', 'Precio por hora', 'pagos'],
  ['copia', 'Copia de seguridad', 'down'],
];

export function Config({ args }) {
  useStore();
  const tab = TABS.some(([k]) => k === args[0]) ? args[0] : 'cuidadoras';
  const Body = { cuidadoras: Cuidadoras, feriados: Feriados, precio: Precio, copia: Copia }[tab];
  return html`<main class="screen">
    <header class="topbar">
      <h1>Configuración</h1>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        ${TABS.map(([k, label, icon]) => html`<a class="btn tab" href=${`#/config/${k}`} aria-current=${tab === k ? 'page' : undefined}>
          <${Icon} name=${icon} />${label}</a>`)}
      </div>
    </header>
    <${Body} />
  </main>`;
}

// ---------- Cuidadoras

function Cuidadoras() {
  const st = getState();
  const [editing, setEditing] = useState(null); // id | 'new' | null
  const [showArchived, setShowArchived] = useState(false);
  const active = st.caregivers.filter((cg) => !cg.archived);
  const archived = st.caregivers.filter((cg) => cg.archived);
  const list = showArchived ? archived : active;
  const current = editing && editing !== 'new' ? st.caregivers.find((x) => x.id === editing) : null;

  const archive = async (cg) => {
    const res = await openDialog(ArchiveDialog, { cg });
    if (!res) return;
    const cur = getState();
    const next = {
      ...cur,
      caregivers: cur.caregivers.map((x) => (x.id === cg.id ? { ...x, archived: true, endDate: res } : x)),
      shifts: cur.shifts.filter((sh) => !(sh.caregiverId === cg.id && sh.date > res)),
    };
    if (await commit(next, { describe: 'Quitar a esta cuidadora modifica lo que ganó' })) {
      if (editing === cg.id) setEditing(null);
      toast(`${cg.name} quedó archivada`);
    }
  };
  const reactivate = async (cg) => {
    const cur = getState();
    if (await commit({ ...cur, caregivers: cur.caregivers.map((x) => (x.id === cg.id ? { ...x, archived: false, endDate: null } : x)) })) {
      toast(`${cg.name} volvió a la lista`);
    }
  };

  return html`<div class="split stack">
    <div class="main scroll pad" style="gap:10px">
      <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;min-height:56px">
        <h2 style="font-size:24px;font-weight:800">${showArchived ? `${archived.length} archivadas` : `${active.length} cuidadoras`}</h2>
        ${!showArchived && html`<button class="btn primary" onClick=${() => setEditing('new')}><${Icon} name="plus" />Agregar cuidadora</button>`}
      </div>
      <div class="rows">
        ${list.map((cg) => html`<article class="row">
          <${Avatar} cg=${cg} />
          <div class="grow">
            <div class="t1">${cg.name}</div>
            <div class="t2">Color ${colorOf(cg).name.toLowerCase()}${cg.startDate ? ` · desde el ${dmy(cg.startDate)}` : ''}${cg.endDate ? ` · hasta el ${dmy(cg.endDate)}` : ''}</div>
          </div>
          ${showArchived
            ? html`<button class="btn secondary small" onClick=${() => reactivate(cg)}><${Icon} name="undo" size=${24} />Volver a activar</button>`
            : editing === cg.id
              ? html`<span class="tag soft">Editando…</span>`
              : html`
                <button class="btn secondary small" onClick=${() => setEditing(cg.id)}><${Icon} name="edit" size=${24} />Editar</button>
                <button class="btn danger small" onClick=${() => archive(cg)}><${Icon} name="archive" size=${24} />Quitar</button>`}
        </article>`)}
        ${!list.length && html`<div class="empty">${showArchived ? 'No hay cuidadoras archivadas.' : 'Todavía no hay cuidadoras. Agregá la primera.'}</div>`}
      </div>
      <p class="muted" style="line-height:26px;margin-top:6px">Al quitar una cuidadora queda archivada: sus horas y pagos de los meses anteriores no se pierden.</p>
      <div>
        <button class="btn" onClick=${() => setShowArchived(!showArchived)}>
          <${Icon} name=${showArchived ? 'back' : 'archive'} />${showArchived ? 'Volver a la lista' : `Ver archivadas (${archived.length})`}</button>
      </div>
    </div>
    ${editing
      ? html`<${CaregiverForm} key=${editing} cg=${current} onDone=${() => setEditing(null)} />`
      : html`<aside class="side">
          <h2>Editar cuidadora</h2>
          <p class="muted" style="line-height:26px">Tocá «Editar» en una cuidadora para cambiar su nombre, su color o la fecha en que empezó.</p>
        </aside>`}
  </div>`;
}

function CaregiverForm({ cg, onDone }) {
  const st = getState();
  const today = todayISO();
  const used = new Set(st.caregivers.filter((x) => !x.archived && x.id !== cg?.id).map((x) => x.color));
  const [name, setName] = useState(cg?.name || '');
  const [color, setColor] = useState(cg?.color || Object.keys(COLORS).find((k) => !used.has(k)) || 'azul');
  const [startDate, setStartDate] = useState(cg?.startDate || today);
  // Aguinaldo del medio año en que empezó la app: el mejor mes anterior se carga a mano.
  const sem = semesterOf(st.settings.startMonth);
  const needsPrior = st.settings.startMonth > sem.from && startDate < firstDay(st.settings.startMonth);
  const [prior, setPrior] = useState(cg?.priorBest?.[sem.key] ?? null);

  const save = async () => {
    const cur = getState();
    const data = { name: name.trim(), color, startDate, priorBest: { ...(cg?.priorBest || {}) } };
    if (prior != null) data.priorBest[sem.key] = prior;
    const caregivers = cg
      ? cur.caregivers.map((x) => (x.id === cg.id ? { ...x, ...data } : x))
      : [...cur.caregivers, { id: newId(), ...data, endDate: null, archived: false }];
    if (await commit({ ...cur, caregivers }, { describe: 'Este cambio modifica el aguinaldo de' })) {
      toast(cg ? 'Cambios guardados' : `${data.name} agregada`);
      onDone();
    }
  };
  const editPrior = async () => {
    const cents = await openDialog(MoneyDialog, {
      title: `Mejor mes de ${monthName(sem.from)} a ${monthName(addMonths(st.settings.startMonth, -1))}`,
      sub: `Lo que más ganó ${name || 'ella'} en un mes, para el aguinaldo de ${monthName(sem.to)}.`,
      value: prior || 0,
      label: 'Total ganado en ese mes',
    });
    if (cents != null) setPrior(cents);
  };

  return html`<aside class="side" aria-label=${cg ? `Editar a ${cg.name}` : 'Agregar cuidadora'}>
    <h2>${cg ? `Editar a ${cg.name}` : 'Agregar cuidadora'}</h2>
    <label class="field-label" for="cc-nombre" style="margin:6px 0 0">Nombre</label>
    <input id="cc-nombre" class="text-input" type="text" value=${name} onInput=${(e) => setName(e.target.value)} />
    <span class="field-label" id="cc-color" style="margin:8px 0 0">Color</span>
    <div class="swatches" role="radiogroup" aria-labelledby="cc-color">
      ${Object.entries(COLORS).map(([k, v]) => html`<button role="radio" aria-checked=${color === k ? 'true' : 'false'} onClick=${() => setColor(k)}>
        <span class="dot" style=${{ background: v.fg }}></span><span>${v.name}</span></button>`)}
    </div>
    <span class="field-label" id="cc-desde" style="margin:8px 0 0">Trabaja desde</span>
    <${DateButton} id="cc-desde" value=${startDate} onPick=${setStartDate} title="Trabaja desde" />
    ${needsPrior && html`
      <span class="field-label" id="cc-prior" style="margin:8px 0 0">Mejor mes de ${monthName(sem.from)} a ${monthName(addMonths(st.settings.startMonth, -1))}</span>
      <button class="pick" aria-labelledby="cc-prior" onClick=${editPrior}>
        <span>${prior != null ? money(prior) : html`<span class="hint">Sin cargar</span>`}</span>
        <span class="go">${prior != null ? 'Cambiar' : 'Cargar'}</span>
      </button>
      <p class="muted" style="font-size:18px;line-height:24px">Para el aguinaldo de ${monthName(sem.to)}: lo que más ganó en un mes antes de usar la app.</p>`}
    <button class="btn primary big" style="margin-top:10px" disabled=${!name.trim()} onClick=${save}><${Icon} name="check" />${cg ? 'Guardar cambios' : 'Agregar'}</button>
    <button class="btn" onClick=${onDone}>Cancelar</button>
  </aside>`;
}

function ArchiveDialog({ close, cg }) {
  const today = todayISO();
  const st = getState();
  const [end, setEnd] = useState(today);
  const later = st.shifts.filter((sh) => sh.caregiverId === cg.id && sh.date > end).length;
  return html`<${Dialog} title=${`Quitar a ${cg.name}`} narrow onClose=${() => close()}>
    <p style="line-height:28px">Queda archivada: sus horas y pagos no se pierden. Ya no aparece para cargar turnos nuevos.</p>
    <div>
      <span class="field-label" id="ar-fin">Último día de trabajo</span>
      <${DateButton} id="ar-fin" value=${end} onPick=${setEnd} title="Último día de trabajo" min=${cg.startDate} />
    </div>
    ${later > 0 && html`<div class="notice orange">Tiene <b>${later} turnos</b> cargados después de esa fecha. Se van a borrar.</div>`}
    <div class="dfoot">
      <button class="btn cancel" onClick=${() => close()}>Cancelar</button>
      <button class="btn go danger" onClick=${() => close(end)}><${Icon} name="archive" size=${28} />Quitar a ${cg.name}</button>
    </div>
  <//>`;
}

// ---------- Feriados

function Feriados() {
  const st = getState();
  const today = todayISO();
  const [year, setYear] = useState(Number(today.slice(0, 4)));
  const [date, setDate] = useState(null);
  const [name, setName] = useState('');
  const list = st.holidays.filter((h) => h.date.startsWith(String(year))).sort((a, b) => (a.date < b.date ? -1 : 1));
  const exists = date && st.holidays.some((h) => h.date === date);

  const add = async () => {
    const cur = getState();
    if (await commit({ ...cur, holidays: [...cur.holidays, { date, name: name.trim() }] }, { describe: 'Este feriado modifica lo que ganó' })) {
      toast('Feriado agregado');
      setYear(Number(date.slice(0, 4)));
      setDate(null);
      setName('');
    }
  };
  const remove = async (h) => {
    const ok = await openDialog(ConfirmDialog, {
      title: 'Borrar feriado',
      message: `${dmy(h.date)}${h.name ? ` · ${h.name}` : ''}. Ese día se va a pagar normal. ¿Lo borro?`,
      ok: 'Sí, borrar', danger: true,
    });
    if (!ok) return;
    const cur = getState();
    if (await commit({ ...cur, holidays: cur.holidays.filter((x) => x.date !== h.date) }, { describe: 'Borrar el feriado modifica lo que ganó' })) {
      toast('Feriado borrado');
    }
  };

  return html`<div class="split stack">
    <div class="main scroll pad" style="gap:10px">
      <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;min-height:56px">
        <h2 style="font-size:24px;font-weight:800">Feriados de ${year}</h2>
        <div style="display:flex;gap:8px">
          <button class="btn" onClick=${() => setYear(year - 1)}><${Icon} name="chevL" size=${24} />${year - 1}</button>
          <button class="btn" onClick=${() => setYear(year + 1)}>${year + 1}<${Icon} name="chevR" size=${24} /></button>
        </div>
      </div>
      <div class="rows">
        ${list.map((h) => {
          const thisMonth = monthOf(h.date) === monthOf(today);
          return html`<article class="row ${thisMonth ? 'hol' : ''}" style="min-height:72px">
            <div style="width:136px;flex:none">
              <div style="font-size:22px;line-height:28px;font-weight:800">${dmy(h.date)}</div>
              <div class="muted" style="line-height:24px">${dayName(h.date)}</div>
            </div>
            <div class="grow" style="font-size:22px">${h.name || html`<span class="muted">Sin nombre</span>`}${thisMonth && html`<span style="font-size:20px;color:var(--hol-ink)"> · este mes</span>`}</div>
            <button class="btn danger small" onClick=${() => remove(h)}><${Icon} name="trash" size=${24} />Borrar</button>
          </article>`;
        })}
        ${!list.length && html`<div class="empty">Todavía no hay feriados cargados para ${year}.<br />Agregalos acá o desde el calendario.</div>`}
      </div>
    </div>
    <aside class="side" aria-label="Agregar feriado">
      <h2>Agregar feriado</h2>
      <span class="field-label" id="cf-fecha" style="margin:6px 0 0">Fecha</span>
      <${DateButton} id="cf-fecha" value=${date} onPick=${setDate} title="Fecha del feriado" />
      <label class="field-label" for="cf-nombre" style="margin:8px 0 0">Nombre <span class="muted" style="font-weight:400">(opcional)</span></label>
      <input id="cf-nombre" class="text-input" type="text" placeholder="Por ejemplo: 9 de Julio" value=${name} onInput=${(e) => setName(e.target.value)} />
      ${exists && html`<div class="notice orange">Ese día ya está marcado como feriado.</div>`}
      <button class="btn primary big" style="margin-top:10px" disabled=${!date || exists} onClick=${add}><${Icon} name="plus" />Agregar feriado</button>
      <div class="notice" style="margin-top:12px">
        <div style="font-size:22px;line-height:28px;font-weight:800">Feriado x2</div>
        <p style="margin-top:4px">Las horas trabajadas en un feriado se pagan doble. Si un turno cruza la medianoche, solo se duplican las horas que caen dentro del feriado.</p>
      </div>
    </aside>
  </div>`;
}

// ---------- Precio por hora

const KIND = { inicial: 'Precio inicial', manual: 'Cambio a mano', aumento: 'Aumento' };

function Precio() {
  const st = getState();
  const today = todayISO();
  const current = priceEntryAt(st.prices, today);
  const sorted = sortedPrices(st.prices);
  const future = sorted.filter((p) => p.from > today);
  const latest = sorted[sorted.length - 1];

  const removeLatest = async () => {
    const ok = await openDialog(ConfirmDialog, {
      title: 'Borrar este cambio de precio',
      message: `El precio de ${money(latest.amount)} desde el ${dmy(latest.from)}. Vuelve a regir el precio anterior. ¿Lo borro?`,
      ok: 'Sí, borrar', danger: true,
    });
    if (!ok) return;
    const cur = getState();
    if (await commit({ ...cur, prices: cur.prices.filter((p) => p.id !== latest.id) }, { describe: 'Este cambio de precio modifica lo que ganó' })) {
      toast('Cambio de precio borrado');
    }
  };

  return html`<div class="split stack">
    <div class="main scroll pad" style="gap:16px">
      <section class="panel" aria-labelledby="cp-actual">
        <h2 id="cp-actual" style="font-size:22px;font-weight:700;color:var(--muted)">Precio por hora actual</h2>
        <div class="bigprice">${money(current?.amount || 0)}</div>
        <div class="muted" style="line-height:26px">Vale para todas las cuidadoras.<br />Vigente desde el ${current ? dmy(current.from) : '—'}.</div>
        ${future.map((p) => html`<div class="notice teal">Desde el <b>${dmy(p.from)}</b> pasa a <b>${money(p.amount)}</b>.</div>`)}
        <div style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;margin-top:6px">
          <button class="btn primary big" onClick=${() => openDialog(RaiseDialog)}><${Icon} name="trend" size=${28} />Aplicar aumento</button>
          <button class="btn secondary big" onClick=${() => openDialog(ManualPriceDialog)}><${Icon} name="edit" />Cambiar a mano</button>
        </div>
      </section>
      <p class="muted" style="margin:0 4px;line-height:26px">Cada turno se paga con el precio que estaba vigente el día en que empezó. Si cambiás el precio, los turnos anteriores a esa fecha no se modifican.</p>
    </div>
    <aside class="side" aria-labelledby="cp-historial">
      <h2 id="cp-historial">Historial de precios</h2>
      ${[...sorted].reverse().map((p) => {
        const on = current && p.id === current.id;
        return html`<article class="histo ${on ? 'on' : ''}">
          <div style="display:flex;align-items:center;justify-content:space-between;gap:8px">
            <span style="line-height:26px" class=${on ? '' : 'muted'}>Desde el ${dmy(p.from)}</span>
            ${on && html`<span class="tag teal">Vigente</span>`}
            ${p.from > today && html`<span class="tag soft">Programado</span>`}
          </div>
          <div class="amt">${money(p.amount)}</div>
          <div class="muted" style="line-height:24px">${p.kind === 'aumento' ? `Aumento del ${percent(p.percent)}` : KIND[p.kind]}</div>
          ${p.id === latest.id && sorted.length > 1 && html`<button class="btn danger small" style="margin-top:6px" onClick=${removeLatest}>
            <${Icon} name="undo" size=${22} />Borrar este cambio</button>`}
        </article>`;
      })}
    </aside>
  </div>`;
}

function nextMonthStart() {
  return firstDay(addMonths(monthOf(todayISO()), 1));
}

async function savePrice(entry) {
  const cur = getState();
  const prices = [...cur.prices.filter((p) => p.from !== entry.from), { id: newId(), ...entry }];
  return commit({ ...cur, prices }, { describe: 'Este cambio de precio modifica lo que ganó' });
}

function RaiseDialog({ close }) {
  const st = getState();
  const [typed, setTyped] = useState('');
  const [from, setFrom] = useState(nextMonthStart());
  const pct = typedToCents(typed) / 100;
  const base = priceAt(st.prices, addDays(from, -1));
  const nuevo = raisePrice(base, pct);
  const apply = async () => {
    if (await savePrice({ from, amount: nuevo, kind: 'aumento', percent: pct })) {
      close(true);
      toast('Aumento aplicado');
    }
  };
  return html`<${Dialog} title="Aplicar aumento" onClose=${() => close()}>
    <div class="cols">
      <div>
        <div>
          <span class="field-label" id="aa-porc">Porcentaje de aumento</span>
          <div class="amount" role="status" aria-labelledby="aa-porc" style="font-size:42px">${typed || '0'} %</div>
        </div>
        <div class="preview teal" role="status">
          <div class="lbl" style="color:inherit">Vista previa</div>
          <div style="display:flex;align-items:flex-end;gap:14px;margin-top:6px;flex-wrap:wrap">
            <div><div style="color:var(--ink)">Precio actual</div><div style="font-size:28px;line-height:42px;font-weight:700;color:var(--ink)">${money(base)}</div></div>
            <${Icon} name="chevR" size=${34} />
            <div><div style="font-weight:700">Precio nuevo</div><div style="font-size:38px;line-height:42px;font-weight:800">${money(nuevo)}</div></div>
          </div>
          <div style="margin-top:6px;color:var(--ink)">${pct ? `Sube ${money(nuevo - base)} por hora (redondeado a pesos).` : 'Escribí el porcentaje con el teclado.'}</div>
        </div>
        <div>
          <span class="field-label" id="aa-fecha">Empieza a regir el</span>
          <${DateButton} id="aa-fecha" value=${from} onPick=${setFrom} title="Empieza a regir el" />
        </div>
        <p class="muted" style="line-height:26px">Los turnos antes del ${dmy(from)} no cambian.</p>
      </div>
      <div>
        <span class="field-label">Escribí el porcentaje</span>
        <${Keypad} value=${typed} onChange=${setTyped} decimals=${2} maxInt=${3} />
      </div>
    </div>
    <div class="dfoot">
      <button class="btn cancel" onClick=${() => close()}>Cancelar</button>
      <button class="btn go primary" disabled=${!pct} onClick=${apply}><${Icon} name="check" size=${28} />
        Aplicar aumento del ${percent(pct)} desde el ${dmy(from)}</button>
    </div>
  <//>`;
}

function ManualPriceDialog({ close }) {
  const st = getState();
  const [typed, setTyped] = useState('');
  const [from, setFrom] = useState(nextMonthStart());
  const cents = typedToCents(typed);
  const base = priceAt(st.prices, addDays(from, -1));
  const apply = async () => {
    if (await savePrice({ from, amount: cents, kind: 'manual' })) {
      close(true);
      toast('Precio cambiado');
    }
  };
  return html`<${Dialog} title="Cambiar el precio a mano" onClose=${() => close()}>
    <div class="cols">
      <div>
        <div>
          <span class="field-label" id="cm-precio">Precio nuevo por hora</span>
          <${AmountBox} id="cm-precio" value=${typed} onClear=${() => setTyped('')} />
        </div>
        <div class="muted" style="line-height:26px">Antes: ${money(base)} por hora.</div>
        <div>
          <span class="field-label" id="cm-fecha">Desde el</span>
          <${DateButton} id="cm-fecha" value=${from} onPick=${setFrom} title="Precio nuevo desde el" />
        </div>
        <p class="muted" style="line-height:26px">Los turnos antes del ${dmy(from)} no cambian.</p>
      </div>
      <div><${Keypad} value=${typed} onChange=${setTyped} /></div>
    </div>
    <div class="dfoot">
      <button class="btn cancel" onClick=${() => close()}>Cancelar</button>
      <button class="btn go primary" disabled=${!cents} onClick=${apply}><${Icon} name="check" size=${28} />
        Usar ${money(cents)} desde el ${dmy(from)}</button>
    </div>
  <//>`;
}

// ---------- Copia de seguridad

function Copia() {
  const st = getState();
  const fileRef = useRef(null);
  return html`<div class="scroll pad" style="display:flex;flex-direction:column;gap:16px;max-width:900px">
    <section class="panel">
      <h2>Copia de seguridad</h2>
      <p style="line-height:28px">Todo lo que se carga queda guardado solo en este iPad. Si el iPad se rompe o se borra, se pierde. La copia es un archivo con todo: cuidadoras, turnos, feriados, precios y pagos. Mandala por WhatsApp o guardala en iCloud.</p>
      <div class="notice ${st.settings.lastBackup ? 'teal' : ''}">
        ${st.settings.lastBackup
          ? html`La última copia es del <b>${dmy(st.settings.lastBackup)}</b>.`
          : html`Todavía no se hizo ninguna copia.`}
      </div>
      <button class="btn primary big" onClick=${makeBackup}><${Icon} name="down" size=${28} />Hacer copia</button>
      <p class="muted" style="line-height:26px">${st.caregivers.length} cuidadoras · ${st.shifts.length} turnos · ${st.holidays.length} feriados · ${st.payments.length} pagos</p>
    </section>
    <section class="panel">
      <h2>Recuperar una copia</h2>
      <p style="line-height:28px">Si hace falta volver atrás o pasar todo a otro iPad, elegí el archivo de la copia. <b>Reemplaza todo lo que hay ahora en este iPad.</b></p>
      <input ref=${fileRef} type="file" accept=".json,application/json" style="display:none"
        onChange=${(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) restoreBackup(f); }} />
      <button class="btn secondary big" onClick=${() => fileRef.current?.click()}><${Icon} name="up" size=${28} />Recuperar copia</button>
    </section>
  </div>`;
}
