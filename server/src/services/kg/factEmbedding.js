import { embed, embeddingModel } from '../llm/client.js';

/** The text a fact is embedded as. Every embedding of a fact must use this. */
export const factText = (f) => `${f.predicate} ${f.object}`;

/** → [{ embedding, embeddingModel }] in order, ready to $set on each fact. */
export async function embedFacts(facts, { purpose = 'embed-facts', userId } = {}) {
  if (!facts.length) return [];
  const vectors = await embed(facts.map(factText), { purpose, userId, inputType: 'passage' });
  const model = embeddingModel();
  return vectors.map((embedding) => ({ embedding, embeddingModel: model }));
}
