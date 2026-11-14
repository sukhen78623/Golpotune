import { getStory, getProgress } from '../api.js';
import { auth, canListen } from '../auth.js';
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
    const locked = !canListen(s);

    // where did this person stop last time?
    let resume = null;
    if (auth.user) {
      try {
        const p = await getProgress(s.id);
        if (p && !p.completed) resume = chapters.find(c => c.id === p.chapter_id) || null;
      } catch { /* just show Play */ }
      if (ctx.stale()) return;
    }

    const meta = [s.category?.name, fmtDuration(s.duration_seconds)].filter(Boolean).map(esc).join(' · ');
    const playLabel = locked ? 'Premium story' : resume ? `Resume · Chapter ${resume.chapter_number}` : 'Play';
    root.innerHTML = `
    <div class="page">
      <div class="story-head">
        <div class="card-media" style="width:min(300px,72%);margin:0 auto;flex:none">${cover(s)}${badge(s)}</div>
        <div class="story-info">
          <div class="eyebrow" style="color:var(--muted)">${meta}</div>
          <h1>${esc(s.title)}</h1>
          <div class="by">${s.author ? `Written by ${esc(s.author)}` : ''}${s.author && s.narrator ? ' · ' : ''}${s.narrator ? `Narrated by ${esc(s.narrator)}` : ''}</div>
          <p class="desc">${esc(s.description || '')}</p>
          <div class="story-actions">
            <button class="btn btn-primary" data-play="${esc(s.id)}">${esc(playLabel)}</button>
            ${favBtn(s)}
          </div>
        </div>
      </div>
      ${locked ? '<div class="notice gold">This is a Premium story. It is available with a GolpoTune Premium membership.</div>' : ''}
      <div class="section-head" style="margin-top:24px"><h2>Chapters</h2></div>
      ${chapters.length
        ? `<ol class="chapters">${chapters.map(c => `
            <li class="has-btn"><button class="chap-row" data-play="${esc(s.id)}" data-chapter-id="${esc(c.id)}">
              <span class="num">${c.chapter_number}</span><span class="ct">${esc(c.title)}</span><span class="dur">${fmtDuration(c.duration_seconds)}</span>
            </button></li>`).join('')}</ol>`
        : '<div class="notice">Chapters have not been added yet.</div>'}
    </div>`;
  } catch (e) {
    if (!ctx.stale()) root.innerHTML = errorState(e);
  }
}
