// Knowledge-graph helpers shared by the review screen and the match room.

// Mid-tone colors that read on both light and dark backgrounds.
export const PREDICATE_COLORS = {
  likes: '#d06a4e',
  dislikes: '#8a6f63',
  values: '#3f8c7a',
  goal: '#4c78b5',
  lifestyle: '#c08a2b',
  trait: '#8a64b8',
  story: '#c4588a',
  dealbreaker: '#c94040',
  background: '#7a8691',
  style: '#5aa0a8',
  self: '#b54a32',
}

export const PREDICATE_LABELS = {
  likes: 'Likes',
  dislikes: 'Dislikes',
  values: 'Values',
  goal: 'Goals',
  lifestyle: 'Lifestyle',
  trait: 'Personality traits',
  story: 'Stories',
  dealbreaker: 'Dealbreakers',
  background: 'Background',
  style: 'Style',
}

export const DISCLOSURE = {
  public: { label: 'Public', help: 'Your agent can bring it up' },
  if_asked: { label: 'If asked', help: 'Only if they ask directly' },
  private: { label: 'Private', help: 'Never said; only guides your agent' },
}

/** Observed facts about a match → force-graph data around a center node. */
export function factsToGraph(facts, centerLabel) {
  return {
    nodes: [
      { id: 'center', label: centerLabel, type: 'self', center: true },
      ...facts.map((f) => ({
        id: String(f._id),
        label: f.object,
        type: f.predicate,
        weight: f.weight,
        confidence: f.confidence,
      })),
    ],
    links: facts.map((f) => ({ source: 'center', target: String(f._id), label: f.predicate })),
  }
}
