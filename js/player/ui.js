// Mini player (bottom bar) + full-screen player with 4 tabs.
import { auth } from '../auth.js';
import * as api from '../api.js';
import { esc, cover, badge, toast, fmtDuration, storyCard, sectionRow, ICON } from '../ui.js';
import { buildRecs } from './recs.js';
import {
  audio, player, SPEEDS, subscribe, currentChapter, duration, togglePlay, seek, skip, next, prev,
  jumpToChapter, closePlayer, setSpeed, setVolume, setSleep, setAutoplayNext, setAutoplayRec,
} from './engine.js';

const $ = s => document.querySelector(s);
const S = p => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${p}</svg>`;
const I = {
  play: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5v14l11-7z"/></svg>',
  pause: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M7 5h4v14H7zM13 5h4v14h-4z"/></svg>',
  prev: S('<path d="M6 5v14M19 5L9 12l10 7z"/>'),
  next: S('<path d="M18 5v14M5 5l10 7-10 7z"/>'),
  rew: S('<polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/><text x="12" y="15" text-anchor="middle" font-size="7" font-weight="700" fill="currentColor" stroke="none">10</text>'),
  fwd: S('<polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.13-9.36L23 10"/><text x="12" y="15" text-anchor="middle" font-size="7" font-weight="700" fill="currentColor" stroke="none">30</text>'),
  down: S('<path d="M6 9l6 6 6-6"/>'),
  up: S('<path d="M6 15l6-6 6 6"/>'),
  share: S('<path d="M12 3v12M7 8l5-5 5 5M5 14v6h14v-6"/>'),
  plus: S('<path d="M4 6h11M4 12h7M4 18h7M18 12v8M14 16h8"/>'),
  moon: S('<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/>'),
  vol: S('<path d="M4 9v6h4l5 4V5L8 9z"/><path d="M16.5 8.5a5 5 0 0 1 0 7"/>'),
  mark: S('<path d="M6 3h12v18l-6-4-6 4z"/>'),
  x: S('<path d="M6 6l12 12M18 6L6 18"/>'),
};

const fmt = t => {
  t = Math.max(0, Math.floor(t || 0));
  const h = Math.floor(t / 3600), m = Math.floor(t % 3600 / 60), s = t % 60;
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`;
};

const TABS = [['now', 'Now Playing'], ['chapters', 'Chapters'], ['recs', 'Stories You May Like'], ['about', 'About Story']];
let mini, full, tab = 'now', open = false, dragging = false, bookmarks = [], bookmarksFor = null;

export function initPlayerUI() {
  mini = $('#miniplayer');
  full = $('#fullplayer');
  subscribe(kind => {
    if (kind === 'track') onTrack();
    else if (kind === 'state') onState();
    else if (kind === 'time') onTime();
    else if (kind === 'settings') onSettings();
    else if (kind === 'sleep') onSleep();
  });
  bindEvents();
}

/* ---------------- mini player ---------------- */
function thumb(s) {
  return `<div class="mp-cover">${cover(s)}</div>`;
}
function miniHTML() {
  const s = player.story, ch = currentChapter();
  return `
  <div class="mp-prog" aria-hidden="true"><i id="mp-bar"></i></div>
  <div class="mp-info" data-open-full role="button" tabindex="0" aria-label="Open full player">
    ${thumb(s)}
    <div class="mp-text"><b>${esc(ch?.title || s.title)}</b><span>${esc(s.title)}</span></div>
  </div>
  <div class="mp-center">
    <div class="mp-btns">
      <button class="pbtn sm hide-m" data-act="prev" aria-label="Previous chapter">${I.prev}</button>
      <button class="pbtn sm hide-m" data-act="rew" aria-label="Back 10 seconds">${I.rew}</button>
      <button class="pbtn play" data-act="toggle" aria-label="Play"></button>
      <button class="pbtn sm hide-m" data-act="fwd" aria-label="Forward 30 seconds">${I.fwd}</button>
      <button class="pbtn sm hide-m" data-act="next" aria-label="Next chapter">${I.next}</button>
    </div>
    <div class="mp-seekrow hide-m">
      <span id="mp-cur">0:00</span>
      <input type="range" class="seek" id="mp-seek" min="0" max="1000" value="0" aria-label="Seek">
      <span id="mp-dur">0:00</span>
    </div>
  </div>
  <div class="mp-right hide-m">
    <button class="chipbtn" data-act="speed" id="mp-speed" aria-label="Playback speed">1x</button>
    <label class="vol" aria-label="Volume">${I.vol}<input type="range" class="volrange" min="0" max="1" step="0.05" aria-label="Volume"></label>
    <button class="pbtn sm" data-open-full aria-label="Open full player">${I.up}</button>
  </div>
  <button class="pbtn sm mp-x" data-act="stop" aria-label="Close player">${I.x}</button>`;
}

