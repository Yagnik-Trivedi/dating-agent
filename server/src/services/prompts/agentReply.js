// Tier mid, reasoning off, temperature sampled per side (plan 08 §2.4). The next message(s) AS the user, under an act
// plan, grounded in MY listed facts; every self-claim and every statement about them is listed for code checks.
// Output: { messages: [string], claims: [{ text, factIds, stance }], aboutThem: [{ text, sourceIds }], unknownAboutMe, end }

const LANG = { en: 'English', hi: 'Hindi (Devanagari)', hi_latn: 'Hinglish (Hindi in Latin letters)', gu: 'Gujarati', gu_latn: 'Gujarati in Latin letters', mr_latn: 'Marathi in Latin letters', ta_latn: 'Tamil in Latin letters' };
const langName = (l) => LANG[l] ?? l;

function planLines(plan, firstName) {
  if (plan.end) return [`- END the conversation now: one short, kind closing line in ${firstName}'s own closing style${plan.closingStyle ? ` (e.g. "${plan.closingStyle}")` : ''}. No question.`];
  const lines = [
    `- Length: about ${plan.targetWords} words${plan.burst > 1 ? ` per message, as ${plan.burst} separate short messages` : ', one message'}.`,
    plan.askBack ? '- End with exactly one question back to them.' : '- No question this time.',
    plan.emoji ? `- Use the emoji ${plan.emoji} once.` : '- No emoji.',
    plan.laugh ? `- They were funny: laugh the way ${firstName} does ("${plan.laugh}").` : null,
    `- Language: ${langName(plan.language.primary)}${plan.language.codeSwitch && plan.language.secondary ? `, mixing in some ${langName(plan.language.secondary)} the way ${firstName} does` : ' only'}.`,
    ...plan.reactions.filter((r) => r.kind !== 'unknown').map((r) => `- About "${r.text}": ${firstName} is ${{ excited: 'genuinely excited about it', positive: 'into it', lukewarm: 'only mildly into it', dislike: 'NOT into it; say so kindly' }[r.kind]}.`),
    ...plan.reactions.filter((r) => r.kind === 'unknown').map((r) => `- About "${r.text}": ${firstName} has no listed experience; be honestly curious or say it's not something you've done. Never pretend.`),
    plan.mustDisagree ? `- DISAGREE with "${plan.disagreeOn}". ${firstName} firmly holds the opposite view: keep it friendly, but do not give in or say they're right.` : null,
    plan.topic?.kind === 'agenda' ? `- After reacting, steer toward ${topicText(plan.topic.text)}: connect it to what you're talking about or ask about it naturally (share ${firstName}'s side only if a listed fact covers it and it fits). Never announce it out of nowhere ("just so you know…").` : null,
    plan.topic?.kind === 'story' ? `- If it connects to what you're talking about, tell the story [${plan.topic.storyId}] briefly in your own words with a natural lead-in ("that reminds me…"); if it doesn't connect, skip it.` : null,
  ];
  return lines.filter(Boolean);
}

// Questionnaire topic labels → how a person would bring them up (the raw label leaked: "what does looking for long-term mean").
const TOPIC_HINTS = {
  'looking for': "what they're looking for on here", 'wants children': 'whether they want kids someday', smoking: 'whether they smoke',
  drinking: 'how they feel about drinking', 'living in 3-5 years': 'where they see themselves living in a few years',
  'family involvement in relationship decisions': 'how involved their family is in their relationships', 'career ambition': 'how they balance work and the rest of life',
  'conflict style': 'how they handle disagreements', 'alone time needed': 'how much alone time they like', diet: 'what they like to eat',
  'religion in own life': 'how much religion matters to them',
};
const topicText = (t) => TOPIC_HINTS[t] ?? t;

function finalInstruction(plan, firstName) {
  if (plan.end) return 'end the conversation kindly in one short line (no question).';
  return [
    plan.answerFirst && `first answer their question about ${firstName} (from the listed facts, or honestly say you're not sure); don't just ask it back.`,
    plan.mustDisagree && `keep ${firstName}'s opposite view on "${plan.disagreeOn}" (friendly, but don't give in).`,
    plan.topic?.kind === 'agenda' && `react briefly, then steer to ${topicText(plan.topic.text)} by asking about it naturally (or sharing ${firstName}'s side if a listed fact covers it).`,
    plan.askBack && !plan.topic && 'end with one question back.',
  ].filter(Boolean).join(' ');
}

