import { useState } from "react";
import type { Possession, PitchPoint } from "../types";
import type { Language } from "../lib/i18n";

type MiniPitchProps = {
  possession: Possession;
  accent?: "amber" | "green";
  language?: Language;
};

const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(value, max));

// x = pitch depth (0=own goal, 100=opponent goal), y = pitch width (0=left, 100=right)
const toSvg = (point: PitchPoint) => ({
  svgX: point.y,
  svgY: 150 - point.x * 1.5,
});

const paletteByAccent = (accent: "amber" | "green") =>
  accent === "green"
    ? {
        line: "#1B8F6B",
        node: "#1B8F6B",
        active: "#0F6A4D",
        fill: "rgba(27, 143, 107, 0.12)",
      }
    : {
        line: "#C67A1A",
        node: "#C67A1A",
        active: "#9E5C0F",
        fill: "rgba(198, 122, 26, 0.12)",
      };

const pointName = (point: PitchPoint, language: Language) =>
  point.playerName ||
  point.label ||
  (language === "zh" ? "未命名球员" : "Unnamed player");

const pointTag = (point: PitchPoint, language: Language) => {
  const name = pointName(point, language).trim();
  const parts = name.split(/\s+/).filter(Boolean);
  const candidate = parts.length > 1 ? parts[parts.length - 1] : parts[0] || name;
  return candidate.length > 12 ? `${candidate.slice(0, 11)}…` : candidate;
};