/* ---------------- full player ---------------- */
function fullHTML() {
  return `
  <div class="fp-inner">
    <header class="fp-top">
      <button class="pbtn sm" data-act="close" aria-label="Close player">${I.down}</button>
      <div class="fp-label">Now playing</div>
      <div class="fp-right">
        <button class="pbtn sm" data-act="share" aria-label="Share story">${I.share}</button>
        <button class="pbtn sm" data-act="stop" aria-label="Stop and close player">${I.x}</button>
      </div>
    </header>
    <div class="fp-tabs" role="tablist">
      ${TABS.map(([k, t]) => `<button class="fp-tab" role="tab" data-tab="${k}" aria-selected="${k === tab}">${t}</button>`).join('')}
    </div>
    <div class="fp-body" id="fp-body" role="tabpanel"></div>
  </div>`;
}

function nowHTML() {
  const s = player.story, ch = currentChapter();
  const by = [s.author && `Written by ${esc(s.author)}`, s.narrator && `Narrated by ${esc(s.narrator)}`].filter(Boolean).join(' · ');
  return `
  <div class="np">
    <div class="np-cover">${cover(s)}${badge(s)}</div>
    <div class="np-meta">
      <h2>${esc(s.title)}</h2>
      <div class="np-chapter">Chapter ${player.index + 1} of ${player.chapters.length} · ${esc(ch.title)}</div>
      <div class="np-by">${by}</div>
    </div>
    <div class="np-seek">
      <input type="range" class="seek" id="fp-seek" min="0" max="1000" value="0" aria-label="Seek">
      <div class="np-times"><span id="fp-cur">0:00</span><span id="fp-dur">0:00</span></div>
    </div>
    <div class="np-main">
      <button class="pbtn" data-act="prev" aria-label="Previous chapter">${I.prev}</button>
      <button class="pbtn" data-act="rew" aria-label="Back 10 seconds">${I.rew}</button>
      <button class="pbtn play big" data-act="toggle" aria-label="Play"></button>
      <button class="pbtn" data-act="fwd" aria-label="Forward 30 seconds">${I.fwd}</button>
      <button class="pbtn" data-act="next" aria-label="Next chapter">${I.next}</button>
    </div>
    <div class="np-tools">
      <button class="tool" data-act="speed" aria-label="Playback speed"><b id="fp-speed">1x</b><span>Speed</span></button>
      <button class="tool" data-act="sleep" aria-label="Sleep timer">${I.moon}<span id="fp-sleep">Sleep</span></button>
      <button class="tool fav" data-fav="${esc(s.id)}" aria-pressed="${auth.favs.has(s.id)}" aria-label="Favourite">${ICON.heart}<span>Favourite</span></button>
      <button class="tool" data-act="playlist" aria-label="Add to playlist">${I.plus}<span>Playlist</span></button>
      <button class="tool" data-act="bookmark" aria-label="Add bookmark">${I.mark}<span>Bookmark</span></button>
    </div>
    <label class="np-vol">${I.vol}<input type="range" class="volrange" min="0" max="1" step="0.05" aria-label="Volume"></label>
    <section class="np-bookmarks">
      <h3>Bookmarks &amp; notes</h3>
      <div id="np-bm"></div>
    </section>
  </div>`;
}

function chaptersHTML() {
  return `
  <label class="switch"><input type="checkbox" data-toggle="autoplayNext" ${player.autoplayNext ? 'checked' : ''}><span></span>Play the next chapter automatically</label>
  <ol class="chlist">
    ${player.chapters.map((c, i) => `
      <li><button class="chap ${i === player.index ? 'on' : ''}" data-chapter="${i}" ${i === player.index ? 'aria-current="true"' : ''}>
        <span class="num">${i === player.index ? (player.playing ? '<span class="eq"><i></i><i></i><i></i></span>' : '▶') : c.chapter_number}</span>
        <span class="ct">${esc(c.title)}</span><span class="dur">${fmtDuration(c.duration_seconds)}</span>
      </button></li>`).join('')}
  </ol>`;
}

