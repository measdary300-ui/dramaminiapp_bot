// ============================================================
// Telegram Drama Bot v2.4.1 — Node.js + Telegraf
// v2.4.1: BANNER_PHOTO now ends with ?v=2 (cache-bust) so Telegram
// fetches the banner FRESH instead of serving its cached copy of
// an older banner.jpg. GitHub Pages ignores the query for static
// files, so it still serves banner.jpg.
// v2.6: /genkeys (bulk) + Ndev flag — public weekly keys.
//   /genkey <name> <Nd> <Ndev> (e.g. /genkey Public 7d 10dev) creates
//   an activation-based key: up to N devices, each valid Nd days from
//   ITS OWN activation (PayServer v1.1.3). Without the Ndev flag,
//   /genkey behaves EXACTLY as before (fixed expiry / lifetime, 1 PC).
//   /genkeys <count> <name> [expiry] [Ndev] creates many keys at once
//   (count 1–20). Parsing lives in parseGenkeyArgs so both commands
//   share it; bot.launch() only runs when this file is run directly.
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
  'Key សាធារណៈ (public weekly key) — 1 key ប្រើបានច្រើន device,\n' +
  'device នីមួយៗមានសុពលភាព Nd ថ្ងៃចាប់ពីពេលវា activate៖\n' +
  '/genkey <ឈ្មោះ> <Nd> <Ndev>  (ឧ. /genkey Public 7d 10dev)\n\n' +
  'ឧទាហរណ៍:\n' +
  '/genkey Sokha Chan\n' +
  '/genkey Sokha Chan @sokha 30d\n' +
  '/genkey Sokha Chan @sokha 31/12/2026\n' +
  '/genkey Public 7d 10dev';

const GENKEYS_USAGE =
  '🔑 ការប្រើប្រាស់ /genkeys:\n' +
  '/genkeys <ចំនួន 1–20> <ឈ្មោះអ្នកទិញ> [@telegram] [expiry] [Ndev]\n\n' +
  'Expiry: DD/MM/YYYY, Nd ថ្ងៃ, ឬ lifetime (ឬមិនដាក់)។\n' +
  'ដាក់ Ndev (ឧ. 10dev) ដើម្បីបង្កើត public weekly keys —\n' +
  'Nd ថ្ងៃនោះគឺក្នុងមួយ device ចាប់ពីពេល activate។\n\n' +
  'ឧទាហរណ៍:\n' +
  '/genkeys 10 Public 7d 10dev\n' +
  '/genkeys 5 Sokha Chan 30d';

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

// Parse one Ndev token (e.g. 10dev → 10 devices). Returns
//   { ok: true, maxDevices }  or  { ok: false }.
function parseGenkeyDev(token) {
  const m = String(token || '').trim().match(/^(\d+)dev$/i);
  if (!m) return { ok: false };
  const maxDevices = parseInt(m[1], 10);
  if (maxDevices < 1 || maxDevices > 10) return { ok: false };
  return { ok: true, maxDevices };
}

// Parse the arguments after /genkey or /genkeys (without the command).
// Shared by both commands so they behave identically.
// Returns { ok:true, buyer, telegram, expiry, maxDevices, activationDays }
// or { ok:false, reply } — reply is the exact text to send the admin.
//   expiry: as parseGenkeyExpiry ({ kind:'lifetime'|'days'|'date', ... })
//   maxDevices: null (legacy 1-PC key) or 1–10 (Ndev flag given)
//   activationDays: null, or Nd when the Ndev flag was given — then
//     expiry.kind is always 'days' and expiry.days is the PER-DEVICE
//     days, NOT a fixed expiry.
function parseGenkeyArgs(argsText, usage) {
  const tokens = (argsText || '').trim().split(/\s+/).filter(Boolean);
  const nameWords = [];
  let telegram = null;
  let expiry = { ok: true, kind: 'lifetime' };
  let maxDevices = null;
  for (const token of tokens) {
    if (token.startsWith('@')) {
      telegram = token.slice(1) || null; // strip the leading @
      continue;
    }
    const dev = parseGenkeyDev(token);
    if (dev.ok) { maxDevices = dev.maxDevices; continue; }
    if (/^\d+dev$/i.test(token)) {
      return { ok: false, reply: '❌ Devices must be 1–10 (e.g. 10dev).\n\n' + usage };
    }
    const parsed = parseGenkeyExpiry(token);
    if (parsed.ok && parsed.kind !== 'lifetime') {
      expiry = parsed;
      continue;
    }
    if (parsed.ok) continue; // a bare 'lifetime' token
    if (looksLikeExpiryAttempt(token)) {
      return { ok: false, reply:
        '❌ Expiry not understood: "' + token + '"\n' +
        'Accepted formats: DD/MM/YYYY (e.g. 31/12/2026), Nd days (e.g. 30d, 90d), or lifetime.\n\n' + usage };
    }
    nameWords.push(token);
  }
  const buyer = nameWords.join(' ').trim();
  if (!buyer) return { ok: false, reply: usage };
  if (maxDevices !== null) {
    if (expiry.kind === 'date') {
      return { ok: false, reply: '❌ Ndev (e.g. 10dev) needs Nd days (e.g. 7d), not a fixed date.\n\n' + usage };
    }
    if (expiry.kind !== 'days') {
      return { ok: false, reply: '❌ Ndev (e.g. 10dev) needs Nd days — e.g. /genkey Public 7d 10dev.\n\n' + usage };
    }
    return { ok: true, buyer, telegram, expiry, maxDevices, activationDays: expiry.days };
  }
  return { ok: true, buyer, telegram, expiry, maxDevices: null, activationDays: null };
}

