// Library (favourites) and My Profile pages.
import { sb } from '../supabase.js';
import { auth, isPremium } from '../auth.js';
import { getFavouriteStories, getCategories, updateProfile } from '../api.js';
import {
  esc, storyCard, emptyState, errorState, skeletonGrid, toast, renderChrome,
  GENDERS, GENRE_EMOJI, GENRE_FALLBACK, genderLabel,
} from '../ui.js';

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

export async function account(root, _p, ctx) {
  if (!auth.user) { root.innerHTML = loginPrompt('Your profile', 'Log in to see and edit your profile.'); return; }

  let genres = GENRE_FALLBACK;
  try { const list = await getCategories(); if (list.length) genres = list; } catch { /* standard list */ }
  if (ctx.stale()) return;

  let editing = false;
  const genreName = slug => genres.find(g => g.slug === slug)?.name || slug;

  function renderView() {
    const p = auth.profile || {};
    const name = p.display_name || auth.user.email.split('@')[0];
    const premium = isPremium();
    const none = '<span class="muted">Not added</span>';
    const row = (k, v) => `<div class="kv"><span>${k}</span><span>${v ? esc(v) : none}</span></div>`;
    const since = auth.user.created_at
      ? new Date(auth.user.created_at).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' }) : '';
    const interests = p.interests || [];
    root.innerHTML = `
    <div class="page">
      <h1>My Profile</h1>
      <div class="panel prof-head">
        <div class="avatar xl" aria-hidden="true">${esc(name.charAt(0).toUpperCase())}</div>
        <div class="prof-id">
          <h2>${esc(name)}</h2>
          <span class="muted prof-mail">${esc(auth.user.email)}</span>
          <span class="pill ${premium ? 'premium' : 'free'}">${premium ? 'Premium' : 'Free'} member</span>
        </div>
        <button class="btn btn-sm" data-edit>Edit profile</button>
      </div>
      <div class="panel">
        <h3>Personal details</h3>
        ${row('Gender', genderLabel(p.gender))}
        ${row('Age', p.age ? `${p.age} years` : '')}
        ${row('City', p.city)}
        ${row('State', p.state)}
        ${row('Country', p.country)}
        ${since ? `<div class="kv"><span>Member since</span><span>${esc(since)}</span></div>` : ''}
      </div>
      <div class="panel">
        <h3>Favourite genres</h3>
        ${interests.length
          ? `<div class="tags">${interests.map(s => `<span class="chip on"><span aria-hidden="true">${GENRE_EMOJI[s] || '✨'}</span> ${esc(genreName(s))}</span>`).join('')}</div>`
          : '<p class="muted">You have not chosen any genres yet.</p>'}
        <button class="btn btn-sm" data-edit style="margin-top:12px">${interests.length ? 'Change genres' : 'Add genres'}</button>
      </div>
      <div class="panel">
        <h3>Membership</h3>
        <div class="kv"><span>Current plan</span><span class="pill ${premium ? 'premium' : 'free'}">${premium ? 'Premium' : 'Free'}</span></div>
        <p class="muted" style="margin-top:10px;font-size:.92rem">${premium
          ? 'You can listen to every Premium story.'
          : 'Premium plans are not open yet. Payments will be connected in a later step.'}</p>
      </div>
      <div class="panel"><button class="btn" id="logoutBtn">Log out</button></div>
    </div>`;
    root.querySelectorAll('[data-edit]').forEach(b => b.addEventListener('click', () => { editing = true; render(); }));
    root.querySelector('#logoutBtn').addEventListener('click', async () => {
      await sb.auth.signOut();
      location.hash = '#/';
    });
  }

  function renderEdit() {
    const p = auth.profile || {};
    const picked = [...(p.interests || [])];
    root.innerHTML = `
    <div class="page">
      <h1>Edit Profile</h1>
      <form class="panel" id="editForm" novalidate>
        <label class="field"><span>Your name</span><input name="name" type="text" maxlength="60" value="${esc(p.display_name || '')}" required></label>
        <fieldset class="field"><legend>Gender</legend>
          <div class="seg">${GENDERS.map(([k, t]) => `<label><input type="radio" name="gender" value="${k}" ${p.gender === k ? 'checked' : ''}><span>${t}</span></label>`).join('')}</div>
        </fieldset>
        <label class="field"><span>Age</span><input name="age" type="number" inputmode="numeric" min="5" max="120" value="${esc(p.age ?? '')}"></label>
        <label class="field"><span>City</span><input name="city" type="text" maxlength="80" value="${esc(p.city || '')}"></label>
        <div class="row2">
          <label class="field"><span>State</span><input name="state" type="text" maxlength="80" value="${esc(p.state || '')}"></label>
          <label class="field"><span>Country</span><input name="country" type="text" maxlength="80" value="${esc(p.country || '')}"></label>
        </div>
        <fieldset class="field"><legend>Favourite genres (up to 3)</legend>
          <div class="genres">${genres.map(g => `<button type="button" class="genre" data-g="${esc(g.slug)}" aria-pressed="${picked.includes(g.slug)}"><span class="emo" aria-hidden="true">${GENRE_EMOJI[g.slug] || '✨'}</span>${esc(g.name)}</button>`).join('')}</div>
        </fieldset>
        <div class="form-msg" role="status"></div>
        <div class="btn-row"><button class="btn btn-primary" type="submit">Save changes</button><button class="btn" type="button" data-cancel>Cancel</button></div>
      </form>
    </div>`;
    const form = root.querySelector('#editForm'), msg = root.querySelector('.form-msg');
    const say = (t, kind = 'err') => { msg.textContent = t; msg.className = 'form-msg ' + kind; };

    form.querySelector('.genres').addEventListener('click', e => {
      const b = e.target.closest('.genre');
      if (!b) return;
      const slug = b.dataset.g, i = picked.indexOf(slug);
      if (i >= 0) picked.splice(i, 1);
      else if (picked.length >= 3) { say('You can choose up to 3 genres.'); return; }
      else picked.push(slug);
      b.setAttribute('aria-pressed', String(picked.includes(slug)));
      say('');
    });
    form.querySelector('[data-cancel]').addEventListener('click', () => { editing = false; render(); });
    form.addEventListener('submit', async e => {
      e.preventDefault();
      const v = Object.fromEntries(new FormData(form));
      const f = {
        display_name: (v.name || '').trim(), gender: v.gender || '', age: (v.age || '').trim(),
        city: (v.city || '').trim(), state: (v.state || '').trim(), country: (v.country || '').trim(), interests: picked,
      };
      if (!f.display_name) return say('Please enter your name.');
      if (f.age !== '') {
        const n = Number(f.age);
        if (!Number.isInteger(n) || n < 5 || n > 120) return say('Please enter an age between 5 and 120, or leave it empty.');
      }
      const btns = form.querySelectorAll('button');
      btns.forEach(b => (b.disabled = true));
      try {
        await updateProfile(f);
        editing = false;
        renderChrome('account');
        toast('Profile updated');
        render();
        window.scrollTo(0, 0);
      } catch (err) {
        say(err.message || 'Could not save. Please try again.');
        btns.forEach(b => (b.disabled = false));
      }
    });
    form.name.focus();
  }

  const render = () => (editing ? renderEdit() : renderView());
  render();
}
