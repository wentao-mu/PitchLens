import {
  useDeferredValue,
  useEffect,
  useRef,
  useState,
  useTransition,
} from "react";
import { AssistantPanel } from "./components/AssistantPanel";
import { ComparisonBoard } from "./components/ComparisonBoard";
import { ExportPanel } from "./components/ExportPanel";
import { MiniPitch } from "./components/MiniPitch";
import { allPossessions, TARGET_TEAM } from "./data/sampleData";
import {
  buildContextLockLabel,
  buildComparisonSet,
  buildExportNote,
  buildMinuteRangeLabel,
  buildSignalSummaries,
  clampMinuteRange,
  comparePossessionGroups,
  computeSummaryMetrics,
  defaultScenarioFilters,
  filterPossessions,
  getActionValueBuckets,
  getAvailableStartZones,
  getFormationTendencies,
  normalizePossessionSet,
  rankRepresentativePossessions,
  timeWindowToRange,
} from "./lib/analytics";
import { askAssistant } from "./lib/assistantApi";
import {
  getStatsBombCompetitions,
  getStatsBombMatches,
  importStatsBombMatches,
} from "./lib/openDataApi";
import {
  parseImportedDataset,
  serializePossessionsToCsv,
} from "./lib/dataImport";
import {
  comparisonMetricLabel,
  DEFAULT_DATASET_LABEL,
  gameStateLabel,
  phaseLabel,
  signalLabel,
  timeWindowLabel,
  transitionLabel,
  UI_TEXT,
  zoneLabel,
  type Language,
} from "./lib/i18n";
import { analyzeVideoFile, getVideoEngineHealth } from "./lib/videoApi";
import type {
  AssistantMessage,
  ComparisonMetric,
  ContextFilters,
  MinuteRange,
  Possession,
  StartZone,
  StatsBombCompetition,
  StatsBombMatch,
  TacticalSignal,
  TimeWindow,
  VideoAnalysisResult,
  VideoAnalysisSummary,
  VideoIngestInput,
} from "./types";

const COMPARISON_METRICS: ComparisonMetric[] = [
  "xThreat",
  "progression",
  "pressure",
  "actionValue",
];

const QUICK_PRESET_DEFS: Array<{
  id: string;
  filters: ContextFilters;
  signal: TacticalSignal;
}> = [
    {
      id: "mvp-build-up",
      filters: defaultScenarioFilters,
      signal: "Left overload release",
    },
    {
      id: "left-build",
      filters: {
        ...defaultScenarioFilters,
        zone: "Left lane",
      },
      signal: "Left overload release",
    },
    {
      id: "press-escape",
      filters: {
        ...defaultScenarioFilters,
        phase: "Press resistance",
      },
      signal: "Press escape chain",
    },
    {
      id: "right-build",
      filters: {
        ...defaultScenarioFilters,
        zone: "Right lane",
      },
      signal: "Right lane release",
    },
    {
      id: "chasing-central",
      filters: {
        ...defaultScenarioFilters,
        zone: "Central lane",
      },
      signal: "Central lane break",
    },
  ];

const FOCUS_VIEW_IDS = ["overview", "sequence", "context"] as const;

const DEFAULT_VIDEO_INPUT: VideoIngestInput = {
  teamName: "Arsenal WFC",
  opponentName: "Chelsea Women",
  competition: "Match video",
  venue: "Home",
  scoreline: "0-0",
  gameState: "Drawing",
  matchDate: new Date().toISOString().slice(0, 10),
};

const VIDEO_EXTENSIONS = [".mp4", ".mov", ".m4v", ".avi", ".mkv", ".webm"];
const DATA_EXTENSIONS = [".csv", ".json"];

const metricValue = (values: number[]) =>
  values.length
    ? values.reduce((sum, value) => sum + value, 0) / values.length
    : 0;

const metricFormatter = (metric: ComparisonMetric, value: number) =>
  metric === "xThreat" ? value.toFixed(2) : `${Math.round(value)}`;

const formatClock = (seconds: number) => {
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = Math.floor(seconds % 60);
  return `${minutes}:${remainingSeconds.toString().padStart(2, "0")}`;
};