function aboutHTML() {
  const s = player.story;
  const row = (k, v) => v ? `<div class="kv"><span>${k}</span><span>${v}</span></div>` : '';
  return `
  <div class="about">
    <p class="desc">${esc(s.description || 'No description yet.')}</p>
    ${row('Written by', esc(s.author))}
    ${row('Narrated by', esc(s.narrator))}
    ${row('Category', esc(s.category?.name))}
    ${row('Length', fmtDuration(s.duration_seconds))}
    ${row('Chapters', String(player.chapters.length))}
    ${row('Access', s.access === 'premium' ? '<span class="pill premium">Premium</span>' : '<span class="pill free">Free</span>')}
    ${(s.themes || []).length ? `<div class="themes">${s.themes.map(t => `<span class="chip">${esc(t)}</span>`).join('')}</div>` : ''}
    <a class="btn btn-sm" href="#/story/${encodeURIComponent(s.slug)}" style="margin-top:16px">Open story page</a>
  </div>`;
}

async function renderRecs() {
  const body = $('#fp-body');
  const story = player.story;
  body.innerHTML = '<div class="skel" style="height:140px;margin:8px 0"></div><div class="skel-row"><div class="skel"></div><div class="skel"></div><div class="skel"></div></div>';
  try {
    const [data, cont] = await Promise.all([api.getRecommendationData(), auth.user ? api.getContinueListening() : []]);
    if (!open || tab !== 'recs' || player.story?.id !== story.id) return;
    const r = buildRecs(story, data, [...auth.favs]);
    const row = (title, list) => list.length ? sectionRow(title, list.map(s => storyCard(s)).join('')) : '';
    const others = cont.filter(c => c.story.id !== story.id);
    let h = '<h2 class="fp-h">Stories You May Like</h2>';
    if (r.next) {
      h += `
      <div class="up-next">
        <div class="eyebrow">Next recommended story</div>
        <div class="up-row">
          <div class="up-cover">${cover(r.next)}</div>
          <div class="up-info"><b>${esc(r.next.title)}</b>
            <span>${esc(r.next.category?.name || '')} · ${fmtDuration(r.next.duration_seconds)}</span>
            <button class="btn btn-primary btn-sm" data-play="${esc(r.next.id)}">Play next</button></div>
        </div>
        <label class="switch"><input type="checkbox" data-toggle="autoplayRec" ${player.autoplayRec ? 'checked' : ''}><span></span>Autoplay recommended stories when this one ends</label>
      </div>`;
    }
    h += row('Stories You May Like', r.forYou);
    if (r.because) h += row(`Because You Listened To ${r.because.story.title}`, r.because.items);
    if (others.length) h += sectionRow('Continue Listening', others.map(c => storyCard(c.story, { pct: c.pct })).join(''));
    h += row(`More From ${story.category?.name || 'This Category'}`, r.sameCat);
    h += row('Trending Now', r.trending);
    if (!r.forYou.length && !r.sameCat.length && !r.trending.length) {
      h += '<p class="muted">More stories will show up here as new ones are published.</p>';
    }
    $('#fp-body').innerHTML = h;
  } catch {
    if (open && tab === 'recs') $('#fp-body').innerHTML = '<p class="notice">Could not load recommendations. Please try again later.</p>';
  }
}

function renderPanel() {
  const body = $('#fp-body');
  if (!body || !player.story) return;
  full.querySelectorAll('.fp-tab').forEach(b => b.setAttribute('aria-selected', String(b.dataset.tab === tab)));
  if (tab === 'now') {
    body.innerHTML = nowHTML();
    renderBookmarkList();
    onState(); onTime(); onSettings(); onSleep();
  } else if (tab === 'chapters') body.innerHTML = chaptersHTML();
  else if (tab === 'recs') renderRecs();
  else body.innerHTML = aboutHTML();
}

/* ---------------- live updates ---------------- */
function onTrack() {
  const has = !!player.story;
  mini.hidden = !has;
  document.body.classList.toggle('has-player', has);
  if (!has) { mini.innerHTML = ''; closeFull(true); return; }
  mini.innerHTML = miniHTML();
  if (player.story.id !== bookmarksFor) loadBookmarks();
  onState(); onTime(); onSettings();
  if (open) renderPanel();
}

