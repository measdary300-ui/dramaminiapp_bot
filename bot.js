// ============================================================
// Telegram Drama Bot v2.4.1 — Node.js + Telegraf
// v2.4.1: BANNER_PHOTO now ends with ?v=2 (cache-bust) so Telegram
// fetches the banner FRESH instead of serving its cached copy of
// an older banner.jpg. GitHub Pages ignores the query for static
// files, so it still serves banner.jpg.
// v2.5: /genkey — admin-only command that creates a 1-PC license key
// for the SR Downloader app via the PayServer
// (POST {PAYSERVER_URL}/api/license/create). See the handler below.
// v2.4: BANNER_PHOTO strips the ?v=... cache-bust query from WEBAPP_URL
// before appending /banner.jpg (WEBAPP_URL now has ?v=2.8 — appending
// after the query gave .../?v=2.8/banner.jpg, which GitHub Pages
// serves as index.html, so the bot never showed the custom banner).
// ------------------------------------------------------------
// WHAT THIS BOT DOES:
//   /start → sends a custom banner photo (banner.jpg, hosted on
//            your GitHub Pages) + welcome text + an inline
//            "▶ OPEN APP" button that opens the Drama Mini App,
//            plus a keyboard "🎬 មើលរឿង" button (same as v1.0).
//   The Mini App (v2.0) is a full streaming app: home carousel,
//   search, trending, drama catalog, episode player, My List,
//   Wallet and Account.
//
// SETUP (see README-ខ្មែរ.txt for the full tutorial):
//   1. npm install
//   2. Copy config.example.json → config.json and fill in:
//        BOT_TOKEN  — from @BotFather
//        WEBAPP_URL — your Drama Mini App HTTPS URL
//   3. node bot.js
//   (On Railway: set BOT_TOKEN + WEBAPP_URL as Variables instead.)
//
// OPTIONAL — Menu Button (the blue button next to the message box):
//   In Telegram: @BotFather → /mybots → pick your bot →
//   Bot Settings → Menu Button → Configure Menu Button →
//   send your WEBAPP_URL + a button text like "🎬 មើលរឿង".
// ============================================================
const fs = require('fs');
const path = require('path');
const { Telegraf, Markup } = require('telegraf');

// CONFIG: environment variables first (for Railway / cloud hosting),
// then config.json (for running on your PC).
//   BOT_TOKEN  — from @BotFather
//   WEBAPP_URL — your Drama Mini App HTTPS URL
let cfg = { BOT_TOKEN: process.env.BOT_TOKEN, WEBAPP_URL: process.env.WEBAPP_URL };
const cfgPath = path.join(__dirname, 'config.json');
if ((!cfg.BOT_TOKEN || !cfg.WEBAPP_URL) && fs.existsSync(cfgPath)) {
  try {
    const fileCfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
    cfg.BOT_TOKEN = cfg.BOT_TOKEN || fileCfg.BOT_TOKEN;
    cfg.WEBAPP_URL = cfg.WEBAPP_URL || fileCfg.WEBAPP_URL;
  } catch (e) { console.error('Could not read config.json:', e.message); }
}
if (!cfg.BOT_TOKEN || cfg.BOT_TOKEN.includes('PASTE')) {
  console.error('ERROR: BOT_TOKEN is not set. Set the BOT_TOKEN env var (Railway) or fill it in config.json (PC). Get it from @BotFather.');
  process.exit(1);
}
if (!cfg.WEBAPP_URL || cfg.WEBAPP_URL.includes('PASTE')) {
  console.error('ERROR: WEBAPP_URL is not set. Set the WEBAPP_URL env var (Railway) or fill it in config.json (PC). Host the webapp/ folder on HTTPS first.');
  process.exit(1);
}

