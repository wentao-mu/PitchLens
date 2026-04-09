import { TARGET_TEAM } from "../data/sampleData";
import { normalizePossessionRecord, normalizePossessionSet } from "./analytics";
import type {
  Event,
  FreezeFramePoint,
  GameState,
  Phase,
  PitchPoint,
  Possession,
  StartZone,
  TacticalSignal,
  TransitionType,
  Zone,
} from "../types";
import { TACTICAL_SIGNALS } from "../types";

type LooseRecord = Record<string, unknown>;

export type ImportedFile = {
  name: string;
  text: string;
};

export type ImportedDataset = {
  datasetLabel: string;
  possessions: Possession[];
  availableTeams: string[];
};

const CSV_FIELDS: Array<keyof Possession> = [
  "id",
  "team",
  "title",
  "matchId",
  "matchLabel",
  "date",
  "opponent",
  "venue",
  "scoreline",
  "minute",
  "durationSec",
  "gameState",
  "phase",
  "startZone",
  "zone",
  "formation",
  "transitionType",
  "passes",
  "progression",
  "pressure",
  "actionValue",
  "xThreat",
  "outcome",
  "players",
  "primarySignal",
  "secondarySignals",
  "signalScores",
  "note",
  "whyItMatters",
  "path",
  "events",
];

const signalTitle = (signal: TacticalSignal) => {
  if (signal === "Left overload release") {
    return "Left-lane overload releases the spare player";
  }
  if (signal === "Central lane break") {
    return "Central lane break attacks the heart of the block";
  }
  if (signal === "Right lane release") {
    return "Right-lane release provides the outlet under pressure";
  }
  if (signal === "Press escape chain") {
    return "Press escape chain frees the next pass";
  }
  if (signal === "Wide switch cutback") {
    return "Wide switch reaches the weak-side cutback lane";
  }
  return "Counter-press regain sustains the attack";
};

const slugify = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(value, max));

const parseNumber = (value: unknown, fallback = 0) => {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return fallback;
};

const parseStringArray = (value: unknown) => {
  if (Array.isArray(value)) {
    return value.map((item) => String(item)).filter(Boolean);
  }
  if (typeof value === "string" && value.trim()) {
    return value
      .split("|")
      .map((item) => item.trim())
      .filter(Boolean);
  }
  return [];
};

const parseJsonValue = (value: unknown) => {
  if (typeof value !== "string" || !value.trim()) {
    return value;
  }

  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
};

const normalizeSignalScores = (
  scores: unknown,
  primarySignal: TacticalSignal,
  secondarySignals: TacticalSignal[],
  derived: {
    progression: number;
    pressure: number;
    zone: Zone;
    phase: Phase;
    xThreat: number;
    actionValue: number;
    transitionType: TransitionType;
  },
) => {
  const base: Record<TacticalSignal, number> = {
    "Left overload release": 0.14,
    "Central lane break": 0.14,
    "Right lane release": 0.14,
    "Press escape chain": 0.14,
    "Wide switch cutback": 0.14,
    "Counter-press regain": 0.14,
  };

  if (scores && typeof scores === "object" && !Array.isArray(scores)) {
    TACTICAL_SIGNALS.forEach((signal) => {
      const scoreValue = parseNumber((scores as LooseRecord)[signal], base[signal]);
      base[signal] = clamp(scoreValue, 0, 1);
    });
    return base;
  }

  base[primarySignal] = 0.92;
  secondarySignals.forEach((signal, index) => {
    base[signal] = Math.max(0.5, 0.68 - index * 0.08);
  });

  if (derived.zone === "Left lane" && derived.progression >= 65) {
    base["Left overload release"] = Math.max(base["Left overload release"], 0.86);
  }
  if (derived.zone === "Central lane" && derived.progression >= 70) {
    base["Central lane break"] = Math.max(base["Central lane break"], 0.86);
  }
  if (derived.zone === "Right lane" && derived.progression >= 62) {
    base["Right lane release"] = Math.max(base["Right lane release"], 0.84);
  }
  if (derived.phase === "Press resistance" || derived.pressure >= 74) {
    base["Press escape chain"] = Math.max(base["Press escape chain"], 0.84);
  }
  if (derived.zone === "Right lane" && derived.xThreat >= 0.22) {
    base["Wide switch cutback"] = Math.max(base["Wide switch cutback"], 0.82);
  }
  if (
    derived.transitionType !== "Open play" ||
    (derived.pressure >= 72 && derived.actionValue >= 70)
  ) {
    base["Counter-press regain"] = Math.max(base["Counter-press regain"], 0.82);
  }

  return base;
};

