import { sb } from '../supabase.js';
import { auth, refreshAuth } from '../auth.js';
import { esc, logo, GENDERS, GENRE_FALLBACK } from '../ui.js';
import { getCategories } from '../api.js';

const redirectUrl = () => location.origin + location.pathname;

function formPage(root, { title, sub, fields, button, foot, onSubmit }) {
  root.innerHTML = `
  <div class="auth-card">
    <h1>${esc(title)}</h1><p class="sub">${esc(sub)}</p>
    <form novalidate>
      ${fields.map(f => `<label class="field"><span>${esc(f.label)}</span>
        <input name="${f.name}" type="${f.type}" autocomplete="${f.auto || 'off'}" ${f.min ? `minlength="${f.min}"` : ''} required></label>`).join('')}
      <div class="form-msg" role="status"></div>
      <button class="btn btn-primary" type="submit">${esc(button)}</button>
    </form>
    <div class="auth-foot">${foot}</div>
  </div>`;
  const form = root.querySelector('form'), msg = root.querySelector('.form-msg'), btn = form.querySelector('button');
  const say = (t, kind) => { msg.textContent = t; msg.className = 'form-msg ' + kind; };
  form.addEventListener('submit', async e => {
    e.preventDefault();
    if (!form.checkValidity()) { say('Please fill in every field correctly.', 'err'); return; }
    btn.disabled = true; say('', '');
    try {
      const values = Object.fromEntries(new FormData(form));
      await onSubmit(values, say);
    } catch (err) {
      say(err.message || 'Something went wrong. Please try again.', 'err');
    } finally { btn.disabled = false; }
  });
}

const needLoggedOut = root => { if (auth.user) { location.hash = '#/'; return true; } return false; };

export function login(root) {
  if (needLoggedOut(root)) return;
  formPage(root, {
    title: 'Welcome back', sub: 'Log in to continue your stories.',
    fields: [
      { name: 'email', label: 'Email', type: 'email', auto: 'email' },
      { name: 'password', label: 'Password', type: 'password', auto: 'current-password' },
    ],
    button: 'Log in',
    foot: '<a href="#/forgot">Forgot password?</a><br>New here? <a href="#/signup">Create an account</a>',
    onSubmit: async v => {
      const { error } = await sb.auth.signInWithPassword({ email: v.email.trim(), password: v.password });
      if (error) throw error;
      await refreshAuth();
      location.hash = '#/';
    },
  });
}

/* ---------------- Sign up: a short step-by-step wizard ---------------- */
// While the last "Enjoy your stories" screen is showing, the app must not jump to the home page by itself.
export const hold = { signup: false };

const draft = {};
const resetDraft = () => Object.assign(draft, { name: '', email: '', password: '', gender: '', age: '', city: '', state: '', country: 'India', interests: [] });


const wizShell = (step, inner) => `
  <div class="auth-card wiz">
    <a class="logo-link lg" href="#/" aria-label="GolpoTune home">${logo()}</a>
    <div class="stepper" role="img" aria-label="Step ${step} of 3">${[1, 2, 3].map(n => `<i class="${n <= step ? 'on' : ''}"></i>`).join('')}</div>
    ${inner}
  </div>`;

/* ----- screen 1: login details ----- */
function showAccountStep(root) {
  root.innerHTML = wizShell(1, `
    <h1>Create your account</h1><p class="sub">Step 1 of 3 · Your login details</p>
    <form novalidate>
      <label class="field"><span>Your name</span><input name="name" type="text" autocomplete="name" maxlength="60" value="${esc(draft.name)}" required></label>
      <label class="field"><span>Email</span><input name="email" type="email" autocomplete="email" value="${esc(draft.email)}" required></label>
      <label class="field"><span>Password (at least 6 characters)</span><input name="password" type="password" autocomplete="new-password" minlength="6" value="${esc(draft.password)}" required></label>
      <div class="form-msg" role="status"></div>
      <button class="btn btn-primary" type="submit">Continue</button>
      <p class="legal-note">By continuing you agree to our <a href="#/terms" target="_blank" rel="noopener">Terms of Use</a> and <a href="#/privacy" target="_blank" rel="noopener">Privacy Policy</a>.</p>
    </form>
    <div class="auth-foot">Already have an account? <a href="#/login">Log in</a></div>`);
  const form = root.querySelector('form'), msg = root.querySelector('.form-msg');
  const bad = t => { msg.textContent = t; msg.className = 'form-msg err'; };
  form.addEventListener('submit', e => {
    e.preventDefault();
    const v = Object.fromEntries(new FormData(form));
    const name = v.name.trim(), email = v.email.trim();
    if (!name) return bad('Please enter your name.');
    if (!/^\S+@\S+\.\S+$/.test(email)) return bad('Please enter a valid email address.');
    if (v.password.length < 6) return bad('Your password needs at least 6 characters.');
    Object.assign(draft, { name, email, password: v.password });
    showPersonalStep(root);
  });
  form.name.focus();
}

