import { useState } from "react";
import type { Possession, PitchPoint } from "../types";

type MiniPitchProps = {
  possession: Possession;
  accent?: "amber" | "green";
};

// Map possession coordinates (0-100 x/y) to vertical SVG viewBox (100 wide x 150 tall)
// x = pitch depth (0=own goal, 100=opponent goal), y = pitch width (0=left, 100=right)
const toSvg = (p: PitchPoint) => ({
  svgX: p.y,          // pitch width → SVG horizontal
  svgY: 150 - p.x * 1.5,  // pitch depth → SVG vertical (inverted, scaled)
});

const seedRand = (n: number) => ((Math.sin(n) * 10000) % 1 + 1) % 1;

// Generate procedural defenders spread around the action zone
const makeDefenders = (path: PitchPoint[], seed: number) => {
  const cx = path[Math.floor(path.length / 2)]?.x ?? 50;
  const cy = path[Math.floor(path.length / 2)]?.y ?? 50;
  return Array.from({ length: 6 }, (_, i) => {
    const angle = seedRand(seed + i * 17) * Math.PI * 2;
    const dist = 8 + seedRand(seed + i * 31) * 22;
    return {
      x: Math.min(95, Math.max(5, cx + Math.cos(angle) * dist)),
      y: Math.min(95, Math.max(5, cy + Math.sin(angle) * dist)),
      label: `D${i + 1}`,
    };
  });
};

