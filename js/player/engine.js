// The audio engine: one <audio> element that keeps playing while you browse.
import { auth, canListen, onAuth } from '../auth.js';
import * as api from '../api.js';
import { toast } from '../ui.js';
import { buildRecs } from './recs.js';

export const audio = document.getElementById('audio');
export const SPEEDS = [0.75, 1, 1.25, 1.5, 1.75, 2];

// a tiny silent sound, played on the first tap so phones allow audio later
const SILENT = 'data:audio/wav;base64,' + btoa(String.fromCharCode(
  82, 73, 70, 70, 36, 0, 0, 0, 87, 65, 86, 69, 102, 109, 116, 32, 16, 0, 0, 0, 1, 0, 1, 0,
  64, 31, 0, 0, 64, 31, 0, 0, 1, 0, 8, 0, 100, 97, 116, 97, 0, 0, 0, 0));

export const player = {
  story: null, chapters: [], index: 0,
  playing: false, loading: false, buffering: false, error: null,
  speed: 1, volume: 1,
  sleepMode: null, sleepEndsAt: 0,
  autoplayNext: true, autoplayRec: false,
};

const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch { /* ignore */ } },
};

const subs = new Set();
export const subscribe = fn => { subs.add(fn); return () => subs.delete(fn); };
const emit = kind => subs.forEach(fn => { try { fn(kind); } catch (e) { console.error(e); } });

export const currentChapter = () => player.chapters[player.index] || null;
const live = () => !!player.story && !!audio.src && !audio.src.startsWith('data:');
export function duration() {
  const d = audio.duration;
  return Number.isFinite(d) && d > 0 ? d : (currentChapter()?.duration_seconds || 0);
}

let pendingSeek = null, retried = false, lastSave = 0, lastTime = 0, listenAccum = 0;
let loadToken = 0, sleepTimer = null, unlocked = false;

/* ---------------- start-up ---------------- */
export async function initPlayer() {
  const sp = parseFloat(store.get('gt_speed'));
  if (SPEEDS.includes(sp)) player.speed = sp;
  const vol = parseFloat(store.get('gt_volume'));
  if (vol >= 0 && vol <= 1) player.volume = vol;
  if (store.get('gt_autoplay_next') === '0') player.autoplayNext = false;
  if (store.get('gt_autoplay_rec') === '1') player.autoplayRec = true;
  audio.volume = player.volume;
  audio.defaultPlaybackRate = player.speed;
  audio.playbackRate = player.speed;

  audio.addEventListener('play', () => { if (!live()) return; player.playing = true; setMediaState(); emit('state'); });
  audio.addEventListener('pause', () => { if (!live()) return; player.playing = false; setMediaState(); flush(); emit('state'); });
  audio.addEventListener('waiting', () => { if (!live()) return; player.buffering = true; emit('state'); });
  audio.addEventListener('playing', () => { if (!live()) return; player.buffering = false; player.loading = false; emit('state'); });
  audio.addEventListener('loadedmetadata', () => {
    if (!live()) return;
    if (pendingSeek != null) {
      try { audio.currentTime = Math.min(pendingSeek, Math.max(0, audio.duration - 1)); } catch { /* ignore */ }
      pendingSeek = null;
    }
    emit('time');
  });
  audio.addEventListener('timeupdate', onTime);
  audio.addEventListener('ended', onEnded);
  audio.addEventListener('error', onError);

  document.addEventListener('visibilitychange', () => { if (document.hidden) flush(); });
  window.addEventListener('pagehide', flush);
  setupMediaSession();

  await loadSettings();
  onAuth(async ev => {
    if (ev === 'SIGNED_OUT') closePlayer();
    else await loadSettings();
  });
}

async function loadSettings() {
  if (!auth.user) return;
  try {
    const s = await api.getSettings();
    if (!s) return;
    const sp = Number(s.playback_speed);
    if (SPEEDS.includes(sp)) { player.speed = sp; audio.defaultPlaybackRate = sp; audio.playbackRate = sp; }
    player.autoplayNext = !!s.autoplay_next;
    player.autoplayRec = !!s.autoplay_recommended;
    emit('settings');
  } catch { /* keep local values */ }
}

// call this inside a tap/click so phones allow sound afterwards
export function unlock() {
  if (unlocked) return;
  unlocked = true;
  if (player.story) return;
  audio.src = SILENT;
  audio.play().then(() => { if (audio.src.startsWith('data:')) audio.pause(); }).catch(() => {});
}

