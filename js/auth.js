// Keeps track of who is logged in, their membership and their favourites.
import { sb } from './supabase.js';

export const auth = { user: null, profile: null, membership: null, favs: new Set() };
const listeners = [];
export const onAuth = fn => listeners.push(fn);

export const isPremium = () => {
  const m = auth.membership;
  return !!m && m.tier === 'premium' && m.status === 'active' &&
    (!m.current_period_end || new Date(m.current_period_end) > new Date());
};

async function setUser(user) {
  auth.user = user;
  if (!user) { auth.profile = null; auth.membership = null; auth.favs = new Set(); return; }
  const [p, m, f] = await Promise.all([
    sb.from('profiles').select('*').eq('id', user.id).maybeSingle(),
    sb.from('memberships').select('*').eq('user_id', user.id).maybeSingle(),
    sb.from('favorites').select('story_id').eq('user_id', user.id),
  ]);
  auth.profile = p.data;
  auth.membership = m.data;
  auth.favs = new Set((f.data || []).map(x => x.story_id));
}

export async function refreshAuth() {
  const { data } = await sb.auth.getSession();
  await setUser(data.session?.user || null);
}

export async function initAuth() {
  if (!sb) return;
  await refreshAuth();
  sb.auth.onAuthStateChange((event, session) => {
    if (event === 'INITIAL_SESSION') return;
    // setTimeout avoids a known Supabase deadlock when calling the database inside this callback
    setTimeout(async () => {
      await setUser(session?.user || null);
      if (event === 'PASSWORD_RECOVERY') location.hash = '#/reset';
      listeners.forEach(fn => fn(event));
    }, 0);
  });
}