// Banner photo for /start — your own custom banner (banner.jpg),
// hosted on your GitHub Pages next to the Mini App.
// Fallback: the featured drama poster from 8movie.
// NOTE: strip any ?v=... query from WEBAPP_URL first — WEBAPP_URL
// has a ?v=2.8 cache-bust, and appending /banner.jpg after the
// query (…/?v=2.8/banner.jpg) makes GitHub Pages return index.html
// instead of the banner image! The trailing ?v=2 is a cache-bust
// for Telegram (forces a fresh download of banner.jpg).
const BANNER_PHOTO = cfg.WEBAPP_URL.split('?')[0].replace(/\/?$/, '/') + 'banner.jpg?v=2';
const BANNER_FALLBACK = 'https://www.8movie.com/p/19087-tprf.jpg';

const bot = new Telegraf(cfg.BOT_TOKEN);

bot.start(async (ctx) => {
  const caption =
    `🎬 <b>សួស្តី ${ctx.from.first_name}!</b>\n\n` +
    `សូមស្វាគមន៍មកកាន់ <b>Drama mini app</b> — ទស្សនារឿងភាគ និងរឿងដុំ លើ App Telegram!\n\n` +
    `✅ ទស្សនាគ្រប់រឿងក្នុង App ដែរងាយស្រួល\n` +
    `🔥 កម្រិត Full HD 1080p ទស្សនាដោយរលូន 🍿\n` +
    `📺 10 រឿង · 573 ភាគ — មានរឿងថ្មីៗជាប្រចាំ\n\n` +
    `👇 សូមចុចប៊ូតុង "▶ មើលឥឡូវនេះ" ខាងក្រោមដើម្បីចូលទស្សនា៖`;
  const openAppBtn = Markup.inlineKeyboard([
    Markup.button.webApp('▶ មើលឥឡូវនេះ', cfg.WEBAPP_URL),
  ]);
  try {
    await ctx.replyWithPhoto(BANNER_PHOTO, {
      caption,
      parse_mode: 'HTML',
      reply_markup: openAppBtn.reply_markup,
    });
  } catch (e) {
    // If the custom banner is not uploaded yet, try the drama poster
    console.error('Custom banner failed, trying fallback poster:', e.message);
    try {
      await ctx.replyWithPhoto(BANNER_FALLBACK, {
        caption,
        parse_mode: 'HTML',
        reply_markup: openAppBtn.reply_markup,
      });
    } catch (e2) {
      // Last resort: text only
      console.error('Banner photo failed, sending text:', e2.message);
      await ctx.reply(caption.replace(/<[^>]+>/g, ''), openAppBtn);
    }
  }
  // Keyboard button (same as v1.0) — always visible under the message box
  await ctx.reply('ឬចុចប៊ូតុង "🎬 មើលរឿង" ខាងក្រោម៖', Markup.keyboard([
    Markup.button.webApp('🎬 មើលរឿង', cfg.WEBAPP_URL),
  ]).resize());
});

bot.help((ctx) => {
  ctx.reply(
    '📖 ជំនួយ:\n' +
    '/start — បើករឿង\n' +
    '/help — បង្ហាញជំនួយនេះ\n\n' +
    'វិធីមើល៖ ចុច "▶ មើលឥឡូវនេះ" ឬ "🎬 មើលរឿង" → ជ្រើសរើសរឿង → ជ្រើសរើសភាគ → វីដេអូនឹងចាក់ក្នុង Telegram។\n' +
    'ភាគដែលមើលរួចនឹងមានសញ្ញាពណ៌បៃតង។ បើវីដេអូមិនចាក់ — ចុច "8movie" ក្នុង player។'
  );
});

