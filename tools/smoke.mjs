// tools/smoke.mjs — headless smoke test. Serves the app, boots it in Chromium, drives every stream
// and capability (to surface runtime ReferenceErrors), exercises the custom-cake order handoff and
// the praise/ledger flow, and screenshots at 390px. Fails on ANY uncaught page error.
//
// Run: node tools/smoke.mjs   (uses the globally-installed playwright + preinstalled chromium)

import { createRequire } from 'module';
import { execSync } from 'child_process';
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const require = createRequire(import.meta.url);
const gRoot = execSync('npm root -g').toString().trim();
const { chromium } = require(path.join(gRoot, 'playwright'));

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MIME = {
  '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml', '.png': 'image/png',
};

const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p === '/') p = '/index.html';
  const file = path.join(ROOT, p);
  if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end('nf'); return; }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
});

const fail = (m) => { console.error('❌ ' + m); process.exitCode = 1; };
const ok = (m) => console.log('✓ ' + m);

await new Promise((r) => server.listen(0, r));
const PORT = server.address().port;
const BASE = `http://localhost:${PORT}/`;
console.log('serving', ROOT, 'on', BASE);

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
const errors = [];
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push('console.error: ' + m.text()); });

try {
  await page.goto(BASE, { waitUntil: 'networkidle' });

  // --- login as manager Priya (5678) via the PIN pad ---
  await page.waitForSelector('#login', { timeout: 8000 });
  for (const d of ['5', '6', '7', '8']) await page.click(`.pinpad .key:has-text("${d}")`);
  await page.waitForSelector('.stream-grid', { timeout: 8000 });
  ok('logged in, home stream grid rendered');

  const cards = await page.$$('.stream-card');
  if (cards.length < 7) fail(`expected >=7 stream cards, got ${cards.length}`); else ok(`${cards.length} stream cards`);

  // --- drive every ready stream x every capability via hash routes (surfaces runtime errors) ---
  const streams = await page.evaluate(async () => {
    const m = await import('./streams/manifests.js');
    return m.STREAMS.filter((s) => s.ready && !s.external).map((s) => ({ id: s.id, caps: s.capabilities }));
  });
  for (const s of streams) {
    for (const cap of s.caps) {
      await page.evaluate((h) => { location.hash = h; }, `#/s/${s.id}/${cap}`);
      await page.waitForTimeout(120);
      const has = await page.$eval('#view', (v) => v.children.length > 0).catch(() => false);
      if (!has) fail(`empty view for ${s.id}/${cap}`);
    }
  }
  ok(`walked ${streams.length} streams x their capabilities with no empty views`);

  // --- pull check creates a ledger event ---
  await page.evaluate(() => { location.hash = '#/s/doughnut/pull'; });
  await page.waitForSelector('.pull .item .checkbox', { timeout: 5000 });
  const before = await page.evaluate(() => JSON.parse(localStorage.getItem('ob.ledger.v1') || '[]').length);
  await page.click('.pull .item .checkbox');
  await page.waitForTimeout(150);
  const after = await page.evaluate(() => JSON.parse(localStorage.getItem('ob.ledger.v1') || '[]').length);
  if (after <= before) fail('pull check did not append a ledger event'); else ok('pull check appended a ledger event');

  // --- freezer mode opens (cake) ---
  await page.evaluate(() => { location.hash = '#/s/cake/pull'; });
  await page.waitForSelector('.freezer-btn', { timeout: 5000 });
  await page.click('.freezer-btn');
  await page.waitForSelector('.freezer .freezer-row', { timeout: 5000 });
  await page.click('.freezer .freezer-row');
  await page.click('.freezer .btn.ghost'); // Done
  ok('freezer mode opened, checked a row, and closed');

  // --- standards: manager publishes one ---
  await page.evaluate(() => { location.hash = '#/s/managers/standards'; });
  await page.waitForSelector('.standards-card', { timeout: 5000 });
  await page.click('.standards-card .tinybtn'); // Publish
  await page.waitForTimeout(120);
  ok('manager published a standard');

  // --- custom-cake handoff: place at packager, receive+advance at cake ---
  await page.evaluate(() => { location.hash = '#/s/packager/order'; });
  await page.waitForSelector('.order-form .input', { timeout: 5000 });
  await page.fill('.order-form .input', 'Smoke Test — 1/4 Sheet Chocolate');
  await page.click('.order-form .btn.block');
  await page.waitForTimeout(150);
  const placed = await page.evaluate(() => Object.keys(JSON.parse(localStorage.getItem('ob.orders.v1') || '{}')).length);
  if (placed < 1) fail('order was not placed'); else ok('order placed at packager');

  await page.evaluate(() => { location.hash = '#/s/cake/order'; });
  await page.waitForSelector('.order-card .advance', { timeout: 5000 });
  for (let i = 0; i < 4; i++) { const b = await page.$('.order-card .advance'); if (!b) break; await b.click(); await page.waitForTimeout(120); }
  ok('cake received and advanced the order through the flow');

  // --- hub: post + praise ---
  await page.evaluate(() => { location.hash = '#/hub'; });
  await page.waitForSelector('.composer .input', { timeout: 5000 });
  await page.fill('.composer .input', 'Case looks great');
  await page.click('.composer .btn:not(.ghost)');
  await page.waitForTimeout(120);
  const feedItems = await page.$$('.feed-item');
  if (!feedItems.length) fail('feed empty after posting'); else ok(`hub feed shows ${feedItems.length} items`);

  // --- ledger timeline + CSV ---
  await page.evaluate(() => { location.hash = '#/ledger'; });
  await page.waitForSelector('.timeline-row', { timeout: 5000 });
  const rows = await page.$$('.timeline-row');
  ok(`ledger timeline shows ${rows.length} rows`);
  await page.click('button:has-text("CSV")');
  await page.waitForTimeout(100);

  await page.screenshot({ path: path.join(ROOT, 'tools', 'smoke-ledger.png') });
  await page.evaluate(() => { location.hash = '#/home'; });
  await page.waitForSelector('.stream-grid');
  await page.screenshot({ path: path.join(ROOT, 'tools', 'smoke-home.png') });
  ok('screenshots written');

  if (errors.length) { for (const e of errors) fail(e); } else ok('no uncaught page errors across the whole walk');
} catch (e) {
  fail('exception: ' + e.message);
  const html = await page.$eval('#view', (v) => v.innerHTML).catch(() => '(no #view)');
  console.error('--- #view snapshot ---\n' + html.slice(0, 600));
  console.error('--- captured errors ---\n' + (errors.join('\n') || '(none)'));
} finally {
  await browser.close();
  server.close();
  console.log(process.exitCode ? '\nSMOKE FAILED' : '\nSMOKE PASSED');
}
