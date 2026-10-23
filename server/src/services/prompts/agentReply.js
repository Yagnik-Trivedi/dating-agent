// Tier mid, reasoning off, temperature sampled per side (plan 08 §2.4). The next message(s) AS the user, under an act
// plan, grounded in MY listed facts; every self-claim and every statement about them is listed for code checks.
// Output: { messages: [string], claims: [{ text, factIds, stance }], aboutThem: [{ text, sourceIds }], unknownAboutMe, end }

const LANG = { en: 'English', hi: 'Hindi (Devanagari)', hi_latn: 'Hinglish (Hindi in Latin letters)', gu: 'Gujarati', gu_latn: 'Gujarati in Latin letters', mr_latn: 'Marathi in Latin letters', ta_latn: 'Tamil in Latin letters' };
const langName = (l) => LANG[l] ?? l;

function planLines(plan, firstName) {
  if (plan.plain) return ['- Reply naturally, the way ' + firstName + ' would.']; // RULES=off ablation: no act plan
  // Plan 33: a session ends like a real evening of texting, not like a goodbye forever.
  if (plan.end === 'session') return [`- Wrap up FOR NOW, the way people stop texting for the day: one short, warm line in ${firstName}'s style that you have to go (sleep, work, food, an errand) and will talk later${plan.closingStyle ? ` (e.g. "${plan.closingStyle}")` : ''}. No question except "talk tomorrow?"-style. Never sound like a final goodbye.`];
  if (plan.end === 'session_ack') return [`- They're stopping for now. Reply with a short, warm "talk later" in ${firstName}'s style (like "haha ok night! talk tomorrow"). No question, no new topic.`];
  if (plan.end) return [`- END the conversation now: one short, kind closing line in ${firstName}'s own closing style${plan.closingStyle ? ` (e.g. "${plan.closingStyle}")` : ''}. No question.`];
  if (plan.mode === 'human') return humanLines(plan, firstName);
  const lines = [
    `- Length: about ${plan.targetWords} words${plan.burst > 1 ? ` per message, as ${plan.burst} separate short messages` : ', one message'}.`,
    plan.opening ? null : moveLine(plan, firstName),
    plan.askBack ? '- End with exactly one question back to them.' : '- No question this time.',
    plan.emoji ? `- Use the emoji ${plan.emoji} once.` : '- No emoji.',
    plan.laugh ? `- They were funny: laugh the way ${firstName} does ("${plan.laugh}").` : null,
    `- Language: ${langName(plan.language.primary)}${plan.language.codeSwitch && plan.language.secondary ? `, mixing in some ${langName(plan.language.secondary)} the way ${firstName} does` : ' only'}.`,
    ...plan.reactions.filter((r) => r.kind !== 'unknown').map((r) => `- About "${r.text}": ${firstName} is ${{ excited: 'genuinely excited about it', positive: 'into it', lukewarm: 'only mildly into it', dislike: 'NOT into it; say so kindly' }[r.kind]}.`),
    ...plan.reactions.filter((r) => r.kind === 'unknown').map((r) => `- About "${r.text}": ${firstName} has no listed experience; be honestly curious or say it's not something you've done. Never pretend.`),
    plan.unknownTopic ? `- They asked about ${plan.unknownTopic}: nothing about ${firstName} and ${plan.unknownTopic} is listed. Say honestly you're not sure or haven't really thought about it. Never invent a preference, team, habit or opinion.` : null,
    plan.mustDisagree ? `- DISAGREE with "${plan.disagreeOn}". ${firstName} firmly holds the opposite view: keep it friendly, but do not give in or say they're right.` : null,
    plan.topic?.kind === 'agenda' ? topicLine(plan.topic, firstName, plan.askBack) : null,
    plan.topic?.kind === 'story' ? `- If it connects to what you're talking about, tell the story [${plan.topic.storyId}] briefly in your own words with a natural lead-in ("that reminds me…"); if it doesn't connect, skip it.` : null,
  ];
  return lines.filter(Boolean);
}

