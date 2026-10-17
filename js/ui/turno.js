import { html, useState } from '../vendor/preact-htm.js';
import { Icon, Avatar, Dialog, ConfirmDialog } from './common.js';
import {
  calc, endsNextDay, holidayMinutes, newId, selfOverlap, shiftMinutes, usualTimes,
} from '../model.js';
import { addDays, fromMin, toMin } from '../dates.js';
import { dayName, dm, hours, longDate } from '../format.js';
import { commit, getState, openDialog, toast } from '../store.js';

// Abrir la ventana de un turno: existente ({ shift }) o nuevo ({ caregiverId, date }).
export function openShift(opts) {
  return openDialog(ShiftDialog, opts);
}

// Agregar un turno eligiendo primero la cuidadora.
export async function addShiftForDay(date) {
  const cid = await openDialog(PickCaregiverDialog, { date });
  if (cid) return openShift({ caregiverId: cid, date });
}

function PickCaregiverDialog({ close, date }) {
  const st = getState();
  const list = st.caregivers.filter((cg) => !cg.archived && (!cg.startDate || cg.startDate <= date));
  return html`<${Dialog} title="¿Quién trabaja?" sub=${longDate(date)} narrow onClose=${() => close()}>
    <div class="rows">
      ${list.map((cg) => html`<button class="toggle" onClick=${() => close(cg.id)}>
        <${Avatar} cg=${cg} /><span>${cg.name}</span></button>`)}
    </div>
  <//>`;
}

function Stepper({ label, id, value, onChange, step, max, unitLabel, what }) {
  const up = () => onChange((value + step) % max);
  const down = () => onChange((value - step + max) % max);
  return html`<div class="unit">
    <button type="button" aria-label=${`Subir ${what}`} onClick=${up}><${Icon} name="chevU" size=${30} /></button>
    <div class="val" id=${id} aria-live="polite">${String(value).padStart(2, '0')}</div>
    <button type="button" aria-label=${`Bajar ${what}`} onClick=${down}><${Icon} name="chevD" size=${30} /></button>
    <div class="cap">${unitLabel}</div>
  </div>`;
}

function TimeInput({ label, id, min, onChange, which }) {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return html`<div role="group" aria-labelledby=${id}>
    <span class="field-label" id=${id}>${label}</span>
    <div class="stepper">
      <${Stepper} value=${h} step=${1} max=${24} unitLabel="Hora" what=${`la hora de ${which}`}
        onChange=${(v) => onChange(v * 60 + m)} />
      <div class="colon" aria-hidden="true">:</div>
      <${Stepper} value=${m} step=${30} max=${60} unitLabel="Minutos" what=${`los minutos de ${which}`}
        onChange=${(v) => onChange(h * 60 + v)} />
    </div>
  </div>`;
}

function ShiftDialog({ close, shift, caregiverId, date, start, end }) {
  const st = getState();
  const cid = shift ? shift.caregiverId : caregiverId;
  const day = shift ? shift.date : date;
  const cg = st.caregivers.find((x) => x.id === cid);
  const init = shift || { ...(start ? { start, end } : usualTimes(st.shifts, cid, day)), vacation: false };
  const [s, setS] = useState(toMin(init.start));
  const [e, setE] = useState(toMin(init.end));
  const [vacation, setVacation] = useState(!!init.vacation);

  const cand = { id: shift?.id, caregiverId: cid, date: day, start: fromMin(s), end: fromMin(e), vacation };
  const min = shiftMinutes(cand);
  const next = endsNextDay(cand);
  const holMin = holidayMinutes(cand, calc(st).hol);
  const clash = selfOverlap(st.shifts, cand);
  const changed = !shift || shift.start !== cand.start || shift.end !== cand.end || !!shift.vacation !== vacation;

  const status = [
    `Son ${hours(min).replace(' h', ' horas')}.`,
    next ? `Termina el ${dayName(addDays(day, 1))} ${dm(addDays(day, 1))} a las ${cand.end}.` : `Termina a las ${cand.end}.`,
    holMin ? `${hours(holMin)} caen en feriado y se pagan doble.` : '',
  ].filter(Boolean).join(' ');

  const persist = async () => {
    const cur = getState();
    const shifts = shift
      ? cur.shifts.map((x) => (x.id === shift.id ? { ...x, ...cand, id: shift.id } : x))
      : [...cur.shifts, { ...cand, id: newId() }];
    return commit({ ...cur, shifts }, { describe: 'Este cambio de turno modifica lo que ganó' });
  };

  const save = async () => {
    if (!changed) return close(false);
    if (await persist()) {
      close(true);
      toast('Turno guardado');
    }
  };

  const another = async () => {
    if (changed && !(await persist())) return;
    close(true);
    openShift({ caregiverId: cid, date: day, start: cand.end, end: fromMin(e + 8 * 60) });
  };

  const remove = async () => {
    const ok = await openDialog(ConfirmDialog, {
      title: 'Quitar este turno',
      message: `${cg.name}, ${longDate(day).toLowerCase()}, de ${shift.start} a ${shift.end}. ¿Lo quito?`,
      ok: 'Sí, quitar', danger: true,
    });
    if (!ok) return;
    const cur = getState();
    if (await commit({ ...cur, shifts: cur.shifts.filter((x) => x.id !== shift.id) }, { describe: 'Quitar este turno modifica lo que ganó' })) {
      close(true);
      toast('Turno quitado');
    }
  };

  return html`<${Dialog} title=${`Turno de ${cg.name}`} sub=${longDate(day)} lead=${html`<${Avatar} cg=${cg} />`} onClose=${() => close()}>
    <div style="display:flex;gap:40px;flex-wrap:wrap">
      <${TimeInput} label="Entra a las" id="et-entra" min=${s} onChange=${setS} which="entrada" />
      <${TimeInput} label="Sale a las" id="et-sale" min=${e} onChange=${setE} which="salida" />
    </div>
    <div class="notice teal" role="status" style="display:flex;align-items:center;gap:10px;font-size:22px;line-height:30px">
      ${next && html`<${Icon} name="moon" size=${26} />`}<span>${status}</span>
    </div>
    ${clash && html`<div class="notice orange" role="alert">
      Se pisa con otro turno de ${cg.name}: ${dayName(clash.date)} ${dm(clash.date)} de ${clash.start} a ${clash.end}. Cambiá el horario para poder guardarlo.
    </div>`}
    <button class="toggle" role="switch" aria-checked=${vacation ? 'true' : 'false'} onClick=${() => setVacation(!vacation)}>
      <span class="box">${vacation && html`<${Icon} name="check" size=${24} />`}</span>
      <span style="flex:1">Está de vacaciones este día<br /><span style="font-size:20px;font-weight:400">No viene, pero se le pagan estas horas igual.</span></span>
      <${Icon} name="sun" size=${30} />
    </button>
    ${shift && html`<div style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px">
      <button class="btn secondary" disabled=${!!clash} onClick=${another}><${Icon} name="plus" />Agregar otro turno este día</button>
      <button class="btn danger" onClick=${remove}><${Icon} name="archive" />Quitar este turno</button>
    </div>`}
    <div class="dfoot">
      <button class="btn cancel" onClick=${() => close()}>Cancelar</button>
      <button class="btn go primary" disabled=${!!clash} onClick=${save}><${Icon} name="check" size=${28} />Guardar turno</button>
    </div>
  <//>`;
}