function playIcon() {
  if (!player.playing && (player.loading || player.buffering)) return '<span class="spin" aria-hidden="true"></span>';
  return player.playing ? I.pause : I.play;
}
function onState() {
  document.querySelectorAll('[data-act="toggle"]').forEach(b => {
    b.innerHTML = playIcon();
    b.setAttribute('aria-label', player.playing ? 'Pause' : 'Play');
  });
  if (open && tab === 'chapters') $('#fp-body').innerHTML = chaptersHTML();
}

function setRange(el, frac) {
  if (!el) return;
  el.value = Math.round(frac * 1000);
  el.style.setProperty('--p', (frac * 100) + '%');
}
function onTime() {
  if (!player.story) return;
  const d = duration(), t = audio.currentTime || 0, frac = d ? Math.min(1, t / d) : 0;
  const bar = $('#mp-bar');
  if (bar) bar.style.width = (frac * 100) + '%';
  if (!dragging) {
    setRange($('#mp-seek'), frac);
    setRange($('#fp-seek'), frac);
    const a = $('#mp-cur'), b = $('#fp-cur');
    if (a) a.textContent = fmt(t);
    if (b) b.textContent = fmt(t);
  }
  const d1 = $('#mp-dur'), d2 = $('#fp-dur');
  if (d1) d1.textContent = fmt(d);
  if (d2) d2.textContent = fmt(d);
  if (player.sleepMode) onSleep();
}

function onSettings() {
  const label = player.speed + 'x';
  const a = $('#mp-speed'), b = $('#fp-speed');
  if (a) a.textContent = label;
  if (b) b.textContent = label;
  document.querySelectorAll('.volrange').forEach(v => { v.value = player.volume; });
  document.querySelectorAll('[data-toggle="autoplayNext"]').forEach(c => { c.checked = player.autoplayNext; });
  document.querySelectorAll('[data-toggle="autoplayRec"]').forEach(c => { c.checked = player.autoplayRec; });
}

function onSleep() {
  const el = $('#fp-sleep');
  if (!el) return;
  if (!player.sleepMode) el.textContent = 'Sleep';
  else if (player.sleepMode === 'chapter') el.textContent = 'End of chapter';
  else el.textContent = Math.max(1, Math.ceil((player.sleepEndsAt - Date.now()) / 60000)) + ' min left';
}

/* ---------------- open / close ---------------- */
function openFull() {
  if (!player.story || open) return;
  open = true;
  tab = 'now';
  full.innerHTML = fullHTML();
  full.hidden = false;
  document.body.classList.add('fp-open');
  history.pushState({ gtPlayer: true }, '');
  renderPanel();
  full.querySelector('[data-act="close"]')?.focus();
}
function closeFull(silent = false) {
  if (!open) return;
  open = false;
  full.hidden = true;
  document.body.classList.remove('fp-open');
  closeSheet();
  if (!silent && history.state?.gtPlayer) history.back();
}

/* ---------------- bottom sheets ---------------- */
function closeSheet() { document.querySelector('.sheet-wrap')?.remove(); }
function openSheet(title, html, onMount) {
  closeSheet();
  const el = document.createElement('div');
  el.className = 'sheet-wrap';
  el.innerHTML = `<div class="sheet-bg" data-sheet-close></div>
    <div class="sheet" role="dialog" aria-modal="true" aria-label="${esc(title)}">
      <div class="sheet-head"><h3>${esc(title)}</h3><button class="pbtn sm" data-sheet-close aria-label="Close">${I.x}</button></div>
      <div class="sheet-body">${html}</div></div>`;
  document.body.appendChild(el);
  requestAnimationFrame(() => el.classList.add('open'));
  onMount?.(el.querySelector('.sheet-body'));
}

function speedSheet() {
  openSheet('Playback speed', SPEEDS.map(v =>
    `<button class="opt ${v === player.speed ? 'on' : ''}" data-speed="${v}">${v}x${v === 1 ? ' (Normal)' : ''}<span>${v === player.speed ? '✓' : ''}</span></button>`).join(''),
  body => body.addEventListener('click', e => {
    const b = e.target.closest('[data-speed]');
    if (b) { setSpeed(Number(b.dataset.speed)); closeSheet(); }
  }));
}