// Plan 30 SN: the shape of this message. Not every message is "reaction + question".
function moveLine(plan, firstName) {
  return {
    answer: `- Shape: answer their question first, properly (from the listed facts, or honestly say you're not sure).${plan.askBack ? ' Then bounce it back or ask something that follows from it.' : ''}`,
    follow_up: '- Shape: react to what they said, then ONE curious follow-up about a detail they just mentioned. Go deeper on their thread; don\'t change the subject.',
    share: `- Shape: react, then share something of ${firstName}'s own that connects to what they said (only from the listed facts), so they have something to reply to. If no listed fact connects, just react warmly.`,
    react: '- Shape: a short, natural reaction to what they said (laugh, tease or relate if it fits). That is the whole message.',
    callback: callbackLine(plan),
    topic: null,
    end: null,
  }[plan.move] ?? null;
}

// An agenda topic is a suggestion that came from the chat itself (a bridge) or a natural pause (a lull), never an order.
function topicLine(topic, firstName, askBack) {
  const how = askBack ? `share ${firstName}'s side (only if a listed fact covers it) or ask about it the way a curious person would`
    : `share ${firstName}'s side (only if a listed fact covers it), without a question`;
  return topic.how === 'lull'
    ? `- The chat has slowed down. A natural new direction: ${topicText(topic.text)}. Link it to something already said ("speaking of…", "random but…"): ${how}. If it would sound abrupt, talk about something else from the listed facts instead.`
    : `- What they said connects to ${topicText(topic.text)}. If it flows, ease into it as part of the same thread: ${how}. If it doesn't fit, skip it and just follow their thread.`;
}

// Questionnaire topic labels → how a person would bring them up (the raw label leaked: "what does looking for long-term mean").
const TOPIC_HINTS = {
  'looking for': "what they're looking for on here", 'wants children': 'whether they want kids someday', smoking: 'whether they smoke',
  drinking: 'how they feel about drinking', 'living in 3-5 years': 'where they see themselves living in a few years',
  'family involvement in relationship decisions': 'how involved their family is in their relationships', 'career ambition': 'how they balance work and the rest of life',
  'conflict style': 'how they handle disagreements', 'alone time needed': 'how much alone time they like', diet: 'what they like to eat',
  'religion in own life': 'how much religion matters to them',
};
export const topicText = (t) => TOPIC_HINTS[t] ?? t;

// --- Plan 31 (CONVO_MODE=human): a simple, casual chat that matches their mood. No topics to tick off.
// The one matching question, asked plainly (no setup, no story, no hint first).
const ASK_ONCE = {
  'living in 3-5 years': 'where do you see yourself living in a few years?', 'family involvement in relationship decisions': 'how involved is your family in stuff like this?',
  'career ambition': 'how do you balance work with everything else?', 'conflict style': 'how are you when you disagree with someone, talk it out or need space?',
  'alone_time needed': 'how much alone time do you need?', 'alone time needed': 'how much alone time do you need?', smoking: 'do you smoke?', drinking: 'do you drink?',
  diet: 'what do you usually eat, veg or non-veg?', 'religion in own life': 'how much does religion matter to you?',
};
const askOnceText = (t) => ASK_ONCE[t] ?? `${topicText(t)}?`;
// Plan 31 A5: how to answer each mood.
const MOOD_MATCH = {
  chill: 'keep it short and easy', playful: "play along, tease a little if that's how {name} texts", excited: 'be happy for them and ask one thing about it',
  tired: 'very short and warm, no new topics; fine to wrap up', busy: 'very short and warm, no new topics; fine to wrap up',
  down: 'stay on it and be kind: no jokes, no change of subject', serious: 'answer properly, no jokes',
  flirty: "light and warm, only as far as {name}'s own style goes", curious: 'answer what they want to know, simply',
  bored: "don't push questions: one easy thing, or close nicely",
};
const humanMoveLine = (plan, firstName) => ({
  reply: `- Move: reply to their question simply (from the listed facts, or, if nothing listed covers it, say in your own words that you don't know; don't reuse a phrase you already used).${plan.askBack ? ' You may ask it back.' : ''}`,
  react: '- Move: a short, natural reaction to what they said ("haha no way", "ugh that\'s the worst", "oh nice"). That can be the whole message.',
  ask_theirs: '- Move: react, then one short question about what they just said ("wait what happened?"). Not a new topic.',
  share: `- Move: share a little of ${firstName}'s own that connects to what they said ("same, I just got home too"); from the listed facts only when it's about ${firstName}. No question.`,
  stay: "- Move: they're telling you something or having a rough time: stay with them. React or ask about THEIR thing. No new topic, no story of yours, no jokes if they're down.",
  callback: callbackLine(plan),
  close: null,
}[plan.move] ?? null);

