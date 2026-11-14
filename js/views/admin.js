// GolpoTune admin dashboard: stories, chapters + audio, covers, home page, users, genres.
import { sb } from '../supabase.js';
import { auth } from '../auth.js';
import { esc, toast, emptyState, fmtDuration } from '../ui.js';

const must = r => { if (r.error) throw r.error; return r.data; };
const MAX_AUDIO = 50 * 1024 * 1024;   // Supabase free plan limit per file
const MAX_COVER = 5 * 1024 * 1024;
const TABS = [['', 'Overview'], ['stories', 'Stories'], ['home', 'Home page'], ['users', 'Users'], ['genres', 'Genres']];

const slugify = t => (String(t).toLowerCase().normalize('NFKD').replace(/[^\w\s-]/g, '').trim().replace(/[\s_]+/g, '-').replace(/-+/g, '-') || 'story');
const rand = () => Math.random().toString(36).slice(2, 6);
const ext = name => ((name.split('.').pop() || 'mp3').toLowerCase().replace(/[^a-z0-9]/g, '') || 'mp3');
const dateIn = d => (d ? new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '');
// file name inside the public "covers" bucket, or null if the picture is not stored there
const coverPath = u => { const m = /\/covers\/([^?#]+)/.exec(u || ''); return m ? decodeURIComponent(m[1]) : null; };
const dropCover = async u => { const p = coverPath(u); if (p) await sb.storage.from('covers').remove([p]).catch(() => {}); };
const errText = e => (e && (e.message || e.error_description)) || 'Something went wrong';

function audioDuration(file) {
  return new Promise(resolve => {
    const url = URL.createObjectURL(file);
    const a = new Audio();
    const done = v => { URL.revokeObjectURL(url); resolve(v); };
    const timer = setTimeout(() => done(0), 8000);
    a.preload = 'metadata';
    a.onloadedmetadata = () => { clearTimeout(timer); done(isFinite(a.duration) ? Math.round(a.duration) : 0); };
    a.onerror = () => { clearTimeout(timer); done(0); };
    a.src = url;
  });
}

/* ================= entry ================= */
export async function admin(root, [tab = '', id = ''], ctx) {
  if (!auth.user) {
    root.innerHTML = emptyState('Admin', 'Please log in with the admin account.', '<a class="btn btn-primary" href="#/login">Log in</a>');
    return;
  }
  if (auth.profile?.role !== 'admin') {
    root.innerHTML = emptyState('Admins only', 'This page is only for the GolpoTune admin.', '<a class="btn btn-primary" href="#/">Go home</a>');
    return;
  }
  const key = tab === 'story' ? 'stories' : tab;
  root.innerHTML = `
    <div class="page adm">
      <h1>Admin dashboard</h1>
      <div class="chips adm-tabs">${TABS.map(([k, t]) => `<a class="chip ${k === key ? 'on' : ''}" href="#/admin${k ? '/' + k : ''}">${t}</a>`).join('')}</div>
      <div id="adm-body"><div class="panel"><p class="muted">Loading…</p></div></div>
    </div>`;
  const body = root.querySelector('#adm-body');
  const stale = () => ctx.stale() || !body.isConnected;
  try {
    if (tab === '') await overview(body, stale);
    else if (tab === 'stories') await storyList(body, stale);
    else if (tab === 'story') await storyEditor(body, id, stale);
    else if (tab === 'home') await homeTab(body, stale);
    else if (tab === 'users') await usersTab(body, stale);
    else if (tab === 'genres') await genresTab(body, stale);
    else body.innerHTML = emptyState('Not found', 'That admin page does not exist.');
  } catch (e) {
    console.error(e);
    if (!stale()) body.innerHTML = `<div class="panel"><h3>Something went wrong</h3><p class="muted">${esc(errText(e))}</p>
      <p class="muted">If this says "permission denied" or "function does not exist", run <b>admin_setup.sql</b> in Supabase first.</p></div>`;
  }
}

/* ================= overview ================= */
async function overview(body, stale) {
  const s = must(await sb.rpc('admin_stats'));
  if (stale()) return;
  const tile = (n, l) => `<div class="adm-tile"><b>${esc(n)}</b><span>${l}</span></div>`;
  body.innerHTML = `
    <div class="adm-tiles">
      ${tile(s.users, 'Users')}${tile(s.new_week, 'New this week')}${tile(s.published + ' / ' + s.stories, 'Stories live')}
      ${tile(s.chapters, 'Chapters')}${tile(s.plays, 'Total plays')}${tile(s.premium, 'Premium members')}
    </div>
    <div class="panel"><h3>Most played</h3>
      ${(s.top || []).length ? s.top.map((t, i) => `<div class="kv"><span>${i + 1}. ${esc(t.title)}</span><span>${t.play_count} plays</span></div>`).join('')
        : '<p class="muted">No stories yet.</p>'}
    </div>
    <div class="panel"><h3>Quick start</h3>
      <p class="muted">1. Open <b>Stories</b> and press <b>Add story</b>. 2. Fill the details and upload a cover. 3. Add chapters with their audio files. 4. Turn on <b>Published</b>. 5. Use <b>Home page</b> to choose the featured stories.</p>
      <a class="btn btn-primary" href="#/admin/story/new">Add story</a>
    </div>`;
}

/* ================= stories list ================= */
async function storyList(body, stale) {
  const rows = must(await sb.from('stories')
    .select('id,title,slug,access,is_published,play_count,duration_seconds,cover_url,category:categories(name)')
    .order('title'));
  if (stale()) return;
  body.innerHTML = `
    <div class="adm-bar"><a class="btn btn-primary" href="#/admin/story/new">Add story</a><span class="muted">${rows.length} stories</span></div>
    ${rows.length ? `<div class="panel adm-list">${rows.map(s => `
      <div class="adm-row" data-id="${esc(s.id)}">
        <div class="adm-thumb">${s.cover_url ? `<img src="${esc(s.cover_url)}" alt="">` : '<span>♪</span>'}</div>
        <div class="adm-main">
          <a class="adm-title" href="#/admin/story/${esc(s.id)}">${esc(s.title)}</a>
          <div class="muted adm-sub">${esc(s.category?.name || 'No genre')} · ${fmtDuration(s.duration_seconds)} · ${s.play_count} plays
            · <span class="pill ${s.access === 'premium' ? 'premium' : 'free'}">${s.access === 'premium' ? 'Premium' : 'Free'}</span>
            · <b class="${s.is_published ? 'ok' : 'warn'}">${s.is_published ? 'Published' : 'Draft'}</b></div>
        </div>
        <div class="adm-act">
          <a class="btn btn-sm" href="#/admin/story/${esc(s.id)}">Edit</a>
          <button class="btn btn-sm" data-pub="${s.is_published ? 0 : 1}">${s.is_published ? 'Unpublish' : 'Publish'}</button>
          <button class="btn btn-sm danger" data-del>Delete</button>
        </div>
      </div>`).join('')}</div>`
      : emptyState('No stories yet', 'Press "Add story" to upload your first story.')}`;
  body.onclick = async e => {
    const row = e.target.closest('.adm-row'); if (!row) return;
    const id = row.dataset.id;
    const pub = e.target.closest('[data-pub]');
    const del = e.target.closest('[data-del]');
    try {
      if (pub) {
        const on = pub.dataset.pub === '1';
        const patch = { is_published: on };
        if (on) patch.published_at = new Date().toISOString();
        must(await sb.from('stories').update(patch).eq('id', id));
        toast(on ? 'Published' : 'Moved to drafts');
        await storyList(body, stale);
      } else if (del) {
        const t = row.querySelector('.adm-title').textContent;
        if (!confirm(`Delete "${t}" and all its chapters and audio? This cannot be undone.`)) return;
        await deleteStory(id);
        toast('Story deleted');
        await storyList(body, stale);
      }
    } catch (err) { toast(errText(err), 'err'); }
  };
}

async function deleteStory(id) {
  const cv = must(await sb.from('stories').select('cover_url').eq('id', id).maybeSingle());
  const chs = must(await sb.from('chapters').select('id').eq('story_id', id));
  const ids = chs.map(c => c.id);
  if (ids.length) {
    const au = must(await sb.from('chapter_audio').select('r2_key').in('chapter_id', ids));
    const paths = au.map(a => a.r2_key).filter(Boolean);
    if (paths.length) await sb.storage.from('audio').remove(paths);
    must(await sb.from('chapter_audio').delete().in('chapter_id', ids));
  }
  // things people saved about this story (ignored if a table does not exist)
  for (const t of ['favorites', 'playback_progress', 'listening_history', 'bookmarks', 'playlist_items', 'home_section_items']) {
    await sb.from(t).delete().eq('story_id', id);
  }
  if (ids.length) await sb.from('chapters').delete().eq('story_id', id);
  must(await sb.from('stories').delete().eq('id', id));
  if (cv?.cover_url) await dropCover(cv.cover_url);
}

/* ================= story editor ================= */
async function storyEditor(body, id, stale) {
  const isNew = id === 'new';
  const [cats, story] = await Promise.all([
    sb.from('categories').select('id,name').order('sort_order').then(must),
    isNew ? null : sb.from('stories').select('*').eq('id', id).maybeSingle().then(must),
  ]);
  if (stale()) return;
  if (!isNew && !story) { body.innerHTML = emptyState('Story not found', 'It may have been deleted.', '<a class="btn" href="#/admin/stories">Back</a>'); return; }
  const s = story || { title: '', description: '', author: '', narrator: '', access: 'free', is_published: false, themes: [], cover_url: '' };
  let cover = s.cover_url || '';
  let pending = '';   // a cover uploaded in this editor but not saved yet

  body.innerHTML = `
    <div class="adm-bar"><a class="btn btn-sm" href="#/admin/stories">← All stories</a><h2 class="adm-h">${isNew ? 'New story' : 'Edit story'}</h2></div>
    <form class="panel adm-form" id="sform" novalidate>
      <label class="field"><span>Title *</span><input name="title" value="${esc(s.title)}" maxlength="120" required></label>
      <label class="field"><span>Description</span><textarea name="description" rows="4" maxlength="1500">${esc(s.description || '')}</textarea></label>
      <div class="adm-two">
        <label class="field"><span>Genre</span><select name="category_id"><option value="">— none —</option>
          ${cats.map(c => `<option value="${esc(c.id)}" ${c.id === s.category_id ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select></label>
        <label class="field"><span>Access</span><select name="access">
          <option value="free" ${s.access !== 'premium' ? 'selected' : ''}>Free</option>
          <option value="premium" ${s.access === 'premium' ? 'selected' : ''}>Premium</option></select></label>
      </div>
      <div class="adm-two">
        <label class="field"><span>Author / writer</span><input name="author" value="${esc(s.author || '')}" maxlength="80"></label>
        <label class="field"><span>Narrator / voice</span><input name="narrator" value="${esc(s.narrator || '')}" maxlength="80"></label>
      </div>
      <label class="field"><span>Themes (separate with commas)</span><input name="themes" value="${esc((s.themes || []).join(', '))}" placeholder="village, mystery, family"></label>
      <div class="field"><span>Cover picture (square, JPG or PNG, under 5 MB)</span>
        <div class="adm-cover"><div class="adm-thumb big" id="cprev">${cover ? `<img src="${esc(cover)}" alt="">` : '<span>♪</span>'}</div>
          <div><input type="file" id="cfile" accept="image/*"><button type="button" class="btn btn-sm" id="cclear">Remove cover</button></div></div></div>
      <label class="adm-check"><input type="checkbox" name="is_published" ${s.is_published ? 'checked' : ''}> <span><b>Published</b> — visible to everyone on the website</span></label>
      <div class="adm-bar"><button class="btn btn-primary" type="submit" id="ssave">${isNew ? 'Save and add chapters' : 'Save changes'}</button></div>
    </form>
    <div id="chapters-box"></div>`;

  const form = body.querySelector('#sform');
  const prev = body.querySelector('#cprev');
  body.querySelector('#cfile').onchange = async e => {
    const f = e.target.files[0]; if (!f) return;
    if (f.size > MAX_COVER) { toast('Cover is too big (max 5 MB)', 'err'); e.target.value = ''; return; }
    prev.innerHTML = '<span>…</span>';
    try {
      const path = `${Date.now()}-${rand()}.${ext(f.name)}`;
      const up = await sb.storage.from('covers').upload(path, f, { contentType: f.type || 'image/jpeg' });
      if (up.error) throw up.error;
      if (pending) await dropCover(pending);
      cover = sb.storage.from('covers').getPublicUrl(path).data.publicUrl;
      pending = cover;
      prev.innerHTML = `<img src="${esc(cover)}" alt="">`;
      toast('Cover uploaded. Press Save to keep it.');
    } catch (err) { prev.innerHTML = '<span>♪</span>'; toast(errText(err), 'err'); }
  };
  body.querySelector('#cclear').onclick = () => { cover = ''; prev.innerHTML = '<span>♪</span>'; body.querySelector('#cfile').value = ''; };

  form.onsubmit = async e => {
    e.preventDefault();
    const f = new FormData(form);
    const title = (f.get('title') || '').trim();
    if (!title) { toast('Please enter a title', 'err'); return; }
    const row = {
      title,
      description: (f.get('description') || '').trim() || null,
      category_id: f.get('category_id') || null,
      access: f.get('access') === 'premium' ? 'premium' : 'free',
      author: (f.get('author') || '').trim() || null,
      narrator: (f.get('narrator') || '').trim() || null,
      themes: (f.get('themes') || '').split(',').map(x => x.trim()).filter(Boolean).slice(0, 12),
      cover_url: cover || null,
      is_published: !!f.get('is_published'),
    };
    if (row.is_published && !s.published_at) row.published_at = new Date().toISOString();
    const btn = body.querySelector('#ssave'); btn.disabled = true;
    try {
      if (isNew) {
        let saved = null;
        for (let i = 0; i < 4 && !saved; i++) {
          const slug = slugify(title) + (i ? '-' + rand() : '');
          const r = await sb.from('stories').insert({ ...row, slug }).select('id').single();
          if (!r.error) saved = r.data;
          else if (r.error.code !== '23505') throw r.error;
        }
        if (!saved) throw new Error('Could not create the story. Try another title.');
        toast('Saved. Now add the chapters.');
        location.hash = `#/admin/story/${saved.id}`;
      } else {
        const prevCover = s.cover_url;
        must(await sb.from('stories').update(row).eq('id', id));
        if (prevCover && prevCover !== row.cover_url) await dropCover(prevCover);   // old picture is removed automatically
        pending = '';
        Object.assign(s, row);
        toast('Changes saved');
      }
    } catch (err) { toast(errText(err), 'err'); }
    finally { btn.disabled = false; }
  };

  if (!isNew) await audioSection(body.querySelector('#chapters-box'), s, stale);
  else body.querySelector('#chapters-box').innerHTML = '<div class="panel"><h3>Audio</h3><p class="muted">Save the story first, then you can upload the audio here.</p></div>';
}

async function chaptersPanel(box, story, stale, onSingle) {
  const load = async () => {
    const chs = must(await sb.from('chapters').select('id,title,chapter_number,duration_seconds').eq('story_id', story.id).order('chapter_number'));
    const au = chs.length ? must(await sb.from('chapter_audio').select('chapter_id,r2_key').in('chapter_id', chs.map(c => c.id))) : [];
    return { chs, audio: Object.fromEntries(au.map(a => [a.chapter_id, a.r2_key])) };
  };
  const { chs, audio } = await load();
  if (stale()) return;
  const nextNo = chs.reduce((m, c) => Math.max(m, c.chapter_number), 0) + 1;

  box.innerHTML = `
    <div class="panel"><h3>Chapters (${chs.length})</h3>
      <p class="muted">Audio files: MP3 or M4A, up to 50 MB each.</p>
      ${chs.length <= 1 && onSingle ? '<button type="button" class="btn btn-sm" id="tosingle">← Use one single audio instead (no chapters)</button>' : ''}
      ${chs.length ? chs.map(c => `
        <div class="adm-ch" data-ch="${esc(c.id)}">
          <div class="adm-main"><b>${c.chapter_number}. ${esc(c.title)}</b>
            <div class="muted adm-sub">${c.duration_seconds ? fmtDuration(c.duration_seconds) : 'length unknown'} ·
              ${audio[c.id] ? `<span class="ok">audio uploaded</span>` : '<span class="warn">no audio yet</span>'}</div></div>
          <div class="adm-act">
            <label class="btn btn-sm">${audio[c.id] ? 'Replace audio' : 'Upload audio'}<input type="file" accept="audio/*" data-audio hidden></label>
            <button class="btn btn-sm" data-rename>Rename</button>
            <button class="btn btn-sm danger" data-chdel>Delete</button>
          </div>
        </div>`).join('') : '<p class="muted">No chapters yet.</p>'}
    </div>
    <form class="panel adm-form" id="chform">
      <h3>Add chapter ${nextNo}</h3>
      <label class="field"><span>Chapter title *</span><input name="ctitle" maxlength="120" placeholder="e.g. The Beginning" required></label>
      <label class="field"><span>Audio file</span><input type="file" name="cfile" accept="audio/*"></label>
      <button class="btn btn-primary" type="submit" id="chadd">Add chapter</button>
    </form>`;

  const refresh = async () => { await syncDuration(story.id); await chaptersPanel(box, story, stale, onSingle); };
  box.querySelector('#tosingle')?.addEventListener('click', () => onSingle());

  box.querySelector('#chform').onsubmit = async e => {
    e.preventDefault();
    const f = new FormData(e.target);
    const title = (f.get('ctitle') || '').trim();
    const file = f.get('cfile');
    if (!title) { toast('Please enter a chapter title', 'err'); return; }
    if (file && file.size > MAX_AUDIO) { toast('Audio is over 50 MB. Please split or compress it.', 'err'); return; }
    const btn = box.querySelector('#chadd'); btn.disabled = true; btn.textContent = file?.size ? 'Uploading…' : 'Saving…';
    try {
      const dur = file?.size ? await audioDuration(file) : 0;
      const ch = must(await sb.from('chapters').insert({ story_id: story.id, title, chapter_number: nextNo, duration_seconds: dur || null }).select('id').single());
      if (file?.size) await putAudio(story.id, ch.id, file);
      toast('Chapter added');
      await refresh();
    } catch (err) { toast(errText(err), 'err'); btn.disabled = false; btn.textContent = 'Add chapter'; }
  };

  box.onchange = async e => {
    const inp = e.target.closest('[data-audio]'); if (!inp) return;
    const file = inp.files[0]; if (!file) return;
    const id = inp.closest('.adm-ch').dataset.ch;
    if (file.size > MAX_AUDIO) { toast('Audio is over 50 MB. Please split or compress it.', 'err'); return; }
    toast('Uploading…');
    try {
      const dur = await audioDuration(file);
      await putAudio(story.id, id, file, audio[id]);
      if (dur) must(await sb.from('chapters').update({ duration_seconds: dur }).eq('id', id));
      toast('Audio saved');
      await refresh();
    } catch (err) { toast(errText(err), 'err'); }
  };
  box.onclick = async e => {
    const row = e.target.closest('.adm-ch'); if (!row) return;
    const id = row.dataset.ch;
    try {
      if (e.target.closest('[data-rename]')) {
        const cur = row.querySelector('b').textContent.replace(/^\d+\.\s*/, '');
        const name = prompt('Chapter title', cur);
        if (name && name.trim()) { must(await sb.from('chapters').update({ title: name.trim() }).eq('id', id)); await refresh(); }
      } else if (e.target.closest('[data-chdel]')) {
        if (!confirm('Delete this chapter and its audio?')) return;
        if (audio[id]) await sb.storage.from('audio').remove([audio[id]]);
        await sb.from('chapter_audio').delete().eq('chapter_id', id);
        for (const t of ['playback_progress', 'listening_history', 'bookmarks']) await sb.from(t).delete().eq('chapter_id', id);
        must(await sb.from('chapters').delete().eq('id', id));
        toast('Chapter deleted');
        await refresh();
      }
    } catch (err) { toast(errText(err), 'err'); }
  };
}

// Single audio story (default) or a story with chapters. Behind the scenes a single story is one chapter.
async function audioSection(box, story, stale, force) {
  const chs = must(await sb.from('chapters').select('id,title,chapter_number,duration_seconds').eq('story_id', story.id).order('chapter_number'));
  if (stale()) return;
  const mode = force || (chs.length > 1 ? 'chapters' : 'single');
  if (mode === 'chapters') {
    return chaptersPanel(box, story, stale, chs.length <= 1 ? () => audioSection(box, story, stale, 'single') : null);
  }
  const ch = chs[0] || null;
  let has = false;
  if (ch) has = !!must(await sb.from('chapter_audio').select('chapter_id,r2_key').eq('chapter_id', ch.id).maybeSingle());
  const old = ch && has ? must(await sb.from('chapter_audio').select('r2_key').eq('chapter_id', ch.id).maybeSingle())?.r2_key : null;
  box.innerHTML = `
    <div class="panel adm-form"><h3>Audio</h3>
      <p class="muted">Upload the story's audio file (MP3 or M4A, up to 50 MB).
        ${has ? `<br><b class="ok">Audio uploaded</b>${ch.duration_seconds ? ' · ' + fmtDuration(ch.duration_seconds) : ''}` : '<br><b class="warn">No audio yet</b>'}</p>
      <div class="adm-act"><label class="btn btn-primary">${has ? 'Replace audio' : 'Upload audio'}<input type="file" id="single-audio" accept="audio/*" hidden></label>
        <button type="button" class="btn btn-sm" id="tochap">Story has chapters? Add chapters instead</button></div>
    </div>`;
  box.querySelector('#tochap').onclick = () => audioSection(box, story, stale, 'chapters');
  box.querySelector('#single-audio').onchange = async e => {
    const file = e.target.files[0]; if (!file) return;
    if (file.size > MAX_AUDIO) { toast('Audio is over 50 MB. Please compress it, or use chapters.', 'err'); return; }
    toast('Uploading… please wait');
    try {
      const dur = await audioDuration(file);
      let id = ch?.id;
      if (!id) id = must(await sb.from('chapters').insert({ story_id: story.id, title: story.title, chapter_number: 1, duration_seconds: dur || null }).select('id').single()).id;
      else if (dur) must(await sb.from('chapters').update({ duration_seconds: dur }).eq('id', id));
      await putAudio(story.id, id, file, old);
      await syncDuration(story.id);
      toast('Audio saved');
      await audioSection(box, story, stale, 'single');
    } catch (err) { toast(errText(err), 'err'); }
  };
}

async function putAudio(storyId, chapterId, file, oldPath) {
  const path = `${storyId}/${chapterId}-${Date.now()}.${ext(file.name)}`;
  const up = await sb.storage.from('audio').upload(path, file, { contentType: file.type || 'audio/mpeg', upsert: false });
  if (up.error) throw up.error;
  await sb.from('chapter_audio').delete().eq('chapter_id', chapterId);
  const ins = await sb.from('chapter_audio').insert({ chapter_id: chapterId, r2_key: path });
  if (ins.error) { await sb.storage.from('audio').remove([path]); throw ins.error; }
  if (oldPath) await sb.storage.from('audio').remove([oldPath]);
}

// story length = sum of its chapters
async function syncDuration(storyId) {
  const chs = must(await sb.from('chapters').select('duration_seconds').eq('story_id', storyId));
  const total = chs.reduce((n, c) => n + (c.duration_seconds || 0), 0);
  await sb.from('stories').update({ duration_seconds: total || null }).eq('id', storyId);
}

/* ================= home page control ================= */
async function homeTab(body, stale) {
  const [secs, items, stories] = await Promise.all([
    sb.from('home_sections').select('key,title,is_visible,sort_order').order('sort_order').then(must),
    sb.from('home_section_items').select('section_key,story_id,position,story:stories(id,title)').order('position').then(must),
    sb.from('stories').select('id,title').eq('is_published', true).order('title').then(must),
  ]);
  if (stale()) return;
  const hints = {
    hero: 'Featured slider at the top (3 stories show; if you pick fewer, the newest fill the rest).',
    trending: 'Leave empty to show the most-played stories automatically.',
    recently_added: 'Leave empty to show the newest stories automatically.',
    premium_exclusives: 'Leave empty to show Premium stories automatically.',
  };
  body.innerHTML = `<p class="muted adm-note">Choose which stories appear in each home page section. Only published stories are shown to visitors.</p>` +
    secs.map(sec => {
      const mine = items.filter(i => i.section_key === sec.key && i.story);
      const free = stories.filter(s => !mine.some(m => m.story_id === s.id));
      return `<div class="panel adm-sec" data-sec="${esc(sec.key)}">
        <div class="adm-bar"><h3>${esc(sec.title)}</h3>
          <label class="adm-check sm"><input type="checkbox" data-vis ${sec.is_visible ? 'checked' : ''}> <span>Visible</span></label></div>
        ${hints[sec.key] ? `<p class="muted">${esc(hints[sec.key])}</p>` : ''}
        ${mine.map((m, i) => `<div class="adm-ch" data-story="${esc(m.story_id)}">
            <div class="adm-main"><b>${i + 1}. ${esc(m.story.title)}</b></div>
            <div class="adm-act"><button class="btn btn-sm" data-up ${i === 0 ? 'disabled' : ''}>↑</button>
              <button class="btn btn-sm" data-down ${i === mine.length - 1 ? 'disabled' : ''}>↓</button>
              <button class="btn btn-sm danger" data-rm>Remove</button></div></div>`).join('') || '<p class="muted">Nothing picked.</p>'}
        <div class="adm-add"><select data-pick><option value="">Add a story…</option>${free.map(s => `<option value="${esc(s.id)}">${esc(s.title)}</option>`).join('')}</select>
          <button class="btn btn-sm btn-primary" data-add>Add</button></div>
      </div>`;
    }).join('');

  body.onclick = body.onchange = async e => {
    const secEl = e.target.closest('.adm-sec'); if (!secEl) return;
    const key = secEl.dataset.sec;
    const ids = [...secEl.querySelectorAll('.adm-ch')].map(r => r.dataset.story);
    const save = async order => {
      for (let i = 0; i < order.length; i++) {
        must(await sb.from('home_section_items').update({ position: i + 1 }).eq('section_key', key).eq('story_id', order[i]));
      }
    };
    try {
      if (e.type === 'change' && e.target.matches('[data-vis]')) {
        must(await sb.from('home_sections').update({ is_visible: e.target.checked }).eq('key', key));
        toast(e.target.checked ? 'Section shown' : 'Section hidden');
        return;
      }
      if (e.type !== 'click') return;
      const row = e.target.closest('.adm-ch');
      if (e.target.closest('[data-add]')) {
        const v = secEl.querySelector('[data-pick]').value; if (!v) { toast('Choose a story first'); return; }
        must(await sb.from('home_section_items').insert({ section_key: key, story_id: v, position: ids.length + 1 }));
      } else if (row && e.target.closest('[data-rm]')) {
        must(await sb.from('home_section_items').delete().eq('section_key', key).eq('story_id', row.dataset.story));
        await save(ids.filter(x => x !== row.dataset.story));
      } else if (row && (e.target.closest('[data-up]') || e.target.closest('[data-down]'))) {
        const i = ids.indexOf(row.dataset.story), j = e.target.closest('[data-up]') ? i - 1 : i + 1;
        if (j < 0 || j >= ids.length) return;
        [ids[i], ids[j]] = [ids[j], ids[i]];
        await save(ids);
      } else return;
      await homeTab(body, stale);
    } catch (err) { toast(errText(err), 'err'); }
  };
}

/* ================= users ================= */
async function usersTab(body, stale) {
  const users = must(await sb.rpc('admin_list_users'));
  if (stale()) return;
  const live = u => u.tier === 'premium' && u.status === 'active' && (!u.current_period_end || new Date(u.current_period_end) > new Date());
  const draw = q => {
    const list = users.filter(u => !q || `${u.email} ${u.display_name || ''} ${u.city || ''}`.toLowerCase().includes(q));
    body.querySelector('#ulist').innerHTML = list.length ? list.map(u => `
      <div class="adm-row" data-u="${esc(u.id)}">
        <div class="adm-main"><b>${esc(u.display_name || u.email.split('@')[0])}</b> ${u.role === 'admin' ? '<span class="pill premium">Admin</span>' : ''}
          <div class="muted adm-sub">${esc(u.email)}${u.city ? ' · ' + esc(u.city) : ''} · joined ${dateIn(u.created_at)}</div>
          <div class="adm-sub">${live(u) ? `<span class="pill premium">Premium</span> <span class="muted">${u.current_period_end ? 'until ' + dateIn(u.current_period_end) : 'no end date'}</span>` : '<span class="pill free">Free</span>'}</div></div>
        <div class="adm-act">
          <select data-days><option value="30">30 days</option><option value="90">90 days</option><option value="365">1 year</option><option value="0">No end</option></select>
          <button class="btn btn-sm btn-primary" data-prem>Give Premium</button>
          ${live(u) ? '<button class="btn btn-sm" data-free>Make Free</button>' : ''}
        </div>
      </div>`).join('') : '<p class="muted">No users found.</p>';
  };
  body.innerHTML = `<div class="adm-bar"><input class="adm-search" id="usearch" type="search" placeholder="Search name, email or city"><span class="muted">${users.length} users</span></div>
    <div class="panel adm-list" id="ulist"></div>`;
  draw('');
  body.querySelector('#usearch').oninput = e => draw(e.target.value.trim().toLowerCase());
  body.onclick = async e => {
    const row = e.target.closest('[data-u]'); if (!row) return;
    const id = row.dataset.u;
    try {
      if (e.target.closest('[data-prem]')) {
        must(await sb.rpc('admin_set_membership', { p_user: id, p_tier: 'premium', p_days: Number(row.querySelector('[data-days]').value) }));
        toast('Premium given');
      } else if (e.target.closest('[data-free]')) {
        if (!confirm('Move this user back to the Free plan?')) return;
        must(await sb.rpc('admin_set_membership', { p_user: id, p_tier: 'free', p_days: 0 }));
        toast('Moved to Free');
      } else return;
      await usersTab(body, stale);
    } catch (err) { toast(errText(err), 'err'); }
  };
}

/* ================= genres ================= */
async function genresTab(body, stale) {
  const cats = must(await sb.from('categories').select('id,name,slug,sort_order').order('sort_order'));
  if (stale()) return;
  body.innerHTML = `
    <div class="panel"><h3>Genres</h3>
      ${cats.map(c => `<div class="adm-ch" data-c="${esc(c.id)}"><div class="adm-main"><b>${esc(c.name)}</b></div>
        <div class="adm-act"><button class="btn btn-sm" data-ren>Rename</button><button class="btn btn-sm danger" data-del>Delete</button></div></div>`).join('') || '<p class="muted">No genres.</p>'}
    </div>
    <form class="panel adm-form" id="gform"><h3>Add genre</h3>
      <label class="field"><span>Name</span><input name="gname" maxlength="40" placeholder="e.g. Comedy" required></label>
      <button class="btn btn-primary" type="submit">Add genre</button></form>`;
  body.querySelector('#gform').onsubmit = async e => {
    e.preventDefault();
    const name = new FormData(e.target).get('gname').trim(); if (!name) return;
    try {
      let ok = false;
      for (let i = 0; i < 3 && !ok; i++) {
        const r = await sb.from('categories').insert({ name, slug: slugify(name) + (i ? '-' + rand() : ''), sort_order: cats.reduce((m, c) => Math.max(m, c.sort_order || 0), 0) + 1 });
        if (!r.error) ok = true; else if (r.error.code !== '23505') throw r.error;
      }
      toast('Genre added'); await genresTab(body, stale);
    } catch (err) { toast(errText(err), 'err'); }
  };
  body.onclick = async e => {
    const row = e.target.closest('[data-c]'); if (!row) return;
    const id = row.dataset.c;
    try {
      if (e.target.closest('[data-ren]')) {
        const name = prompt('Genre name', row.querySelector('b').textContent);
        if (name && name.trim()) { must(await sb.from('categories').update({ name: name.trim() }).eq('id', id)); await genresTab(body, stale); }
      } else if (e.target.closest('[data-del]')) {
        if (!confirm('Delete this genre? Stories in it will have no genre.')) return;
        await sb.from('stories').update({ category_id: null }).eq('category_id', id);
        must(await sb.from('categories').delete().eq('id', id));
        await genresTab(body, stale);
      }
    } catch (err) { toast(errText(err), 'err'); }
  };
}
