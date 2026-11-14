// All database reads/writes live here.
import { sb } from './supabase.js';
import { auth } from './auth.js';

export const F = 'id,title,slug,description,author,narrator,cover_url,duration_seconds,access,play_count,published_at,is_published,themes,category:categories(name,slug)';
const must = r => { if (r.error) throw r.error; return r.data; };
const published = () => sb.from('stories').select(F).eq('is_published', true);

/* ---------- homepage / browsing ---------- */
export async function getHomeData() {
  const [secs, items, latest, popular, premium, cats] = await Promise.all([
    sb.from('home_sections').select('key,title').eq('is_visible', true).order('sort_order'),
    sb.from('home_section_items').select(`section_key,position,story:stories(${F})`).order('position'),
    published().order('published_at', { ascending: false }).limit(12),
    published().order('play_count', { ascending: false }).limit(12),
    published().eq('access', 'premium').order('published_at', { ascending: false }).limit(12),
    sb.from('categories').select('name,slug').order('sort_order'),
  ]).then(rs => rs.map(must));

  // Admin-picked stories win. If admin picked none, a few sections fill themselves automatically.
  const picked = {};
  for (const it of items) {
    if (it.story && it.story.is_published) (picked[it.section_key] ||= []).push(it.story);
  }
  const auto = { trending: popular, recently_added: latest, premium_exclusives: premium };
  const sections = secs.map(s => ({
    key: s.key, title: s.title,
    stories: picked[s.key]?.length ? picked[s.key] : (auto[s.key] || []),
  }));
  // Featured slider: the admin's picks first (up to 3); if fewer, the newest stories fill the rest
  const heroes = [...(picked.hero || [])];
  for (const s of latest) {
    if (heroes.length >= 3) break;
    if (!heroes.some(h => h.id === s.id)) heroes.push(s);
  }
  return {
    heroes: heroes.slice(0, 3),
    sections: sections.filter(s => s.key !== 'hero' && s.stories.length),
    categories: cats,
  };
}

export async function getCategories() {
  return must(await sb.from('categories').select('id,name,slug').order('sort_order'));
}

export async function getStories(categoryId) {
  let q = published().order('published_at', { ascending: false }).limit(60);
  if (categoryId) q = q.eq('category_id', categoryId);
  return must(await q);
}

async function withChapters(story) {
  if (!story) return null;
  const chapters = must(await sb.from('chapters')
    .select('id,title,chapter_number,duration_seconds').eq('story_id', story.id).order('chapter_number'));
  return { story, chapters };
}
export async function getStory(slug) {
  return withChapters(must(await sb.from('stories').select(F).eq('slug', slug).maybeSingle()));
}
export async function getStoryById(id) {
  return withChapters(must(await sb.from('stories').select(F).eq('id', id).maybeSingle()));
}

/* ---------- favourites ---------- */
export async function getFavouriteStories() {
  const rows = must(await sb.from('favorites')
    .select(`created_at,story:stories(${F})`).eq('user_id', auth.user.id)
    .order('created_at', { ascending: false }));
  return rows.map(r => r.story).filter(Boolean);
}

// returns true if the story is now a favourite
export async function toggleFavourite(storyId) {
  if (auth.favs.has(storyId)) {
    must(await sb.from('favorites').delete().eq('user_id', auth.user.id).eq('story_id', storyId));
    auth.favs.delete(storyId);
    return false;
  }
  must(await sb.from('favorites').insert({ user_id: auth.user.id, story_id: storyId }));
  auth.favs.add(storyId);
  return true;
}

export async function updateProfile(f) {
  const row = {
    display_name: f.display_name,
    gender: f.gender || null,
    age: f.age === '' || f.age == null ? null : Number(f.age),
    city: f.city || null,
    state: f.state || null,
    country: f.country || null,
    interests: (f.interests || []).slice(0, 3),
  };
  must(await sb.from('profiles').update(row).eq('id', auth.user.id));
  auth.profile = { ...auth.profile, ...row };
}

export async function updateDisplayName(name) {
  must(await sb.from('profiles').update({ display_name: name }).eq('id', auth.user.id));
  auth.profile = { ...auth.profile, display_name: name };
}

