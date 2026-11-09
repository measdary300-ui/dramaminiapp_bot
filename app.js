/* ============================================================
   Drama Mini App v2.0 — streaming-app logic
   ------------------------------------------------------------
   DATA: DRAMAS comes from dramas.js (10 dramas, 573 episodes).
   Each drama: { id, title, poster, price, rating, genre, badge,
   featured, episodes: [{ep, url}] }.

   STATE (localStorage):
     phsar_mylist    — array of drama ids saved by the user
     phsar_progress  — { [dramaId]: { lastEp, watched: [eps], t<ep>: seconds } }
     phsar_wallet    — { balance: number, vip: boolean }
   NOTE: prices / wallet / VIP are DISPLAY-ONLY in this version.
   Tapping a drama opens its episodes and plays them for free.
   Real payment (ABA/Wing top-up, per-drama purchase) needs a
   payment provider + a server — see README-ខ្មែរ.txt.
   ============================================================ */
const tg = window.Telegram && window.Telegram.WebApp ? window.Telegram.WebApp : null;
if (tg) { tg.ready(); tg.expand(); }

const $ = (id) => document.getElementById(id);
const DRAMA_ID_8MOVIE = 19087; // fallback link base for 8movie
const LS = { mylist: 'phsar_mylist', progress: 'phsar_progress', wallet: 'phsar_wallet' };

let currentScreen = 'home';
let currentDrama = null;   // drama object being viewed/played
let currentEp = null;
let carouselTimer = null;
let carouselIdx = 0;

/* ---------- storage helpers ---------- */
function lsGet(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch (e) { return fallback; }
}
function lsSet(key, val) { try { localStorage.setItem(key, JSON.stringify(val)); } catch (e) {} }
const getMyList = () => lsGet(LS.mylist, []);
const getProgress = () => lsGet(LS.progress, {});
const getWallet = () => lsGet(LS.wallet, { balance: 0, vip: false });
function saveProgress(dramaId, ep, time, watched) {
  const p = getProgress();
  p[dramaId] = p[dramaId] || { lastEp: ep, watched: [] };
  p[dramaId].lastEp = ep;
  if (time > 0) p[dramaId]['t' + ep] = time;
  if (watched && !p[dramaId].watched.includes(ep)) p[dramaId].watched.push(ep);
  lsSet(LS.progress, p);
}

/* ---------- navigation ---------- */
function showScreen(name) {
  currentScreen = name;
  document.querySelectorAll('.screen').forEach(s => s.classList.add('hidden'));
  $('screen-' + name).classList.remove('hidden');
  document.querySelectorAll('#bottom-nav button').forEach(b => {
    b.classList.toggle('active', b.dataset.nav === name);
  });
  window.scrollTo(0, 0);
  if (name === 'mylist') renderMyList();
  if (name === 'wallet') renderWallet();
  if (name === 'account') renderAccount();
}
document.querySelectorAll('#bottom-nav button').forEach(b => {
  b.addEventListener('click', () => showScreen(b.dataset.nav));
});
document.querySelectorAll('[data-goto]').forEach(b => {
  b.addEventListener('click', () => showScreen(b.dataset.goto));
});

/* ---------- drama cards ---------- */
function money(n) { return n === 0 ? 'FREE' : '$' + n.toFixed(2); }
function dramaCard(d) {
  const tag = d.price === 0
    ? '<span class="price-tag free-tag">FREE</span>'
    : `<span class="price-tag">${money(d.price)}</span>`;
  return `<div class="drama-card" onclick="openDrama(${d.id})">
    <div class="dc-poster-wrap"><img src="${d.poster}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.src='https://via.placeholder.com/300x400?text=No+Image'">${tag}</div>
    <div class="dc-title">${d.title}</div>
    <div class="dc-meta">⭐ ${d.rating} · ${d.episodes.length} ភាគ · ${d.genre}</div>
  </div>`;
}

