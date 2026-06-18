// Hash router: each station is a module exporting `mount(container) => cleanup`.
// On hashchange we tear down the previous station and mount the next one.

type MountFn = (container: HTMLElement) => void | (() => void);

const STATIONS: { id: string; label: string; load: () => Promise<{ mount: MountFn }> }[] = [
  { id: '00-render-loop', label: '00 · render loop', load: () => import('./stations/00-render-loop') },
  { id: '01-manifold', label: '01 · manifold', load: () => import('./stations/01-manifold') },
  { id: '02-gltf', label: '02 · glTF', load: () => import('./stations/02-gltf') },
  { id: '03-sdf', label: '03 · sdf', load: () => import('./stations/03-sdf') },
  { id: '04-motion', label: '04 · motion', load: () => import('./stations/04-motion') },
  { id: '05-physics', label: '05 · physics', load: () => import('./stations/05-physics') },
];

const app = document.getElementById('app') as HTMLElement;
const nav = document.getElementById('nav') as HTMLElement;

for (const s of STATIONS) {
  const a = document.createElement('a');
  a.href = `#${s.id}`;
  a.textContent = s.label;
  a.dataset.id = s.id;
  nav.appendChild(a);
}

let cleanup: (() => void) | null = null;
let token = 0;

function currentId(): string {
  const id = location.hash.replace(/^#/, '');
  return STATIONS.some((s) => s.id === id) ? id : STATIONS[0].id;
}

async function route() {
  const id = currentId();
  const myToken = ++token;

  // tear down previous station
  if (cleanup) {
    try { cleanup(); } catch (err) { console.error('cleanup failed', err); }
    cleanup = null;
  }
  app.replaceChildren();

  // highlight active nav item
  nav.querySelectorAll('a').forEach((a) => {
    a.classList.toggle('active', (a as HTMLAnchorElement).dataset.id === id);
  });

  const station = STATIONS.find((s) => s.id === id)!;
  try {
    const mod = await station.load();
    if (myToken !== token) return; // a newer route() superseded us
    const result = mod.mount(app);
    cleanup = typeof result === 'function' ? result : null;
  } catch (err) {
    console.error(`station "${id}" failed to mount`, err);
    if (myToken === token) showError(id, err);
  }
}

function showError(id: string, err: unknown) {
  const div = document.createElement('div');
  div.className = 'station-message';
  div.innerHTML = `<h1>💥 station "${id}" crashed</h1><p>${String(err)}</p><p>See console for details.</p>`;
  app.appendChild(div);
}

window.addEventListener('hashchange', route);
route();
