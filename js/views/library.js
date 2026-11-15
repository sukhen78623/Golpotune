// My Library: Favourites, Playlists, Listening History and Statistics.
import { sb } from '../supabase.js';
import { auth } from '../auth.js';
import { F, getFavouriteStories } from '../api.js';
import { esc, cover, storyCard, emptyState, errorState, skeletonGrid, toast, fmtDuration } from '../ui.js';

const must = r => { if (r.error) throw r.error; return r.data; };
const TABS = [['', 'Favourites'], ['playlists', 'Playlists'], ['history', 'History'], ['stats', 'Statistics']];
const errText = e => (e && e.message) || 'Something went wrong';

const fmtTime = sec => {
  sec = Math.round(sec || 0);
  if (sec < 60) return `${sec} sec`;
  const h = Math.floor(sec / 3600), m = Math.round((sec % 3600) / 60);
  if (!h) return `${m} min`;
  return m ? `${h}h ${m}m` : `${h}h`;
};
const dateIn = d => new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
const dayKey = d => { const x = new Date(d); return `${x.getFullYear()}-${x.getMonth()}-${x.getDate()}`; };

export async function library(root, [tab = ''], ctx) {
  if (!auth.user) {
    root.innerHTML = emptyState('Your library', 'Log in to see your favourites, playlists and listening history.',
      '<a class="btn btn-primary" href="#/login">Log in</a> <a class="btn" href="#/signup">Sign up</a>');
    return;
  }
  root.innerHTML = `
    <div class="page lib">
      <h1>My Library</h1>
      <div class="chips lib-tabs">${TABS.map(([k, t]) => `<a class="chip ${k === tab ? 'on' : ''}" href="#/library${k ? '/' + k : ''}">${t}</a>`).join('')}</div>
      <div id="lib-body">${skeletonGrid()}</div>
    </div>`;
  const body = root.querySelector('#lib-body');
  const stale = () => ctx.stale() || !body.isConnected;
  try {
    if (tab === 'playlists') await playlistsTab(body, stale);
    else if (tab === 'history') await historyTab(body, stale);
    else if (tab === 'stats') await statsTab(body, stale);
    else await favouritesTab(body, stale);
  } catch (e) { console.error(e); if (!stale()) body.innerHTML = errorState(e); }
}

/* ---------- favourites ---------- */
async function favouritesTab(body, stale) {
  const stories = await getFavouriteStories();
  if (stale()) return;
  body.innerHTML = stories.length
    ? `<div class="grid">${stories.map(s => storyCard(s)).join('')}</div>`
    : emptyState('No favourites yet', 'Tap the heart on any story to save it here.', '<a class="btn btn-primary" href="#/browse">Browse stories</a>');
}

