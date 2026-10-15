// Dev/test personas from seed/personas.json: created (with their full knowledge graph) on first use.
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import bcrypt from 'bcryptjs';
import { Profile } from '../../src/models/Profile.js';
import { User } from '../../src/models/User.js';
import { buildUserGraph } from '../../src/services/kg/buildUserGraph.js';

const personas = JSON.parse(readFileSync(new URL('../../seed/personas.json', import.meta.url)));

export async function ensurePersona(email) {
  const existing = await User.findOne({ email });
  if (existing) return existing;
  const p = personas.find((x) => x.email === email);
  if (!p) throw new Error(`${email} not found and not in seed/personas.json`);
  console.log(`creating ${p.profile.name} (${email}) and building their graph…`);
  const user = await User.create({
    email, passwordHash: await bcrypt.hash(randomUUID(), 10), name: p.profile.name, consentAgent: true, consentAt: new Date(),
    agentMode: p.agentMode, isSeed: true, onboarding: { status: 'processing', answers: p.answers },
  });
  await Profile.create({ userId: user._id, ...p.profile });
  await buildUserGraph(user._id);
  return user;
}
