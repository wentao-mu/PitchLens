import { TACTICAL_SIGNALS } from "../data/sampleData";
import type {
  ContextFilters,
  MinuteRange,
  Possession,
  RankedPossession,
  SignalSummary,
  TacticalSignal,
  TimeWindow,
} from "../types";

export const timeWindowToRange = (timeWindow: TimeWindow): MinuteRange => {
  if (timeWindow === "0-30") {
    return [0, 30];
  }
  if (timeWindow === "31-60") {
    return [31, 60];
  }
  if (timeWindow === "61-90") {
    return [61, 90];
  }
  return [0, 90];
};

export const defaultFilters: ContextFilters = {
  opponent: "All opponents",
  gameState: "All states",
  phase: "All phases",
  zone: "All zones",
  timeWindow: "All windows",
  minuteRange: [0, 90],
};

export const clampMinuteRange = ([start, end]: MinuteRange): MinuteRange => {
  const safeStart = Math.max(0, Math.min(start, 90));
  const safeEnd = Math.max(safeStart, Math.min(end, 90));
  return [safeStart, safeEnd];
};

export const buildMinuteRangeLabel = ([start, end]: MinuteRange) =>
  start === 0 && end === 90 ? "0-90" : `${start}-${end}`;

const inMinuteRange = (minute: number, minuteRange: MinuteRange) =>
  minute >= minuteRange[0] && minute <= minuteRange[1];

export const filterPossessions = (
  possessions: Possession[],
  filters: ContextFilters,
  includeOpponent = true,
) =>
  possessions.filter((possession) => {
    if (includeOpponent && filters.opponent !== "All opponents") {
      if (possession.opponent !== filters.opponent) {
        return false;
      }
    }

    if (
      filters.gameState !== "All states" &&
      possession.gameState !== filters.gameState
    ) {
      return false;
    }

    if (filters.phase !== "All phases" && possession.phase !== filters.phase) {
      return false;
    }

    if (filters.zone !== "All zones" && possession.zone !== filters.zone) {
      return false;
    }

    return inMinuteRange(possession.minute, filters.minuteRange);
  });

export const buildSignalSummaries = (possessions: Possession[]): SignalSummary[] =>
  TACTICAL_SIGNALS.map((signal) => {
    const relevant = possessions.filter(
      (possession) => possession.signalScores[signal] >= 0.55,
    );
    const count = relevant.length;
    const averageThreat = count
      ? relevant.reduce((sum, possession) => sum + possession.xThreat, 0) / count
      : 0;
    const averageActionValue = count
      ? relevant.reduce((sum, possession) => sum + possession.actionValue, 0) /
        count
      : 0;

    return {
      signal,
      count,
      averageThreat,
      averageActionValue,
    };
  }).sort((left, right) => {
    if (right.count !== left.count) {
      return right.count - left.count;
    }

    return right.averageThreat - left.averageThreat;
  });

const normalized = (value: number, max: number) => value / max;

const similarityPenalty = (candidate: Possession, selected: RankedPossession[]) => {
  if (!selected.length) {
    return 0;
  }

  const penalties = selected.map((existing) => {
    let penalty = 0;

    if (existing.opponent === candidate.opponent) {
      penalty += 0.12;
    }

    if (existing.zone === candidate.zone) {
      penalty += 0.08;
    }

    if (existing.phase === candidate.phase) {
      penalty += 0.06;
    }

    if (existing.formation === candidate.formation) {
      penalty += 0.04;
    }

    return penalty;
  });

  return Math.min(0.3, Math.max(...penalties));
};

const buildContextScore = (candidate: Possession, filters: ContextFilters) => {
  let score = 0.45;

  if (filters.gameState === "All states" || filters.gameState === candidate.gameState) {
    score += 0.2;
  }

  if (filters.phase === "All phases" || filters.phase === candidate.phase) {
    score += 0.15;
  }

  if (filters.zone === "All zones" || filters.zone === candidate.zone) {
    score += 0.15;
  }

  if (inMinuteRange(candidate.minute, filters.minuteRange)) {
    score += 0.05;
  }

  return Math.min(1, score);
};

export const rankRepresentativePossessions = (
  possessions: Possession[],
  filters: ContextFilters,
  activeSignal: TacticalSignal,
) => {
  const candidates = filterPossessions(possessions, filters).filter(
    (possession) => possession.signalScores[activeSignal] >= 0.4,
  );

  const selected: RankedPossession[] = [];

  while (selected.length < 5 && selected.length < candidates.length) {
    let best: RankedPossession | null = null;

    candidates.forEach((candidate) => {
      if (selected.some((item) => item.id === candidate.id)) {
        return;
      }

      const signal = candidate.signalScores[activeSignal];
      const context = buildContextScore(candidate, filters);
      const impact = normalized(candidate.actionValue + candidate.progression, 200);
      const penalty = similarityPenalty(candidate, selected);
      const diversity = Math.max(0, 1 - penalty);
      const total = 0.48 * signal + 0.24 * context + 0.16 * impact + 0.12 * diversity;

      const ranked: RankedPossession = {
        ...candidate,
        ranking: {
          total,
          signal,
          context,
          diversity,
        },
      };

      if (!best || ranked.ranking.total > best.ranking.total) {
        best = ranked;
      }
    });

    if (!best) {
      break;
    }

    selected.push(best);
  }

  return selected;
};

