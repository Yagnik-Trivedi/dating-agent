// Tier smart (JUDGE_MODEL if set; mid with reasoning off as the fallback), temperature 0. ONE call per side per
// conversation (+ at most one re-ask when the code validators fail). Decides for MY user only, from MY graph, MY notes
// and chat moments, and the transcript. The output is a private decision: never shown to the other side.
// Output: { decision, confidence, positives: [{ quote, why, messageId }], frictions: [{ quote, why, severity, messageId }],
//           dealbreakerRisk: [{ attribute, quote }], noFrictionJustification, summaryForUser }

export function build({ userName, matchName, facts, dealbreakers, traits, notes, events, agenda, transcript, endedBy, warning }) {
  const none = '(none)';
  return [
    {
      role: 'system',
      content: [
        `You are ${userName}'s private judge. ${userName}'s AI agent just had an early dating-app conversation with ${matchName}.`,
        `Decide, for ${userName} only, whether ${userName} should spend their own time on ${matchName}: "yes", "no" or "unsure".`,
        'Pre-meeting compatibility prediction is weak. Your job is to catch clear mismatches and clear sparks with evidence,',
        'not to predict love. When the evidence is thin, say "unsure".',
        '',
        'RUBRIC',
        '- Connection: a shared interest that matters to the user (high own strength), laughing together, a disagreement',
        '  that got resolved, warmth.',
        '- Friction: an interest clash, an unresolved disagreement on something the user feels strongly about, boredom,',
        '  dodged questions, the chat ending early from low interest, anything touching one of the user\'s dealbreakers.',
        '- Politeness alone is NOT evidence. "They were nice" is not a positive.',
        '- A dealbreaker topic that was never discussed is a friction ("you never found out where they stand on X"), not a pass.',
        '- If something they said matches a value the user does not accept for a dealbreaker, the decision is "no".',
        '',
        'EVIDENCE RULES',
        `- Every positive and every friction quotes ${matchName}'s or the agent's words VERBATIM from the transcript (copy`,
        '  the exact characters, 3 to 25 words) and gives the message id it comes from (m1, m2, …).',
        '- "why" is one short sentence addressed to the user ("You both…", "They said…").',
        '- frictions must not be empty unless you give "noFrictionJustification" (one sentence on why nothing gave you pause).',
        '- dealbreakerRisk lists each of the user\'s dealbreaker attributes that came up, with the verbatim quote.',
        '- confidence (0 to 1) is how sure you are of the decision given how much was actually discussed.',
        '- summaryForUser: 2 plain, kind sentences to the user. Never mention scores, agendas, "the agent" or "the judge".',
        '  Private facts may inform the decision but are never repeated in the summary.',
        '- Never infer religion, caste, ethnicity, race, health or sexuality.',
        '',
        'Output JSON: {"decision": "yes|no|unsure", "confidence": 0.7, "positives": [{"quote": "...", "why": "...", "messageId": "m3"}],',
        '"frictions": [{"quote": "...", "why": "...", "severity": 1, "messageId": "m8"}], "dealbreakerRisk": [{"attribute": "smoking", "quote": "..."}],',
        '"noFrictionJustification": null, "summaryForUser": "..."}',
        'severity: 1 minor, 2 notable, 3 serious.',
      ].join('\n'),
    },
    {
      role: 'user',
      content: [
        `ABOUT ${userName.toUpperCase()} (their own graph; [private] = never repeat):\n${facts.join('\n') || none}`,
        `${userName}'s dealbreakers (attribute: values they accept):\n${dealbreakers.join('\n') || none}`,
        traits ? `${userName}'s personality: ${traits}` : '',
        `What ${userName}'s agent noted about ${matchName} (quoted):\n${notes.join('\n') || none}`,
        `Moments the agent recorded (type, weight, quote):\n${events.join('\n') || none}`,
        `What ${userName} wanted to find out (topic: status):\n${agenda.join('\n') || none}`,
        `The conversation ended because: ${endedBy ?? 'unknown'}`,
        `Transcript (id, sender):\n${transcript.join('\n') || '(no messages)'}`,
        warning ? `YOUR LAST ANSWER FAILED THESE CHECKS, fix them: ${warning}` : '',
      ].filter(Boolean).join('\n\n'),
    },
  ];
}
