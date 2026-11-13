// GolpoTune - multi-step sign up:
// 1) account  2) about you  3) favourite genres (max 3)  4) welcome screen -> home.
// Nothing is sent to the server until the last step, so there are no half-made accounts.
// Extra details (age, city, genres...) are saved inside the user's own account data (user_metadata),
// so no database change is needed.
import { sb } from '../supabase.js';
import { auth, refreshAuth } from '../auth.js';
import { getCategories } from '../api.js';
import { esc, logo, gradFor, toast } from '../ui.js';

const MAX_GENRES = 3;
const EMOJI = {
  horror: '👻', thriller: '🕵️', mystery: '🔍', romance: '💖', fantasy: '🐉',
  fiction: '📖', adventure: '🧭', drama: '🎭', biography: '🎙️',
};
const FALLBACK = Object.keys(EMOJI).map(slug => ({ slug, name: slug[0].toUpperCase() + slug.slice(1) }));
const GENDERS = ['Female', 'Male', 'Other', 'Prefer not to say'];
const LANGS = ['Bangla', 'English', 'Both'];

const redirectUrl = () => location.origin + location.pathname;
const blank = () => ({ account: null, details: null, genres: [], busy: false, done: false, needsVerify: false });
let flow = blank();

function shell(root, step, title, sub, inner) {
  const bars = [1, 2, 3].map(n => `<i class="${n <= step ? 'on' : ''}"></i>`).join('');
  root.innerHTML = `
  <div class="ob">
    <div class="ob-logo">${logo()}</div>
    <div class="ob-progress" role="img" aria-label="Step ${step} of 3">${bars}</div>
    <div class="ob-step">Step ${step} of 3</div>
    <div class="ob-card">
      <h1>${esc(title)}</h1>
      <p class="sub">${esc(sub)}</p>
      ${inner}
    </div>
  </div>`;
  return root.querySelector('.ob-card');
}

function messenger(card) {
  const box = card.querySelector('.form-msg');
  return (text, kind = 'err') => { box.textContent = text; box.className = 'form-msg ' + (text ? kind : ''); };
}

/* ---------- step 1: account ---------- */
function stepAccount(root) {
  const a = flow.account || {};
  const card = shell(root, 1, 'Create your account', 'Start with the basics. It takes under a minute.', `
    <form novalidate>
      <label class="field"><span>Your name</span>
        <input name="name" type="text" autocomplete="name" value="${esc(a.name)}" required></label>
      <label class="field"><span>Email</span>
        <input name="email" type="email" inputmode="email" autocomplete="email" value="${esc(a.email)}" required></label>
      <label class="field"><span>Password (at least 6 characters)</span>
        <div class="pw">
          <input name="password" type="password" autocomplete="new-password" minlength="6" value="${esc(a.password)}" required>
          <button type="button" class="pw-toggle" aria-label="Show password">Show</button>
        </div></label>
      <div class="form-msg" role="status"></div>
      <button class="btn btn-primary btn-block" type="submit">Continue</button>
    </form>
    <div class="auth-foot">Already have an account? <a href="#/login">Log in</a></div>`);
  const form = card.querySelector('form'), say = messenger(card);
  const pw = form.elements.password, toggle = card.querySelector('.pw-toggle');
  toggle.addEventListener('click', () => {
    const show = pw.type === 'password';
    pw.type = show ? 'text' : 'password';
    toggle.textContent = show ? 'Hide' : 'Show';
    toggle.setAttribute('aria-label', show ? 'Hide password' : 'Show password');
  });
  form.addEventListener('submit', e => {
    e.preventDefault();
    const v = Object.fromEntries(new FormData(form));
    const name = v.name.trim(), email = v.email.trim();
    if (!name) return say('Please enter your name.');
    if (!/^\S+@\S+\.\S+$/.test(email)) return say('Please enter a valid email address.');
    if (v.password.length < 6) return say('Your password needs at least 6 characters.');
    flow.account = { name, email, password: v.password };
    location.hash = '#/signup/details';
  });
}

/* ---------- step 2: about you ---------- */
const radios = (name, list, current) => `<div class="opts" role="radiogroup">${list.map(v =>
  `<label class="opt"><input type="radio" name="${name}" value="${esc(v)}" ${current === v ? 'checked' : ''}><span>${esc(v)}</span></label>`).join('')}</div>`;

function stepDetails(root) {
  const d = flow.details || {};
  const card = shell(root, 2, 'Tell us about you', 'This helps us tune GolpoTune to you.', `
    <form novalidate>
      <label class="field"><span>Age</span>
        <input name="age" type="number" inputmode="numeric" min="5" max="100" value="${esc(d.age)}" required></label>
      <label class="field"><span>City</span>
        <input name="city" type="text" autocomplete="address-level2" value="${esc(d.city)}" required></label>
      <div class="field group"><span>Gender (optional)</span>${radios('gender', GENDERS, d.gender)}</div>
      <div class="field group"><span>Story language (optional)</span>${radios('language', LANGS, d.language)}</div>
      <div class="form-msg" role="status"></div>
      <div class="ob-actions">
        <a class="btn btn-ghost" href="#/signup">Back</a>
        <button class="btn btn-primary" type="submit">Continue</button>
      </div>
    </form>`);
  const form = card.querySelector('form'), say = messenger(card);
  form.addEventListener('submit', e => {
    e.preventDefault();
    const v = Object.fromEntries(new FormData(form));
    const age = Number(v.age), city = (v.city || '').trim();
    if (!Number.isInteger(age) || age < 5 || age > 100) return say('Please enter your age (5 to 100).');
    if (!city) return say('Please enter your city.');
    flow.details = { age, city, gender: v.gender || '', language: v.language || '' };
    location.hash = '#/signup/interests';
  });
}