export const buildComparisonSet = (
  possessions: Possession[],
  activeSignal: TacticalSignal,
  filters: ContextFilters,
  opponent: string,
) =>
  rankRepresentativePossessions(
    possessions,
    {
      ...filters,
      opponent,
    },
    activeSignal,
  ).slice(0, 3);

export const summarizeComparison = (
  left: RankedPossession[],
  right: RankedPossession[],
  leftOpponent: string,
  rightOpponent: string,
) => {
  if (!left.length || !right.length) {
    return `Not enough matched evidence to compare ${leftOpponent} and ${rightOpponent} under the current context lock.`;
  }

  const avgThreat = (items: RankedPossession[]) =>
    items.reduce((sum, item) => sum + item.xThreat, 0) / items.length;
  const avgPressure = (items: RankedPossession[]) =>
    items.reduce((sum, item) => sum + item.pressure, 0) / items.length;
  const avgProgression = (items: RankedPossession[]) =>
    items.reduce((sum, item) => sum + item.progression, 0) / items.length;

  const leftThreat = avgThreat(left);
  const rightThreat = avgThreat(right);
  const leftProgression = avgProgression(left);
  const rightProgression = avgProgression(right);
  const leftPressure = avgPressure(left);
  const rightPressure = avgPressure(right);

  const threatLeader = leftThreat >= rightThreat ? leftOpponent : rightOpponent;
  const progressionLeader =
    leftProgression >= rightProgression ? leftOpponent : rightOpponent;
  const pressureLeader = leftPressure >= rightPressure ? leftOpponent : rightOpponent;

  return `${threatLeader} allows the more dangerous version of the pattern, ${progressionLeader} concedes more direct field gain, and ${pressureLeader} forces the heavier pressure load on the ball.`;
};

export const buildExportNote = ({
  filters,
  activeSignal,
  ranked,
  leftOpponent,
  rightOpponent,
  comparisonText,
}: {
  filters: ContextFilters;
  activeSignal: TacticalSignal;
  ranked: RankedPossession[];
  leftOpponent: string;
  rightOpponent: string;
  comparisonText: string;
}) => {
  const filtersText = [
    `Opponent scope: ${filters.opponent}`,
    `Game state: ${filters.gameState}`,
    `Phase: ${filters.phase}`,
    `Zone: ${filters.zone}`,
    `Minute range: ${buildMinuteRangeLabel(filters.minuteRange)}`,
  ].join(" | ");

  const evidenceBlock =
    ranked.length === 0
      ? "- No representative possessions match the current filters."
      : ranked
          .slice(0, 3)
          .map(
            (possession, index) =>
              `- Evidence ${index + 1}: ${possession.matchLabel}, ${possession.minute}' - ${possession.title}. xT ${possession.xThreat.toFixed(
                2,
              )}, AV ${possession.actionValue}, outcome: ${possession.outcome}. Why selected: ${possession.whyItMatters}${
                possession.videoClipUrl ? ` Clip: ${possession.videoClipUrl}` : ""
              }`,
          )
          .join("\n");

  return `# PitchLens tactical note

## Active signal
${activeSignal}

## Context lock
${filtersText}

## Representative possessions
${evidenceBlock}

## Fair comparison
Locked comparison: ${leftOpponent} vs ${rightOpponent}
${comparisonText}

## Recommendation
Keep using ${activeSignal.toLowerCase()} as the organizing principle, but anchor coaching feedback in the representative possessions above so the claim remains replayable and opponent-specific.
`;
};

export const getFormationTendencies = (possessions: Possession[]) => {
  const counts = new Map<string, number>();

  possessions.forEach((possession) => {
    counts.set(possession.formation, (counts.get(possession.formation) ?? 0) + 1);
  });

  return Array.from(counts.entries())
    .map(([formation, count]) => ({ formation, count }))
    .sort((left, right) => right.count - left.count)
    .slice(0, 4);
};

export const getActionValueBuckets = (possessions: Possession[]) => {
  const buckets = {
    high: 0,
    medium: 0,
    low: 0,
  };

  possessions.forEach((possession) => {
    if (possession.actionValue >= 80) {
      buckets.high += 1;
    } else if (possession.actionValue >= 70) {
      buckets.medium += 1;
    } else {
      buckets.low += 1;
    }
  });

  return buckets;
};
