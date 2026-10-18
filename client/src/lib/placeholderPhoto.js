// PLACEHOLDER PHOTOGRAPHY from the owner's design (lib/photo.js): a generated, defocused dusk scene with no faces.
// Replace with licensed photography before launch (shot list in the design README).
const cache = new Map();
function rng(seed) { let s = seed * 7919 + 13; return () => ((s = (s * 16807) % 2147483647) / 2147483647); }

export function duskPhoto(w = 1200, h = 1260, seed = 3) {
  const key = `dusk-${w}-${h}-${seed}`; if (cache.has(key)) return cache.get(key);
  const c = document.createElement('canvas'); c.width = w; c.height = h; const x = c.getContext('2d'); const r = rng(seed);
  const sky = x.createLinearGradient(0, 0, 0, h);
  sky.addColorStop(0, '#5E4D57'); sky.addColorStop(0.28, '#9C6E66'); sky.addColorStop(0.5, '#D9996A'); sky.addColorStop(0.62, '#EDB980'); sky.addColorStop(0.7, '#6A4A3C'); sky.addColorStop(1, '#241914');
  x.fillStyle = sky; x.fillRect(0, 0, w, h);
  // low sun haze
  const sun = x.createRadialGradient(w * 0.28, h * 0.6, 10, w * 0.28, h * 0.6, w * 0.7);
  sun.addColorStop(0, 'rgba(255,214,160,.75)'); sun.addColorStop(0.4, 'rgba(255,190,130,.25)'); sun.addColorStop(1, 'rgba(255,190,130,0)');
  x.fillStyle = sun; x.fillRect(0, 0, w, h);
  // defocused skyline
  x.filter = `blur(${Math.round(w / 90)}px)`;
  let bx = -20;
  while (bx < w) { const bw = 40 + r() * 110, bh = h * (0.08 + r() * 0.22); x.fillStyle = `rgba(${44 + r() * 20},${30 + r() * 14},${26 + r() * 10},.88)`; x.fillRect(bx, h * 0.66 - bh, bw, bh + h * 0.4); bx += bw + r() * 12; }
  // window lights
  x.filter = `blur(${Math.round(w / 400)}px)`;
  for (let i = 0; i < 140; i++) { x.fillStyle = `rgba(255,${190 + r() * 50},${120 + r() * 60},${0.25 + r() * 0.5})`; x.fillRect(r() * w, h * (0.5 + r() * 0.16), 3 + r() * 4, 4 + r() * 5); }
  // street bokeh
  for (let i = 0; i < 46; i++) {
    const cx = r() * w, cy = h * (0.66 + r() * 0.3), rad = w * (0.012 + r() * 0.05), a = 0.18 + r() * 0.45;
    x.filter = `blur(${1 + r() * 4}px)`;
    const g = x.createRadialGradient(cx, cy, rad * 0.2, cx, cy, rad);
    const col = r() > 0.6 ? '255,240,214' : r() > 0.4 ? '255,200,130' : '255,170,100';
    g.addColorStop(0, `rgba(${col},${a * 0.7})`); g.addColorStop(0.85, `rgba(${col},${a})`); g.addColorStop(1, `rgba(${col},0)`);
    x.fillStyle = g; x.beginPath(); x.arc(cx, cy, rad, 0, 7); x.fill();
  }
  x.filter = 'none';
  // grain + vignette
  const img = x.getImageData(0, 0, w, h), d = img.data;
  for (let i = 0; i < d.length; i += 4) { const n = (r() - 0.5) * 22; d[i] += n; d[i + 1] += n; d[i + 2] += n; }
  x.putImageData(img, 0, 0);
  const v = x.createRadialGradient(w / 2, h * 0.55, h * 0.25, w / 2, h * 0.55, h * 0.85);
  v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(20,10,5,.42)'); x.fillStyle = v; x.fillRect(0, 0, w, h);
  const url = c.toDataURL('image/jpeg', 0.84); cache.set(key, url); return url;
}