/* ---------------- starting a story ---------------- */
export async function playStory(storyId, { chapterId = null, position = null, autoplay = true } = {}) {
  // same story already loaded: just continue / jump
  if (player.story?.id === storyId) {
    if (chapterId) {
      const i = player.chapters.findIndex(c => c.id === chapterId);
      if (i >= 0 && i !== player.index) { saveProgress(); return loadChapter(i, position || 0, autoplay); }
    }
    if (position != null) seek(position);
    if (autoplay && audio.paused) togglePlay();
    return;
  }

  let res;
  try { res = await api.getStoryById(storyId); }
  catch { toast('Could not open this story', 'err'); return; }
  if (!res) { toast('Story not found', 'err'); return; }
  if (!res.chapters.length) { toast('This story has no chapters yet', 'err'); return; }
  const s = res.story;
  if (!canListen(s)) {
    if (auth.user) { toast('This is a Premium story. A Premium membership is needed.'); location.hash = '#/account'; }
    else { toast('Log in with a Premium account to listen to this story.'); location.hash = '#/login'; }
    return;
  }

  if (player.story) { flushHistory(); saveProgress(); }
  player.story = s;
  player.chapters = res.chapters;
  player.index = 0;
  countPlay(s.id);

  let idx = 0, pos = 0;
  if (chapterId) {
    idx = Math.max(0, res.chapters.findIndex(c => c.id === chapterId));
    pos = position || 0;
  } else if (auth.user) {
    try {
      const p = await api.getProgress(s.id);
      if (p && p.chapter_id && !p.completed) {
        const i = res.chapters.findIndex(c => c.id === p.chapter_id);
        if (i >= 0) { idx = i; pos = p.position_seconds; }
      }
    } catch { /* start from the beginning */ }
  }
  await loadChapter(idx, pos, autoplay);
}

async function loadChapter(index, position = 0, autoplay = true) {
  const ch = player.chapters[index];
  if (!ch) return;
  flushHistory();
  const token = ++loadToken;
  player.index = index;
  player.loading = true;
  player.playing = false;
  player.error = null;
  retried = false;
  pendingSeek = position > 0 ? position : null;
  lastTime = position || 0;
  listenAccum = 0;
  lastSave = Date.now();
  emit('track');
  updateMediaSession();
  try {
    const url = await api.getAudioUrl(ch.id);
    if (token !== loadToken) return;
    audio.preload = 'metadata';
    audio.defaultPlaybackRate = player.speed;
    audio.src = url;
    audio.playbackRate = player.speed;
    if (autoplay) {
      await audio.play().catch(err => {
        if (err && err.name === 'NotAllowedError') toast('Tap the play button to start');
      });
    } else {
      player.loading = false;
    }
  } catch (e) {
    if (token !== loadToken) return;
    player.loading = false;
    player.error = e.message || 'Could not load audio';
    toast(player.error, 'err');
  }
  emit('state');
}

/* ---------------- controls ---------------- */
export function togglePlay() {
  if (!player.story) return;
  if (!live()) { loadChapter(player.index, pendingSeek || 0, true); return; }
  if (audio.paused) audio.play().catch(() => {}); else audio.pause();
}

export function seek(sec) {
  if (!player.story) return;
  const d = duration();
  sec = Math.max(0, d ? Math.min(sec, d) : sec);
  if (live() && audio.readyState > 0) audio.currentTime = sec; else pendingSeek = sec;
  emit('time');
}
export const skip = delta => seek((pendingSeek ?? audio.currentTime) + delta);

export function next() {
  if (player.index < player.chapters.length - 1) { saveProgress(); loadChapter(player.index + 1, 0, true); }
  else toast('This is the last chapter');
}
export function prev() {
  if (audio.currentTime > 5 || player.index === 0) seek(0);
  else { saveProgress(); loadChapter(player.index - 1, 0, true); }
}
export function jumpToChapter(i, pos = 0) {
  if (i === player.index) { seek(pos); if (audio.paused) togglePlay(); return; }
  saveProgress();
  loadChapter(i, pos, true);
}

export function setSpeed(v) {
  player.speed = v;
  audio.defaultPlaybackRate = v;
  audio.playbackRate = v;
  store.set('gt_speed', String(v));
  if (auth.user) api.saveSettings({ playback_speed: v }).catch(() => {});
  emit('settings');
}
export function setVolume(v) {
  player.volume = v;
  audio.volume = v;
  store.set('gt_volume', String(v));
  emit('settings');
}
export function setAutoplayNext(on) {
  player.autoplayNext = on;
  store.set('gt_autoplay_next', on ? '1' : '0');
  if (auth.user) api.saveSettings({ autoplay_next: on }).catch(() => {});
  emit('settings');
}
export function setAutoplayRec(on) {
  player.autoplayRec = on;
  store.set('gt_autoplay_rec', on ? '1' : '0');
  if (auth.user) api.saveSettings({ autoplay_recommended: on }).catch(() => {});
  emit('settings');
}

/* ---------------- sleep timer ---------------- */
function clearSleep() {
  clearTimeout(sleepTimer);
  sleepTimer = null;
  player.sleepMode = null;
  player.sleepEndsAt = 0;
}
// mode: 'off' | minutes (number) | 'chapter'
export function setSleep(mode) {
  clearSleep();
  if (mode && mode !== 'off') {
    player.sleepMode = mode;
    if (mode !== 'chapter') {
      player.sleepEndsAt = Date.now() + mode * 60000;
      sleepTimer = setTimeout(() => {
        audio.pause();
        clearSleep();
        emit('sleep');
        toast('Sleep timer finished. Good night!');
      }, mode * 60000);
    }
  }
  emit('sleep');
}