export function MiniPitch({ possession }: MiniPitchProps) {
  const [hoveredStep, setHoveredStep] = useState<number | null>(null);
  const [hoveredDefender, setHoveredDefender] = useState<number | null>(null);

  const { path, minute, id } = possession;
  const defenders = makeDefenders(path, minute * 7 + path.length);

  // Vision cone from highlighted or first node
  const focusIdx = hoveredStep ?? 0;
  const focusPoint = path[focusIdx];
  const nextPoint = path[focusIdx + 1] ?? path[focusIdx];

  const origin = toSvg(focusPoint);
  const target = toSvg(nextPoint);

  const angle = Math.atan2(target.svgY - origin.svgY, target.svgX - origin.svgX);
  const spread = Math.PI / 5;
  const R = 300;

  const p1x = origin.svgX + Math.cos(angle - spread) * R;
  const p1y = origin.svgY + Math.sin(angle - spread) * R;
  const p2x = origin.svgX + Math.cos(angle + spread) * R;
  const p2y = origin.svgY + Math.sin(angle + spread) * R;

  const coneClipId = `cone-${id}-${focusIdx}`;
  const conePath = `M ${origin.svgX} ${origin.svgY} L ${p1x} ${p1y} L ${p2x} ${p2y} Z`;

  return (
    <div className="pitch-panel">
      {/* SVG Pitch */}
      <svg
        viewBox="0 0 100 150"
        className="pitch-svg"
        aria-label={`Tactical map: ${possession.title}`}
      >
        <defs>
          <clipPath id={coneClipId}>
            <path d={conePath} />
          </clipPath>
          <radialGradient id={`glow-${id}`} cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#E92727" stopOpacity="0.8" />
            <stop offset="100%" stopColor="#E92727" stopOpacity="0" />
          </radialGradient>
          <filter id={`blur-${id}`}>
            <feGaussianBlur stdDeviation="0.8" />
          </filter>
        </defs>

        {/* Pitch background */}
        <rect x="0" y="0" width="100" height="150" fill="#6B7280" />

        {/* Vision cone (white) */}
        <path d={conePath} fill="white" opacity="0.9" />

        {/* Ripple rings clipped to cone */}
        {[10, 20, 30, 40, 55, 70, 90, 110, 130].map((r) => (
          <circle
            key={r}
            cx={origin.svgX}
            cy={origin.svgY}
            r={r}
            fill="none"
            stroke="rgba(200,200,200,0.5)"
            strokeWidth="1.5"
            clipPath={`url(#${coneClipId})`}
          />
        ))}

        {/* Pitch lines */}
        <g stroke="rgba(180,180,180,0.6)" strokeWidth="0.5" fill="none">
          <rect x="2" y="2" width="96" height="146" />
          <line x1="2" y1="75" x2="98" y2="75" />
          <circle cx="50" cy="75" r="12" />
          <circle cx="50" cy="75" r="0.8" fill="rgba(180,180,180,0.6)" />
          {/* Top box */}
          <rect x="22" y="2" width="56" height="22" />
          <rect x="36" y="2" width="28" height="8" />
          <path d="M 36 24 A 12 12 0 0 0 64 24" />
          <circle cx="50" cy="14" r="0.8" fill="rgba(180,180,180,0.6)" />
          {/* Bottom box */}
          <rect x="22" y="126" width="56" height="22" />
          <rect x="36" y="140" width="28" height="8" />
          <path d="M 36 126 A 12 12 0 0 1 64 126" />
          <circle cx="50" cy="134" r="0.8" fill="rgba(180,180,180,0.6)" />
        </g>

        {/* Defenders (blue) */}
        {defenders.map((def, i) => {
          const sv = toSvg(def);
          const isHovered = hoveredDefender === i;
          return (
            <g
              key={`def-${i}`}
              onMouseEnter={() => setHoveredDefender(i)}
              onMouseLeave={() => setHoveredDefender(null)}
              style={{ cursor: "pointer" }}
            >
              {isHovered && (
                <circle cx={sv.svgX} cy={sv.svgY} r="5" fill="rgba(20,65,230,0.2)" />
              )}
              <circle
                cx={sv.svgX}
                cy={sv.svgY}
                r={isHovered ? 2.2 : 1.6}
                fill={isHovered ? "#3B5FFF" : "#1441E6"}
                style={{ transition: "r 0.15s ease" }}
              />
              {isHovered && (
                <text
                  x={sv.svgX}
                  y={sv.svgY - 3.5}
                  textAnchor="middle"
                  fontSize="3.5"
                  fill="white"
                  fontWeight="600"
                >
                  DEF
                </text>
              )}
            </g>
          );
        })}

        {/* Pass sequence path (dashed line) */}
        <polyline
          points={path.map((p) => { const sv = toSvg(p); return `${sv.svgX},${sv.svgY}`; }).join(" ")}
          fill="none"
          stroke="rgba(255,255,255,0.35)"
          strokeWidth="0.8"
          strokeDasharray="1.5,1.5"
        />

        {/* Attacker nodes */}
        {path.map((point, i) => {
          const sv = toSvg(point);
          const isActive = i === (hoveredStep ?? 0);
          const isHovered = hoveredStep === i;
          return (
            <g
              key={`atk-${i}`}
              onMouseEnter={() => setHoveredStep(i)}
              onMouseLeave={() => setHoveredStep(null)}
              style={{ cursor: "pointer" }}
            >
              {/* Outer glow */}
              {isActive && (
                <circle cx={sv.svgX} cy={sv.svgY} r="6" fill={`url(#glow-${id})`} filter={`url(#blur-${id})`} />
              )}
              {/* Crosshair for active node */}
              {isActive && (
                <>
                  <rect x={sv.svgX - 3} y={sv.svgY - 3} width="6" height="6" fill="rgba(255,255,255,0.5)" rx="0.5" />
                  <rect x={sv.svgX - 2} y={sv.svgY - 2} width="4" height="4" fill="none" stroke="#E92727" strokeWidth="0.8" rx="0.3" />
                </>
              )}
              <circle
                cx={sv.svgX}
                cy={sv.svgY}
                r={isActive ? 2.2 : 1.4}
                fill={isActive ? "#FF4444" : "#E92727"}
                style={{ transition: "r 0.15s ease" }}
              />
              {/* Step number tooltip */}
              {isHovered && (
                <>
                  <rect x={sv.svgX - 7} y={sv.svgY - 9} width="14" height="6" fill="rgba(0,0,0,0.7)" rx="1" />
                  <text x={sv.svgX} y={sv.svgY - 5} textAnchor="middle" fontSize="3" fill="white" fontWeight="600">
                    {point.label} · {i + 1}/{path.length}
                  </text>
                </>
              )}
            </g>
          );
        })}
      </svg>

      {/* Step scrubber below the pitch */}
      <div className="pitch-scrubber">
        {path.map((point, i) => (
          <button
            key={`step-${i}`}
            className={`pitch-step ${hoveredStep === i ? "pitch-step--active" : ""}`}
            onMouseEnter={() => setHoveredStep(i)}
            onMouseLeave={() => setHoveredStep(null)}
            onClick={() => setHoveredStep(hoveredStep === i ? null : i)}
            title={`Step ${i + 1}: ${point.label}`}
          >
            <span>{i + 1}</span>
            <small>{point.label}</small>
          </button>
        ))}
      </div>

      {/* Hovered step details */}
      {hoveredStep !== null && (
        <div className="pitch-tooltip">
          <strong>Step {hoveredStep + 1} of {path.length}</strong>
          <span>{path[hoveredStep].label}</span>
          <small>Zone {Math.round(path[hoveredStep].x)}, {Math.round(path[hoveredStep].y)}</small>
        </div>
      )}
    </div>
  );
}