/* ----- screen 2: personal information (optional) ----- */
function showPersonalStep(root) {
  root.innerHTML = wizShell(2, `
    <h1>About you</h1><p class="sub">Step 2 of 3 · Optional. This helps us suggest better stories.</p>
    <form novalidate>
      <fieldset class="field"><legend>Gender</legend>
        <div class="seg">${GENDERS.map(([k, t]) => `<label><input type="radio" name="gender" value="${k}" ${draft.gender === k ? 'checked' : ''}><span>${t}</span></label>`).join('')}</div>
      </fieldset>
      <label class="field"><span>Age</span><input name="age" type="number" inputmode="numeric" min="5" max="120" value="${esc(draft.age)}" placeholder="e.g. 25"></label>
      <label class="field"><span>City</span><input name="city" type="text" autocomplete="address-level2" maxlength="80" value="${esc(draft.city)}" placeholder="e.g. Kolkata"></label>
      <div class="row2">
        <label class="field"><span>State</span><input name="state" type="text" autocomplete="address-level1" maxlength="80" value="${esc(draft.state)}" placeholder="e.g. West Bengal"></label>
        <label class="field"><span>Country</span><input name="country" type="text" autocomplete="country-name" maxlength="80" value="${esc(draft.country)}"></label>
      </div>
      <div class="form-msg" role="status"></div>
      <button class="btn btn-primary" type="submit">Continue</button>
      <div class="wiz-links"><button type="button" class="link-btn" data-back>&larr; Back</button><button type="button" class="link-btn" data-skip>Skip for now</button></div>
    </form>`);
  const form = root.querySelector('form'), msg = root.querySelector('.form-msg');
  const save = () => {
    const v = Object.fromEntries(new FormData(form));
    Object.assign(draft, {
      gender: v.gender || '', age: (v.age || '').trim(), city: (v.city || '').trim(),
      state: (v.state || '').trim(), country: (v.country || '').trim(),
    });
  };
  form.addEventListener('submit', e => {
    e.preventDefault();
    save();
    if (draft.age !== '') {
      const n = Number(draft.age);
      if (!Number.isInteger(n) || n < 5 || n > 120) {
        msg.textContent = 'Please enter an age between 5 and 120, or leave it empty.'; msg.className = 'form-msg err'; return;
      }
    }
    showInterestsStep(root);
  });
  form.querySelector('[data-back]').addEventListener('click', () => { save(); showAccountStep(root); });
  form.querySelector('[data-skip]').addEventListener('click', () => {
    Object.assign(draft, { gender: '', age: '', city: '', state: '', country: '' });
    showInterestsStep(root);
  });
}

/* ----- screen 3: favourite genres, up to 3 (optional) ----- */
async function showInterestsStep(root) {
  let genres = GENRE_FALLBACK;
  try { const list = await getCategories(); if (list.length) genres = list; } catch { /* use the standard list */ }

  root.innerHTML = wizShell(3, `
    <h1>What do you love to hear?</h1><p class="sub">Step 3 of 3 · Pick up to 3 genres. Optional.</p>
    <div class="genres" role="group" aria-label="Favourite genres">
      ${genres.map(g => `<button type="button" class="genre" data-g="${esc(g.slug)}" aria-pressed="${draft.interests.includes(g.slug)}">${esc(g.name)}</button>`).join('')}
    </div>
    <div class="form-msg" role="status" id="gmsg"></div>
    <button class="btn btn-primary" type="button" id="finish">Finish</button>
    <div class="wiz-links"><button type="button" class="link-btn" data-back>&larr; Back</button><button type="button" class="link-btn" data-skip>Skip for now</button></div>`);

  const msg = root.querySelector('#gmsg'), all = [...root.querySelectorAll('.genre')];
  const say = (t, kind = 'err') => { msg.textContent = t; msg.className = 'form-msg ' + kind; };
  const count = () => { say(draft.interests.length ? `${draft.interests.length} of 3 selected` : '', 'ok'); };
  count();

  root.querySelector('.genres').addEventListener('click', e => {
    const b = e.target.closest('.genre');
    if (!b) return;
    const slug = b.dataset.g, i = draft.interests.indexOf(slug);
    if (i >= 0) draft.interests.splice(i, 1);
    else if (draft.interests.length >= 3) { say('You can choose up to 3 genres.'); return; }
    else draft.interests.push(slug);
    b.setAttribute('aria-pressed', String(draft.interests.includes(slug)));
    count();
  });

  const buttons = root.querySelectorAll('#finish, .link-btn');
  const finish = async () => {
    buttons.forEach(b => (b.disabled = true));
    say('');
    try { await createAccount(root); }
    catch (err) {
      say(err.message || 'Something went wrong. Please try again.');
      buttons.forEach(b => (b.disabled = false));
    }
  };
  root.querySelector('#finish').addEventListener('click', finish);
  root.querySelector('[data-skip]').addEventListener('click', () => { draft.interests = []; finish(); });
  root.querySelector('[data-back]').addEventListener('click', () => showPersonalStep(root));
}

