'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

// Minimal wheel without external deps (React 19 friendly)
// Props:
// - visible: boolean
// - segments: number[] (length >= 2)
// - targetIndex: number (0..segments.length-1)
// - spinning: boolean
// - onDone: () => void
export default function Wheel({ visible, segments = [], targetIndex = 0, spinning, onDone }) {
  const wheelRef = useRef(null);
  const [angle, setAngle] = useState(0);
  const [showHit, setShowHit] = useState(false);
  const segCount = segments.length || 8;
  const perSeg = 360 / segCount;

  const colors = useMemo(() => {
    const palette = ['#f87171','#fb923c','#fbbf24','#34d399','#60a5fa','#a78bfa','#f472b6','#22d3ee'];
    return new Array(segCount).fill(0).map((_, i) => palette[i % palette.length]);
  }, [segCount]);

  const gradient = useMemo(() => {
    // Build conic-gradient for segments
    let stops = [];
    for (let i = 0; i < segCount; i++) {
      const start = i * perSeg;
      const end = (i + 1) * perSeg;
      stops.push(`${colors[i]} ${start}deg ${end}deg`);
    }
    return `conic-gradient(${stops.join(', ')})`;
  }, [segCount, perSeg, colors]);

  useEffect(() => {
    if (!spinning) return;
    // Rotate so that targetIndex ends under the top pointer (0deg)
    const baseTurns = 5; // full spins for effect
    const targetAngle = 360 * baseTurns + (360 - (targetIndex * perSeg + perSeg / 2));
    // Trigger CSS transition
    requestAnimationFrame(() => setAngle(targetAngle));
    setShowHit(false);
    const t = setTimeout(() => { setShowHit(true); onDone && onDone(); }, 3600);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spinning, targetIndex]);

  if (!visible) return null;

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
      <div style={{ position: 'relative', padding: 16, background: 'rgba(20,20,28,0.9)', border: '1px solid rgba(99,102,241,0.35)', borderRadius: 16, boxShadow: '0 20px 60px rgba(0,0,0,0.45)', textAlign: 'center' }}>
        <div style={{ position: 'relative', width: 260, height: 260, margin: '0 auto' }}>
          {/* Pointer */}
          <div style={{ position: 'absolute', top: -10, left: '50%', transform: `translateX(-50%) scale(${showHit ? 1.15 : 1})`, transition: 'transform 300ms ease', width: 0, height: 0, borderLeft: '10px solid transparent', borderRight: '10px solid transparent', borderBottom: '14px solid #fff', zIndex: 2 }} />
          {/* Wheel */}
          <div ref={wheelRef} style={{ position: 'absolute', inset: 0, borderRadius: '50%', background: gradient, boxShadow: 'inset 0 0 10px rgba(0,0,0,0.35), 0 8px 24px rgba(0,0,0,0.35)', transition: 'transform 3.6s cubic-bezier(0.12, 0.62, 0, 1)', transform: `rotate(${angle}deg)` }}>
            {/* Segment labels */}
            {segments.map((val, i) => (
              <div key={i} style={{ position: 'absolute', top: '50%', left: '50%', transform: `rotate(${i * perSeg + perSeg / 2}deg) translate(-50%, -110px) rotate(${- (i * perSeg + perSeg / 2)}deg)`, transformOrigin: '0 0', fontWeight: 800, color: '#0f172a' }}>{val}</div>
            ))}
          </div>
          {/* Hit ring */}
          {showHit && (
            <div className="reveal-pop" style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
              <div style={{ background: '#fff', color: '#111827', fontWeight: 800, padding: '8px 12px', borderRadius: 12, border: '1px solid rgba(99,102,241,0.35)', boxShadow: '0 10px 30px rgba(0,0,0,0.25)' }}>
                +{segments[targetIndex]}
              </div>
            </div>
          )}
        </div>
        <div style={{ marginTop: 12, fontSize: 14, opacity: 0.9, color: '#fff' }}>{showHit ? 'Fermata!' : 'La ruota sta girando...'}</div>
      </div>
    </div>
  );
}