function sleepSheet() {
  const opts = [['off', 'Off'], [15, '15 minutes'], [30, '30 minutes'], [45, '45 minutes'], [60, '60 minutes'], ['chapter', 'End of this chapter']];
  openSheet('Sleep timer', opts.map(([v, t]) =>
    `<button class="opt ${player.sleepMode === v || (v === 'off' && !player.sleepMode) ? 'on' : ''}" data-sleep="${v}">${t}</button>`).join('') +
    `<form class="sheet-form" id="sleepForm"><input name="mins" type="number" min="1" max="600" inputmode="numeric" placeholder="Custom minutes" aria-label="Custom minutes" required><button class="btn btn-primary btn-sm">Set</button></form>`,
  body => {
    body.addEventListener('click', e => {
      const b = e.target.closest('[data-sleep]');
      if (!b) return;
      const v = b.dataset.sleep;
      setSleep(v === 'off' || v === 'chapter' ? v : Number(v));
      toast(v === 'off' ? 'Sleep timer off' : 'Sleep timer set');
      closeSheet();
    });
    body.addEventListener('submit', e => {
      e.preventDefault();
      const m = Number(new FormData(e.target).get('mins'));
      if (m >= 1 && m <= 600) { setSleep(m); toast(`Sleep timer set for ${m} minutes`); closeSheet(); }
    });
  });
}

function playlistSheet() {
  if (!auth.user) { toast('Log in to use playlists'); return; }
  openSheet('Add to playlist', '<p class="muted">Loading…</p>', async body => {
    const render = async () => {
      try {
        const lists = await api.getPlaylists();
        body.innerHTML = (lists.length ? lists.map(l => {
          const has = l.playlist_items.some(i => i.story_id === player.story.id);
          return `<button class="opt ${has ? 'on' : ''}" data-pl="${l.id}" ${has ? 'disabled' : ''}>${esc(l.name)}<span>${has ? 'Added ✓' : l.playlist_items.length + ' stories'}</span></button>`;
        }).join('') : '<p class="muted">You have no playlists yet. Create your first one:</p>') +
        '<form class="sheet-form"><input name="name" maxlength="60" placeholder="New playlist name" aria-label="New playlist name" required><button class="btn btn-primary btn-sm">Create &amp; add</button></form>';
      } catch { body.innerHTML = '<p class="muted">Could not load playlists.</p>'; }
    };
    await render();
    body.addEventListener('click', async e => {
      const b = e.target.closest('[data-pl]');
      if (!b) return;
      try { await api.addToPlaylist(b.dataset.pl, player.story.id); toast('Added to playlist'); closeSheet(); }
      catch (err) { toast(err.message || 'Could not add', 'err'); }
    });
    body.addEventListener('submit', async e => {
      e.preventDefault();
      const name = String(new FormData(e.target).get('name') || '').trim();
      if (!name) return;
      try {
        const p = await api.createPlaylist(name);
        await api.addToPlaylist(p.id, player.story.id);
        toast(`Added to "${name}"`);
        closeSheet();
      } catch (err) { toast(err.message || 'Could not create playlist', 'err'); }
    });
  });
}

/* ---------------- bookmarks ---------------- */
function loadBookmarks() {
  const id = player.story.id;
  bookmarksFor = id;
  bookmarks = [];
  if (!auth.user) return;
  api.getBookmarks(id).then(list => {
    if (bookmarksFor !== id) return;
    bookmarks = list;
    renderBookmarkList();
  }).catch(() => {});
}
function renderBookmarkList() {
  const el = $('#np-bm');
  if (!el) return;
  if (!auth.user) { el.innerHTML = '<p class="muted">Log in to save bookmarks and notes.</p>'; return; }
  if (!bookmarks.length) { el.innerHTML = '<p class="muted">No bookmarks yet. Tap Bookmark to save a favourite moment.</p>'; return; }
  el.innerHTML = bookmarks.map(b => {
    const c = player.chapters.find(x => x.id === b.chapter_id);
    return `<div class="bm"><button class="bm-go" data-bm-jump="${b.id}"><b>${esc(c ? c.title : 'Chapter')} · ${fmt(b.position_seconds)}</b>${b.note ? `<span>${esc(b.note)}</span>` : ''}</button>
      <button class="pbtn sm" data-bm-del="${b.id}" aria-label="Delete bookmark">${I.x}</button></div>`;
  }).join('');
}
function bookmarkSheet() {
  if (!auth.user) { toast('Log in to save bookmarks'); return; }
  const pos = Math.floor(audio.currentTime || 0), ch = currentChapter();
  openSheet('Save bookmark',
    `<p class="muted">${esc(ch.title)} · ${fmt(pos)}</p>
     <form class="sheet-form"><input name="note" maxlength="200" placeholder="Add a note (optional)" aria-label="Note"><button class="btn btn-primary btn-sm">Save</button></form>`,
  body => {
    body.querySelector('input').focus();
    body.addEventListener('submit', async e => {
      e.preventDefault();
      const note = String(new FormData(e.target).get('note') || '').trim();
      try {
        const b = await api.addBookmark({ story_id: player.story.id, chapter_id: ch.id, position_seconds: pos, note: note || null });
        bookmarks.unshift(b);
        toast('Bookmark saved');
        closeSheet();
        renderBookmarkList();
      } catch (err) { toast(err.message || 'Could not save bookmark', 'err'); }
    });
  });
}

