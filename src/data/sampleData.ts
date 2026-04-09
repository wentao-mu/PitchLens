import { normalizePossessionRecord } from "../lib/analytics";
import type { Event, EventType, Possession, TacticalSignal, Venue } from "../types";
import { TACTICAL_SIGNALS } from "../types";

export const TARGET_TEAM = "Manchester City";

export { TACTICAL_SIGNALS };

type EventSeed = {
  type: EventType;
  player: string;
  startX: number;
  startY: number;
  endX: number;
  endY: number;
  underPressure?: boolean;
  outcome?: string;
};

type SeedPossession = {
  id: string;
  title: string;
  matchId: string;
  matchLabel: string;
  date: string;
  opponent: string;
  venue: Venue;
  scoreline: string;
  minute: number;
  formation: string;
  primarySignal: TacticalSignal;
  secondarySignals?: TacticalSignal[];
  note: string;
  whyItMatters: string;
  outcome: string;
  eventSeed: EventSeed[];
};

const buildSignalScores = (
  primary: TacticalSignal,
  secondary: TacticalSignal[] = [],
): Record<TacticalSignal, number> => {
  const scores = TACTICAL_SIGNALS.reduce<Record<TacticalSignal, number>>(
    (accumulator, signal) => {
      accumulator[signal] = 0.14;
      return accumulator;
    },
    {} as Record<TacticalSignal, number>,
  );

  scores[primary] = 0.94;
  secondary.forEach((signal, index) => {
    scores[signal] = Math.max(0.52, 0.72 - index * 0.1);
  });

  return scores;
};

const buildEvents = (seed: SeedPossession): Event[] =>
  seed.eventSeed.map((event, index) => ({
    id: `${seed.id}-event-${index + 1}`,
    possessionId: seed.id,
    team: TARGET_TEAM,
    opponent: seed.opponent,
    minute: seed.minute,
    second: index * 4,
    ...event,
  }));

const uniquePlayers = (events: Event[]) =>
  Array.from(new Set(events.map((event) => event.player)));

const buildPossession = (seed: SeedPossession): Possession => {
  const events = buildEvents(seed);

  return normalizePossessionRecord({
    id: seed.id,
    team: TARGET_TEAM,
    title: seed.title,
    matchId: seed.matchId,
    matchLabel: seed.matchLabel,
    date: seed.date,
    opponent: seed.opponent,
    venue: seed.venue,
    scoreline: seed.scoreline,
    minute: seed.minute,
    gameState: "Drawing",
    phase: "Build-up",
    formation: seed.formation,
    transitionType: "Open play",
    primarySignal: seed.primarySignal,
    secondarySignals: seed.secondarySignals ?? [],
    signalScores: buildSignalScores(seed.primarySignal, seed.secondarySignals ?? []),
    outcome: seed.outcome,
    note: seed.note,
    whyItMatters: seed.whyItMatters,
    players: uniquePlayers(events),
    events,
  });
};

