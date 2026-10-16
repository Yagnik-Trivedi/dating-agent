// Code-side language heuristics (plan 05 §1, F34): the fallback when the LLM language tagger is unavailable, and the
// romanised-Hindi counter the style metrics use. Real tagging of voice samples is prompts/tagLanguage.js.

// Romanised Hindi words that are unambiguous on their own.
const HINGLISH = new Set([
  'yaar', 'kya', 'hai', 'hain', 'nahi', 'nahin', 'acha', 'accha', 'achha', 'bhai', 'matlab', 'bas', 'arre', 'arey', 'haan',
  'kaise', 'kuch', 'bohot', 'bahut', 'thoda', 'chal', 'chalo', 'theek', 'thik', 'mast', 'sahi', 'abhi', 'kal', 'aaj', 'mera', 'meri',
  'tera', 'teri', 'koi', 'woh', 'yeh', 'kab', 'kyun', 'kyu', 'bilkul', 'pakka', 'jaldi', 'bindaas', 'ji', 'mujhe', 'tujhe', 'hoon',
]);
// Short words that are also English or other languages ("na", "ye", "hum", "tum"): counted only next to a clear one.
const AMBIGUOUS = new Set(['na', 'ye', 'hum', 'tum']);
// Romanised Gujarati markers (the second-biggest mix in our seed set).
const GUJLISH = new Set(['shu', 'kem', 'cho', 'chhe', 'che', 'majama', 'saru', 'nathi', 'tame', 'hu', 'kyare', 'bhai', 'ben']);

const SCRIPTS = [
  ['devanagari', /\p{Script=Devanagari}/u],
  ['gujarati', /\p{Script=Gujarati}/u],
  ['other', /[\p{Script=Tamil}\p{Script=Bengali}\p{Script=Telugu}\p{Script=Kannada}\p{Script=Malayalam}\p{Script=Gurmukhi}\p{Script=Arabic}]/u],
];
const LATIN = /\p{Script=Latin}/u;

export const tokensOf = (text) => String(text).toLowerCase().match(/[\p{L}\p{M}']+/gu) ?? [];

/** How many tokens are romanised Hindi (F34: ambiguous short words count only with a clear Hindi token present). */
export function hinglishCount(tokens) {
  const clear = tokens.filter((t) => HINGLISH.has(t)).length;
  return clear ? clear + tokens.filter((t) => AMBIGUOUS.has(t)).length : 0;
}

/** → { languages, script, codeSwitch } from code alone (coarse; the LLM tagger is preferred). */
export function tagLanguageHeuristic(text) {
  const scripts = SCRIPTS.filter(([, re]) => re.test(text)).map(([s]) => s);
  const hasLatin = LATIN.test(text);
  const tokens = tokensOf(text);
  const hi = hinglishCount(tokens);
  const gu = tokens.filter((t) => GUJLISH.has(t)).length;
  const languages = new Set();
  if (scripts.includes('devanagari')) languages.add('hi');
  if (scripts.includes('gujarati')) languages.add('gu');
  if (hi) languages.add('hi_latn');
  if (gu >= 2 || (gu && !hi)) languages.add('gu_latn');
  const englishTokens = hasLatin ? tokens.filter((t) => LATIN.test(t)).length - hi - gu : 0;
  if (englishTokens > 0 || !languages.size) languages.add('en');
  const script = scripts.length > 1 || (scripts.length && hasLatin) ? 'mixed' : (scripts[0] ?? 'latin');
  return { languages: [...languages], script, codeSwitch: languages.size > 1 };
}