async function share() {
  const s = player.story;
  if (!s) return;
  const url = `${location.origin}${location.pathname}#/story/${encodeURIComponent(s.slug)}`;
  try {
    if (navigator.share) { await navigator.share({ title: s.title, text: `Listen to "${s.title}" on GolpoTune`, url }); return; }
    await navigator.clipboard.writeText(url);
    toast('Link copied');
  } catch (e) {
    if (e.name !== 'AbortError') toast(url);
  }
}

/* ---------------- events ---------------- */
function act(name) {
  switch (name) {
    case 'toggle': togglePlay(); break;
    case 'prev': prev(); break;
    case 'next': next(); break;
    case 'rew': skip(-10); break;
    case 'fwd': skip(30); break;
    case 'close': closeFull(); break;
    case 'share': share(); break;
    case 'stop': { const wasOpen = open; closePlayer(); if (wasOpen && history.state?.gtPlayer) history.back(); break; }
    case 'speed': speedSheet(); break;
    case 'sleep': sleepSheet(); break;
    case 'playlist': playlistSheet(); break;
    case 'bookmark': bookmarkSheet(); break;
    default: break;
  }
}

function bindEvents() {
  document.addEventListener('click', async e => {
    const t = e.target;
    const a = t.closest('[data-act]');
    if (a) { act(a.dataset.act); return; }
    if (t.closest('[data-open-full]')) { openFull(); return; }
    if (t.closest('[data-sheet-close]')) { closeSheet(); return; }
    const tb = t.closest('.fp-tab');
    if (tb) { tab = tb.dataset.tab; renderPanel(); return; }
    const ch = t.closest('[data-chapter]');
    if (ch && open) { jumpToChapter(Number(ch.dataset.chapter)); return; }
    const bj = t.closest('[data-bm-jump]');
    if (bj) {
      const b = bookmarks.find(x => x.id === bj.dataset.bmJump);
      const i = b ? player.chapters.findIndex(c => c.id === b.chapter_id) : -1;
      if (i >= 0) jumpToChapter(i, b.position_seconds);
      return;
    }
    const bd = t.closest('[data-bm-del]');
    if (bd) {
      try { await api.deleteBookmark(bd.dataset.bmDel); bookmarks = bookmarks.filter(x => x.id !== bd.dataset.bmDel); renderBookmarkList(); }
      catch { toast('Could not delete bookmark', 'err'); }
      return;
    }
    if (open && t.closest('a[href^="#/"]')) closeFull(true);
  });

  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') { if (document.querySelector('.sheet-wrap')) closeSheet(); else closeFull(); }
    if ((e.key === 'Enter' || e.key === ' ') && e.target.matches?.('.mp-info')) { e.preventDefault(); openFull(); }
  });

  // seek bars + volume
  document.addEventListener('input', e => {
    const t = e.target;
    if (t.classList.contains('seek')) {
      dragging = true;
      t.style.setProperty('--p', (t.value / 10) + '%');
      const lab = $(t.id === 'fp-seek' ? '#fp-cur' : '#mp-cur');
      if (lab) lab.textContent = fmt(t.value / 1000 * duration());
    } else if (t.classList.contains('volrange')) setVolume(Number(t.value));
  });
  document.addEventListener('change', e => {
    const t = e.target;
    if (t.classList.contains('seek')) { seek(t.value / 1000 * duration()); dragging = false; }
    else if (t.dataset?.toggle === 'autoplayRec') setAutoplayRec(t.checked);
    else if (t.dataset?.toggle === 'autoplayNext') setAutoplayNext(t.checked);
  });

  // phone back button closes the full player
  window.addEventListener('popstate', () => {
    if (open && !history.state?.gtPlayer) {
      open = false;
      full.hidden = true;
      document.body.classList.remove('fp-open');
      closeSheet();
    }
  });
}