/* ---------------- progress + history ---------------- */
function saveProgressRaw(chapterId, position, completed) {
  if (!auth.user || !player.story) return;
  api.saveProgress({
    story_id: player.story.id, chapter_id: chapterId,
    position_seconds: Math.max(0, Math.floor(position)), completed,
  }).catch(() => {});
}
function saveProgress() {
  const ch = currentChapter();
  if (ch && live() && !audio.ended) saveProgressRaw(ch.id, audio.currentTime || 0, false);
}
function flushHistory() {
  const secs = Math.round(listenAccum);
  listenAccum = 0;
  if (secs < 5 || !auth.user || !player.story) return;
  api.logListening({ story_id: player.story.id, chapter_id: currentChapter()?.id || null, listened_seconds: secs }).catch(() => {});
}
function flush() { flushHistory(); saveProgress(); }

function countPlay(id) {
  let seen = [];
  try { seen = JSON.parse(sessionStorage.getItem('gt_counted') || '[]'); } catch { /* ignore */ }
  if (seen.includes(id)) return;
  seen.push(id);
  try { sessionStorage.setItem('gt_counted', JSON.stringify(seen)); } catch { /* ignore */ }
  api.incrementPlayCount(id);
}

/* ---------------- audio events ---------------- */
function onTime() {
  if (!live()) return;
  const t = audio.currentTime, d = t - lastTime;
  if (player.playing && d > 0 && d < 3) listenAccum += d;
  lastTime = t;
  emit('time');
  const now = Date.now();
  if (player.playing && now - lastSave > 10000) { lastSave = now; saveProgress(); }
  if (listenAccum >= 60) flushHistory();
  updatePositionState();
}

async function onEnded() {
  if (!live()) return;
  flushHistory();
  const nextCh = player.chapters[player.index + 1];
  if (nextCh) saveProgressRaw(nextCh.id, 0, false);
  else if (currentChapter()) saveProgressRaw(currentChapter().id, 0, true);

  if (player.sleepMode === 'chapter') {
    clearSleep();
    emit('sleep');
    toast('Sleep timer: stopped at the end of the chapter');
    if (nextCh) await loadChapter(player.index + 1, 0, false);
    return;
  }
  if (nextCh) { await loadChapter(player.index + 1, 0, player.autoplayNext); return; }

  // the whole story is finished
  player.playing = false;
  emit('state');
  if (player.autoplayRec) {
    try {
      const data = await api.getRecommendationData();
      const rec = buildRecs(player.story, data, [...auth.favs]).next;
      if (rec) { toast(`Up next: ${rec.title}`); await playStory(rec.id); }
    } catch { /* stay on this story */ }
  }
}

async function onError() {
  const ch = currentChapter();
  if (!live() || !ch) return;
  if (!retried) {
    // the listening link may have expired: ask for a fresh one and carry on
    retried = true;
    const t = audio.currentTime, wasPlaying = player.playing;
    try {
      const url = await api.getAudioUrl(ch.id);
      pendingSeek = t;
      audio.src = url;
      if (wasPlaying) audio.play().catch(() => {});
      return;
    } catch { /* fall through */ }
  }
  player.loading = false;
  player.playing = false;
  player.error = 'This audio could not be played.';
  toast(player.error, 'err');
  emit('state');
}

/* ---------------- close ---------------- */
export function closePlayer() {
  flushHistory();
  saveProgress();
  loadToken++;
  audio.pause();
  audio.removeAttribute('src');
  audio.load();
  clearSleep();
  player.story = null;
  player.chapters = [];
  player.index = 0;
  player.playing = false;
  player.loading = false;
  emit('track');
  if ('mediaSession' in navigator) navigator.mediaSession.metadata = null;
}

/* ---------------- lock-screen / notification controls ---------------- */
function updateMediaSession() {
  if (!('mediaSession' in navigator) || !player.story) return;
  const s = player.story, ch = currentChapter();
  try {
    navigator.mediaSession.metadata = new MediaMetadata({
      title: ch?.title || s.title,
      artist: s.narrator || s.author || 'GolpoTune',
      album: s.title,
      artwork: s.cover_url ? [{ src: s.cover_url, sizes: '512x512' }] : [],
    });
  } catch { /* ignore */ }
}
function setMediaState() {
  if ('mediaSession' in navigator) navigator.mediaSession.playbackState = audio.paused ? 'paused' : 'playing';
}
function updatePositionState() {
  const ms = navigator.mediaSession;
  const d = audio.duration;
  if (!ms || !ms.setPositionState || !Number.isFinite(d) || d <= 0) return;
  try { ms.setPositionState({ duration: d, playbackRate: audio.playbackRate, position: Math.min(audio.currentTime, d) }); } catch { /* ignore */ }
}
function setupMediaSession() {
  const ms = navigator.mediaSession;
  if (!ms) return;
  const set = (a, f) => { try { ms.setActionHandler(a, f); } catch { /* not supported */ } };
  set('play', () => audio.play().catch(() => {}));
  set('pause', () => audio.pause());
  set('seekbackward', () => skip(-10));
  set('seekforward', () => skip(30));
  set('previoustrack', prev);
  set('nexttrack', next);
  set('seekto', d => seek(d.seekTime));
}
