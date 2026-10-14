import { Router } from 'express';
import { z } from 'zod';
import { KgFact } from '../models/KgFact.js';
import { httpError, objectId, parse } from '../utils/http.js';

export const kgRouter = Router();

// The user's own graph: one node for them, one per self-reported fact. Plan 05 may enrich this.
kgRouter.get('/kg/me', async (req, res) => {
  const facts = await KgFact.find({ subjectId: req.user._id, observerId: null }).lean();
  const nodes = [
    { id: 'me', label: req.user.name, type: 'self' },
    ...facts.map((f) => ({
      id: String(f._id),
      label: f.object,
      type: f.predicate,
      weight: f.weight,
      confidence: f.confidence,
      disclosure: f.disclosure,
      source: f.source,
    })),
  ];
  const links = facts.map((f) => ({ source: 'me', target: String(f._id), label: f.predicate }));
  res.json({ nodes, links });
});

async function ownFact(req) {
  const { id } = parse(z.object({ id: objectId }), req.params);
  const fact = await KgFact.findOne({ _id: id, subjectId: req.user._id, observerId: null });
  if (!fact) throw httpError(404, 'NOT_FOUND', 'Fact not found');
  return fact;
}

kgRouter.patch('/kg/facts/:id', async (req, res) => {
  const { disclosure } = parse(z.object({ disclosure: z.enum(['public', 'if_asked', 'private']) }), req.body);
  const fact = await ownFact(req);
  fact.disclosure = disclosure;
  await fact.save();
  res.json({ fact });
});

kgRouter.delete('/kg/facts/:id', async (req, res) => {
  await (await ownFact(req)).deleteOne();
  res.status(204).end();
});
