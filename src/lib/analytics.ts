import {
  gameStateLabel,
  phaseLabel,
  signalLabel,
  zoneLabel,
  type Language,
} from "./i18n";
import type {
  ComparisonResult,
  ContextFilters,
  Event,
  MinuteRange,
  Possession,
  PossessionDescriptor,
  RankedPossession,
  RetrievalReason,
  RetrievalWeights,
  SignalSummary,
  StartZone,
  SummaryMetrics,
  TacticalNote,
  TacticalSignal,
  TimeWindow,
  ValueBand,
  Zone,
} from "../types";
import { START_ZONES, TACTICAL_SIGNALS, ZONES } from "../types";

const MIDLINE_X = 50;
const LANE_CUTOFF_LEFT = 54;
const LANE_CUTOFF_RIGHT = 26;

export const defaultFilters: ContextFilters = {
  opponent: "All opponents",
  gameState: "All states",
  phase: "All phases",
  startZone: "All start zones",
  zone: "All zones",
  timeWindow: "All windows",
  minuteRange: [0, 90],
};

export const defaultScenarioFilters: ContextFilters = {
  ...defaultFilters,
  gameState: "Drawing",
  phase: "Build-up",
  startZone: "Defensive third",
  timeWindow: "0-30",
  minuteRange: [0, 30],
};

export const defaultRetrievalWeights: RetrievalWeights = {
  alpha: 0.52,
  beta: 0.28,
  gamma: 0.2,
};

const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(value, max));

const average = (values: number[]) =>
  values.length
    ? values.reduce((sum, value) => sum + value, 0) / values.length
    : 0;

const shortLabel = (player: string) =>
  player
    .split(" ")
    .map((part) => part[0] ?? "")
    .join("")
    .slice(0, 3)
    .toUpperCase();

const laneFromY = (y: number): Zone => {
  if (y >= LANE_CUTOFF_LEFT) {
    return "Left lane";
  }
  if (y <= LANE_CUTOFF_RIGHT) {
    return "Right lane";
  }
  return "Central lane";
};

const startZoneFromX = (x: number): StartZone => {
  if (x < 33.34) {
    return "Defensive third";
  }
  if (x < 66.67) {
    return "Middle third";
  }
  return "Attacking third";
};

const valueBand = (actionValue: number): ValueBand => {
  if (actionValue >= 75) {
    return "High";
  }
  if (actionValue >= 55) {
    return "Medium";
  }
  return "Low";
};

const eventTypeWeight = (event: Event) => {
  if (event.type === "Turnover") {
    return -4;
  }
  if (event.type === "Shot") {
    return 14;
  }
  if (event.type === "Pass") {
    return 3;
  }
  if (event.type === "Carry" || event.type === "Dribble") {
    return 4;
  }
  if (event.type === "Recovery") {
    return 5;
  }
  return 1;
};

const buildFallbackEventsFromPath = (possession: Possession): Event[] => {
  const path = possession.path.length
    ? possession.path
    : [
        { x: 12, y: 50, label: "EV" },
        { x: 36, y: 48, label: "EV" },
        { x: 58, y: 44, label: "EV" },
      ];

  return path.slice(0, Math.max(2, path.length)).map((point, index, list) => {
    const next = list[index + 1] ?? point;
    return {
      id: `${possession.id}-fallback-${index}`,
      possessionId: possession.id,
      team: possession.team,
      opponent: possession.opponent,
      minute: possession.minute,
      second: index * 4,
      type: index === list.length - 1 ? "Carry" : "Pass",
      player: point.label || `EV${index + 1}`,
      startX: point.x,
      startY: point.y,
      endX: next.x,
      endY: next.y,
      outcome: index === list.length - 1 ? possession.outcome : "Completed",
    };
  });
};

export const derivePossessionDescriptor = (
  possession: Pick<
    Possession,
    | "minute"
    | "events"
    | "path"
    | "passes"
    | "progression"
    | "actionValue"
    | "zone"
    | "startZone"
  >,
): PossessionDescriptor => {
  const events =
    possession.events.length > 0
      ? possession.events
      : buildFallbackEventsFromPath(possession as Possession);
  const first = events[0];
  const maxX = Math.max(...events.map((event) => Math.max(event.startX, event.endX)));
  const avgY = average(
    events.flatMap((event) => [event.startY, event.endY]).filter(Number.isFinite),
  );
  const passEvents = events.filter((event) => event.type === "Pass");
  const turnoverBeforeMidline = events.some(
    (event) =>
      event.type === "Turnover" &&
      Math.max(event.startX, event.endX) < MIDLINE_X,
  );
  const passesBeforeMiddleThird =
    passEvents.findIndex((event) => Math.max(event.startX, event.endX) >= MIDLINE_X) +
    1;

  return {
    startZone: possession.startZone ?? startZoneFromX(first?.startX ?? 0),
    lane: possession.zone ?? laneFromY(Number.isFinite(avgY) ? avgY : 40),
    progressionDistance:
      possession.progression ?? clamp(maxX - (first?.startX ?? 0), 0, 100),
    passCount: possession.passes ?? passEvents.length,
    passesBeforeMiddleThird:
      passesBeforeMiddleThird > 0 ? passesBeforeMiddleThird : passEvents.length,
    turnoverBeforeMidline,
    successToMiddleThird: maxX >= MIDLINE_X,
    eventCount: events.length,
    actionValueBand: valueBand(possession.actionValue ?? 0),
    startMinute: possession.minute,
    endMinute: possession.minute + average(events.map((event) => event.second)) / 60,
  };
};

