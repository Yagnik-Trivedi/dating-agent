// Plan 11A: a persona's measured voice (language shares, code-switching, style), shared by check-personas and restyle.
import { tagLanguageHeuristic } from '../../../src/services/kg/language.js';

const EMOJI = /\p{Extended_Pictographic}/gu;

/** Measured voice of one persona: language shares, code-switching, style tags. */
export function measure(p, shareMin = 0.12) {
  const e = Object.values(p.answers?.E ?? {}).filter((t) => String(t).trim());
  const n = e.length || 1;
  const mix = {};
  let switches = 0;
  for (const t of e) {
    const tag = tagLanguageHeuristic(t);
    if (tag.codeSwitch) switches++;
    for (const [l, v] of Object.entries(tag.shares)) mix[l] = (mix[l] ?? 0) + v / n;
  }
  const words = e.map((t) => t.split(/\s+/).filter(Boolean).length);
  const avgWords = words.reduce((a, b) => a + b, 0) / n;
  const emoji = e.reduce((k, t) => k + (t.match(EMOJI)?.length ?? 0), 0) / n;
  const endPunct = e.filter((t) => /[.!?]["')\]]?$/.test(t.trim())).length / n;
  const caps = e.filter((t) => /^\p{Lu}/u.test(t.trim())).length / n;
  const styles = [
    avgWords <= 6 && endPunct < 0.3 && 'terse', emoji >= 0.8 && 'emoji', avgWords >= 18 && 'long',
    caps >= 0.8 && endPunct >= 0.7 && emoji < 0.2 && 'formal',
  ].filter(Boolean);
  const langs = Object.entries(mix).filter(([, v]) => v >= shareMin).map(([l]) => l);
  return { mix, langs, switches, avgWords, emoji, endPunct, styles };
}

