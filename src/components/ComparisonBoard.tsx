import type {
  ComparisonMetric,
  ComparisonResult,
  RankedPossession,
} from "../types";
import { comparisonMetricLabel, phaseLabel, type Language } from "../lib/i18n";
import { MiniPitch } from "./MiniPitch";

type ComparisonBoardProps = {
  comparisonMetric: ComparisonMetric;
  comparisonResult: ComparisonResult;
  leftLabel: string;
  rightLabel: string;
  leftItems: RankedPossession[];
  rightItems: RankedPossession[];
  language: Language;
};

const metricFormatter = (metric: ComparisonMetric, value: number) =>
  metric === "xThreat" ? value.toFixed(2) : `${Math.round(value)}`;

const deltaFormatter = (
  format: ComparisonResult["deltas"][number]["format"],
  value: number,
) => {
  if (format === "percent") {
    return `${Math.round(value * 100)}%`;
  }
  return `${value > 0 ? "+" : ""}${value.toFixed(1)}`;
};

const averageMetric = (items: RankedPossession[], metric: ComparisonMetric) =>
  items.length
    ? items.reduce((sum, item) => sum + item[metric], 0) / items.length
    : 0;

function ComparisonLane({
  label,
  items,
  accent,
  language,
}: {
  label: string;
  items: RankedPossession[];
  accent: "amber" | "green";
  language: Language;
}) {
  return (
    <div className="comparison-lane">
      <div className="comparison-header">
        <span>{label}</span>
        <span>
          {items.length} {language === "zh" ? "个匹配回合" : "matched possessions"}
        </span>
      </div>
      {items.length === 0 ? (
        <div className="comparison-empty">
          {language === "zh"
            ? "当前对比组没有匹配回合。"
            : "No matching possessions for this lane."}
        </div>
      ) : (
        items.map((item) => (
          <article key={item.id} className="comparison-item">
            <MiniPitch possession={item} accent={accent} language={language} />
            <div>
              <h4>{item.title}</h4>
              <p>
                {item.minute}' | {phaseLabel(item.phase, language)} | xT{" "}
                {item.xThreat.toFixed(2)} | AV {item.actionValue}
              </p>
              <p>{item.retrievalReasons.map((reason) => reason.label).join(" · ")}</p>
            </div>
          </article>
        ))
      )}
    </div>
  );
}

export function ComparisonBoard({
  comparisonMetric,
  comparisonResult,
  leftLabel,
  rightLabel,
  leftItems,
  rightItems,
  language,
}: ComparisonBoardProps) {
  const metricLabel = comparisonMetricLabel(comparisonMetric, language);
  const leftValue = averageMetric(leftItems, comparisonMetric);
  const rightValue = averageMetric(rightItems, comparisonMetric);
  const maxValue = Math.max(leftValue, rightValue, 1);
  const delta = leftValue - rightValue;

  return (
    <section className="panel comparison-panel">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">
            {language === "zh" ? "V4 / 公平对比" : "V4 / Fair comparison"}
          </p>
          <h2>
            {language === "zh"
              ? "匹配对比工作台"
              : "Matched comparison workspace"}
          </h2>
        </div>
      </div>

      <div className="comparison-metric-strip">
        <article className="comparison-metric-card">
          <span>{leftLabel}</span>
          <strong>{metricFormatter(comparisonMetric, leftValue)}</strong>
          <div className="comparison-metric-bar">
            <i style={{ width: `${(leftValue / maxValue) * 100}%` }} />
          </div>
        </article>
        <article className="comparison-metric-card comparison-metric-card--center">
          <span>{metricLabel}</span>
          <strong>
            {delta === 0
              ? language === "zh"
                ? "持平"
                : "Level"
              : `${delta > 0 ? "+" : ""}${metricFormatter(comparisonMetric, delta)}`}
          </strong>
        </article>
        <article className="comparison-metric-card comparison-metric-card--alt">
          <span>{rightLabel}</span>
          <strong>{metricFormatter(comparisonMetric, rightValue)}</strong>
          <div className="comparison-metric-bar">
            <i style={{ width: `${(rightValue / maxValue) * 100}%` }} />
          </div>
        </article>
      </div>

      <div className="comparison-delta-grid">
        {comparisonResult.deltas.map((item) => (
          <article key={item.key} className="comparison-delta-card">
            <span>{item.label}</span>
            <strong>{deltaFormatter(item.format, item.delta)}</strong>
          </article>
        ))}
      </div>

      <div className="comparison-grid">
        <ComparisonLane
          label={leftLabel}
          items={leftItems}
          accent="amber"
          language={language}
        />
        <ComparisonLane
          label={rightLabel}
          items={rightItems}
          accent="green"
          language={language}
        />
      </div>
    </section>
  );
}