const inferZone = (y: number): Zone => {
  if (y >= 54) {
    return "Left lane";
  }
  if (y <= 26) {
    return "Right lane";
  }
  return "Central lane";
};

const inferStartZone = (x: number): StartZone => {
  if (x < 33.34) {
    return "Defensive third";
  }
  if (x < 66.67) {
    return "Middle third";
  }
  return "Attacking third";
};

const inferPhase = ({
  startX,
  progression,
  pressure,
  transitionType,
}: {
  startX: number;
  progression: number;
  pressure: number;
  transitionType: TransitionType;
}): Phase => {
  if (transitionType !== "Open play") {
    return "Transition";
  }
  if (pressure >= 72) {
    return "Press resistance";
  }
  if (startX < 40) {
    return "Build-up";
  }
  if (progression >= 60) {
    return "Sustained attack";
  }
  return "Build-up";
};

const inferTransitionType = (value: string): TransitionType => {
  const text = value.toLowerCase();
  if (text.includes("counter")) {
    return "Counter";
  }
  if (
    text.includes("corner") ||
    text.includes("free kick") ||
    text.includes("throw in")
  ) {
    return "Set piece regain";
  }
  return "Open play";
};

const inferGameState = (scoreline: string, team = TARGET_TEAM): GameState => {
  const match = scoreline.match(/(-?\d+)\s*-\s*(-?\d+)/);
  if (!match) {
    return "Drawing";
  }

  const home = Number(match[1]);
  const away = Number(match[2]);
  const isAway = / at /i.test(team);
  const teamGoals = isAway ? away : home;
  const opponentGoals = isAway ? home : away;

  if (teamGoals > opponentGoals) {
    return "Winning";
  }
  if (teamGoals < opponentGoals) {
    return "Losing";
  }
  return "Drawing";
};

const inferSignalsFromShape = (context: {
  zone: Zone;
  phase: Phase;
  progression: number;
  pressure: number;
  actionValue: number;
  xThreat: number;
  transitionType: TransitionType;
}) => {
  const scores = normalizeSignalScores(
    null,
    "Left overload release",
    [],
    context,
  );
  const ordered = [...TACTICAL_SIGNALS].sort(
    (left, right) => scores[right] - scores[left],
  );
  return {
    primarySignal: ordered[0],
    secondarySignals: ordered.slice(1, 3),
    signalScores: scores,
  };
};

const normalizePath = (value: unknown) => {
  if (!Array.isArray(value)) {
    return [];
  }
  const normalized: Array<PitchPoint | null> = value
    .map((item) => {
      if (!item || typeof item !== "object") {
        return null;
      }
      const row = item as LooseRecord;
      return {
        x: clamp(parseNumber(row.x, 0), 0, 100),
        y: clamp(parseNumber(row.y, 0), 0, 100),
        label: String(row.label ?? ""),
        playerName:
          typeof row.playerName === "string" ? row.playerName : undefined,
      };
    });

  return normalized.filter(
    (item): item is PitchPoint => item !== null && Boolean(item.label),
  );
};

const normalizeEvents = (
  value: unknown,
  possessionId: string,
  team: string,
  opponent: string,
  minute: number,
): Event[] => {
  const parsed = parseJsonValue(value);
  if (!Array.isArray(parsed)) {
    return [];
  }

  const events = parsed.map((item, index) => {
      if (!item || typeof item !== "object" || Array.isArray(item)) {
        return null;
      }

      const row = item as LooseRecord;
      return {
        id: String(row.id ?? `${possessionId}-event-${index + 1}`),
        possessionId,
        team,
        opponent,
        minute: clamp(parseNumber(row.minute, minute), 0, 120),
        second: clamp(parseNumber(row.second, index * 4), 0, 600),
        type: String(row.type ?? "Pass") as Event["type"],
        player: String(row.player ?? row.label ?? `EV${index + 1}`),
        startX: clamp(parseNumber(row.startX ?? row.x, 0), 0, 100),
        startY: clamp(parseNumber(row.startY ?? row.y, 40), 0, 100),
        endX: clamp(parseNumber(row.endX ?? row.x, 0), 0, 100),
        endY: clamp(parseNumber(row.endY ?? row.y, 40), 0, 100),
        underPressure: Boolean(row.underPressure),
        outcome: typeof row.outcome === "string" ? row.outcome : undefined,
        note: typeof row.note === "string" ? row.note : undefined,
        freezeFrame: normalizeFreezeFrame(parseJsonValue(row.freezeFrame)),
      };
    });

  return events.filter(Boolean) as Event[];
};

