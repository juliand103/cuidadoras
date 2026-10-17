# Cuidadoras

Offline iPad web app for working out the caregivers' pay: shifts, holidays ×2, vacations, aguinaldo, payments and saldos. The UI is in Spanish (Argentina).

The published app holds no personal data and starts empty. The real starting data (caregivers, prices, weekly rotation) and the design notes live only on the developer's computer, in `privado/` and `brainstorms/`, which are git-ignored.

No build step and no dependencies: plain HTML, CSS and ES modules, with Preact + htm and the Atkinson Hyperlegible Next font bundled. Data lives only on the iPad (IndexedDB).

## Run it on the computer

```bash
npm start
```

Open http://localhost:5173. Add `?hoy=2026-12-18` to the address to pretend it's another day. Offline mode is off on localhost unless you add `?sw`.

```bash
npm test
```

## Put it on the iPad

1. Publish this folder as a static site, for example on GitHub Pages: create a repository, push this folder, then go to Settings › Pages › Deploy from branch `main` / root.
2. On the iPad, open the site's address in **Safari**, tap Share › **Add to Home Screen**, and open the new **Cuidadoras** icon once while connected to the internet.
3. From then on, use only the Home Screen icon. It works without internet. Data saved there is separate from Safari's, so don't load data in a Safari tab.
4. Load the starting data once: run `node privado/datos-iniciales.js` on the computer, send `privado/cuidadoras-datos-iniciales.json` to the iPad (WhatsApp or AirDrop › save to Files), then in the app go to Configuración › Copia de seguridad › **Recuperar copia** and pick that file.

**Never change the site's address.** The iPad ties the data to it, so a new address opens an empty app. If it has to change, make a backup first and restore it in the new one.

## Publish an update

Bump `VERSION` in [sw.js](sw.js) (e.g. `v1` → `v2`) and publish. The iPad picks it up the next time the app is opened with internet (sometimes it takes two openings). Data is untouched.

## Backups

Configuración › Copia de seguridad › **Hacer copia** produces a `.json` file to send by WhatsApp or save in iCloud. **Recuperar copia** loads it back and replaces everything on the iPad. Resumen shows a reminder when the last copy is more than 30 days old.

## Files

- `js/model.js`: pay rules and calculations (tested in `tests/model.test.js`)
- `js/store.js`: storage, dialogs, routes
- `js/ui/*.js`: screens (Resumen, Calendario, Cargar semana, Pagos, Configuración)
- `js/share.js`: summary image / PDF for WhatsApp
- `tools/make-icons.js`: regenerates the Home Screen icons
