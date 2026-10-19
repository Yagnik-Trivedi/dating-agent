import { useRef, useState } from 'react';
import { motion } from 'motion/react';
import { T } from './r7';

// Ported from Frontend-Design/07-prelude-step2/source/src/charts.jsx (plan 30 S6).
/* Small charts, styled after bklit-ui's approach (thin 2px lines, natural curve, no gridline clutter,
   crosshair + dot + floating label tooltip) but drawn with plain SVG in our earthy palette.
   Keyboard: focus the chart and use ← → to move the tooltip. */
function curve(pts) { // Catmull-Rom → cubic Bézier, a calm "natural" curve
  if (pts.length < 2) return '';
  let d = `M${pts[0][0]} ${pts[0][1]}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] || pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] || p2;
    d += ` C${p1[0] + (p2[0] - p0[0]) / 6} ${p1[1] + (p2[1] - p0[1]) / 6} ${p2[0] - (p3[0] - p1[0]) / 6} ${p2[1] - (p3[1] - p1[1]) / 6} ${p2[0]} ${p2[1]}`;
  }
  return d;
}
const MK = { shared: { c: '#4F5A2E', l: 'Shared interest' }, laugh: { c: '#A2613F', l: 'Laugh' }, disagree: { c: '#7A5410', l: 'Disagreement' } };
const LEVEL = ['Polite', 'Curious', 'Warming up', 'Into it'];

export function InterestLine({ series, moments = [], shown, w = 300, h = 120, label = 'How she seems across the conversation' }) {
  const data = series.slice(0, Math.max(2, shown));
  const pad = { l: 6, r: 14, t: 12, b: 22 };
  const X = (i) => pad.l + (i / (series.length - 1)) * (w - pad.l - pad.r);
  const Y = (v) => pad.t + (1 - v / 3) * (h - pad.t - pad.b);
  const pts = data.map((v, i) => [X(i), Y(v)]);
  const [hov, setHov] = useState(null);
  const ref = useRef(null);
  const onMove = (e) => { const r = ref.current.getBoundingClientRect(); const x = ((e.clientX - r.left) / r.width) * w; const i = Math.round(((x - pad.l) / (w - pad.l - pad.r)) * (series.length - 1)); setHov(Math.max(0, Math.min(data.length - 1, i))); };
  const last = pts[pts.length - 1];
  const hm = hov != null ? moments.find((m) => m.i === hov) : null;
  return (
    <figure className="chart" aria-label={label}>
      <svg ref={ref} viewBox={`0 0 ${w} ${h}`} width="100%" height={h} tabIndex={0} role="img" aria-label={`${label}. Now: ${LEVEL[Math.round(data[data.length - 1])]}. Not a score.`}
        onPointerMove={onMove} onPointerLeave={() => setHov(null)} onKeyDown={(e) => { if (e.key === 'ArrowRight') setHov((v) => Math.min(data.length - 1, (v ?? -1) + 1)); if (e.key === 'ArrowLeft') setHov((v) => Math.max(0, (v ?? data.length) - 1)); }} onBlur={() => setHov(null)}>
        {[0, 3].map((v) => <line key={v} x1={pad.l} x2={w - pad.r} y1={Y(v)} y2={Y(v)} className="ch-base" />)}
        <text x={pad.l} y={h - 6} className="ch-ax">Polite</text><text x={w - pad.r} y={h - 6} textAnchor="end" className="ch-ax">Into it ↑</text>
        <motion.path d={curve(pts)} className="ch-line" initial={false} animate={{ d: curve(pts) }} transition={T.slow} />
        {moments.filter((m) => m.i < data.length).map((m) => <circle key={m.i} cx={X(m.i)} cy={Y(series[m.i])} r="4.5" fill={MK[m.k].c} stroke="#FFF" strokeWidth="2" />)}
        <circle cx={last[0]} cy={last[1]} r="4" className="ch-now" /><circle cx={last[0]} cy={last[1]} r="9" className="ch-pulse" />
        {hov != null && <g><line x1={X(hov)} x2={X(hov)} y1={pad.t - 4} y2={h - pad.b} className="ch-cross" /><circle cx={X(hov)} cy={Y(data[hov])} r="4.5" className="ch-hdot" /></g>}
      </svg>
      {hov != null && <motion.div className={`ch-tip ${X(hov) / w > 0.75 ? 'end' : X(hov) / w < 0.25 ? 'start' : ''}`} initial={false} animate={{ left: `${(X(hov) / w) * 100}%` }} transition={{ type: 'spring', stiffness: 500, damping: 40 }}>
        <b>Message {hov + 1}</b><span>{LEVEL[Math.round(data[hov])]}</span>{hm && <em style={{ color: MK[hm.k].c }}>{hm.label}</em>}</motion.div>}
      <figcaption className="ch-legend">{Object.entries(MK).map(([k, v]) => <span key={k}><i style={{ background: v.c }} />{v.l}</span>)}</figcaption>
    </figure>
  );
}

/* "How I text": thin bars with your position against a typical range, no gridlines */
export function TextBars({ items }) {
  return (
    <ul className="tbars">{items.map((b) => (
      <li key={b.k}>
        <div className="tb-h"><b>{b.k}</b><span>{b.v}</span></div>
        <div className="tb-track" role="img" aria-label={`${b.k}: ${b.v}`}>
          {b.avg != null && <i className="tb-avg" style={{ left: `${b.avg * 100}%` }} title="Typical" />}
          <motion.i className="tb-fill" initial={{ scaleX: 0 }} whileInView={{ scaleX: b.you }} viewport={{ once: true }} transition={T.slow} />
        </div>
        <div className="tb-scale"><span>{b.scale[0]}</span><span>{b.scale[1]}</span></div>
      </li>
    ))}</ul>
  );
}

/* Admin usage: a thin line for calls, small bars for tokens, a latency line */
export function UsageChart({ calls, tokens, latency, w = 640, h = 180 }) {
  const pad = { l: 8, r: 8, t: 14, b: 20 }, n = calls.length;
  const X = (i) => pad.l + (i / (n - 1)) * (w - pad.l - pad.r);
  const mC = Math.max(...calls) * 1.15, mT = Math.max(...tokens) * 1.15;
  const Yc = (v) => pad.t + (1 - v / mC) * (h - pad.t - pad.b);
  const bw = (w - pad.l - pad.r) / n * 0.5;
  const [hov, setHov] = useState(n - 1);
  return (
    <figure className="chart usage">
      <svg viewBox={`0 0 ${w} ${h}`} width="100%" height={h} tabIndex={0} role="img" aria-label="Agent usage, last 14 days" onKeyDown={(e) => { if (e.key === 'ArrowRight') setHov((v) => Math.min(n - 1, v + 1)); if (e.key === 'ArrowLeft') setHov((v) => Math.max(0, v - 1)); }}>
        <line x1={pad.l} x2={w - pad.r} y1={h - pad.b} y2={h - pad.b} className="ch-base" />
        {tokens.map((v, i) => <rect key={i} x={X(i) - bw / 2} y={h - pad.b - (v / mT) * (h - pad.t - pad.b) * 0.6} width={bw} height={(v / mT) * (h - pad.t - pad.b) * 0.6} rx="3" className="ch-bar" onPointerEnter={() => setHov(i)} />)}
        <path d={curve(calls.map((v, i) => [X(i), Yc(v)]))} className="ch-line" />
        <line x1={X(hov)} x2={X(hov)} y1={pad.t} y2={h - pad.b} className="ch-cross" /><circle cx={X(hov)} cy={Yc(calls[hov])} r="4.5" className="ch-hdot" />
        {['14 days ago', 'Today'].map((t, k) => <text key={t} x={k ? w - pad.r : pad.l} y={h - 5} textAnchor={k ? 'end' : 'start'} className="ch-ax">{t}</text>)}
      </svg>
      <div className={`ch-tip static ${X(hov) / w > 0.75 ? 'end' : X(hov) / w < 0.25 ? 'start' : ''}`} style={{ left: `${(X(hov) / w) * 100}%` }}><b>Day {hov + 1}</b><span>{calls[hov]} calls · {tokens[hov]}k tokens · {latency[hov]} s</span></div>
    </figure>
  );
}