const normalizePossession = (
  row: LooseRecord,
  index: number,
  fallbackTeam?: string,
): Possession => {
  const team = String(row.team ?? fallbackTeam ?? TARGET_TEAM);
  const opponent = String(row.opponent ?? "Unknown opponent");
  const minute = clamp(parseNumber(row.minute, index + 1), 0, 120);
  const possessionId = String(
    row.id ?? `${slugify(team)}-${slugify(opponent)}-${minute}-${index}`,
  );
  const progression = clamp(parseNumber(row.progression, 55), 0, 100);
  const pressure = clamp(parseNumber(row.pressure, 55), 0, 100);
  const actionValue = clamp(parseNumber(row.actionValue, 60), 0, 100);
  const xThreat = clamp(parseNumber(row.xThreat, 0.18), 0, 1);
  const zone = (row.zone as Zone) || inferZone(parseNumber(row.zoneY, 40));
  const startZone =
    (row.startZone as StartZone) ||
    inferStartZone(parseNumber(row.startX, 16));
  const transitionType = (row.transitionType as TransitionType) || "Open play";
  const phase =
    (row.phase as Phase) ||
    inferPhase({
      startX: parseNumber(row.startX, 40),
      progression,
      pressure,
      transitionType,
    });
  const inferredSignals = inferSignalsFromShape({
    zone,
    phase,
    progression,
    pressure,
    actionValue,
    xThreat,
    transitionType,
  });
  const primarySignal =
    (row.primarySignal as TacticalSignal) || inferredSignals.primarySignal;
  const secondarySignals =
    (parseStringArray(row.secondarySignals) as TacticalSignal[]).slice(0, 2);
  const signalScores = normalizeSignalScores(
    row.signalScores,
    primarySignal,
    secondarySignals.length ? secondarySignals : inferredSignals.secondarySignals,
    {
      zone,
      phase,
      progression,
      pressure,
      actionValue,
      xThreat,
      transitionType,
    },
  );

  const path =
    normalizePath(parseJsonValue(row.path)) ||
    [
      { x: 12, y: zone === "Left lane" ? 70 : zone === "Right lane" ? 20 : 44, label: "1" },
      { x: 38, y: zone === "Left lane" ? 62 : zone === "Right lane" ? 28 : 48, label: "2" },
      { x: 66, y: zone === "Left lane" ? 52 : zone === "Right lane" ? 34 : 42, label: "3" },
      { x: clamp(38 + progression * 0.45, 0, 92), y: zone === "Left lane" ? 44 : zone === "Right lane" ? 30 : 40, label: "4" },
    ];
  const events = normalizeEvents(
    row.events,
    possessionId,
    team,
    opponent,
    minute,
  );

  return normalizePossessionRecord({
    id: possessionId,
    team,
    title: String(row.title ?? signalTitle(primarySignal)),
    matchId: String(row.matchId ?? `${slugify(team)}-${slugify(opponent)}`),
    matchLabel: String(row.matchLabel ?? `${team} vs ${opponent}`),
    date: String(row.date ?? "Unknown date"),
    opponent,
    venue: row.venue === "Away" ? "Away" : "Home",
    scoreline: String(row.scoreline ?? "0-0"),
    minute,
    durationSec: clamp(parseNumber(row.durationSec, 18), 1, 240),
    gameState:
      (row.gameState as GameState) || inferGameState(String(row.scoreline ?? "0-0")),
    phase,
    startZone,
    zone,
    formation: String(row.formation ?? "Unknown shape"),
    transitionType,
    passes: clamp(parseNumber(row.passes, 4), 0, 50),
    progression,
    pressure,
    actionValue,
    xThreat,
    outcome: String(row.outcome ?? "Progression into the next line"),
    players: parseStringArray(row.players).slice(0, 6),
    primarySignal,
    secondarySignals:
      secondarySignals.length > 0 ? secondarySignals : inferredSignals.secondarySignals,
    signalScores,
    note: String(row.note ?? `The move develops through ${zone.toLowerCase()} under ${phase.toLowerCase()} conditions.`),
    whyItMatters: String(
      row.whyItMatters ??
        `This possession ranks highly because it combines ${primarySignal.toLowerCase()} with replayable field gain.`,
    ),
    path: path.length > 0
      ? path
      : [
          { x: 12, y: 72, label: "1" },
          { x: 38, y: 54, label: "2" },
          { x: 72, y: 40, label: "3" },
        ],
    events,
  });
};

