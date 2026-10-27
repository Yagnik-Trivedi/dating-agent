// Tier mid, reasoning off, temperature 0. perceive + observe in ONE call (plan 08 §2.1): read the other person's
// latest message(s) for my agent. Every note and agenda hit must quote their words exactly.
// Output: { concepts, claims, isQuestion, aboutMe, lowEffort, humor, warmth, acknowledgesDifference, answeredMyQuestion,
//           dealbreakerHint, language, mood, energy, doing, notes, agendaHits }

export const NOTE_PREDICATES = ['likes', 'dislikes', 'values', 'goal', 'lifestyle', 'background', 'opinion', 'humor'];
// Plan 31 A4: the mood, energy and what they're doing, so the reply can match them.
export const MOODS = ['chill', 'playful', 'excited', 'tired', 'busy', 'down', 'serious', 'flirty', 'curious', 'bored'];
export const ENERGY = ['low', 'medium', 'high'];
export const DOING = ['chatting', 'asking', 'telling', 'venting', 'sharing_news', 'winding_down'];
// Plan 34: what in their turn needs a response, and what deserves a reaction.
export const ITEM_KINDS = ['question', 'news', 'story', 'feeling', 'compliment', 'joke', 'request', 'statement'];
export const REACT_KINDS = ['opinion', 'joke', 'news', 'compliment', 'confession', 'tease', 'plan', 'complaint', 'love', 'hate'];

export function build({ myName, theirName, latest, context, myLast, agenda, attributes, natural = false }) {
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
        `- "mood": their mood, one of ${MOODS.join(', ')}. "energy": ${ENERGY.join(', ')} (one-word replies are low).`,
        `- "doing": what they're doing, one of ${DOING.join(', ')}: telling = in the middle of telling something; venting = a bad day or a complaint; sharing_news = good news; winding_down = tired, short, closing.`,
        `- "notes": facts about ${theirName} learned from these messages. "quote" must be copied EXACTLY from their message.`,
        `  predicate one of ${NOTE_PREDICATES.join(', ')}; "object" a short neutral label; "strength" 0–1 how much they like/mean it.`,
        `- "agendaHits": topics from ${myName}'s list below that their message answers, each with an exact quote. Only a clear position counts ("long-term", "I don't smoke", "want kids someday"); a vague or polite non-answer ("someone kind and real") is not a hit.`,
        ...(natural ? [
          `- "items": EVERYTHING in their whole turn (all their bubbles) that needs a response, each with an id i1, i2…: kind one of ${ITEM_KINDS.join(', ')}; "text" short.`,
          `- "reactTo": what in it deserves a reaction (kind one of ${REACT_KINDS.join(', ')}). "topicSeeds": up to 3 things they mentioned that two people could chat about.`,
          '- "theyLead": true if they are carrying the conversation right now (telling, sharing, bringing their own topic).',
        ] : []),
        'Never infer religion, caste, ethnicity, health or sexuality. Empty lists are fine.',
        '',
        'Output JSON: {"concepts": [{"text": "...", "type": "activity", "polarity": 1}], "claims": [{"text": "...", "conceptText": "...",',
        '"attribute": null, "value": null, "polarity": 1}], "isQuestion": false, "aboutMe": false, "lowEffort": false, "humor": false,',
        '"warmth": false, "acknowledgesDifference": false, "answeredMyQuestion": null, "dealbreakerHint": null,',
        '"language": {"languages": ["en"], "script": "latin", "codeSwitch": false}, "mood": "chill", "energy": "medium", "doing": "chatting",',
        '"notes": [{"predicate": "likes", "object": "...", "attribute": null, "value": null, "polarity": 1, "strength": 0.6, "quote": "..."}],',
        natural ? '"agendaHits": [{"id": "a1", "quote": "..."}], "items": [{"id": "i1", "kind": "question", "text": "..."}], "reactTo": [{"text": "...", "kind": "opinion"}], "topicSeeds": ["..."], "theyLead": false}' : '"agendaHits": [{"id": "a1", "quote": "..."}]}',
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
