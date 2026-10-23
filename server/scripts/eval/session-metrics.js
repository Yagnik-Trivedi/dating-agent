// Plan 33 A9 for saved session-mode chats (no LLM, read-only).
//   node scripts/eval/session-metrics.js <matchId> [<matchId> …]   (or --latest N: the newest N session-mode chats)
import mongoose from 'mongoose';
import { env } from '../../src/config/env.js';
import { Conversation } from '../../src/models/Conversation.js';
import { MatchDecision } from '../../src/models/MatchDecision.js';
import { Message } from '../../src/models/Message.js';
import { VoiceProfile } from '../../src/models/VoiceProfile.js';
import { sessionMetrics } from './lib/sessionMetrics.js';

const args = process.argv.slice(2);
await mongoose.connect(env.MONGODB_URI, { serverSelectionTimeoutMS: 10_000 });
try {
  const latest = args.includes('--latest') ? Number(args[args.indexOf('--latest') + 1]) || 1 : 0;
  const convs = latest
    ? await Conversation.find({ depth: { $in: ['full', 'demo'] } }).sort({ startedAt: -1 }).limit(latest).lean()
    : await Conversation.find({ matchId: { $in: args.filter((a) => /^[0-9a-f]{24}$/.test(a)) } }).sort({ round: -1 }).lean();
  for (const conv of convs) {
    const [messages, decisions] = await Promise.all([
      Message.find({ matchId: conv.matchId }).sort({ createdAt: 1 }).lean(),
      MatchDecision.find({ conversationId: conv._id }).lean(),
    ]);
    const users = [...new Set(messages.map((m) => String(m.senderId)))];
    const voices = Object.fromEntries((await VoiceProfile.find({ userId: { $in: users } }, { userId: 1, fillers: 1 }).lean()).map((v) => [String(v.userId), v]));
    const m = sessionMetrics({ messages, conv, decisions, voices });
    console.log(`\n# match ${conv.matchId} (${conv.depth}, ended by ${conv.endedBy ?? '—'})`);
    console.log(`messages ${m.messages} · sessions ${m.sessions} · tokens ${m.tokens}`);
    for (const s of m.perSession) console.log(`  session ${s.n}: ${s.messages} messages, question rate ${s.questionRate} [≤ 0.35], ${s.tokens ?? '—'} tokens`);
    console.log(`yes decisions ${m.yes}: surface-only ${m.yesSurfaceOnly} [0] · with ≥ 2 deep positives ${m.yesDeep2} [all]`);
    console.log(`same question in two sessions ${m.repeats} [≤ 1]`);
    for (const [u, f] of Object.entries(m.fillers)) console.log(`fillers ${u}: ${f.perMessage}/message vs own ${f.ownRate} (ratio ${f.ratio} [0.5–1.5]); foreign stripped ${f.foreignStripped}`);
    console.log(`hedged statements on loose facts ${m.hedge.hedged}/${m.hedge.loose} = ${m.hedge.rate ?? '—'} [≥ 0.8]`);
    console.log(`moves ${JSON.stringify(m.moves)}`);
  }
} finally {
  await mongoose.disconnect();
}
