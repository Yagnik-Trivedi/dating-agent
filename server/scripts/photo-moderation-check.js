// Plan 30 S3 acceptance: the photo moderation call + code decision on safe, generated test images (no real people,
// nothing explicit). Needs the LLM env (MODEL_VISION) and Playwright (devDependency) to draw the images.
//   node scripts/photo-moderation-check.js
import 'dotenv/config';
import { chromium } from 'playwright';
import { chatJSON } from '../src/services/llm/client.js';
import * as prompt from '../src/services/prompts/photoModeration.js';
import { decidePhoto, verdictSchema } from '../src/services/photos.js';

const scene = 'background:linear-gradient(#9cc3e6 0 55%,#6f9a5b 55%);height:100vh;margin:0;position:relative';
const CASES = [
  ['a landscape (not the first photo)', `<body style="${scene}"><div style="position:absolute;left:40%;top:30%;width:120px;height:120px;border-radius:50%;background:#f4d35e"></div></body>`, 'ok'],
  ['a phone number written on a card', `<body style="${scene}"><div style="position:absolute;left:20%;top:58%;padding:18px 26px;background:#fff;font:600 38px sans-serif;transform:rotate(-4deg)">WhatsApp me<br>+91 98765 43210</div></body>`, 'rejected'],
  ['a screenshot that is mostly text', `<body style="margin:0;padding:30px;font:24px/1.5 sans-serif;background:#fff">${'<p>Terms of service. By continuing you agree to the following conditions, which apply to every user of this service. </p>'.repeat(9)}</body>`, 'rejected'],
  // A QR-style pattern: three finder squares + pseudo-random modules (not a scannable code, just the look of one).
  ['a QR code on a poster', `<body style="${scene}"><canvas id="q" width="290" height="290" style="position:absolute;left:30%;top:25%;background:#fff;padding:20px"></canvas><script>
    const c = document.getElementById('q').getContext('2d'), m = 10; let s = 7;
    const r = () => (s = (s * 9301 + 49297) % 233280) / 233280;
    for (let y = 0; y < 29; y++) for (let x = 0; x < 29; x++) if (r() > 0.5) c.fillRect(x * m, y * m, m, m);
    for (const [x, y] of [[0, 0], [22, 0], [0, 22]]) { c.clearRect(x * m, y * m, 7 * m, 7 * m); c.fillRect(x * m, y * m, 7 * m, 7 * m); c.clearRect((x + 1) * m, (y + 1) * m, 5 * m, 5 * m); c.fillRect((x + 2) * m, (y + 2) * m, 3 * m, 3 * m); }
  </script></body>`, 'rejected'],
  ['a social media handle', `<body style="${scene}"><div style="position:absolute;left:12%;top:20%;font:700 54px sans-serif;color:#fff;text-shadow:0 2px 6px #0008">follow me @maps.and.chai</div></body>`, 'rejected'],
];

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 800, height: 1000 } });
let failed = 0;
for (const [name, html, want] of CASES) {
  await page.setContent(html);
  const jpeg = (await page.screenshot({ type: 'jpeg', quality: 80 })).toString('base64');
  const v = await chatJSON({ tier: 'vision', temperature: 0, reasoning: false, purpose: 'photo-moderation-check', schema: verdictSchema, messages: prompt.build({ jpegBase64: jpeg }), retries: 2 });
  const { status, reasons } = decidePhoto(v, { first: false });
  const ok = status === want;
  if (!ok) failed++;
  console.log(`${ok ? '✓' : '✗'} ${name}: ${status}${reasons.length ? ` (${reasons.join(' ')})` : ''}`);
}
await browser.close();
console.log(failed ? `\n${failed} case(s) wrong` : '\nAll moderation cases as expected.');
process.exit(failed ? 1 : 0);
