import { html, useEffect, useRef, useState } from '../vendor/preact-htm.js';
import { Icon, Avatar, MonthNav, Dialog, ConfirmDialog, colorOf, rememberMonth } from './common.js';
import { calc, endsNextDay, holidayMinutes, shiftMinutes, shiftSpan } from '../model.js';
import { addDays, firstDay, fromMin, mondayOf, monthDays, monthOf, todayISO, weekday } from '../dates.js';
import { cap, dayName, dmy, hours, hoursShort, longDate, shortName } from '../format.js';
import { commit, getState, go, openDialog, toast, useStore } from '../store.js';
import { validMonth } from './resumen.js';
import { addShiftForDay, openShift } from './turno.js';

export function Calendario({ args }) {
  const st = useStore();
  const month = validMonth(args[0], st);
  rememberMonth(month);
  const sel = /^\d{4}-\d{2}-\d{2}$/.test(args[1] || '') && monthOf(args[1]) === month ? args[1] : null;
  const today = todayISO();
  const c = calc(st);
  const days = monthDays(month);
  const lead = (weekday(firstDay(month)) + 6) % 7;
  const trail = (7 - ((lead + days.length) % 7)) % 7;
  const weekStart = mondayOf(sel || (monthOf(today) === month ? today : firstDay(month)));

  return html`<main class="screen">
    <div class="split stack">
      <div class="main">
        <div class="cal">
          <div style="display:flex;justify-content:center">
            <${MonthNav} month=${month} min=${st.settings.startMonth} short onChange=${(m) => go(`calendario/${m}`)} />
          </div>
          <div class="cal-dow" aria-hidden="true">
            ${['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'].map((d) => html`<div>${d}</div>`)}
          </div>
          <div class="cal-grid">
            ${Array.from({ length: lead }, (_, i) => html`<div class="cal-out">${Number(addDays(firstDay(month), i - lead).slice(8))}</div>`)}
            ${days.map((d) => html`<${DayCell} key=${d} d=${d} c=${c} today=${today} selected=${d === sel} month=${month} />`)}
            ${Array.from({ length: trail }, (_, i) => html`<div class="cal-out">${i + 1}</div>`)}
          </div>
          <div class="cal-foot">
            <p>Tocá un día para ver o cambiar sus turnos.</p>
            <button class="btn secondary" onClick=${() => go(`semana/${weekStart}`)}><${Icon} name="clock" />Cargar semana</button>
          </div>
        </div>
      </div>
      ${sel && html`<${DayPanel} date=${sel} month=${month} c=${c} />`}
    </div>
  </main>`;
}

function DayCell({ d, c, today, selected, month }) {
  const hol = c.isHoliday(d);
  const shifts = c.shiftsOn(d);
  const gaps = c.coverage(d).gaps;
  const n = Number(d.slice(8));
  const label = `${cap(dayName(d))} ${n}${hol ? ', feriado' : ''}${gaps.length ? ', falta cubrir horas' : ''}`;
  return html`<button type="button" class="cal-day ${hol ? 'hol' : ''}" aria-pressed=${selected ? 'true' : 'false'}
    aria-current=${d === today ? 'date' : undefined} aria-label=${label}
    onClick=${() => go(selected ? `calendario/${month}` : `calendario/${month}/${d}`, { replace: true })}>
    ${d === today
      ? html`<span class="num"><span class="hoy">${n}</span><span class="hoytxt">Hoy</span></span>`
      : html`<span class="num">${n}</span>`}
    ${hol && html`<span class="fer">Feriado x2</span>`}
    ${shifts.map((sh) => {
      const cg = c.caregiver(sh.caregiverId);
      const col = colorOf(cg);
      return html`<span class="sh ${sh.vacation ? 'vac' : ''}" style=${{ background: col.fg, color: sh.vacation ? col.fg : undefined }}>
        <span>${shortName(cg?.name || '')}</span><span>${sh.vacation ? 'Vac' : hoursShort(shiftMinutes(sh))}</span></span>`;
    })}
    ${gaps.length > 0 && html`<span class="gap" aria-hidden="true">!</span>`}
  </button>`;
}

