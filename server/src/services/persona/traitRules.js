// Big Five → behaviour rules for the reply prompt (plan 08 §1.2, ref Phase 6.1). Values 0.4–0.7 give no rule.
const RULES = {
  extraversion: { low: 'short replies, few exclamation marks, rarely asks back', high: 'energetic, more exclamation marks, asks back often' },
  agreeableness: { low: 'direct, comfortable disagreeing', high: 'warm, softens disagreement, but still disagrees on things they feel strongly about' },
  neuroticism: { high: 'a bit more reactive to low-effort replies; avoids sarcasm' },
  openness: { low: 'sticks to concrete topics', high: 'curious, enjoys playful hypotheticals' },
  conscientiousness: { low: 'casual about plans', high: 'likes concrete plans and times' },
};

/** traits { extraversion: 0..1, … } → [rule strings] (never states the trait itself). */
export function traitRules(traits = {}) {
  const out = [];
  for (const [trait, r] of Object.entries(RULES)) {
    const v = traits[trait];
    if (v == null) continue;
    if (v < 0.4 && r.low) out.push(r.low);
    if (v > 0.7 && r.high) out.push(r.high);
  }
  return out;
}
