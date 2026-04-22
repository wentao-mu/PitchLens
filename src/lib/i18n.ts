import type {
  ComparisonMetric,
  GameState,
  Phase,
  TacticalSignal,
  TimeWindow,
  TransitionType,
  Zone,
} from "../types";

export type Language = "en" | "zh";

export const DEFAULT_DATASET_LABEL: Record<Language, string> = {
  en: "PitchLens Curated Sample",
  zh: "PitchLens 精选样例",
};

const SIGNAL_LABELS: Record<Language, Record<TacticalSignal, string>> = {
  en: {
    "Left overload release": "Left overload release",
    "Central lane break": "Central lane break",
    "Right lane release": "Right lane release",
    "Press escape chain": "Press escape chain",
    "Wide switch cutback": "Wide switch cutback",
    "Counter-press regain": "Counter-press regain",
  },
  zh: {
    "Left overload release": "左路过载释放",
    "Central lane break": "中路突破",
    "Right lane release": "右路出球释放",
    "Press escape chain": "摆脱压迫链",
    "Wide switch cutback": "弱侧转移后倒三角",
    "Counter-press regain": "反抢夺回",
  },
};

const PHASE_LABELS: Record<Language, Record<Phase | "All phases", string>> = {
  en: {
    "All phases": "All phases",
    "Build-up": "Build-up",
    "Press resistance": "Press resistance",
    "Sustained attack": "Sustained attack",
    Transition: "Transition",
  },
  zh: {
    "All phases": "全部阶段",
    "Build-up": "组织出球",
    "Press resistance": "摆脱压迫",
    "Sustained attack": "持续进攻",
    Transition: "攻防转换",
  },
};

const ZONE_LABELS: Record<Language, Record<Zone | "All zones", string>> = {
  en: {
    "All zones": "All zones",
    "Left lane": "Left lane",
    "Central lane": "Central lane",
    "Right lane": "Right lane",
  },
  zh: {
    "All zones": "全部区域",
    "Left lane": "左路",
    "Central lane": "中路",
    "Right lane": "右路",
  },
};

const GAME_STATE_LABELS: Record<
  Language,
  Record<GameState | "All states", string>
> = {
  en: {
    "All states": "All states",
    Winning: "Winning",
    Drawing: "Drawing",
    Losing: "Losing",
  },
  zh: {
    "All states": "全部比分状态",
    Winning: "领先",
    Drawing: "平局",
    Losing: "落后",
  },
};

const TIME_WINDOW_LABELS: Record<
  Language,
  Record<TimeWindow, string>
> = {
  en: {
    "All windows": "All windows",
    "0-30": "0-30",
    "31-60": "31-60",
    "61-90": "61-90",
  },
  zh: {
    "All windows": "全部时间窗口",
    "0-30": "0-30",
    "31-60": "31-60",
    "61-90": "61-90",
  },
};

const TRANSITION_LABELS: Record<Language, Record<TransitionType, string>> = {
  en: {
    "Open play": "Open play",
    Counter: "Counter",
    "Set piece regain": "Set piece regain",
  },
  zh: {
    "Open play": "开放比赛",
    Counter: "反击",
    "Set piece regain": "定位球二次进攻",
  },
};

const COMPARISON_METRIC_LABELS: Record<
  Language,
  Record<ComparisonMetric, string>
> = {
  en: {
    xThreat: "xThreat",
    progression: "Progression",
    pressure: "Pressure",
    actionValue: "Action value",
  },
  zh: {
    xThreat: "xThreat",
    progression: "推进",
    pressure: "压力",
    actionValue: "动作价值",
  },
};