// Shared admin check for /genkey and /genkeys. Replies on failure and
// returns false; returns true only when the sender is the admin AND the
// license server secret is configured. (Reply texts identical to the
// old inline /genkey checks.)
async function checkLicenseAdmin(ctx) {
  const adminId = process.env.ADMIN_TELEGRAM_ID;
  if (!adminId) {
    await ctx.reply(
      '⚠️ /genkey is not set up yet.\n' +
      'The admin needs to set ADMIN_TELEGRAM_ID in Railway Variables first.'
    );
    return false;
  }
  if (String(ctx.from.id) !== String(adminId)) {
    await ctx.reply('This command is for the admin only.');
    return false;
  }
  const adminSecret = process.env.LICENSE_ADMIN_SECRET;
  if (!adminSecret) {
    await ctx.reply(
      '⚠️ The license server is not configured yet.\n' +
      'The admin needs to set LICENSE_ADMIN_SECRET in Railway Variables.'
    );
    return false;
  }
  return true;
}

// Ask the PayServer to create one license key. Returns
// { ok:true, key, data } or { ok:false, message, tail }.
// `message` is the error itself; `tail` is the "No key was created…"
// sentence /genkey appends (genkeys reuses `message` alone when some
// keys were already created). Wording matches the old /genkey replies.
async function requestLicenseKey(adminSecret, payserverUrl, body) {
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
    console.error('license: could not reach PayServer:', e.message);
    return { ok: false,
      message: '❌ Could not reach the license server (' + payserverUrl + ').\n' +
        'Error: ' + e.message,
      tail: 'No key was created — please try again.' };
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
    console.error('license: PayServer error, status', res.status, serverMsg || '(no message)');
    return { ok: false,
      message: '❌ The license server returned an error (HTTP ' + res.status + ')' +
        (serverMsg ? ': ' + serverMsg : '.'),
      tail: 'No key was created.' };
  }
  return { ok: true, key, data };
}

bot.command('genkey', async (ctx) => {
  if (!await checkLicenseAdmin(ctx)) return;
  const adminSecret = process.env.LICENSE_ADMIN_SECRET;

  // Parse arguments: /genkey <buyer name> [@telegram] [expiry] [Ndev]
  // Buyer name may be several words. With an Ndev flag (e.g. 10dev),
  // the Nd expiry is per-device days (activation-based key), not a
  // fixed expiry. Without the flag, behavior is EXACTLY as before.
  const text = (ctx.message && ctx.message.text) || '';
  const args = text.replace(/^\/genkey(@\S+)?\s*/i, '').trim();
  if (!args) {
    return ctx.reply(GENKEY_USAGE);
  }
  const parsed = parseGenkeyArgs(args, GENKEY_USAGE);
  if (!parsed.ok) {
    return ctx.reply(parsed.reply);
  }

  // Build the request body.
  const body = { buyer: parsed.buyer, telegram: parsed.telegram || null };
  let expiryDisplay = 'Lifetime';
  if (parsed.activationDays !== null) {
    body.activationDays = parsed.activationDays;
    body.maxDevices = parsed.maxDevices;
    expiryDisplay = parsed.activationDays + ' days per device from activation';
  } else if (parsed.expiry.kind === 'date') {
    body.expiresAt = parsed.expiry.date.toISOString();
    expiryDisplay = formatGenkeyDate(parsed.expiry.date);
  } else if (parsed.expiry.kind === 'days') {
    body.expiresInDays = parsed.expiry.days;
    const until = new Date(Date.now() + parsed.expiry.days * 24 * 60 * 60 * 1000);
    expiryDisplay = formatGenkeyDate(until);
  }

  // Ask the PayServer to create the key.
  const payserverUrl = (process.env.PAYSERVER_URL || 'https://payserver-production.up.railway.app').replace(/\/$/, '');
  const result = await requestLicenseKey(adminSecret, payserverUrl, body);
  if (!result.ok) {
    return ctx.reply(result.message + '\n' + result.tail);
  }

  console.log('genkey: key created for buyer "' + parsed.buyer + '"');
  const typeLine = parsed.activationDays !== null
    ? '\n📱 Devices: ' + parsed.maxDevices + ' · ⏱ ' + parsed.activationDays + ' days per device from activation'
    : '';
  return ctx.reply(
    '✅ License key created!\n\n' +
    '🔑 Key:\n<code>' + result.key + '</code>\n\n' +
    '👤 Buyer: ' + parsed.buyer + '\n' +
    '📱 Telegram: ' + (parsed.telegram ? '@' + parsed.telegram : '—') + '\n' +
    '📅 Expiry: ' + expiryDisplay + typeLine + '\n\n' +
    '📊 Logged in the Google Sheet.',
    { parse_mode: 'HTML' }
  );
});

