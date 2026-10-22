// Owner's test matches (scripts/admin-matches.js): matched on purpose, so no gate re-check and no daily chat cap.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { gateCheck, overDailyChats } from '../src/services/pipeline/index.js';

test('an admin match skips the gate re-check and the daily live-chat cap (no database read needed)', async () => {
  const match = { admin: true, users: ['a', 'b'], perUser: [{ userId: 'a', agentActive: true }, { userId: 'b', agentActive: true }] };
  assert.equal(await gateCheck(match), true);
  assert.equal(await overDailyChats(match), false);
});
