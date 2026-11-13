import { getHomeData, getContinueListening, getPicksForGenres } from '../api.js';
import { auth } from '../auth.js';
import { esc, gradFor, cover, favBtn, fmtDuration, storyCard, sectionRow, emptyState, errorState, skeletonHome } from '../ui.js';

function slide(s, i, n) {
  const href = `#/story/${encodeURIComponent(s.slug)}`;
  const meta = [s.category?.name, s.author && `by ${s.author}`, fmtDuration(s.duration_seconds), s.access === 'premium' ? 'Premium' : 'Free']
    .filter(Boolean).map(esc).join(' · ');
  return `
  <section class="hero" style="--g:${gradFor(s.category?.slug)}" role="group" aria-roledescription="slide" aria-label="${i + 1} of ${n}">
    <div class="hero-text">
      <div class="eyebrow">Featured story</div>
      <h1>${esc(s.title)}</h1>
      <div class="meta">${meta}</div>
      <p class="desc">${esc(s.description || '')}</p>
      <div class="hero-actions"><a class="btn btn-primary" href="${href}">Listen now</a>${favBtn(s)}</div>
    </div>
    <div class="hero-cover">${cover(s)}</div>
  </section>`;
}

function slider(list) {
  if (!list.length) return '';
  const many = list.length > 1;
  return `
  <div class="hero-slider" role="region" aria-roledescription="carousel" aria-label="Featured stories">
    <div class="hero-track">${list.map((s, i) => slide(s, i, list.length)).join('')}</div>
    ${many ? `
    <button type="button" class="hero-arrow prev" data-dir="-1" aria-label="Previous featured story">&#8249;</button>
    <button type="button" class="hero-arrow next" data-dir="1" aria-label="Next featured story">&#8250;</button>
    <div class="hero-dots">${list.map((_, i) =>
      `<button type="button" class="dot${i === 0 ? ' on' : ''}" data-go="${i}" aria-label="Show featured story ${i + 1}"></button>`).join('')}</div>` : ''}
  </div>`;
}

// Swipe (native scroll-snap), dots, arrows and a gentle auto-slide.
function initSlider(root) {
  const el = root.querySelector('.hero-slider');
  const track = el?.querySelector('.hero-track');
  const dots = el ? [...el.querySelectorAll('.dot')] : [];
  const n = dots.length;
  if (n < 2) return;
  let idx = 0, paused = false;

  const go = i => track.scrollTo({ left: (((i % n) + n) % n) * track.clientWidth, behavior: 'smooth' });
  track.addEventListener('scroll', () => {
    const i = Math.round(track.scrollLeft / (track.clientWidth || 1));
    if (i === idx) return;
    idx = i;
    dots.forEach((d, k) => d.classList.toggle('on', k === i));
  }, { passive: true });

  el.addEventListener('click', e => {
    const dot = e.target.closest('[data-go]');
    const arrow = e.target.closest('[data-dir]');
    if (dot) go(+dot.dataset.go);
    else if (arrow) go(idx + +arrow.dataset.dir);
  });

  // keep the current slide in place if the screen is rotated / resized
  if ('ResizeObserver' in window) new ResizeObserver(() => { track.scrollLeft = idx * track.clientWidth; }).observe(track);

  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const timer = setInterval(() => {
    if (!document.body.contains(el)) { clearInterval(timer); return; }  // user left the home page
    if (!paused && !document.hidden) go(idx + 1);
  }, 5000);
  const pause = () => { paused = true; }, resume = () => { paused = false; };
  el.addEventListener('pointerenter', pause); el.addEventListener('pointerleave', resume);
  el.addEventListener('touchstart', pause, { passive: true }); el.addEventListener('touchend', resume, { passive: true });
  el.addEventListener('focusin', pause); el.addEventListener('focusout', resume);
}

export async function home(root, _p, ctx) {
  root.innerHTML = skeletonHome();
  try {
    const genres = auth.user?.user_metadata?.genres || [];
    const [data, cont, picks] = await Promise.all([
      getHomeData(),
      auth.user ? getContinueListening() : [],
      genres.length ? getPicksForGenres(genres).catch(() => []) : [],
    ]);
    if (ctx.stale()) return;
    if (!data.heroes.length && !data.sections.length) {
      root.innerHTML = emptyState('New stories are on the way', 'Nothing has been published yet. Please check back soon.');
      return;
    }
    let html = slider(data.heroes);
    if (picks.length) {
      html += sectionRow('Picked for you', picks.map(x => storyCard(x)).join(''));
    }
    if (cont.length) {
      html += sectionRow('Continue Listening', cont.map(c => storyCard(c.story, { pct: c.pct })).join(''));
    }
    html += `<section class="section"><div class="section-head"><h2>Browse by Category</h2></div>
      <div class="chips">${data.categories.map(c => `<a class="chip" href="#/browse/${esc(c.slug)}">${esc(c.name)}</a>`).join('')}</div></section>`;
    html += data.sections.map(s => sectionRow(s.title, s.stories.map(x => storyCard(x)).join(''))).join('');
    root.innerHTML = html;
    initSlider(root);
  } catch (e) {
    if (!ctx.stale()) root.innerHTML = errorState(e);
  }
}
