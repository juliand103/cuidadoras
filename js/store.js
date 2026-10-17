// Estado de la app guardado en el iPad (IndexedDB). Cada cambio se guarda al instante.

import { useEffect, useState } from './vendor/preact-htm.js';
import { SCHEMA_VERSION, paidChanges, seedState } from './model.js';
import { todayISO } from './dates.js';

const DB_NAME = 'cuidadoras';
const STORE = 'kv';
const KEY = 'state';

let db = null;
let state = null;
const listeners = new Set();

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function idb(mode, fn) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    const req = fn(tx.objectStore(STORE));
    tx.oncomplete = () => resolve(req.result);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

async function readSaved() {
  try {
    db = await openDB();
    return await idb('readonly', (s) => s.get(KEY));
  } catch (e) {
    db = null;
    try {
      const raw = localStorage.getItem('cuidadoras-state');
      return raw ? JSON.parse(raw) : undefined;
    } catch {
      return undefined;
    }
  }
}

let writing = Promise.resolve();
function save(snapshot) {
  writing = writing.then(async () => {
    try {
      if (db) await idb('readwrite', (s) => s.put(snapshot, KEY));
      else localStorage.setItem('cuidadoras-state', JSON.stringify(snapshot));
    } catch (e) {
      console.error('No se pudo guardar', e);
      toast('No se pudo guardar el último cambio. Probá de nuevo.');
    }
  });
  return writing;
}

function migrate(s) {
  // Lugar para futuras migraciones de formato.
  return { ...s, version: SCHEMA_VERSION };
}

export async function loadState() {
  const saved = await readSaved();
  if (saved) {
    state = migrate(saved);
  } else {
    state = seedState(todayISO());
    await save(state);
  }
  try {
    await navigator.storage?.persist?.();
  } catch {}
  return state;
}

export function getState() {
  return state;
}

export function setState(next) {
  state = next;
  listeners.forEach((f) => f());
  return save(state);
}

// Guarda un cambio; si cambia lo ganado en un mes ya pagado, pregunta antes.
export async function commit(next, { describe } = {}) {
  const changes = paidChanges(state, next);
  if (changes.length) {
    const ok = await openDialog(PaidConfirm.component, { changes, describe });
    if (!ok) return false;
  }
  await setState(next);
  return true;
}

// Se completa desde ui/common.js para no crear una dependencia circular.
export const PaidConfirm = { component: null };

export function useStore() {
  const [, force] = useState(0);
  useEffect(() => {
    const f = () => force((n) => n + 1);
    listeners.add(f);
    return () => listeners.delete(f);
  }, []);
  return state;
}

// ---------- Diálogos y avisos

let dialogs = [];
let toastMsg = null;
let toastTimer = null;
let seq = 0;
const uiListeners = new Set();
const emitUI = () => uiListeners.forEach((f) => f());

export function openDialog(Comp, props = {}) {
  return new Promise((resolve) => {
    dialogs = [...dialogs, { id: ++seq, Comp, props, resolve }];
    emitUI();
  });
}

export function closeDialog(id, result) {
  const d = dialogs.find((x) => x.id === id);
  dialogs = dialogs.filter((x) => x.id !== id);
  emitUI();
  d?.resolve(result);
}

export function toast(msg) {
  toastMsg = msg;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toastMsg = null;
    emitUI();
  }, 2800);
  emitUI();
}

export function useUI() {
  const [, force] = useState(0);
  useEffect(() => {
    const f = () => force((n) => n + 1);
    uiListeners.add(f);
    return () => uiListeners.delete(f);
  }, []);
  return { dialogs, toast: toastMsg };
}

// ---------- Rutas (#/pantalla/…)

const routeListeners = new Set();
window.addEventListener('hashchange', () => {
  // Cambiar de pantalla cierra cualquier ventana abierta.
  if (dialogs.length) {
    const open = dialogs;
    dialogs = [];
    emitUI();
    open.forEach((d) => d.resolve(undefined));
  }
  routeListeners.forEach((f) => f());
});

export function parseRoute() {
  const parts = (location.hash || '').replace(/^#\/?/, '').split('/').filter(Boolean);
  return { screen: parts[0] || 'resumen', args: parts.slice(1) };
}

export function go(path, { replace = false } = {}) {
  const h = '#/' + path;
  if (replace) history.replaceState(null, '', h);
  else location.hash = h;
  if (replace) routeListeners.forEach((f) => f());
}

export function useRoute() {
  const [r, setR] = useState(parseRoute);
  useEffect(() => {
    const f = () => setR(parseRoute());
    routeListeners.add(f);
    return () => routeListeners.delete(f);
  }, []);
  return r;
}