const parseCsv = (text: string) => {
  const rows: string[][] = [];
  let current = "";
  let row: string[] = [];
  let inQuotes = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];

    if (char === '"') {
      if (inQuotes && next === '"') {
        current += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === "," && !inQuotes) {
      row.push(current);
      current = "";
      continue;
    }

    if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && next === "\n") {
        index += 1;
      }
      row.push(current);
      current = "";
      if (row.some((value) => value.trim() !== "")) {
        rows.push(row);
      }
      row = [];
      continue;
    }

    current += char;
  }

  if (current || row.length) {
    row.push(current);
    if (row.some((value) => value.trim() !== "")) {
      rows.push(row);
    }
  }

  return rows;
};

const parsePossessionCsv = (text: string) => {
  const rows = parseCsv(text);
  if (rows.length < 2) {
    return [];
  }
  const [header, ...dataRows] = rows;
  return dataRows.map((cells, index) => {
    const row = header.reduce<LooseRecord>((accumulator, key, columnIndex) => {
      accumulator[key] = cells[columnIndex] ?? "";
      return accumulator;
    }, {});
    return normalizePossession(row, index);
  });
};

const buildSignalFromStatsBomb = (context: {
  zone: Zone;
  phase: Phase;
  progression: number;
  pressure: number;
  actionValue: number;
  xThreat: number;
  transitionType: TransitionType;
}) => inferSignalsFromShape(context);

const shortName = (name: string) =>
  name
    .split(" ")
    .map((part) => part[0] ?? "")
    .join("")
    .slice(0, 3)
    .toUpperCase();

const normalizePoint = (point: unknown) => {
  if (!Array.isArray(point) || point.length < 2) {
    return null;
  }
  return {
    x: clamp(parseNumber(point[0], 0) / 1.2, 0, 100),
    y: clamp(parseNumber(point[1], 0) / 0.8, 0, 100),
  };
};

const normalizeFreezeFrame = (value: unknown): FreezeFramePoint[] => {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter(
      (item): item is LooseRecord =>
        Boolean(item) && typeof item === "object" && !Array.isArray(item),
    )
    .map((item) => {
      const location =
        normalizePoint(item.location) ??
        (Number.isFinite(parseNumber(item.x, NaN)) &&
        Number.isFinite(parseNumber(item.y, NaN))
          ? {
              x: clamp(parseNumber(item.x, 0), 0, 100),
              y: clamp(parseNumber(item.y, 0), 0, 100),
            }
          : null);
      if (!location) {
        return null;
      }
      return {
        x: location.x,
        y: location.y,
        teammate: Boolean(item.teammate),
        actor: Boolean(item.actor),
        keeper: Boolean(item.keeper),
      } satisfies FreezeFramePoint;
    })
    .filter((item): item is FreezeFramePoint => item !== null);
};

