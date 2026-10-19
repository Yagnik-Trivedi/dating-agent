// Illustrated demo people (Frontend-Design/07-tandem-step1/source/src/lib/art.js, plan 30 S6): flat editorial
// illustrations, faceless by design, never photos of real people. Each demo person gets a palette from their id.
const cache = new Map();
const uri = (svg) => 'data:image/svg+xml;utf8,' + encodeURIComponent(svg);

const PALETTES = [
  { skin: '#C08A64', skinShade: '#A9744F', hair: '#2E211C', hairStyle: 'long', top: '#6F7A4E', bg: '#E9DCC9', arch: '#D9C3A3', accent: '#C9A15E', glasses: false, earring: true },
  { skin: '#B07E5A', skinShade: '#976846', hair: '#231A16', hairStyle: 'short', top: '#3F4A5A', bg: '#E6DED2', arch: '#CFC0AA', accent: '#B5734F', glasses: true, earring: false },
  { skin: '#9C6B4B', skinShade: '#83573A', hair: '#1E1714', hairStyle: 'bun', top: '#9A5546', bg: '#EFE3D1', arch: '#DCC8AB', accent: '#B08A3E', glasses: false, earring: true },
  { skin: '#D2A07B', skinShade: '#B9875F', hair: '#3A2A22', hairStyle: 'wavy', top: '#B08A3E', bg: '#E8DED0', arch: '#D5C1A4', accent: '#9A5546', glasses: false, earring: false },
  { skin: '#A97554', skinShade: '#8F5F41', hair: '#2A1F1A', hairStyle: 'bob', top: '#7F9175', bg: '#EDE4D6', arch: '#D8C6AC', accent: '#B5734F', glasses: true, earring: false },
];

function hairBack(p) {
  switch (p.hairStyle) {
    case 'long': return `<path d="M128 230 C120 150 160 118 200 118 C244 118 282 150 274 232 C286 300 292 380 268 430 L132 430 C108 380 114 300 128 230Z" fill="${p.hair}"/>`;
    case 'wavy': return `<path d="M130 232 C118 150 160 120 200 120 C246 120 284 152 272 234 C292 270 284 320 262 352 L138 352 C116 320 110 270 130 232Z" fill="${p.hair}"/>`;
    case 'bob': return `<path d="M132 236 C122 154 162 122 200 122 C242 122 280 154 268 238 C274 278 266 300 254 306 L146 306 C134 300 126 278 132 236Z" fill="${p.hair}"/>`;
    default: return '';
  }
}
function hairFront(p) {
  switch (p.hairStyle) {
    case 'short': return `<path d="M140 222 C136 162 168 140 202 140 C238 140 266 162 262 222 C252 196 236 182 204 180 C176 180 152 192 140 222Z" fill="${p.hair}"/>`;
    case 'bun': return `<circle cx="200" cy="128" r="30" fill="${p.hair}"/><path d="M142 226 C138 168 170 146 202 146 C236 146 266 168 260 226 C250 200 232 186 202 186 C172 186 152 200 142 226Z" fill="${p.hair}"/>`;
    case 'bob': return `<path d="M144 230 C142 170 172 148 202 148 C234 148 262 172 258 226 C236 200 214 196 196 192 C176 200 158 212 144 230Z" fill="${p.hair}"/>`;
    default: return `<path d="M144 228 C142 168 172 146 202 146 C234 146 262 170 258 228 C240 198 220 188 200 186 C178 192 158 206 144 228Z" fill="${p.hair}"/>`;
  }
}
function portrait(p, crop = 0) {
  const g = p.glasses ? `<g fill="none" stroke="#2B2420" stroke-width="3"><rect x="160" y="226" width="34" height="24" rx="10"/><rect x="206" y="226" width="34" height="24" rx="10"/><path d="M194 236 h12"/></g>` : '';
  const e = p.earring ? `<circle cx="141" cy="270" r="5" fill="${p.accent}"/><circle cx="259" cy="270" r="5" fill="${p.accent}"/>` : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 ${crop} 400 ${500 - crop}" preserveAspectRatio="xMidYMid slice">
  <rect width="400" height="500" fill="${p.bg}"/>
  <path d="M70 500 V190 a130 130 0 0 1 260 0 V500Z" fill="${p.arch}"/>
  <circle cx="318" cy="96" r="34" fill="${p.accent}" opacity=".35"/>
  ${hairBack(p)}
  <path d="M178 296 h44 v62 h-44z" fill="${p.skinShade}"/>
  <path d="M64 500 C70 410 118 372 170 360 C186 372 214 372 230 360 C282 372 330 410 336 500Z" fill="${p.top}"/>
  <path d="M170 360 C186 386 214 386 230 360 C222 356 214 354 200 354 C186 354 178 356 170 360Z" fill="${p.skin}"/>
  <ellipse cx="200" cy="238" rx="60" ry="74" fill="${p.skin}"/>
  <ellipse cx="141" cy="246" rx="9" ry="15" fill="${p.skinShade}"/><ellipse cx="259" cy="246" rx="9" ry="15" fill="${p.skinShade}"/>
  ${hairFront(p)}${g}${e}
  <path d="M0 470 H400 V500 H0Z" fill="#000" opacity=".04"/>
</svg>`;
}
function trek(p) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 500" preserveAspectRatio="xMidYMid slice">
  <defs><linearGradient id="s" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#E4D3BB"/><stop offset="1" stop-color="#F4EADC"/></linearGradient></defs>
  <rect width="400" height="500" fill="url(#s)"/><circle cx="292" cy="150" r="46" fill="#E6BE8E"/>
  <path d="M0 300 L70 210 L120 250 L190 150 L250 230 L300 190 L400 280 V500 H0Z" fill="#D2BE9F"/>
  <path d="M190 150 L172 174 L186 172 L196 186 L206 170 L216 176Z" fill="#F7F1E7"/>
  <path d="M0 360 L90 280 L150 320 L230 250 L310 320 L400 290 V500 H0Z" fill="#A99273"/>
  <path d="M0 430 C80 380 160 372 240 392 C300 406 350 392 400 372 V500 H0Z" fill="#6F7A4E"/>
  <g transform="translate(226 340)"><rect x="-4" y="-34" width="12" height="20" rx="4" fill="${p.accent}"/><circle cx="0" cy="-42" r="6" fill="${p.skin}"/><path d="M-6 -36 h12 v22 h-12z" fill="${p.top}"/><path d="M-5 -14 l-3 16 M5 -14 l3 16" stroke="#2B2420" stroke-width="3"/></g>
</svg>`;
}
function cafe(p) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 500" preserveAspectRatio="xMidYMid slice">
  <rect width="400" height="500" fill="#EBDDC8"/><path d="M220 0 H400 V300 L260 380 Z" fill="#F6EDE0" opacity=".9"/>
  <rect y="330" width="400" height="170" fill="#B89773"/><rect y="330" width="400" height="8" fill="#A07F5C"/>
  <rect x="60" y="300" width="150" height="40" rx="4" fill="${p.top}"/><rect x="66" y="306" width="138" height="6" fill="#F4EDE1" opacity=".6"/>
  <ellipse cx="270" cy="372" rx="62" ry="14" fill="#F4EDE1"/><path d="M228 300 h84 v40 c0 26 -20 38 -42 38 c-22 0 -42 -12 -42 -38z" fill="#FFFDF9"/>
  <path d="M312 312 c22 0 22 30 0 30" fill="none" stroke="#FFFDF9" stroke-width="8"/><ellipse cx="270" cy="300" rx="42" ry="9" fill="#7A5236"/>
  <path d="M256 280 c-8 -14 8 -20 0 -36 M282 282 c-8 -14 8 -20 0 -36" fill="none" stroke="#FFFDF9" stroke-width="3" stroke-linecap="round" opacity=".8"/>
