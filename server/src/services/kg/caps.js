// Storage caps (plan 17 §6, plan 15 §6.1): keep at most `cap` documents for a filter, dropping the lowest-ranked ones
// that aren't protected. `rank(doc)` → number, higher = keep.
export async function pruneToCap(Model, filter, cap, { rank, protect = () => false, session } = {}) {
  const docs = await Model.find(filter).session(session ?? null).lean();
  if (docs.length <= cap) return 0;
  const removable = docs.filter((d) => !protect(d)).sort((a, b) => rank(a) - rank(b));
  const drop = removable.slice(0, docs.length - cap).map((d) => d._id);
  if (drop.length) await Model.deleteMany({ _id: { $in: drop } }).session(session ?? null);
  return drop.length;
}
