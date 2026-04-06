import {
  useDeferredValue,
  useEffect,
  useRef,
  useState,
  useTransition,
} from "react";
import { ComparisonBoard } from "./components/ComparisonBoard";
import { ExportPanel } from "./components/ExportPanel";
import { MiniPitch } from "./components/MiniPitch";
import { allPossessions, TARGET_TEAM } from "./data/sampleData";
import {
  buildComparisonSet,
  buildExportNote,
  buildMinuteRangeLabel,
  buildSignalSummaries,
  clampMinuteRange,
  defaultFilters,
  filterPossessions,
  getActionValueBuckets,
  getFormationTendencies,
  rankRepresentativePossessions,
  summarizeComparison,
  timeWindowToRange,
} from "./lib/analytics";
import {
  parseImportedDataset,
  serializePossessionsToCsv,
} from "./lib/dataImport";
import { analyzeVideoFile, getVideoEngineHealth } from "./lib/videoApi";
import type {
  ComparisonMetric,
  ContextFilters,
  MinuteRange,
  Possession,
  TacticalSignal,
  TimeWindow,
  VideoAnalysisResult,
  VideoAnalysisSummary,
  VideoIngestInput,
} from "./types";

const HEADER_CHANNELS = [
  { label: "Overview", id: "match-centre" },
  { label: "Filters", id: "context-lock" },
  { label: "Ranking", id: "rankings" },
  { label: "Evidence", id: "analysis" },
  { label: "Ingest", id: "ingest" },
];

const COMPARISON_METRICS: Array<{
  key: ComparisonMetric;
  label: string;
}> = [
    { key: "xThreat", label: "xThreat" },
    { key: "progression", label: "Progression" },
    { key: "pressure", label: "Pressure" },
    { key: "actionValue", label: "Action value" },
  ];

const QUICK_PRESETS: Array<{
  id: string;
  label: string;
  description: string;
  filters: ContextFilters;
  signal: TacticalSignal;
}> = [
    {
      id: "overview",
      label: "Open overview",
      description: "Review every detected moment before narrowing the lock.",
      filters: defaultFilters,
      signal: "Left overload release",
    },
    {
      id: "left-build",
      label: "Build-up left",
      description: "Settled first-phase build-up through the left lane.",
      filters: {
        ...defaultFilters,
        phase: "Build-up",
        zone: "Left lane",
      },
      signal: "Left overload release",
    },
    {
      id: "press-escape",
      label: "Press escape",
      description: "High-pressure exits against the first line.",
      filters: {
        ...defaultFilters,
        phase: "Press resistance",
      },
      signal: "Press escape chain",
    },
    {
      id: "chasing-central",
      label: "Central punch",
      description: "Direct central access and regains.",
      filters: {
        ...defaultFilters,
        zone: "Central lane",
      },
      signal: "Central lane break",
    },
  ];

const FOCUS_VIEWS = [
  { id: "overview", label: "Overview" },
  { id: "sequence", label: "Sequence" },
  { id: "context", label: "Context" },
] as const;

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

const formatContextLock = (filters: ContextFilters) =>
  [
    filters.gameState === "All states" ? "All states" : filters.gameState,
    filters.phase === "All phases" ? "All phases" : filters.phase,
    filters.zone === "All zones" ? "All zones" : filters.zone,
    buildMinuteRangeLabel(filters.minuteRange),
  ].join(" / ");

const metricValue = (metric: ComparisonMetric, values: number[]) =>
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

const fileMatches = (file: File, extensions: string[]) => {
  const lowerName = file.name.toLowerCase();
  return extensions.some((extension) => lowerName.endsWith(extension));
};

