/* ============================================================
   Telegram Drama Mini App — episode player
   ------------------------------------------------------------
   DATA: EPISODES comes from episodes.js (103 episodes, each
   { ep: number, url: direct mp4 }). To add ANOTHER drama, make
   a new episodes file with the same shape and change the header
   in index.html.

   HOW PLAYBACK WORKS:
   The <video> tag plays the mp4 URL directly. The 8movie CDN
   (img5.shortspro.org) needs a Referer header — a normal browser
   sends the Mini App page URL as Referer automatically. If the
   CDN rejects it, the video fires an 'error' event and we show
   a fallback message + a button to open the episode on 8movie.

   PROGRESS: last episode + playback position are saved in
   localStorage, so "Continue watching" works across visits.
   ============================================================ */
const tg = window.Telegram && window.Telegram.WebApp ? window.Telegram.WebApp : null;
if (tg) { tg.ready(); tg.expand(); }

const $ = (id) => document.getElementById(id);
const DRAMA_ID = 19087;               // 8movie drama id (for the fallback link)
const STAR_EP = 8;                    // Joshua's episode — marked with ⭐
const LS_KEY = 'drama19087-progress'; // localStorage key

let currentEp = null;

function getProgress() {
  try { return JSON.parse(localStorage.getItem(LS_KEY)) || {}; } catch (e) { return {}; }
}
function saveProgress(ep, time, watched) {
  const p = getProgress();
  p.lastEp = ep;
  if (time > 0) p['t' + ep] = time;
  if (watched) { p.watched = p.watched || []; if (!p.watched.includes(ep)) p.watched.push(ep); }
  try { localStorage.setItem(LS_KEY, JSON.stringify(p)); } catch (e) {}
}

function renderEpisodes() {
  const p = getProgress();
  const watched = new Set(p.watched || []);
  $('ep-count').textContent = EPISODES.length;
  $('episodes').innerHTML = EPISODES.map(e => {
    const cls = ['ep-btn'];
    if (watched.has(e.ep)) cls.push('watched');
    if (e.ep === currentEp) cls.push('current');
    if (e.ep === STAR_EP) cls.push('star');
    return `<button class="${cls.join(' ')}" onclick="playEpisode(${e.ep})">${e.ep}</button>`;
  }).join('');
  // Continue button
  if (p.lastEp && p.lastEp >= 1 && p.lastEp <= EPISODES.length) {
    $('continue-ep').textContent = p.lastEp;
    $('continue-btn').classList.remove('hidden');
  }
}

function playEpisode(ep) {
  const e = EPISODES.find(x => x.ep === ep);
  if (!e) return;
  currentEp = ep;
  const v = $('player');
  $('player-title').textContent = 'ភាគ ' + ep + ' / ' + EPISODES.length;
  $('player-error').classList.add('hidden');
  $('player-overlay').classList.remove('hidden');
  document.body.style.overflow = 'hidden';
  v.src = e.url;
  v.load();
  // Resume from saved position
  const p = getProgress();
  v.onloadedmetadata = () => {
    const t = p['t' + ep];
    if (t && t > 5 && t < v.duration - 10) v.currentTime = t;
    v.play().catch(() => {});
  };
  $('prev-ep').disabled = ep <= 1;
  $('next-ep').disabled = ep >= EPISODES.length;
  $('player-open-8movie').onclick = () => {
    const url = 'https://www.8movie.com/play/' + DRAMA_ID + '/' + ep + '/';
    if (tg) tg.openLink(url); else window.open(url, '_blank');
  };
  renderEpisodes();
  if (tg) tg.HapticFeedback && tg.HapticFeedback.impactOccurred('medium');
}

function closePlayer() {
  const v = $('player');
  if (currentEp) saveProgress(currentEp, v.currentTime || 0, false);
  v.pause(); v.removeAttribute('src'); v.load();
  $('player-overlay').classList.add('hidden');
  document.body.style.overflow = '';
  currentEp = null;
  renderEpisodes();
}

// Video events: save position + mark watched + handle CDN errors
$('player').addEventListener('timeupdate', () => {
  const v = $('player');
  if (currentEp && v.currentTime > 0 && Math.floor(v.currentTime) % 10 === 0) {
    saveProgress(currentEp, v.currentTime, false);
  }
});
$('player').addEventListener('ended', () => {
  if (currentEp) {
    saveProgress(currentEp, 0, true);
    // Auto-advance to the next episode
    if (currentEp < EPISODES.length) playEpisode(currentEp + 1);
  }
});
$('player').addEventListener('error', () => {
  const v = $('player');
  if (v.src) $('player-error').classList.remove('hidden');
});

$('player-back').addEventListener('click', closePlayer);
$('prev-ep').addEventListener('click', () => { if (currentEp > 1) playEpisode(currentEp - 1); });
$('next-ep').addEventListener('click', () => { if (currentEp < EPISODES.length) playEpisode(currentEp + 1); });
$('continue-btn').addEventListener('click', () => {
  const p = getProgress();
  if (p.lastEp) playEpisode(p.lastEp);
});
function jumpToEp() {
  const n = parseInt($('ep-jump').value, 10);
  if (n >= 1 && n <= EPISODES.length) playEpisode(n);
  else alert('សូមបញ្ចូលលេខភាគពី 1 ដល់ ' + EPISODES.length);
}
$('ep-go').addEventListener('click', jumpToEp);
$('ep-jump').addEventListener('keydown', (e) => { if (e.key === 'Enter') jumpToEp(); });

renderEpisodes();
