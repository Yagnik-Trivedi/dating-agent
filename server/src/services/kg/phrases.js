// UX P0-4: onboarding answers read as short natural phrases the agent can say ("doesn't smoke", "is busy with a big
// release"), never "smoking: never". A table in code, no model call. A phrase is subject-less so it works either way:
// the agent says "I don't smoke", the user reads "doesn't smoke" in This is you.

/** Section-B answers: attribute → option value → phrase. */
export const VALUE_PHRASES = {
  kids: { yes: 'wants kids someday', no: 'doesn’t want kids', open: 'is open to kids someday', have_already: 'already has kids' },
  religion: { central: 'has religion at the centre of their life', somewhat: 'is somewhat religious', not_really: 'isn’t very religious' },
  location: { this_city: 'sees themselves staying in this city', another_indian_city: 'may move to another Indian city in a few years', abroad: 'hopes to live abroad in a few years', flexible: 'is flexible about where to live' },
  smoking: { never: 'doesn’t smoke', socially: 'smokes socially', regularly: 'smokes regularly' },
  drinking: { never: 'doesn’t drink', socially: 'drinks socially', regularly: 'drinks regularly' },
  family: { closely: 'involves family closely in big decisions', somewhat: 'involves family somewhat in big decisions', not_much: 'makes big decisions mostly on their own' },
  career: { career_first: 'is career-first right now', balanced: 'keeps work and life in balance', life_first: 'puts life before work right now' },
  looking_for: { long_term: 'is looking for something long-term', open_to_long_term: 'is open to something long-term', short_term: 'is looking for something short-term', figuring_it_out: 'is still figuring out what they’re looking for' },
  diet: { veg: 'is vegetarian', non_veg: 'eats non-veg', vegan: 'is vegan', jain: 'eats Jain food', eggetarian: 'is eggetarian', no_preference: 'eats pretty much everything' },
  conflict: { talk_it_out_immediately: 'likes to talk things out right away', need_space_first: 'needs a little space before talking things out', avoid_it: 'tends to avoid conflict' },
  alone_time: { lots: 'needs lots of alone time after a busy week', some: 'needs some alone time after a busy week', little: 'needs little alone time after a busy week' },
};

/** Topics the agent never raises unprompted: answerable only when asked (v6 §3.4). */
export const IF_ASKED_ATTRIBUTES = new Set(['kids', 'drinking', 'smoking', 'religion']);

const lower1 = (t) => (/^(I|[A-Z]{2})/.test(t) ? t : t.charAt(0).toLowerCase() + t.slice(1)); // keeps "I" and acronyms // "A big release" → "a big release"
const clean = (t) => lower1(String(t).trim().replace(/[.!]+$/, ''));

/** "Your world right now" (module W): question id → phrase for a free-text answer. */
const WORLD_LINES = {
  W1: (a) => `is busy with ${a}`,
  W2: (a) => `is looking forward to ${a}`,
  W2_1: (a) => `is looking forward to it ${a}`,
  W3: (a) => `last did ${a} just for fun`,
  W4: (a) => `is a little obsessed with ${a} lately`,
  W5: (a) => `is mildly annoyed by ${a} right now`,
  W6: (a) => `loved eating ${a} this week`,
  W6_1: (a) => `had it at ${a}`,
  W8: (a) => `has weekdays that go like this: ${a}`,
  W8_1: (a) => `likes ${a} best on a normal weekday`,
  W9: (a) => `usually spends weekends on ${a.replace(/^(on weekends,?\s*)/i, '')}`,
  W10: (a) => `has ${a} on repeat right now`,
  W11: (a) => `last took a photo of ${a}`,
  W12: (a) => `often ends up at ${a}`,
  W12_1: (a) => `goes there for ${a}`,
};
const WORLD_PICKS = {
  W3_1: { yes: 'would do it again', maybe: 'might do it again', never: 'wouldn’t do it again' },
  W7: { morning_person: 'is a morning person', night_owl: 'is a night owl', depends_on_the_day: 'is a morning person or a night owl depending on the day' },
  W1_1: { good_busy: 'is the good kind of busy', bad_busy: 'is the stressful kind of busy', bit_of_both: 'is a mix of good busy and stressful busy' },
};

/** A section-B answer's phrase, or null (unknown value: the caller keeps its old label). */
export const valuePhrase = (attr, value) => VALUE_PHRASES[attr]?.[value] ?? null;
/** A module question's phrase for a text answer or a picked option, or null when it has none (other modules). */
export const worldPhrase = (qid, { text, option } = {}) => {
  if (option) return WORLD_PICKS[qid]?.[option] ?? null;
  const f = WORLD_LINES[qid];
  return f && String(text ?? '').trim() ? f(clean(text)) : null;
};
/** Basics. */
// An acronym takes the article of its first letter's name ("an MBA student", "a UX researcher").
const vowelSound = (job) => (/^[A-Z]{2}/.test(job) ? /^[AEFHILMNORSX]/.test(job) : /^[aeiou]/i.test(job));
export const jobPhrase = (job) => `works as ${/^(a|an|the)\s/i.test(job) ?lower1(job) : `${vowelSound(job) ? 'an' : 'a'} ${lower1(job)}`}`;

// Profile prompts → a claimable fact in the user's own words. The kind follows the prompt.
const PROMPT_KIND = [
  [/geek out|won’t shut up|won't shut up|obsessed|simple pleasures|comfort food|on repeat|love language|discovered/i, 'likes'],
  [/sundays|typical friday|weekends|go-to|morning|evening is/i, 'lifestyle'],
];
export const promptPredicate = (q) => PROMPT_KIND.find(([re]) => re.test(q))?.[1] ?? 'opinion';
/** "My Sundays look like" + "chai and a walk" → "My Sundays look like… chai and a walk" (their own words) */
export const promptPhrase = (q, a) => `${String(q).trim().replace(/[:.…]+$/, '')}… ${String(a).trim()}`;

/** What a self fact says: its own phrase for onboarding/module answers; else the shared concept's label unless edited. */
export const factText = (f, conceptLabel) =>
  (f.userEdited || !conceptLabel || ['questionnaire_choice', 'questionnaire_module'].includes(f.source) ? f.object : conceptLabel);
