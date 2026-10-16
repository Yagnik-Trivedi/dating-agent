// Plan 17: compact vector storage round-trips and works with cosine.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { cosine } from '../src/services/kg/similarity.js';
import { fromBinary, toBinary } from '../src/utils/vector.js';

const v = Array.from({ length: 2048 }, (_, i) => Math.sin(i) / 3);

test('float32 round-trips within float32 precision and is ~4 bytes/dim', () => {
  const buf = toBinary(v, 'float32');
  assert.equal(buf.length, 1 + 4 * v.length);
  const back = fromBinary(buf);
  assert.equal(back.length, v.length);
  for (let i = 0; i < v.length; i++) assert.ok(Math.abs(back[i] - v[i]) < 1e-6);
});

test('int8 is ~1 byte/dim and keeps cosine within 0.01', () => {
  const buf = toBinary(v, 'int8');
  assert.equal(buf.length, 5 + v.length);
  assert.ok(Math.abs(cosine(fromBinary(buf), v) - 1) < 0.01);
});

test('cosine accepts arrays, typed arrays and stored buffers alike', () => {
  const w = v.map((x, i) => x + (i % 7) / 50);
  const expected = cosine(v, w);
  assert.ok(Math.abs(cosine(toBinary(v), toBinary(w)) - expected) < 1e-6);
  assert.ok(Math.abs(cosine(toBinary(v), w) - expected) < 1e-6);
  assert.equal(cosine(null, w), 0);
});
