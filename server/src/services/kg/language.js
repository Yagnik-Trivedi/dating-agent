// Code-side language heuristics (plan 05 §1, F34): the fallback when the LLM language tagger is unavailable, and the
// romanised-Hindi counter the style metrics use. Real tagging of voice samples is prompts/tagLanguage.js.

// Romanised Hindi words that are unambiguous on their own.
const HINGLISH = new Set([
  'yaar', 'kya', 'hai', 'hain', 'nahi', 'nahin', 'acha', 'accha', 'achha', 'bhai', 'matlab', 'bas', 'arre', 'arey', 'haan',
  'kaise', 'kuch', 'bohot', 'bahut', 'thoda', 'chal', 'chalo', 'theek', 'thik', 'mast', 'sahi', 'abhi', 'kal', 'aaj', 'mera', 'meri',
  'tera', 'teri', 'koi', 'woh', 'yeh', 'kab', 'kyun', 'kyu', 'bilkul', 'pakka', 'jaldi', 'bindaas', 'ji', 'mujhe', 'tujhe', 'hoon',
  'sab', 'rahe', 'raha', 'rahi', 'kar', 'karo', 'karna', 'tha', 'thi', 'kyunki', 'lekin', 'hota', 'hoga', 'accha', 'chalega',
]);
// Short words that are also English or other languages ("na", "ye", "hum", "tum"): counted only next to a clear one.
const AMBIGUOUS = new Set(['na', 'ye', 'hum', 'tum', 'ho', 'se', 'ko', 'ka', 'ki', 'ke', 'par', 'toh', 'aur', 'bhi', 'mein']);
// Romanised Gujarati markers (the second-biggest mix in our seed set).
const GUJLISH = new Set(['shu', 'kem', 'cho', 'chhe', 'che', 'majama', 'saru', 'nathi', 'tame', 'hu', 'kyare', 'bhai', 'ben', 'mane', 'tane',
  'aavjo', 'kevu', 'jordar', 'tamaru', 'maru', 'chhu', 'chho', 'thayu', 'saras', 'bau', 'kai', 'jaish', 'avje', 'nai',
  'tamaro', 'tamari', 'tamara', 'thayo', 'pachi', 'karyo', 'hatu', 'hati', 'karu', 'aavyu', 'karvo', 'haji', 'sathe', 'maro',
  'mari', 'saanje', 'vage', 'paase', 'vaat', 'vaato', 'aakho', 'aakhi', 'jovo', 'rehvanu', 'aapish', 'vishwas', 'etle']);
// Romanised Tamil and Marathi markers (plan 11 personas); words shared with Hindi ("nahi") are left out.
const TANGLISH = new Set(['enna', 'illa', 'illai', 'romba', 'nalla', 'seri', 'machan', 'ponga', 'vaa', 'saapadu', 'paakalam', 'theriyum',
  'theriyala', 'enakku', 'unakku', 'aama', 'irukku', 'panren', 'sollu', 'konjam', 'sema', 'paaru', 'vandhu', 'vanakkam', 'aiyo', 'ayyo', 'kanna', 'pa',
  'panniruken', 'paathirukeengala', 'pidikum', 'dhaan', 'thoongu', 'sonnadhu', 'appa', 'nalla']);
const MARATHI = new Set(['aahe', 'ahe', 'aahes', 'nako', 'jhala', 'jhali', 'mhanje', 'mala', 'tula', 'khup', 'kasa', 'kashi', 'kuthe', 'kevha',
  'aata', 'ghari', 'karto', 'karte', 'mhanun', 'bagh', 'baghu', 'chaan', 'bara', 'hoy', 'aani', 'kay', 'zhala', 'zhali', 'majja',
  'aali', 'gela', 'kela', 'karuya', 'jamnar', 'sangta', 'nantar', 'madhe', 'kadhi', 'udya', 'maza', 'tujha', 'kuthla', 'vatla', 'jhop', 'aai',
  'chaltat', 'chalel', 'jhopa', 'jatoy', 'hasla', 'sagla', 'khup']);

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

/** → { languages, script, codeSwitch, shares } from code alone (coarse; the LLM tagger is preferred). */
export function tagLanguageHeuristic(text) {
  const scripts = SCRIPTS.filter(([, re]) => re.test(text)).map(([s]) => s);
  const hasLatin = LATIN.test(text);
  const tokens = tokensOf(text);
  const hi = hinglishCount(tokens);
  const gu = tokens.filter((t) => GUJLISH.has(t)).length;
  const ta = tokens.filter((t) => TANGLISH.has(t)).length;
  const mr = tokens.filter((t) => MARATHI.has(t)).length;
  const languages = new Set();
  if (scripts.includes('devanagari')) languages.add('hi');
  if (scripts.includes('gujarati')) languages.add('gu');
  if (hi) languages.add('hi_latn');
  if (gu >= 2 || (gu && !hi)) languages.add('gu_latn');
  if (ta >= 2 || (ta && !hi)) languages.add('ta_latn');
  if (mr >= 2 || (mr && !hi)) languages.add('mr_latn');
  const englishTokens = hasLatin ? tokens.filter((t) => LATIN.test(t)).length - hi - gu - ta - mr : 0;
  if (englishTokens > 0 || !languages.size) languages.add('en');
  const script = scripts.length > 1 || (scripts.length && hasLatin) ? 'mixed' : (scripts[0] ?? 'latin');
  // Token shares per language (non-Latin scripts count their own tokens), for a fairer language mix.
  const counts = { en: Math.max(0, englishTokens), hi_latn: hi, gu_latn: gu, ta_latn: ta, mr_latn: mr,
    hi: tokens.filter((t) => /\p{Script=Devanagari}/u.test(t)).length, gu: tokens.filter((t) => /\p{Script=Gujarati}/u.test(t)).length };
  const total = [...languages].reduce((n, l) => n + (counts[l] ?? 0), 0);
  const shares = Object.fromEntries([...languages].map((l) => [l, total ? (counts[l] ?? 0) / total : 1 / languages.size]));
  return { languages: [...languages], script, codeSwitch: languages.size > 1, shares };
}
