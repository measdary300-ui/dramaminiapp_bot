// ============================================================
// Telegram Drama Bot v2.4 — Node.js + Telegraf
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
// instead of the banner image!
const BANNER_PHOTO = cfg.WEBAPP_URL.split('?')[0].replace(/\/?$/, '/') + 'banner.jpg';
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

bot.launch().then(() => {
  console.log('✅ Drama bot v2.3 is running. Open it in Telegram and press /start');
  console.log('   Mini App URL:', cfg.WEBAPP_URL);
});
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