// /genkeys — create MANY license keys at once (admin-only).
//   /genkeys <count 1–20> <buyer name> [@telegram] [expiry] [Ndev]
// The arguments after the count parse exactly like /genkey, so
// /genkeys 10 Public 7d 10dev creates 10 public weekly keys.
// If a create fails midway, the keys already created are still
// listed in the reply (never silently lost).
bot.command('genkeys', async (ctx) => {
  if (!await checkLicenseAdmin(ctx)) return;
  const adminSecret = process.env.LICENSE_ADMIN_SECRET;

  const text = (ctx.message && ctx.message.text) || '';
  const args = text.replace(/^\/genkeys(@\S+)?\s*/i, '').trim();
  if (!args) {
    return ctx.reply(GENKEYS_USAGE);
  }
  const firstSpace = args.search(/\s/);
  const countToken = firstSpace < 0 ? args : args.slice(0, firstSpace);
  const rest = firstSpace < 0 ? '' : args.slice(firstSpace + 1).trim();
  const count = Number(countToken);
  if (!/^\d+$/.test(countToken) || !Number.isInteger(count) || count < 1 || count > 20) {
    return ctx.reply(
      '❌ Count must be a number from 1 to 20.\n\n' + GENKEYS_USAGE
    );
  }
  const parsed = parseGenkeyArgs(rest, GENKEYS_USAGE);
  if (!parsed.ok) {
    return ctx.reply(parsed.reply);
  }

  const body = { buyer: parsed.buyer, telegram: parsed.telegram || null };
  let expiryDisplay = 'Lifetime';
  if (parsed.activationDays !== null) {
    body.activationDays = parsed.activationDays;
    body.maxDevices = parsed.maxDevices;
    expiryDisplay = parsed.activationDays + ' days per device from activation';
  } else if (parsed.expiry.kind === 'date') {
    body.expiresAt = parsed.expiry.date.toISOString();
    expiryDisplay = formatGenkeyDate(parsed.expiry.date);
  } else if (parsed.expiry.kind === 'days') {
    body.expiresInDays = parsed.expiry.days;
    const until = new Date(Date.now() + parsed.expiry.days * 24 * 60 * 60 * 1000);
    expiryDisplay = formatGenkeyDate(until);
  }

  const payserverUrl = (process.env.PAYSERVER_URL || 'https://payserver-production.up.railway.app').replace(/\/$/, '');
  const keys = [];
  let failMessage = null;
  for (let i = 0; i < count; i++) {
    const result = await requestLicenseKey(adminSecret, payserverUrl, body);
    if (!result.ok) { failMessage = result.message; break; }
    keys.push(result.key);
  }
  console.log('genkeys: ' + keys.length + '/' + count + ' keys created for buyer "' + parsed.buyer + '"');
  const typeLine = parsed.activationDays !== null
    ? '\n📱 Devices: ' + parsed.maxDevices + ' · ⏱ ' + parsed.activationDays + ' days per device from activation'
    : '';
  const list = keys.map((k, i) => (i + 1) + '. <code>' + k + '</code>').join('\n');
  if (failMessage) {
    return ctx.reply(
      '⚠️ Only ' + keys.length + ' of ' + count + ' keys were created.\n\n' +
      (list ? list + '\n\n' : '') +
      failMessage + '\n\n' +
      '👤 Buyer: ' + parsed.buyer + '\n' +
      '📅 Expiry: ' + expiryDisplay + typeLine + '\n\n' +
      '📊 The created keys are logged in the Google Sheet.',
      { parse_mode: 'HTML' }
    );
  }
  return ctx.reply(
    '✅ ' + keys.length + ' license keys created!\n\n' +
    '👤 Buyer: ' + parsed.buyer + '\n' +
    '📱 Telegram: ' + (parsed.telegram ? '@' + parsed.telegram : '—') + '\n' +
    '📅 Expiry: ' + expiryDisplay + typeLine + '\n\n' +
    list + '\n\n' +
    '📊 Logged in the Google Sheet.',
    { parse_mode: 'HTML' }
  );
});

module.exports = { bot, parseGenkeyExpiry, parseGenkeyDev, parseGenkeyArgs, requestLicenseKey, checkLicenseAdmin, GENKEY_USAGE, GENKEYS_USAGE };

// Only launch the bot when run directly (node bot.js). Requiring this
// file (e.g. from tests) must not connect to Telegram.
if (require.main === module) {
  bot.launch().then(() => {
    console.log('✅ Drama bot v2.3 is running. Open it in Telegram and press /start');
    console.log('   Mini App URL:', cfg.WEBAPP_URL);
  });
}
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
