import { validateBackup, SCHEMA_VERSION } from './model.js';
import { todayISO } from './dates.js';
import { dmy } from './format.js';
import { getState, openDialog, setState, toast } from './store.js';
import { shareFile } from './share.js';
import { ConfirmDialog } from './ui/common.js';

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

export async function makeBackup() {
  const st = getState();
  const today = todayISO();
  const data = { ...st, version: SCHEMA_VERSION, exportedAt: today };
  const file = new File([JSON.stringify(data)], `cuidadoras-copia-${today}.json`, { type: 'application/json' });
  const done = await shareFile(file, `Copia de seguridad del ${dmy(today)}`);
  if (!done) return;
  const cur = getState();
  await setState({ ...cur, settings: { ...cur.settings, lastBackup: today } });
  toast('Copia lista');
}

export async function restoreBackup(file) {
  let data;
  try {
    data = JSON.parse(await file.text());
  } catch {
    toast('Ese archivo no es una copia de esta app.');
    return;
  }
  const err = validateBackup(data);
  if (err) {
    toast(err);
    return;
  }
  const when = data.exportedAt ? ` del ${dmy(data.exportedAt)}` : '';
  const ok = await openDialog(ConfirmDialog, {
    title: 'Recuperar copia',
    message: `Copia${when}: ${plural(data.caregivers.length, 'cuidadora')}, ${plural(data.shifts.length, 'turno')}, ${plural(data.payments.length, 'pago')}. `
      + 'Todo lo que hay ahora en este iPad se reemplaza por la copia. ¿Seguro?',
    ok: 'Sí, recuperar', danger: true,
  });
  if (!ok) return;
  const { exportedAt, ...rest } = data;
  await setState({ ...rest, version: SCHEMA_VERSION, settings: { ...rest.settings, lastBackup: exportedAt || rest.settings.lastBackup || null } });
  toast('Copia recuperada');
}
