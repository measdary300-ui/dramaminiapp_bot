// Tests for the /genkey handler in bot.js — no test framework, plain asserts.
// Mocks Telegraf (fake ctx + captured handlers) and global fetch.
// Run:  BOT_TOKEN=x WEBAPP_URL=https://example.com/app node test-genkey.js
'use strict';
const assert = require('node:assert');
const Module = require('node:module');

// --- Stub 'telegraf' before requiring bot.js -------------------------------
let handlers = {};
class FakeBot {
  constructor(token) { this.token = token; }
  start(fn) { handlers.start = fn; }
  help(fn) { handlers.help = fn; }
  command(name, fn) { handlers['command:' + name] = fn; }
  launch() { return Promise.resolve(); }
  stop() {}
}
const FakeMarkup = {
  inlineKeyboard: () => ({ reply_markup: {} }),
  keyboard: () => ({ resize: () => ({}) }),
  button: { webApp: () => ({}) },
};
const origLoad = Module._load;
Module._load = function (request, ...rest) {
  if (request === 'telegraf') return { Telegraf: FakeBot, Markup: FakeMarkup };
  return origLoad.call(this, request, ...rest);
};

// --- Env for bot.js load (BOT_TOKEN / WEBAPP_URL are required at load) -----
process.env.BOT_TOKEN = 'test-token';
process.env.WEBAPP_URL = 'https://example.com/app?v=2.8';
process.env.ADMIN_TELEGRAM_ID = '111';
process.env.LICENSE_ADMIN_SECRET = 'test-admin-secret';
process.env.PAYSERVER_URL = 'https://payserver.example.test';

const bot = require('./bot.js');
const genkey = handlers['command:genkey'];
assert.ok(typeof genkey === 'function', 'genkey handler must be registered');

// --- Mock fetch ------------------------------------------------------------
let fetchCalls = [];
let fetchBehaviour = 'ok'; // 'ok' | 'server500' | 'throw'
global.fetch = async (url, opts) => {
  fetchCalls.push({ url, opts });
  if (fetchBehaviour === 'throw') throw new Error('ECONNREFUSED');
  if (fetchBehaviour === 'server500') {
    return { ok: false, status: 500, json: async () => ({ error: 'database down' }) };
  }
  return { ok: true, status: 200, json: async () => ({ key: 'SRDL-TEST-KEY-1234' }) };
};

