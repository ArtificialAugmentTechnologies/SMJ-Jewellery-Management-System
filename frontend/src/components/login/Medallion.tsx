import { useId } from 'react';

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

/** Coin reverse: silver face with an engraved rim inscription and SMJ monogram. */
function CoinBack({ inscription }: { inscription: string }) {
  const id = `coin-ring-${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  return (
    <svg viewBox="0 0 200 200" className="h-full w-full" aria-hidden>
      <defs>
        <path id={id} d="M100 100 m-74 0 a74 74 0 1 1 148 0 a74 74 0 1 1 -148 0" />
      </defs>
      <circle cx={100} cy={100} r={62} fill="none" stroke="#7b8494" strokeWidth={1} opacity={0.6} />
      <text fontSize={9} fontWeight={600} letterSpacing={2} fill="#5d6675" style={{ textTransform: 'uppercase' }}>
        <textPath href={`#${id}`} startOffset="0">
          {inscription}
        </textPath>
      </text>
      <path d="M100 58 L91 66 L100 78 L109 66 Z M91 66 H109" fill="none" stroke="#5d6675" strokeWidth={1.5} strokeLinejoin="round" />
      <text x={100} y={122} textAnchor="middle" fontSize={40} fontWeight={700} fill="#4a5261" style={{ fontFamily: 'var(--font-display)' }}>
        SMJ
      </text>
      <path d="M72 134 H128" stroke="#7b8494" strokeWidth={1} />
    </svg>
  );
}

/** Logo as a minted coin with a reeded edge that periodically flips to its silver reverse. */
export function Medallion({ inscription, className }: { inscription: string; className?: string }) {
  return (
    <div className={`relative ${className ?? ''}`} aria-hidden>
      <Guilloche className="login-rosette absolute -inset-[28%] text-white/25" />
      <div className="absolute inset-0 [perspective:900px]">
        <div className="login-coin relative h-full w-full [transform-style:preserve-3d]">
          {/* Front: gold reeded rim + logo */}
          <div className="coin-face coin-front absolute inset-0 rounded-full p-[5%] shadow-2xl shadow-black/40">
            <div className="relative h-full w-full overflow-hidden rounded-full ring-2 ring-[#f3dc9a]/70">
              <img src="/logo-mark.png" alt="" className="h-full w-full scale-[1.12] object-cover" />
              <span className="coin-glint absolute inset-0" />
            </div>
          </div>
          {/* Back: silver face */}
          <div className="coin-face coin-back absolute inset-0 rounded-full p-[5%] shadow-2xl shadow-black/40">
            <div className="coin-silver relative h-full w-full overflow-hidden rounded-full">
              <CoinBack inscription={inscription} />
              <span className="coin-glint absolute inset-0" />
            </div>
          </div>
        </div>
      </div>
      <div className="login-coin-shadow absolute -bottom-[14%] left-1/2 h-[8%] w-[70%] -translate-x-1/2 rounded-[50%] bg-black/35 blur-md" />
    </div>
  );
}
