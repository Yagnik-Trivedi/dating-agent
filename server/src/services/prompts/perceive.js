// Tier mid, reasoning off, temperature 0. perceive + observe in ONE call (plan 08 §2.1): read the other person's
// latest message(s) for my agent. Every note and agenda hit must quote their words exactly.
// Output: { concepts, claims, isQuestion, aboutMe, lowEffort, humor, warmth, acknowledgesDifference, answeredMyQuestion,
//           dealbreakerHint, language, mood, notes, agendaHits }

export const NOTE_PREDICATES = ['likes', 'dislikes', 'values', 'goal', 'lifestyle', 'background', 'opinion', 'humor'];

export function build({ myName, theirName, latest, context, myLast, agenda, attributes }) {
  return [
    {
      role: 'system',
      content: [
        `You read a dating-app chat for ${myName}'s assistant. Analyse ONLY ${theirName}'s latest message(s).`,
        '',
        '- "concepts": things they mention liking or disliking (activities, food, places, media, values), polarity 1 or -1.',
        '- "claims": statements about themselves or opinions. If a claim answers one of these attributes, set "attribute" and',
        `  "value" to one of the allowed values: ${attributes}.`,
        '- "isQuestion": they asked something. "aboutMe": the question is about the person they are talking to.',
        '- "lowEffort": a minimal reply ("ok", "lol", one word) that adds nothing. "humor": they joke. "warmth": friendly/affectionate.',
        '- "acknowledgesDifference": they accept a difference of opinion without either side giving in ("agree to disagree").',
        `- "answeredMyQuestion": ${myName}'s last message asked a question and they answered it (true), ignored it (false), or there was no question (null).`,
        `- "dealbreakerHint": the attribute their message reveals about THEMSELVES (from the list), if any, else null. A question they ask ("do you smoke?", "do you want kids someday?") reveals nothing about them: null, and no claim.`,
        '- "language": languages used (ISO 639-1; add "_latn" for romanised Hindi/Gujarati/…: "hi_latn"), script, codeSwitch.',
        '- "mood": one of greeting, curious, opinion, excited, disagree, plan, apologetic, tease, closing, long_reply, casual.',
        `- "notes": facts about ${theirName} learned from these messages. "quote" must be copied EXACTLY from their message.`,
        `  predicate one of ${NOTE_PREDICATES.join(', ')}; "object" a short neutral label; "strength" 0–1 how much they like/mean it.`,
        `- "agendaHits": topics from ${myName}'s list below that their message answers, each with an exact quote.`,
        'Never infer religion, caste, ethnicity, health or sexuality. Empty lists are fine.',
        '',
        'Output JSON: {"concepts": [{"text": "...", "type": "activity", "polarity": 1}], "claims": [{"text": "...", "conceptText": "...",',
        '"attribute": null, "value": null, "polarity": 1}], "isQuestion": false, "aboutMe": false, "lowEffort": false, "humor": false,',
        '"warmth": false, "acknowledgesDifference": false, "answeredMyQuestion": null, "dealbreakerHint": null,',
        '"language": {"languages": ["en"], "script": "latin", "codeSwitch": false}, "mood": "casual",',
        '"notes": [{"predicate": "likes", "object": "...", "attribute": null, "value": null, "polarity": 1, "strength": 0.6, "quote": "..."}],',
        '"agendaHits": [{"id": "a1", "quote": "..."}]}',
      ].join('\n'),
    },
    {
      role: 'user',
      content: [
        context.length ? `Earlier in the chat:\n${context.join('\n')}` : '',
        myLast ? `${myName}'s last message: ${myLast}` : '',
        `${theirName}'s latest message(s):\n${latest}`,
        `${myName}'s topics to learn about: ${agenda.length ? agenda.map((a) => `[${a.id}] ${a.topic}`).join(', ') : 'none'}`,
      ].filter(Boolean).join('\n\n'),
    },
  ];
}
