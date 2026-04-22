import type { AssistantRequest, AssistantResponse } from "../types";
import { apiUrl } from "./apiBase";

const SIGNAL_LABELS_ZH: Record<string, string> = {
  "Left overload release": "左路过载释放",
  "Central lane break": "中路突破",
  "Press escape chain": "摆脱压迫链",
  "Wide switch cutback": "弱侧转移后倒三角",
  "Counter-press regain": "反抢夺回",
};

const containsCjk = (text: string) => /[\u4e00-\u9fff]/.test(text);

const matches = (question: string, ...terms: string[]) => {
  const lowered = question.toLowerCase();
  return terms.some((term) => question.includes(term) || lowered.includes(term.toLowerCase()));
};

const signalLabel = (signal: string, languageIsZh: boolean) =>
  languageIsZh ? SIGNAL_LABELS_ZH[signal] || signal : signal;

const buildLocalAssistantResponse = (
  payload: AssistantRequest,
): AssistantResponse => {
  const question = payload.question.trim();
  const languageIsZh = containsCjk(question);
  const focus = payload.focusPossession;
  const ranked = payload.rankedPossessions ?? [];
  const filteredCount = payload.filteredCount || ranked.length;
  const focusTitle =
    focus?.title || (languageIsZh ? "当前聚焦片段" : "the current focus clip");
  const focusReason = focus?.whyItMatters || focus?.note || "";
  const topTitles =
    ranked.slice(0, 3).map((item) => item.title).join(" / ") ||
    (languageIsZh ? "当前没有代表性片段" : "there are no ranked clips yet");
  const activeSignal = signalLabel(payload.activeSignal, languageIsZh);
  const comparisonText = payload.comparisonText || "";

  let answer: string;

  if (matches(question, "compare", "difference", "versus", "vs", "比较", "区别", "差异")) {
    answer = languageIsZh
      ? `当前对比锁定的是 ${payload.leftOpponent} 和 ${payload.rightOpponent}。${comparisonText || "当前还没有稳定的对比结论。"}\n\n我会先回看 ${topTitles} 这几段证据，确认差异是不是在同一上下文下持续出现。`
      : `The current comparison is locked to ${payload.leftOpponent} and ${payload.rightOpponent}. ${comparisonText || "There is not a stable comparison conclusion yet."}\n\nI would review ${topTitles} first to confirm whether that difference holds under the same context.`;
  } else if (
    matches(question, "why", "reason", "rank", "clip", "focus", "为什么", "片段", "重点", "当前")
  ) {
    answer = languageIsZh
      ? `当前最值得先看的片段是 ${focusTitle}。${focusReason ? `它的重要性主要在于 ${focusReason}。` : "它在当前锁定条件下同时满足信号匹配度和代表性。"}\n\n当前主分析信号是 ${activeSignal}，当前范围内还有 ${filteredCount} 个相关片段可继续核查。`
      : `The first clip I would review is ${focusTitle}. ${focusReason ? `It matters because ${focusReason}.` : "It best combines signal fit and representativeness under the current lock."}\n\nThe active pattern is ${activeSignal}, and there are ${filteredCount} related clips still in scope.`;
  } else if (
    matches(question, "recommend", "coaching", "next", "suggest", "建议", "下一步", "怎么做")
  ) {
    answer = languageIsZh
      ? `建议继续围绕 ${activeSignal} 来组织分析，并优先使用 ${topTitles} 作为核心证据组。\n\n如果要形成更稳定的结论，下一步应该先确认当前上下文锁定是否还需要继续收窄。`
      : `I would keep the review centered on ${activeSignal} and use ${topTitles} as the core evidence set.\n\nIf you need a firmer conclusion, the next step is to decide whether the current context lock should be narrowed further.`;
  } else if (matches(question, "filter", "context", "lock", "scope", "筛选", "上下文", "范围")) {
    answer = languageIsZh
      ? `当前的锁定条件是：${payload.contextLock}。\n\n在这个范围下，系统保留了 ${filteredCount} 个片段，当前主信号是 ${activeSignal}。如果你希望结论更稳，可以继续缩小到单一对手或单一阶段。`
      : `The current lock is ${payload.contextLock}.\n\nWithin that scope, the system still has ${filteredCount} clips and the active pattern is ${activeSignal}. If you want a tighter conclusion, narrow the view to one opponent or one phase.`;
  } else {
    answer = languageIsZh
      ? `基于当前视图，我会先围绕 ${activeSignal} 展开分析。当前聚焦片段是 ${focusTitle}，当前范围内共有 ${filteredCount} 个相关片段。\n\n如果要快速给出判断，我会先看 ${topTitles}，再结合当前对比结果：${comparisonText || "当前还没有足够的对比证据。"}`
      : `Based on the current view, I would center the analysis on ${activeSignal}. The current focus clip is ${focusTitle}, and there are ${filteredCount} related clips in scope.\n\nIf the goal is a quick takeaway, I would start with ${topTitles}, then fold in the current comparison result: ${comparisonText || "there is not enough matched comparison evidence yet."}`;
  }

  return {
    answer,
    mode: "local",
    model: "browser-local",
  };
};

export async function askAssistant(
  payload: AssistantRequest,
): Promise<AssistantResponse> {
  try {
    const response = await fetch(apiUrl("/api/assistant"), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      return buildLocalAssistantResponse(payload);
    }

    return (await response.json()) as AssistantResponse;
  } catch {
    return buildLocalAssistantResponse(payload);
  }
}
