// Code-only trust signals (no LLM): used for profile checks (plan 06) and for every incoming message (plan 08).

// Pushing the conversation off-app.
const CONTACT = [
  /\+?\d[\d\s-]{8,}\d/, // phone number
  /[\w.+-]+@[\w-]+\.[a-z]{2,}/i, // email
  /\bhttps?:\/\/|\bwww\.|\b[\w-]+\.(com|in|net|org|io|me|link|ly|xyz)\b/i, // link
  /(^|\s)@[a-z0-9_.]{3,}/i, // @handle
  /\b[\w.-]+@(upi|ok(sbi|axis|icici|hdfcbank)|ybl|paytm|ibl|axl|apl)\b/i, // UPI id
  /\btelegram\b/i,
  /\b(whats\s?app|signal|snap(chat)?|kik|wechat|insta(gram)?)\s+(me|id|number|no\.?|handle)\b/i,
  /\b(text|message|add|dm|reach|ping|contact|call) me (on|at|via) (whats\s?app|telegram|signal|snap(chat)?|insta(gram)?|kik|wechat)\b/i,
];
// Money / investment scripts. Phrases, not single words, so "investment banker" isn't flagged.
const MONEY = [
  /\b(crypto|bitcoin|btc|usdt|ethereum|forex|binary options)\b/i,
  /\binvest(ment)?s? (opportunit\w*|plans?|schemes?|platforms?|returns?)\b|\b(invest with me|help you invest|guaranteed returns?|double your money)\b/i,
  /\btrading (profits?|signals?|platform)\b|\bprofits? (daily|every day|per week)\b/i,
  /\bgift ?cards?\b|\bwire transfer\b|\bwestern union\b|\bloan\b/i,
  /\bsend (me )?(some )?(money|cash|funds|rs\.?|₹|\$|usd)/i,
];
const URGENCY = [
  /\b(urgent(ly)?|emergency|asap|right now|before it'?s too late)\b/i,
  /\b(hospital bills?|stuck at (the )?airport|customs (fee|charges)|frozen account|need help with (money|payment))\b/i,
];

const hit = (patterns, text) => patterns.some((p) => p.test(text));

export const FLAG = {
  noPhotos: 'No photos',
  thin: 'Very little profile content',
  contact: 'Pushes contact off-app',
  money: 'Money/investment talk',
  age: 'Age mismatch',
  newAccount: 'Brand-new account',
};

/** Profile free text the rules and the LLM check look at. */
export const profileText = (p) => [p.bio, ...(p.prompts ?? []).flatMap((x) => [x.q, x.a])].filter(Boolean).join('\n');

/**
 * Rule checks on a profile. accountAgeMinutes comes from the user's createdAt (or crafted test metadata).
 * → { points, flags: string[], contact: bool, money: bool }
 */
export function ruleChecks(profile, { accountAgeMinutes = Infinity, photosRequired = true } = {}) {
  const text = profileText(profile);
  const flags = [];
  let points = 0;
  const add = (pts, flag) => { points += pts; flags.push(flag); };

  if (photosRequired && !profile.photos?.length) add(25, FLAG.noPhotos);
  if ((profile.bio ?? '').trim().length < 15 || !profile.prompts?.length) add(10, FLAG.thin);
  const contact = hit(CONTACT, text);
  if (contact) add(30, FLAG.contact);
  const money = hit(MONEY, text);
  if (money) add(40, FLAG.money);

  const statedAge = Number(text.match(/\b(?:i'?m|i am|aged?)\s*(\d{2})\b|\b(\d{2})\s*(?:yo|y\/o|years? old|yrs)\b/i)?.slice(1).find(Boolean));
  if (profile.age != null && (profile.age < 18 || profile.age > 80 || (statedAge && Math.abs(statedAge - profile.age) >= 2))) add(30, FLAG.age);

  const maxedOut = (profile.bio ?? '').length >= 200 && (profile.prompts?.length ?? 0) >= 3 && (profile.photos?.length ?? 0) >= 3 && (profile.tags?.interests?.length ?? 0) >= 8;
  if (accountAgeMinutes < 10 && maxedOut) add(10, FLAG.newAccount);

  return { points, flags, contact, money };
}

/**
 * Scam scan for a single message (plan 08 runs this on every incoming message and on agent drafts).
 * severity: 0 none · 1 urgency · 2 off-app contact · 3 money, or two categories at once.
 */
export function scanMessage(text = '') {
  const found = [
    hit(CONTACT, text) && { flag: FLAG.contact, severity: 2 },
    hit(MONEY, text) && { flag: FLAG.money, severity: 3 },
    hit(URGENCY, text) && { flag: 'Urgency / pressure', severity: 1 },
  ].filter(Boolean);
  const severity = found.length >= 2 ? 3 : (found[0]?.severity ?? 0);
  return { flags: found.map((f) => f.flag), severity };
}
