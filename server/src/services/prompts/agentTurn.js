// Tier mid, reasoning off (plan 30 S1). ONE call per agent turn: read their latest message(s) for my notes (the
// perceive prompt, unchanged) AND write my next message (the agent-reply prompt, unchanged), so a turn costs one model
// round-trip instead of two. Output: { read: <perceive JSON>, messages, claims, aboutThem, unknownAboutMe, end }.
import * as agentReply from './agentReply.js';
import * as perceive from './perceive.js';

export function build({ reply, read }) {
  const [rSys, rUser] = agentReply.build(reply);
  const [pSys, pUser] = perceive.build(read);
  // The perceive instructions minus their own first line (role) and output line; the reply prompt keeps its role.
  const pLines = pSys.content.split('\n');
  const readRules = pLines.slice(1, pLines.findIndex((l) => l.startsWith('Output JSON:'))).join('\n').trim();
  const readShape = pLines.slice(pLines.findIndex((l) => l.startsWith('Output JSON:'))).join(' ').replace(/^Output JSON:\s*/, '');
  return [
    {
      role: 'system',
      content: [
        rSys.content.replace(/\nOutput JSON: [\s\S]*$/, ''),
        '',
        `FIRST, for ${reply.firstName}'s private notes, READ ${reply.matchName}'s latest message(s) (this goes under "read" and is never sent):`,
        readRules,
        '',
        `Output ONE JSON object: {"read": ${readShape}, "messages": ["..."], "claims": [{"text": "...", "factIds": ["F1"], "stance": "positive|negative|neutral"}],`,
        `"aboutThem": [{"text": "...", "sourceIds": ["N1"]}], "unknownAboutMe": null, "end": false${reply.plan?.flow === 'natural' ? ', "covers": ["i1"]' : ''}}`,
        `List EVERY self-claim in "claims" and EVERY statement about ${reply.matchName} (not questions) in "aboutThem". A plain reaction with no claim needs neither.`,
      ].join('\n'),
    },
    {
      role: 'user',
      content: `${pUser.content}\n\n---\n\n${rUser.content.replace(/Return JSON only\.$/, 'Return the ONE JSON object (read + your message) only.')}`,
    },
  ];
}