export function MiniPitch({
  possession,
  accent = "amber",
  language = "zh",
}: MiniPitchProps) {
  const [activeStep, setActiveStep] = useState(0);
  const [hoveredStep, setHoveredStep] = useState<number | null>(null);

  const path = possession.path.length
    ? possession.path
    : [{ x: 12, y: 50, label: "EV", playerName: language === "zh" ? "事件" : "Event" }];

  const palette = paletteByAccent(accent);
  const focusIndex = hoveredStep ?? activeStep;
  const focusPoint = path[focusIndex] ?? path[0];
  const focusEvent = possession.events[focusIndex] ?? possession.events[possession.events.length - 1];
  const focusCoords = toSvg(focusPoint);
  const focusName = pointName(focusPoint, language);
  const bubbleWidth = clamp(focusName.length * 2.8 + 14, 22, 56);
  const bubbleX = clamp(focusCoords.svgX - bubbleWidth / 2, 4, 96 - bubbleWidth);
  const bubbleY = clamp(focusCoords.svgY - 14, 6, 136);
  const defensiveFrame = (focusEvent?.freezeFrame ?? []).filter((item) => !item.teammate);

  return (
    <div className="pitch-panel">
      <svg
        viewBox="0 0 100 150"
        className="pitch-svg"
        aria-label={`Tactical map: ${possession.title}`}
      >
        <defs>
          <pattern
            id={`pitch-grid-${possession.id}`}
            width="100"
            height="18"
            patternUnits="userSpaceOnUse"
          >
            <rect width="100" height="9" fill="#EEF4EA" />
            <rect y="9" width="100" height="9" fill="#E7EFE3" />
          </pattern>
        </defs>

        <rect x="0" y="0" width="100" height="150" fill={`url(#pitch-grid-${possession.id})`} />
        <rect x="2" y="2" width="96" height="146" rx="2" fill="none" stroke="#B7C5B4" strokeWidth="0.8" />
        <line x1="2" y1="75" x2="98" y2="75" stroke="#B7C5B4" strokeWidth="0.8" />
        <circle cx="50" cy="75" r="12" fill="none" stroke="#B7C5B4" strokeWidth="0.8" />
        <circle cx="50" cy="75" r="0.9" fill="#B7C5B4" />
        <rect x="22" y="2" width="56" height="22" fill="none" stroke="#B7C5B4" strokeWidth="0.8" />
        <rect x="36" y="2" width="28" height="8" fill="none" stroke="#B7C5B4" strokeWidth="0.8" />
        <path d="M 36 24 A 12 12 0 0 0 64 24" fill="none" stroke="#B7C5B4" strokeWidth="0.8" />
        <circle cx="50" cy="14" r="0.9" fill="#B7C5B4" />
        <rect x="22" y="126" width="56" height="22" fill="none" stroke="#B7C5B4" strokeWidth="0.8" />
        <rect x="36" y="140" width="28" height="8" fill="none" stroke="#B7C5B4" strokeWidth="0.8" />
        <path d="M 36 126 A 12 12 0 0 1 64 126" fill="none" stroke="#B7C5B4" strokeWidth="0.8" />
        <circle cx="50" cy="134" r="0.9" fill="#B7C5B4" />

        <polyline
          points={path.map((point) => {
            const coords = toSvg(point);
            return `${coords.svgX},${coords.svgY}`;
          }).join(" ")}
          fill="none"
          stroke={palette.line}
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
          opacity="0.95"
        />

        {defensiveFrame.map((defender, index) => {
          const coords = toSvg({ x: defender.x, y: defender.y, label: `${index}` });
          return (
            <g key={`${possession.id}-def-${focusIndex}-${index}`} pointerEvents="none">
              <circle
                cx={coords.svgX}
                cy={coords.svgY}
                r={defender.keeper ? 2.3 : 2}
                fill="#F7FAFF"
                stroke={defender.keeper ? "#1E4F99" : "rgba(43, 92, 184, 0.78)"}
                strokeWidth={defender.keeper ? 1.1 : 0.8}
              />
            </g>
          );
        })}

        {path.map((point, index) => {
          const coords = toSvg(point);
          const isFocus = index === focusIndex;
          const isStart = index === 0;
          const isEnd = index === path.length - 1;
          const nameTag = pointTag(point, language);
          const labelDx = coords.svgX >= 72 ? -3.4 : 3.4;
          const labelAnchor = coords.svgX >= 72 ? "end" : "start";
          const labelY = coords.svgY + (index % 2 === 0 ? -3.2 : 4.8);
          return (
            <g
              key={`${possession.id}-point-${index}`}
              onMouseEnter={() => setHoveredStep(index)}
              onMouseLeave={() => setHoveredStep(null)}
              onClick={() => setActiveStep(index)}
              style={{ cursor: "pointer" }}
            >
              {isFocus ? (
                <circle
                  cx={coords.svgX}
                  cy={coords.svgY}
                  r="4.8"
                  fill={palette.fill}
                  stroke={palette.line}
                  strokeWidth="0.6"
                />
              ) : null}
              <circle
                cx={coords.svgX}
                cy={coords.svgY}
                r={isStart || isEnd ? 2.7 : 2.2}
                fill={isFocus ? palette.active : palette.node}
                stroke="#FFFFFF"
                strokeWidth={isFocus ? 0.9 : 0.7}
              />
              {(isStart || isEnd) && !isFocus ? (
                <circle
                  cx={coords.svgX}
                  cy={coords.svgY}
                  r="4.1"
                  fill="none"
                  stroke={palette.node}
                  strokeWidth="0.5"
                  opacity="0.45"
                />
              ) : null}
              <text
                x={coords.svgX + labelDx}
                y={labelY}
                textAnchor={labelAnchor}
                className={isFocus ? "pitch-node-label pitch-node-label--active" : "pitch-node-label"}
              >
                {nameTag}
              </text>
            </g>
          );
        })}

        <g pointerEvents="none">
          <rect
            x={bubbleX}
            y={bubbleY}
            width={bubbleWidth}
            height="9.5"
            rx="2.5"
            fill="rgba(18, 19, 23, 0.84)"
          />
          <text
            x={bubbleX + bubbleWidth / 2}
            y={bubbleY + 6.3}
            textAnchor="middle"
            fontSize="3.2"
            fill="#FFFFFF"
            fontWeight="600"
          >
            {focusName}
          </text>
        </g>
      </svg>

      <div className="pitch-scrubber">
        {path.map((point, index) => (
          <button
            key={`${possession.id}-step-${index}`}
            type="button"
            className={`pitch-step ${focusIndex === index ? "pitch-step--active" : ""}`}
            onMouseEnter={() => setHoveredStep(index)}
            onMouseLeave={() => setHoveredStep(null)}
            onClick={() => setActiveStep(index)}
            title={`${language === "zh" ? "步骤" : "Step"} ${index + 1}: ${pointName(point, language)}`}
          >
            <span>{index + 1}</span>
            <small>{pointTag(point, language)}</small>
          </button>
        ))}
      </div>

      <div className="pitch-tooltip">
        <strong>{focusName}</strong>
        <span>
          {language === "zh" ? `步骤 ${focusIndex + 1}` : `Step ${focusIndex + 1}`}
        </span>
        {focusEvent ? (
          <span>{focusEvent.type}</span>
        ) : null}
        <small>
          {language === "zh" ? "坐标" : "Coords"} {Math.round(focusPoint.x)}, {Math.round(focusPoint.y)}
        </small>
      </div>
    </div>
  );
}
