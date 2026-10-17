// Tier mid, reasoning off, temperature ~0.8 (plan 11A, scripts/seed/restyle-personas.js only; never at runtime).
// Rewrites a seed persona's VOICE to a style spec: the 15 E replies, optionally its stories, and place names when the
// persona moves city. Meaning, facts and opinions stay exactly the same.
// Output: { replies: { e1: "...", ... }, stories: { sunday: "...", ... }, profile: { bio, prompts: [{ q, a }] } | null }

const LANG = { en: 'English', hi_latn: 'Hindi in Latin letters (Hinglish)', hi: 'Hindi in Devanagari script', gu_latn: 'Gujarati in Latin letters', ta_latn: 'Tamil in Latin letters', mr_latn: 'Marathi in Latin letters' };

// One natural line per language: a style anchor (never copied), because "~30% Gujarati" alone came back as plain English.
const EXAMPLE = {
  hi_latn: '"arre no worries, kal ka din bhi aisa hi tha 😅 hope you got some rest"',
  hi: '"कोई बात नहीं, hope your day got better 🙂"',
  gu_latn: '"majama! aaje bau busy hatu but the garba practice was jordar"',
  ta_latn: '"romba nice da, enakku filter coffee is non-negotiable"',
  mr_latn: '"ho na, khup majja aali kal, trek was amazing"',
};

export function build({ name, spec, replies, stories, profile, feedback = null }) {
  const mix = Object.entries(spec.mix ?? { en: 1 }).map(([l, v]) => `${LANG[l] ?? l} ~${Math.round(v * 100)}%`).join(', ');
  const others = Object.keys(spec.mix ?? {}).filter((l) => l !== 'en');
  const style = [
    `Language mix by words: ${mix}.${spec.codeSwitch ? ' Switch languages inside sentences, the way bilingual friends text.' : ''}`,
    ...others.map((l) => `At least 10 of the 15 replies contain ${LANG[l]} words (real words a speaker would use, not just one greeting). The tone of: ${EXAMPLE[l] ?? ''} (style only; never copy it).`),
    spec.script === 'devanagari' ? 'Hindi parts are written in Devanagari script (देवनागरी); English stays in Latin letters.' : null,
    { terse: 'Very short replies: every reply 1–5 words, no full stop at the end, no long sentences at all.', medium: 'Short replies: one or two sentences.', long: 'Long replies: 2–4 full sentences, 20+ words.' }[spec.terseness ?? 'medium'],
    'Never repeat or paraphrase the incoming message back; answer it.',
    spec.capitalisation === 'lowercase' ? 'All lowercase.' : spec.capitalisation === 'sentence' ? 'Sentence case with full punctuation, like a careful writer.' : null,
    `Emoji: about ${spec.emojiRate ?? 0.3} per message${spec.emojiRate >= 0.8 ? ' (often 1–2 per message)' : ''}${spec.emojiRate === 0 ? ' (never any)' : ''}.`,
    spec.laughForm ? `Laughs as "${spec.laughForm}".` : null,
    spec.petPhrases?.length ? `Pet phrases, used now and then (not in every message): ${spec.petPhrases.map((p) => `"${p}"`).join(', ')}.` : null,
  ].filter(Boolean);
  return [
    {
      role: 'system',
      content: [
        `You rewrite how ${name}, a fictional dating-app seed persona, texts. Change ONLY the voice: language mix, script, length, emoji, laugh, punctuation.`,
        'Keep every fact, preference, opinion, plan and story detail exactly as it is. Never add new facts, places, people or brands.',
        'Code-switching must read like a real bilingual person in an Indian city texting a match: natural, not a caricature, no stereotypes, no filler words dropped in to hit a quota.',
        'Keep it SFW. No real people.',
        spec.keepVoice ? 'This persona keeps their voice: only move place names; leave the wording and language as they are.' : null,
        spec.relocate ? `${name} now lives in ${spec.relocate}. Replace place names that tie them to the old city with comparable ones in ${spec.relocate} (same kind of place, same meaning). Everything else stays.` : null,
        ...(spec.keepVoice ? [] : ['', 'STYLE SPEC:', ...style.map((s) => `- ${s}`)]),
        '',
        'Output JSON: {"replies": {"e1": "..."}, "stories": {"<id>": "..."}, "profile": {"bio": "...", "prompts": [{"q": "...", "a": "..."}]} or null}',
        '"replies" must have every id you are given. "stories" only the ids you are given (empty object if none). "profile" only when told to relocate, else null.',
      ].filter((l) => l !== null).join('\n'),
    },
    {
      role: 'user',
      content: [
        // v3: shown as the MEANING to express, not a reply to edit (v1/v2 returned the English replies verbatim).
        replies.length ? `WRITE ${name.toUpperCase()}'S REPLIES FROM SCRATCH in the style spec above. For each incoming message, the meaning to express (English notes, do not copy the wording):` : 'TEXT REPLIES: none this time (return "replies": {}).',
        ...replies.map((r) => `${r.id} | they wrote: "${r.incoming}" | meaning: ${r.text}`),
        stories.length ? `\nSTORIES ${spec.keepVoice ? 'to keep word for word, except place names that move' : 'to rewrite in the same voice and language mix (keep every detail)'}:\n${stories.map((s) => `${s.id} | ${s.text}`).join('\n')}` : '',
        profile ? `\nPROFILE (relocate place names only; keep the language as is):\nbio: ${profile.bio}\n${profile.prompts.map((p) => `prompt "${p.q}": ${p.a}`).join('\n')}` : '',
        feedback ? `\nYOUR PREVIOUS REWRITE MISSED THE SPEC: ${feedback} Fix that this time.` : '',
        '\nReturn JSON only.',
      ].join('\n'),
    },
  ];
}
