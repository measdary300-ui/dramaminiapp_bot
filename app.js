/* ============================================================
   Drama Mini App v2.7.1 — streaming-app logic (no posters: 8movie blocks them, title cards instead)
   v2.7.1: QR image បង្ហាញតាមទំហំធម្មជាតិ (height:auto, max-width 320px) — កុំបង្ខំឲ្យជា square 200x200 ដែលធ្វើឲ្យរូបព្រិល + ទាញ។
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
   Top-up: AUTO via PayServer + ABA PayWay (set PAYSERVER_URL
   below) with the manual KHQR + code flow as fallback.
   ============================================================ */
const tg = window.Telegram && window.Telegram.WebApp ? window.Telegram.WebApp : null;
if (tg) { tg.ready(); tg.expand(); }

const $ = (id) => document.getElementById(id);
const DRAMA_ID_8MOVIE = 19087; // fallback link base for 8movie
const LS = { mylist: 'phsar_mylist', progress: 'phsar_progress', wallet: 'phsar_wallet' };

let currentScreen = 'home';
let currentDrama = null;   // drama object being viewed/played
let currentEp = null;

/* ---------- storage helpers ---------- */
function lsGet(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch (e) { return fallback; }
}
function lsSet(key, val) { try { localStorage.setItem(key, JSON.stringify(val)); } catch (e) {} }
const getMyList = () => lsGet(LS.mylist, []);
const getProgress = () => lsGet(LS.progress, {});
const getWallet = () => lsGet(LS.wallet, { balance: 0, vip: false });

/* ---------- top-up (KHQR + code) ----------
   Flow: user picks an amount -> scans khqr.jpg -> pays -> sends a
   screenshot to the admin -> admin generates a code with
   topup-generator.html -> user enters the code -> balance is credited.
   Codes are validated on the phone (no server). The secret below MUST
   match the one in topup-generator.html. This is not bank-grade
   security (anyone reading this file could forge codes) — for a small
   personal shop it is the practical approach without a server. */
const TOPUP_SECRET = 'SR-DRAMA-2026';
const TOPUP_AMOUNTS = [1, 2, 5, 10, 20];
let topupAmount = 5;
function codeHash(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) { h = (Math.imul(h, 31) + s.charCodeAt(i)) >>> 0; }
  return h.toString(36).toUpperCase().padStart(4, '0').slice(-4);
}
function makeTopupCode(amount) {
  return 'KH-' + amount + '-' + codeHash(TOPUP_SECRET + ':' + amount);
}
function redeemTopupCode(raw) {
  const code = (raw || '').trim().toUpperCase();
  const m = code.match(/^KH-(\d+)-([0-9A-Z]{4})$/);
  if (!m) return { ok: false, msg: 'លេខកូដមិនត្រឹមត្រូវ! ទម្រង់ត្រូវតែជា KH-ចំនួនលុយ-XXXX (ឧ. KH-5-A3F9)' };
  const amount = parseInt(m[1], 10);
  if (makeTopupCode(amount) !== code) return { ok: false, msg: 'លេខកូដនេះមិនត្រឹមត្រូវទេ! សូមពិនិត្យម្តងទៀត ឬសុំកូដថ្មីពី admin។' };
  const used = lsGet('phsar_used_codes', []);
  if (used.includes(code)) return { ok: false, msg: 'លេខកូដនេះត្រូវបានប្រើរួចហើយ!' };
  used.push(code); lsSet('phsar_used_codes', used);
  const w = getWallet(); w.balance = (w.balance || 0) + amount; lsSet(LS.wallet, w);
  return { ok: true, amount };
}

/* ---------- auto top-up via PayServer (ABA PayWay) ----------
   PAYSERVER_URL = the public URL of your PayServer on Railway
   (e.g. https://payserver-production-xxxx.up.railway.app).
   Leave it EMPTY ('') to keep the manual KHQR + code flow only.
   When set, the Top Up screen offers AUTO PayWay payment:
   pick amount -> server creates a PayWay KHQR -> user scans it
   with the ABA app (or taps the deeplink) -> Mini App polls the
   server every 3s -> when PayWay reports APPROVED the wallet
   is credited automatically. The manual code flow stays as a
   fallback (toggle at the bottom of the Top Up box). */
