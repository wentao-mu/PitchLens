import type { ComparisonMetric, RankedPossession } from "../types";
import { MiniPitch } from "./MiniPitch";

type ComparisonBoardProps = {
  comparisonMetric: ComparisonMetric;
  comparisonText: string;
  leftLabel: string;
  rightLabel: string;
  leftItems: RankedPossession[];
  rightItems: RankedPossession[];
};

const METRIC_META: Record<
  ComparisonMetric,
  { label: string; formatter: (value: number) => string }
> = {
  xThreat: {
    label: "Average xT",
    formatter: (value) => value.toFixed(2),
  },
  progression: {
    label: "Average progression",
    formatter: (value) => `${Math.round(value)}`,
  },
  pressure: {
    label: "Average pressure",
    formatter: (value) => `${Math.round(value)}`,
  },
  actionValue: {
    label: "Average action value",
    formatter: (value) => `${Math.round(value)}`,
  },
};

const averageMetric = (items: RankedPossession[], metric: ComparisonMetric) =>
  items.length
    ? items.reduce((sum, item) => sum + item[metric], 0) / items.length
    : 0;

function ComparisonLane({
  label,
  items,
  accent,
}: {
  label: string;
  items: RankedPossession[];
  accent: "amber" | "green";
}) {
  return (
    <div className="comparison-lane">
      <div className="comparison-header">
        <span>{label}</span>
        <span>{items.length} matched clips</span>
      </div>
      {items.length === 0 ? (
        <div className="comparison-empty">No matched possessions in this lane.</div>
      ) : (
        items.map((item) => (
          <article key={item.id} className="comparison-item">
            <MiniPitch possession={item} accent={accent} />
            <div>
              <h4>{item.title}</h4>
              <p>
                {item.minute}' | {item.phase} | xT {item.xThreat.toFixed(2)} | AV{" "}
                {item.actionValue}
              </p>
              <p>{item.note}</p>
            </div>
          </article>
        ))
      )}
    </div>
  );
}

export function ComparisonBoard({
  comparisonMetric,
  comparisonText,
  leftLabel,
  rightLabel,
  leftItems,
  rightItems,
}: ComparisonBoardProps) {
  const metricMeta = METRIC_META[comparisonMetric];
  const leftValue = averageMetric(leftItems, comparisonMetric);
  const rightValue = averageMetric(rightItems, comparisonMetric);
  const maxValue = Math.max(leftValue, rightValue, 1);
  const delta = leftValue - rightValue;

  return (
    <section className="panel comparison-panel">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">V4 / fair comparison</p>
          <h2>Matched comparison workspace</h2>
        </div>
        <p className="panel-copy">{comparisonText}</p>
      </div>

      <div className="comparison-metric-strip">
        <article className="comparison-metric-card">
          <span>{leftLabel}</span>
          <strong>{metricMeta.formatter(leftValue)}</strong>
          <div className="comparison-metric-bar">
            <i style={{ width: `${(leftValue / maxValue) * 100}%` }} />
          </div>
        </article>
        <article className="comparison-metric-card comparison-metric-card--center">
          <span>{metricMeta.label}</span>
          <strong>
            {delta === 0
              ? "Level"
              : `${delta > 0 ? "+" : ""}${metricMeta.formatter(delta)}`}
          </strong>
          <small>
            {delta >= 0 ? leftLabel : rightLabel} lead on the selected metric
          </small>
        </article>
        <article className="comparison-metric-card comparison-metric-card--alt">
          <span>{rightLabel}</span>
          <strong>{metricMeta.formatter(rightValue)}</strong>
          <div className="comparison-metric-bar">
            <i style={{ width: `${(rightValue / maxValue) * 100}%` }} />
          </div>
        </article>
      </div>

      <div className="comparison-grid">
        <ComparisonLane label={leftLabel} items={leftItems} accent="amber" />
        <ComparisonLane label={rightLabel} items={rightItems} accent="green" />
      </div>
    </section>
  );
}
