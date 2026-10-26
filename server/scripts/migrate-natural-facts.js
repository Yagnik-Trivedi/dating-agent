// UX P0-4 for accounts built before it: basics and "Your world" facts become natural phrases ("doesn't smoke"), kids /
// drinking / smoking / religion become if_asked, and profile prompt answers become facts. Idempotent; facts the user
// edited by hand keep their text.
//   node scripts/migrate-natural-facts.js         → dry run: counts what would change
//   node scripts/migrate-natural-facts.js --yes   → writes (prompt facts make one embedding call per user)
// Uses MONGODB_URI (server/.env, or the environment).
import mongoose from 'mongoose';
import { env } from '../src/config/env.js';
import { KgFact } from '../src/models/KgFact.js';
import { Profile } from '../src/models/Profile.js';
import { User } from '../src/models/User.js';
import { IF_ASKED_ATTRIBUTES, jobPhrase, valuePhrase, worldPhrase } from '../src/services/kg/phrases.js';
import { syncPromptFacts } from '../src/services/kg/promptFacts.js';

const yes = process.argv.includes('--yes');

/** → the $set for one self fact, or null when it is already right. */
function fix(f) {
  const set = {};
  let object = null;
  if (f.source === 'questionnaire_choice' && f.attribute && f.value) object = f.attribute === 'job' ? jobPhrase(String(f.value)) : valuePhrase(f.attribute, f.value);
  const qid = /^M\.(W\d+(?:_\d+)?)$/.exec(f.slot ?? '')?.[1];
  if (qid) object = worldPhrase(qid, { option: f.value }) ?? worldPhrase(qid, { text: f.evidence?.[0]?.quote });
  if (object && !f.userEdited && f.object !== object) set.object = object;
  if (f.source === 'questionnaire_choice' && IF_ASKED_ATTRIBUTES.has(f.attribute) && f.disclosure === 'public') set.disclosure = 'if_asked';
  return Object.keys(set).length ? set : null;
}

await mongoose.connect(env.MONGODB_URI, { serverSelectionTimeoutMS: 15_000 });
try {
  const host = env.MONGODB_URI.replace(/^mongodb(\+srv)?:\/\/([^@]*@)?/, '').split(/[/?]/)[0];
  console.log(`Database: ${host}${yes ? '' : ' (dry run)'}`);
  const facts = await KgFact.find({ observerId: null, $or: [{ source: 'questionnaire_choice', attribute: { $exists: true } }, { slot: /^M\.W/ }] },
    { subjectId: 1, source: 1, attribute: 1, value: 1, slot: 1, object: 1, disclosure: 1, userEdited: 1, evidence: { $slice: 1 } }).lean();
  const ops = facts.map((f) => [f, fix(f)]).filter(([, set]) => set);
  console.log(`Self facts checked: ${facts.length}; to update: ${ops.length} (${ops.filter(([, s]) => s.object).length} rephrased, ${ops.filter(([, s]) => s.disclosure).length} → if_asked)`);
  for (const [f, set] of ops.slice(0, 8)) console.log(`  "${f.object}" → ${set.object ? `"${set.object}"` : '(same text)'}${set.disclosure ? ' · if_asked' : ''}`);

  const withPrompts = await Profile.find({ 'prompts.0': { $exists: true } }, { userId: 1, prompts: 1 }).lean();
  const hasPromptFacts = new Set((await KgFact.distinct('subjectId', { observerId: null, sourceAnswerId: /^prompt_/ })).map(String));
  const missing = withPrompts.filter((p) => !hasPromptFacts.has(String(p.userId)));
  console.log(`Users with prompts but no prompt facts: ${missing.length}`);

  if (!yes) {
    console.log('\nDry run: nothing written. Run again with --yes to apply.');
  } else {
    if (ops.length) await KgFact.bulkWrite(ops.map(([f, set]) => ({ updateOne: { filter: { _id: f._id }, update: { $set: set } } })));
    const touched = [...new Set(ops.map(([f]) => String(f.subjectId)))];
    if (touched.length) await User.updateMany({ _id: { $in: touched } }, { $inc: { graphVersion: 1 } }); // agents' fact caches reload
    for (const p of missing) await syncPromptFacts(p.userId, p.prompts);
    console.log(`Done: ${ops.length} facts updated for ${touched.length} users; prompt facts added for ${missing.length} users.`);
  }
} finally {
  await mongoose.disconnect();
}
