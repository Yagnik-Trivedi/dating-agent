// Plan 30 S0: age from date of birth, the optional radius in the gate (query + code agree), plain validation
// sentences, and the CORS origin check.
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import mongoose from 'mongoose';
import { z } from 'zod';
import { allowOrigin } from '../src/config/env.js';
import { Profile } from '../src/models/Profile.js';
import { ageFrom } from '../src/routes/auth.js';
import { cityGeo, distanceKm } from '../src/services/cities.js';
import { discoverQuery, gateFrom, passesGate } from '../src/services/match/gate.js';
import { parse } from '../src/utils/http.js';
import { start, stop } from '../scripts/lib/testDb.js';

test('age from date of birth counts whole years (birthday not reached yet → one less)', () => {
  const now = new Date('2026-10-18T12:00:00Z');
  assert.equal(ageFrom('2008-10-18', now), 18);
  assert.equal(ageFrom('2008-10-19', now), 17);
  assert.equal(ageFrom('1990-01-01', now), 36);
});

test('cities: listed names get coordinates (case-insensitive); distances are sane', () => {
  assert.ok(cityGeo('pune') && cityGeo('Mumbai'));
  assert.equal(cityGeo('Atlantis'), undefined);
  const d = distanceKm(cityGeo('Pune'), cityGeo('Mumbai'));
  assert.ok(d > 110 && d < 140, `Pune–Mumbai ${d} km`);
});

const person = (o) => gateFrom({ age: 28, gender: 'woman', interestedIn: ['man'], ...o });
const man = (o) => gateFrom({ age: 30, gender: 'man', interestedIn: ['woman'], ...o });
const at = (city, extra = {}) => ({ city, geo: cityGeo(city), ...extra });

test('gate: a radius widens location both ways only for the side that set it', () => {
  assert.equal(passesGate(person(at('Pune')), man(at('Mumbai'))), false, 'no radius → same city only');
  assert.equal(passesGate(person(at('Pune', { radiusKm: 200 })), man(at('Mumbai'))), false, 'his side still needs the same city');
  assert.equal(passesGate(person(at('Pune', { radiusKm: 200 })), man(at('Mumbai', { radiusKm: 200 }))), true);
  assert.equal(passesGate(person(at('Pune', { radiusKm: 50 })), man(at('Mumbai', { radiusKm: 200 }))), false, 'mine is too small');
  assert.equal(passesGate(person({ city: 'Lonavala town' }), man({ city: 'lonavala town' })), true, '"Other" city matches by name');
});

before(start);
after(stop);

test('gate: discover query + passesGate filter agree with passesGate on a radius mix', async () => {
  const cities = ['Pune', 'Mumbai', 'Nashik', 'Delhi'];
  const docs = [];
  for (let i = 0; i < 24; i++) {
    const g = man(at(cities[i % 4], i % 3 === 0 ? { radiusKm: [60, 200][i % 2] } : {}));
    docs.push({ userId: new mongoose.Types.ObjectId(), name: `m${i}`, gate: g });
  }
  await Profile.insertMany(docs);
  for (const me of [person(at('Pune')), person(at('Pune', { radiusKm: 200 })), person(at('Mumbai', { radiusKm: 60 }))]) {
    const found = await Profile.find(discoverQuery(me), { gate: 1, userId: 1 }).lean();
    const got = found.filter((p) => passesGate(me, p.gate)).map((p) => String(p.userId)).sort();
    const want = docs.filter((d) => passesGate(me, d.gate)).map((d) => String(d.userId)).sort();
    assert.deepEqual(got, want);
  }
});

test('validation errors are plain sentences for typed fields', () => {
  const schema = z.object({ email: z.email(), password: z.string().min(8), city: z.string().min(1) });
  assert.throws(() => parse(schema, { email: 'nope', password: 'short' }), (err) => {
    assert.equal(err.message, 'Please enter a valid email address. Your password needs at least 8 characters. Please enter your city.');
    return true;
  });
});

test('CORS: CLIENT_URL and team-scoped Vercel previews pass; other sites do not', () => {
  const check = (o) => { let r; allowOrigin(o, (_, ok) => { r = ok; }); return r; };
  assert.equal(check(undefined), true, 'no Origin (curl, keep-alive)');
  assert.equal(check('https://dating-agent-git-main-chandal-chowkdi.vercel.app'), true);
  assert.equal(check('https://dating-agent-evil.vercel.app'), false);
  assert.equal(check('https://example.com'), false);
});