/* ---------- home ---------- */
function renderHome() {
  const featured = DRAMAS.filter(d => d.featured).concat(DRAMAS.filter(d => !d.featured).slice(0, 2));
  $('carousel').innerHTML = featured.map((d, i) => `
    <div class="slide" onclick="openDrama(${d.id})">
      <img src="${d.poster}" alt="" referrerpolicy="no-referrer" onerror="this.src='https://via.placeholder.com/800x450?text=No+Image'">
      <div class="slide-info">
        ${d.badge ? `<span class="slide-badge">${d.badge === 'HOT' ? '🔥 ក្តៅៗ' : '✨ រឿងថ្មី'}</span>` : ''}
        <div class="slide-title">${d.title}</div>
        <div class="slide-meta">⭐ ${d.rating} · ${d.episodes.length} ភាគ · ${d.genre} · ${money(d.price)}</div>
      </div>
    </div>`).join('');
  $('carousel-dots').innerHTML = featured.map((_, i) =>
    `<span class="${i === 0 ? 'on' : ''}"></span>`).join('');
  startCarousel(featured.length);

  $('trending').innerHTML = DRAMAS.slice(0, 8).map(dramaCard).join('');
  $('free-list').innerHTML = DRAMAS.filter(d => d.price === 0).map(dramaCard).join('');

  // Continue watching
  const p = getProgress();
  const cont = Object.keys(p).map(Number).filter(id => p[id].lastEp).map(id => DRAMAS.find(d => d.id === id)).filter(Boolean);
  if (cont.length) {
    $('continue-section').classList.remove('hidden');
    $('continue-list').innerHTML = cont.map(d => {
      const lastEp = p[d.id].lastEp;
      return `<div class="drama-card" onclick="openDrama(${d.id})">
        <div class="dc-poster-wrap"><img src="${d.poster}" alt="" loading="lazy" referrerpolicy="no-referrer"><span class="price-tag">▶ ភាគ ${lastEp}</span></div>
        <div class="dc-title">${d.title}</div>
        <div class="dc-meta">បន្តពីភាគ ${lastEp}</div>
      </div>`;
    }).join('');
  } else {
    $('continue-section').classList.add('hidden');
  }

  // Greeting + wallet
  const user = tg && tg.initDataUnsafe && tg.initDataUnsafe.user;
  $('greeting').textContent = user ? `សួស្តី, ${user.first_name}` : 'សួស្តី!';
  const w = getWallet();
  $('wallet-balance').textContent = w.balance.toFixed(2);
  $('vip-btn').textContent = w.vip ? '👑 VIP ✓' : '👑 VIP';
}
function startCarousel(n) {
  if (carouselTimer) clearInterval(carouselTimer);
  carouselIdx = 0;
  carouselTimer = setInterval(() => {
    carouselIdx = (carouselIdx + 1) % n;
    const c = $('carousel');
    c.scrollTo({ left: carouselIdx * c.clientWidth, behavior: 'smooth' });
    document.querySelectorAll('#carousel-dots span').forEach((s, i) =>
      s.classList.toggle('on', i === carouselIdx));
  }, 5000);
}

/* ---------- search ---------- */
$('search').addEventListener('input', () => {
  const q = $('search').value.trim().toLowerCase();
  const list = q ? DRAMAS.filter(d => d.title.toLowerCase().includes(q)) : DRAMAS.slice(0, 8);
  $('trending').innerHTML = list.length
    ? list.map(dramaCard).join('')
    : '<p class="empty-msg">រកមិនឃើញរឿង "' + $('search').value + '" ទេ</p>';
});

/* ---------- catalog ---------- */
function renderCatalog() {
  $('catalog').innerHTML = DRAMAS.map(dramaCard).join('');
}