const convertStatsBombEventsFile = (file: ImportedFile): Possession[] => {
  const raw = JSON.parse(file.text) as unknown;
  const bundle =
    raw && typeof raw === "object" && !Array.isArray(raw)
      ? (raw as LooseRecord)
      : null;
  const eventPayload = Array.isArray(raw)
    ? raw
    : Array.isArray(bundle?.events)
      ? bundle.events
      : null;

  if (!Array.isArray(eventPayload)) {
    return [];
  }

  const freezeFrameByEventId = new Map<string, FreezeFramePoint[]>();
  if (Array.isArray(bundle?.threeSixty)) {
    bundle.threeSixty
      .filter(
        (item): item is LooseRecord =>
          Boolean(item) && typeof item === "object" && !Array.isArray(item),
      )
      .forEach((item) => {
        const eventUuid =
          typeof item.event_uuid === "string" ? item.event_uuid : undefined;
        if (!eventUuid) {
          return;
        }
        const freezeFrame = normalizeFreezeFrame(item.freeze_frame);
        if (freezeFrame.length) {
          freezeFrameByEventId.set(eventUuid, freezeFrame);
        }
      });
  }

  const events = eventPayload.filter(
    (item): item is LooseRecord =>
      Boolean(item) && typeof item === "object" && !Array.isArray(item),
  );

  if (!events.length || !("possession" in events[0]) || !("type" in events[0])) {
    return [];
  }

  const teams = Array.from(
    new Set(
      events
        .map((event) => (event.team as LooseRecord | undefined)?.name)
        .filter((name): name is string => typeof name === "string"),
    ),
  );

  const possessionsByKey = new Map<string, LooseRecord[]>();

  events.forEach((event) => {
    const possessionId = parseNumber(event.possession, NaN);
    const possessionTeam = (event.possession_team as LooseRecord | undefined)?.name;
    const typeName = (event.type as LooseRecord | undefined)?.name;

    if (!Number.isFinite(possessionId) || typeof possessionTeam !== "string") {
      return;
    }

    if (
      typeName === "Starting XI" ||
      typeName === "Half Start" ||
      typeName === "Half End" ||
      typeName === "Substitution"
    ) {
      return;
    }

    const key = `${possessionTeam}::${possessionId}`;
    const group = possessionsByKey.get(key) ?? [];
    group.push(event);
    possessionsByKey.set(key, group);
  });

  const matchId = file.name.replace(/\.[^.]+$/, "");

  return Array.from(possessionsByKey.entries())
    .map(([key, group], index) => {
      const [team] = key.split("::");
      const opponent =
        teams.find((candidate) => candidate !== team) ?? "Unknown opponent";
      const ordered = [...group].sort(
        (left, right) =>
          parseNumber(left.index, 0) - parseNumber(right.index, 0),
      );
      const minute = clamp(parseNumber(ordered[0]?.minute, 0), 0, 120);
      const durationSec = clamp(
        Math.round(
          ordered.reduce((sum, event) => sum + parseNumber(event.duration, 0), 0),
        ) || ordered.length * 3,
        4,
        120,
      );
      const passEvents = ordered.filter(
        (event) => (event.type as LooseRecord | undefined)?.name === "Pass",
      );
      const shotEvents = ordered.filter(
        (event) => (event.type as LooseRecord | undefined)?.name === "Shot",
      );
      const pressureFlags = ordered.filter((event) => Boolean(event.under_pressure));
      const points = ordered.flatMap((event) => {
        const location = normalizePoint(event.location);
        const eventLabel =
          typeof (event.player as LooseRecord | undefined)?.name === "string"
            ? shortName((event.player as LooseRecord).name as string)
            : "EV";
        const pointList: Array<{
          x: number;
          y: number;
          label: string;
          playerName?: string;
        }> = [];
        const actorName =
          typeof (event.player as LooseRecord | undefined)?.name === "string"
            ? ((event.player as LooseRecord).name as string)
            : undefined;
        if (location) {
          pointList.push({
            ...location,
            label: eventLabel,
            playerName: actorName,
          });
        }
        const passBlock = event.pass as LooseRecord | undefined;
        const endLocation = normalizePoint(passBlock?.end_location);
        const recipientName = (passBlock?.recipient as LooseRecord | undefined)?.name;
        if (endLocation) {
          pointList.push({
            ...endLocation,
            label:
              typeof recipientName === "string" ? shortName(recipientName) : eventLabel,
            playerName:
              typeof recipientName === "string" ? recipientName : actorName,
          });
        }
        return pointList;
      });
      const dedupedPoints = points.filter((point, pointIndex) => {
        if (pointIndex === 0) {
          return true;
        }
        const previous = points[pointIndex - 1];
        return point.x !== previous.x || point.y !== previous.y;
      });
      const avgY =
        dedupedPoints.reduce((sum, point) => sum + point.y, 0) /
          Math.max(1, dedupedPoints.length) || 40;
      const startX = dedupedPoints[0]?.x ?? 40;
      const startZone = inferStartZone(startX);
      const furthestX = dedupedPoints.reduce(
        (maxX, point) => Math.max(maxX, point.x),
        startX,
      );
      const progression = clamp(furthestX - startX + passEvents.length * 2.4, 0, 100);
      const xg = shotEvents.reduce((sum, event) => {
        const shot = event.shot as LooseRecord | undefined;
        return sum + parseNumber(shot?.statsbomb_xg, 0);
      }, 0);
      const finalThirdEntries = dedupedPoints.filter((point) => point.x >= 67).length;
      const boxEntries = dedupedPoints.filter(
        (point) => point.x >= 84 && point.y >= 18 && point.y <= 62,
      ).length;
      const xThreat = clamp(
        xg + progression / 230 + finalThirdEntries * 0.018 + boxEntries * 0.045,
        0,
        0.95,
      );
      const actionValue = clamp(
        Math.round(
          progression * 0.72 +
            finalThirdEntries * 7 +
            boxEntries * 9 +
            shotEvents.length * 10 +
            xg * 35,
        ),
        10,
        95,
      );
      const pressure = clamp(
        40 + pressureFlags.length * 10 + ordered.length * 1.8,
        20,
        96,
      );
      const playPatternName = String(
        ((ordered[0]?.play_pattern as LooseRecord | undefined)?.name as string) ??
          "Regular Play",
      );
      const transitionType = inferTransitionType(playPatternName);
      const zone = inferZone(avgY);
      const phase = inferPhase({
        startX,
        progression,
        pressure,
        transitionType,
      });
      const signalShape = buildSignalFromStatsBomb({
        zone,
        phase,
        progression,
        pressure,
        actionValue,
        xThreat,
        transitionType,
      });
      const players = Array.from(
        new Set(
          ordered
            .map((event) => (event.player as LooseRecord | undefined)?.name)
            .filter((name): name is string => typeof name === "string"),
        ),
      ).slice(0, 5);
      const normalizedEvents: Event[] = ordered.map((event, eventIndex) => {
        const location = normalizePoint(event.location);
        const passBlock = event.pass as LooseRecord | undefined;
        const endLocation =
          normalizePoint(passBlock?.end_location) ??
          location ??
          {
            x: startX,
            y: avgY,
          };
        const typeName = String(
          ((event.type as LooseRecord | undefined)?.name as string) ?? "Pass",
        );
        const sourceEventId =
          typeof event.id === "string" ? event.id : undefined;

        return {
          id: `${slugify(team)}-${matchId}-${index}-event-${eventIndex + 1}`,
          possessionId: `${slugify(team)}-${matchId}-${index}`,
          team,
          opponent,
          minute: clamp(parseNumber(event.minute, minute), 0, 120),
          second: clamp(parseNumber(event.second, eventIndex * 4), 0, 600),
          type:
            typeName === "Ball Recovery"
              ? "Recovery"
              : typeName === "Dribble"
                ? "Dribble"
                : typeName === "Carry"
                  ? "Carry"
                  : typeName === "Shot"
                    ? "Shot"
                    : typeName === "Clearance"
                      ? "Clearance"
                      : "Pass",
          player:
            typeof (event.player as LooseRecord | undefined)?.name === "string"
              ? ((event.player as LooseRecord).name as string)
              : "Unknown player",
          startX: location?.x ?? startX,
          startY: location?.y ?? avgY,
          endX: endLocation.x,
          endY: endLocation.y,
          underPressure: Boolean(event.under_pressure),
          outcome: typeName,
          freezeFrame: sourceEventId
            ? freezeFrameByEventId.get(sourceEventId)
            : undefined,
        };
      });

      return normalizePossession(
        {
          id: `${slugify(team)}-${matchId}-${index}`,
          team,
          title: signalTitle(signalShape.primarySignal),
          matchId,
          matchLabel: `${team} vs ${opponent}`,
          date: "StatsBomb Open Data",
          opponent,
          venue: "Home",
          scoreline: "0-0",
          minute,
          durationSec,
          gameState: "Drawing",
          phase,
          startZone,
          zone,
          formation: "Unknown shape",
          transitionType,
          passes: passEvents.length,
          progression,
          pressure,
          actionValue,
          xThreat,
          outcome:
            shotEvents.length > 0
              ? "Shot generated at the end of the possession"
              : progression >= 65
                ? "Field gain into the attacking half"
                : "Controlled progression",
          players,
          primarySignal: signalShape.primarySignal,
          secondarySignals: signalShape.secondarySignals,
          signalScores: signalShape.signalScores,
          note: `${team} build the move through ${zone.toLowerCase()} with ${passEvents.length} passes under ${playPatternName.toLowerCase()}.`,
          whyItMatters: `Derived from a real StatsBomb event chain. The possession is grouped from live events rather than handcrafted samples.`,
          path: dedupedPoints.slice(0, 6),
          events: normalizedEvents,
        },
        index,
        team,
      );
    })
    .filter((possession) => possession.passes > 0 || possession.xThreat > 0.08);
};

