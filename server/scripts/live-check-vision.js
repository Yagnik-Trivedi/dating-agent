// Plan 19, step 1 (manual): run the live-check vision prompt on your own JPEGs and print what the model sees per frame.
// Put 1–3 photos in server/scripts/live-check-samples/ (gitignored, never committed), named in order, e.g.
// 1-neutral.jpg, 2-turn_left.jpg (your own left), 3-phone-screen.jpg. Confirms the left/right mapping
// (turning to YOUR left should come back as facing "image_right") and that a photo shown on a phone gets
// screenOrPrintSigns. No database needed. Frames are never written anywhere.
//   npm run live-check:vision
import { readdirSync, readFileSync } from 'node:fs';
import { env } from '../src/config/env.js';
import { analyzeFrames } from '../src/services/liveCheck/index.js';

const DIR = new URL('./live-check-samples/', import.meta.url);
const files = readdirSync(DIR).filter((f) => /\.jpe?g$/i.test(f)).sort().slice(0, 3);
if (!files.length) { console.log('Add 1–3 JPEGs to server/scripts/live-check-samples/ first.'); process.exit(0); }
console.log(`${env.MODEL_VISION} on ${files.join(', ')}`);
const frames = files.map((f) => ({ action: f, jpegBase64: readFileSync(new URL(f, DIR)).toString('base64') }));
const t0 = Date.now();
const out = await analyzeFrames(frames, null);
console.log(JSON.stringify(out, null, 2));
console.log(`${Date.now() - t0} ms`);
process.exit(0);
