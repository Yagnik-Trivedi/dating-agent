// Weights and thresholds for the verdict. Plan 11's eval tunes these.
export const WEIGHTS = { valuesGoals: 0.30, lifestyle: 0.20, interests: 0.15, communication: 0.15, personality: 0.10, chemistry: 0.10 };

export const THRESHOLDS = {
  compatible: 0.70, // score ≥ this (and enough confidence) → compatible
  incompatible: 0.50, // score < this (and enough confidence) → incompatible
  minConfidence: 0.5, // below this average confidence, the verdict is "maybe"
};

// Dimensions whose confidence counts towards avgConf. Personality is light-touch and always low-confidence.
export const CONFIDENCE_DIMENSIONS = ['valuesGoals', 'lifestyle', 'interests', 'communication'];

// Same calibration as the brief (nvidia/nemotron-3-embed-1b scores lower than the plan's 0.75/0.80; see brief/buildBrief.js).
export const MATCH_COSINE = 0.65;
export const INTEREST_COSINE = 0.70;

export const ALIGNMENT_SCORE = { aligned: 1, neutral: 0.5, conflicting: 0 };
const RANK = { incompatible: 0, maybe: 1, compatible: 2 };

/** score + dimensions → verdict. The dealbreaker gate wins over everything. */
export function verdictFor({ dimensions, chemistry }) {
  const value = (k) => (k === 'chemistry' ? chemistry : dimensions[k].score);
  const score = Object.entries(WEIGHTS).reduce((s, [k, w]) => s + w * value(k), 0);
  const avgConf = CONFIDENCE_DIMENSIONS.reduce((s, k) => s + dimensions[k].confidence, 0) / CONFIDENCE_DIMENSIONS.length;
  let verdict = 'maybe';
  if (dimensions.dealbreakers.score === 0) verdict = 'incompatible';
  else if (score >= THRESHOLDS.compatible && avgConf >= THRESHOLDS.minConfidence) verdict = 'compatible';
  else if (score < THRESHOLDS.incompatible && avgConf >= THRESHOLDS.minConfidence) verdict = 'incompatible';
  // An unchecked dealbreaker (confidence 0) can't be called compatible: we only know nothing contradicted it yet.
  if (verdict === 'compatible' && dimensions.dealbreakers.confidence === 0) verdict = 'maybe';
  return { verdict, score: Math.round(score * 100) / 100, avgConf: Math.round(avgConf * 100) / 100 };
}

/** The match status is the "lower" of the two verdicts. */
export const lowerVerdict = (a, b) => (RANK[a] <= RANK[b] ? a : b);