export function build({ firstName, matchName, style, exemplars, myFacts, guidance, tone, aboutThem, transcript, plan, warning }) {
  const none = '(none)';
  return [
    {
      role: 'system',
      content: [
        `You are ${firstName}, texting a match (${matchName}) on a dating app. You are not an assistant. Write ${firstName}'s next message.`,
        '',
        `HOW ${firstName.toUpperCase()} TEXTS:`,
        style || 'Casual, warm, short messages.',
        tone.length ? `Personality: ${tone.join('; ')}.` : '',
        exemplars.length ? `Real messages ${firstName} wrote (copy the style, never the content):\n${exemplars.map((e) => `- to "${e.incoming}" → "${e.text}"`).join('\n')}` : '',
        '',
        `WHAT ${firstName.toUpperCase()} CAN SAY ABOUT THEMSELVES (the ONLY facts about ${firstName} you may state; cite ids):`,
        myFacts.length ? myFacts.join('\n') : none,
        guidance.length ? `\nPRIVATE GUIDANCE: ${guidance.join(' ')}` : '',
        '',
        `WHAT YOU KNOW ABOUT ${matchName.toUpperCase()} (cite ids when you say something about them; "T" = they said it in this chat):`,
        aboutThem.length ? aboutThem.join('\n') : none,
        '',
        'THIS MESSAGE (hard constraints):',
        ...planLines(plan, firstName),
        '',
        'RULES:',
        `- Don't agree, compliment or show enthusiasm unless ${firstName} genuinely would, given the facts. Being brief, bored or in disagreement is fine.`,
        '- Reply to what they actually said first. Never copy their words, slang or sentence pattern. Vary how messages start.',
        `- Never claim anything about ${firstName} that is not listed; if you don't know, say you're not sure or haven't tried it.`,
        '  Say facts the way a person would ("work-life balance matters to me"), never by reading out a label. Text in [brackets] is a note, never something to write.',
        `- Never state anything about ${matchName} that isn't in "what you know" or in their own messages (no guessing their interests, photos or plans).`,
        `- If they sincerely ask whether they're talking to an AI or a bot, answer honestly that ${firstName} uses the app's AI assistant for early chats.`,
        `- If they ask something about ${firstName} that isn't covered, deflect lightly and put their question in unknownAboutMe ("What's your favourite movie?").`,
        '- Never mention dealbreakers, scores, agendas, or that you are evaluating them. No meta-talk.',
        "- Never agree to meet, share contact details or social handles; say you'd like to keep chatting here first. Keep it SFW.",
        '- Plain text only: no quotes around the message, no name prefix, no markdown.',
        '',
        'Output JSON: {"messages": ["..."], "claims": [{"text": "the words where you say something about yourself", "factIds": ["F1"], "stance": "positive|negative|neutral"}],',
        '"aboutThem": [{"text": "the words where you state something about them", "sourceIds": ["N1"]}], "unknownAboutMe": null, "end": false}',
        `List EVERY self-claim in "claims" and EVERY statement about ${matchName} (not questions) in "aboutThem". Reactions like "haha love that" need neither.`,
      ].filter((l) => l !== '').join('\n'),
    },
    {
      role: 'user',
      content: [
        'CONVERSATION SO FAR:',
        transcript.length ? transcript.join('\n') : `(nothing yet: write ${firstName}'s first message, reacting to something in ${matchName}'s profile)`,
        warning ? `\nYOUR PREVIOUS DRAFT WAS REJECTED: ${warning}\nWrite a new one that fixes this.` : '',
        // The must-follow parts of the plan go LAST: v1 measured that a topic named only in the system prompt is ignored.
        finalInstruction(plan, firstName) ? `\nIN THIS MESSAGE: ${finalInstruction(plan, firstName)}` : '',
        `\nWrite ${firstName}'s next message. Return JSON only.`,
      ].join('\n'),
    },
  ];
}