const buildPathFromEvents = (events: Event[]) => {
  if (!events.length) {
    return [];
  }

  const points = events.flatMap((event, index) => {
    const start = {
      x: clamp(event.startX, 0, 100),
      y: clamp(event.startY, 0, 100),
      label: shortLabel(event.player),
      playerName: event.player,
    };
    const end = {
      x: clamp(event.endX, 0, 100),
      y: clamp(event.endY, 0, 100),
      label: shortLabel(event.player),
      playerName: event.player,
    };
    return index === events.length - 1 ? [start, end] : [start];
  });

  return points.filter((point, index, list) => {
    if (index === 0) {
      return true;
    }
    const previous = list[index - 1];
    return point.x !== previous.x || point.y !== previous.y;
  });
};

const normalizeSignalScores = (
  candidate: Partial<Possession>,
): Record<TacticalSignal, number> => {
  const base = TACTICAL_SIGNALS.reduce<Record<TacticalSignal, number>>(
    (accumulator, signal) => {
      accumulator[signal] = 0.14;
      return accumulator;
    },
    {} as Record<TacticalSignal, number>,
  );

  if (candidate.signalScores) {
    TACTICAL_SIGNALS.forEach((signal) => {
      base[signal] = clamp(candidate.signalScores?.[signal] ?? base[signal], 0, 1);
    });
    return base;
  }

  if (candidate.primarySignal) {
    base[candidate.primarySignal] = 0.92;
  }

  candidate.secondarySignals?.forEach((signal, index) => {
    base[signal] = Math.max(0.5, 0.72 - index * 0.1);
  });

  return base;
};

const derivePressure = (events: Event[]) =>
  clamp(
    average(
      events.map((event) => (event.underPressure ? 85 : 45) + eventTypeWeight(event)),
    ),
    20,
    96,
  );

const deriveActionValue = (events: Event[], progression: number, xThreat: number) =>
  clamp(
    Math.round(
      progression * 0.6 +
        average(events.map((event) => eventTypeWeight(event))) * 3 +
        xThreat * 80,
    ),
    15,
    96,
  );

const deriveXThreat = (events: Event[], progression: number) =>
  clamp(
    average(
      events.map((event) => Math.max(event.endX - event.startX, 0) / 100),
    ) *
      0.65 +
      progression / 180,
    0.04,
    0.92,
  );

