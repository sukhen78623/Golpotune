// Library (favourites) and Account pages.
import { sb } from '../supabase.js';
import { auth, isPremium } from '../auth.js';
import { getFavouriteStories, updateDisplayName } from '../api.js';
import { esc, storyCard, emptyState, errorState, skeletonGrid, toast } from '../ui.js';

const loginPrompt = (title, text) =>
  emptyState(title, text, '<a class="btn btn-primary" href="#/login">Log in</a> <a class="btn" href="#/signup">Sign up</a>');

export async function library(root, _p, ctx) {
  if (!auth.user) { root.innerHTML = loginPrompt('Your library', 'Log in to see the stories you have saved.'); return; }
  root.innerHTML = `<div class="page"><h1>My Favourites</h1>${skeletonGrid()}</div>`;
  try {
    const stories = await getFavouriteStories();
    if (ctx.stale()) return;
    root.innerHTML = `<div class="page"><h1>My Favourites</h1>${stories.length
      ? `<div class="grid">${stories.map(s => storyCard(s)).join('')}</div>`
      : emptyState('No favourites yet', 'Tap the heart on any story to save it here.', '<a class="btn btn-primary" href="#/browse">Browse stories</a>')}</div>`;
  } catch (e) { if (!ctx.stale()) root.innerHTML = errorState(e); }
}

export function account(root) {
  if (!auth.user) { root.innerHTML = loginPrompt('Your account', 'Log in to manage your account.'); return; }
  const premium = isPremium();
  root.innerHTML = `
  <div class="page">
    <h1>My Account</h1>
    <div class="panel">
      <h3>Profile</h3>
      <div class="kv"><span>Email</span><span>${esc(auth.user.email)}</span></div>
      <form id="nameForm" style="margin-top:14px">
        <label class="field"><span>Display name</span><input name="name" value="${esc(auth.profile?.display_name || '')}" required></label>
        <button class="btn btn-sm" type="submit">Save name</button>
      </form>
    </div>
    <div class="panel">
      <h3>Membership</h3>
      <div class="kv"><span>Current plan</span><span class="pill ${premium ? 'premium' : 'free'}">${premium ? 'Premium' : 'Free'}</span></div>
      <p style="color:var(--muted);margin-top:10px;font-size:.92rem">${premium
        ? 'You can listen to every Premium story.'
        : 'Premium plans are not open yet. Payments will be connected in a later step.'}</p>
    </div>
    <div class="panel"><button class="btn" id="logoutBtn">Log out</button></div>
  </div>`;
  root.querySelector('#nameForm').addEventListener('submit', async e => {
    e.preventDefault();
    const name = new FormData(e.target).get('name').trim();
    if (!name) return;
    try { await updateDisplayName(name); toast('Name saved'); }
    catch (err) { toast(err.message || 'Could not save', 'err'); }
  });
  root.querySelector('#logoutBtn').addEventListener('click', async () => {
    await sb.auth.signOut();
    location.hash = '#/';
  });
}
