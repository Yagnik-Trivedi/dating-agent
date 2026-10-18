// Landing-page demo conversation, from the owner's design (Frontend-Design/04-direction/source/src/lib/script.js).
// Fictional people; shown only as the product moment on the landing page.
export const PEOPLE = {
  me: { name: 'Aarav', age: 27, city: 'Bengaluru', role: 'Product designer' },
  them: { name: 'Meera', age: 26, city: 'Pune', role: 'Architect' },
};
export const SCRIPT = [
  { from: 'them', t: 'Okay, your profile says you trek. Real treks or Instagram treks? 😄', agenda: 'travel' },
  { from: 'me', t: 'hahaha fair. real ones. Hampta pass last monsoon, day 2 almost died 😂', moment: 'laugh' },
  { from: 'them', t: "Day 2 is always the worst!! Kedarkantha in December, my toes still haven't forgiven me",
    moment: 'shared', shared: 'Trekking', hl: ['Kedarkantha in December'],
    note: { kind: 'Clicked', text: 'She treks in winter too, and laughs about the hard parts.', q: "my toes still haven't forgiven me" } },
  { from: 'me', t: 'winter trek is next level commitment 🔥 tum plan karti ho ya bas nikal jaati ho?' },
  { from: 'them', t: 'Planner. Full spreadsheet, colour-coded. Problem? 👀' },
  { from: 'me', t: "thoda sa. i'm a book-the-bus-the-night-before person", moment: 'disagree',
    note: { kind: 'Explore', text: 'Planning styles differ. Worth a real conversation, not a dealbreaker.', q: 'Full spreadsheet, colour-coded.' } },
  { from: 'them', t: 'That would give me anxiety. But fine, someone has to find the good food stops', moment: 'resolve', agenda: 'planning' },
  { from: 'me', t: "that's literally my only skill" },
  { from: 'them', t: 'सच में? Okay, serious one. What would you actually argue about?', agenda: 'argue' },
  { from: 'me', t: 'people who say Bangalore weather is overrated. will fight. politely', moment: 'laugh' },
  { from: 'them', t: 'Hahaha. Pune person here, so… no comment 😌', moment: 'shared', shared: 'Teasing humour', hl: ['no comment'],
    note: { kind: 'Clicked', text: 'Same dry, teasing humour. She plays along instead of debating.', q: 'Pune person here, so… no comment' } },
];
export const HANDOFF = [
  { from: 'me', human: true, t: "okay, it's actually me now. the Kedarkantha story needs details" },
  { from: 'them', human: true, t: 'Hi Aarav 🙂 Coffee this week and I’ll tell you everything?' },
];
