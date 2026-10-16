import { Router } from 'express';
import { z } from 'zod';
import { KgFact } from '../models/KgFact.js';
import { userGraph } from '../services/kg/graph.js';
import { httpError, objectId, parse } from '../utils/http.js';

export const kgRouter = Router();

kgRouter.get('/kg/me', async (req, res) => res.json(await userGraph(req.user)));

async function ownFact(req) {
  const { id } = parse(z.object({ id: objectId }), req.params);
  const fact = await KgFact.findOne({ _id: id, subjectId: req.user._id, observerId: null });
  if (!fact) throw httpError(404, 'NOT_FOUND', 'Fact not found');
  if (fact.predicate === 'trait') throw httpError(422, 'TRAIT_READ_ONLY', 'Personality traits are computed from your answers and can’t be edited');
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