export const UI_TEXT = {
  en: {
    langSwitch: "中文",
    brandSubtitle: "Analysis workspace",
    engine: "Engine",
    analyzing: "Analyzing video",
    ready: "Ready",
    offline: "Offline",
    checking: "Checking",
    heroTitle: "PitchLens analysis workspace",
    heroSubtitle: "Providing new support for football analysis.",
    evidenceVideo: "Video-derived evidence",
    evidenceStructured: "Structured evidence",
    overviewIntro:
      "Start by loading your data in Data Loader, then apply filters, explore signal summaries, and run a deep-dive comparison.",
    loaderLabel: "Data Loader",
    filtersLabel: "Filters",
    scenariosLabel: "Scenarios",
    deepDiveLabel: "Deep Dive",
    activeSignalLabel: "Active signal",
    focusedClipLabel: "Focused clip",
    noSelection: "None selected",
    openDeepDive: "Go to Deep Dive to inspect a clip.",
    noEvidence: "No evidence under the current lock.",
    allOpponents: "All opponents",
    noLockApplied: "No lock applied",
    lockedTo: "Locked to",
    matchingPossessions: "matching possessions in scope",
    clipsLoaded: "clips loaded",
    clipsExtracted: "clips extracted from video",
    filtersTitle: "Filters",
    filtersCopy:
      "Isolate match data by selecting specific teams, pitch locations, or match phases. Your selections will dynamically rebuild all analytical models and video clips on other pages.",
    analysisTeam: "Analysis team",
    opponentScope: "Opponent scope",
    gameState: "Game state",
    phase: "Phase",
    zone: "Zone",
    timeWindow: "Time window preset",
    minuteRange: "Minute range",
    retrievalScore: "Retrieval score",
    diversityCopy:
      "Diversity suppresses near-duplicates so the final evidence set stays compact and replayable.",
    scenariosEyebrow: "Scenarios",
    scenariosTitle: "Analytical scenarios",
    scenariosCopy:
      "Choose a preset to apply both a starting context lock and an active signal. Then review what remains in scope before moving into Deep Dive.",
    scenarioCard: "Preset",
    activePreset: "Active",
    scenarioSummary: "Scenario",
    currentLock: "Current lock",
    focusClip: "Focus clip",
    customLock: "Custom lock",
    customLockMeta:
      "Filters or signal were adjusted manually after the preset was applied.",
    noClipSelected: "No clip selected",
    chooseScenarioMeta:
      "Choose a scenario or signal to surface ranked evidence.",
    rankedClipMeta: (count: number) =>
      `${count} representative clips currently ranked.`,
    scopeMeta: (count: number) => `${count} clips remain inside the current scope.`,
    signalOverview: "Signal overview",
    telemetryTitle: "Current telemetry distribution",
    telemetryCopy:
      "These counts reflect the current lock. Selecting a signal here will re-rank the evidence set without changing the underlying scope.",
    detections: "detections",
    avgXt: "Avg xT",
    avgAv: "Avg AV",
    formationTendency: "Formation tendency",
    actionValueDistribution: "Action value distribution",
    highLeverage: "High leverage",
    mediumLeverage: "Medium leverage",
    lowLeverage: "Low leverage",
    opponentBoard: "Opponent board",
    opponent: "Opponent",
    clips: "Clips",
    results: "results",
    noMatchingClips: "No clips match the current filters.",
    tacticalTimeline: "Tactical timeline",
    spatialMap: "Spatial map",
    sourceVideo: "Source video",
    tacticalView: "Tactical 360°",
    broadcastView: "Broadcast feed",
    noLinkedVideo: "No video linked for this possession.",
    play: "Play",
    pause: "Pause",
    replay: "Replay",
    previousClip: "Previous clip",
    nextClip: "Next clip",
    clipStart: "Clip start",
    currentWindow: "Window",
    currentTime: "Current",
    scrubVideo: "Scrub video playback",
    clip: "Clip",
    fullMatch: "Full match",
    selectClipToView: "Select a clip to view it.",
    analysis: "Analysis",
    actionValue: "Action value",
    passes: "Passes",
    duration: "Duration",
    formation: "Formation",
    outcome: "Outcome",
    zoneCoordinates: "Zone coordinates",
    scoreline: "Scoreline",
    transition: "Transition",
    progression: "Progression",
    signalFit: "Signal fit",
    contextFit: "Context fit",
    diversity: "Diversity",
    selectClipToAnalyze: "Select a clip to analyze.",
    compareTitle: "Strategic juxtaposition",
    compareCopy:
      "Contrast tactical signatures across different match lanes.",
    leftCompare: "Left lane",
    rightCompare: "Right lane",
    laneA: "Lane A",
    laneB: "Lane B",
    dataLoaderTitle: "Data Loader",
    dataLoaderCopy:
      "Initialize the tactical engine. Drop raw broadcast footage or feed structured telemetry to begin semantic processing.",
    videoAnalysis: "Video analysis",
    engineReady: "Engine ready",
    engineOffline: "Engine offline",
    analyzeFootage: "Analyze broadcast footage",
    analyzeFootageCopy:
      "Drop MP4, MOV, or AVI to begin tactical extraction",
    browseFiles: "Browse files",
    sourceStream: "Source stream",
    projectTeam: "Project team",
    matchOpponent: "Match opponent",
    competition: "Competition",
    matchVenue: "Match venue",
    homeMatch: "Home match",
    awayMatch: "Away match",
    finalScore: "Final score",
    globalPhase: "Global phase",
    drawingState: "Level / Transition",
    winningState: "In lead",
    losingState: "Trailing",
    resolution: "Resolution",
    detectedClips: "Detected clips",
    pitchConfidence: "Pitch confidence",
    structuredData: "Structured data",
    importTelemetry: "Import telemetry data",
    importTelemetryCopy:
      "Support for Opta, StatsBomb, and custom PitchLens JSON/CSV",
    youtubeMode: "YouTube URL mode",
    youtubeModeCopy:
      "Link a public YouTube broadcast to the current workspace for contextual playback. This does not run clip extraction.",
    youtubeUrl: "YouTube URL",
    kickoffOffset: "Kickoff offset (sec)",
    linkYoutube: "Link YouTube source",
    analyzeYoutube: "Analyze YouTube video",
    loadYoutubeDemo: "Load bundled video demo",
    youtubeDemoMeta:
      "Demo source: Arsenal v Chelsea (FA Women's League Cup highlights), bundled locally with precomputed clips.",
    youtubeModeMeta:
      "Use this with event data when you want broadcast context without local video upload.",
    youtubeLinked: "YouTube linked source",
    openYoutube: "Open on YouTube",
    linkedVideoSource: "Linked video source",
    importFiles: "Import files",
    libraryDemo: "Library demo",
    activeDataset: "Active dataset",
    streamStatus: "Stream status",
    exportJson: "Export JSON",
    exportCsv: "Export CSV",
    assistantStatusContext: "Context grounded",
    assistantStatusLocal: "Local tactical summary",
    assistantStatusUnavailable: "Unavailable",
    assistantPromptWhy: (title: string) =>
      `Why does "${title}" matter in this view?`,
    assistantPromptTakeaway: "What is the main takeaway from the current view?",
    assistantPromptCompare: (left: string, right: string) =>
      `Compare ${left} and ${right} under this lock.`,
    assistantPromptCoach: (signal: string) =>
      `What would you coach next for ${signal}?`,
    assistantPromptLock: "Summarize the current context lock in plain language.",
    statusDefault:
      "Sample dataset loaded. Video ingest is available when the local API is running.",
  },
  zh: {
    langSwitch: "EN",
    brandSubtitle: "分析工作台",
    engine: "引擎",
    analyzing: "分析视频中",
    ready: "就绪",
    offline: "离线",
    checking: "检查中",
    heroTitle: "PitchLens 足球分析工作台",
    heroSubtitle: "为足球分析提供新的支持。",
    evidenceVideo: "视频生成证据",
    evidenceStructured: "结构化证据",
    overviewIntro:
      "先在数据导入中加载数据，再进行筛选、查看信号汇总，并进入深度分析和对比。",
    loaderLabel: "数据导入",
    filtersLabel: "筛选",
    scenariosLabel: "场景",
    deepDiveLabel: "深度分析",
    activeSignalLabel: "当前信号",
    focusedClipLabel: "聚焦片段",
    noSelection: "未选择",
    openDeepDive: "进入深度分析查看片段。",
    noEvidence: "当前锁定条件下没有证据片段。",
    allOpponents: "全部对手",
    noLockApplied: "尚未锁定",
    lockedTo: "已锁定到",
    matchingPossessions: "个匹配片段",
    clipsLoaded: "已加载片段",
    clipsExtracted: "已从视频中抽取片段",
    filtersTitle: "筛选",
    filtersCopy:
      "通过选择球队、场上区域或比赛阶段来锁定分析范围。你的选择会同步影响其他页面中的模型、排序和视频片段。",
    analysisTeam: "分析球队",
    opponentScope: "对手范围",
    gameState: "比分状态",
    phase: "阶段",
    zone: "区域",
    timeWindow: "时间窗口",
    minuteRange: "分钟范围",
    retrievalScore: "检索评分",
    diversityCopy:
      "多样性项会压制近似重复片段，让最终证据集保持紧凑且可回放。",
    scenariosEyebrow: "场景",
    scenariosTitle: "分析场景",
    scenariosCopy:
      "选择一个预设场景，同时应用起始上下文锁定和当前主信号。然后先看清范围内还剩什么，再进入深度分析。",
    scenarioCard: "预设",
    activePreset: "当前",
    scenarioSummary: "场景",
    currentLock: "当前锁定",
    focusClip: "聚焦片段",
    customLock: "自定义锁定",
    customLockMeta: "在应用预设后，你又手动调整了筛选条件或信号。",
    noClipSelected: "尚未选择片段",
    chooseScenarioMeta: "先选择一个场景或信号，再查看排序后的证据片段。",
    rankedClipMeta: (count: number) => `当前已完成 ${count} 个代表性片段排序。`,
    scopeMeta: (count: number) => `当前范围内还剩 ${count} 个片段。`,
    signalOverview: "信号概览",
    telemetryTitle: "当前指标分布",
    telemetryCopy:
      "这些统计反映的是当前锁定条件下的结果。在这里切换信号只会重新排序证据，不会改变底层筛选范围。",
    detections: "命中片段",
    avgXt: "平均 xT",
    avgAv: "平均 AV",
    formationTendency: "阵型倾向",
    actionValueDistribution: "动作价值分布",
    highLeverage: "高价值",
    mediumLeverage: "中价值",
    lowLeverage: "低价值",
    opponentBoard: "对手面板",
    opponent: "对手",
    clips: "片段",
    results: "条结果",
    noMatchingClips: "当前筛选条件下没有匹配片段。",
    tacticalTimeline: "战术时间轴",
    spatialMap: "空间路径",
    sourceVideo: "源视频",
    tacticalView: "战术路径视图",
    broadcastView: "转播视频视图",
    noLinkedVideo: "当前片段没有关联视频。",
    play: "播放",
    pause: "暂停",
    replay: "重播",
    previousClip: "上一片段",
    nextClip: "下一片段",
    clipStart: "回到片段起点",
    currentWindow: "时间窗",
    currentTime: "当前时间",
    scrubVideo: "拖动视频进度",
    clip: "片段",
    fullMatch: "整场视频",
    selectClipToView: "请选择一个片段查看。",
    analysis: "分析",
    actionValue: "动作价值",
    passes: "传球数",
    duration: "时长",
    formation: "阵型",
    outcome: "结果",
    zoneCoordinates: "区域坐标",
    scoreline: "比分",
    transition: "转换类型",
    progression: "推进值",
    signalFit: "信号匹配",
    contextFit: "上下文匹配",
    diversity: "多样性",
    selectClipToAnalyze: "请选择一个片段开始分析。",
    compareTitle: "战术对比",
    compareCopy: "在严格锁定的条件下，对比不同对手之间的战术特征差异。",
    leftCompare: "左侧对比组",
    rightCompare: "右侧对比组",
    laneA: "对比组 A",
    laneB: "对比组 B",
    dataLoaderTitle: "数据导入",
    dataLoaderCopy:
      "初始化战术分析引擎。你可以导入原始转播视频，也可以导入结构化事件数据。",
    videoAnalysis: "视频分析",
    engineReady: "引擎就绪",
    engineOffline: "引擎离线",
    analyzeFootage: "分析转播视频",
    analyzeFootageCopy: "拖入 MP4、MOV 或 AVI 文件开始提取战术片段",
    browseFiles: "选择文件",
    sourceStream: "原始视频",
    projectTeam: "分析球队",
    matchOpponent: "对手",
    competition: "赛事",
    matchVenue: "主客场",
    homeMatch: "主场",
    awayMatch: "客场",
    finalScore: "比分",
    globalPhase: "比赛状态",
    drawingState: "平局 / 均势",
    winningState: "领先",
    losingState: "落后",
    resolution: "分辨率",
    detectedClips: "检测片段",
    pitchConfidence: "球场置信度",
    structuredData: "结构化数据",
    importTelemetry: "导入事件数据",
    importTelemetryCopy: "支持 Opta、StatsBomb 和自定义 PitchLens JSON/CSV",
    youtubeMode: "YouTube 链接模式",
    youtubeModeCopy:
      "把公开视频链接到当前工作区，用于回看上下文，不会执行本地片段提取。",
    youtubeUrl: "YouTube 链接",
    kickoffOffset: "开球偏移（秒）",
    linkYoutube: "链接 YouTube 视频源",
    analyzeYoutube: "分析 YouTube 视频",
    loadYoutubeDemo: "分析视频示例",
    youtubeDemoMeta:
      "示例视频：Arsenal v Chelsea（女联赛杯集锦）。这条路径会走本地视频分析引擎。",
    youtubeModeMeta:
      "适合配合事件数据使用，在不上传本地视频的情况下补充转播上下文。",
    youtubeLinked: "已链接 YouTube 视频源",
    openYoutube: "在 YouTube 中打开",
    linkedVideoSource: "已链接视频源",
    importFiles: "导入文件",
    libraryDemo: "加载示例",
    activeDataset: "当前数据集",
    streamStatus: "当前状态",
    exportJson: "导出 JSON",
    exportCsv: "导出 CSV",
    assistantStatusContext: "基于当前分析上下文",
    assistantStatusLocal: "本地战术摘要",
    assistantStatusUnavailable: "不可用",
    assistantPromptWhy: (title: string) =>
      `为什么“${title}”在当前视图里重要？`,
    assistantPromptTakeaway: "当前视图最核心的结论是什么？",
    assistantPromptCompare: (left: string, right: string) =>
      `比较 ${left} 和 ${right} 在当前锁定下的差异。`,
    assistantPromptCoach: (signal: string) =>
      `如果围绕 ${signal} 给建议，下一步该怎么做？`,
    assistantPromptLock: "用更直白的话总结当前的上下文锁定。",
    statusDefault: "样例数据已加载。启动本地 API 后即可进行视频分析。",
  },
} as const;

export const signalLabel = (signal: TacticalSignal, language: Language) =>
  SIGNAL_LABELS[language][signal];

export const phaseLabel = (phase: Phase | "All phases", language: Language) =>
  PHASE_LABELS[language][phase];

export const zoneLabel = (zone: Zone | "All zones", language: Language) =>
  ZONE_LABELS[language][zone];

export const gameStateLabel = (
  gameState: GameState | "All states",
  language: Language,
) => GAME_STATE_LABELS[language][gameState];

export const timeWindowLabel = (
  timeWindow: TimeWindow,
  language: Language,
) => TIME_WINDOW_LABELS[language][timeWindow];

export const transitionLabel = (
  transitionType: TransitionType,
  language: Language,
) => TRANSITION_LABELS[language][transitionType];

export const comparisonMetricLabel = (
  metric: ComparisonMetric,
  language: Language,
) => COMPARISON_METRIC_LABELS[language][metric];
