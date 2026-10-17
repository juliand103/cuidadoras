import { html, render } from './vendor/preact-htm.js';
import { closeDialog, loadState, useRoute, useStore, useUI } from './store.js';
import { Rail } from './ui/common.js';
import { Resumen } from './ui/resumen.js';
import { Pagos } from './ui/pagos.js';
import { Calendario } from './ui/calendario.js';
import { Semana } from './ui/semana.js';
import { Config } from './ui/config.js';

const SCREENS = { resumen: Resumen, pagos: Pagos, calendario: Calendario, semana: Semana, config: Config };

function App() {
  useStore();
  const route = useRoute();
  const ui = useUI();
  const Screen = SCREENS[route.screen] || Resumen;
  return html`
    <div class="app">
      <${Rail} screen=${route.screen} />
      <${Screen} args=${route.args} />
    </div>
    ${ui.dialogs.map((d) => html`<${d.Comp} key=${d.id} ...${d.props} close=${(r) => closeDialog(d.id, r)} />`)}
    ${ui.toast && html`<div class="toast" role="status">${ui.toast}</div>`}
  `;
}

loadState()
  .then(() => render(html`<${App} />`, document.getElementById('app')))
  .catch((e) => {
    console.error(e);
    document.getElementById('app').innerHTML =
      '<div class="loading">No se pudo abrir la app. Cerrala y volvé a abrirla.</div>';
  });

// En la compu de desarrollo no se usa el modo offline (salvo con ?sw), así los cambios se ven al instante.
const dev = ['localhost', '127.0.0.1'].includes(location.hostname) && !new URLSearchParams(location.search).has('sw');
if ('serviceWorker' in navigator && location.protocol !== 'file:' && !dev) {
  navigator.serviceWorker.register('sw.js').catch((e) => console.warn('Sin modo offline', e));
}