function DayPanel({ date, month, c }) {
  const hol = c.isHoliday(date);
  const holiday = getState().holidays.find((h) => h.date === date);
  const shifts = c.shiftsOn(date);
  const fromYesterday = c.shiftsOn(addDays(date, -1)).filter((sh) => endsNextDay(sh) && !sh.vacation);
  const { gaps, overlaps } = c.coverage(date);
  const name = (id) => c.caregiver(id)?.name || '';
  const ref = useRef(null);
  // Con el iPad vertical el detalle queda abajo del calendario: se lo muestra.
  useEffect(() => {
    if (window.matchMedia('(max-width: 1000px)').matches) ref.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [date]);

  const unmark = async () => {
    const st = getState();
    if (await commit({ ...st, holidays: st.holidays.filter((h) => h.date !== date) }, { describe: 'Desmarcar el feriado modifica lo que ganó' })) {
      toast('Feriado desmarcado');
    }
  };
  const mark = async () => {
    const res = await openDialog(MarkHolidayDialog, { date });
    if (res == null) return;
    const st = getState();
    if (await commit({ ...st, holidays: [...st.holidays, { date, name: res }] }, { describe: 'Marcar el feriado modifica lo que ganó' })) {
      toast('Feriado marcado');
    }
  };
  const quitar = async (sh) => {
    const cg = c.caregiver(sh.caregiverId);
    const ok = await openDialog(ConfirmDialog, {
      title: 'Quitar este turno',
      message: `${cg?.name}, ${longDate(date).toLowerCase()}, de ${sh.start} a ${sh.end}. ¿Lo quito?`,
      ok: 'Sí, quitar', danger: true,
    });
    if (!ok) return;
    const st = getState();
    if (await commit({ ...st, shifts: st.shifts.filter((x) => x.id !== sh.id) }, { describe: 'Quitar este turno modifica lo que ganó' })) {
      toast('Turno quitado');
    }
  };

  return html`<aside class="side" aria-label="Detalle del día" ref=${ref}>
    <div class="day-head">
      <div>
        <h2>${cap(dayName(date))} ${Number(date.slice(8))}</h2>
        <div class="muted">${dmy(date)}</div>
      </div>
      <button class="btn" onClick=${() => go(`calendario/${month}`, { replace: true })}><${Icon} name="close" size=${24} />Cerrar</button>
    </div>
    ${hol
      ? html`<div class="holbar">
          <div>
            <div style="font-size:22px;line-height:28px;font-weight:800">Feriado x2</div>
            <div style="line-height:24px">${holiday?.name || 'Se paga doble'}</div>
          </div>
          <button class="btn" onClick=${unmark}><${Icon} name="close" size=${22} />Desmarcar</button>
        </div>`
      : html`<button class="btn secondary block" onClick=${mark}><${Icon} name="star" />Marcar como feriado</button>`}
    ${gaps.map(([a, b]) => html`<div class="notice orange" style="display:flex;gap:10px;align-items:center">
      <${Icon} name="warn" size=${28} /><span>Falta cubrir de <b>${fromMin(a)}</b> a <b>${b === 1440 ? '24:00' : fromMin(b)}</b>.</span></div>`)}
    ${overlaps.map((o) => html`<div class="notice teal" style="padding:8px 12px">
      ${name(o.cids[0])} y ${name(o.cids[1])} están juntas de ${fromMin(o.a)} a ${o.b === 1440 ? '24:00' : fromMin(o.b)}.</div>`)}
    <h3 style="font-size:20px;line-height:26px;font-weight:700;color:var(--muted);margin-top:4px">Turnos de este día</h3>
    ${fromYesterday.map((sh) => html`<div class="muted" style="line-height:24px">
      Desde ayer: ${name(sh.caregiverId)} hasta las ${sh.end}.</div>`)}
    ${shifts.map((sh) => {
      const cg = c.caregiver(sh.caregiverId);
      const h = holidayMinutes(sh, c.hol);
      return html`<section class="shiftcard ${sh.vacation ? 'vac' : ''}" aria-label=${`Turno de ${cg?.name}`}>
        <div class="top"><${Avatar} cg=${cg} size="sm" /><span>${cg?.name}</span><span style="margin-left:auto">${hours(shiftMinutes(sh))}</span></div>
        <div class="mid">
          <span>${sh.start} a ${sh.end}</span>
          ${sh.vacation && html`<span class="tag vac">Vacaciones</span>`}
          ${h > 0 && html`<span class="tag hol">${hours(h)} x2</span>`}
        </div>
        ${endsNextDay(sh) && html`<div class="muted" style="line-height:24px">Termina el ${dayName(addDays(date, 1))} a las ${sh.end}</div>`}
        <div class="acts">
          <button class="btn secondary small" onClick=${() => openShift({ shift: sh })}><${Icon} name="edit" size=${24} />Cambiar</button>
          <button class="btn danger small" onClick=${() => quitar(sh)}><${Icon} name="archive" size=${24} />Quitar</button>
        </div>
      </section>`;
    })}
    ${!shifts.length && html`<p class="muted" style="line-height:26px">No hay turnos que empiecen este día.</p>`}
    <button class="btn secondary block" onClick=${() => addShiftForDay(date)}><${Icon} name="plus" />Agregar cuidadora</button>
  </aside>`;
}

function MarkHolidayDialog({ close, date }) {
  const [name, setName] = useState('');
  return html`<${Dialog} title="Marcar como feriado" sub=${longDate(date)} narrow onClose=${() => close()}>
    <div>
      <label class="field-label" for="mh-nombre">Nombre <span class="muted" style="font-weight:400">(opcional)</span></label>
      <input id="mh-nombre" class="text-input" type="text" placeholder="Por ejemplo: Navidad" value=${name} onInput=${(e) => setName(e.target.value)} />
    </div>
    <div class="notice">Las horas trabajadas en un feriado se pagan doble.</div>
    <div class="dfoot">
      <button class="btn cancel" onClick=${() => close()}>Cancelar</button>
      <button class="btn go primary" onClick=${() => close(name.trim())}><${Icon} name="star" size=${28} />Marcar feriado</button>
    </div>
  <//>`;
}
