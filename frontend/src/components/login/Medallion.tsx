import { useEffect, useId, useRef, useState } from 'react';

/**
 * Guilloché rosette (the engraved wave pattern used on coins, watch dials and banknotes)
 * and the login "minted coin" medallion. Animations live in index.css under "Login page".
 */

/** Closed polar wave r(θ) = R + A·sin(kθ + phase), as an SVG path centred on 0,0. */
function wave(R: number, A: number, k: number, phase: number, steps = 720, digits = 2) {
  let d = '';
  for (let i = 0; i <= steps; i++) {
    const th = (i / steps) * Math.PI * 2;
    const r = R + A * Math.sin(k * th + phase);
    d += `${i ? 'L' : 'M'}${(r * Math.cos(th)).toFixed(digits)} ${(r * Math.sin(th)).toFixed(digits)}`;
  }
  return d + 'Z';
}

// Interlaced bands of waves (built once).
const ROSETTE = Array.from({ length: 14 }, (_, i) => wave(70 + i * 9, 7, 18, (i * Math.PI) / 7));
// Finer, denser engraving for full-page backgrounds.
const ROSETTE_DENSE = Array.from({ length: 30 }, (_, i) => wave(40 + i * 5.2, 3, 40, (i * Math.PI) / 5, 800, 1));

/** Engraved guilloché rosette. Colour comes from `currentColor`. */
export function Guilloche({ className, strokeWidth = 0.6, dense = false }: { className?: string; strokeWidth?: number; dense?: boolean }) {
  return (
    <svg viewBox="-200 -200 400 400" className={className} aria-hidden>
      {(dense ? ROSETTE_DENSE : ROSETTE).map((d, i) => (
        <path key={i} d={d} fill="none" stroke="currentColor" strokeWidth={strokeWidth} vectorEffect="non-scaling-stroke" />
      ))}
    </svg>
  );
}

type Side = 'logo' | 'gold' | 'silver';
/** Faces shown in turn, one per flip. */
const SEQUENCE: Side[] = ['logo', 'gold', 'silver'];
const FLIP_EVERY_MS = 3200;

const ENGRAVING = {
  gold: { inscription: 'SMJ Jewellery · Gold · SMJ Jewellery · Gold ·', ring: '#a8792a', text: '#8a5f1c', mono: '#6f4a12' },
  silver: { inscription: 'SMJ Jewellery · Silver · SMJ Jewellery · Silver ·', ring: '#7b8494', text: '#5d6675', mono: '#4a5261' },
};

/** Engraved metal face: rim inscription, diamond and SMJ monogram. */
function CoinEngraving({ metal }: { metal: 'gold' | 'silver' }) {
  const id = `coin-ring-${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  const e = ENGRAVING[metal];
  // Spread the inscription evenly around the 74-unit ring (≈465 units; ~5.4 units per 9px capital).
  const spacing = 465 / e.inscription.length - 5.4;
  return (
    <svg viewBox="0 0 200 200" className="h-full w-full" aria-hidden>
      <defs>
        <path id={id} d="M100 100 m-74 0 a74 74 0 1 1 148 0 a74 74 0 1 1 -148 0" />
      </defs>
      <circle cx={100} cy={100} r={62} fill="none" stroke={e.ring} strokeWidth={1} opacity={0.6} />
      <text fontSize={9} fontWeight={600} letterSpacing={spacing} fill={e.text} style={{ textTransform: 'uppercase' }}>
        <textPath href={`#${id}`} startOffset="0">
          {e.inscription}
        </textPath>
      </text>
      <path d="M100 58 L91 66 L100 78 L109 66 Z M91 66 H109" fill="none" stroke={e.text} strokeWidth={1.5} strokeLinejoin="round" />
      <text x={100} y={122} textAnchor="middle" fontSize={40} fontWeight={700} fill={e.mono} style={{ fontFamily: 'var(--font-display)' }}>
        SMJ
      </text>
      <path d="M72 134 H128" stroke={e.ring} strokeWidth={1} />
    </svg>
  );
}

function CoinFace({ side, back = false }: { side: Side; back?: boolean }) {
  return (
    <div
      className={`coin-face ${side === 'silver' ? 'coin-rim-silver' : 'coin-rim-gold'} absolute inset-0 rounded-full p-[5%] shadow-2xl shadow-black/40`}
      style={back ? { transform: 'rotateY(180deg)' } : undefined}
    >
      {side === 'logo' ? (
        <div className="relative h-full w-full overflow-hidden rounded-full ring-2 ring-[#f3dc9a]/70">
          <img src="/logo-mark.png" alt="" className="h-full w-full scale-[1.12] object-cover" />
          <span className="coin-glint absolute inset-0" />
        </div>
      ) : (
        <div className={`${side === 'gold' ? 'coin-gold' : 'coin-silver'} relative h-full w-full overflow-hidden rounded-full`}>
          <CoinEngraving metal={side} />
          <span className="coin-glint absolute inset-0" />
        </div>
      )}
    </div>
  );
}

/**
 * Logo as a minted coin with a reeded edge. Every few seconds it flips, cycling
 * logo → gold → silver. A coin has two faces, so the face turned away from the
 * viewer is swapped to the next design just as the flip starts.
 */
export function Medallion({ className }: { className?: string }) {
  const stepRef = useRef(0);
  const [step, setStep] = useState(0);
  const [front, setFront] = useState<Side>(SEQUENCE[0]);
  const [back, setBack] = useState<Side>(SEQUENCE[1]);

  useEffect(() => {
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    const id = window.setInterval(() => {
      const next = ++stepRef.current;
      // The face that will be showing after this flip is currently hidden: give it the next design.
      if (next % 2 === 0) setFront(SEQUENCE[next % SEQUENCE.length]);
      else setBack(SEQUENCE[next % SEQUENCE.length]);
      setStep(next);
    }, FLIP_EVERY_MS);
    return () => window.clearInterval(id);
  }, []);

  // Alternate between two identical animations so each flip restarts the lift (no lift before the first flip).
  const lift = step === 0 ? '' : step % 2 ? 'coin-lift-a' : 'coin-lift-b';
  const shadow = step === 0 ? '' : step % 2 ? 'coin-shadow-a' : 'coin-shadow-b';

  return (
    <div className={`relative ${className ?? ''}`} aria-hidden>
      <Guilloche className="login-rosette absolute -inset-[28%] text-white/25" />
      <div className={`absolute inset-0 [perspective:900px] ${lift}`}>
        <div
          className="relative h-full w-full transition-transform duration-[1100ms] ease-[cubic-bezier(0.65,0,0.35,1)] [transform-style:preserve-3d]"
          style={{ transform: `rotateY(${step * 180}deg)` }}
        >
          <CoinFace side={front} />
          <CoinFace side={back} back />
        </div>
      </div>
      <div className={`absolute ${shadow} -bottom-[14%] left-1/2 h-[8%] w-[70%] -translate-x-1/2 rounded-[50%] bg-black/35 blur-md`} />
    </div>
  );
}
