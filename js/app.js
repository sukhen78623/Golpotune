// GolpoTune - app start-up and page router.
import { configured } from './supabase.js';
import { initAuth, onAuth, auth } from './auth.js';
import { toggleFavourite } from './api.js';
import { renderChrome, toast, emptyState } from './ui.js';
import { home } from './views/home.js';
import { browse } from './views/browse.js';
import { story } from './views/story.js';
import { login, signup, forgot, reset } from './views/auth.js';
import { library, account } from './views/me.js';

const routes = [
  [/^$/, 'home', home],
  [/^browse(?:\/([\w-]+))?$/, 'browse', browse],
  [/^story\/([^/]+)$/, 'browse', story],
  [/^library$/, 'library', library],
  [/^account$/, 'account', account],
  [/^login$/, 'login', login],
  [/^signup$/, 'login', signup],
  [/^forgot$/, 'login', forgot],
  [/^reset$/, 'login', reset],
];

const root = document.getElementById('app');
let token = 0;

async function route() {
  const mine = ++token;
  const ctx = { stale: () => mine !== token };
  let path = location.hash.replace(/^#\/?/, '').split('?')[0];
  if (path.includes('=')) path = ''; // Supabase email links put tokens in the address
  for (const [re, name, view] of routes) {
    const m = path.match(re);
    if (m) {
      renderChrome(name);
      window.scrollTo(0, 0);
      await view(root, m.slice(1), ctx);
      return;
    }
  }
  renderChrome('');
  root.innerHTML = emptyState('Page not found', 'That page does not exist.', '<a class="btn btn-primary" href="#/">Go home</a>');
}

// favourite hearts + retry buttons work everywhere
document.addEventListener('click', async e => {
  const fav = e.target.closest('[data-fav]');
  if (fav) {
    e.preventDefault(); e.stopPropagation();
    if (!auth.user) { toast('Log in to save favourites'); location.hash = '#/login'; return; }
    const id = fav.dataset.fav;
    const buttons = document.querySelectorAll(`[data-fav="${CSS.escape(id)}"]`);
    buttons.forEach(b => (b.disabled = true));
    try {
      const on = await toggleFavourite(id);
      buttons.forEach(b => b.setAttribute('aria-pressed', on));
      toast(on ? 'Added to favourites' : 'Removed from favourites');
    } catch (err) {
      toast(err.message || 'Could not update favourite', 'err');
    } finally { buttons.forEach(b => (b.disabled = false)); }
    return;
  }
  if (e.target.closest('[data-retry]')) route();
});

// if a cover image fails to load, the coloured placeholder shows instead
document.addEventListener('error', e => {
  if (e.target.tagName === 'IMG' && e.target.classList.contains('cover-img')) e.target.remove();
}, true);

async function start() {
  if (!configured) {
    renderChrome('');
    root.innerHTML = `<div class="auth-card"><h1>Almost ready</h1>
      <p class="sub">GolpoTune is not connected to Supabase yet. Open <b>js/config.js</b>, paste your Supabase Project URL and anon key, then upload the site again.</p></div>`;
    return;
  }
  try { await initAuth(); } catch (e) { console.error(e); }
  onAuth(() => route());
  window.addEventListener('hashchange', route);
  route();
}
start();
