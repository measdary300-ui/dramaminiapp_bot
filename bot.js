// ============================================================
// Telegram Drama Bot v2.0 — Node.js + Telegraf
// ------------------------------------------------------------
// WHAT THIS BOT DOES:
//   /start → sends a banner photo + welcome text + an inline
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

// Banner photo for /start — poster of the featured drama
const BANNER_PHOTO = 'https://www.8movie.com/p/19087-tprf.jpg';

const bot = new Telegraf(cfg.BOT_TOKEN);

bot.start(async (ctx) => {
  const caption =
    `🎬 <b>សួស្តី ${ctx.from.first_name}!</b>\n\n` +
    `សូមស្វាគមន៍មកកាន់ <b>ផ្សាររៀង</b> — មើលរឿងភាគក្នុង Telegram!\n\n` +
    `✅ រឿងគ្រប់រឿងក្នុង App\n` +
    `🔥 កម្រិត Full HD 1080p មើលបានរលូន\n` +
    `📺 10 រឿង · 573 ភាគ — មានរឿងថ្មីៗជាប្រចាំ\n\n` +
    `👇 ចុចប៊ូតុងខាងក្រោមដើម្បីចូលមើលរឿង៖`;
  try {
    await ctx.replyWithPhoto(BANNER_PHOTO, {
      caption,
      parse_mode: 'HTML',
      reply_markup: Markup.inlineKeyboard([
        Markup.button.webApp('▶ OPEN APP', cfg.WEBAPP_URL),
      ]).reply_markup,
    });
  } catch (e) {
    // If the photo fails to send, fall back to text only
    console.error('Banner photo failed, sending text:', e.message);
    await ctx.reply(caption.replace(/<[^>]+>/g, ''), Markup.inlineKeyboard([
      Markup.button.webApp('▶ OPEN APP', cfg.WEBAPP_URL),
    ]));
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
    'វិធីមើល៖ ចុច "OPEN APP" ឬ "🎬 មើលរឿង" → ជ្រើសរើសរឿង → ជ្រើសរើសភាគ → វីដេអូនឹងចាក់ក្នុង Telegram។\n' +
    'ភាគដែលមើលរួចនឹងមានសញ្ញាពណ៌បៃតង។ បើវីដេអូមិនចាក់ — ចុច "8movie" ក្នុង player។'
  );
});

bot.launch().then(() => {
  console.log('✅ Drama bot v2.0 is running. Open it in Telegram and press /start');
  console.log('   Mini App URL:', cfg.WEBAPP_URL);
});
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
