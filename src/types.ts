export type GameState = "Winning" | "Drawing" | "Losing";
export type Venue = "Home" | "Away";
export type Phase =
  | "Build-up"
  | "Press resistance"
  | "Sustained attack"
  | "Transition";
export type Zone = "Left lane" | "Central lane" | "Right lane";
export type TransitionType = "Open play" | "Counter" | "Set piece regain";
export type TimeWindow = "All windows" | "0-30" | "31-60" | "61-90";
export type MinuteRange = [number, number];
export type TacticalSignal =
  | "Left overload release"
  | "Central lane break"
  | "Press escape chain"
  | "Wide switch cutback"
  | "Counter-press regain";
export type ComparisonMetric =
  | "xThreat"
  | "progression"
  | "pressure"
  | "actionValue";

export type PitchPoint = {
  x: number;
  y: number;
  label: string;
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
  zone: Zone | "All zones";
  timeWindow: TimeWindow;
  minuteRange: MinuteRange;
};

export type RankedPossession = Possession & {
  ranking: {
    total: number;
    signal: number;
    context: number;
    diversity: number;
  };
};

export type SignalSummary = {
  signal: TacticalSignal;
  count: number;
  averageThreat: number;
  averageActionValue: number;
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