/* ---------- audio access (secure) ---------- */
// Asks our secure server function for a short-lived listening link.
export async function getAudioUrl(chapterId) {
  const { data, error } = await sb.functions.invoke('get-audio', { body: { chapter_id: chapterId } });
  if (error) {
    let msg = error.message;
    try { const j = await error.context.json(); if (j?.error) msg = j.error; } catch { /* keep default */ }
    throw new Error(msg);
  }
  return data.url;
}

/* ---------- progress, history, settings ---------- */
export async function getProgress(storyId) {
  return must(await sb.from('playback_progress').select('chapter_id,position_seconds,completed')
    .eq('user_id', auth.user.id).eq('story_id', storyId).maybeSingle());
}

export async function saveProgress(row) {
  must(await sb.from('playback_progress').upsert({ user_id: auth.user.id, ...row }, { onConflict: 'user_id,story_id' }));
}

export async function logListening(row) {
  must(await sb.from('listening_history').insert({ user_id: auth.user.id, ...row }));
}

export async function incrementPlayCount(storyId) {
  try { await sb.rpc('increment_play_count', { p_story_id: storyId }); } catch { /* not important */ }
}

export async function getSettings() {
  return must(await sb.from('user_settings').select('*').eq('user_id', auth.user.id).maybeSingle());
}
export async function saveSettings(patch) {
  must(await sb.from('user_settings').upsert({ user_id: auth.user.id, ...patch }, { onConflict: 'user_id' }));
}

export async function getContinueListening() {
  const rows = must(await sb.from('playback_progress')
    .select(`chapter_id,position_seconds,story:stories(${F})`)
    .eq('user_id', auth.user.id).eq('completed', false)
    .order('updated_at', { ascending: false }).limit(10));
  const items = rows.filter(r => r.story && r.story.is_published);
  if (!items.length) return [];
  const chs = must(await sb.from('chapters')
    .select('id,story_id,chapter_number,duration_seconds').in('story_id', items.map(r => r.story.id)));
  return items.map(r => {
    const mine = chs.filter(c => c.story_id === r.story.id).sort((a, b) => a.chapter_number - b.chapter_number);
    const total = mine.reduce((a, c) => a + c.duration_seconds, 0) || r.story.duration_seconds;
    let done = 0;
    for (const c of mine) {
      if (c.id === r.chapter_id) { done += r.position_seconds; break; }
      done += c.duration_seconds;
    }
    return { story: r.story, pct: total ? Math.min(100, Math.round(done / total * 100)) : 0 };
  }).filter(x => x.pct < 100);
}

/* ---------- bookmarks ---------- */
export async function getBookmarks(storyId) {
  return must(await sb.from('bookmarks').select('id,chapter_id,position_seconds,note,created_at')
    .eq('user_id', auth.user.id).eq('story_id', storyId).order('created_at', { ascending: false }));
}
export async function addBookmark(row) {
  return must(await sb.from('bookmarks').insert({ user_id: auth.user.id, ...row })
    .select('id,chapter_id,position_seconds,note,created_at').single());
}
export async function deleteBookmark(id) {
  must(await sb.from('bookmarks').delete().eq('id', id).eq('user_id', auth.user.id));
}

/* ---------- playlists ---------- */
export async function getPlaylists() {
  return must(await sb.from('playlists').select('id,name,playlist_items(story_id)')
    .eq('user_id', auth.user.id).order('created_at', { ascending: false }));
}
export async function createPlaylist(name) {
  return must(await sb.from('playlists').insert({ user_id: auth.user.id, name }).select('id,name').single());
}
export async function addToPlaylist(playlistId, storyId) {
  const { count } = await sb.from('playlist_items').select('story_id', { count: 'exact', head: true }).eq('playlist_id', playlistId);
  const r = await sb.from('playlist_items').insert({ playlist_id: playlistId, story_id: storyId, position: count || 0 });
  if (r.error && r.error.code !== '23505') throw r.error; // 23505 = already in this playlist
}

/* ---------- recommendations ---------- */
export async function getRecommendationData() {
  const [pool, hist] = await Promise.all([
    published().order('play_count', { ascending: false }).limit(100).then(must),
    auth.user
      ? sb.from('listening_history').select('story_id').eq('user_id', auth.user.id)
          .order('listened_at', { ascending: false }).limit(60).then(must)
      : Promise.resolve([]),
  ]);
  const seen = new Set(), historyIds = [];
  for (const h of hist) if (!seen.has(h.story_id)) { seen.add(h.story_id); historyIds.push(h.story_id); }
  return { pool, historyIds };
}