/* ----- create the account, then show the final screen ----- */
async function createAccount(root) {
  const meta = { display_name: draft.name };
  if (draft.gender) meta.gender = draft.gender;
  if (draft.age) meta.age = Number(draft.age);
  if (draft.city) meta.city = draft.city;
  if (draft.state) meta.state = draft.state;
  if (draft.country) meta.country = draft.country;
  if (draft.interests.length) meta.interests = draft.interests.slice(0, 3);

  hold.signup = true; // stay on this page even if the account is logged in straight away
  const { name, email } = draft;
  let data, error;
  try {
    ({ data, error } = await sb.auth.signUp({
      email, password: draft.password,
      options: { data: meta, emailRedirectTo: redirectUrl() },
    }));
  } catch (e) { error = e; }
  const exists = !!data?.user && Array.isArray(data.user.identities) && data.user.identities.length === 0;
  if (error || exists) {
    hold.signup = false;
    if (exists || /already|registered|exists/i.test(error.message || '')) throw new Error('This email already has an account. Please log in instead.');
    throw error;
  }
  resetDraft();
  if (data.session) await refreshAuth();
  showDone(root, { name, email, verified: !!data.session });
}

/* ----- final screen ----- */
function showDone(root, { name, email, verified }) {
  root.innerHTML = `
  <div class="auth-card wiz done">
    <div class="done-badge" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 15v-3a8 8 0 0 1 16 0v3"/><rect x="3" y="14" width="4" height="6" rx="1.5"/><rect x="17" y="14" width="4" height="6" rx="1.5"/></svg></div>
    <h1>Enjoy your <span class="accent-text">stories!</span></h1>
    <p class="sub">Welcome to GolpoTune, ${esc(name)}. Your favourite audio station is ready for you.</p>
    ${verified ? '' : `<div class="verify-note" role="status"><b>One last thing: verify your email</b>
      <span>We sent a link to <b>${esc(email)}</b>. Open it and you will land straight on your GolpoTune home screen, already logged in. If you cannot see it, check your spam folder.</span></div>`}
    <a class="btn btn-primary" href="#/">Listen now</a>
    ${verified ? '' : '<div class="auth-foot">Already verified? <a href="#/login">Log in</a></div>'}
  </div>`;
  root.querySelector('.btn').focus();
}

export function signup(root) {
  if (needLoggedOut(root)) return;
  hold.signup = false;
  resetDraft();
  showAccountStep(root);
}

export function forgot(root) {
  formPage(root, {
    title: 'Reset password', sub: 'Enter your email and we will send you a reset link.',
    fields: [{ name: 'email', label: 'Email', type: 'email', auto: 'email' }],
    button: 'Send reset link',
    foot: '<a href="#/login">Back to log in</a>',
    onSubmit: async (v, say) => {
      const { error } = await sb.auth.resetPasswordForEmail(v.email.trim(), { redirectTo: redirectUrl() });
      if (error) throw error;
      say('If that email has an account, a reset link is on its way.', 'ok');
    },
  });
}

export function reset(root) {
  if (!auth.user) {
    root.innerHTML = `<div class="auth-card"><h1>Link expired</h1><p class="sub">Please request a new password reset link.</p>
      <a class="btn btn-primary" href="#/forgot">Request new link</a></div>`;
    return;
  }
  formPage(root, {
    title: 'Choose a new password', sub: 'Make it at least 6 characters.',
    fields: [{ name: 'password', label: 'New password', type: 'password', auto: 'new-password', min: 6 }],
    button: 'Save password', foot: '',
    onSubmit: async (v, say) => {
      const { error } = await sb.auth.updateUser({ password: v.password });
      if (error) throw error;
      say('Password updated. Taking you home…', 'ok');
      setTimeout(() => (location.hash = '#/'), 1200);
    },
  });
}
