import { html, useState } from '../vendor/preact-htm.js';
import { Icon, Avatar, Dialog, colorOf, currentMonth } from './common.js';
import { calc, copyWeek, endsNextDay, shiftMinutes } from '../model.js';
import { addDays, addMonths, lastDay, mondayOf, monthOf, todayISO, weekDays } from '../dates.js';
import { cap, dayName, hours, monthName, rangeTitle, DIAS_CORTOS } from '../format.js';
import { commit, getState, go, openDialog, toast, useStore } from '../store.js';
import { openShift } from './turno.js';

export function Semana({ args }) {
  const st = useStore();
  const raw = /^\d{4}-\d{2}-\d{2}$/.test(args[0] || '') ? args[0] : todayISO();
  const monday = mondayOf(raw < st.settings.startDate ? st.settings.startDate : raw);
  const days = weekDays(monday);
  const c = calc(st);
  const daySet = new Set(days);
  const cgs = st.caregivers.filter((cg) =>
    (!cg.archived && (!cg.startDate || cg.startDate <= days[6]))
    || st.shifts.some((sh) => sh.caregiverId === cg.id && daySet.has(sh.date)));
  const weekShifts = st.shifts.filter((sh) => daySet.has(sh.date));
  const workedMin = weekShifts.filter((sh) => !sh.vacation).reduce((s, sh) => s + shiftMinutes(sh), 0);
  const cm = currentMonth();
  const backMonth = days.some((d) => monthOf(d) === cm) ? cm : monthOf(days[0]);
  const minMonday = mondayOf(st.settings.startDate);

  return html`<main class="screen">
    <header class="topbar">
      <button class="btn" onClick=${() => go(`calendario/${backMonth}`)}><${Icon} name="back" />Volver al mes</button>
      <div class="week-head">
        <button class="btn" aria-label="Semana anterior" disabled=${monday <= minMonday} onClick=${() => go(`semana/${addDays(monday, -7)}`, { replace: true })}>
          <${Icon} name="chevL" size=${24} /><span class="lbl">Anterior</span></button>
        <div class="t"><small>Cargar semana</small><b>${rangeTitle(days[0], days[6])}</b></div>
        <button class="btn" aria-label="Semana siguiente" onClick=${() => go(`semana/${addDays(monday, 7)}`, { replace: true })}>
          <span class="lbl">Siguiente</span><${Icon} name="chevR" size=${24} /></button>
      </div>
    </header>
    <div class="week">
      <div class="week-grid">
        <div class="hd" style="align-items:flex-start;font-size:20px;color:var(--muted);font-weight:700">Cuidadora</div>
        ${days.map((d) => {
          const hol = c.isHoliday(d);
          const gaps = c.coverage(d).gaps;
          return html`<div class="hd ${hol ? 'hol' : ''}">
            <small>${DIAS_CORTOS[(new Date(d + 'T12:00:00Z')).getUTCDay()]}</small>${Number(d.slice(8))}
            ${hol && html`<span style="font-size:15px">Feriado</span>`}
            ${gaps.length > 0 && html`<span class="gapdot">Falta cubrir</span>`}
          </div>`;
        })}
        ${cgs.map((cg) => {
          const mine = weekShifts.filter((sh) => sh.caregiverId === cg.id);
          const tot = mine.reduce((s, sh) => s + shiftMinutes(sh), 0);
          return html`
            <div class="who">
              <div class="nm"><${Avatar} cg=${cg} size="sm" /><span>${cg.name}</span></div>
              <div class="tot">${hours(tot)}</div>
            </div>
            ${days.map((d) => {
              const list = c.shiftsOn(d).filter((sh) => sh.caregiverId === cg.id);
              return html`<div class="cell">
                ${list.map((sh) => html`<${ShiftButton} sh=${sh} cg=${cg} />`)}
                ${!list.length && html`<button class="wadd" aria-label=${`Agregar turno de ${cg.name} el ${dayName(d)} ${Number(d.slice(8))}`}
                  onClick=${() => openShift({ caregiverId: cg.id, date: d })}><${Icon} name="plus" size=${26} /><span>Agregar</span></button>`}
              </div>`;
            })}`;
        })}
      </div>
    </div>
    <footer class="totals" style="gap:16px 28px">
      <div><div class="lbl">Total de la semana</div><div class="big">${hours(workedMin)}</div></div>
      <div style="display:flex;align-items:center;gap:8px;color:var(--muted)"><${Icon} name="moon" size=${22} /><span>Termina al día siguiente</span></div>
      <div style="margin-left:auto;display:flex;gap:12px">
        <button class="btn secondary" disabled=${!weekShifts.length} onClick=${() => openDialog(CopyWeekDialog, { monday })}>
          <${Icon} name="copy" />Copiar semana</button>
        <button class="btn primary" onClick=${() => go(`calendario/${backMonth}`)}><${Icon} name="check" />Listo</button>
      </div>
    </footer>
  </main>`;
}

function ShiftButton({ sh, cg }) {
  const col = colorOf(cg);
  const next = endsNextDay(sh);
  return html`<button class="wshift ${sh.vacation ? 'vac' : ''}" style=${{ borderColor: col.fg, background: col.bg }}
    aria-label=${`${cg.name}, ${dayName(sh.date)} ${Number(sh.date.slice(8))}, de ${sh.start} a ${sh.end}${sh.vacation ? ', vacaciones' : ''}`}
    onClick=${() => openShift({ shift: sh })}>
    <span>${sh.start}</span>
    <span><span class="a">a</span> ${sh.end}</span>
    <span class="h">${sh.vacation ? html`<${Icon} name="sun" size=${18} />Vac.` : hours(shiftMinutes(sh))}${next && html`<${Icon} name="moon" size=${18} label="Termina al día siguiente" />`}</span>
  </button>`;
}

