import type { Possession } from "../types";

type MiniPitchProps = {
  possession: Possession;
  accent?: "amber" | "green";
};

export function MiniPitch({
  possession,
  accent = "amber",
}: MiniPitchProps) {
  const path = possession.path
    .map((point) => `${point.x},${point.y}`)
    .join(" ");

  return (
    <svg
      className={`mini-pitch mini-pitch--${accent}`}
      viewBox="0 0 100 100"
      role="img"
      aria-label={`Pitch map for ${possession.title}`}
    >
      <rect x="2" y="8" width="96" height="84" rx="4" />
      <line x1="50" y1="8" x2="50" y2="92" />
      <circle cx="50" cy="50" r="9" />
      <circle cx="50" cy="50" r="1.4" />
      <rect x="2" y="31" width="16" height="38" rx="2" />
      <rect x="82" y="31" width="16" height="38" rx="2" />
      <polyline points={path} />
      {possession.path.map((point) => (
        <g key={`${possession.id}-${point.label}-${point.x}-${point.y}`}>
          <circle cx={point.x} cy={point.y} r="2.7" />
          <text x={point.x + 3.2} y={point.y - 3.2}>
            {point.label}
          </text>
        </g>
      ))}
    </svg>
  );
}
