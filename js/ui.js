// Small helpers that build pieces of the interface.
import { auth } from './auth.js';

export const esc = s => String(s ?? '').replace(/[&<>"']/g, c =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export function fmtDuration(sec) {
  sec = Math.round(sec || 0);
  if (!sec) return '—';
  const h = Math.floor(sec / 3600), m = Math.round((sec % 3600) / 60);
  if (h) return m ? `${h}h ${m}m` : `${h}h`;
  return `${Math.max(1, m)} min`;
}

export function toast(msg, type = '') {
  const t = document.createElement('div');
  t.className = 'toast ' + type;
  t.textContent = msg;
  document.getElementById('toasts').appendChild(t);
  setTimeout(() => t.remove(), 3400);
}

export const logo = () => '<span class="lg-g">Golpo</span><span class="lg-t">Tune</span>';

const GRADS = {
  horror: ['#3a0d1f', '#b02a52'], thriller: ['#0f2027', '#2c7a96'], mystery: ['#1f1c3a', '#6d5bb5'],
  romance: ['#5b1a3a', '#ff6b9d'], fantasy: ['#1d2b64', '#9a5cf0'], fiction: ['#134e5e', '#71b280'],
  adventure: ['#7a3e00', '#f2a65a'], drama: ['#3a1c71', '#d76d77'], biography: ['#2b2d34', '#8a93ad'],
};
export const gradFor = slug => {
  const g = GRADS[slug] || ['#12303a', '#2a7f8c'];
  return `linear-gradient(145deg,${g[0]},${g[1]})`;
};

const ICON = {
  heart: '<svg viewBox="0 0 24 24"><path d="M12 21s-8-5.2-9.5-10.3C1.6 7.6 3.5 5 6.4 5c1.9 0 3.4 1 4.1 2.2h3C14.2 6 15.7 5 17.6 5c2.9 0 4.8 2.6 3.9 5.7C20 15.8 12 21 12 21z" stroke-linejoin="round"/></svg>',
  play: '<svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>',
  home: '<svg viewBox="0 0 24 24"><path d="M3 11l9-8 9 8v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/></svg>',
  browse: '<svg viewBox="0 0 24 24"><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></svg>',
  library: '<svg viewBox="0 0 24 24"><path d="M4 4v16M9 4v16M14 6l5 14"/></svg>',
  user: '<svg viewBox="0 0 24 24"><circle cx="12" cy="8" r="4"/><path d="M4 21c1-4 4-6 8-6s7 2 8 6"/></svg>',
};

export const cover = s => `
  <div class="cover" style="--g:${gradFor(s.category?.slug)}">
    ${s.cover_url ? `<img class="cover-img" src="${esc(s.cover_url)}" alt="" loading="lazy">` : ''}
    <span class="ph" aria-hidden="true">${esc((s.title || '?').trim().charAt(0))}</span>
  </div>`;

export const badge = s =>
  `<span class="badge ${s.access === 'premium' ? 'premium' : 'free'}">${s.access === 'premium' ? 'Premium' : 'Free'}</span>`;

export const favBtn = s =>
  `<button class="icon-btn fav" data-fav="${esc(s.id)}" aria-pressed="${auth.favs.has(s.id)}" aria-label="Favourite ${esc(s.title)}">${ICON.heart}</button>`;

export function storyCard(s, { pct = null } = {}) {
  const href = `#/story/${encodeURIComponent(s.slug)}`;
  return `
  <article class="card">
    <div class="card-media">
      <a href="${href}" tabindex="-1" aria-hidden="true">${cover(s)}</a>
      ${badge(s)}${favBtn(s)}
      <a class="play-fab" href="${href}" aria-label="Open ${esc(s.title)}">${ICON.play}</a>
    </div>
    <a class="card-title" href="${href}">${esc(s.title)}</a>
    <div class="card-meta">${esc(s.category?.name || 'Story')} · ${fmtDuration(s.duration_seconds)}</div>
    ${pct !== null ? `<div class="bar"><i style="width:${pct}%"></i></div>` : ''}
  </article>`;
}

export const sectionRow = (title, cardsHTML) => `
  <section class="section">
    <div class="section-head"><h2>${esc(title)}</h2></div>
    <div class="row">${cardsHTML}</div>
  </section>`;

export const emptyState = (title, text, actionHTML = '') =>
  `<div class="empty"><h2>${esc(title)}</h2><p>${esc(text)}</p>${actionHTML}</div>`;

export const errorState = err =>
  emptyState('Something went wrong', (err && err.message) || 'Please try again.',
    '<button class="btn btn-primary" data-retry>Try again</button>');

export const skeletonHome = () => `
  <div class="skel skel-hero"></div>
  <div class="skel-row"><div class="skel"></div><div class="skel"></div><div class="skel"></div><div class="skel"></div></div>
  <div class="skel-row"><div class="skel"></div><div class="skel"></div><div class="skel"></div><div class="skel"></div></div>`;

export const skeletonGrid = () =>
  `<div class="grid">${'<div class="skel" style="aspect-ratio:1"></div>'.repeat(8)}</div>`;

// top bar + mobile bottom bar
export function renderChrome(name) {
  document.body.classList.toggle('focus', name === 'signup');
  const initial = esc((auth.profile?.display_name || auth.user?.email || '?').charAt(0).toUpperCase());
  const links = [['#/', 'Home', 'home'], ['#/browse', 'Browse', 'browse'], ['#/library', 'Library', 'library']];
  document.getElementById('topbar').innerHTML = `
    <a class="logo" href="#/" aria-label="GolpoTune home">${logo()}</a>
    <nav class="topnav" aria-label="Main">
      ${links.map(([h, t, k]) => `<a href="${h}" class="${name === k ? 'on' : ''}">${t}</a>`).join('')}
    </nav>
    <div class="top-actions">
      ${auth.user
        ? `<a class="avatar" href="#/account" aria-label="My account">${initial}</a>`
        : `<a class="btn btn-ghost btn-sm" href="#/login">Log in</a><a class="btn btn-primary btn-sm" href="#/signup">Sign up</a>`}
    </div>`;
  const tabs = [...links.map(([h, t, k]) => [h, t, k]),
    auth.user ? ['#/account', 'Account', 'account'] : ['#/login', 'Log in', 'login']];
  document.getElementById('bottomnav').innerHTML = tabs.map(([h, t, k]) =>
    `<a href="${h}" class="${name === k ? 'on' : ''}">${ICON[k === 'account' || k === 'login' ? 'user' : k]}<span>${t}</span></a>`).join('');
}
