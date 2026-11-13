import { getStory } from '../api.js';
import { auth, isPremium } from '../auth.js';
import { esc, cover, badge, favBtn, fmtDuration, emptyState, errorState } from '../ui.js';

export async function story(root, [slug], ctx) {
  root.innerHTML = '<div class="page"><div class="skel" style="height:300px;margin:0 16px"></div></div>';
  try {
    const res = await getStory(decodeURIComponent(slug));
    if (ctx.stale()) return;
    if (!res) {
      root.innerHTML = emptyState('Story not found', 'It may have been removed or is not published.', '<a class="btn btn-primary" href="#/browse">Browse stories</a>');
      return;
    }
    const { story: s, chapters } = res;
    const locked = s.access === 'premium' && !isPremium();
    const meta = [s.category?.name, fmtDuration(s.duration_seconds)].filter(Boolean).map(esc).join(' · ');
    root.innerHTML = `
    <div class="page">
      <div class="story-head">
        <div class="card-media" style="width:min(300px,72%);margin:0 auto;flex:none">${cover(s)}${badge(s)}</div>
        <div class="story-info">
          <div class="eyebrow" style="color:var(--muted)">${meta}</div>
          <h1>${esc(s.title)}</h1>
          <div class="by">${s.author ? `Written by ${esc(s.author)}` : ''}${s.author && s.narrator ? ' · ' : ''}${s.narrator ? `Narrated by ${esc(s.narrator)}` : ''}</div>
          <p class="desc">${esc(s.description || '')}</p>
          <div class="story-actions">${favBtn(s)}<span style="color:var(--muted);font-size:.9rem">${auth.favs.has(s.id) ? 'In your favourites' : 'Save to favourites'}</span></div>
        </div>
      </div>
      ${locked ? '<div class="notice gold">This is a Premium story. It will be available with a GolpoTune Premium membership.</div>' : ''}
      <div class="notice">The audio player is being added in the next build step. Until then, this page shows the story details and chapters.</div>
      <div class="section-head"><h2>Chapters</h2></div>
      ${chapters.length
        ? `<ol class="chapters">${chapters.map(c => `<li><span class="num">${c.chapter_number}</span><span class="ct">${esc(c.title)}</span><span class="dur">${fmtDuration(c.duration_seconds)}</span></li>`).join('')}</ol>`
        : '<div class="notice">Chapters have not been added yet.</div>'}
    </div>`;
  } catch (e) {
    if (!ctx.stale()) root.innerHTML = errorState(e);
  }
}
