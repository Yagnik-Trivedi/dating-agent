// Who is acting right now (plan 06/08 information boundary): code that reads another user's data on behalf of an
// agent, judge, trust check or brief runs inside asActor(), so a DB spy can prove what each role read.
import { AsyncLocalStorage } from 'node:async_hooks';

const store = new AsyncLocalStorage();

/** actor: { role: 'trust'|'brief'|'agent'|'judge'|'ui', userId, otherId } */
export const asActor = (actor, fn) => store.run({ ...actor, userId: String(actor.userId), otherId: actor.otherId && String(actor.otherId) }, fn);
export const currentActor = () => store.getStore() ?? null;