export const normalizePossessionRecord = (candidate: Partial<Possession>): Possession => {
  const id = candidate.id ?? `pos-${Math.random().toString(36).slice(2, 10)}`;
  const events =
    candidate.events && candidate.events.length > 0
      ? candidate.events.map((event, index) => ({
          ...event,
          id: event.id || `${id}-event-${index}`,
          possessionId: id,
        }))
      : buildFallbackEventsFromPath({
          ...(candidate as Possession),
          id,
          team: candidate.team ?? "Unknown team",
          title: candidate.title ?? "Possession",
          matchId: candidate.matchId ?? "unknown-match",
          matchLabel: candidate.matchLabel ?? "Unknown match",
          date: candidate.date ?? "Unknown date",
          opponent: candidate.opponent ?? "Unknown opponent",
          venue: candidate.venue ?? "Home",
          scoreline: candidate.scoreline ?? "0-0",
          minute: candidate.minute ?? 0,
          durationSec: candidate.durationSec ?? 12,
          gameState: candidate.gameState ?? "Drawing",
          phase: candidate.phase ?? "Build-up",
          startZone: candidate.startZone ?? "Defensive third",
          zone: candidate.zone ?? "Central lane",
          formation: candidate.formation ?? "Unknown shape",
          transitionType: candidate.transitionType ?? "Open play",
          passes: candidate.passes ?? 0,
          progression: candidate.progression ?? 0,
          pressure: candidate.pressure ?? 0,
          actionValue: candidate.actionValue ?? 0,
          xThreat: candidate.xThreat ?? 0.1,
          outcome: candidate.outcome ?? "Controlled possession",
          players: candidate.players ?? [],
          primarySignal: candidate.primarySignal ?? "Left overload release",
          secondarySignals: candidate.secondarySignals ?? [],
          signalScores: candidate.signalScores ?? normalizeSignalScores(candidate),
          note: candidate.note ?? "",
          whyItMatters: candidate.whyItMatters ?? "",
          path: candidate.path ?? [],
          events: [],
          descriptor: {
            startZone: "Defensive third",
            lane: "Central lane",
            progressionDistance: 0,
            passCount: 0,
            passesBeforeMiddleThird: 0,
            turnoverBeforeMidline: false,
            successToMiddleThird: false,
            eventCount: 0,
            actionValueBand: "Low",
            startMinute: candidate.minute ?? 0,
            endMinute: candidate.minute ?? 0,
          },
        });
  const path =
    candidate.path && candidate.path.length > 0
      ? candidate.path
      : buildPathFromEvents(events);
  const roughProgression =
    candidate.progression ??
    clamp(
      Math.max(...events.map((event) => Math.max(event.startX, event.endX))) -
        Math.min(...events.map((event) => event.startX)),
      0,
      100,
    );
  const xThreat = candidate.xThreat ?? deriveXThreat(events, roughProgression);
  const actionValue =
    candidate.actionValue ?? deriveActionValue(events, roughProgression, xThreat);
  const descriptor = derivePossessionDescriptor({
    minute: candidate.minute ?? 0,
    events,
    path,
    passes: candidate.passes ?? events.filter((event) => event.type === "Pass").length,
    progression: roughProgression,
    actionValue,
    zone: candidate.zone ?? laneFromY(average(path.map((point) => point.y))),
    startZone:
      candidate.startZone ??
      startZoneFromX(path[0]?.x ?? events[0]?.startX ?? 0),
  });

  return {
    id,
    team: candidate.team ?? "Unknown team",
    title: candidate.title ?? "Possession",
    matchId: candidate.matchId ?? `${id}-match`,
    matchLabel: candidate.matchLabel ?? "Unknown match",
    date: candidate.date ?? "Unknown date",
    opponent: candidate.opponent ?? "Unknown opponent",
    venue: candidate.venue ?? "Home",
    scoreline: candidate.scoreline ?? "0-0",
    minute: candidate.minute ?? 0,
    durationSec:
      candidate.durationSec ??
      Math.max(8, Math.round(events.at(-1)?.second ?? events.length * 4)),
    gameState: candidate.gameState ?? "Drawing",
    phase: candidate.phase ?? "Build-up",
    startZone: descriptor.startZone,
    zone: descriptor.lane,
    formation: candidate.formation ?? "Unknown shape",
    transitionType: candidate.transitionType ?? "Open play",
    passes: descriptor.passCount,
    progression: Math.round(descriptor.progressionDistance),
    pressure: candidate.pressure ?? derivePressure(events),
    actionValue,
    xThreat,
    outcome: candidate.outcome ?? "Controlled possession",
    players:
      candidate.players && candidate.players.length > 0
        ? candidate.players
        : Array.from(new Set(events.map((event) => event.player))).slice(0, 6),
    primarySignal: candidate.primarySignal ?? "Left overload release",
    secondarySignals: candidate.secondarySignals ?? [],
    signalScores: normalizeSignalScores(candidate),
    note: candidate.note ?? "No note provided.",
    whyItMatters:
      candidate.whyItMatters ??
      "This sequence is preserved because it represents the active tactical pattern.",
    path,
    events,
    descriptor,
    statsbombId: candidate.statsbombId,
    videoClipUrl: candidate.videoClipUrl,
    videoPosterUrl: candidate.videoPosterUrl,
    fullVideoUrl: candidate.fullVideoUrl,
    videoStartSec: candidate.videoStartSec,
    videoEndSec: candidate.videoEndSec,
    analysisConfidence: candidate.analysisConfidence,
    derivedFromVideo: candidate.derivedFromVideo,
    videoMomentScore: candidate.videoMomentScore,
    pitchConfidence: candidate.pitchConfidence,
    videoSeedTimeSec: candidate.videoSeedTimeSec,
  };
};

export const normalizePossessionSet = (possessions: Possession[]) =>
  possessions.map((possession) => normalizePossessionRecord(possession));

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

export const clampMinuteRange = ([start, end]: MinuteRange): MinuteRange => {
  const safeStart = Math.max(0, Math.min(start, 90));
  const safeEnd = Math.max(safeStart, Math.min(end, 90));
  return [safeStart, safeEnd];
};

export const buildMinuteRangeLabel = ([start, end]: MinuteRange) =>
  start === 0 && end === 90 ? "0-90" : `${start}-${end}`;