/* ---------- drama detail ---------- */
function openDrama(id) {
  const d = DRAMAS.find(x => x.id === id);
  if (!d) return;
  currentDrama = d;
  const p = getProgress()[id] || { watched: [] };
  const watched = new Set(p.watched || []);
  $('detail-hero').innerHTML = `
    <img src="${d.poster}" alt="" referrerpolicy="no-referrer">
    <div class="slide-info">
      ${d.badge ? `<span class="slide-badge">${d.badge === 'HOT' ? '🔥 ក្តៅៗ' : '✨ រឿងថ្មី'}</span>` : ''}
      <div class="slide-title">${d.title}</div>
      <div class="slide-meta">⭐ ${d.rating} · ${d.episodes.length} ភាគ · ${d.genre}</div>
    </div>`;
  $('detail-info').innerHTML = `
    <div class="di-title">${d.title}</div>
    <div class="di-meta">💰 តម្លៃ៖ <b style="color:#ffb347">${money(d.price)}</b>${d.price === 0 ? ' — មើលឥតគិតថ្លៃ' : ' — បង់ម្តង មើលគ្រប់ភាគ'}<br>
    🎬 ${d.episodes.length} ភាគ · ⭐ ${d.rating} · ${d.genre}</div>`;
  $('detail-ep-count').textContent = d.episodes.length;
  $('detail-episodes').innerHTML = d.episodes.map(e => {
    const cls = ['ep-btn'];
    if (watched.has(e.ep)) cls.push('watched');
    if (currentEp === e.ep && currentDrama && currentDrama.id === id) cls.push('current');
    return `<button class="${cls.join(' ')}" onclick="playEpisode(${id}, ${e.ep})">${e.ep}</button>`;
  }).join('');
  $('detail-play').onclick = () => playEpisode(id, 1);
  updateMyListBtn();
  showScreen('detail');
}
function updateMyListBtn() {
  const saved = getMyList().includes(currentDrama.id);
  $('detail-mylist').textContent = saved ? '✓ ក្នុងបញ្ជីហើយ' : '＋ បញ្ជីរបស់ខ្ញុំ';
}
$('detail-mylist').addEventListener('click', () => {
  if (!currentDrama) return;
  const list = getMyList();
  const i = list.indexOf(currentDrama.id);
  if (i >= 0) list.splice(i, 1); else list.push(currentDrama.id);
  lsSet(LS.mylist, list);
  updateMyListBtn();
  if (tg) tg.HapticFeedback && tg.HapticFeedback.impactOccurred('light');
});

/* ---------- my list ---------- */
function renderMyList() {
  const list = getMyList().map(id => DRAMAS.find(d => d.id === id)).filter(Boolean);
  $('mylist').innerHTML = list.map(dramaCard).join('');
  $('mylist-empty').classList.toggle('hidden', list.length > 0);
}

/* ---------- wallet / account ---------- */
function renderWallet() {
  const w = getWallet();
  $('wallet-balance-2').textContent = w.balance.toFixed(2);
  $('vip-status').textContent = w.vip ? '👑 អ្នកជា VIP ✓ — មើលរឿងទាំងអស់ឥតគិតថ្លៃ' : 'អ្នកមិនទាន់ជា VIP ទេ';
}
$('topup-btn').addEventListener('click', () => {
  alert('ដើម្បីបញ្ចូលលុយ៖\n\n1. ផ្ញើលុយតាម ABA / Wing ទៅ admin\n2. ផ្ញើ screenshot មក admin តាម Telegram\n3. Admin នឹងបញ្ចូលសមតុល្យឲ្យអ្នក\n\n(ប្រព័ន្ធបង់ប្រាក់ដោយស្វ័យប្រវត្តិមិនទាន់មានទេ — ត្រូវការ payment provider)');
});
$('vip-btn').addEventListener('click', () => showScreen('wallet'));
$('wallet-chip').addEventListener('click', () => showScreen('wallet'));
function renderAccount() {
  const user = tg && tg.initDataUnsafe && tg.initDataUnsafe.user;
  $('account-name').textContent = user ? `${user.first_name}${user.last_name ? ' ' + user.last_name : ''}` : 'អ្នកប្រើ';
  $('account-id').textContent = user ? `@${user.username || 'user'} · ID ${user.id}` : 'បើកក្នុង Telegram ដើម្បីឃើញព័ត៌មានរបស់អ្នក';
  const w = getWallet();
  $('account-vip').textContent = w.vip ? '👑 VIP ✓' : 'មិនទាន់មាន';
  $('account-balance').textContent = w.balance.toFixed(2);
  $('account-mylist-count').textContent = getMyList().length;
  const p = getProgress();
  const watchedTotal = Object.values(p).reduce((s, d) => s + (d.watched ? d.watched.length : 0), 0);
  $('account-watched-count').textContent = watchedTotal + ' ភាគ';
}

