export type GameState = "Winning" | "Drawing" | "Losing";
export type Venue = "Home" | "Away";
export type Phase =
  | "Build-up"
  | "Press resistance"
  | "Sustained attack"
  | "Transition";
export type Zone = "Left lane" | "Central lane" | "Right lane";
export type StartZone =
  | "Defensive third"
  | "Middle third"
  | "Attacking third";
export type TransitionType = "Open play" | "Counter" | "Set piece regain";
export type TimeWindow = "All windows" | "0-30" | "31-60" | "61-90";
export type MinuteRange = [number, number];
export type TacticalSignal =
  | "Left overload release"
  | "Central lane break"
  | "Right lane release"
  | "Press escape chain"
  | "Wide switch cutback"
  | "Counter-press regain";
export type ComparisonMetric =
  | "xThreat"
  | "progression"
  | "pressure"
  | "actionValue";
export type EventType =
  | "Pass"
  | "Carry"
  | "Recovery"
  | "Turnover"
  | "Shot"
  | "Clearance"
  | "Dribble";
export type RetrievalReasonKey =
  | "context-match"
  | "signal-match"
  | "high-progression"
  | "middle-third-access"
  | "secure-build"
  | "diversity";
export type ValueBand = "Low" | "Medium" | "High";

export const TACTICAL_SIGNALS: TacticalSignal[] = [
  "Left overload release",
  "Central lane break",
  "Right lane release",
  "Press escape chain",
  "Wide switch cutback",
  "Counter-press regain",
];

export const START_ZONES: StartZone[] = [
  "Defensive third",
  "Middle third",
  "Attacking third",
];

export const ZONES: Zone[] = ["Left lane", "Central lane", "Right lane"];

export type PitchPoint = {
  x: number;
  y: number;
  label: string;
  playerName?: string;
};

export type FreezeFramePoint = {
  x: number;
  y: number;
  teammate: boolean;
  actor: boolean;
  keeper: boolean;
};

export type Event = {
  id: string;
  possessionId: string;
  team: string;
  opponent: string;
  minute: number;
  second: number;
  type: EventType;
  player: string;
  startX: number;
  startY: number;
  endX: number;
  endY: number;
  underPressure?: boolean;
  outcome?: string;
  note?: string;
  freezeFrame?: FreezeFramePoint[];
};

export type PossessionDescriptor = {
  startZone: StartZone;
  lane: Zone;
  progressionDistance: number;
  passCount: number;
  passesBeforeMiddleThird: number;
  turnoverBeforeMidline: boolean;
  successToMiddleThird: boolean;
  eventCount: number;
  actionValueBand: ValueBand;
  startMinute: number;
  endMinute: number;
};

export type Possession = {
  id: string;
  team: string;
  title: string;
  matchId: string;
  matchLabel: string;
  date: string;
  opponent: string;
  venue: Venue;
  scoreline: string;
  minute: number;
  durationSec: number;
  gameState: GameState;
  phase: Phase;
  startZone: StartZone;
  zone: Zone;
  formation: string;
  transitionType: TransitionType;
  passes: number;
  progression: number;
  pressure: number;
  actionValue: number;
  xThreat: number;
  outcome: string;
  players: string[];
  primarySignal: TacticalSignal;
  secondarySignals: TacticalSignal[];
  signalScores: Record<TacticalSignal, number>;
  note: string;
  whyItMatters: string;
  path: PitchPoint[];
  events: Event[];
  descriptor: PossessionDescriptor;
  statsbombId?: number;
  videoClipUrl?: string;
  videoPosterUrl?: string;
  fullVideoUrl?: string;
  videoStartSec?: number;
  videoEndSec?: number;
  analysisConfidence?: number;
  derivedFromVideo?: boolean;
  videoMomentScore?: number;
  pitchConfidence?: number;
  videoSeedTimeSec?: number;
};

export type ContextFilters = {
  opponent: string;
  gameState: GameState | "All states";
  phase: Phase | "All phases";
  startZone: StartZone | "All start zones";
  zone: Zone | "All zones";
  timeWindow: TimeWindow;
  minuteRange: MinuteRange;
};