</svg>`;
}
function city(p) {
  const b = [[10, 250, 60], [80, 200, 50], [140, 270, 70], [220, 180, 55], [285, 240, 60], [350, 210, 50]];
  const win = b.map(([x, y, w]) => Array.from({ length: 10 }, (_, i) => `<rect x="${x + 8 + (i % 3) * 15}" y="${y + 14 + Math.floor(i / 3) * 26}" width="8" height="12" fill="#F2D29E" opacity="${(i * 7 + x) % 3 ? 0.9 : 0.3}"/>`).join('')).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 500" preserveAspectRatio="xMidYMid slice">
  <defs><linearGradient id="d" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#C99A7A"/><stop offset=".6" stop-color="#E7C7A2"/><stop offset="1" stop-color="#F3E3CD"/></linearGradient></defs>
  <rect width="400" height="500" fill="url(#d)"/><circle cx="200" cy="200" r="54" fill="#F0CFA0" opacity=".85"/>
  ${b.map(([x, y, w]) => `<rect x="${x}" y="${y}" width="${w}" height="${500 - y}" fill="#7B6252"/>`).join('')}${win}
  <rect y="440" width="400" height="60" fill="#5B463A"/>
</svg>`;
}
function sketch(p) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 500" preserveAspectRatio="xMidYMid slice">
  <rect width="400" height="500" fill="#D9C7AE"/><rect x="50" y="60" width="300" height="380" rx="4" fill="#FBF6EE" transform="rotate(-3 200 250)"/>
  <g fill="none" stroke="#6B5F55" stroke-width="2" transform="rotate(-3 200 250)">
    <path d="M100 380 V200 L200 140 L300 200 V380 Z"/><path d="M130 380 V300 h40 v80 M230 300 h40 v50 h-40z M140 230 h40 v40 h-40z M220 230 h40 v40 h-40z"/><path d="M90 380 H310"/>
    <path d="M190 170 a10 10 0 0 1 20 0 v18 h-20z"/></g>
  <rect x="270" y="380" width="120" height="10" rx="5" fill="${p.accent}" transform="rotate(-28 330 385)"/>
</svg>`;
}
const SCENES = { portrait, trek, cafe, city, sketch, portrait2: (p) => portrait(p, 60) };
const hash = (s) => [...String(s)].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);
/** An illustration for a demo person: same id → same palette. scene: portrait · portrait2 · trek · cafe · city · sketch */
export function illustration(id, scene = 'portrait') {
  const k = id + '-' + scene; if (cache.has(k)) return cache.get(k);
  const v = uri(SCENES[scene](PALETTES[hash(id) % PALETTES.length])); cache.set(k, v); return v;
}