// ============================================================
// /genkey — create a 1-PC license key for the SR Downloader app.
// ADMIN-ONLY. The key is created on the PayServer, which also
// logs it to the Google Sheet.
//
//   /genkey <buyer name> [@telegram] [expiry]
//
// Expiry: DD/MM/YYYY (e.g. 31/12/2026), Nd days (e.g. 30d, 90d),
// or 'lifetime' (or leave it out) = no expiry.
//
// Env (Railway Variables — never in chat, code, or the repo):
//   ADMIN_TELEGRAM_ID    — your Telegram user id (from @userinfobot)
//   LICENSE_ADMIN_SECRET — shared secret with the PayServer
//   PAYSERVER_URL        — default https://payserver-production.up.railway.app
// ============================================================
const GENKEY_USAGE =
  '🔑 ការប្រើប្រាស់ /genkey:\n' +
  '/genkey <ឈ្មោះអ្នកទិញ> [@telegram] [expiry]\n\n' +
  'Expiry: DD/MM/YYYY (ឧ. 31/12/2026), Nd ថ្ងៃ (ឧ. 30d, 90d),\n' +
  'ឬ lifetime (ឬមិនដាក់) = គ្មានថ្ងៃផុតកំណត់\n\n' +
  'ឧទាហរណ៍:\n' +
  '/genkey Sokha Chan\n' +
  '/genkey Sokha Chan @sokha 30d\n' +
  '/genkey Sokha Chan @sokha 31/12/2026';

// Parse one expiry token. Returns:
//   { ok: true, kind: 'lifetime' }
//   { ok: true, kind: 'days', days: <number> }
//   { ok: true, kind: 'date', date: <Date at UTC midnight> }
//   { ok: false } — not a valid expiry
function parseGenkeyExpiry(token) {
  if (!token) return { ok: true, kind: 'lifetime' };
  const t = token.trim().toLowerCase();
  if (t === 'lifetime') return { ok: true, kind: 'lifetime' };
  const daysMatch = t.match(/^(\d+)d$/);
  if (daysMatch) {
    const days = parseInt(daysMatch[1], 10);
    if (days >= 1) return { ok: true, kind: 'days', days };
    return { ok: false };
  }
  const dateMatch = token.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (dateMatch) {
    const day = parseInt(dateMatch[1], 10);
    const month = parseInt(dateMatch[2], 10);
    const year = parseInt(dateMatch[3], 10);
    const date = new Date(Date.UTC(year, month - 1, day));
    // Reject impossible dates like 31/02/2026 or 32/13/2026
    if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
      return { ok: false };
    }
    return { ok: true, kind: 'date', date };
  }
  return { ok: false };
}