function humanLines(plan, firstName) {
  const r = plan.read ?? {};
  return [
    `- Length: about ${plan.targetWords} words${plan.burst > 1 ? ` per message, as ${plan.burst} separate short messages` : ', one message'}. About as long as their message.`,
    plan.opening ? null : `- They seem ${r.mood ?? 'chill'} (${r.energy ?? 'medium'} energy${r.doing && r.doing !== 'chatting' ? `, ${r.doing.replace(/_/g, ' ')}` : ''}): ${(MOOD_MATCH[r.mood] ?? MOOD_MATCH.chill).replace(/\{name\}/g, firstName)}.`,
    plan.opening ? null : humanMoveLine(plan, firstName),
    plan.askBack && plan.topic?.kind !== 'agenda' ? '- At most one question, about what they said.' : plan.topic?.kind === 'agenda' ? null : '- No question this time.',
    plan.emoji ? `- Use the emoji ${plan.emoji} once.` : '- No emoji.',
    plan.laugh ? `- Laugh the way ${firstName} does ("${plan.laugh}").` : null,
    `- Language: ${langName(plan.language.primary)}${plan.language.codeSwitch && plan.language.secondary ? `, mixing in some ${langName(plan.language.secondary)} the way ${firstName} does` : ' only'}.`,
    ...plan.reactions.filter((x) => x.kind !== 'unknown').map((x) => `- About "${x.text}": ${firstName} is ${{ excited: 'genuinely excited about it', positive: 'into it', lukewarm: 'only mildly into it', dislike: 'NOT into it; say so kindly' }[x.kind]}.`),
    plan.unknownTopic ? `- They asked about ${plan.unknownTopic}: nothing about ${firstName} and ${plan.unknownTopic} is listed. Say simply you don't know or haven't thought about it. Never invent a preference, team, habit or opinion.` : null,
    plan.mustDisagree ? `- DISAGREE with "${plan.disagreeOn}". ${firstName} firmly holds the opposite view: keep it friendly, but do not give in.` : null,
    plan.topic?.kind === 'agenda' ? `- If it fits right now, ask this plainly in one short casual line: "${askOnceText(plan.topic.text)}" No setup, no story, no hint first. If it doesn't fit, don't ask it.` : null,
    plan.topic?.kind === 'story' ? `- They told you a story: if [${plan.topic.storyId}] truly connects, share it in one or two sentences. Otherwise skip it.` : null,
  ].filter(Boolean);
}

const HUMAN_BLOCK = (firstName) => [
  'HOW THIS CHAT GOES:',
  '- This is a simple, casual chat. Most messages are a short reply or reaction.',
  "- Match their mood and energy. If they're short, be short. If they're tired, be gentle and brief. If they're playful, play along.",
  "- Small talk is good. You don't need a fact to react, agree, or talk about the day, the weekend, food or what they said.",
  "- Don't tell stories unless they told one first. Don't set up questions with stories or hints.",
  '- Not every message needs a question.',
  `- Anything about ${firstName} still comes only from the listed facts.`,
];