/* ---------- step 3: genres + create the account ---------- */
async function createAccount() {
  const { account: a, details: d, genres } = flow;
  flow.busy = true;
  try {
    const { data, error } = await sb.auth.signUp({
      email: a.email, password: a.password,
      options: {
        data: { display_name: a.name, age: d.age, city: d.city, gender: d.gender, language: d.language, genres, onboarded: true },
        emailRedirectTo: redirectUrl(),
      },
    });
    if (error) throw error;
    // with email confirmation on, Supabase hides "already registered" by returning a user with no identities
    if (data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) {
      throw new Error('This email already has an account. Please log in instead.');
    }
    if (data.session) await refreshAuth(); else flow.needsVerify = true;
    flow.done = true;
    location.hash = '#/signup/welcome';
  } finally { flow.busy = false; }
}

async function stepInterests(root, ctx) {
  const card = shell(root, 3, 'What do you love to hear?', `Pick up to ${MAX_GENRES} genres. We’ll fill your home with them.`, `
    <div class="genres">${'<div class="skel" style="height:84px"></div>'.repeat(4)}</div>
    <div class="ob-count" aria-live="polite"></div>
    <div class="form-msg" role="status"></div>
    <div class="ob-actions">
      <a class="btn btn-ghost" href="#/signup/details">Back</a>
      <button class="btn btn-primary" type="button" id="finish" disabled>Create my account</button>
    </div>`);
  const grid = card.querySelector('.genres'), count = card.querySelector('.ob-count');
  const finish = card.querySelector('#finish'), say = messenger(card);

  let cats = [];
  try { cats = await getCategories(); } catch (e) { console.error(e); }
  if (ctx.stale()) return;
  if (!cats.length) cats = FALLBACK;
  flow.genres = flow.genres.filter(s => cats.some(c => c.slug === s));

  grid.innerHTML = cats.map(c => `
    <button type="button" class="genre" data-slug="${esc(c.slug)}" style="--g:${gradFor(c.slug)}" aria-pressed="${flow.genres.includes(c.slug)}">
      <span class="g-emoji" aria-hidden="true">${EMOJI[c.slug] || '🎧'}</span><span>${esc(c.name)}</span>
    </button>`).join('');

  const sync = () => {
    const n = flow.genres.length;
    count.textContent = `${n} of ${MAX_GENRES} picked`;
    finish.disabled = n === 0;
    grid.querySelectorAll('.genre').forEach(b =>
      b.classList.toggle('dim', n >= MAX_GENRES && !flow.genres.includes(b.dataset.slug)));
  };
  sync();

  grid.addEventListener('click', e => {
    const b = e.target.closest('.genre');
    if (!b) return;
    const slug = b.dataset.slug, at = flow.genres.indexOf(slug);
    if (at > -1) flow.genres.splice(at, 1);
    else if (flow.genres.length >= MAX_GENRES) { toast(`You can pick up to ${MAX_GENRES} genres`); return; }
    else flow.genres.push(slug);
    b.setAttribute('aria-pressed', flow.genres.includes(slug));
    say('');
    sync();
  });

  finish.addEventListener('click', async () => {
    finish.disabled = true; finish.textContent = 'Creating your account…'; say('');
    try { await createAccount(); }
    catch (err) {
      say(err.message || 'Something went wrong. Please try again.');
      finish.textContent = 'Create my account'; sync();
    }
  });
}

/* ---------- step 4: welcome ---------- */
function welcome(root) {
  const first = (flow.account?.name || auth.profile?.display_name || '').trim().split(/\s+/)[0];
  root.innerHTML = `
  <div class="ob ob-welcome">
    <div class="ob-logo">${logo()}</div>
    <div class="eq" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i><i></i><i></i></div>
    <h1>Enjoy your stories</h1>
    <p class="sub">${first ? `You’re all set, ${esc(first)}. ` : ''}Your first story is waiting.</p>
    ${flow.needsVerify ? `<div class="notice">We sent a verification link to <b>${esc(flow.account?.email)}</b>. Open it once, then log in to start listening.</div>` : ''}
    <button class="btn btn-primary btn-lg btn-block" id="listen">${flow.needsVerify ? 'Log in to listen' : 'Listen Now'}</button>
  </div>`;
  root.querySelector('#listen').addEventListener('click', () => {
    const next = flow.needsVerify ? '#/login' : '#/';
    flow = blank();
    location.hash = next;
  });
}

/* ---------- router entry ---------- */
export async function signup(root, [step], ctx) {
  if (flow.busy) return;  // account is being created; the welcome screen takes over when it is done
  if (step === 'welcome') {
    if (!flow.done) { location.hash = auth.user ? '#/' : '#/signup'; return; }
    return welcome(root);
  }
  if (flow.done) flow = blank();
  if (auth.user) { location.hash = '#/'; return; }
  if (step === 'details') {
    if (!flow.account) { location.hash = '#/signup'; return; }
    return stepDetails(root);
  }
  if (step === 'interests') {
    if (!flow.account) { location.hash = '#/signup'; return; }
    if (!flow.details) { location.hash = '#/signup/details'; return; }
    return stepInterests(root, ctx);
  }
  return stepAccount(root);
}
