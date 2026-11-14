import { getHomeData, getContinueListening } from '../api.js';
import { auth } from '../auth.js';
import { esc, gradFor, cover, favBtn, fmtDuration, storyCard, sectionRow, emptyState, errorState, skeletonHome } from '../ui.js';

const ARROW_L = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg>';
const ARROW_R = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 5l7 7-7 7"/></svg>';

function slide(s, i, total) {
  const href = `#/story/${encodeURIComponent(s.slug)}`;
  const meta = [s.category?.name, s.author && `by ${s.author}`, fmtDuration(s.duration_seconds), s.access === 'premium' ? 'Premium' : 'Free']
    .filter(Boolean).map(esc).join(' · ');
  const bg = s.cover_url ? `--bgimg:url(&quot;${esc(s.cover_url)}&quot;);` : '';
  return `
  <section class="hero" style="--g:${gradFor(s.category?.slug)};${bg}" role="group" aria-roledescription="slide" aria-label="${i + 1} of ${total}">
    <div class="hero-text">
      <div class="eyebrow">Featured story</div>
      <h1>${esc(s.title)}</h1>
      <div class="meta">${meta}</div>
      <p class="desc">${esc(s.description || '')}</p>
      <div class="hero-actions"><button class="btn btn-primary" data-play="${esc(s.id)}">Listen now</button>${favBtn(s)}<a class="btn btn-ghost btn-sm" href="${href}">Details</a></div>
    </div>
    <div class="hero-cover">${cover(s)}</div>
  </section>`;
}

function heroSlider(list) {
  const many = list.length > 1;
  return `
  <div class="hero-slider" role="region" aria-roledescription="carousel" aria-label="Featured stories">
    <div class="hero-track">${list.map((s, i) => slide(s, i, list.length)).join('')}</div>
    ${many ? `
    <button class="hero-arrow prev" type="button" aria-label="Previous featured story">${ARROW_L}</button>
    <button class="hero-arrow next" type="button" aria-label="Next featured story">${ARROW_R}</button>
    <div class="hero-dots">${list.map((_, i) => `<button type="button" class="hero-dot${i === 0 ? ' on' : ''}" data-slide="${i}" aria-label="Show featured story ${i + 1}"></button>`).join('')}</div>` : ''}
  </div>`;
}

// slides on its own every few seconds; stops when touched, hovered or focused
function initHeroSlider(box) {
  const track = box?.querySelector('.hero-track');
  if (!track || track.children.length < 2) return;
  const n = track.children.length, dots = [...box.querySelectorAll('.hero-dot')];
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let i = 0, hover = false, lastTouch = 0;

  const mark = () => dots.forEach((d, k) => { d.classList.toggle('on', k === i); d.setAttribute('aria-current', String(k === i)); });
  const go = k => {
    i = (k + n) % n;
    track.scrollTo({ left: i * track.clientWidth, behavior: reduced ? 'auto' : 'smooth' });
    mark();
  };
  track.addEventListener('scroll', () => {
    const k = Math.round(track.scrollLeft / track.clientWidth);
    if (k !== i && k >= 0 && k < n) { i = k; mark(); }
  }, { passive: true });

  box.querySelector('.prev').addEventListener('click', () => { lastTouch = Date.now(); go(i - 1); });
  box.querySelector('.next').addEventListener('click', () => { lastTouch = Date.now(); go(i + 1); });
  dots.forEach(d => d.addEventListener('click', () => { lastTouch = Date.now(); go(Number(d.dataset.slide)); }));

  const touched = () => { lastTouch = Date.now(); };
  box.addEventListener('mouseenter', () => { hover = true; });
  box.addEventListener('mouseleave', () => { hover = false; });
  box.addEventListener('focusin', () => { hover = true; });
  box.addEventListener('focusout', () => { hover = false; });
  ['touchstart', 'pointerdown', 'keydown'].forEach(ev => box.addEventListener(ev, touched, { passive: true }));

  if (reduced) return; // people who prefer less motion swipe or use the arrows themselves
  const timer = setInterval(() => {
    if (!document.body.contains(box)) { clearInterval(timer); return; } // page changed
    if (document.hidden || hover || Date.now() - lastTouch < 7000) return;
    go(i + 1);
  }, 5500);
}

export async function home(root, _p, ctx) {
  root.innerHTML = skeletonHome();
  try {
    const [data, cont] = await Promise.all([getHomeData(), auth.user ? getContinueListening() : []]);
    if (ctx.stale()) return;
    if (!data.heroes.length && !data.sections.length) {
      root.innerHTML = emptyState('New stories are on the way', 'Nothing has been published yet. Please check back soon.');
      return;
    }
    let html = data.heroes.length ? heroSlider(data.heroes) : '';
    if (cont.length) {
      html += sectionRow('Continue Listening', cont.map(c => storyCard(c.story, { pct: c.pct })).join(''));
    }
    html += `<section class="section"><div class="section-head"><h2>Browse by Category</h2></div>
      <div class="chips">${data.categories.map(c => `<a class="chip" href="#/browse/${esc(c.slug)}">${esc(c.name)}</a>`).join('')}</div></section>`;
    html += data.sections.map(s => sectionRow(s.title, s.stories.map(x => storyCard(x)).join(''))).join('');
    root.innerHTML = html;
    initHeroSlider(root.querySelector('.hero-slider'));
  } catch (e) {
    if (!ctx.stale()) root.innerHTML = errorState(e);
  }
}