/* ---------- playlists ---------- */
async function playlistsTab(body, stale) {
  const lists = must(await sb.from('playlists').select('id,name,created_at').eq('user_id', auth.user.id).order('created_at', { ascending: false }));
  const items = lists.length
    ? must(await sb.from('playlist_items').select(`playlist_id,story_id,position,story:stories(${F})`).in('playlist_id', lists.map(l => l.id)).order('position'))
    : [];
  if (stale()) return;
  const row = (pl, it) => {
    const s = it.story; if (!s) return '';
    return `<div class="lib-row" data-pl="${esc(pl.id)}" data-story="${esc(s.id)}">
      <a class="lib-thumb" href="#/story/${encodeURIComponent(s.slug)}">${cover(s)}</a>
      <div class="lib-main"><a class="lib-title" href="#/story/${encodeURIComponent(s.slug)}">${esc(s.title)}</a>
        <div class="muted lib-sub">${esc(s.category?.name || 'Story')} · ${fmtDuration(s.duration_seconds)}</div></div>
      <div class="lib-act"><button class="btn btn-sm btn-primary" data-play="${esc(s.id)}">Play</button>
        <button class="btn btn-sm" data-rmstory>Remove</button></div></div>`;
  };
  body.innerHTML = `
    <form class="panel lib-new" id="plnew"><h3>New playlist</h3>
      <div class="lib-add"><input name="name" maxlength="60" placeholder="Playlist name, e.g. Night stories" aria-label="Playlist name" required>
      <button class="btn btn-primary" type="submit">Create</button></div></form>
    ${lists.length ? lists.map(pl => {
      const mine = items.filter(i => i.playlist_id === pl.id && i.story);
      return `<div class="panel lib-pl" data-pl="${esc(pl.id)}">
        <div class="lib-plhead"><div><h3>${esc(pl.name)}</h3><span class="muted">${mine.length} ${mine.length === 1 ? 'story' : 'stories'}</span></div>
          <div class="lib-act"><button class="btn btn-sm" data-ren>Rename</button><button class="btn btn-sm danger" data-del>Delete</button></div></div>
        ${mine.length ? mine.map(it => row(pl, it)).join('') : '<p class="muted">Empty. Open a story\'s player and tap <b>Playlist</b> to add it here.</p>'}
      </div>`;
    }).join('') : emptyState('No playlists yet', 'Create your first playlist above, then add stories from the player.')}`;

  body.querySelector('#plnew').onsubmit = async e => {
    e.preventDefault();
    const name = new FormData(e.target).get('name').trim(); if (!name) return;
    try { must(await sb.from('playlists').insert({ user_id: auth.user.id, name })); toast('Playlist created'); await playlistsTab(body, stale); }
    catch (err) { toast(errText(err), 'err'); }
  };
  body.onclick = async e => {
    const pl = e.target.closest('.lib-pl'); if (!pl) return;
    const id = pl.dataset.pl;
    try {
      if (e.target.closest('[data-ren]')) {
        const cur = pl.querySelector('h3').textContent;
        const name = prompt('Playlist name', cur);
        if (name && name.trim() && name.trim() !== cur) { must(await sb.from('playlists').update({ name: name.trim() }).eq('id', id)); await playlistsTab(body, stale); }
      } else if (e.target.closest('[data-del]')) {
        if (!confirm('Delete this playlist? The stories themselves are not deleted.')) return;
        await sb.from('playlist_items').delete().eq('playlist_id', id);
        must(await sb.from('playlists').delete().eq('id', id));
        toast('Playlist deleted'); await playlistsTab(body, stale);
      } else if (e.target.closest('[data-rmstory]')) {
        const r = e.target.closest('.lib-row');
        must(await sb.from('playlist_items').delete().eq('playlist_id', id).eq('story_id', r.dataset.story));
        await playlistsTab(body, stale);
      }
    } catch (err) { toast(errText(err), 'err'); }
  };
}

/* ---------- listening history ---------- */
async function loadHistory() {
  // the most recent 1000 listening sessions
  return must(await sb.from('listening_history')
    .select(`story_id,listened_seconds,listened_at,story:stories(${F})`)
    .eq('user_id', auth.user.id).order('listened_at', { ascending: false }).limit(1000));
}

async function historyTab(body, stale) {
  const rows = (await loadHistory()).filter(r => r.story);
  if (stale()) return;
  const by = new Map();
  for (const r of rows) {
    const g = by.get(r.story_id) || { story: r.story, secs: 0, last: r.listened_at };
    g.secs += r.listened_seconds || 0;
    by.set(r.story_id, g);
  }
  const list = [...by.values()];
  if (!list.length) {
    body.innerHTML = emptyState('No listening history yet', 'Stories you listen to will show up here.', '<a class="btn btn-primary" href="#/browse">Browse stories</a>');
    return;
  }
  body.innerHTML = `
    <div class="lib-bar"><span class="muted">${list.length} ${list.length === 1 ? 'story' : 'stories'} you have listened to</span>
      <button class="btn btn-sm danger" id="clrhist">Clear history</button></div>
    <div class="panel lib-list">${list.map(g => `
      <div class="lib-row">
        <a class="lib-thumb" href="#/story/${encodeURIComponent(g.story.slug)}">${cover(g.story)}</a>
        <div class="lib-main"><a class="lib-title" href="#/story/${encodeURIComponent(g.story.slug)}">${esc(g.story.title)}</a>
          <div class="muted lib-sub">Listened ${fmtTime(g.secs)} · last on ${dateIn(g.last)}</div></div>
        <div class="lib-act"><button class="btn btn-sm btn-primary" data-play="${esc(g.story.id)}">Play</button></div>
      </div>`).join('')}</div>`;
  body.querySelector('#clrhist').onclick = async () => {
    if (!confirm('Clear your whole listening history? Your statistics will reset too.')) return;
    try { must(await sb.from('listening_history').delete().eq('user_id', auth.user.id)); toast('History cleared'); await historyTab(body, stale); }
    catch (err) { toast(errText(err), 'err'); }
  };
}

