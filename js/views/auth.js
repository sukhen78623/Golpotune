import { sb } from '../supabase.js';
import { auth, refreshAuth } from '../auth.js';
import { esc } from '../ui.js';

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

export function signup(root) {
  if (needLoggedOut(root)) return;
  formPage(root, {
    title: 'Create your account', sub: 'Join GolpoTune, your favourite audio station.',
    fields: [
      { name: 'name', label: 'Your name', type: 'text', auto: 'name' },
      { name: 'email', label: 'Email', type: 'email', auto: 'email' },
      { name: 'password', label: 'Password (at least 6 characters)', type: 'password', auto: 'new-password', min: 6 },
    ],
    button: 'Sign up',
    foot: 'Already have an account? <a href="#/login">Log in</a>',
    onSubmit: async (v, say) => {
      const { data, error } = await sb.auth.signUp({
        email: v.email.trim(), password: v.password,
        options: { data: { display_name: v.name.trim() }, emailRedirectTo: redirectUrl() },
      });
      if (error) throw error;
      if (data.session) { await refreshAuth(); location.hash = '#/'; return; }
      say('Almost done! We sent a verification link to your email. Open it, then log in.', 'ok');
    },
  });
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