export type RetrievalReason = {
  key: RetrievalReasonKey;
  label: string;
  detail: string;
  weight: number;
};

export type RankedPossession = Possession & {
  ranking: {
    total: number;
    signal: number;
    context: number;
    diversity: number;
  };
  retrievalReasons: RetrievalReason[];
};

export type SignalSummary = {
  signal: TacticalSignal;
  count: number;
  averageThreat: number;
  averageActionValue: number;
  averageSignalStrength: number;
};

export type SummaryMetrics = {
  possessionCount: number;
  laneShare: Record<Zone, number>;
  averageProgressionDistance: number;
  averagePassesBeforeMiddleThird: number;
  averagePassCount: number;
  turnoverBeforeMidlineRate: number;
  successToMiddleThirdRate: number;
};

export type ComparisonDelta = {
  key:
    | "leftLaneShare"
    | "centralLaneShare"
    | "rightLaneShare"
    | "averageProgression"
    | "passesBeforeMiddleThird"
    | "turnoverBeforeMidlineRate"
    | "successToMiddleThirdRate";
  label: string;
  leftValue: number;
  rightValue: number;
  delta: number;
  format: "percent" | "number";
  winner: "left" | "right" | "level";
};

export type ComparisonResult = {
  leftLabel: string;
  rightLabel: string;
  leftCount: number;
  rightCount: number;
  summary: string;
  deltas: ComparisonDelta[];
};

export type TacticalNote = {
  question: string;
  appliedFilters: ContextFilters;
  keyFindings: string[];
  representativePossessions: Array<{
    id: string;
    title: string;
    opponent: string;
    minute: number;
    whySelected: string[];
  }>;
  comparisonConclusion: string;
  markdown: string;
};

export type RetrievalWeights = {
  alpha: number;
  beta: number;
  gamma: number;
};

export type VideoAnalysisSummary = {
  competition: string;
  videoDurationSec: number;
  videoDurationLabel: string;
  nativeFps: number;
  analysisFps: number;
  resolution: string;
  momentCount: number;
  averagePitchConfidence: number;
  cutCount: number;
  engine: string;
  processedOn: string;
};

export type VideoAnalysisResult = {
  jobId: string;
  datasetLabel: string;
  analysisTeam: string;
  availableTeams: string[];
  fullVideoUrl: string;
  possessions: Possession[];
  summary: VideoAnalysisSummary;
};

export type VideoIngestInput = {
  teamName: string;
  opponentName: string;
  competition: string;
  venue: Venue;
  scoreline: string;
  gameState: GameState;
  matchDate: string;
};

export type StatsBombCompetition = {
  key: string;
  competitionId: number;
  seasonId: number;
  label: string;
  competitionName: string;
  seasonName: string;
  countryName: string;
  competitionGender: string;
};

export type StatsBombMatch = {
  matchId: number;
  label: string;
  matchDate: string;
  homeTeam: string;
  awayTeam: string;
  scoreline: string;
  competitionStage: string;
};

export type StatsBombImportResponse = {
  datasetLabel: string;
  files: Array<{
    name: string;
    text: string;
  }>;
};

export type AssistantRole = "user" | "assistant";

export type AssistantMessage = {
  id: string;
  role: AssistantRole;
  content: string;
  meta?: string;
};

export type AssistantRequest = {
  question: string;
  conversation: Array<{
    role: AssistantRole;
    content: string;
  }>;
  datasetLabel: string;
  analysisTeam: string;
  contextLock: string;
  activeSignal: TacticalSignal;
  comparisonMetricLabel: string;
  comparisonText: string;
  leftOpponent: string;
  rightOpponent: string;
  filteredCount: number;
  teamClipCount: number;
  focusPossession: Possession | null;
  rankedPossessions: RankedPossession[];
  videoSummary: VideoAnalysisSummary | null;
  exportNote: string;
};

export type AssistantResponse = {
  answer: string;
  mode: "openai" | "ollama" | "local";
  model: string;
};
