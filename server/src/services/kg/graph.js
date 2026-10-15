import { KgFact } from '../../models/KgFact.js';

/** The user's own graph for react-force-graph: a center node + one node per self-reported fact. */
export async function userGraph(user) {
  const facts = await KgFact.find({ subjectId: user._id, observerId: null }).lean();
  const nodes = [
    { id: 'me', label: user.name, type: 'self', group: 'self', size: 1 },
    ...facts.map((f) => ({
      id: String(f._id),
      label: f.object,
      type: f.predicate,
      group: f.predicate,
      size: f.weight,
      weight: f.weight,
      confidence: f.confidence,
      disclosure: f.disclosure,
      source: f.source,
    })),
  ];
  const links = facts.map((f) => ({ source: 'me', target: String(f._id), label: f.predicate }));
  return { nodes, links };
}
