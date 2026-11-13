import { getHomeData, getContinueListening } from '../api.js';
import { auth } from '../auth.js';
import { esc, gradFor, cover, favBtn, fmtDuration, storyCard, sectionRow, emptyState, errorState, skeletonHome } from '../ui.js';

function hero(s) {
  const href = `#/story/${encodeURIComponent(s.slug)}`;
  const meta = [s.category?.name, s.author && `by ${s.author}`, fmtDuration(s.duration_seconds), s.access === 'premium' ? 'Premium' : 'Free']
    .filter(Boolean).map(esc).join(' · ');
  return `
  <section class="hero" style="--g:${gradFor(s.category?.slug)}">
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

export async function home(root, _p, ctx) {
  root.innerHTML = skeletonHome();
  try {
    const [data, cont] = await Promise.all([getHomeData(), auth.user ? getContinueListening() : []]);
    if (ctx.stale()) return;
    if (!data.hero && !data.sections.length) {
      root.innerHTML = emptyState('New stories are on the way', 'Nothing has been published yet. Please check back soon.');
      return;
    }
    let html = data.hero ? hero(data.hero) : '';
    if (cont.length) {
      html += sectionRow('Continue Listening', cont.map(c => storyCard(c.story, { pct: c.pct })).join(''));
    }
    html += `<section class="section"><div class="section-head"><h2>Browse by Category</h2></div>
      <div class="chips">${data.categories.map(c => `<a class="chip" href="#/browse/${esc(c.slug)}">${esc(c.name)}</a>`).join('')}</div></section>`;
    html += data.sections.map(s => sectionRow(s.title, s.stories.map(x => storyCard(x)).join(''))).join('');
    root.innerHTML = html;
  } catch (e) {
    if (!ctx.stale()) root.innerHTML = errorState(e);
  }
}