/* ---------- statistics ---------- */
async function statsTab(body, stale) {
  const [rows, favCount, plCount] = await Promise.all([
    loadHistory(),
    sb.from('favorites').select('story_id', { count: 'exact', head: true }).eq('user_id', auth.user.id).then(r => r.count || 0),
    sb.from('playlists').select('id', { count: 'exact', head: true }).eq('user_id', auth.user.id).then(r => r.count || 0),
  ]);
  if (stale()) return;
  if (!rows.length) {
    body.innerHTML = emptyState('No statistics yet', 'Listen to a story and your listening statistics will appear here.', '<a class="btn btn-primary" href="#/browse">Browse stories</a>');
    return;
  }
  const total = rows.reduce((n, r) => n + (r.listened_seconds || 0), 0);
  const weekAgo = Date.now() - 7 * 864e5;
  const week = rows.filter(r => new Date(r.listened_at).getTime() > weekAgo).reduce((n, r) => n + (r.listened_seconds || 0), 0);
  const stories = new Set(rows.map(r => r.story_id));
  const byGenre = {}, byStory = {};
  for (const r of rows) {
    const g = r.story?.category?.name; if (g) byGenre[g] = (byGenre[g] || 0) + (r.listened_seconds || 0);
    if (r.story) byStory[r.story.title] = (byStory[r.story.title] || 0) + (r.listened_seconds || 0);
  }
  const top = obj => Object.entries(obj).sort((a, b) => b[1] - a[1]);
  // listening streak: days in a row (counting back from today, or yesterday if you have not listened today)
  const days = new Set(rows.map(r => dayKey(r.listened_at)));
  let streak = 0, d = new Date();
  if (!days.has(dayKey(d))) d.setDate(d.getDate() - 1);
  while (days.has(dayKey(d))) { streak++; d.setDate(d.getDate() - 1); }
  const tile = (n, l) => `<div class="lib-tile"><b>${esc(n)}</b><span>${l}</span></div>`;
  const genres = top(byGenre).slice(0, 5), max = genres[0]?.[1] || 1;
  body.innerHTML = `
    <div class="lib-tiles">
      ${tile(fmtTime(total), 'Total listening time')}${tile(fmtTime(week), 'Last 7 days')}
      ${tile(stories.size, 'Stories heard')}${tile(streak + (streak === 1 ? ' day' : ' days'), 'Listening streak')}
      ${tile(favCount, 'Favourites')}${tile(plCount, 'Playlists')}
    </div>
    ${genres.length ? `<div class="panel"><h3>Favourite genres</h3>${genres.map(([n, v]) => `
      <div class="lib-bar-row"><span>${esc(n)}</span><div class="lib-meter"><i style="width:${Math.max(6, Math.round(v / max * 100))}%"></i></div><span class="muted">${fmtTime(v)}</span></div>`).join('')}</div>` : ''}
    <div class="panel"><h3>Most listened stories</h3>${top(byStory).slice(0, 5).map(([n, v], i) => `
      <div class="kv"><span>${i + 1}. ${esc(n)}</span><span>${fmtTime(v)}</span></div>`).join('')}</div>`;
}