const parsePossessionJson = (value: unknown) => {
  if (Array.isArray(value)) {
    return value
      .filter(
        (item): item is LooseRecord =>
          Boolean(item) && typeof item === "object" && !Array.isArray(item),
      )
      .map((row, index) => normalizePossession(row, index));
  }

  if (value && typeof value === "object" && !Array.isArray(value)) {
    const root = value as LooseRecord;
    if (Array.isArray(root.possessions)) {
      return root.possessions
        .filter(
          (item): item is LooseRecord =>
            Boolean(item) && typeof item === "object" && !Array.isArray(item),
        )
        .map((row, index) => normalizePossession(row, index));
    }
  }

  return [];
};

const isStatsBombEventsJson = (value: unknown) =>
  Array.isArray(value) &&
  value.length > 0 &&
  typeof value[0] === "object" &&
  value[0] !== null &&
  "possession" in (value[0] as LooseRecord) &&
  "type" in (value[0] as LooseRecord);

const isStatsBombBundleJson = (value: unknown) =>
  Boolean(value) &&
  typeof value === "object" &&
  !Array.isArray(value) &&
  Array.isArray((value as LooseRecord).events) &&
  isStatsBombEventsJson((value as LooseRecord).events);

export const parseImportedDataset = (
  files: ImportedFile[],
): ImportedDataset => {
  const possessions: Possession[] = [];

  files.forEach((file) => {
    const extension = file.name.split(".").pop()?.toLowerCase();

    if (extension === "csv") {
      possessions.push(...parsePossessionCsv(file.text));
      return;
    }

    if (extension === "json") {
      const parsed = JSON.parse(file.text) as unknown;

      if (isStatsBombEventsJson(parsed) || isStatsBombBundleJson(parsed)) {
        possessions.push(...convertStatsBombEventsFile(file));
        return;
      }

      possessions.push(...parsePossessionJson(parsed));
      return;
    }

    throw new Error(`Unsupported file format: ${file.name}`);
  });

  if (!possessions.length) {
    throw new Error("No valid possessions were parsed from the uploaded files.");
  }

  const availableTeams = Array.from(
    new Set(possessions.map((possession) => possession.team)),
  ).sort();

  return {
    datasetLabel:
      files.length === 1
        ? files[0].name
        : `${files.length} imported match files`,
    possessions: normalizePossessionSet(possessions),
    availableTeams,
  };
};

const serializeCsvCell = (value: unknown) => {
  const text =
    typeof value === "string" ? value : JSON.stringify(value ?? "");
  if (/[",\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
};

export const serializePossessionsToCsv = (possessions: Possession[]) => {
  const header = CSV_FIELDS.join(",");
  const rows = possessions.map((possession) =>
    CSV_FIELDS.map((field) => {
      const value = possession[field];
      if (field === "players" || field === "secondarySignals") {
        return serializeCsvCell((value as string[]).join("|"));
      }
      if (field === "signalScores" || field === "path" || field === "events") {
        return serializeCsvCell(JSON.stringify(value));
      }
      return serializeCsvCell(value);
    }).join(","),
  );
  return [header, ...rows].join("\n");
};