// Format a Date (UTC) as DD/MM/YYYY.
function formatGenkeyDate(date) {
  const dd = String(date.getUTCDate()).padStart(2, '0');
  const mm = String(date.getUTCMonth() + 1).padStart(2, '0');
  const yyyy = date.getUTCFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

// Does this token look like an expiry the admin tried to type
// (a date with slashes, or digits + letters like 30x / 7w)?
// Used to tell "bad expiry" apart from an ordinary name word.
function looksLikeExpiryAttempt(token) {
  return token.includes('/') || /^\d+[a-zA-Z]+$/.test(token);
}

bot.command('genkey', async (ctx) => {
  // 1. Admin check — ADMIN_TELEGRAM_ID must be set, and the sender
  //    must match it. Compare as strings (Telegram ids are numbers).
  const adminId = process.env.ADMIN_TELEGRAM_ID;
  if (!adminId) {
    return ctx.reply(
      '⚠️ /genkey is not set up yet.\n' +
      'The admin needs to set ADMIN_TELEGRAM_ID in Railway Variables first.'
    );
  }
  if (String(ctx.from.id) !== String(adminId)) {
    return ctx.reply('This command is for the admin only.');
  }

  // 2. Server secret must be configured.
  const adminSecret = process.env.LICENSE_ADMIN_SECRET;
  if (!adminSecret) {
    return ctx.reply(
      '⚠️ The license server is not configured yet.\n' +
      'The admin needs to set LICENSE_ADMIN_SECRET in Railway Variables.'
    );
  }

  // 3. Parse arguments: /genkey <buyer name> [@telegram] [expiry]
  //    Buyer name may be several words — everything up to the
  //    @telegram token or the expiry token.
  const text = (ctx.message && ctx.message.text) || '';
  const args = text.replace(/^\/genkey(@\S+)?\s*/i, '').trim();
  if (!args) {
    return ctx.reply(GENKEY_USAGE);
  }
  const tokens = args.split(/\s+/);
  const nameWords = [];
  let telegram = null;
  let expiry = { ok: true, kind: 'lifetime' };
  for (const token of tokens) {
    if (token.startsWith('@')) {
      telegram = token.slice(1) || null; // strip the leading @
      continue;
    }
    const parsed = parseGenkeyExpiry(token);
    if (parsed.ok && parsed.kind !== 'lifetime') {
      expiry = parsed;
      continue;
    }
    if (parsed.ok) continue; // a bare 'lifetime' token
    if (looksLikeExpiryAttempt(token)) {
      return ctx.reply(
        '❌ Expiry not understood: "' + token + '"\n' +
        'Accepted formats: DD/MM/YYYY (e.g. 31/12/2026), Nd days (e.g. 30d, 90d), or lifetime.\n\n' +
        GENKEY_USAGE
      );
    }
    nameWords.push(token);
  }
  const buyer = nameWords.join(' ').trim();
  if (!buyer) {
    return ctx.reply(GENKEY_USAGE);
  }
  if (!expiry.ok) {
    return ctx.reply(
      '❌ Expiry not understood.\n' +
      'Accepted formats: DD/MM/YYYY (e.g. 31/12/2026), Nd days (e.g. 30d, 90d), or lifetime.'
    );
  }

  // 4. Build the request body.
  const body = { buyer, telegram: telegram || null };
  let expiryDisplay = 'Lifetime';
  if (expiry.kind === 'date') {
    body.expiresAt = expiry.date.toISOString();
    expiryDisplay = formatGenkeyDate(expiry.date);
  } else if (expiry.kind === 'days') {
    body.expiresInDays = expiry.days;
    const until = new Date(Date.now() + expiry.days * 24 * 60 * 60 * 1000);
    expiryDisplay = formatGenkeyDate(until);
  }

  // 5. Ask the PayServer to create the key.
  const payserverUrl = (process.env.PAYSERVER_URL || 'https://payserver-production.up.railway.app').replace(/\/$/, '');
  let res;
  try {
    res = await fetch(payserverUrl + '/api/license/create', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Admin-Secret': adminSecret,
      },
      body: JSON.stringify(body),
    });
  } catch (e) {
    console.error('genkey: could not reach PayServer:', e.message);
    return ctx.reply(
      '❌ Could not reach the license server (' + payserverUrl + ').\n' +
      'Error: ' + e.message + '\nNo key was created — please try again.'
    );
  }

  let data = {};
  try {
    data = await res.json();
  } catch (e) {
    // Non-JSON reply — fall through and report the status below.
  }
  const key = data.key || data.licenseKey || data.license_key;
  if (!res.ok || !key) {
    const serverMsg = (data && (data.error || data.message)) || '';
    console.error('genkey: PayServer error, status', res.status, serverMsg || '(no message)');
    return ctx.reply(
      '❌ The license server returned an error (HTTP ' + res.status + ')' +
      (serverMsg ? ': ' + serverMsg : '.') +
      '\nNo key was created.'
    );
  }

  console.log('genkey: key created for buyer "' + buyer + '"');
  return ctx.reply(
    '✅ License key created!\n\n' +
    '🔑 Key:\n<code>' + key + '</code>\n\n' +
    '👤 Buyer: ' + buyer + '\n' +
    '📱 Telegram: ' + (telegram ? '@' + telegram : '—') + '\n' +
    '📅 Expiry: ' + expiryDisplay + '\n\n' +
    '📊 Logged in the Google Sheet.',
    { parse_mode: 'HTML' }
  );
});

module.exports = { parseGenkeyExpiry };

bot.launch().then(() => {
  console.log('✅ Drama bot v2.3 is running. Open it in Telegram and press /start');
  console.log('   Mini App URL:', cfg.WEBAPP_URL);
});
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