// --- Fake ctx --------------------------------------------------------------
function fakeCtx(text, fromId = 111) {
  const replies = [];
  return {
    ctx: {
      from: { id: fromId, first_name: 'Admin' },
      message: { text },
      reply: async (msg, extra) => { replies.push({ text: msg, extra }); return msg; },
    },
    replies,
  };
}
function setEnv(patch) {
  for (const [k, v] of Object.entries(patch)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
}

let passed = 0;
let failed = 0;
async function test(name, fn) {
  fetchCalls = [];
  fetchBehaviour = 'ok';
  setEnv({ ADMIN_TELEGRAM_ID: '111', LICENSE_ADMIN_SECRET: 'test-admin-secret', PAYSERVER_URL: 'https://payserver.example.test' });
  try {
    await fn();
    passed++;
    console.log('  PASS:', name);
  } catch (e) {
    failed++;
    console.log('  FAIL:', name, '—', e.message);
  }
}

(async () => {
  console.log('Running /genkey tests...\n');

  await test('1. admin allowed — success reply has key in code block + buyer + expiry, fetch shape correct', async () => {
    const { ctx, replies } = fakeCtx('/genkey Sokha Chan @sokha 30d');
    await genkey(ctx);
    assert.strictEqual(fetchCalls.length, 1, 'fetch must be called once');
    const call = fetchCalls[0];
    assert.strictEqual(call.url, 'https://payserver.example.test/api/license/create');
    assert.strictEqual(call.opts.method, 'POST');
    assert.strictEqual(call.opts.headers['Content-Type'], 'application/json');
    assert.strictEqual(call.opts.headers['X-Admin-Secret'], 'test-admin-secret');
    const body = JSON.parse(call.opts.body);
    assert.strictEqual(body.buyer, 'Sokha Chan');
    assert.strictEqual(body.telegram, 'sokha', '@ must be stripped');
    assert.strictEqual(body.expiresInDays, 30);
    assert.ok(!('expiresAt' in body), 'no expiresAt for Nd form');
    assert.strictEqual(replies.length, 1);
    assert.ok(replies[0].text.includes('<code>SRDL-TEST-KEY-1234</code>'), 'key in code block');
    assert.ok(replies[0].text.includes('Sokha Chan'), 'buyer in reply');
    assert.ok(replies[0].text.includes('@sokha'), 'telegram in reply');
    assert.ok(/📅 Expiry: \d{2}\/\d{2}\/\d{4}/.test(replies[0].text), 'expiry date shown');
    assert.ok(replies[0].text.includes('Google Sheet'), 'sheet line present');
    assert.ok(!replies[0].text.includes('test-admin-secret'), 'secret must not leak in reply');
  });

  await test('2. non-admin refused, fetch NOT called', async () => {
    const { ctx, replies } = fakeCtx('/genkey Sokha Chan', 999);
    await genkey(ctx);
    assert.strictEqual(fetchCalls.length, 0);
    assert.strictEqual(replies.length, 1);
    assert.ok(replies[0].text.includes('admin only'));
  });

  await test('3. unset ADMIN_TELEGRAM_ID refuses everyone, fetch NOT called', async () => {
    setEnv({ ADMIN_TELEGRAM_ID: undefined });
    const { ctx, replies } = fakeCtx('/genkey Sokha Chan', 111);
    await genkey(ctx);
    assert.strictEqual(fetchCalls.length, 0);
    assert.ok(replies[0].text.includes('ADMIN_TELEGRAM_ID'), 'setup message names the var');
  });

  await test('4. missing buyer → usage help, fetch NOT called', async () => {
    const { ctx, replies } = fakeCtx('/genkey');
    await genkey(ctx);
    assert.strictEqual(fetchCalls.length, 0);
    assert.ok(replies[0].text.includes('/genkey <'), 'usage format shown');
    assert.ok(replies[0].text.includes('30d'), 'examples shown');
  });

  await test('5. expiry DD/MM/YYYY → correct ISO date sent, reply shows 31/12/2026', async () => {
    const { ctx, replies } = fakeCtx('/genkey Sokha 31/12/2026');
    await genkey(ctx);
    assert.strictEqual(fetchCalls.length, 1);
    const body = JSON.parse(fetchCalls[0].opts.body);
    assert.strictEqual(body.expiresAt, '2026-12-31T00:00:00.000Z');
    assert.ok(!('expiresInDays' in body));
    assert.ok(replies[0].text.includes('31/12/2026'));
    assert.ok(replies[0].text.includes('<code>SRDL-TEST-KEY-1234</code>'));
  });

  await test('6. expiry 90d → expiresInDays 90 sent', async () => {
    const { ctx } = fakeCtx('/genkey Sokha 90d');
    await genkey(ctx);
    const body = JSON.parse(fetchCalls[0].opts.body);
    assert.strictEqual(body.expiresInDays, 90);
    assert.ok(!('expiresAt' in body));
  });

  await test('7. lifetime and absent expiry → neither field sent', async () => {
    const { ctx } = fakeCtx('/genkey Sokha lifetime');
    await genkey(ctx);
    let body = JSON.parse(fetchCalls[0].opts.body);
    assert.ok(!('expiresAt' in body) && !('expiresInDays' in body), 'lifetime sends neither');
    fetchCalls = [];
    const second = fakeCtx('/genkey Sokha');
    await genkey(second.ctx);
    body = JSON.parse(fetchCalls[0].opts.body);
    assert.ok(!('expiresAt' in body) && !('expiresInDays' in body), 'absent expiry sends neither');
    assert.ok(second.replies[0].text.includes('Lifetime'), 'reply shows Lifetime');
  });

  await test('8. bad expiry (32/13/2026, 31/02/2026, 30x) → error reply, fetch NOT called', async () => {
    for (const bad of ['32/13/2026', '31/02/2026', '30x', '12/2026']) {
      fetchCalls = [];
      const { ctx, replies } = fakeCtx('/genkey Sokha ' + bad);
      await genkey(ctx);
      assert.strictEqual(fetchCalls.length, 0, 'fetch must not be called for ' + bad);
      assert.ok(replies[0].text.includes('not understood') || replies[0].text.includes('Accepted formats'), 'error names accepted formats for ' + bad);
    }
  });

  await test('9. @telegram stripped, multi-word buyer name kept whole, no-telegram shows —', async () => {
    const { ctx, replies } = fakeCtx('/genkey Sokha Chan Dara @sokha_chan 30d');
    await genkey(ctx);
    const body = JSON.parse(fetchCalls[0].opts.body);
    assert.strictEqual(body.buyer, 'Sokha Chan Dara');
    assert.strictEqual(body.telegram, 'sokha_chan');
    assert.ok(replies[0].text.includes('@sokha_chan'));
    fetchCalls = [];
    const noTg = fakeCtx('/genkey Sokha Chan 30d');
    await genkey(noTg.ctx);
    const body2 = JSON.parse(fetchCalls[0].opts.body);
    assert.strictEqual(body2.telegram, null);
    assert.ok(noTg.replies[0].text.includes('—'), 'no telegram shows —');
  });

  await test('10. server 500 → honest error reply with status + server message, no key', async () => {
    fetchBehaviour = 'server500';
    const { ctx, replies } = fakeCtx('/genkey Sokha 30d');
    await genkey(ctx);
    assert.strictEqual(replies.length, 1);
    assert.ok(replies[0].text.includes('500'), 'status shown');
    assert.ok(replies[0].text.includes('database down'), 'server message shown');
    assert.ok(!replies[0].text.includes('SRDL-TEST-KEY'), 'no key in error reply');
    assert.ok(replies[0].text.includes('No key was created'));
  });

  await test('11. network failure → honest error reply, no key', async () => {
    fetchBehaviour = 'throw';
    const { ctx, replies } = fakeCtx('/genkey Sokha 30d');
    await genkey(ctx);
    assert.ok(replies[0].text.includes('Could not reach'), 'reach error shown');
    assert.ok(replies[0].text.includes('ECONNREFUSED'), 'underlying error shown');
    assert.ok(!replies[0].text.includes('SRDL-TEST-KEY'));
  });

  await test('12. missing LICENSE_ADMIN_SECRET → config error reply, fetch NOT called', async () => {
    setEnv({ LICENSE_ADMIN_SECRET: undefined });
    const { ctx, replies } = fakeCtx('/genkey Sokha 30d');
    await genkey(ctx);
    assert.strictEqual(fetchCalls.length, 0);
    assert.ok(replies[0].text.includes('LICENSE_ADMIN_SECRET'), 'config message names the var');
  });

  await test('13. parseGenkeyExpiry unit checks (exported helper)', async () => {
    const { parseGenkeyExpiry } = bot;
    assert.deepStrictEqual(parseGenkeyExpiry('31/12/2026'), { ok: true, kind: 'date', date: new Date(Date.UTC(2026, 11, 31)) });
    assert.deepStrictEqual(parseGenkeyExpiry('30d'), { ok: true, kind: 'days', days: 30 });
    assert.deepStrictEqual(parseGenkeyExpiry('lifetime'), { ok: true, kind: 'lifetime' });
    assert.deepStrictEqual(parseGenkeyExpiry(undefined), { ok: true, kind: 'lifetime' });
    assert.strictEqual(parseGenkeyExpiry('31/02/2026').ok, false);
    assert.strictEqual(parseGenkeyExpiry('0d').ok, false);
    assert.strictEqual(parseGenkeyExpiry('banana').ok, false);
  });

  console.log(`\n${passed} passed, ${failed} failed (of ${passed + failed})`);
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error('Test runner crashed:', e); process.exit(1); });
