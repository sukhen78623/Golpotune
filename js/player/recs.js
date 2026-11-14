// Picks stories a listener may like. Runs in the browser on the most popular 100 stories.
import { auth, canListen } from '../auth.js';

const themesOf = s => s.themes || [];
const shared = (a, b) => themesOf(a).filter(t => themesOf(b).includes(t)).length;

// how alike two stories are: same category counts most, shared themes add more
export const similarity = (a, b) =>
  (a.category?.slug && a.category.slug === b.category?.slug ? 5 : 0) + 2 * shared(a, b);

export function buildRecs(current, { pool, historyIds }, favIds) {
  const others = pool.filter(s => s.id !== current.id);
  const byId = new Map(pool.map(s => [s.id, s]));

  // categories this person likes: stories they listened to + favourites (favourites count double)
  const weight = {};
  const bump = (id, w) => {
    const slug = byId.get(id)?.category?.slug;
    if (slug) weight[slug] = (weight[slug] || 0) + w;
  };
  historyIds.forEach(id => bump(id, 1));
  favIds.forEach(id => bump(id, 2));

  const score = s => similarity(current, s) + Math.min(4, weight[s.category?.slug] || 0) + Math.log10(1 + (s.play_count || 0));
  const forYou = [...others].sort((a, b) => score(b) - score(a)).slice(0, 10);
  const next = forYou.find(canListen) || null;

  const lastId = historyIds.find(id => id !== current.id);
  const last = lastId ? byId.get(lastId) : null;
  const items = last
    ? others.filter(s => s.id !== last.id)
        .map(s => [s, similarity(last, s)]).filter(([, v]) => v > 0)
        .sort((a, b) => b[1] - a[1]).slice(0, 8).map(x => x[0])
    : [];

  return {
    forYou,
    next,
    because: last && items.length ? { story: last, items } : null,
    sameCat: others.filter(s => s.category?.slug === current.category?.slug).slice(0, 10),
    trending: others.slice(0, 10), // pool is already sorted by popularity
  };
}