const PAYSERVER_URL = 'https://payserver-production.up.railway.app';
function payserverOn() { return PAYSERVER_URL && PAYSERVER_URL.indexOf('http') === 0; }
function getTelegramId() {
  const u = tg && tg.initDataUnsafe && tg.initDataUnsafe.user;
  return u ? String(u.id) : null;
}
async function fetchServerWallet() {
  const tid = getTelegramId();
  if (!payserverOn() || !tid) return null;
  try {
    const r = await fetch(PAYSERVER_URL + '/api/wallet/' + encodeURIComponent(tid));
    const j = await r.json();
    if (j && j.ok) { const w = { balance: j.balance || 0, vip: !!j.vip }; lsSet(LS.wallet, w); return w; }
  } catch (e) {}
  return null;
}
let autoTopupTimer = null;
let topupMode = 'auto'; // 'auto' (PayWay) or 'manual' (KHQR + code)
function stopAutoTopupPoll() { if (autoTopupTimer) { clearInterval(autoTopupTimer); autoTopupTimer = null; } }
async function createPaywayTopup(amount) {
  const tid = getTelegramId();
  const r = await fetch(PAYSERVER_URL + '/api/topup/create', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ telegramId: tid, amount: amount })
  });
  return await r.json();
}
async function pollTopupStatus(tranId) {
  const r = await fetch(PAYSERVER_URL + '/api/topup/status/' + encodeURIComponent(tranId));
  return await r.json();
}
async function startAutoTopup() {
  const msg = $('topup-msg');
  const qrBox = $('topup-auto-qr');
  if (!msg || !qrBox) return;
  msg.textContent = '⏳ កំពុងបង្កើត QR...'; msg.style.color = '';
  qrBox.innerHTML = '';
  try {
    const j = await createPaywayTopup(topupAmount);
    if (!j.ok) { msg.textContent = '❌ ' + (j.error || 'បង្កើត QR មិនបានទេ សូមសាកម្តងទៀត'); msg.style.color = '#ff8080'; return; }
    if (j.qr_image) {
      qrBox.innerHTML = `
      <div class="topup-qr"><img src="${j.qr_image}" alt="PayWay QR"></div>
      <div class="topup-steps">1️⃣ ស្កេន QR នេះដោយ ABA app<br>2️⃣ ឬចុចប៊ូតុងខាងក្រោមដើម្បីបើក ABA app<br>3️⃣ បង់ $${j.amount} — លុយនឹងចូល wallet ដោយស្វ័យប្រវត្តិ!</div>
      ${j.abapay_deeplink ? '<button id="topup-deeplink" class="topup-deeplink">📱 បើក ABA app ដើម្បីបង់</button>' : ''}
      <div id="topup-poll" class="topup-msg">⏳ កំពុងរង់ចាំការបង់ប្រាក់... (QR មានសុពលភាព 3 នាទី)</div>`;
      if (j.abapay_deeplink) $('topup-deeplink').addEventListener('click', () => { if (tg) tg.openLink(j.abapay_deeplink); else window.open(j.abapay_deeplink, '_blank'); });
    } else if (j.checkout_qr_url) {
      // PayWay មិនបានផ្តល់ QR image ទេ — បើកទំព័របង់ប្រាក់របស់ PayWay ជំនួស
      qrBox.innerHTML = `
      <div class="topup-steps">PayWay មិនបានផ្តល់ QR image ទេ — ចុចប៊ូតុងខាងក្រោមដើម្បីបើកទំព័របង់ប្រាក់ រួចបង់ $${j.amount}៖</div>
      <button id="topup-checkout" class="topup-deeplink">🌐 បើកទំព័របង់ប្រាក់ PayWay</button>
      ${j.abapay_deeplink ? '<button id="topup-deeplink" class="topup-deeplink">📱 បើក ABA app ដើម្បីបង់</button>' : ''}
      <div id="topup-poll" class="topup-msg">⏳ កំពុងរង់ចាំការបង់ប្រាក់... (មានសុពលភាព 3 នាទី)</div>`;
      $('topup-checkout').addEventListener('click', () => { if (tg) tg.openLink(j.checkout_qr_url); else window.open(j.checkout_qr_url, '_blank'); });
      if (j.abapay_deeplink) $('topup-deeplink').addEventListener('click', () => { if (tg) tg.openLink(j.abapay_deeplink); else window.open(j.abapay_deeplink, '_blank'); });
    } else {
      msg.textContent = '❌ PayWay មិនបានផ្តល់ QR ទេ សូមសាកម្តងទៀត'; msg.style.color = '#ff8080'; return;
    }
    msg.textContent = '';
    stopAutoTopupPoll();
    let tries = 0;
    autoTopupTimer = setInterval(async () => {
      tries++;
      try {
        const s = await pollTopupStatus(j.tran_id);
        if (s && s.ok && s.status === 'paid') {
          stopAutoTopupPoll();
          const w = getWallet(); w.balance = s.balance; lsSet(LS.wallet, w);
          $('wallet-balance-2').textContent = w.balance.toFixed(2);
          $('wallet-balance').textContent = w.balance.toFixed(2);
          const poll = $('topup-poll'); if (poll) { poll.textContent = '✅ បង់ប្រាក់ជោគជ័យ! បញ្ចូល $' + s.amount + ' — សមតុល្យបច្ចុប្បន្ន៖ $' + w.balance.toFixed(2); poll.style.color = '#4ade80'; }
        } else if (s && s.status === 'expired') {
          stopAutoTopupPoll();
          const poll = $('topup-poll'); if (poll) { poll.textContent = '⌛ QR នេះផុតកំណត់ហើយ — សូមបង្កើត QR ថ្មីម្តងទៀត។'; poll.style.color = '#ff8080'; }
        }
      } catch (e) {}
      if (tries > 60) stopAutoTopupPoll(); // stop after ~3 min
    }, 3000);
  } catch (e) {
    msg.textContent = '❌ មិនអាចភ្ជាប់ទៅ PayServer បានទេ — សូមពិនិត្យថា server ដំណើរការឬអត់។'; msg.style.color = '#ff8080';
  }
}
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
    <div class="dc-poster-wrap"><div class="dc-poster-fallback"><span class="dc-fb-ico">🎬</span><span class="dc-fb-title">${d.title}</span></div>${tag}</div>
    <div class="dc-title">${d.title}</div>
    <div class="dc-meta">⭐ ${d.rating} · ${d.episodes.length} ភាគ · ${d.genre}</div>
  </div>`;
}

/* ---------- home ---------- */
function renderHome() {

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
        <div class="dc-poster-wrap"><div class="dc-poster-fallback"><span class="dc-fb-ico">🎬</span><span class="dc-fb-title">${d.title}</span></div><span class="price-tag">▶ ភាគ ${lastEp}</span></div>
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
    <div class="detail-hero-fallback"></div>
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
async function renderWallet() {
  const w = getWallet();
  $('wallet-balance-2').textContent = w.balance.toFixed(2);
  $('vip-status').textContent = w.vip ? '👑 អ្នកជា VIP ✓ — មើលរឿងទាំងអស់ឥតគិតថ្លៃ' : 'អ្នកមិនទាន់ជា VIP ទេ';
  renderTopup();
  if (payserverOn() && getTelegramId()) {
    const sw = await fetchServerWallet();
    if (sw) {
      $('wallet-balance-2').textContent = sw.balance.toFixed(2);
      $('wallet-balance').textContent = sw.balance.toFixed(2);
      $('vip-status').textContent = sw.vip ? '👑 អ្នកជា VIP ✓ — មើលរឿងទាំងអស់ឥតគិតថ្លៃ' : 'អ្នកមិនទាន់ជា VIP ទេ';
    }
  }
}
function renderTopup() {
  const box = $('topup-box');
  if (!box) return;
  stopAutoTopupPoll();
  const autoAvailable = payserverOn() && getTelegramId();
  if (autoAvailable && topupMode === 'auto') return renderTopupAuto(box);
  return renderTopupManual(box, autoAvailable);
}
function renderTopupAuto(box) {
  box.innerHTML = `
    <div class="topup-label">💳 បញ្ចូលលុយ (Top Up) — Auto ⚡ PayWay</div>
    <div class="topup-amounts">${TOPUP_AMOUNTS.map(a => `<button class="amt-btn ${a === topupAmount ? 'on' : ''}" data-amt="${a}">$${a}</button>`).join('')}</div>
    <button id="topup-create" class="topup-create-btn">⚡ បង្កើត QR បង់ $${topupAmount}</button>
    <div id="topup-auto-qr"></div>
    <div id="topup-msg" class="topup-msg"></div>
    <div class="topup-mode-toggle" id="topup-to-manual">📷 ប្រើវិធី Manual (KHQR + លេខកូដ) វិញ</div>`;
  box.querySelectorAll('.amt-btn').forEach(b => b.addEventListener('click', () => { topupAmount = parseInt(b.dataset.amt, 10); renderTopup(); }));
  $('topup-create').addEventListener('click', startAutoTopup);
  $('topup-to-manual').addEventListener('click', () => { topupMode = 'manual'; renderTopup(); });
}
function renderTopupManual(box, autoAvailable) {
  box.innerHTML = `
    <div class="topup-label">💳 បញ្ចូលលុយ (Top Up) — KHQR</div>
    <div class="topup-amounts">${TOPUP_AMOUNTS.map(a => `<button class="amt-btn ${a === topupAmount ? 'on' : ''}" data-amt="${a}">$${a}</button>`).join('')}</div>
    <div class="topup-qr"><img src="khqr.jpg" alt="KHQR" onerror="this.style.display='none';document.getElementById('topup-qr-missing').style.display='block'"></div>
    <div id="topup-qr-missing" class="topup-qr-missing" style="display:none">📷 Admin មិនទាន់ដាក់រូប KHQR ទេ</div>
    <div class="topup-steps">
      1️⃣ ជ្រើសចំនួនលុយខាងលើ<br>
      2️⃣ ស្កេន QR បង់លុយតាម ABA / Wing / ធនាគារផ្សេង ($${topupAmount})<br>
      3️⃣ ផ្ញើ screenshot មក admin តាម Telegram<br>
      4️⃣ Admin នឹងផ្ញើ <b>លេខកូដបញ្ចូលលុយ</b> មកឲ្យអ្នក<br>
      5️⃣ បញ្ចូលលេខកូដខាងក្រោម — លុយចូល wallet ភ្លាមៗ!
    </div>
    <div class="topup-code-row">
      <input id="topup-code" type="text" placeholder="ឧ. KH-5-A3F9" autocapitalize="characters" autocomplete="off">
      <button id="topup-redeem">បញ្ចូលលុយ</button>
    </div>
    <div id="topup-msg" class="topup-msg"></div>
    ${autoAvailable ? '<div class="topup-mode-toggle" id="topup-to-auto">⚡ ប្រើវិធី Auto (PayWay QR) វិញ</div>' : ''}`;
  box.querySelectorAll('.amt-btn').forEach(b => b.addEventListener('click', () => { topupAmount = parseInt(b.dataset.amt, 10); renderTopup(); }));
  $('topup-redeem').addEventListener('click', () => {
    const r = redeemTopupCode($('topup-code').value);
    const msg = $('topup-msg');
    if (r.ok) {
      msg.textContent = `✅ បញ្ចូលលុយ $${r.amount} ជោគជ័យ! សមតុល្យបច្ចុប្បន្ន៖ $${getWallet().balance.toFixed(2)}`;
      msg.style.color = '#4ade80';
      $('wallet-balance-2').textContent = getWallet().balance.toFixed(2);
      $('wallet-balance').textContent = getWallet().balance.toFixed(2);
    } else {
      msg.textContent = '❌ ' + r.msg;
      msg.style.color = '#ff8080';
    }
  });
  const toAuto = $('topup-to-auto');
  if (toAuto) toAuto.addEventListener('click', () => { topupMode = 'auto'; renderTopup(); });
}
$('topup-btn').addEventListener('click', () => { showScreen('wallet'); });
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