function App() {
  const [sourcePossessions, setSourcePossessions] =
    useState<Possession[]>(allPossessions);
  const [datasetLabel, setDatasetLabel] = useState("PitchLens sample dataset");
  const [analysisTeam, setAnalysisTeam] = useState(TARGET_TEAM);
  const [filters, setFilters] = useState<ContextFilters>(defaultFilters);
  const [activeSignal, setActiveSignal] = useState<TacticalSignal>(
    "Left overload release",
  );
  const [focusId, setFocusId] = useState<string>(allPossessions[0]?.id ?? "");
  const [expandedId, setExpandedId] = useState<string>("");
  const [leftOpponent, setLeftOpponent] = useState<string>("");
  const [rightOpponent, setRightOpponent] = useState<string>("");
  const [comparisonMetric, setComparisonMetric] =
    useState<ComparisonMetric>("xThreat");
  const [activePresetId, setActivePresetId] = useState<string>("overview");
  const [focusView, setFocusView] =
    useState<(typeof FOCUS_VIEWS)[number]["id"]>("overview");
  const [copyStatus, setCopyStatus] = useState("");
  const [sourceMode, setSourceMode] = useState<"sample" | "events" | "video">(
    "sample",
  );
  const [videoSummary, setVideoSummary] =
    useState<VideoAnalysisSummary | null>(null);
  const [ingestStatus, setIngestStatus] = useState(
    "Sample dataset loaded. Video ingest is available when the local API is running.",
  );
  const [ingestError, setIngestError] = useState("");
  const [engineStatus, setEngineStatus] = useState<
    "checking" | "ready" | "offline"
  >("checking");
  const [isDragActive, setIsDragActive] = useState(false);
  const [isVideoAnalyzing, setIsVideoAnalyzing] = useState(false);
  const [videoInput, setVideoInput] =
    useState<VideoIngestInput>(DEFAULT_VIDEO_INPUT);
  const [playerMode, setPlayerMode] = useState<"clip" | "full">("clip");
  const [videoPlaying, setVideoPlaying] = useState(false);
  const [videoProgress, setVideoProgress] = useState(0);
  const [isPending, startTransition] = useTransition();

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

  const filtered = filterPossessions(teamPossessions, filters);
  const deferredFiltered = useDeferredValue(filtered);
  const ranked = rankRepresentativePossessions(teamPossessions, filters, activeSignal);
  const deferredRanked = useDeferredValue(ranked);
  const summaries = buildSignalSummaries(deferredFiltered);
  const formations = getFormationTendencies(deferredFiltered);
  const actionBuckets = getActionValueBuckets(deferredFiltered);
  const headlineMoments = deferredRanked.slice(0, 3);
  const timelineMoments = [...deferredRanked].sort((left, right) => {
    const leftTime = left.videoStartSec ?? left.minute * 60;
    const rightTime = right.videoStartSec ?? right.minute * 60;
    return leftTime - rightTime;
  });
  const contextLabel = formatContextLock(filters);
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
    COMPARISON_METRICS.find((metric) => metric.key === comparisonMetric)?.label ??
    comparisonMetric;

  const leftComparison = leftOpponent
    ? buildComparisonSet(teamPossessions, activeSignal, filters, leftOpponent)
    : [];
  const rightComparison = rightOpponent
    ? buildComparisonSet(teamPossessions, activeSignal, filters, rightOpponent)
    : [];
  const comparisonText = summarizeComparison(
    leftComparison,
    rightComparison,
    leftOpponent || "Lane A",
    rightOpponent || "Lane B",
  );

  const leftComparisonMetric = metricValue(
    comparisonMetric,
    leftComparison.map((item) => item[comparisonMetric]),
  );
  const rightComparisonMetric = metricValue(
    comparisonMetric,
    rightComparison.map((item) => item[comparisonMetric]),
  );

  const opponentBoard = opponents
    .map((opponent) => {
      const scoped = filterPossessions(teamPossessions, {
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

  const deskInsights = [
    sourceMode === "video" && videoSummary
      ? `Video engine mapped ${videoSummary.momentCount} candidate sequences from a ${videoSummary.videoDurationLabel} source at ${videoSummary.analysisFps} fps.`
      : `Dataset: ${datasetLabel}. ${teamPossessions.length} clips are mapped to ${analysisTeam}.`,
    focusPossession
      ? `Focused evidence: ${focusPossession.title}. ${focusPossession.videoStartSec != null && focusPossession.videoEndSec != null
        ? `${formatClock(focusPossession.videoStartSec)}-${formatClock(
          focusPossession.videoEndSec,
        )}.`
        : `${focusPossession.minute}'.`
      }`
      : "No focused clip is available under the current lock.",
    `${comparisonLabel} leader: ${leftComparisonMetric >= rightComparisonMetric ? leftOpponent : rightOpponent
    } (${metricFormatter(
      comparisonMetric,
      Math.max(leftComparisonMetric, rightComparisonMetric),
    )}).`,
    formations[0]
      ? `Dominant structure: ${formations[0].formation}.`
      : "No dominant structure under the current filters.",
  ];

  const exportNote = buildExportNote({
    filters,
    activeSignal,
    ranked: deferredRanked,
    leftOpponent: leftOpponent || "Lane A",
    rightOpponent: rightOpponent || "Lane B",
    comparisonText,
  });

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
    startTransition(() => {
      setSourceMode("video");
      setVideoSummary(result.summary);
      setSourcePossessions(result.possessions);
      setDatasetLabel(result.datasetLabel);
      setAnalysisTeam(result.analysisTeam);
      setFilters(defaultFilters);
      setActiveSignal("Left overload release");
      setActivePresetId("overview");
      setExpandedId("");
      setFocusView("overview");
      setFocusId(result.possessions[0]?.id ?? "");
      setPlayerMode("clip");
    });
    setIngestStatus(
      `Analyzed ${sourceLabel}: ${result.summary.momentCount} candidate clips were extracted from ${result.summary.videoDurationLabel}.`,
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
    const preset = QUICK_PRESETS.find((item) => item.id === presetId);
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
      setCopyStatus("Copied to clipboard.");
    } catch {
      setCopyStatus("Clipboard permission blocked. Use download instead.");
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

  const importDataFiles = async (files: File[]) => {
    try {
      setIngestError("");
      setIngestStatus("Parsing structured event files...");
      const imported = await Promise.all(
        files.map(async (file) => ({
          name: file.name,
          text: await file.text(),
        })),
      );
      const dataset = parseImportedDataset(imported);
      startTransition(() => {
        setSourceMode("events");
        setVideoSummary(null);
        setSourcePossessions(dataset.possessions);
        setDatasetLabel(dataset.datasetLabel);
        setAnalysisTeam(dataset.availableTeams[0] ?? TARGET_TEAM);
        setFilters(defaultFilters);
        setActiveSignal("Left overload release");
        setActivePresetId("overview");
        setExpandedId("");
        setFocusView("overview");
        setFocusId(dataset.possessions[0]?.id ?? "");
        setPlayerMode("clip");
      });
      setIngestStatus(
        `Imported ${dataset.possessions.length} clips from ${dataset.datasetLabel}.`,
      );
    } catch (error) {
      setIngestError(error instanceof Error ? error.message : "Import failed.");
      setIngestStatus("Structured data import failed.");
    }
  };

  const analyzeVideo = async (file: File) => {
    if (engineStatus === "offline") {
      setIngestError("Video engine offline. Start the FastAPI service on port 8000.");
      return;
    }

    try {
      setIngestError("");
      setIsVideoAnalyzing(true);
      setIngestStatus(`Analyzing ${file.name}... extracting visual moments and clips.`);
      const result = await analyzeVideoFile(file, videoInput);
      applyVideoResult(result, file.name);
    } catch (error) {
      setIngestError(error instanceof Error ? error.message : "Video analysis failed.");
      setIngestStatus("Video analysis failed.");
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
      setIngestError("Drop either one video file or one or more CSV/JSON files, not both.");
      return;
    }

    if (videoFiles.length > 1) {
      setIngestError("Upload one video at a time so the extracted clips stay aligned.");
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

    setIngestError("Unsupported files. Use one video or CSV/JSON data files.");
  };

  const loadBundledDemo = async () => {
    try {
      setIngestError("");
      setIngestStatus("Loading bundled real match demo...");
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
      startTransition(() => {
        setSourceMode("events");
        setVideoSummary(null);
        setSourcePossessions(dataset.possessions);
        setDatasetLabel(manifest.datasetLabel);
        setAnalysisTeam(manifest.analysisTeam || dataset.availableTeams[0] || TARGET_TEAM);
        setFilters(defaultFilters);
        setActiveSignal("Left overload release");
        setActivePresetId("overview");
        setExpandedId("");
        setFocusView("overview");
        setFocusId(dataset.possessions[0]?.id ?? "");
        setPlayerMode("clip");
      });
      setIngestStatus(`Loaded ${manifest.datasetLabel}.`);
    } catch (error) {
      setIngestError(
        error instanceof Error ? error.message : "Could not load bundled demo.",
      );
      setIngestStatus("Bundled demo load failed.");
    }
  };

  return (
    <div className="app-shell">
      <div className="app-background" />
      <header className="global-header">
        <div className="brand-lockup">
          <div className="brand-mark">PL</div>
          <div>
            <p>PitchLens</p>
            <span>Analysis workspace</span>
          </div>
        </div>
        <nav className="header-nav" aria-label="Primary">
          {HEADER_CHANNELS.map((channel) => (
            <a key={channel.id} href={`#${channel.id}`}>
              {channel.label}
            </a>
          ))}
        </nav>
        <div className="header-status">
          <span>Engine</span>
          <strong>
            {isVideoAnalyzing
              ? "Analyzing video"
              : engineStatus === "ready"
                ? "Ready"
                : engineStatus === "offline"
                  ? "Offline"
                  : "Checking"}
          </strong>
        </div>
      </header>

      <header className="masthead" id="match-centre">
        <div className="hero-copy-column">
          <h1>{analysisTeam} analysis workspace</h1>
          <p className="workspace-subtitle">
            {sourceMode === "video" ? "Video-derived evidence" : "Structured evidence"} ·{" "}
            {datasetLabel}
          </p>
          <p className="hero-copy">
            Upload one match video or load structured data, then filter, compare,
            and export the current evidence set.
          </p>
          <div className="hero-highlights">
            <article>
              <span>Source</span>
              <strong>{datasetLabel}</strong>
              <small>
                {sourceMode === "video" && videoSummary
                  ? `${videoSummary.momentCount} extracted clips`
                  : `${teamPossessions.length} mapped clips`}
              </small>
            </article>
            <article>
              <span>Context lock</span>
              <strong>{contextLabel}</strong>
              <small>
                {filters.opponent === "All opponents"
                  ? "All opponents"
                  : filters.opponent}
              </small>
            </article>
            <article>
              <span>Engine</span>
              <strong>{videoSummary?.engine ?? "Structured data workspace"}</strong>
              <small>
                {videoSummary
                  ? `${videoSummary.videoDurationLabel} · ${videoSummary.resolution}`
                  : "Ready for video, CSV, or JSON ingest"}
              </small>
            </article>
            <article>
              <span>Focused clip</span>
              <strong>
                {focusPossession
                  ? focusPossession.videoStartSec != null
                    ? formatClock(focusPossession.videoStartSec)
                    : `${focusPossession.minute}'`
                  : "None"}
              </strong>
              <small>{focusPossession?.title ?? "Select a clip to inspect it."}</small>
            </article>
          </div>
          <div className="summary-list">
            {headlineMoments.length === 0 ? (
              <div className="summary-row summary-row--empty">
                No evidence under the current lock.
              </div>
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
        </div>

        <aside className="scoreboard-panel">
          <div className="scoreboard-topline">
            <span>Comparison</span>
            <strong>{isPending ? "Updating" : "Locked"}</strong>
          </div>
          <div className="scoreboard-main">
            <div className="team-stack">
              <small>Lane A</small>
              <strong>{leftOpponent || "Awaiting opponent"}</strong>
              <span>{leftComparison.length} matched clips</span>
            </div>
            <div className="signal-stack">
              <small>Signal</small>
              <strong>{activeSignal}</strong>
              <span>Current evidence set</span>
            </div>
            <div className="team-stack">
              <small>Lane B</small>
              <strong>{rightOpponent || "Awaiting opponent"}</strong>
              <span>{rightComparison.length} matched clips</span>
            </div>
          </div>
          <p className="scoreboard-summary">{comparisonText}</p>
          <div className="scoreboard-metrics">
            <div>
              <span>Evidence pool</span>
              <strong>{deferredFiltered.length}</strong>
            </div>
            <div>
              <span>Minute brush</span>
              <strong>{buildMinuteRangeLabel(filters.minuteRange)}</strong>
            </div>
            <div>
              <span>{comparisonLabel}</span>
              <strong>
                {metricFormatter(
                  comparisonMetric,
                  Math.max(leftComparisonMetric, rightComparisonMetric),
                )}
              </strong>
            </div>
          </div>
        </aside>
      </header>

      <main className="workspace-grid">
        <aside className="panel filters-panel" id="context-lock">
          <div className="panel-heading">
            <div>
              <h2>Filters</h2>
            </div>
            <p className="panel-copy">
              Control the retrieval window for ranking, comparison, and export.
            </p>
          </div>
          <div className="filter-grid">
            <label>
              Analysis team
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
              Opponent scope
              <select
                value={filters.opponent}
                onChange={(event) => updateFilter("opponent", event.target.value)}
              >
                <option>All opponents</option>
                {opponents.map((opponent) => (
                  <option key={opponent}>{opponent}</option>
                ))}
              </select>
            </label>
            <label>
              Game state
              <select
                value={filters.gameState}
                onChange={(event) =>
                  updateFilter(
                    "gameState",
                    event.target.value as ContextFilters["gameState"],
                  )
                }
              >
                <option>All states</option>
                <option>Winning</option>
                <option>Drawing</option>
                <option>Losing</option>
              </select>
            </label>
            <label>
              Phase
              <select
                value={filters.phase}
                onChange={(event) =>
                  updateFilter("phase", event.target.value as ContextFilters["phase"])
                }
              >
                <option>All phases</option>
                <option>Build-up</option>
                <option>Press resistance</option>
                <option>Sustained attack</option>
                <option>Transition</option>
              </select>
            </label>
            <label>
              Zone
              <select
                value={filters.zone}
                onChange={(event) =>
                  updateFilter("zone", event.target.value as ContextFilters["zone"])
                }
              >
                <option>All zones</option>
                <option>Left lane</option>
                <option>Central lane</option>
                <option>Right lane</option>
              </select>
            </label>
            <label>
              Time window preset
              <select
                value={filters.timeWindow}
                onChange={(event) =>
                  handleTimeWindowChange(event.target.value as TimeWindow)
                }
              >
                <option>All windows</option>
                <option>0-30</option>
                <option>31-60</option>
                <option>61-90</option>
              </select>
            </label>
          </div>

          <div className="minute-brush">
            <div className="minute-brush-head">
              <span>Minute range</span>
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
            <p>Retrieval score</p>
            <strong>
              S(p) = 0.48 signal + 0.24 context + 0.16 impact + 0.12 diversity
            </strong>
            <span>
              Diversity suppresses near-duplicates so the final evidence set stays
              compact and replayable.
            </span>
          </div>
        </aside>

        <section className="panel summary-panel">
          <div className="panel-heading">
            <div>
              <h2>Signal summary</h2>
            </div>
            <p className="panel-copy">
              Signal counts, distributions, and opponent ranking under the current lock.
            </p>
          </div>
          <div className="signal-list">
            {summaries.map((summary) => (
              <button
                key={summary.signal}
                type="button"
                className={
                  summary.signal === activeSignal
                    ? "signal-card signal-card--active"
                    : "signal-card"
                }
                onClick={() => handleSignalSelection(summary.signal)}
              >
                <span>{summary.signal}</span>
                <strong>{summary.count} clips</strong>
                <small>
                  Avg xT {summary.averageThreat.toFixed(2)} | Avg AV{" "}
                  {summary.averageActionValue.toFixed(0)}
                </small>
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
                  <div className="signal-column-bar">
                    <i
                      style={{
                        height: `${(summary.count / maxCount) * 100}%`,
                      }}
                    />
                  </div>
                  <strong>{summary.count}</strong>
                  <span>{summary.signal.split(" ")[0]}</span>
                </button>
              );
            })}
          </div>

          <div className="summary-split">
            <div>
              <h3>Formation tendency</h3>
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
              <h3>Action value distribution</h3>
              <div className="bucket-list">
                <div>
                  <span>High leverage</span>
                  <strong>{actionBuckets.high}</strong>
                </div>
                <div>
                  <span>Medium leverage</span>
                  <strong>{actionBuckets.medium}</strong>
                </div>
                <div>
                  <span>Low leverage</span>
                  <strong>{actionBuckets.low}</strong>
                </div>
              </div>
            </div>
            <div>
              <h3 id="rankings">Opponent board</h3>
              <div className="opponent-board">
                <div className="opponent-board-head">
                  <span>Club</span>
                  <span>Clips</span>
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

        <section className="panel retrieval-panel" id="analysis">
          <div className="panel-heading">
            <div>
              <h2>Representative clips for {activeSignal}</h2>
            </div>
            <p className="panel-copy">
              Review the ranked evidence set and inspect the focused clip.
            </p>
          </div>
          <div className="retrieval-layout">
            <div className="retrieval-list">
              {deferredRanked.length === 0 ? (
                <div className="empty-state">
                  No clips match the current lock. Relax the filters or switch the signal.
                </div>
              ) : (
                deferredRanked.map((possession, index) => (
                  <article
                    key={possession.id}
                    className={
                      focusPossession?.id === possession.id
                        ? "retrieval-card retrieval-card--active"
                        : "retrieval-card"
                    }
                  >
                    <div className="retrieval-main">
                      <button
                        type="button"
                        className="retrieval-item"
                        onClick={() => setFocusId(possession.id)}
                      >
                        <div className="retrieval-rank">{index + 1}</div>
                        <div className="retrieval-copy">
                          <div className="retrieval-topline">
                            <h3>{possession.title}</h3>
                            <span>
                              {possession.videoStartSec != null
                                ? formatClock(possession.videoStartSec)
                                : `${possession.minute}'`}
                            </span>
                          </div>
                          <p>
                            {possession.opponent} | {possession.phase} | {possession.zone} |
                            {" "}xT {possession.xThreat.toFixed(2)} | AV {possession.actionValue}
                          </p>
                          <div className="score-breakdown">
                            <span>Signal {possession.ranking.signal.toFixed(2)}</span>
                            <span>Context {possession.ranking.context.toFixed(2)}</span>
                            <span>Diversity {possession.ranking.diversity.toFixed(2)}</span>
                            <strong>Total {possession.ranking.total.toFixed(2)}</strong>
                          </div>
                        </div>
                      </button>
                      <button
                        type="button"
                        className="retrieval-expand"
                        onClick={() =>
                          setExpandedId((current) =>
                            current === possession.id ? "" : possession.id,
                          )
                        }
                      >
                        {expandedId === possession.id ? "Collapse" : "Expand"}
                      </button>
                    </div>
                    {expandedId === possession.id ? (
                      <div className="retrieval-expanded">
                        <MiniPitch possession={possession} />
                        <div>
                          <p>{possession.note}</p>
                          <p>{possession.whyItMatters}</p>
                        </div>
                      </div>
                    ) : null}
                  </article>
                ))
              )}
            </div>
            <div className="focus-panel">
              {focusPossession ? (
                <>
                  <div className="focus-header">
                    <div>
                      <h3>{focusPossession.title}</h3>
                    </div>
                    <span>
                      {focusPossession.videoStartSec != null &&
                        focusPossession.videoEndSec != null
                        ? `${formatClock(focusPossession.videoStartSec)}-${formatClock(
                          focusPossession.videoEndSec,
                        )}`
                        : `${focusPossession.matchLabel}, ${focusPossession.minute}'`}
                    </span>
                  </div>

                  <div className="focus-tabs">
                    {FOCUS_VIEWS.map((view) => (
                      <button
                        key={view.id}
                        type="button"
                        className={
                          focusView === view.id
                            ? "focus-tab focus-tab--active"
                            : "focus-tab"
                        }
                        onClick={() => setFocusView(view.id)}
                      >
                        {view.label}
                      </button>
                    ))}
                  </div>

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
                        <MiniPitch possession={focusPossession} />
                      )}
                      <div className="video-overlay">
                        <div className="video-overlay-actions">
                          <button
                            type="button"
                            className="video-control"
                            onClick={togglePlayback}
                          >
                            {videoPlaying
                              ? "Pause"
                              : videoProgress >= 1
                                ? "Replay"
                                : "Play"}
                          </button>
                          {focusPossession.fullVideoUrl ? (
                            <div className="video-mode-switcher">
                              <button
                                type="button"
                                className={
                                  playerMode === "clip"
                                    ? "video-mode-chip video-mode-chip--active"
                                    : "video-mode-chip"
                                }
                                onClick={() => setPlayerMode("clip")}
                              >
                                Clip
                              </button>
                              <button
                                type="button"
                                className={
                                  playerMode === "full"
                                    ? "video-mode-chip video-mode-chip--active"
                                    : "video-mode-chip"
                                }
                                onClick={() => setPlayerMode("full")}
                              >
                                Full match
                              </button>
                            </div>
                          ) : null}
                        </div>
                        <span>
                          {playerMode === "clip"
                            ? `${focusPossession.durationSec}s extracted clip`
                            : focusPossession.videoStartSec != null &&
                              focusPossession.videoEndSec != null
                              ? `Full source · jump to ${formatClock(
                                focusPossession.videoStartSec,
                              )}-${formatClock(focusPossession.videoEndSec)}`
                              : "No source video linked"}
                        </span>
                      </div>
                    </div>
                    <div className="video-progress">
                      <i style={{ width: `${videoProgress * 100}%` }} />
                    </div>
                    <div className="video-markers">
                      {focusPossession.path.map((point, index) => (
                        <span key={`${focusPossession.id}-${point.label}-${index}`}>
                          {point.label}
                        </span>
                      ))}
                    </div>
                  </div>

                  {focusView === "overview" ? (
                    <>
                      <div className="focus-meta">
                        <div>
                          <span>Formation</span>
                          <strong>{focusPossession.formation}</strong>
                        </div>
                        <div>
                          <span>Players</span>
                          <strong>{focusPossession.players.join(", ")}</strong>
                        </div>
                        <div>
                          <span>Outcome</span>
                          <strong>{focusPossession.outcome}</strong>
                        </div>
                        <div>
                          <span>Confidence</span>
                          <strong>
                            {focusPossession.analysisConfidence != null
                              ? `${Math.round(focusPossession.analysisConfidence * 100)}%`
                              : "n/a"}
                          </strong>
                        </div>
                      </div>
                      <p className="focus-note">{focusPossession.note}</p>
                      <p className="focus-why">{focusPossession.whyItMatters}</p>
                    </>
                  ) : null}

                  {focusView === "sequence" ? (
                    <div className="sequence-board">
                      <div className="sequence-split">
                        <MiniPitch possession={focusPossession} />
                        <div className="sequence-list">
                          {focusPossession.path.map((point, index) => (
                            <div key={`${focusPossession.id}-${point.label}-${index}`}>
                              <span>Step {index + 1}</span>
                              <strong>{point.label}</strong>
                              <small>
                                Zone coordinate {Math.round(point.x)},
                                {Math.round(point.y)}
                              </small>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  ) : null}

                  {focusView === "context" ? (
                    <div className="context-board">
                      <div className="context-grid">
                        <div>
                          <span>Scoreline</span>
                          <strong>{focusPossession.scoreline}</strong>
                        </div>
                        <div>
                          <span>Transition</span>
                          <strong>{focusPossession.transitionType}</strong>
                        </div>
                        <div>
                          <span>Duration</span>
                          <strong>{focusPossession.durationSec}s</strong>
                        </div>
                        <div>
                          <span>Passes</span>
                          <strong>{focusPossession.passes}</strong>
                        </div>
                        <div>
                          <span>Video window</span>
                          <strong>
                            {focusPossession.videoStartSec != null &&
                              focusPossession.videoEndSec != null
                              ? `${formatClock(focusPossession.videoStartSec)}-${formatClock(
                                focusPossession.videoEndSec,
                              )}`
                              : "Unlinked"}
                          </strong>
                        </div>
                        <div>
                          <span>Pitch confidence</span>
                          <strong>
                            {focusPossession.pitchConfidence != null
                              ? `${Math.round(focusPossession.pitchConfidence * 100)}%`
                              : "n/a"}
                          </strong>
                        </div>
                      </div>
                      <div className="context-bars">
                        <div>
                          <span>Signal fit</span>
                          <div className="context-bar-track">
                            <i
                              style={{
                                width: `${focusPossession.ranking.signal * 100}%`,
                              }}
                            />
                          </div>
                        </div>
                        <div>
                          <span>Context fit</span>
                          <div className="context-bar-track">
                            <i
                              style={{
                                width: `${focusPossession.ranking.context * 100}%`,
                              }}
                            />
                          </div>
                        </div>
                        <div>
                          <span>Diversity</span>
                          <div className="context-bar-track">
                            <i
                              style={{
                                width: `${focusPossession.ranking.diversity * 100}%`,
                              }}
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                  ) : null}
                </>
              ) : (
                <div className="empty-state">
                  Choose a representative clip to inspect it.
                </div>
              )}
            </div>
          </div>

          <div className="timeline-board">
            <div className="timeline-head">
              <div>
                <h3>Timeline</h3>
              </div>
              <span>Jump directly to any extracted clip.</span>
            </div>
            <div className="timeline-track">
              <div className="timeline-line" />
              {timelineMoments.map((moment) => (
                <button
                  key={moment.id}
                  type="button"
                  className={
                    focusPossession?.id === moment.id
                      ? "timeline-node timeline-node--active"
                      : "timeline-node"
                  }
                  style={{
                    left: `${((_timelineTime(moment) / timelineRangeSec) * 100).toFixed(2)}%`,
                  }}
                  onClick={() => setFocusId(moment.id)}
                >
                  <span>
                    {moment.videoStartSec != null
                      ? formatClock(moment.videoStartSec)
                      : `${moment.minute}'`}
                  </span>
                </button>
              ))}
            </div>
            <div className="timeline-scale">
              {timelineMarks.map((mark) => (
                <span key={mark}>
                  {videoSummary ? formatClock(mark) : `${Math.round(mark / 60)}'`}
                </span>
              ))}
            </div>
          </div>
        </section>

        <section className="panel compare-controls">
          <div className="panel-heading">
            <div>
              <h2>Comparison</h2>
            </div>
            <p className="panel-copy">
              Compare two opponents under the same lock.
            </p>
          </div>
          <div className="compare-picker">
            <label>
              Left lane
              <select
                value={leftOpponent}
                onChange={(event) => setLeftOpponent(event.target.value)}
              >
                {opponents.map((opponent) => (
                  <option key={opponent}>{opponent}</option>
                ))}
              </select>
            </label>
            <label>
              Right lane
              <select
                value={rightOpponent}
                onChange={(event) => setRightOpponent(event.target.value)}
              >
                {opponents.map((opponent) => (
                  <option key={opponent}>{opponent}</option>
                ))}
              </select>
            </label>
            <div className="metric-switcher">
              {COMPARISON_METRICS.map((metric) => (
                <button
                  key={metric.key}
                  type="button"
                  className={
                    comparisonMetric === metric.key
                      ? "metric-chip metric-chip--active"
                      : "metric-chip"
                  }
                  onClick={() => setComparisonMetric(metric.key)}
                >
                  {metric.label}
                </button>
              ))}
            </div>
          </div>
        </section>

        <section className="panel data-panel" id="ingest">
          <div className="panel-heading">
            <div>
              <h2>Ingest</h2>
            </div>
            <p className="panel-copy">
              Load one match video or import structured data.
            </p>
          </div>
          <div className="ingest-grid">
            <div className="ingest-column">
              <div className="ingest-card">
                <div className="ingest-card-head">
                  <h3>Video analysis</h3>
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
                      ? "Engine ready"
                      : engineStatus === "offline"
                        ? "Engine offline"
                        : "Checking"}
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
                >
                  <input
                    ref={videoInputRef}
                    type="file"
                    accept={VIDEO_EXTENSIONS.join(",")}
                    hidden
                    onChange={handleVideoInputChange}
                  />
                  <strong>Drop one match video here</strong>
                  <p>Supported: mp4, mov, m4v, avi, mkv, webm.</p>
                  <div className="dropzone-actions">
                    <button type="button" onClick={() => videoInputRef.current?.click()}>
                      Choose video
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
                      Open full source
                    </button>
                  </div>
                </div>
                <div className="ingest-form">
                  <label>
                    Team
                    <input
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
                    Opponent
                    <input
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
                    Competition
                    <input
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
                    Venue
                    <select
                      value={videoInput.venue}
                      onChange={(event) =>
                        setVideoInput((current) => ({
                          ...current,
                          venue: event.target.value as VideoIngestInput["venue"],
                        }))
                      }
                    >
                      <option>Home</option>
                      <option>Away</option>
                    </select>
                  </label>
                  <label>
                    Scoreline
                    <input
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
                    Game state
                    <select
                      value={videoInput.gameState}
                      onChange={(event) =>
                        setVideoInput((current) => ({
                          ...current,
                          gameState: event.target.value as VideoIngestInput["gameState"],
                        }))
                      }
                    >
                      <option>Winning</option>
                      <option>Drawing</option>
                      <option>Losing</option>
                    </select>
                  </label>
                </div>
                {videoSummary ? (
                  <div className="video-summary-grid">
                    <div>
                      <span>Duration</span>
                      <strong>{videoSummary.videoDurationLabel}</strong>
                    </div>
                    <div>
                      <span>Resolution</span>
                      <strong>{videoSummary.resolution}</strong>
                    </div>
                    <div>
                      <span>Detected clips</span>
                      <strong>{videoSummary.momentCount}</strong>
                    </div>
                    <div>
                      <span>Pitch confidence</span>
                      <strong>{Math.round(videoSummary.averagePitchConfidence * 100)}%</strong>
                    </div>
                  </div>
                ) : null}
              </div>
            </div>

            <div className="ingest-column">
              <div className="ingest-card">
                <div className="ingest-card-head">
                  <h3>Structured data</h3>
                  <span className="source-pill">CSV / JSON</span>
                </div>
                <div className="dropzone dropzone--subtle">
                  <input
                    ref={structuredInputRef}
                    type="file"
                    accept={DATA_EXTENSIONS.join(",")}
                    multiple
                    hidden
                    onChange={handleStructuredInputChange}
                  />
                  <strong>Import event or possession files</strong>
                  <p>Supported: PitchLens possession CSV/JSON and StatsBomb event JSON.</p>
                  <div className="dropzone-actions">
                    <button
                      type="button"
                      onClick={() => structuredInputRef.current?.click()}
                    >
                      Upload files
                    </button>
                    <button
                      type="button"
                      className="ghost-button"
                      onClick={loadBundledDemo}
                    >
                      Load Arsenal WFC demo
                    </button>
                  </div>
                </div>
                <div className="data-meta">
                  <div>
                    <span>Current source</span>
                    <strong>{datasetLabel}</strong>
                  </div>
                  <div>
                    <span>Status</span>
                    <strong>{ingestStatus}</strong>
                  </div>
                </div>
                <div className="data-actions">
                  <button type="button" onClick={handleDownloadCurrentJson}>
                    Export current JSON
                  </button>
                  <button
                    type="button"
                    className="ghost-button"
                    onClick={handleDownloadCurrentCsv}
                  >
                    Export current CSV
                  </button>
                </div>
              </div>
            </div>
          </div>
          {ingestError ? <p className="import-error">{ingestError}</p> : null}
        </section>

        <section className="panel desk-panel">
          <div className="panel-heading">
            <div>
              <h2>Presets and notes</h2>
            </div>
            <p className="panel-copy">
              Quick presets plus a compact readout of the current state.
            </p>
          </div>
          <div className="preset-grid">
            {QUICK_PRESETS.map((preset) => (
              <button
                key={preset.id}
                type="button"
                className={
                  activePresetId === preset.id
                    ? "preset-card preset-card--active"
                    : "preset-card"
                }
                onClick={() => applyPreset(preset.id)}
              >
                <strong>{preset.label}</strong>
                <span>{preset.description}</span>
              </button>
            ))}
          </div>
          <div className="insight-list">
            {deskInsights.map((insight) => (
              <article key={insight} className="insight-item">
                {insight}
              </article>
            ))}
          </div>
        </section>

        <ComparisonBoard
          comparisonMetric={comparisonMetric}
          comparisonText={comparisonText}
          leftLabel={leftOpponent || "Lane A"}
          rightLabel={rightOpponent || "Lane B"}
          leftItems={leftComparison}
          rightItems={rightComparison}
        />

        <ExportPanel
          note={exportNote}
          onCopy={handleCopy}
          onDownload={handleDownload}
          copyStatus={copyStatus}
        />
      </main>
    </div>
  );
}

const _clamp01 = (value: number) => Math.max(0, Math.min(value, 1));

const _timelineTime = (possession: Possession) =>
  possession.videoStartSec ?? possession.minute * 60;

export default App;
