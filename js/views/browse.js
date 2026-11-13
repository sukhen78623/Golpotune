import { getCategories, getStories } from '../api.js';
import { esc, storyCard, emptyState, errorState, skeletonGrid } from '../ui.js';

export async function browse(root, [slug], ctx) {
  root.innerHTML = `<div class="page"><h1>Browse</h1>${skeletonGrid()}</div>`;
  try {
    const cats = await getCategories();
    const current = cats.find(c => c.slug === slug);
    const stories = await getStories(current?.id);
    if (ctx.stale()) return;
    const chips = `<div class="chips" style="margin-bottom:18px">
      <a class="chip ${!current ? 'on' : ''}" href="#/browse">All</a>
      ${cats.map(c => `<a class="chip ${c.slug === slug ? 'on' : ''}" href="#/browse/${esc(c.slug)}">${esc(c.name)}</a>`).join('')}
    </div>`;
    const body = stories.length
      ? `<div class="grid">${stories.map(s => storyCard(s)).join('')}</div>`
      : emptyState('No stories here yet', current ? `Nothing in ${current.name} has been published yet.` : 'Nothing has been published yet.');
    root.innerHTML = `<div class="page"><h1>${esc(current ? current.name : 'Browse')}</h1>${chips}${body}</div>`;
  } catch (e) {
    if (!ctx.stale()) root.innerHTML = errorState(e);
  }
}