const seedPossessions: SeedPossession[] = [
  {
    id: "mci-ars-06",
    title: "Dias to Akanji release down the left",
    matchId: "epl-2026-mci-ars",
    matchLabel: "Manchester City vs Arsenal",
    date: "2026-02-08",
    opponent: "Arsenal",
    venue: "Home",
    scoreline: "0-0",
    minute: 6,
    formation: "3-2-4-1",
    primarySignal: "Left overload release",
    secondarySignals: ["Central lane break"],
    note: "Arsenal sit off in a low block, so City can use four safe passes before releasing the spare player on the left.",
    whyItMatters: "This is the clearest low-risk build-up example against Arsenal's passive first line.",
    outcome: "Switch releases the left eight into space beyond midfield.",
    eventSeed: [
      { type: "Pass", player: "Dias", startX: 12, startY: 46, endX: 20, endY: 40 },
      { type: "Pass", player: "Akanji", startX: 20, startY: 40, endX: 28, endY: 56 },
      { type: "Pass", player: "Rodri", startX: 28, startY: 56, endX: 38, endY: 58 },
      { type: "Carry", player: "Gvardiol", startX: 38, startY: 58, endX: 50, endY: 62 },
      { type: "Pass", player: "Gvardiol", startX: 50, startY: 62, endX: 62, endY: 64 },
    ],
  },
  {
    id: "mci-ars-12",
    title: "Rodri secures access before the left release",
    matchId: "epl-2026-mci-ars",
    matchLabel: "Manchester City vs Arsenal",
    date: "2026-02-08",
    opponent: "Arsenal",
    venue: "Home",
    scoreline: "0-0",
    minute: 12,
    formation: "3-2-4-1",
    primarySignal: "Left overload release",
    secondarySignals: ["Press escape chain"],
    note: "City recycle once more to draw Arsenal inward, then access the left half-space with control.",
    whyItMatters: "Shows that the same pattern remains stable even with an extra recycle before progression.",
    outcome: "Controlled entry into the middle third through the left half-space.",
    eventSeed: [
      { type: "Pass", player: "Ederson", startX: 8, startY: 48, endX: 16, endY: 44 },
      { type: "Pass", player: "Dias", startX: 16, startY: 44, endX: 22, endY: 36 },
      { type: "Pass", player: "Stones", startX: 22, startY: 36, endX: 31, endY: 49 },
      { type: "Pass", player: "Rodri", startX: 31, startY: 49, endX: 40, endY: 54 },
      { type: "Pass", player: "Ake", startX: 40, startY: 54, endX: 52, endY: 60 },
      { type: "Carry", player: "Grealish", startX: 52, startY: 60, endX: 60, endY: 64 },
    ],
  },
  {
    id: "mci-ars-19",
    title: "Central access after short left circulation",
    matchId: "epl-2026-mci-ars",
    matchLabel: "Manchester City vs Arsenal",
    date: "2026-02-08",
    opponent: "Arsenal",
    venue: "Home",
    scoreline: "0-0",
    minute: 19,
    formation: "3-2-4-1",
    primarySignal: "Central lane break",
    secondarySignals: ["Left overload release"],
    note: "The left overload attracts Arsenal before Rodri punches through the central lane.",
    whyItMatters: "Useful because it shows the left overload can still finish as central progression.",
    outcome: "Pass breaks the second line into central midfield.",
    eventSeed: [
      { type: "Pass", player: "Dias", startX: 13, startY: 44, endX: 21, endY: 52 },
      { type: "Pass", player: "Ake", startX: 21, startY: 52, endX: 29, endY: 60 },
      { type: "Pass", player: "Rodri", startX: 29, startY: 60, endX: 36, endY: 46 },
      { type: "Pass", player: "Bernardo Silva", startX: 36, startY: 46, endX: 54, endY: 42 },
      { type: "Carry", player: "Foden", startX: 54, startY: 42, endX: 63, endY: 40 },
    ],
  },
  {
    id: "mci-ars-26",
    title: "Five-pass build-up into the left half-space",
    matchId: "epl-2026-mci-ars",
    matchLabel: "Manchester City vs Arsenal",
    date: "2026-02-08",
    opponent: "Arsenal",
    venue: "Home",
    scoreline: "0-0",
    minute: 26,
    formation: "3-2-4-1",
    primarySignal: "Left overload release",
    secondarySignals: ["Wide switch cutback"],
    note: "Arsenal's compact front line allows City to keep the move patient until the spare man appears on the left.",
    whyItMatters: "Representative of the most controlled variant in the first 30 minutes.",
    outcome: "City reach midfield with the receiver facing forward.",
    eventSeed: [
      { type: "Pass", player: "Ederson", startX: 7, startY: 50, endX: 15, endY: 46 },
      { type: "Pass", player: "Dias", startX: 15, startY: 46, endX: 24, endY: 42 },
      { type: "Pass", player: "Stones", startX: 24, startY: 42, endX: 33, endY: 48 },
      { type: "Pass", player: "Rodri", startX: 33, startY: 48, endX: 41, endY: 57 },
      { type: "Pass", player: "Ake", startX: 41, startY: 57, endX: 53, endY: 61 },
      { type: "Carry", player: "Grealish", startX: 53, startY: 61, endX: 64, endY: 58 },
    ],
  },
  {
    id: "mci-liv-05",
    title: "Immediate press-escape into the center",
    matchId: "epl-2026-liv-mci",
    matchLabel: "Liverpool vs Manchester City",
    date: "2026-03-01",
    opponent: "Liverpool",
    venue: "Away",
    scoreline: "0-0",
    minute: 5,
    formation: "3-2-4-1",
    primarySignal: "Press escape chain",
    secondarySignals: ["Left overload release", "Central lane break"],
    note: "Liverpool's high press forces City into a faster central escape with fewer preparatory passes.",
    whyItMatters: "Shows the same build-up question under a much more aggressive pressing context.",
    outcome: "Direct pass reaches Rodri on the turn just beyond the first line.",
    eventSeed: [
      { type: "Pass", player: "Ederson", startX: 8, startY: 48, endX: 17, endY: 40, underPressure: true },
      { type: "Pass", player: "Dias", startX: 17, startY: 40, endX: 28, endY: 47, underPressure: true },
      { type: "Carry", player: "Rodri", startX: 28, startY: 47, endX: 42, endY: 45, underPressure: true },
      { type: "Pass", player: "Rodri", startX: 42, startY: 45, endX: 53, endY: 40, underPressure: true },
    ],
  },
  {
    id: "mci-liv-11",
    title: "Turnover under Liverpool's first wave",
    matchId: "epl-2026-liv-mci",
    matchLabel: "Liverpool vs Manchester City",
    date: "2026-03-01",
    opponent: "Liverpool",
    venue: "Away",
    scoreline: "0-0",
    minute: 11,
    formation: "3-2-4-1",
    primarySignal: "Press escape chain",
    secondarySignals: ["Left overload release", "Counter-press regain"],
    note: "This is the negative edge case: Liverpool's press squeezes the second pass and the move dies before midfield.",
    whyItMatters: "Important for fair comparison because it captures the failure mode that barely appears against Arsenal.",
    outcome: "City lose the ball before crossing midfield.",
    eventSeed: [
      { type: "Pass", player: "Ederson", startX: 9, startY: 50, endX: 15, endY: 44, underPressure: true },
      { type: "Pass", player: "Dias", startX: 15, startY: 44, endX: 24, endY: 38, underPressure: true },
      { type: "Turnover", player: "Stones", startX: 24, startY: 38, endX: 28, endY: 36, underPressure: true, outcome: "Pressed into loss" },
    ],
  },
  {
    id: "mci-liv-18",
    title: "Three-pass right-lane escape",
    matchId: "epl-2026-liv-mci",
    matchLabel: "Liverpool vs Manchester City",
    date: "2026-03-01",
    opponent: "Liverpool",
    venue: "Away",
    scoreline: "0-0",
    minute: 18,
    formation: "3-2-4-1",
    primarySignal: "Right lane release",
    secondarySignals: ["Press escape chain", "Wide switch cutback"],
    note: "Liverpool force City away from the left overload into a quicker right-lane exit.",
    whyItMatters: "This is a strong contrasted example because the lane choice changes under pressure.",
    outcome: "City exit the press on the right but with reduced depth.",
    eventSeed: [
      { type: "Pass", player: "Ederson", startX: 7, startY: 49, endX: 18, endY: 42, underPressure: true },
      { type: "Carry", player: "Akanji", startX: 18, startY: 42, endX: 30, endY: 28, underPressure: true },
      { type: "Pass", player: "Akanji", startX: 30, startY: 28, endX: 47, endY: 22, underPressure: true },
      { type: "Pass", player: "Savinho", startX: 47, startY: 22, endX: 56, endY: 20, underPressure: true },
    ],
  },
  {
    id: "mci-liv-24",
    title: "Central carry after clipped release",
    matchId: "epl-2026-liv-mci",
    matchLabel: "Liverpool vs Manchester City",
    date: "2026-03-01",
    opponent: "Liverpool",
    venue: "Away",
    scoreline: "0-0",
    minute: 24,
    formation: "3-2-4-1",
    primarySignal: "Central lane break",
    secondarySignals: ["Left overload release", "Press escape chain"],
    note: "City can still progress, but the route is shorter and more central against Liverpool's first line.",
    whyItMatters: "Keeps the comparison fair because the context is still tied score, first 30 minutes, defensive-third start.",
    outcome: "Central carry reaches midfield after a clipped release.",
    eventSeed: [
      { type: "Pass", player: "Ederson", startX: 8, startY: 48, endX: 17, endY: 46, underPressure: true },
      { type: "Pass", player: "Dias", startX: 17, startY: 46, endX: 29, endY: 48, underPressure: true },
      { type: "Pass", player: "Rodri", startX: 29, startY: 48, endX: 44, endY: 44, underPressure: true },
      { type: "Carry", player: "De Bruyne", startX: 44, startY: 44, endX: 58, endY: 40, underPressure: true },
    ],
  },
  {
    id: "mci-bri-34",
    title: "Out-of-scope second-half build-up",
    matchId: "epl-2026-mci-bri",
    matchLabel: "Manchester City vs Brighton",
    date: "2026-02-15",
    opponent: "Brighton",
    venue: "Home",
    scoreline: "1-1",
    minute: 34,
    formation: "3-2-4-1",
    primarySignal: "Central lane break",
    note: "A control example that should drop out once the first-30 filter is applied.",
    whyItMatters: "Useful for demonstrating that the context lock removes similar but out-of-window evidence.",
    outcome: "City reach midfield after halftime-adjacent circulation.",
    eventSeed: [
      { type: "Pass", player: "Dias", startX: 12, startY: 46, endX: 22, endY: 42 },
      { type: "Pass", player: "Rodri", startX: 22, startY: 42, endX: 37, endY: 44 },
      { type: "Carry", player: "Foden", startX: 37, startY: 44, endX: 56, endY: 41 },
    ],
  },
  {
    id: "mci-liv-62",
    title: "Transition clip outside the build-up scope",
    matchId: "epl-2026-liv-mci",
    matchLabel: "Liverpool vs Manchester City",
    date: "2026-03-01",
    opponent: "Liverpool",
    venue: "Away",
    scoreline: "1-1",
    minute: 62,
    formation: "3-2-4-1",
    primarySignal: "Counter-press regain",
    note: "A separate transition pattern that should stay accessible but outside the default MVP scenario.",
    whyItMatters: "Keeps the dataset realistic by including possessions beyond the primary analysis question.",
    outcome: "Counter-press regain leads to a direct attack.",
    eventSeed: [
      { type: "Recovery", player: "Rodri", startX: 48, startY: 44, endX: 50, endY: 43, underPressure: true },
      { type: "Pass", player: "Rodri", startX: 50, startY: 43, endX: 62, endY: 36, underPressure: true },
      { type: "Carry", player: "Haaland", startX: 62, startY: 36, endX: 81, endY: 33 },
      { type: "Shot", player: "Haaland", startX: 81, startY: 33, endX: 92, endY: 34, outcome: "Shot blocked" },
    ],
  },
];

export const allPossessions: Possession[] = seedPossessions.map(buildPossession);

export const opponents = Array.from(
  new Set(allPossessions.map((possession) => possession.opponent)),
);
