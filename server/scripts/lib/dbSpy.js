// Information-boundary spy (plans 06/08/09): records every Mongoose read with the actor tag from services/actor.js,
// so a check can prove which role read whose data. Checks only; never imported by the app.
import mongoose from 'mongoose';
import { currentActor } from '../../src/services/actor.js';

const READS = new Set(['find', 'findOne', 'countDocuments', 'estimatedDocumentCount', 'distinct', 'exists', 'aggregate']);
let records = null;

const origQuery = mongoose.Query.prototype.exec;
const origAggregate = mongoose.Aggregate.prototype.exec;

export function startSpy() {
  records = [];
  mongoose.Query.prototype.exec = function exec(...args) {
    if (records && READS.has(this.op)) records.push({ model: this.model.modelName, op: this.op, filter: this.getFilter(), projection: this.projection() ?? {}, actor: currentActor() });
    return origQuery.apply(this, args);
  };
  mongoose.Aggregate.prototype.exec = function exec(...args) {
    if (records) records.push({ model: this._model?.modelName, op: 'aggregate', filter: this.pipeline()[0]?.$match ?? {}, projection: {}, actor: currentActor() });
    return origAggregate.apply(this, args);
  };
  return records;
}

export function stopSpy() {
  mongoose.Query.prototype.exec = origQuery;
  mongoose.Aggregate.prototype.exec = origAggregate;
  const out = records;
  records = null;
  return out;
}

/** Does this read target user `id`? (filter mentions it anywhere: userId, subjectId, _id, …) */
export const targets = (record, id) => JSON.stringify(record.filter ?? {}).includes(String(id));

/** Reads made by `role` that touch the other user (actor.otherId). */
export const readsOfOther = (recs, role) => recs.filter((r) => r.actor?.role === role && r.actor.otherId && targets(r, r.actor.otherId));