/* ---------- player ---------- */
function playEpisode(dramaId, ep) {
  const d = DRAMAS.find(x => x.id === dramaId);
  const e = d && d.episodes.find(x => x.ep === ep);
  if (!e) return;
  currentDrama = d; currentEp = ep;
  const v = $('player');
  $('player-title').textContent = `${d.title.slice(0, 18)}… — ភាគ ${ep} / ${d.episodes.length}`;
  $('player-error').classList.add('hidden');
  $('player-overlay').classList.remove('hidden');
  document.body.style.overflow = 'hidden';
  v.src = e.url;
  v.load();
  const p = (getProgress()[dramaId]) || {};
  v.onloadedmetadata = () => {
    const t = p['t' + ep];
    if (t && t > 5 && t < v.duration - 10) v.currentTime = t;
    v.play().catch(() => {});
  };
  $('prev-ep').disabled = ep <= 1;
  $('next-ep').disabled = ep >= d.episodes.length;
  $('player-open-8movie').onclick = () => {
    const url = `https://www.8movie.com/play/${d.id}/${ep}/`;
    if (tg) tg.openLink(url); else window.open(url, '_blank');
  };
  if (tg) tg.HapticFeedback && tg.HapticFeedback.impactOccurred('medium');
}
function closePlayer() {
  const v = $('player');
  if (currentDrama && currentEp) saveProgress(currentDrama.id, currentEp, v.currentTime || 0, false);
  v.pause(); v.removeAttribute('src'); v.load();
  $('player-overlay').classList.add('hidden');
  document.body.style.overflow = '';
  currentEp = null;
  if (currentDrama) openDramaRefresh();
}
function openDramaRefresh() {
  // Re-render detail screen (watched markers) without changing screen
  if (currentDrama && currentScreen === 'detail') openDrama(currentDrama.id);
  else if (currentDrama) renderHome();
}
$('player').addEventListener('timeupdate', () => {
  const v = $('player');
  if (currentDrama && currentEp && v.currentTime > 0 && Math.floor(v.currentTime) % 10 === 0) {
    saveProgress(currentDrama.id, currentEp, v.currentTime, false);
  }
});
$('player').addEventListener('ended', () => {
  if (currentDrama && currentEp) {
    saveProgress(currentDrama.id, currentEp, 0, true);
    if (currentEp < currentDrama.episodes.length) playEpisode(currentDrama.id, currentEp + 1);
  }
});
$('player').addEventListener('error', () => {
  const v = $('player');
  if (v.src) $('player-error').classList.remove('hidden');
});
$('player-back').addEventListener('click', closePlayer);
$('prev-ep').addEventListener('click', () => { if (currentDrama && currentEp > 1) playEpisode(currentDrama.id, currentEp - 1); });
$('next-ep').addEventListener('click', () => { if (currentDrama && currentEp < currentDrama.episodes.length) playEpisode(currentDrama.id, currentEp + 1); });

/* ---------- init ---------- */
renderHome();
renderCatalog();