const buildMessageId = () =>
  `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

const buildAssistantWelcome = (
  signal: TacticalSignal,
  language: Language,
): AssistantMessage => ({
  id: buildMessageId(),
  role: "assistant",
  content:
    language === "zh"
      ? `可以直接问我当前聚焦片段、对手对比，或者在当前上下文下如何围绕${signalLabel(signal, language)}给出战术建议。`
      : `Ask about the current focus clip, the opponent comparison, or how to coach ${signalLabel(signal, language)} under the active lock.`,
  meta: UI_TEXT[language].assistantStatusContext,
});

const fileMatches = (file: File, extensions: string[]) => {
  const lowerName = file.name.toLowerCase();
  return extensions.some((extension) => lowerName.endsWith(extension));
};

const buildPresetTags = ({
  signal,
  filters,
  language,
}: {
  signal: TacticalSignal;
  filters: ContextFilters;
  language: Language;
}) => {
  const tags: string[] = [signalLabel(signal, language)];

  if (filters.phase !== "All phases") {
    tags.push(phaseLabel(filters.phase, language));
  }

  if (filters.startZone !== "All start zones") {
    tags.push(startZoneLabel(filters.startZone, language));
  }

  if (filters.zone !== "All zones") {
    tags.push(zoneLabel(filters.zone, language));
  }

  if (filters.gameState !== "All states") {
    tags.push(gameStateLabel(filters.gameState, language));
  }

  return tags;
};

const startZoneLabel = (
  startZone: StartZone | "All start zones",
  language: Language,
) => {
  if (language === "zh") {
    if (startZone === "All start zones") {
      return "全部起始区域";
    }
    if (startZone === "Defensive third") {
      return "后场三区";
    }
    if (startZone === "Middle third") {
      return "中场三区";
    }
    return "前场三区";
  }

  return startZone === "All start zones" ? "All start zones" : startZone;
};

const percentLabel = (value: number) => `${Math.round(value * 100)}%`;

function SectionTypewriter({ text }: { text: string }) {
  const [displayed, setDisplayed] = useState("");
  const [inView, setInView] = useState(false);
  const ref = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) setInView(true);
      },
      { threshold: 0.1 }
    );
    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!inView) return;
    let i = 0;
    setDisplayed("");
    const timer = setInterval(() => {
      setDisplayed(text.slice(0, i + 1));
      i++;
      if (i === text.length) clearInterval(timer);
    }, 45);
    return () => clearInterval(timer);
  }, [text, inView]);

  return (
    <h2 ref={ref}>
      {displayed}<span className="blinking-cursor">|</span>
    </h2>
  );
}

function App() {
  const [language, setLanguage] = useState<Language>("zh");
  const ui = UI_TEXT[language];
  const [sourcePossessions, setSourcePossessions] =
    useState<Possession[]>(allPossessions);
  const [datasetLabel, setDatasetLabel] = useState<string>(
    DEFAULT_DATASET_LABEL.zh,
  );
  const [analysisTeam, setAnalysisTeam] = useState(TARGET_TEAM);
  const [filters, setFilters] = useState<ContextFilters>(defaultScenarioFilters);
  const [activeSignal, setActiveSignal] = useState<TacticalSignal>(
    "Left overload release",
  );
  const [focusId, setFocusId] = useState<string>(allPossessions[0]?.id ?? "");
  const [leftOpponent, setLeftOpponent] = useState<string>("");
  const [rightOpponent, setRightOpponent] = useState<string>("");
  const [comparisonMetric, setComparisonMetric] =
    useState<ComparisonMetric>("xThreat");
  const [activePresetId, setActivePresetId] = useState<string>("mvp-build-up");
  const [focusView, setFocusView] =
    useState<(typeof FOCUS_VIEW_IDS)[number]>("overview");
  const [copyStatus, setCopyStatus] = useState("");
  const [assistantMessages, setAssistantMessages] = useState<AssistantMessage[]>(
    () => [buildAssistantWelcome("Left overload release", "zh")],
  );
  const [assistantDraft, setAssistantDraft] = useState("");
  const [assistantStatusLabel, setAssistantStatusLabel] = useState<string>(
    ui.assistantStatusContext,
  );
  const [sourceMode, setSourceMode] = useState<"sample" | "events" | "video">(
    "sample",
  );
  const [videoSummary, setVideoSummary] =
    useState<VideoAnalysisSummary | null>(null);
  const [ingestStatus, setIngestStatus] = useState<string>(ui.statusDefault);
  const [ingestError, setIngestError] = useState("");
  const [engineStatus, setEngineStatus] = useState<
    "checking" | "ready" | "offline"
  >("checking");
  const [isDragActive, setIsDragActive] = useState(false);
  const [isVideoAnalyzing, setIsVideoAnalyzing] = useState(false);
  const [isAssistantLoading, setIsAssistantLoading] = useState(false);
  const [videoInput, setVideoInput] =
    useState<VideoIngestInput>(DEFAULT_VIDEO_INPUT);
  const [playerMode, setPlayerMode] = useState<"clip" | "full">("clip");
  const [videoPlaying, setVideoPlaying] = useState(false);
  const [videoProgress, setVideoProgress] = useState(0);
  const [isMediaMode, setIsMediaMode] = useState<"pitch" | "video">("pitch");
  const [currentPage, setCurrentPage] = useState<string>("match-centre");
  const [statsBombCompetitions, setStatsBombCompetitions] = useState<
    StatsBombCompetition[]
  >([]);
  const [selectedCompetitionKey, setSelectedCompetitionKey] = useState("");
  const [statsBombMatches, setStatsBombMatches] = useState<StatsBombMatch[]>([]);
  const [selectedMatchIds, setSelectedMatchIds] = useState<number[]>([]);
  const [statsBombMatchQuery, setStatsBombMatchQuery] = useState("");
  const [isStatsBombLoading, setIsStatsBombLoading] = useState(false);
  const [, startTransition] = useTransition();

  const structuredInputRef = useRef<HTMLInputElement | null>(null);
  const videoInputRef = useRef<HTMLInputElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  const availableTeams = Array.from(
    new Set(sourcePossessions.map((possession) => possession.team)),
  ).sort();
  const teamPossessions = sourcePossessions.filter(
    (possession) => possession.team === analysisTeam,
  );
  const opponents = Array.from(
    new Set(teamPossessions.map((possession) => possession.opponent)),
  ).sort();
  const headerChannels = [
    { label: language === "zh" ? "总览" : "Overview", id: "match-centre" },
    { label: ui.loaderLabel, id: "ingest" },
    { label: ui.filtersLabel, id: "context-lock" },
    { label: ui.scenariosLabel, id: "rankings" },
    { label: ui.deepDiveLabel, id: "analysis" },
  ];
  const comparisonMetricOptions = COMPARISON_METRICS.map((key) => ({
    key,
    label: comparisonMetricLabel(key, language),
  }));
  const selectedCompetition = statsBombCompetitions.find(
    (competition) => competition.key === selectedCompetitionKey,
  );
  const filteredStatsBombMatches = statsBombMatches.filter((match) => {
    const query = statsBombMatchQuery.trim().toLowerCase();
    if (!query) {
      return true;
    }
    return [
      match.label,
      match.homeTeam,
      match.awayTeam,
      match.competitionStage,
      match.scoreline,
    ]
      .join(" ")
      .toLowerCase()
      .includes(query);
  });
  const quickPresets = QUICK_PRESET_DEFS.map((preset) => {
    const copy =
      preset.id === "mvp-build-up"
        ? {
            label: language === "zh" ? "MVP 出球场景" : "MVP build-up lock",
            description:
              language === "zh"
                ? "比分持平、前 30 分钟、后场三区发起的默认分析场景。"
                : "Default tied-score, first-30, defensive-third build-up scenario.",
          }
        : preset.id === "left-build"
          ? {
              label: language === "zh" ? "左路出球" : "Build-up left",
              description:
                language === "zh"
                  ? "聚焦左路的一阶段组织和稳定推进。"
                  : "Settled first-phase build-up through the left lane.",
            }
          : preset.id === "right-build"
            ? {
                label: language === "zh" ? "右路出球" : "Build-up right",
                description:
                  language === "zh"
                    ? "聚焦右路释放和受压后的边路出口。"
                    : "Right-lane exits and releases under the same lock.",
              }
          : preset.id === "press-escape"
            ? {
                label: language === "zh" ? "摆脱压迫" : "Press escape",
                description:
                  language === "zh"
                    ? "关注在高压下穿越第一线的处理方式。"
                    : "High-pressure exits against the first line.",
              }
            : {
                label: language === "zh" ? "中路直击" : "Central punch",
                description:
                  language === "zh"
                    ? "聚焦中路直接推进和反抢后的再进入。"
                    : "Direct central access and regains.",
              };
    return { ...preset, ...copy };
  });
  const focusViews = FOCUS_VIEW_IDS.map((id) => ({
    id,
    label:
      id === "overview"
        ? language === "zh"
          ? "概览"
          : "Overview"
        : id === "sequence"
          ? language === "zh"
            ? "序列"
            : "Sequence"
          : language === "zh"
            ? "上下文"
            : "Context",
  }));

  useEffect(() => {
    if (sourceMode === "sample") {
      setDatasetLabel(DEFAULT_DATASET_LABEL[language]);
      setIngestStatus(UI_TEXT[language].statusDefault);
    }
  }, [language, sourceMode]);

  useEffect(() => {
    const builtInAssistantLabels = new Set<string>([
      UI_TEXT.en.assistantStatusContext,
      UI_TEXT.zh.assistantStatusContext,
      UI_TEXT.en.assistantStatusLocal,
      UI_TEXT.zh.assistantStatusLocal,
      UI_TEXT.en.assistantStatusUnavailable,
      UI_TEXT.zh.assistantStatusUnavailable,
    ]);

    if (builtInAssistantLabels.has(assistantStatusLabel)) {
      if (
        assistantStatusLabel === UI_TEXT.en.assistantStatusLocal ||
        assistantStatusLabel === UI_TEXT.zh.assistantStatusLocal
      ) {
        setAssistantStatusLabel(UI_TEXT[language].assistantStatusLocal);
      } else if (
        assistantStatusLabel === UI_TEXT.en.assistantStatusUnavailable ||
        assistantStatusLabel === UI_TEXT.zh.assistantStatusUnavailable
      ) {
        setAssistantStatusLabel(UI_TEXT[language].assistantStatusUnavailable);
      } else {
        setAssistantStatusLabel(UI_TEXT[language].assistantStatusContext);
      }
    }
  }, [assistantStatusLabel, language]);

  useEffect(() => {
    const canvas = document.getElementById("antigravity-particles");
    if (canvas) {
      if (currentPage === "match-centre") {
        canvas.classList.remove("particle-canvas--hidden");
      } else {
        canvas.classList.add("particle-canvas--hidden");
      }
    }
  }, [currentPage]);

  useEffect(() => {
    let cancelled = false;

    getVideoEngineHealth()
      .then((payload) => {
        if (!cancelled) {
          setEngineStatus(payload.ffmpegAvailable ? "ready" : "offline");
        }
      })
      .catch(() => {
        if (!cancelled) {
          setEngineStatus("offline");
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!availableTeams.length) {
      return;
    }
    if (!availableTeams.includes(analysisTeam)) {
      setAnalysisTeam(availableTeams[0]);
    }
  }, [analysisTeam, availableTeams]);

  useEffect(() => {
    if (!opponents.length) {
      setLeftOpponent("");
      setRightOpponent("");
      return;
    }

    if (!leftOpponent || !opponents.includes(leftOpponent)) {
      setLeftOpponent(opponents[0]);
    }

    if (!rightOpponent || !opponents.includes(rightOpponent)) {
      setRightOpponent(opponents[1] ?? opponents[0]);
    }
  }, [leftOpponent, opponents, rightOpponent]);

  const normalizedTeamPossessions = normalizePossessionSet(teamPossessions);
  const filtered = filterPossessions(normalizedTeamPossessions, filters);
  const deferredFiltered = useDeferredValue(filtered);
  const ranked = rankRepresentativePossessions(
    normalizedTeamPossessions,
    filters,
    activeSignal,
    undefined,
    language,
  );
  const deferredRanked = useDeferredValue(ranked);
  const summaries = buildSignalSummaries(deferredFiltered);
  const summaryMetrics = computeSummaryMetrics(deferredFiltered);
  const formations = getFormationTendencies(deferredFiltered);
  const actionBuckets = getActionValueBuckets(deferredFiltered);
  const headlineMoments = deferredRanked.slice(0, 3);
  const timelineMoments = [...deferredRanked].sort((left, right) => {
    const leftTime = left.videoStartSec ?? left.minute * 60;
    const rightTime = right.videoStartSec ?? right.minute * 60;
    return leftTime - rightTime;
  });
  const contextLabel = buildContextLockLabel(filters, language);
  const focusPossession =
    deferredRanked.find((possession) => possession.id === focusId) ??
    timelineMoments.find((possession) => possession.id === focusId) ??
    deferredRanked[0] ??
    timelineMoments[0] ??
    null;

  const playerSrc = focusPossession
    ? playerMode === "full"
      ? focusPossession.fullVideoUrl ?? focusPossession.videoClipUrl ?? ""
      : focusPossession.videoClipUrl ?? focusPossession.fullVideoUrl ?? ""
    : "";

  const comparisonLabel =
    comparisonMetricOptions.find((metric) => metric.key === comparisonMetric)
      ?.label ?? comparisonMetric;
  const activePreset =
    quickPresets.find((preset) => preset.id === activePresetId) ?? null;

  const leftComparison = leftOpponent
    ? buildComparisonSet(
        normalizedTeamPossessions,
        activeSignal,
        filters,
        leftOpponent,
        undefined,
        language,
      )
    : [];
  const rightComparison = rightOpponent
    ? buildComparisonSet(
        normalizedTeamPossessions,
        activeSignal,
        filters,
        rightOpponent,
        undefined,
        language,
      )
    : [];
  const comparisonResult = comparePossessionGroups(
    leftComparison,
    rightComparison,
    leftOpponent || ui.laneA,
    rightOpponent || ui.laneB,
    language,
  );
  const comparisonText = comparisonResult.summary;

  const leftComparisonMetric = metricValue(
    leftComparison.map((item) => item[comparisonMetric]),
  );
  const rightComparisonMetric = metricValue(
    rightComparison.map((item) => item[comparisonMetric]),
  );

  const opponentBoard = opponents
    .map((opponent) => {
      const scoped = filterPossessions(normalizedTeamPossessions, {
        ...filters,
        opponent,
      });
      const count = scoped.length;
      const averageThreat = count
        ? scoped.reduce((sum, possession) => sum + possession.xThreat, 0) / count
        : 0;
      const averageActionValue = count
        ? scoped.reduce((sum, possession) => sum + possession.actionValue, 0) / count
        : 0;

      return {
        opponent,
        count,
        averageThreat,
        averageActionValue,
      };
    })
    .sort((left, right) => {
      if (right.averageThreat !== left.averageThreat) {
        return right.averageThreat - left.averageThreat;
      }
      return right.count - left.count;
    });

  const scenarioSummary = [
    {
      label: ui.scenarioSummary,
      value: activePreset?.label ?? ui.customLock,
      meta:
        activePreset?.description ??
        ui.customLockMeta,
    },
    {
      label: ui.activeSignalLabel,
      value: signalLabel(activeSignal, language),
      meta: ui.rankedClipMeta(deferredRanked.length),
    },
    {
      label: ui.currentLock,
      value: contextLabel,
      meta: ui.scopeMeta(deferredFiltered.length),
    },
    {
      label: ui.focusClip,
      value: focusPossession?.title ?? ui.noClipSelected,
      meta: focusPossession
        ? `${focusPossession.opponent} · ${phaseLabel(focusPossession.phase, language)} · ${focusPossession.minute}'`
        : ui.chooseScenarioMeta,
    },
  ];
  const summaryMetricCards = [
    {
      label: language === "zh" ? "左路出球占比" : "Left-lane build-up share",
      value: percentLabel(summaryMetrics.laneShare["Left lane"]),
      meta:
        language === "zh"
          ? "当前锁定条件下起脚于左路的回合比例"
          : "Share of matched possessions developing through the left lane",
    },
    {
      label: language === "zh" ? "平均推进距离" : "Average progression",
      value: `${summaryMetrics.averageProgressionDistance.toFixed(1)}m`,
      meta:
        language === "zh"
          ? "从回合起点到最深推进位置的平均距离"
          : "Average field gain from start point to furthest progression",
    },
    {
      label:
        language === "zh" ? "进入中场前传球数" : "Passes before middle-third access",
      value: summaryMetrics.averagePassesBeforeMiddleThird.toFixed(1),
      meta:
        language === "zh"
          ? "到达中场前平均需要的传球数"
          : "Average passes required before entering the middle third",
    },
    {
      label:
        language === "zh" ? "过半场前失误率" : "Turnover-before-midline rate",
      value: percentLabel(summaryMetrics.turnoverBeforeMidlineRate),
      meta:
        language === "zh"
          ? "在过半场前丢失球权的比例"
          : "Share of possessions that end in a turnover before midfield",
    },
    {
      label: language === "zh" ? "成功进入中场率" : "Success-to-middle-third rate",
      value: percentLabel(summaryMetrics.successToMiddleThirdRate),
      meta:
        language === "zh"
          ? "成功推进到中场的回合比例"
          : "Share of possessions that successfully reach the middle third",
    },
  ];

  const exportNote = buildExportNote({
    filters,
    activeSignal,
    ranked: deferredRanked,
    leftOpponent: leftOpponent || ui.laneA,
    rightOpponent: rightOpponent || ui.laneB,
    comparisonText,
    language,
  });

  const assistantQuickPrompts = [
    focusPossession
      ? ui.assistantPromptWhy(focusPossession.title)
      : ui.assistantPromptTakeaway,
    ui.assistantPromptCompare(leftOpponent || ui.laneA, rightOpponent || ui.laneB),
    ui.assistantPromptCoach(signalLabel(activeSignal, language)),
    ui.assistantPromptLock,
  ];

  const timelineRangeSec =
    videoSummary?.videoDurationSec ??
    Math.max(
      90 * 60,
      ...timelineMoments.map((moment) => (moment.videoEndSec ?? moment.minute * 60) + 1),
    );
  const timelineMarks = videoSummary
    ? [0, timelineRangeSec / 3, (timelineRangeSec / 3) * 2, timelineRangeSec]
    : [0, 30 * 60, 60 * 60, 90 * 60];

  useEffect(() => {
    if (!focusPossession && deferredRanked[0]) {
      setFocusId(deferredRanked[0].id);
    }
  }, [deferredRanked, focusPossession]);

  const resetAssistantThread = (signal: TacticalSignal = activeSignal) => {
    setAssistantMessages([buildAssistantWelcome(signal, language)]);
    setAssistantDraft("");
    setAssistantStatusLabel(ui.assistantStatusContext);
  };

  useEffect(() => {
    const player = videoRef.current;
    if (!player) {
      setVideoPlaying(false);
      setVideoProgress(0);
      return;
    }

    player.pause();
    setVideoPlaying(false);
    setVideoProgress(0);

    if (playerMode === "full" && focusPossession?.videoStartSec != null && player.readyState >= 1) {
      player.currentTime = focusPossession.videoStartSec;
      syncVideoMetrics();
    }
  }, [focusPossession?.id, playerMode, playerSrc]);

  const syncVideoMetrics = () => {
    const player = videoRef.current;
    if (!player || !focusPossession) {
      setVideoPlaying(false);
      setVideoProgress(0);
      return;
    }

    if (playerMode === "full" && focusPossession.videoStartSec != null) {
      const startSec = focusPossession.videoStartSec;
      const endSec = focusPossession.videoEndSec ?? player.duration ?? startSec + 1;
      const windowDuration = Math.max(1, endSec - startSec);
      const relativeProgress = _clamp01((player.currentTime - startSec) / windowDuration);
      setVideoProgress(relativeProgress);
    } else {
      const duration = Number.isFinite(player.duration) && player.duration > 0 ? player.duration : 1;
      setVideoProgress(_clamp01(player.currentTime / duration));
    }

    setVideoPlaying(!player.paused && !player.ended);
  };

  const seekFullVideoToFocus = () => {
    const player = videoRef.current;
    if (!player || focusPossession?.videoStartSec == null) {
      return;
    }

    if (player.readyState >= 1) {
      player.currentTime = focusPossession.videoStartSec;
      syncVideoMetrics();
    }
  };

  const togglePlayback = async () => {
    const player = videoRef.current;
    if (!player || !playerSrc) {
      return;
    }

    if (!player.paused && !player.ended) {
      player.pause();
      return;
    }

    if (playerMode === "full" && focusPossession?.videoStartSec != null) {
      const startSec = focusPossession.videoStartSec;
      const endSec = focusPossession.videoEndSec ?? startSec + 1;
      if (player.currentTime < startSec || player.currentTime > endSec) {
        player.currentTime = startSec;
      }
    } else if (player.ended || videoProgress >= 1) {
      player.currentTime = 0;
    }

    await player.play().catch(() => undefined);
  };

  const applyVideoResult = (result: VideoAnalysisResult, sourceLabel: string) => {
    const normalizedPossessions = normalizePossessionSet(result.possessions);
    startTransition(() => {
      setSourceMode("video");
      setVideoSummary(result.summary);
      setSourcePossessions(normalizedPossessions);
      setDatasetLabel(result.datasetLabel);
      setAnalysisTeam(result.analysisTeam);
      setFilters(defaultScenarioFilters);
      setActiveSignal("Left overload release");
      setActivePresetId("mvp-build-up");
      setFocusView("overview");
      setFocusId(normalizedPossessions[0]?.id ?? "");
      setPlayerMode("clip");
    });
    resetAssistantThread("Left overload release");
    setIngestStatus(
      language === "zh"
        ? `已分析 ${sourceLabel}：从 ${result.summary.videoDurationLabel} 的视频中抽取出 ${result.summary.momentCount} 个候选片段。`
        : `Analyzed ${sourceLabel}: ${result.summary.momentCount} candidate clips were extracted from ${result.summary.videoDurationLabel}.`,
    );
  };

  const updateFilter = <K extends keyof ContextFilters>(
    key: K,
    value: ContextFilters[K],
  ) => {
    startTransition(() => {
      setActivePresetId("custom");
      setFilters((current) => ({
        ...current,
        [key]: value,
      }));
    });
  };

  const handleMinuteRangeChange = (index: 0 | 1, rawValue: number) => {
    startTransition(() => {
      setActivePresetId("custom");
      setFilters((current) => {
        const nextRange: MinuteRange =
          index === 0
            ? [rawValue, current.minuteRange[1]]
            : [current.minuteRange[0], rawValue];

        return {
          ...current,
          timeWindow: "All windows",
          minuteRange: clampMinuteRange(nextRange),
        };
      });
    });
  };

  const handleTimeWindowChange = (timeWindow: TimeWindow) => {
    startTransition(() => {
      setActivePresetId("custom");
      setFilters((current) => ({
        ...current,
        timeWindow,
        minuteRange: timeWindowToRange(timeWindow),
      }));
    });
  };

  const applyPreset = (presetId: string) => {
    const preset = quickPresets.find((item) => item.id === presetId);
    if (!preset) {
      return;
    }

    startTransition(() => {
      setActivePresetId(preset.id);
      setFilters(preset.filters);
      setActiveSignal(preset.signal);
    });
  };

  const handleSignalSelection = (signal: TacticalSignal) => {
    startTransition(() => {
      setActivePresetId("custom");
      setActiveSignal(signal);
    });
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(exportNote);
      setCopyStatus(language === "zh" ? "已复制到剪贴板。" : "Copied to clipboard.");
    } catch {
      setCopyStatus(
        language === "zh"
          ? "剪贴板权限不可用，请改用下载。"
          : "Clipboard permission blocked. Use download instead.",
      );
    }
  };

  const downloadBlob = (content: string, filename: string, type: string) => {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const handleDownload = () => {
    downloadBlob(exportNote, "pitchlens-note.md", "text/markdown;charset=utf-8");
  };

  const handleDownloadCurrentJson = () => {
    downloadBlob(
      JSON.stringify(teamPossessions, null, 2),
      `${analysisTeam.toLowerCase().replace(/\s+/g, "-")}-pitchlens.json`,
      "application/json;charset=utf-8",
    );
  };

  const handleDownloadCurrentCsv = () => {
    downloadBlob(
      serializePossessionsToCsv(teamPossessions),
      `${analysisTeam.toLowerCase().replace(/\s+/g, "-")}-pitchlens.csv`,
      "text/csv;charset=utf-8",
    );
  };

  const applyImportedDataset = (
    dataset: {
      datasetLabel: string;
      possessions: Possession[];
      availableTeams: string[];
    },
    options?: {
      datasetLabel?: string;
      preferredTeam?: string;
    },
  ) => {
    const nextDatasetLabel = options?.datasetLabel || dataset.datasetLabel;
    const nextTeam =
      (options?.preferredTeam &&
      dataset.availableTeams.includes(options.preferredTeam)
        ? options.preferredTeam
        : null) ??
      dataset.availableTeams[0] ??
      TARGET_TEAM;

    startTransition(() => {
      setSourceMode("events");
      setVideoSummary(null);
      setSourcePossessions(normalizePossessionSet(dataset.possessions));
      setDatasetLabel(nextDatasetLabel);
      setAnalysisTeam(nextTeam);
      setFilters(defaultScenarioFilters);
      setActiveSignal("Left overload release");
      setActivePresetId("mvp-build-up");
      setFocusView("overview");
      setFocusId(dataset.possessions[0]?.id ?? "");
      setPlayerMode("clip");
    });
    resetAssistantThread("Left overload release");
  };

  const assistantAnalysisTeam =
    sourceMode === "sample"
      ? language === "zh"
        ? "当前球队"
        : "the current team"
      : analysisTeam;

  const submitAssistantQuestion = async (questionText: string) => {
    const question = questionText.trim();
    if (!question || isAssistantLoading) {
      return;
    }

    const userMessage: AssistantMessage = {
      id: buildMessageId(),
      role: "user",
      content: question,
    };

    const nextConversation = [...assistantMessages, userMessage];
    setAssistantMessages(nextConversation);
    setAssistantDraft("");
    setIsAssistantLoading(true);

    try {
      const response = await askAssistant({
        question,
        conversation: nextConversation
          .slice(-8)
          .map(({ role, content }) => ({ role, content })),
        datasetLabel,
        analysisTeam: assistantAnalysisTeam,
        contextLock: contextLabel,
        activeSignal,
        comparisonMetricLabel: comparisonLabel,
        comparisonText,
        leftOpponent: leftOpponent || ui.laneA,
        rightOpponent: rightOpponent || ui.laneB,
        filteredCount: deferredFiltered.length,
        teamClipCount: teamPossessions.length,
        focusPossession,
        rankedPossessions: deferredRanked.slice(0, 5),
        videoSummary,
        exportNote,
      });

      setAssistantMessages((current) => [
        ...current,
        {
          id: buildMessageId(),
          role: "assistant",
          content: response.answer,
          meta:
            response.mode === "local" ? ui.assistantStatusLocal : response.model,
        },
      ]);
      setAssistantStatusLabel(
        response.mode === "local" ? ui.assistantStatusLocal : response.model,
      );
    } catch (error) {
      setAssistantMessages((current) => [
        ...current,
        {
          id: buildMessageId(),
          role: "assistant",
          content:
            error instanceof Error
              ? error.message
              : language === "zh"
                ? "助手请求失败。"
                : "Assistant request failed.",
          meta: ui.assistantStatusUnavailable,
        },
      ]);
      setAssistantStatusLabel(ui.assistantStatusUnavailable);
    } finally {
      setIsAssistantLoading(false);
    }
  };

  const handleAssistantSend = async () => {
    await submitAssistantQuestion(assistantDraft);
  };

  const handleAssistantPrompt = async (prompt: string) => {
    setAssistantDraft(prompt);
    await submitAssistantQuestion(prompt);
  };

  const loadStatsBombMatchesForCompetition = async (
    competitionKey: string,
    competitionList: StatsBombCompetition[] = statsBombCompetitions,
  ) => {
    const competition = competitionList.find((item) => item.key === competitionKey);
    if (!competition) {
      return;
    }

    setIsStatsBombLoading(true);
    setIngestError("");
    setIngestStatus(
      language === "zh"
        ? "正在读取免费 StatsBomb 比赛列表..."
        : "Loading free StatsBomb match list...",
    );

    try {
      const matches = await getStatsBombMatches(
        competition.competitionId,
        competition.seasonId,
      );
      setSelectedCompetitionKey(competitionKey);
      setStatsBombMatches(matches);
      setStatsBombMatchQuery("");
      setSelectedMatchIds(matches.slice(0, Math.min(2, matches.length)).map((match) => match.matchId));
      setIngestStatus(
        language === "zh"
          ? `已加载 ${matches.length} 场免费比赛。`
          : `Loaded ${matches.length} free matches.`,
      );
    } catch (error) {
      setIngestError(
        error instanceof Error
          ? error.message
          : language === "zh"
            ? "无法加载 StatsBomb 比赛列表。"
            : "Could not load StatsBomb matches.",
      );
    } finally {
      setIsStatsBombLoading(false);
    }
  };

  const ensureStatsBombCatalog = async () => {
    if (statsBombCompetitions.length) {
      return;
    }

    setIsStatsBombLoading(true);
    setIngestError("");
    setIngestStatus(
      language === "zh"
        ? "正在连接免费 StatsBomb Open Data..."
        : "Connecting to free StatsBomb Open Data...",
    );

    try {
      const competitions = await getStatsBombCompetitions();
      setStatsBombCompetitions(competitions);
      const firstCompetition = competitions[0];
      if (firstCompetition) {
        await loadStatsBombMatchesForCompetition(firstCompetition.key, competitions);
      } else {
        setIngestStatus(
          language === "zh"
            ? "没有可用的 StatsBomb 开放数据。"
            : "No StatsBomb open-data competitions available.",
        );
      }
    } catch (error) {
      setIngestError(
        error instanceof Error
          ? error.message
          : language === "zh"
            ? "无法连接 StatsBomb 开放数据。"
            : "Could not connect to StatsBomb Open Data.",
      );
    } finally {
      setIsStatsBombLoading(false);
    }
  };

  const handleStatsBombImport = async () => {
    if (!selectedMatchIds.length) {
      setIngestError(
        language === "zh"
          ? "请至少选择一场免费比赛。"
          : "Select at least one free match.",
      );
      return;
    }

    setIsStatsBombLoading(true);
    setIngestError("");
    setIngestStatus(
      language === "zh"
        ? "正在导入免费 StatsBomb 比赛事件..."
        : "Importing free StatsBomb match events...",
    );

    try {
      const payload = await importStatsBombMatches(selectedMatchIds);
      const dataset = parseImportedDataset(payload.files);
      const selectedMatches = statsBombMatches.filter((match) =>
        selectedMatchIds.includes(match.matchId),
      );
      const sharedTeam =
        selectedMatches.length > 1
          ? [selectedMatches[0].homeTeam, selectedMatches[0].awayTeam].find((team) =>
              selectedMatches.every(
                (match) => match.homeTeam === team || match.awayTeam === team,
              ),
            )
          : selectedMatches[0]
            ? selectedMatches[0].homeTeam
            : undefined;

      applyImportedDataset(dataset, {
        datasetLabel: payload.datasetLabel,
        preferredTeam: sharedTeam,
      });
      setIngestStatus(
        language === "zh"
          ? `已导入 ${selectedMatchIds.length} 场免费 StatsBomb 比赛。`
          : `Imported ${selectedMatchIds.length} free StatsBomb matches.`,
      );
    } catch (error) {
      setIngestError(
        error instanceof Error
          ? error.message
          : language === "zh"
            ? "免费比赛导入失败。"
            : "Free match import failed.",
      );
    } finally {
      setIsStatsBombLoading(false);
    }
  };

  const toggleStatsBombMatch = (matchId: number) => {
    setSelectedMatchIds((current) =>
      current.includes(matchId)
        ? current.filter((id) => id !== matchId)
        : [...current, matchId],
    );
  };

  const importDataFiles = async (files: File[]) => {
    try {
      setIngestError("");
      setIngestStatus(
        language === "zh"
          ? "正在解析结构化事件文件..."
          : "Parsing structured event files...",
      );
      const imported = await Promise.all(
        files.map(async (file) => ({
          name: file.name,
          text: await file.text(),
        })),
      );
      const dataset = parseImportedDataset(imported);
      applyImportedDataset(dataset);
      setIngestStatus(
        language === "zh"
          ? `已从 ${dataset.datasetLabel} 导入 ${dataset.possessions.length} 个片段。`
          : `Imported ${dataset.possessions.length} clips from ${dataset.datasetLabel}.`,
      );
    } catch (error) {
      setIngestError(error instanceof Error ? error.message : language === "zh" ? "导入失败。" : "Import failed.");
      setIngestStatus(
        language === "zh"
          ? "结构化数据导入失败。"
          : "Structured data import failed.",
      );
    }
  };

  const analyzeVideo = async (file: File) => {
    if (engineStatus === "offline") {
      setIngestError(
        language === "zh"
          ? "视频引擎离线，请先启动 8000 端口上的 FastAPI 服务。"
          : "Video engine offline. Start the FastAPI service on port 8000.",
      );
      return;
    }

    try {
      setIngestError("");
      setIsVideoAnalyzing(true);
      setIngestStatus(
        language === "zh"
          ? `正在分析 ${file.name}，提取视觉片段和候选时刻...`
          : `Analyzing ${file.name}... extracting visual moments and clips.`,
      );
      const result = await analyzeVideoFile(file, videoInput);
      applyVideoResult(result, file.name);
    } catch (error) {
      setIngestError(error instanceof Error ? error.message : language === "zh" ? "视频分析失败。" : "Video analysis failed.");
      setIngestStatus(language === "zh" ? "视频分析失败。" : "Video analysis failed.");
    } finally {
      setIsVideoAnalyzing(false);
    }
  };

  const handleStructuredInputChange = async (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const nextFiles = Array.from(event.target.files ?? []);
    if (!nextFiles.length) {
      return;
    }
    await importDataFiles(nextFiles);
    event.target.value = "";
  };

  const handleVideoInputChange = async (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const nextFile = event.target.files?.[0];
    if (!nextFile) {
      return;
    }
    await analyzeVideo(nextFile);
    event.target.value = "";
  };

  const handleDroppedFiles = async (files: File[]) => {
    if (!files.length) {
      return;
    }

    const videoFiles = files.filter((file) => file.type.startsWith("video/") || fileMatches(file, VIDEO_EXTENSIONS));
    const dataFiles = files.filter((file) => fileMatches(file, DATA_EXTENSIONS));

    if (videoFiles.length && dataFiles.length) {
      setIngestError(
        language === "zh"
          ? "请只拖入一个视频文件，或者一组 CSV/JSON 文件，不能混合上传。"
          : "Drop either one video file or one or more CSV/JSON files, not both.",
      );
      return;
    }

    if (videoFiles.length > 1) {
      setIngestError(
        language === "zh"
          ? "一次只能上传一个视频，以保证提取片段与时间轴保持一致。"
          : "Upload one video at a time so the extracted clips stay aligned.",
      );
      return;
    }

    if (videoFiles.length === 1) {
      await analyzeVideo(videoFiles[0]);
      return;
    }

    if (dataFiles.length) {
      await importDataFiles(dataFiles);
      return;
    }

    setIngestError(
      language === "zh"
        ? "文件类型不支持，请上传一个视频或 CSV/JSON 数据文件。"
        : "Unsupported files. Use one video or CSV/JSON data files.",
    );
  };

  const loadBundledDemo = async () => {
    try {
      setIngestError("");
      setIngestStatus(
        language === "zh"
          ? "正在加载内置真实比赛示例..."
          : "Loading bundled real match demo...",
      );
      const manifestResponse = await fetch("/demo/statsbomb-arsenal-wfc/manifest.json");
      const manifest = (await manifestResponse.json()) as {
        datasetLabel: string;
        analysisTeam: string;
        files: string[];
      };

      const imported = await Promise.all(
        manifest.files.map(async (fileName) => {
          const response = await fetch(`/demo/statsbomb-arsenal-wfc/${fileName}`);
          return {
            name: fileName,
            text: await response.text(),
          };
        }),
      );

      const dataset = parseImportedDataset(imported);
      applyImportedDataset(dataset, {
        datasetLabel: manifest.datasetLabel,
        preferredTeam: manifest.analysisTeam,
      });
      setIngestStatus(
        language === "zh"
          ? `已加载 ${manifest.datasetLabel}。`
          : `Loaded ${manifest.datasetLabel}.`,
      );
    } catch (error) {
      setIngestError(
        error instanceof Error
          ? error.message
          : language === "zh"
            ? "无法加载内置示例。"
            : "Could not load bundled demo.",
      );
      setIngestStatus(
        language === "zh"
          ? "内置示例加载失败。"
          : "Bundled demo load failed.",
      );
    }
  };

  return (
    <div className="app-shell">
      <div className={`app-background ${currentPage === "match-centre" ? "" : "app-background--hidden"}`} />
      <header className="global-header">
        <div className="brand-lockup">
          <div className="brand-mark" style={{ background: "transparent", border: "none", boxShadow: "none", padding: 0, width: "32px", height: "32px", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <img src="/gt-logo.svg" alt="GT Logo" style={{ width: "100%", height: "100%", objectFit: "contain" }} />
          </div>
          <div>
            <p>GT</p>
            <span>{ui.brandSubtitle}</span>
          </div>
        </div>
        <nav className="header-nav" aria-label="Primary">
          {headerChannels.map((channel) => (
            <button
              key={channel.id}
              onClick={() => setCurrentPage(channel.id)}
              className={currentPage === channel.id ? "ghost-button active-nav-button" : "ghost-button"}
            >
              {channel.label}
            </button>
          ))}
        </nav>
        <div className="header-status">
          <span>{ui.engine}</span>
          <strong>
            {isVideoAnalyzing
              ? ui.analyzing
              : engineStatus === "ready"
                ? ui.ready
                : engineStatus === "offline"
                  ? ui.offline
                  : ui.checking}
          </strong>
        </div>
      </header>

      {currentPage === "match-centre" && (
        <div className="page-section">
          <div className="antigravity-hero-container">
            <div
              className="big-logo-icon"
              style={{ margin: "0 auto 24px auto", background: "transparent" }}
            >
              <img
                src="/gt-logo.svg"
                alt="GT Logo"
                style={{
                  width: "100%",
                  height: "100%",
                  objectFit: "contain",
                  transform: "scale(1.2)",
                }}
              />
            </div>
            <div
              className="company-name"
              style={{
                textAlign: "center",
                textTransform: "uppercase",
                letterSpacing: "0.5px",
                color: "var(--muted)",
                fontWeight: 500,
                fontSize: "16px",
              }}
            >
              Wentao Mou
            </div>
            <h1 className="antigravity-hero-text">
              {language === "zh"
                ? "PitchLens 事件分析工作流"
                : "PitchLens event-first workflow"}
            </h1>
            <p
              className="subtitle"
              style={{
                textAlign: "center",
                marginBottom: 0,
                fontSize: "18px",
                color: "var(--muted)",
                maxWidth: "760px",
                margin: "0 auto",
              }}
            >
              {language === "zh"
                ? "Find representative possessions, compare matched contexts, and export evidence-backed tactical notes."
                : "Find representative possessions, compare matched contexts, and export evidence-backed tactical notes."}
            </p>
          </div>

          <section className="panel summary-panel" id="match-centre">
            <div className="panel-heading">
              <div>
                <p className="eyebrow">Overview</p>
                <h2>
                  {language === "zh" ? "概览" : "Overview"}
                </h2>
              </div>
            </div>

            <div className="scenario-summary-grid">
              <article className="scenario-summary-card">
                <span>{language === "zh" ? "数据集" : "Dataset"}</span>
                <strong>{datasetLabel}</strong>
                <small>
                  {sourceMode === "video" && videoSummary
                    ? language === "zh"
                      ? `${videoSummary.momentCount} 个视频片段已归一化为回合`
                      : `${videoSummary.momentCount} video clips normalized into possessions`
                    : language === "zh"
                      ? `${normalizedTeamPossessions.length} 个回合可参与事件分析`
                      : `${normalizedTeamPossessions.length} possessions available for event analysis`}
                </small>
              </article>
              <article className="scenario-summary-card">
                <span>{language === "zh" ? "当前锁定" : "Current lock"}</span>
                <strong>{contextLabel}</strong>
                <small>
                  {language === "zh"
                    ? `${deferredFiltered.length} 个回合仍在上下文内`
                    : `${deferredFiltered.length} possessions remain inside the active context`}
                </small>
              </article>
              <article className="scenario-summary-card">
                <span>{language === "zh" ? "当前信号" : "Active signal"}</span>
                <strong>{signalLabel(activeSignal, language)}</strong>
                <small>
                  {language === "zh"
                    ? `${deferredRanked.length} 个代表性回合已排序`
                    : `${deferredRanked.length} representative possessions are ranked`}
                </small>
              </article>
              <article className="scenario-summary-card">
                <span>{language === "zh" ? "当前对比" : "Current comparison"}</span>
                <strong>{`${leftOpponent || ui.laneA} vs ${rightOpponent || ui.laneB}`}</strong>
                <small>
                  {comparisonMetricLabel(comparisonMetric, language)} ·{" "}
                  {metricFormatter(
                    comparisonMetric,
                    Math.max(leftComparisonMetric, rightComparisonMetric),
                  )}
                </small>
              </article>
            </div>

            <div className="summary-list">
              {headlineMoments.length === 0 ? (
                <div className="summary-row summary-row--empty">{ui.noEvidence}</div>
              ) : (
                headlineMoments.map((moment) => (
                  <article key={moment.id} className="summary-row">
                    <span>
                      {moment.matchLabel} ·{" "}
                      {moment.videoStartSec != null
                        ? formatClock(moment.videoStartSec)
                        : `${moment.minute}'`}
                    </span>
                    <strong>{moment.title}</strong>
                  </article>
                ))
              )}
            </div>
          </section>
        </div>
      )}


      <main className="workspace-grid">
        {currentPage === "context-lock" && (
          <div className="page-section">
        <section className="panel filters-panel" id="context-lock">
          <div className="panel-heading">
            <div>
              <SectionTypewriter text={ui.filtersTitle} />
            </div>
          </div>
          <div className="filter-grid">
            <label>
              {ui.analysisTeam}
              <select
                value={analysisTeam}
                onChange={(event) => setAnalysisTeam(event.target.value)}
              >
                {availableTeams.map((team) => (
                  <option key={team}>{team}</option>
                ))}
              </select>
            </label>
            <label>
              {ui.opponentScope}
              <select
                value={filters.opponent}
                onChange={(event) => updateFilter("opponent", event.target.value)}
              >
                <option value="All opponents">{ui.allOpponents}</option>
                {opponents.map((opponent) => (
                  <option key={opponent}>{opponent}</option>
                ))}
              </select>
            </label>
            <label>
              {ui.gameState}
              <select
                value={filters.gameState}
                onChange={(event) =>
                  updateFilter(
                    "gameState",
                    event.target.value as ContextFilters["gameState"],
                  )
                }
              >
                <option value="All states">{gameStateLabel("All states", language)}</option>
                <option value="Winning">{gameStateLabel("Winning", language)}</option>
                <option value="Drawing">{gameStateLabel("Drawing", language)}</option>
                <option value="Losing">{gameStateLabel("Losing", language)}</option>
              </select>
            </label>
            <label>
              {ui.phase}
              <select
                value={filters.phase}
                onChange={(event) =>
                  updateFilter("phase", event.target.value as ContextFilters["phase"])
                }
              >
                <option value="All phases">{phaseLabel("All phases", language)}</option>
                <option value="Build-up">{phaseLabel("Build-up", language)}</option>
                <option value="Press resistance">{phaseLabel("Press resistance", language)}</option>
                <option value="Sustained attack">{phaseLabel("Sustained attack", language)}</option>
                <option value="Transition">{phaseLabel("Transition", language)}</option>
              </select>
            </label>
            <label>
              {language === "zh" ? "起始区域" : "Start zone"}
              <select
                value={filters.startZone}
                onChange={(event) =>
                  updateFilter(
                    "startZone",
                    event.target.value as ContextFilters["startZone"],
                  )
                }
              >
                <option value="All start zones">
                  {startZoneLabel("All start zones", language)}
                </option>
                {getAvailableStartZones().map((zone) => (
                  <option key={zone} value={zone}>
                    {startZoneLabel(zone, language)}
                  </option>
                ))}
              </select>
            </label>
            <label>
              {ui.zone}
              <select
                value={filters.zone}
                onChange={(event) =>
                  updateFilter("zone", event.target.value as ContextFilters["zone"])
                }
              >
                <option value="All zones">{zoneLabel("All zones", language)}</option>
                <option value="Left lane">{zoneLabel("Left lane", language)}</option>
                <option value="Central lane">{zoneLabel("Central lane", language)}</option>
                <option value="Right lane">{zoneLabel("Right lane", language)}</option>
              </select>
            </label>
            <label>
              {ui.timeWindow}
              <select
                value={filters.timeWindow}
                onChange={(event) =>
                  handleTimeWindowChange(event.target.value as TimeWindow)
                }
              >
                <option value="All windows">{timeWindowLabel("All windows", language)}</option>
                <option value="0-30">{timeWindowLabel("0-30", language)}</option>
                <option value="31-60">{timeWindowLabel("31-60", language)}</option>
                <option value="61-90">{timeWindowLabel("61-90", language)}</option>
              </select>
            </label>
          </div>

          <div className="minute-brush">
            <div className="minute-brush-head">
              <span>{ui.minuteRange}</span>
              <strong>{buildMinuteRangeLabel(filters.minuteRange)}</strong>
            </div>
            <div className="minute-brush-track">
              <div
                className="minute-brush-selection"
                style={{
                  left: `${(filters.minuteRange[0] / 90) * 100}%`,
                  width: `${((filters.minuteRange[1] - filters.minuteRange[0]) / 90) * 100}%`,
                }}
              />
              <input
                type="range"
                min="0"
                max="90"
                value={filters.minuteRange[0]}
                onChange={(event) =>
                  handleMinuteRangeChange(0, Number(event.target.value))
                }
              />
              <input
                type="range"
                min="0"
                max="90"
                value={filters.minuteRange[1]}
                onChange={(event) =>
                  handleMinuteRangeChange(1, Number(event.target.value))
                }
              />
            </div>
            <div className="minute-brush-scale">
              <span>0'</span>
              <span>45'</span>
              <span>90'</span>
            </div>
          </div>

          <div className="method-note">
            <p>{language === "zh" ? "Retrieval" : "Retrieval"}</p>
            <strong>
              S(p) = 0.52 signal + 0.28 context + 0.20 diversity
            </strong>
          </div>
        </section>
      </div>
        )}

        {currentPage === "rankings" && (
          <div className="page-section page-section--rankings">
        <section className="panel summary-panel">
            <div className="panel-heading panel-heading--rankings">
              <div>
                <p className="eyebrow">{ui.scenariosEyebrow}</p>
                <h2>{ui.scenariosTitle}</h2>
              </div>
            </div>

            <div className="scenario-summary-grid">
              {scenarioSummary.map((item) => (
                <article key={item.label} className="scenario-summary-card">
                  <span>{item.label}</span>
                  <strong>{item.value}</strong>
                  <small>{item.meta}</small>
                </article>
              ))}
            </div>

            <div className="panel-heading panel-heading--subsection">
              <div>
                <p className="eyebrow">
                  {language === "zh" ? "摘要指标" : "Summary metrics"}
                </p>
                <h3>
                  {language === "zh"
                    ? "当前上下文下的事件指标"
                    : "Event metrics under the active lock"}
                </h3>
              </div>
            </div>

            <div className="scenario-summary-grid">
              {summaryMetricCards.map((item) => (
                <article key={item.label} className="scenario-summary-card">
                  <span>{item.label}</span>
                  <strong>{item.value}</strong>
                  <small>{item.meta}</small>
                </article>
              ))}
            </div>

            <div className="preset-grid preset-grid--rankings">
              {quickPresets.map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  className={activePresetId === preset.id ? "preset-card preset-card--active" : "preset-card"}
                  onClick={() => applyPreset(preset.id)}
                >
                  <div className="preset-card__topline">
                    <span className="preset-card__eyebrow">{ui.scenarioCard}</span>
                    {activePresetId === preset.id ? (
                      <span className="preset-card__state">{ui.activePreset}</span>
                    ) : null}
                  </div>
                  <strong>{preset.label}</strong>
                  <div className="preset-card__chips">
                    {buildPresetTags({ ...preset, language }).map((tag) => (
                      <i key={`${preset.id}-${tag}`} className="preset-chip">
                        {tag}
                      </i>
                    ))}
                  </div>
                </button>
              ))}
            </div>

            <div className="panel-heading panel-heading--subsection">
              <div>
                <p className="eyebrow">{ui.signalOverview}</p>
                <h3>{ui.telemetryTitle}</h3>
              </div>
            </div>
          <div className="statsbomb-signal-grid">
            {summaries.map((summary) => (
              <button
                key={summary.signal}
                type="button"
                className={
                  summary.signal === activeSignal
                    ? "sb-kpi-card sb-kpi-card--active"
                    : "sb-kpi-card"
                }
                onClick={() => handleSignalSelection(summary.signal)}
              >
                <header>
                  <span>{signalLabel(summary.signal, language)}</span>
                  <div className="sb-status-dot" />
                </header>
                <div className="sb-kpi-val">
                  <strong>{summary.count}</strong>
                  <small>{ui.detections}</small>
                </div>
                <footer>
                  <div>
                    <span>{ui.avgXt}</span>
                    <strong>{summary.averageThreat.toFixed(3)}</strong>
                  </div>
                  <div>
                    <span>{ui.avgAv}</span>
                    <strong>{summary.averageActionValue.toFixed(0)}</strong>
                  </div>
                </footer>
              </button>
            ))}
          </div>

          <div className="signal-chart">
            {summaries.map((summary) => {
              const maxCount = Math.max(1, ...summaries.map((item) => item.count));
              return (
                <button
                  key={summary.signal}
                  type="button"
                  className={
                    summary.signal === activeSignal
                      ? "signal-column signal-column--active"
                      : "signal-column"
                  }
                  onClick={() => handleSignalSelection(summary.signal)}
                >
                  <strong>{summary.count}</strong>
                  <div className="signal-column-bar">
                    <i
                      style={{
                        height: `${(summary.count / maxCount) * 100}%`,
                      }}
                    />
                  </div>
                  <span>{signalLabel(summary.signal, language)}</span>
                </button>
              );
            })}
          </div>

          <div className="summary-split">
            <div>
              <h3>{ui.formationTendency}</h3>
              <div className="meter-list">
                {formations.map((item) => (
                  <div key={item.formation} className="meter-row">
                    <span>{item.formation}</span>
                    <div>
                      <i
                        style={{
                          width: `${(item.count / Math.max(1, deferredFiltered.length)) * 100
                            }%`,
                        }}
                      />
                    </div>
                    <strong>{item.count}</strong>
                  </div>
                ))}
              </div>
            </div>
            <div>
              <h3>{ui.actionValueDistribution}</h3>
              <div className="bucket-list">
                <div>
                  <span>{ui.highLeverage}</span>
                  <strong>{actionBuckets.high}</strong>
                </div>
                <div>
                  <span>{ui.mediumLeverage}</span>
                  <strong>{actionBuckets.medium}</strong>
                </div>
                <div>
                  <span>{ui.lowLeverage}</span>
                  <strong>{actionBuckets.low}</strong>
                </div>
              </div>
            </div>
            <div>
              <h3 id="rankings">{ui.opponentBoard}</h3>
              <div className="opponent-board">
                <div className="opponent-board-head">
                  <span>{ui.opponent}</span>
                  <span>{ui.clips}</span>
                  <span>xT</span>
                  <span>AV</span>
                </div>
                {opponentBoard.map((row, index) => (
                  <div key={row.opponent} className="opponent-row">
                    <span>
                      <b>{index + 1}</b> {row.opponent}
                    </span>
                    <span>{row.count}</span>
                    <span>{row.averageThreat.toFixed(2)}</span>
                    <span>{row.averageActionValue.toFixed(0)}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>
          </div>
        )}

        {currentPage === "analysis" && (
          <div className="page-section analysis-page-wrap">
            <div className="deep-dive-workspace">
              {/* LEFT: Sidebar with Clip list and Timeline */}
              <div className="dd-sidebar-left" style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
                <div className="dd-clip-list">
                  <div className="dd-panel-label">
                    <span>{ui.clips}</span>
                    <small>{deferredRanked.length} {ui.results}</small>
                  </div>
                  {deferredRanked.length === 0 ? (
                    <div className="empty-state">{ui.noMatchingClips}</div>
                  ) : (
                    deferredRanked.map((possession, index) => (
                      <button
                        key={possession.id}
                        className={focusId === possession.id ? "dd-clip-card dd-clip-card--active" : "dd-clip-card"}
                        onClick={() => setFocusId(possession.id)}
                      >
                        <div className="dd-clip-num">{index + 1}</div>
                        <div className="dd-clip-body">
                          <div className="dd-clip-title">{possession.title}</div>
                          <div className="dd-clip-meta">
                            {possession.opponent} · {phaseLabel(possession.phase, language)} · {possession.minute}'
                          </div>
                        <div className="dd-clip-scores">
                          <span style={{ color: "#E92727" }}>xT {possession.xThreat.toFixed(3)}</span>
                          <span>AV {possession.actionValue}</span>
                          <span style={{ fontWeight: 600, color: "var(--text)" }}>
                            {possession.ranking.total.toFixed(2)}
                          </span>
                        </div>
                        <div className="mvp-reason-list">
                          {possession.retrievalReasons.slice(0, 2).map((reason) => (
                            <span key={`${possession.id}-${reason.key}`} className="mvp-reason-chip">
                              {reason.label}
                            </span>
                          ))}
                        </div>
                      </div>
                    </button>
                  ))
                  )}
                </div>

                {/* Timeline strip - now pinned in the same left column */}
                <div className="dd-timeline">
                  <div className="dd-panel-title">
                    <span>{ui.tacticalTimeline}</span>
                  </div>
                  <div className="dd-timeline-track">
                    <div className="dd-timeline-line" />
                    {timelineMoments.map((moment) => (
                      <button
                        key={moment.id}
                        className={focusPossession?.id === moment.id ? "dd-timeline-node dd-timeline-node--active" : "dd-timeline-node"}
                        style={{ left: `${((_timelineTime(moment) / timelineRangeSec) * 100).toFixed(2)}%` }}
                        onClick={() => setFocusId(moment.id)}
                        title={`${moment.minute}'`}
                      />
                    ))}
                  </div>
                  <div className="dd-timeline-scale">
                    {timelineMarks.map((mark) => (
                      <span key={mark}>{Math.round(mark / 60)}'</span>
                    ))}
                  </div>
                </div>
              </div>

              {/* CENTER: Spatial/Video Workspace */}
              <div className="dd-pitch-col">
                  <div className="dd-panel-label">
                  <div className="dd-media-switcher">
                    <button 
                      className={isMediaMode === "pitch" ? "active" : ""} 
                      onClick={() => setIsMediaMode("pitch")}
                    >{ui.spatialMap}</button>
                    <button 
                      className={isMediaMode === "video" ? "active" : ""} 
                      onClick={() => setIsMediaMode("video")}
                    >{ui.sourceVideo}</button>
                  </div>
                  <small>{isMediaMode === "pitch" ? ui.tacticalView : ui.broadcastView}</small>
                </div>
                
                {focusPossession ? (
                  <div className="dd-media-container">
                    {isMediaMode === "pitch" ? (
                      <div className="dd-media-pitch-wrap">
                        <MiniPitch possession={focusPossession} language={language} />
                        <div className="dd-pitch-signal">
                          <span className="dd-signal-tag">{signalLabel(focusPossession.primarySignal, language)}</span>
                          {focusPossession.secondarySignals.map(s => (
                            <span key={s} className="dd-signal-tag dd-signal-tag--secondary">{signalLabel(s, language)}</span>
                          ))}
                        </div>
                      </div>
                    ) : (
                      <div className="video-room">
                        <div className="video-screen">
                          {playerSrc ? (
                            <video
                              key={playerSrc}
                              ref={videoRef}
                              src={playerSrc}
                              poster={focusPossession.videoPosterUrl}
                              preload="metadata"
                              playsInline
                              onLoadedMetadata={() => {
                                if (playerMode === "full") {
                                  seekFullVideoToFocus();
                                } else {
                                  syncVideoMetrics();
                                }
                              }}
                              onPlay={() => setVideoPlaying(true)}
                              onPause={() => setVideoPlaying(false)}
                              onEnded={() => {
                                setVideoPlaying(false);
                                setVideoProgress(1);
                              }}
                              onTimeUpdate={syncVideoMetrics}
                            />
                          ) : (
                            <div className="video-placeholder">{ui.noLinkedVideo}</div>
                          )}
                          <div className="video-overlay">
                            <div className="video-overlay-actions">
                              <button
                                type="button"
                                className="video-control"
                                onClick={togglePlayback}
                              >
                                {videoPlaying ? ui.pause : videoProgress >= 1 ? ui.replay : ui.play}
                              </button>
                              {focusPossession.fullVideoUrl && (
                                <div className="video-mode-switcher">
                                  <button
                                    type="button"
                                    className={playerMode === "clip" ? "video-mode-chip video-mode-chip--active" : "video-mode-chip"}
                                    onClick={() => setPlayerMode("clip")}
                                  >{ui.clip}</button>
                                  <button
                                    type="button"
                                    className={playerMode === "full" ? "video-mode-chip video-mode-chip--active" : "video-mode-chip"}
                                    onClick={() => setPlayerMode("full")}
                                  >{ui.fullMatch}</button>
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                        <div className="video-progress">
                           <i style={{ width: `${videoProgress * 100}%` }} />
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="empty-state dd-pitch-empty">{ui.selectClipToView}</div>
                )}
              </div>

              {/* RIGHT: Detail panel */}
              <div className="dd-detail-col">
                {focusPossession ? (
                  <>
                    <div className="dd-panel-label">
                      <span>{ui.analysis}</span>
                      <small>{focusPossession.matchLabel}</small>
                    </div>
                    <h2 className="dd-title">{focusPossession.title}</h2>

                    {/* Tabs */}
                    <div className="focus-tabs">
                      {focusViews.map((view) => (
                        <button
                          key={view.id}
                          type="button"
                          className={focusView === view.id ? "focus-tab focus-tab--active" : "focus-tab"}
                          onClick={() => setFocusView(view.id)}
                        >
                          {view.label}
                        </button>
                      ))}
                    </div>

                    {focusView === "overview" && (
                      <div className="dd-overview">
                        <div className="dd-kpi-row">
                          <div className="dd-kpi"><span>xThreat</span><strong>{focusPossession.xThreat.toFixed(3)}</strong></div>
                          <div className="dd-kpi"><span>{ui.actionValue}</span><strong>{focusPossession.actionValue}</strong></div>
                          <div className="dd-kpi"><span>{ui.passes}</span><strong>{focusPossession.passes}</strong></div>
                          <div className="dd-kpi"><span>{ui.duration}</span><strong>{focusPossession.durationSec}s</strong></div>
                        </div>
                        <div className="dd-stats-grid">
                          <div><span>{ui.formation}</span><strong>{focusPossession.formation}</strong></div>
                          <div><span>{ui.phase}</span><strong>{phaseLabel(focusPossession.phase, language)}</strong></div>
                          <div><span>{ui.zone}</span><strong>{zoneLabel(focusPossession.zone, language)}</strong></div>
                          <div><span>{ui.outcome}</span><strong>{focusPossession.outcome}</strong></div>
                        </div>
                        <div className="dd-players">
                          {focusPossession.players.map(p => (
                            <span key={p} className="dd-player-chip">{p}</span>
                          ))}
                        </div>
                        <p className="dd-note">{focusPossession.note}</p>
                        <p className="dd-why">{focusPossession.whyItMatters}</p>
                      </div>
                    )}

                    {focusView === "sequence" && (
                      <div className="dd-sequence">
                        {focusPossession.events.map((event, i) => (
                          <div key={`seq-${i}`} className="dd-seq-step">
                            <div className="dd-seq-num">{i + 1}</div>
                            <div>
                              <strong>{event.player}</strong>
                              <small>
                                {event.type} · ({Math.round(event.startX)}, {Math.round(event.startY)}) → (
                                {Math.round(event.endX)}, {Math.round(event.endY)})
                              </small>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    {focusView === "context" && (
                      <div className="dd-context">
                        <div className="dd-stats-grid">
                          <div><span>{ui.scoreline}</span><strong>{focusPossession.scoreline}</strong></div>
                          <div><span>{ui.gameState}</span><strong>{gameStateLabel(focusPossession.gameState, language)}</strong></div>
                          <div><span>{ui.transition}</span><strong>{transitionLabel(focusPossession.transitionType, language)}</strong></div>
                          <div><span>{ui.progression}</span><strong>{focusPossession.progression}</strong></div>
                          <div><span>{language === "zh" ? "起始区域" : "Start zone"}</span><strong>{startZoneLabel(focusPossession.startZone, language)}</strong></div>
                          <div><span>{language === "zh" ? "进入中场前传球数" : "Passes before middle-third access"}</span><strong>{focusPossession.descriptor.passesBeforeMiddleThird}</strong></div>
                        </div>
                        <div className="dd-rank-bars">
                          {[
                            { label: ui.signalFit, val: focusPossession.ranking.signal },
                            { label: ui.contextFit, val: focusPossession.ranking.context },
                            { label: ui.diversity, val: focusPossession.ranking.diversity },
                          ].map(({ label, val }) => (
                            <div key={label} className="dd-rank-bar">
                              <div className="dd-rank-bar-label">
                                <span>{label}</span>
                                <strong>{val.toFixed(2)}</strong>
                              </div>
                              <div className="dd-rank-bar-track">
                                <div className="dd-rank-bar-fill" style={{ width: `${val * 100}%` }} />
                              </div>
                            </div>
                          ))}
                        </div>
                        <div className="mvp-reason-list">
                          {focusPossession.retrievalReasons.map((reason) => (
                            <span key={`${focusPossession.id}-${reason.key}`} className="mvp-reason-chip">
                              {reason.label}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </>
                ) : (
                  <div className="empty-state" style={{ paddingTop: "4rem" }}>
                    {ui.selectClipToAnalyze}
                  </div>
                )}
              </div>
            </div>

            {/* Global Comparison & Export Utilities */}
            <div className="dd-footer-utilities">
               <section className="panel compare-controls">
                  <div className="panel-heading">
                    <div>
                      <SectionTypewriter text={ui.compareTitle} />
                    </div>
                  </div>
                  <div className="compare-picker">
                    <label>
                      {ui.leftCompare}
                      <select value={leftOpponent} onChange={(e) => setLeftOpponent(e.target.value)}>
                        {opponents.map((opp) => (
                          <option key={opp}>{opp}</option>
                        ))}
                      </select>
                    </label>
                    <label>
                      {ui.rightCompare}
                      <select value={rightOpponent} onChange={(e) => setRightOpponent(e.target.value)}>
                        {opponents.map((opp) => (
                          <option key={opp}>{opp}</option>
                        ))}
                      </select>
                    </label>
                    <div className="metric-switcher">
                      {comparisonMetricOptions.map((metric) => (
                        <button
                          key={metric.key}
                          className={comparisonMetric === metric.key ? "metric-chip metric-chip--active" : "metric-chip"}
                          onClick={() => setComparisonMetric(metric.key)}
                        >{metric.label}</button>
                      ))}
                    </div>
                  </div>
               </section>

               <ComparisonBoard
                  comparisonMetric={comparisonMetric}
                  comparisonResult={comparisonResult}
                  leftLabel={leftOpponent || ui.laneA}
                  rightLabel={rightOpponent || ui.laneB}
                  leftItems={leftComparison}
                  rightItems={rightComparison}
                  language={language}
                />

                <ExportPanel
                  note={exportNote}
                  onCopy={handleCopy}
                  onDownload={handleDownload}
                  copyStatus={copyStatus}
                  language={language}
                />

                <AssistantPanel
                  messages={assistantMessages}
                  draft={assistantDraft}
                  onDraftChange={setAssistantDraft}
                  onSend={handleAssistantSend}
                  onReset={() => resetAssistantThread()}
                  onUsePrompt={handleAssistantPrompt}
                  quickPrompts={assistantQuickPrompts}
                  isLoading={isAssistantLoading}
                  statusLabel={assistantStatusLabel}
                  language={language}
                />
            </div>
          </div>
        )}








        {currentPage === "ingest" && (
          <div className="page-section">
        <section className="panel data-panel" id="ingest">
          <div className="panel-heading">
            <div>
              <SectionTypewriter text={ui.dataLoaderTitle} />
            </div>
          </div>
          <div className="ingest-grid">
            <div className="ingest-column">
              <div className="ingest-card">
                <div className="ingest-card-head">
                  <h3>{ui.videoAnalysis}</h3>
                  <span
                    className={
                      engineStatus === "ready"
                        ? "source-pill source-pill--ready"
                        : engineStatus === "offline"
                          ? "source-pill source-pill--offline"
                          : "source-pill"
                    }
                  >
                    {engineStatus === "ready"
                      ? ui.engineReady
                      : engineStatus === "offline"
                        ? ui.engineOffline
                        : ui.checking}
                  </span>
                </div>
                <div
                  className={isDragActive ? "dropzone dropzone--active" : "dropzone"}
                  onDragOver={(event) => {
                    event.preventDefault();
                    setIsDragActive(true);
                  }}
                  onDragLeave={() => setIsDragActive(false)}
                  onDrop={async (event) => {
                    event.preventDefault();
                    setIsDragActive(false);
                    await handleDroppedFiles(Array.from(event.dataTransfer.files));
                  }}
                  onClick={() => videoInputRef.current?.click()}
                >
                  <input
                    ref={videoInputRef}
                    type="file"
                    accept={VIDEO_EXTENSIONS.join(",")}
                    hidden
                    onChange={handleVideoInputChange}
                  />
                  <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ color: "var(--accent)", opacity: 0.8 }}>
                    <rect x="2" y="2" width="20" height="20" rx="2.18" ry="2.18"></rect>
                    <line x1="7" y1="2" x2="7" y2="22"></line>
                    <line x1="17" y1="2" x2="17" y2="22"></line>
                    <line x1="2" y1="12" x2="22" y2="12"></line>
                    <line x1="2" y1="7" x2="7" y2="7"></line>
                    <line x1="2" y1="17" x2="7" y2="17"></line>
                    <line x1="17" y1="17" x2="22" y2="17"></line>
                    <line x1="17" y1="7" x2="22" y2="7"></line>
                  </svg>
                  <strong>{ui.analyzeFootage}</strong>
                  <p>{ui.analyzeFootageCopy}</p>
                  <div className="dropzone-actions" onClick={(e) => e.stopPropagation()}>
                    <button type="button" className="ghost-button" onClick={() => videoInputRef.current?.click()}>
                      {ui.browseFiles}
                    </button>
                    <button
                      type="button"
                      className="ghost-button"
                      onClick={() => {
                        if (focusPossession?.fullVideoUrl) {
                          setPlayerMode("full");
                        }
                      }}
                      disabled={!focusPossession?.fullVideoUrl}
                    >
                      {ui.sourceStream}
                    </button>
                  </div>
                </div>
                <div className="ingest-form">
                  <label>
                    {ui.projectTeam}
                    <input
                      placeholder={language === "zh" ? "例如：Manchester City" : "e.g. Manchester City"}
                      value={videoInput.teamName}
                      onChange={(event) =>
                        setVideoInput((current) => ({
                          ...current,
                          teamName: event.target.value,
                        }))
                      }
                    />
                  </label>
                  <label>
                    {ui.matchOpponent}
                    <input
                      placeholder={language === "zh" ? "例如：Arsenal" : "e.g. Arsenal"}
                      value={videoInput.opponentName}
                      onChange={(event) =>
                        setVideoInput((current) => ({
                          ...current,
                          opponentName: event.target.value,
                        }))
                      }
                    />
                  </label>
                  <label>
                    {ui.competition}
                    <input
                      placeholder={language === "zh" ? "例如：UEFA Champions League" : "e.g. UEFA Champions League"}
                      value={videoInput.competition}
                      onChange={(event) =>
                        setVideoInput((current) => ({
                          ...current,
                          competition: event.target.value,
                        }))
                      }
                    />
                  </label>
                  <label>
                    {ui.matchVenue}
                    <select
                      value={videoInput.venue}
                      onChange={(event) =>
                        setVideoInput((current) => ({
                          ...current,
                          venue: event.target.value as VideoIngestInput["venue"],
                        }))
                      }
                    >
                      <option value="Home">{ui.homeMatch}</option>
                      <option value="Away">{ui.awayMatch}</option>
                    </select>
                  </label>
                  <label>
                    {ui.finalScore}
                    <input
                      placeholder="0-0"
                      value={videoInput.scoreline}
                      onChange={(event) =>
                        setVideoInput((current) => ({
                          ...current,
                          scoreline: event.target.value,
                        }))
                      }
                    />
                  </label>
                  <label>
                    {ui.globalPhase}
                    <select
                      value={videoInput.gameState}
                      onChange={(event) =>
                        setVideoInput((current) => ({
                          ...current,
                          gameState: event.target.value as VideoIngestInput["gameState"],
                        }))
                      }
                    >
                      <option value="Drawing">{ui.drawingState}</option>
                      <option value="Winning">{ui.winningState}</option>
                      <option value="Losing">{ui.losingState}</option>
                    </select>
                  </label>
                </div>
                {videoSummary ? (
                  <div className="video-summary-grid">
                    <div>
                      <span>{ui.duration}</span>
                      <strong>{videoSummary.videoDurationLabel}</strong>
                    </div>
                    <div>
                      <span>{ui.resolution}</span>
                      <strong>{videoSummary.resolution}</strong>
                    </div>
                    <div>
                      <span>{ui.detectedClips}</span>
                      <strong>{videoSummary.momentCount}</strong>
                    </div>
                    <div>
                      <span>{ui.pitchConfidence}</span>
                      <strong>{Math.round(videoSummary.averagePitchConfidence * 100)}%</strong>
                    </div>
                  </div>
                ) : null}
              </div>
            </div>

            <div className="ingest-column">
              <div className="ingest-card">
                <div className="ingest-card-head">
                  <h3>{ui.structuredData}</h3>
                  <span className="source-pill">CSV / JSON</span>
                </div>
                <div
                  className="dropzone dropzone--subtle"
                  onClick={() => structuredInputRef.current?.click()}
                >
                  <input
                    ref={structuredInputRef}
                    type="file"
                    accept={DATA_EXTENSIONS.join(",")}
                    multiple
                    hidden
                    onChange={handleStructuredInputChange}
                  />
                  <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ color: "var(--accent)", opacity: 0.8 }}>
                    <path d="M21 12V7H5a2 2 0 0 1 0-4h14v4"></path>
                    <path d="M3 5v14a2 2 0 0 0 2 2h16v-5"></path>
                    <path d="M18 12a2 2 0 1 1 0 4 2 2 0 0 1 0-4Z"></path>
                  </svg>
                  <strong>{ui.importTelemetry}</strong>
                  <p>{ui.importTelemetryCopy}</p>
                  <div className="dropzone-actions" onClick={(e) => e.stopPropagation()}>
                    <button
                      type="button"
                      className="ghost-button"
                      onClick={() => structuredInputRef.current?.click()}
                    >
                      {ui.importFiles}
                    </button>
                    <button
                      type="button"
                      className="ghost-button"
                      onClick={loadBundledDemo}
                    >
                      {ui.libraryDemo}
                    </button>
                  </div>
                </div>
                <div className="provider-panel">
                  <div className="provider-panel__head">
                    <div>
                      <h4>
                        {language === "zh"
                          ? "免费 StatsBomb Open Data"
                          : "Free StatsBomb Open Data"}
                      </h4>
                      <p>
                        {language === "zh"
                          ? "直接从公开比赛事件库导入真实比赛。"
                          : "Import real matches directly from the public event archive."}
                      </p>
                    </div>
                    <button
                      type="button"
                      className="ghost-button"
                      onClick={ensureStatsBombCatalog}
                      disabled={isStatsBombLoading}
                    >
                      {isStatsBombLoading
                        ? language === "zh"
                          ? "加载中..."
                          : "Loading..."
                        : statsBombCompetitions.length
                          ? language === "zh"
                            ? "刷新"
                            : "Refresh"
                          : language === "zh"
                            ? "连接"
                            : "Connect"}
                    </button>
                  </div>

                  {statsBombCompetitions.length ? (
                    <div className="provider-controls">
                      <label>
                        {language === "zh" ? "赛事 / 赛季" : "Competition / season"}
                        <select
                          value={selectedCompetitionKey}
                          onChange={(event) =>
                            void loadStatsBombMatchesForCompetition(event.target.value)
                          }
                        >
                          {statsBombCompetitions.map((competition) => (
                            <option key={competition.key} value={competition.key}>
                              {competition.label}
                            </option>
                          ))}
                        </select>
                      </label>
                      {selectedCompetition ? (
                        <div className="provider-competition-meta">
                          <span>{selectedCompetition.countryName}</span>
                          <span>{selectedCompetition.competitionGender}</span>
                          <span>{statsBombMatches.length} {language === "zh" ? "场比赛" : "matches"}</span>
                        </div>
                      ) : null}

                      <label>
                        {language === "zh" ? "比赛搜索" : "Match search"}
                        <input
                          value={statsBombMatchQuery}
                          onChange={(event) => setStatsBombMatchQuery(event.target.value)}
                          placeholder={
                            language === "zh"
                              ? "按球队、阶段或日期过滤"
                              : "Filter by team, stage, or date"
                          }
                        />
                      </label>

                      <div className="provider-actions provider-actions--compact">
                        <div className="provider-actions-group">
                          <button
                            type="button"
                            className="ghost-button"
                            onClick={() =>
                              setSelectedMatchIds(
                                filteredStatsBombMatches
                                  .slice(0, Math.min(2, filteredStatsBombMatches.length))
                                  .map((match) => match.matchId),
                              )
                            }
                            disabled={!filteredStatsBombMatches.length}
                          >
                            {language === "zh" ? "选择前两场" : "Select first two"}
                          </button>
                          <button
                            type="button"
                            className="ghost-button"
                            onClick={() => setSelectedMatchIds([])}
                            disabled={!selectedMatchIds.length}
                          >
                            {language === "zh" ? "清空" : "Clear"}
                          </button>
                        </div>
                        <span>
                          {language === "zh"
                            ? `${selectedMatchIds.length} 场已选`
                            : `${selectedMatchIds.length} selected`}
                        </span>
                      </div>

                      <div className="provider-match-list" role="list">
                        {filteredStatsBombMatches.length ? (
                          filteredStatsBombMatches.map((match) => {
                            const isSelected = selectedMatchIds.includes(match.matchId);
                            return (
                              <button
                                key={match.matchId}
                                type="button"
                                className={
                                  isSelected
                                    ? "provider-match-card provider-match-card--selected"
                                    : "provider-match-card"
                                }
                                onClick={() => toggleStatsBombMatch(match.matchId)}
                              >
                                <div className="provider-match-card__main">
                                  <strong>{match.homeTeam} vs {match.awayTeam}</strong>
                                  <span>{match.matchDate}</span>
                                </div>
                                <div className="provider-match-card__meta">
                                  <span>{match.competitionStage || (language === "zh" ? "常规比赛" : "Match")}</span>
                                  <span>{match.scoreline || "–"}</span>
                                </div>
                              </button>
                            );
                          })
                        ) : (
                          <div className="provider-match-empty">
                            {language === "zh"
                              ? "当前筛选下没有比赛。"
                              : "No matches for the current filter."}
                          </div>
                        )}
                      </div>

                      <div className="provider-actions">
                        <button
                          type="button"
                          className="ghost-button"
                          onClick={handleStatsBombImport}
                          disabled={isStatsBombLoading || !selectedMatchIds.length}
                        >
                          {language === "zh"
                            ? "导入所选比赛"
                            : "Import selected matches"}
                        </button>
                        <span>
                          {language === "zh"
                            ? `将导入 ${selectedMatchIds.length} 场真实比赛`
                            : `Will import ${selectedMatchIds.length} real matches`}
                        </span>
                      </div>
                    </div>
                  ) : null}
                </div>
                <div className="data-meta">
                  <div>
                    <span>{ui.activeDataset}</span>
                    <strong>{datasetLabel}</strong>
                  </div>
                  <div>
                    <span>{ui.streamStatus}</span>
                    <strong>{ingestStatus}</strong>
                  </div>
                </div>
                <div className="data-actions">
                  <button type="button" className="ghost-button" onClick={handleDownloadCurrentJson}>
                    {ui.exportJson}
                  </button>
                  <button
                    type="button"
                    className="ghost-button"
                    onClick={handleDownloadCurrentCsv}
                  >
                    {ui.exportCsv}
                  </button>
                </div>
              </div>
            </div>
          </div>
          {ingestError ? <p className="import-error">{ingestError}</p> : null}
        </section>
          </div>
        )}



      </main>
    </div>
  );
}

const _clamp01 = (value: number) => Math.max(0, Math.min(value, 1));

const _timelineTime = (possession: Possession) =>
  possession.videoStartSec ?? possession.minute * 60;

export default App;