const buildTimeWindowFromMinute = (minute: number): TimeWindow => {
  if (minute <= 30) {
    return "0-30";
  }
  if (minute <= 60) {
    return "31-60";
  }
  return "61-90";
};

const inMinuteRange = (minute: number, minuteRange: MinuteRange) =>
  minute >= minuteRange[0] && minute <= minuteRange[1];

export const filterPossessions = (
  possessions: Possession[],
  filters: ContextFilters,
  includeOpponent = true,
) =>
  possessions.filter((possession) => {
    if (
      includeOpponent &&
      filters.opponent !== "All opponents" &&
      possession.opponent !== filters.opponent
    ) {
      return false;
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

    if (
      filters.startZone !== "All start zones" &&
      possession.startZone !== filters.startZone
    ) {
      return false;
    }

    if (filters.zone !== "All zones" && possession.zone !== filters.zone) {
      return false;
    }

    return inMinuteRange(possession.minute, filters.minuteRange);
  });

const signalPatternFit = (possession: Possession, signal: TacticalSignal) => {
  const descriptor = possession.descriptor;
  if (signal === "Left overload release") {
    return average([
      descriptor.lane === "Left lane" ? 1 : 0.35,
      descriptor.progressionDistance / 90,
      descriptor.successToMiddleThird ? 1 : 0.45,
    ]);
  }
  if (signal === "Central lane break") {
    return average([
      descriptor.lane === "Central lane" ? 1 : 0.3,
      descriptor.progressionDistance / 95,
      possession.xThreat / 0.4,
    ]);
  }
  if (signal === "Right lane release") {
    return average([
      descriptor.lane === "Right lane" ? 1 : 0.35,
      descriptor.progressionDistance / 90,
      descriptor.successToMiddleThird ? 1 : 0.45,
    ]);
  }
  if (signal === "Press escape chain") {
    return average([
      possession.phase === "Press resistance" ? 1 : 0.3,
      possession.pressure / 100,
      descriptor.successToMiddleThird ? 1 : 0.35,
    ]);
  }
  if (signal === "Wide switch cutback") {
    return average([
      descriptor.lane === "Right lane" ? 1 : 0.4,
      possession.xThreat / 0.45,
      descriptor.progressionDistance / 85,
    ]);
  }
  return average([
    possession.transitionType !== "Open play" ? 1 : 0.35,
    possession.actionValue / 100,
    descriptor.successToMiddleThird ? 1 : 0.5,
  ]);
};

const buildSignalRelevanceScore = (
  possession: Possession,
  activeSignal: TacticalSignal,
) =>
  clamp(
    average([
      possession.signalScores[activeSignal] ?? 0,
      signalPatternFit(possession, activeSignal),
      possession.actionValue / 100,
    ]),
    0,
    1,
  );

const buildContextScore = (possession: Possession, filters: ContextFilters) => {
  const matches = [
    filters.gameState === "All states" || filters.gameState === possession.gameState,
    filters.phase === "All phases" || filters.phase === possession.phase,
    filters.startZone === "All start zones" ||
      filters.startZone === possession.startZone,
    filters.zone === "All zones" || filters.zone === possession.zone,
    inMinuteRange(possession.minute, filters.minuteRange),
  ];

  if (filters.opponent !== "All opponents") {
    matches.push(filters.opponent === possession.opponent);
  }

  return matches.filter(Boolean).length / matches.length;
};

const candidateSimilarity = (left: Possession, right: Possession) => {
  const minuteDistance = Math.abs(left.minute - right.minute) / 90;
  const passDistance =
    Math.abs(left.descriptor.passCount - right.descriptor.passCount) / 10;
  const progressionDistance =
    Math.abs(left.descriptor.progressionDistance - right.descriptor.progressionDistance) /
    100;
  const categoricalOverlap = average([
    left.opponent === right.opponent ? 1 : 0,
    left.phase === right.phase ? 1 : 0,
    left.startZone === right.startZone ? 1 : 0,
    left.zone === right.zone ? 1 : 0,
  ]);

  return clamp(
    0.45 * categoricalOverlap +
      0.3 * (1 - minuteDistance) +
      0.15 * (1 - passDistance) +
      0.1 * (1 - progressionDistance),
    0,
    1,
  );
};

const buildDiversityScore = (candidate: Possession, selected: RankedPossession[]) => {
  if (!selected.length) {
    return 1;
  }

  const nearestSimilarity = Math.max(
    ...selected.map((existing) => candidateSimilarity(candidate, existing)),
  );
  return clamp(1 - nearestSimilarity, 0, 1);
};

const buildRetrievalReasons = (
  possession: Possession,
  activeSignal: TacticalSignal,
  language: Language,
  ranking: RankedPossession["ranking"],
): RetrievalReason[] => {
  const reasons: RetrievalReason[] = [];

  if (ranking.context >= 0.85) {
    reasons.push({
      key: "context-match",
      label:
        language === "zh" ? "匹配当前上下文锁定" : "Matched the current context lock",
      detail:
        language === "zh"
          ? `${gameStateLabel(possession.gameState, language)} / ${phaseLabel(possession.phase, language)} / ${zoneLabel(possession.zone, language)}`
          : `${gameStateLabel(possession.gameState, language)} / ${phaseLabel(possession.phase, language)} / ${zoneLabel(possession.zone, language)}`,
      weight: ranking.context,
    });
  }

  if (ranking.diversity >= 0.72) {
    reasons.push({
      key: "diversity",
      label:
        language === "zh" ? "覆盖了不同证据样本" : "Selected for diversity coverage",
      detail:
        language === "zh"
          ? "避免与已选回合形成近重复"
          : "Avoids near-duplicate evidence already in the list.",
      weight: ranking.diversity,
    });
  }

  if (ranking.signal >= 0.78) {
    reasons.push({
      key: "signal-match",
      label:
        language === "zh"
          ? `强 ${signalLabel(activeSignal, language)} 信号`
          : `Strong ${signalLabel(activeSignal, language)} signal`,
      detail:
        language === "zh"
          ? `信号得分 ${ranking.signal.toFixed(2)}`
          : `Signal score ${ranking.signal.toFixed(2)}`,
      weight: ranking.signal,
    });
  }

  if (possession.descriptor.progressionDistance >= 44) {
    reasons.push({
      key: "high-progression",
      label: language === "zh" ? "推进距离较高" : "High progression distance",
      detail:
        language === "zh"
          ? `${Math.round(possession.descriptor.progressionDistance)} 米等效推进`
          : `${Math.round(possession.descriptor.progressionDistance)}m equivalent progression`,
      weight: possession.descriptor.progressionDistance / 100,
    });
  }

  if (possession.descriptor.successToMiddleThird) {
    reasons.push({
      key: "middle-third-access",
      label: language === "zh" ? "成功进入中场区域" : "Reached the middle third",
      detail:
        language === "zh"
          ? `推进前使用 ${possession.descriptor.passesBeforeMiddleThird} 脚传递`
          : `${possession.descriptor.passesBeforeMiddleThird} passes before middle-third access`,
      weight: 0.72,
    });
  }

  if (!possession.descriptor.turnoverBeforeMidline) {
    reasons.push({
      key: "secure-build",
      label: language === "zh" ? "过半场前未失误" : "No pre-midline turnover",
      detail:
        language === "zh"
          ? "保持了稳定的第一阶段组织"
          : "The sequence kept control through the first phase.",
      weight: 0.66,
    });
  }

  return reasons.slice(0, 4);
};

export const buildSignalSummaries = (possessions: Possession[]): SignalSummary[] =>
  TACTICAL_SIGNALS.map((signal) => {
    const relevant = possessions.filter(
      (possession) => possession.signalScores[signal] >= 0.55,
    );
    return {
      signal,
      count: relevant.length,
      averageThreat: average(relevant.map((possession) => possession.xThreat)),
      averageActionValue: average(
        relevant.map((possession) => possession.actionValue),
      ),
      averageSignalStrength: average(
        relevant.map((possession) => possession.signalScores[signal]),
      ),
    };
  }).sort((left, right) => {
    if (right.count !== left.count) {
      return right.count - left.count;
    }
    return right.averageSignalStrength - left.averageSignalStrength;
  });

export const computeSummaryMetrics = (possessions: Possession[]): SummaryMetrics => {
  const laneCounts = possessions.reduce<Record<Zone, number>>(
    (accumulator, possession) => {
      accumulator[possession.zone] += 1;
      return accumulator;
    },
    {
      "Left lane": 0,
      "Central lane": 0,
      "Right lane": 0,
    },
  );
  const total = Math.max(1, possessions.length);

  return {
    possessionCount: possessions.length,
    laneShare: {
      "Left lane": laneCounts["Left lane"] / total,
      "Central lane": laneCounts["Central lane"] / total,
      "Right lane": laneCounts["Right lane"] / total,
    },
    averageProgressionDistance: average(
      possessions.map((possession) => possession.descriptor.progressionDistance),
    ),
    averagePassesBeforeMiddleThird: average(
      possessions.map((possession) => possession.descriptor.passesBeforeMiddleThird),
    ),
    averagePassCount: average(
      possessions.map((possession) => possession.descriptor.passCount),
    ),
    turnoverBeforeMidlineRate:
      possessions.filter((possession) => possession.descriptor.turnoverBeforeMidline)
        .length / total,
    successToMiddleThirdRate:
      possessions.filter((possession) => possession.descriptor.successToMiddleThird)
        .length / total,
  };
};

export const retrieveRepresentativePossessions = (
  possessions: Possession[],
  filters: ContextFilters,
  activeSignal: TacticalSignal,
  weights: RetrievalWeights = defaultRetrievalWeights,
  language: Language = "zh",
) => {
  const candidates = filterPossessions(possessions, filters).filter(
    (possession) => possession.signalScores[activeSignal] >= 0.35,
  );
  const selected: RankedPossession[] = [];

  while (selected.length < 5 && selected.length < candidates.length) {
    let best: RankedPossession | null = null;

    candidates.forEach((candidate) => {
      if (selected.some((item) => item.id === candidate.id)) {
        return;
      }

      const signal = buildSignalRelevanceScore(candidate, activeSignal);
      const context = buildContextScore(candidate, filters);
      const diversity = buildDiversityScore(candidate, selected);
      const total =
        weights.alpha * signal +
        weights.beta * context +
        weights.gamma * diversity;

      const ranked: RankedPossession = {
        ...candidate,
        ranking: {
          total,
          signal,
          context,
          diversity,
        },
        retrievalReasons: [],
      };
      ranked.retrievalReasons = buildRetrievalReasons(
        ranked,
        activeSignal,
        language,
        ranked.ranking,
      );

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

export const rankRepresentativePossessions = (
  possessions: Possession[],
  filters: ContextFilters,
  activeSignal: TacticalSignal,
  weights: RetrievalWeights = defaultRetrievalWeights,
  language: Language = "zh",
) => retrieveRepresentativePossessions(possessions, filters, activeSignal, weights, language);

const metricWinner = (leftValue: number, rightValue: number) => {
  if (Math.abs(leftValue - rightValue) < 0.001) {
    return "level" as const;
  }
  return leftValue > rightValue ? ("left" as const) : ("right" as const);
};

const startZoneLabel = (startZone: StartZone, language: Language) => {
  if (language === "zh") {
    if (startZone === "Defensive third") {
      return "后场三区";
    }
    if (startZone === "Middle third") {
      return "中场三区";
    }
    return "前场三区";
  }

  return startZone;
};

const describeComparison = (
  result: ComparisonResult,
  language: Language,
): string => {
  if (!result.leftCount || !result.rightCount) {
    return language === "zh"
      ? `当前上下文下，${result.leftLabel} 或 ${result.rightLabel} 的匹配回合不足，无法形成公平对比。`
      : `Under the current context, ${result.leftLabel} or ${result.rightLabel} does not have enough matched possessions for a fair comparison.`;
  }

  const progressionDelta = result.deltas.find(
    (delta) => delta.key === "averageProgression",
  );
  const turnoverDelta = result.deltas.find(
    (delta) => delta.key === "turnoverBeforeMidlineRate",
  );
  const successDelta = result.deltas.find(
    (delta) => delta.key === "successToMiddleThirdRate",
  );

  if (language === "zh") {
    return `${progressionDelta?.winner === "left" ? result.leftLabel : result.rightLabel} 在平均推进距离上更直接，而 ${
      turnoverDelta?.winner === "left" ? result.rightLabel : result.leftLabel
    } 在过半场前更容易出现失误。${
      successDelta?.winner === "left" ? result.leftLabel : result.rightLabel
    } 的成功进入中场率更高。`;
  }

  return `${
    progressionDelta?.winner === "left" ? result.leftLabel : result.rightLabel
  } progress more directly, while ${
    turnoverDelta?.winner === "left" ? result.rightLabel : result.leftLabel
  } lose the ball earlier before midfield. ${
    successDelta?.winner === "left" ? result.leftLabel : result.rightLabel
  } reach the middle third more consistently.`;
};

export const comparePossessionGroups = (
  left: Possession[],
  right: Possession[],
  leftLabel: string,
  rightLabel: string,
  language: Language = "zh",
): ComparisonResult => {
  const leftMetrics = computeSummaryMetrics(left);
  const rightMetrics = computeSummaryMetrics(right);
  const deltas: ComparisonResult["deltas"] = [
    {
      key: "leftLaneShare",
      label: language === "zh" ? "左路占比" : "Left-lane share",
      leftValue: leftMetrics.laneShare["Left lane"],
      rightValue: rightMetrics.laneShare["Left lane"],
      delta:
        leftMetrics.laneShare["Left lane"] - rightMetrics.laneShare["Left lane"],
      format: "percent",
      winner: metricWinner(
        leftMetrics.laneShare["Left lane"],
        rightMetrics.laneShare["Left lane"],
      ),
    },
    {
      key: "centralLaneShare",
      label: language === "zh" ? "中路占比" : "Central-lane share",
      leftValue: leftMetrics.laneShare["Central lane"],
      rightValue: rightMetrics.laneShare["Central lane"],
      delta:
        leftMetrics.laneShare["Central lane"] -
        rightMetrics.laneShare["Central lane"],
      format: "percent",
      winner: metricWinner(
        leftMetrics.laneShare["Central lane"],
        rightMetrics.laneShare["Central lane"],
      ),
    },
    {
      key: "rightLaneShare",
      label: language === "zh" ? "右路占比" : "Right-lane share",
      leftValue: leftMetrics.laneShare["Right lane"],
      rightValue: rightMetrics.laneShare["Right lane"],
      delta:
        leftMetrics.laneShare["Right lane"] -
        rightMetrics.laneShare["Right lane"],
      format: "percent",
      winner: metricWinner(
        leftMetrics.laneShare["Right lane"],
        rightMetrics.laneShare["Right lane"],
      ),
    },
    {
      key: "averageProgression",
      label: language === "zh" ? "平均推进距离" : "Average progression",
      leftValue: leftMetrics.averageProgressionDistance,
      rightValue: rightMetrics.averageProgressionDistance,
      delta:
        leftMetrics.averageProgressionDistance -
        rightMetrics.averageProgressionDistance,
      format: "number",
      winner: metricWinner(
        leftMetrics.averageProgressionDistance,
        rightMetrics.averageProgressionDistance,
      ),
    },
    {
      key: "passesBeforeMiddleThird",
      label:
        language === "zh"
          ? "进入中场前传球数"
          : "Passes before middle-third access",
      leftValue: leftMetrics.averagePassesBeforeMiddleThird,
      rightValue: rightMetrics.averagePassesBeforeMiddleThird,
      delta:
        leftMetrics.averagePassesBeforeMiddleThird -
        rightMetrics.averagePassesBeforeMiddleThird,
      format: "number",
      winner: metricWinner(
        leftMetrics.averagePassesBeforeMiddleThird,
        rightMetrics.averagePassesBeforeMiddleThird,
      ),
    },
    {
      key: "turnoverBeforeMidlineRate",
      label:
        language === "zh" ? "过半场前失误率" : "Turnover-before-midline rate",
      leftValue: leftMetrics.turnoverBeforeMidlineRate,
      rightValue: rightMetrics.turnoverBeforeMidlineRate,
      delta:
        leftMetrics.turnoverBeforeMidlineRate -
        rightMetrics.turnoverBeforeMidlineRate,
      format: "percent",
      winner: metricWinner(
        rightMetrics.turnoverBeforeMidlineRate,
        leftMetrics.turnoverBeforeMidlineRate,
      ),
    },
    {
      key: "successToMiddleThirdRate",
      label:
        language === "zh"
          ? "成功进入中场率"
          : "Success-to-middle-third rate",
      leftValue: leftMetrics.successToMiddleThirdRate,
      rightValue: rightMetrics.successToMiddleThirdRate,
      delta:
        leftMetrics.successToMiddleThirdRate -
        rightMetrics.successToMiddleThirdRate,
      format: "percent",
      winner: metricWinner(
        leftMetrics.successToMiddleThirdRate,
        rightMetrics.successToMiddleThirdRate,
      ),
    },
  ];

  const result: ComparisonResult = {
    leftLabel,
    rightLabel,
    leftCount: left.length,
    rightCount: right.length,
    summary: "",
    deltas,
  };
  result.summary = describeComparison(result, language);

  return result;
};

export const buildComparisonSet = (
  possessions: Possession[],
  activeSignal: TacticalSignal,
  filters: ContextFilters,
  opponent: string,
  weights: RetrievalWeights = defaultRetrievalWeights,
  language: Language = "zh",
) =>
  retrieveRepresentativePossessions(
    possessions,
    {
      ...filters,
      opponent,
    },
    activeSignal,
    weights,
    language,
  ).slice(0, 5);

export const summarizeComparison = (
  left: RankedPossession[],
  right: RankedPossession[],
  leftOpponent: string,
  rightOpponent: string,
  language: Language = "zh",
) =>
  comparePossessionGroups(left, right, leftOpponent, rightOpponent, language).summary;

export const generateTacticalNote = ({
  filters,
  activeSignal,
  ranked,
  comparison,
  language = "zh",
}: {
  filters: ContextFilters;
  activeSignal: TacticalSignal;
  ranked: RankedPossession[];
  comparison: ComparisonResult;
  language?: Language;
}): TacticalNote => {
  const keyFindings = [
    language === "zh"
      ? `当前重点信号是 ${signalLabel(activeSignal, language)}。`
      : `The active signal is ${signalLabel(activeSignal, language)}.`,
    comparison.summary,
    ranked[0]
      ? language === "zh"
        ? `最高优先级证据是 ${ranked[0].title}，它在当前锁定下得到 ${ranked[0].ranking.total.toFixed(2)} 分。`
        : `The highest-priority evidence clip is ${ranked[0].title}, scoring ${ranked[0].ranking.total.toFixed(2)} under the current lock.`
      : language === "zh"
        ? "当前没有代表性回合。"
        : "There are no representative possessions under the current lock.",
  ];

  const note: TacticalNote = {
    question:
      language === "zh"
        ? "在当前上下文中，这支球队的后场出球模式是什么？"
        : "What does this team's build-up look like under the current context?",
    appliedFilters: filters,
    keyFindings,
    representativePossessions: ranked.slice(0, 5).map((possession) => ({
      id: possession.id,
      title: possession.title,
      opponent: possession.opponent,
      minute: possession.minute,
      whySelected: possession.retrievalReasons.map((reason) => reason.label),
    })),
    comparisonConclusion: comparison.summary,
    markdown: "",
  };

  const filterLines = [
    language === "zh"
      ? `- 对手：${filters.opponent}`
      : `- Opponent: ${filters.opponent}`,
    language === "zh"
      ? `- 比分状态：${gameStateLabel(filters.gameState, language)}`
      : `- Game state: ${gameStateLabel(filters.gameState, language)}`,
    language === "zh"
      ? `- 比赛阶段：${phaseLabel(filters.phase, language)}`
      : `- Phase: ${phaseLabel(filters.phase, language)}`,
    language === "zh"
      ? `- 起始区域：${filters.startZone === "All start zones" ? "全部" : startZoneLabel(filters.startZone, language)}`
      : `- Start zone: ${filters.startZone === "All start zones" ? "All start zones" : filters.startZone}`,
    language === "zh"
      ? `- 通道：${zoneLabel(filters.zone, language)}`
      : `- Lane: ${zoneLabel(filters.zone, language)}`,
    language === "zh"
      ? `- 分钟范围：${buildMinuteRangeLabel(filters.minuteRange)}`
      : `- Minute range: ${buildMinuteRangeLabel(filters.minuteRange)}`,
  ];

  const evidenceLines =
    note.representativePossessions.length > 0
      ? note.representativePossessions.map(
          (possession, index) =>
            `- ${index + 1}. ${possession.title} (${possession.opponent}, ${possession.minute}') - ${possession.whySelected.join("; ")}`,
        )
      : [
          language === "zh"
            ? "- 当前筛选条件下没有代表性回合。"
            : "- No representative possessions matched the current filters.",
        ];

  note.markdown =
    language === "zh"
      ? `# PitchLens 战术结论

## 问题
${note.question}

## 上下文条件
${filterLines.join("\n")}

## 关键发现
${keyFindings.map((finding) => `- ${finding}`).join("\n")}

## 代表性回合
${evidenceLines.join("\n")}

## 对比结论
${note.comparisonConclusion}
`
      : `# PitchLens tactical note

## Question
${note.question}

## Context filters
${filterLines.join("\n")}

## Key findings
${keyFindings.map((finding) => `- ${finding}`).join("\n")}

## Representative possessions
${evidenceLines.join("\n")}

## Comparison conclusion
${note.comparisonConclusion}
`;

  return note;
};

export const buildExportNote = ({
  filters,
  activeSignal,
  ranked,
  leftOpponent,
  rightOpponent,
  comparisonText,
  language = "zh",
}: {
  filters: ContextFilters;
  activeSignal: TacticalSignal;
  ranked: RankedPossession[];
  leftOpponent: string;
  rightOpponent: string;
  comparisonText: string;
  language?: Language;
}) =>
  generateTacticalNote({
    filters,
    activeSignal,
    ranked,
    comparison: {
      leftLabel: leftOpponent,
      rightLabel: rightOpponent,
      leftCount: ranked.filter((possession) => possession.opponent === leftOpponent)
        .length,
      rightCount: ranked.filter((possession) => possession.opponent === rightOpponent)
        .length,
      deltas: [],
      summary: comparisonText,
    },
    language,
  }).markdown;

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
    } else if (possession.actionValue >= 65) {
      buckets.medium += 1;
    } else {
      buckets.low += 1;
    }
  });

  return buckets;
};

export const buildContextLockLabel = (
  filters: ContextFilters,
  language: Language,
) =>
  [
    gameStateLabel(filters.gameState, language),
    phaseLabel(filters.phase, language),
    filters.startZone === "All start zones"
      ? language === "zh"
        ? "全部起始区域"
        : "All start zones"
      : startZoneLabel(filters.startZone, language),
    zoneLabel(filters.zone, language),
    buildMinuteRangeLabel(filters.minuteRange),
  ].join(" / ");

export const getAvailableStartZones = () => START_ZONES;

export const getAvailableZones = () => ZONES;

export const getPossessionTimeWindow = (possession: Possession) =>
  buildTimeWindowFromMinute(possession.minute);
