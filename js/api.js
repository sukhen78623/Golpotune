// All database reads/writes live here.
import { sb } from './supabase.js';
import { auth } from './auth.js';

export const F = 'id,title,slug,description,author,narrator,cover_url,duration_seconds,access,play_count,published_at,is_published,themes,category:categories(name,slug)';
const must = r => { if (r.error) throw r.error; return r.data; };
const published = () => sb.from('stories').select(F).eq('is_published', true);

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
  const auto = { hero: latest.slice(0, 1), trending: popular, recently_added: latest, premium_exclusives: premium };
  const sections = secs.map(s => ({
    key: s.key, title: s.title,
    stories: picked[s.key]?.length ? picked[s.key] : (auto[s.key] || []),
  }));
  return {
    hero: sections.find(s => s.key === 'hero')?.stories[0] || null,
    sections: sections.filter(s => s.key !== 'hero' && s.stories.length),
    categories: cats,
  };
}

export async function getContinueListening() {
  const rows = must(await sb.from('playback_progress')
    .select(`position_seconds,story:stories(${F})`)
    .eq('user_id', auth.user.id).eq('completed', false)
    .order('updated_at', { ascending: false }).limit(10));
  return rows.filter(r => r.story).map(r => ({
    story: r.story,
    pct: r.story.duration_seconds ? Math.min(100, Math.round(r.position_seconds / r.story.duration_seconds * 100)) : 0,
  }));
}

export async function getCategories() {
  return must(await sb.from('categories').select('id,name,slug').order('sort_order'));
}

export async function getStories(categoryId) {
  let q = published().order('published_at', { ascending: false }).limit(60);
  if (categoryId) q = q.eq('category_id', categoryId);
  return must(await q);
}

export async function getStory(slug) {
  const story = must(await sb.from('stories').select(F).eq('slug', slug).maybeSingle());
  if (!story) return null;
  const chapters = must(await sb.from('chapters')
    .select('id,title,chapter_number,duration_seconds').eq('story_id', story.id).order('chapter_number'));
  return { story, chapters };
}

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

export async function updateDisplayName(name) {
  must(await sb.from('profiles').update({ display_name: name }).eq('id', auth.user.id));
  auth.profile = { ...auth.profile, display_name: name };
}