function finalHuman(plan, firstName) {
  return [
    plan.unknownTopic ? `answer simply: ${firstName} has nothing listed about ${plan.unknownTopic}, so say you don't know (no made-up preference).`
      : plan.answerFirst && `answer their question about ${firstName} simply (listed facts, or say in your own words that you don't know).`,
    plan.mustDisagree && `keep ${firstName}'s opposite view on "${plan.disagreeOn}" (friendly, but don't give in).`,
    plan.move === 'stay' && 'stay with what they are telling you; no new topic.',
    plan.topic?.kind === 'agenda' && `if it fits, ask plainly: "${askOnceText(plan.topic.text)}"; if not, skip it.`,
    !plan.topic && plan.move === 'react' && 'just a short reaction, no question.',
    !plan.topic && plan.move === 'share' && `share a little of ${firstName}'s that connects, no question.`,
    !plan.topic && plan.move === 'ask_theirs' && 'react, then one short question about what they just said.',
    `about ${plan.targetWords} words.`,
  ].filter(Boolean).join(' ');
}

// Plan 33: the first message of a later session, after hours (or a day) of quiet.
function callbackLine(plan) {
  const replying = plan.callbackReply ? ' Reply to what they sent while you were away first.' : '';
  return plan.callback
    ? `- Move: you're picking the chat back up after a while.${replying} Open casually and follow up on this from last time: "${plan.callback}" (e.g. "hey! how did it go?"). One short message.`
    : `- Move: you're picking the chat back up after a while.${replying} Open casually (a hey, something small from your day only if a listed fact covers it) and ask one easy thing that follows from your last chat. One short message.`;
}

function finalInstruction(plan, firstName) {
  if (plan.end === 'session') return 'say you have to go for now and will talk later, in one short warm line (not a final goodbye).';
  if (plan.end === 'session_ack') return 'say a short warm "talk later" back (no question).';
  if (plan.move === 'callback') return plan.callback ? `pick the chat back up: a casual hey and a follow-up on "${plan.callback}".` : 'pick the chat back up: a casual hey and one easy question from your last chat.';
  if (plan.end) return 'end the conversation kindly in one short line (no question).';
  if (plan.mode === 'human') return finalHuman(plan, firstName);
  return [
    plan.unknownTopic ? `answer their question honestly: ${firstName} has nothing listed about ${plan.unknownTopic}, so say you're not sure (no made-up preference); don't just ask it back.`
      : plan.answerFirst && `first answer their question about ${firstName} (from the listed facts, or honestly say you're not sure); don't just ask it back.`,
    plan.mustDisagree && `keep ${firstName}'s opposite view on "${plan.disagreeOn}" (friendly, but don't give in).`,
    plan.topic?.kind === 'agenda' && (plan.topic.how === 'lull'
      ? `if it flows, move the chat toward ${topicText(plan.topic.text)}, linked to something already said; if it would sound abrupt, skip it.`
      : `reply to their message, and if it flows from it, ease into ${topicText(plan.topic.text)}; if not, skip it.`),
    !plan.topic && plan.move === 'follow_up' && 'react, then ask one follow-up about something they just said.',
    !plan.topic && plan.move === 'share' && `no question: react and share something of ${firstName}'s that connects.`,
    !plan.topic && plan.move === 'react' && 'no question: just a short, natural reaction.',
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
        // Plan 30 SN: the agents read like interviewers ticking off topics. This is how two people actually get talking.
        ...(plan.mode === 'human' ? HUMAN_BLOCK(firstName) : [
          'HOW A GOOD CHAT FEELS:',
          '- It is a getting-to-know-you chat between two people, not an interview or a questionnaire.',
          '- Stay on the thread they are on before changing the subject. Pick up the specific details they mention and react to those.',
          `- Share before you ask: give something of ${firstName}'s own so it's an exchange, not a Q&A.`,
          '- Not every message needs a question. Never fire a new question on an unrelated topic right after they answered one.',
          "- Light humour, teasing and small reactions are good when they fit the person's style.",
        ]),
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
