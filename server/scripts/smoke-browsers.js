// npm run smoke:browsers [-- --url <site>] [--api <api>] [--engines chromium,firefox,webkit] (plan 30 S0)
// Opens the site in each engine: the wake overlay must clear within 120 s, then it logs in as a seed account (with
// SEED_PASSWORD from .env, never printed) through the page itself (so CORS is exercised) and opens Discover.
// Fails on any console error, page error or failed /health, /api or socket request. Default: the local production
// build (vite preview on :4173 + the API on :5000).
import 'dotenv/config';
import { chromium, firefox, webkit } from 'playwright';

const arg = (name, def) => { const i = process.argv.indexOf(`--${name}`); return i > 0 ? process.argv[i + 1] : def; };
const BASE = arg('url', 'http://localhost:4173').replace(/\/$/, '');
const API = arg('api', 'http://localhost:5000').replace(/\/$/, '');
const EMAIL = arg('email', 'seed01@demo.local');
const ENGINES = { chromium, firefox, webkit };
const names = arg('engines', 'chromium,firefox,webkit').split(',');
const WAKE_MS = 120_000;

async function run(name) {
  const browser = await ENGINES[name].launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const problems = [];
  // Playwright's WebKit build for Windows crashes its network process on WebSockets to any server (a minimal `ws`
  // server too; plan 30 S0). Socket.IO falls back to polling, so that one message is ignored there, nothing else.
  const knownNoise = (t) => name === 'webkit' && process.platform === 'win32' && /WebSocket network error: Network process crashed/.test(t);
  page.on('console', (m) => { if (m.type() === 'error' && !knownNoise(m.text())) problems.push(`console: ${m.text().slice(0, 200)}${m.location()?.url ? ` @ ${m.location().url.replace(/\?.*/, '')}` : ''}`); });
  page.on('pageerror', (e) => problems.push(`pageerror: ${e.message.slice(0, 200)}`));
  page.on('requestfailed', (r) => { if (/\/health|\/api|socket\.io/.test(r.url())) problems.push(`failed: ${r.url().replace(/\?.*/, '')} (${r.failure()?.errorText})`); });
  page.on('response', (r) => { if (r.status() >= 400 && /\/health|\/api/.test(r.url())) problems.push(`HTTP ${r.status()} ${r.url().replace(/\?.*/, '')}`); });
  const t0 = Date.now();
  const steps = [];
  try {
    await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 60_000 });
    // The overlay only appears once the app has mounted and /health has been slow for 3 s, so wait past that first.
    await page.waitForFunction(() => document.querySelector('#root')?.children.length, null, { timeout: 60_000 });
    await page.waitForTimeout(3500);
    await page.waitForFunction(() => !document.querySelector('.wake'), null, { timeout: WAKE_MS, polling: 500 });
    await page.waitForLoadState('networkidle').catch(() => {}); // WebKit cancels in-flight fetches on a redirect
    steps.push(`awake ${Math.round((Date.now() - t0) / 1000)} s`);
    if (process.env.SEED_PASSWORD) {
      const status = await page.evaluate(async ([api, email, password]) => {
        const r = await fetch(`${api}/api/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, password }) });
        if (r.ok) localStorage.setItem('token', (await r.json()).token);
        return r.status;
      }, [API, EMAIL, process.env.SEED_PASSWORD]);
      if (status !== 200) throw new Error(`login returned ${status}`);
      await page.goto(`${BASE}/discover`, { waitUntil: 'domcontentloaded' });
      await page.waitForFunction(() => !document.querySelector('.wake') && location.pathname === '/discover' && document.querySelector('main, h1'), null, { timeout: WAKE_MS });
      await page.waitForTimeout(3000); // let Discover's requests and the socket settle
      steps.push('logged in, Discover open');
    } else steps.push('login skipped (no SEED_PASSWORD)');
  } catch (err) {
    const wake = await page.$eval('.wake', (el) => el.innerText.replace(/\s+/g, ' ').slice(0, 160)).catch(() => null);
    problems.push(`step failed: ${err.message.split('\n')[0]}${wake ? ` | overlay: "${wake}"` : ''}`);
  }
  await browser.close();
  return { name, ok: problems.length === 0, steps, problems };
}

let failed = false;
for (const name of names) {
  const r = await run(name);
  failed ||= !r.ok;
  console.log(`${r.ok ? '✓' : '✖'} ${r.name}: ${r.steps.join(' → ') || '—'}`);
  for (const p of [...new Set(r.problems)]) console.log(`    ${p}`);
}
console.log(`\n${BASE} (API ${API})`);
process.exit(failed ? 1 : 0);