function CopyWeekDialog({ close, monday }) {
  const st = getState();
  const c = calc(st);
  const days = weekDays(monday);
  const src = st.shifts.filter((sh) => days.includes(sh.date));
  const srcMin = src.reduce((s, sh) => s + shiftMinutes(sh), 0);
  const nextMonth = addMonths(monthOf(monday), 1);
  const until = lastDay(nextMonth);
  const untilWeeks = [];
  for (let m = addDays(monday, 7); m <= until; m = addDays(m, 7)) untilWeeks.push({ monday: m, until: addDays(m, 6) > until ? until : undefined });
  const options = Array.from({ length: 8 }, (_, i) => addDays(monday, 7 * (i + 1)));
  const [mode, setMode] = useState('hasta');
  const [checked, setChecked] = useState([]);
  const targets = mode === 'hasta' ? untilWeeks : checked.sort().map((m) => ({ monday: m }));

  const perCg = new Map();
  for (const sh of src) perCg.set(sh.caregiverId, (perCg.get(sh.caregiverId) || 0) + shiftMinutes(sh));
  const toggle = (m) => setChecked(checked.includes(m) ? checked.filter((x) => x !== m) : [...checked, m]);
  const describeTargets = targets.map((t) => rangeTitle(t.monday, t.until || addDays(t.monday, 6)));
  const n = targets.length;

  const doCopy = async () => {
    const cur = getState();
    const r = copyWeek(cur.shifts, monday, targets);
    if (await commit({ ...cur, shifts: r.shifts }, { describe: 'Copiar la semana modifica lo que ganó' })) {
      close(true);
      toast(`Semana copiada a ${n} ${n === 1 ? 'semana' : 'semanas'}`);
    }
  };

  return html`<${Dialog} title="Copiar semana" sub=${`Semana del ${rangeTitle(days[0], days[6])} · ${src.length} turnos · ${hours(srcMin)}`} onClose=${() => close()}>
    <div id="cs-pregunta" style="font-size:22px;font-weight:800">¿A qué semanas la copiás?</div>
    <div role="radiogroup" aria-labelledby="cs-pregunta" class="rows">
      <button class="toggle" role="radio" aria-checked=${mode === 'hasta' ? 'true' : 'false'} onClick=${() => setMode('hasta')}>
        <span class="box" style="border-radius:50%">${mode === 'hasta' && html`<${Icon} name="check" size=${22} />`}</span>
        <span style="flex:1">Hasta fin de ${monthName(nextMonth)}</span>
        <span class="muted" style="font-size:20px;font-weight:400">${untilWeeks.length} semanas</span>
      </button>
      <button class="toggle" role="radio" aria-checked=${mode === 'elegir' ? 'true' : 'false'} onClick=${() => setMode('elegir')}>
        <span class="box" style="border-radius:50%">${mode === 'elegir' && html`<${Icon} name="check" size=${22} />`}</span>
        <span style="flex:1">Elegir las semanas</span>
      </button>
    </div>
    ${mode === 'elegir' && html`<div class="weeklist" role="group" aria-label="Semanas">
      ${options.map((m) => {
        const wd = weekDays(m);
        const hol = wd.find((d) => c.isHoliday(d));
        const loaded = st.shifts.some((sh) => wd.includes(sh.date));
        const on = checked.includes(m);
        return html`<button role="checkbox" aria-checked=${on ? 'true' : 'false'} onClick=${() => toggle(m)}>
          <span class="box">${on && html`<${Icon} name="check" size=${24} />`}</span>
          <span>
            <span class="l1">${rangeTitle(wd[0], wd[6])}</span>
            ${hol
              ? html`<span class="l2 hol">Tiene un feriado: ${dayName(hol)} ${Number(hol.slice(8))}</span>`
              : html`<span class="l2">${loaded ? 'Ya tiene turnos cargados' : 'Vacía'}</span>`}
          </span>
        </button>`;
      })}
    </div>`}
    ${src.some((sh) => sh.vacation) && html`<div class="notice">
      <b>Ojo:</b> esta semana tiene vacaciones (${src.filter((sh) => sh.vacation).map((sh) => `${c.caregiver(sh.caregiverId)?.name} el ${dayName(sh.date)}`).join(', ')}).
      Se copian como turnos normales, y también se copia quien la reemplazó. Si no es lo que querés, copiá otra semana.
    </div>`}
    <div class="preview" role="status">
      <div class="lbl">Vista previa</div>
      ${n
        ? html`<div style="font-size:22px;line-height:28px;font-weight:800;margin-top:4px">
            Se copian ${src.length} turnos (${hours(srcMin)}) a ${n} ${n === 1 ? 'semana' : 'semanas'}: ${n > 3 && mode === 'hasta'
              ? `del ${rangeTitle(targets[0].monday, targets[n - 1].until || addDays(targets[n - 1].monday, 6))}`
              : describeTargets.map((t) => `del ${t}`).join(', ')}.
          </div>
          <div style="margin-top:4px">Por semana: ${[...perCg].map(([id, m], i) => `${i ? ' · ' : ''}${c.caregiver(id)?.name} ${hours(m)}`)}</div>
          <div class="muted">Lo que ya esté cargado en esas semanas se reemplaza. Las vacaciones se copian como turnos normales.</div>`
        : html`<div style="margin-top:4px">Elegí al menos una semana.</div>`}
    </div>
    <div class="dfoot">
      <button class="btn cancel" onClick=${() => close()}>Cancelar</button>
      <button class="btn go primary" disabled=${!n} onClick=${doCopy}><${Icon} name="check" size=${28} />
        Copiar a ${n} ${n === 1 ? 'semana' : 'semanas'}</button>
    </div>
  <//>`;
}
