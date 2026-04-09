from __future__ import annotations

import json
import os
from typing import Any
from urllib import error, request

OPENAI_RESPONSES_URL = "https://api.openai.com/v1/responses"
OLLAMA_CHAT_URL = os.getenv("PITCHLENS_OLLAMA_URL", "http://127.0.0.1:11434/api/chat")
DEFAULT_OPENAI_MODEL = os.getenv("PITCHLENS_AI_MODEL", "gpt-5-mini")
DEFAULT_OLLAMA_MODEL = os.getenv("PITCHLENS_OLLAMA_MODEL", "gemma3:4b")
DEFAULT_BACKEND = os.getenv("PITCHLENS_ASSISTANT_BACKEND", "ollama").lower()

SIGNAL_LABELS_ZH = {
    "Left overload release": "左路过载释放",
    "Central lane break": "中路突破",
    "Press escape chain": "摆脱压迫链",
    "Wide switch cutback": "弱侧转移后倒三角",
    "Counter-press regain": "反抢夺回",
}

TACTICAL_ASSISTANT_INSTRUCTIONS = """You are PitchLens, a tactical analysis copilot inside a soccer analysis workspace.

Ground rules:
- Stay grounded in the provided match context only.
- Answer in the same language as the user's latest question.
- Be concise, direct, and useful for an analyst.
- Cite the current focus clip, ranked evidence, and comparison lock when relevant.
- If the current view does not support a claim, say so plainly.
- Do not invent players, events, or outcomes that are not in the provided context.
"""


def _contains_cjk(text: str) -> bool:
    return any("\u4e00" <= char <= "\u9fff" for char in text)


def _matches(question: str, *terms: str) -> bool:
    lowered = question.lower()
    return any(term in question or term.lower() in lowered for term in terms)


def _signal_label(signal: str, language_is_zh: bool) -> str:
    if not language_is_zh:
        return signal
    return SIGNAL_LABELS_ZH.get(signal, signal)


def _format_possession_line(possession: dict[str, Any]) -> str:
    title = possession.get("title") or "Untitled clip"
    minute = possession.get("minute")
    opponent = possession.get("opponent") or "Unknown opponent"
    phase = possession.get("phase") or "Unknown phase"
    zone = possession.get("zone") or "Unknown zone"
    signal = possession.get("primarySignal") or "No signal"
    threat = possession.get("xThreat", 0)
    action_value = possession.get("actionValue", 0)
    return (
        f"- {title} | {opponent} | {minute}' | {phase} | {zone} | "
        f"{signal} | xT {threat:.2f} | AV {action_value}"
    )


def _build_context_prompt(payload: dict[str, Any]) -> str:
    focus = payload.get("focusPossession") or {}
    ranked = payload.get("rankedPossessions") or []
    messages = payload.get("conversation") or []
    latest_question = payload.get("question", "").strip()
    summary = payload.get("videoSummary")
    ranked_block = "\n".join(_format_possession_line(item) for item in ranked[:5])
    conversation_block = "\n".join(
        f"{message.get('role', 'user').title()}: {message.get('content', '').strip()}"
        for message in messages[-6:]
        if message.get("content")
    )
    focus_lines = [
        f"Title: {focus.get('title', 'None')}",
        f"Opponent: {focus.get('opponent', 'None')}",
        f"Minute: {focus.get('minute', 'None')}",
        f"Phase: {focus.get('phase', 'None')}",
        f"Zone: {focus.get('zone', 'None')}",
        f"Primary signal: {focus.get('primarySignal', 'None')}",
        f"Outcome: {focus.get('outcome', 'None')}",
        f"Why it matters: {focus.get('whyItMatters', 'None')}",
        f"Analyst note: {focus.get('note', 'None')}",
    ]
    summary_line = (
        "Video summary: "
        f"{summary.get('momentCount')} clips from {summary.get('videoDurationLabel')} "
        f"at {summary.get('analysisFps')} fps."
        if isinstance(summary, dict)
        else "Video summary: none."
    )
    export_note = (payload.get("exportNote") or "").strip()
    if len(export_note) > 1600:
        export_note = f"{export_note[:1600]}..."

    return (
        "PitchLens analysis context\n"
        f"Dataset: {payload.get('datasetLabel', 'Unknown dataset')}\n"
        f"Team: {payload.get('analysisTeam', 'Unknown team')}\n"
        f"Context lock: {payload.get('contextLock', 'Unknown')}\n"
        f"Active signal: {payload.get('activeSignal', 'Unknown')}\n"
        f"Comparison metric: {payload.get('comparisonMetricLabel', 'Unknown')}\n"
        f"Comparison lanes: {payload.get('leftOpponent', 'Lane A')} vs {payload.get('rightOpponent', 'Lane B')}\n"
        f"Comparison summary: {payload.get('comparisonText', 'None')}\n"
        f"Filtered clips in scope: {payload.get('filteredCount', len(ranked))}\n"
        f"Team clip count: {payload.get('teamClipCount', len(ranked))}\n"
        f"{summary_line}\n\n"
        "Current focus clip\n"
        + "\n".join(focus_lines)
        + "\n\n"
        + "Ranked evidence\n"
        + (ranked_block or "- No ranked evidence in the current view.")
        + "\n\n"
        + "Current export note\n"
        + (export_note or "None")
        + "\n\n"
        + "Recent conversation\n"
        + (conversation_block or "None")
        + "\n\n"
        + f"Latest user question\n{latest_question}"
    )


def _extract_output_text(payload: dict[str, Any]) -> str:
    direct_text = payload.get("output_text")
    if isinstance(direct_text, str) and direct_text.strip():
        return direct_text.strip()

    chunks: list[str] = []
    for item in payload.get("output", []):
        if item.get("type") != "message":
            continue
        for content in item.get("content", []):
            if content.get("type") == "output_text" and content.get("text"):
                chunks.append(content["text"])
    return "\n".join(chunks).strip()


def _call_openai(payload: dict[str, Any]) -> dict[str, str] | None:
    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        return None

    body = json.dumps(
        {
            "model": DEFAULT_OPENAI_MODEL,
            "instructions": TACTICAL_ASSISTANT_INSTRUCTIONS,
            "input": _build_context_prompt(payload),
            "store": False,
        }
    ).encode("utf-8")

    request_obj = request.Request(
        OPENAI_RESPONSES_URL,
        data=body,
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        },
        method="POST",
    )

    try:
        with request.urlopen(request_obj, timeout=45) as response:
            data = json.loads(response.read().decode("utf-8"))
    except (error.HTTPError, error.URLError, TimeoutError, json.JSONDecodeError):
        return None

    answer = _extract_output_text(data)
    if not answer:
        return None

    return {
        "answer": answer,
        "mode": "openai",
        "model": data.get("model") or DEFAULT_OPENAI_MODEL,
    }


def _call_ollama(payload: dict[str, Any]) -> dict[str, str] | None:
    body = json.dumps(
        {
            "model": DEFAULT_OLLAMA_MODEL,
            "messages": [
                {"role": "system", "content": TACTICAL_ASSISTANT_INSTRUCTIONS},
                {"role": "user", "content": _build_context_prompt(payload)},
            ],
            "stream": False,
            "options": {"temperature": 0.2},
        }
    ).encode("utf-8")

    request_obj = request.Request(
        OLLAMA_CHAT_URL,
        data=body,
        headers={"Content-Type": "application/json"},
        method="POST",
    )

    try:
        with request.urlopen(request_obj, timeout=90) as response:
            data = json.loads(response.read().decode("utf-8"))
    except (error.HTTPError, error.URLError, TimeoutError, json.JSONDecodeError):
        return None

    answer = (
        data.get("message", {}).get("content", "").strip()
        if isinstance(data.get("message"), dict)
        else ""
    )
    if not answer:
        return None

    return {
        "answer": answer,
        "mode": "ollama",
        "model": f"{data.get('model') or DEFAULT_OLLAMA_MODEL} via Ollama",
    }


def _build_local_reply(payload: dict[str, Any]) -> str:
    question = (payload.get("question") or "").strip()
    focus = payload.get("focusPossession") or {}
    ranked = payload.get("rankedPossessions") or []
    comparison_text = payload.get("comparisonText") or ""
    context_lock = payload.get("contextLock") or "No context lock applied."
    signal = payload.get("activeSignal") or "No active signal"
    left_opponent = payload.get("leftOpponent") or "Lane A"
    right_opponent = payload.get("rightOpponent") or "Lane B"
    filtered_count = payload.get("filteredCount") or len(ranked)
    language_is_zh = _contains_cjk(question)
    signal_label = _signal_label(signal, language_is_zh)

    top_titles = " / ".join(item.get("title", "clip") for item in ranked[:3]) or "no ranked clips"
    focus_title = focus.get("title") or ("当前聚焦片段" if language_is_zh else "the current focus clip")
    focus_reason = focus.get("whyItMatters") or focus.get("note") or ""
    recommendation = (
        f"Keep the review centered on {signal.lower()} and use {focus_title} as the first replayable example."
        if not language_is_zh
        else f"建议继续围绕{signal_label}来组织分析，并优先把{focus_title}作为第一个可回放证据。"
    )

    if _matches(question, "compare", "difference", "versus", "vs", "比较", "区别", "差异"):
        if language_is_zh:
            return (
                f"当前对比锁定的是 {left_opponent} 和 {right_opponent}。{comparison_text}\n\n"
                f"在当前视图里，我会优先从排名最高的几个片段入手，也就是 {top_titles}，去验证这种差异是不是稳定存在。"
            )
        return (
            f"The current comparison is locked to {left_opponent} versus {right_opponent}. {comparison_text}\n\n"
            f"In this view, I would validate that difference by replaying the highest-ranked clips first: {top_titles}."
        )

    if _matches(question, "why", "reason", "rank", "clip", "focus", "为什么", "片段", "重点", "当前"):
        if language_is_zh:
            return (
                f"当前最值得先看的片段是 {focus_title}。它之所以重要，主要是因为 {focus_reason or '它在当前锁定条件下同时满足信号匹配度和影响力。'}\n\n"
                f"它对应的主信号是 {signal_label}，而且当前筛选后还有 {filtered_count} 个相关片段可以作为补充证据。"
            )
        return (
            f"The first clip I would review is {focus_title}. It matters because "
            f"{focus_reason or 'it combines strong signal fit with strong impact under the current lock.'}\n\n"
            f"It is currently anchored to {signal}, and there are {filtered_count} clips still in scope around that pattern."
        )

    if _matches(question, "recommend", "coaching", "next", "suggest", "建议", "下一步", "怎么做"):
        if language_is_zh:
            return (
                f"{recommendation}\n\n"
                f"从工作流上看，我建议先确认当前锁定条件是否还需要收窄，然后再用 {top_titles} 这几个代表性片段去写最终结论。"
            )
        return (
            f"{recommendation}\n\n"
            f"From a workflow perspective, I would first confirm whether the context lock should be narrowed further, then use {top_titles} as the representative evidence set for the final note."
        )

    if _matches(question, "filter", "context", "lock", "scope", "筛选", "上下文", "范围"):
        if language_is_zh:
            return (
                f"当前的锁定条件是：{context_lock}。\n\n"
                f"在这个范围下，系统还保留了 {filtered_count} 个片段，并且主分析信号是 {signal_label}。如果你想要更稳定的结论，下一步可以继续缩小到单一对手或单一阶段。"
            )
        return (
            f"The current context lock is {context_lock}.\n\n"
            f"Within that scope, the system still has {filtered_count} clips in play and the active signal is {signal}. If you want a tighter conclusion, the next move is to narrow to one opponent or one phase."
        )

    if language_is_zh:
        return (
            f"基于当前视图，我会把重点放在 {signal_label} 上。当前聚焦片段是 {focus_title}，当前筛选范围里一共有 {filtered_count} 个相关片段。\n\n"
            f"如果你的目标是快速得出结论，我建议先看 {top_titles}，再结合当前对比结论：{comparison_text or '当前还没有足够对比信息。'}"
        )
    return (
        f"Based on the current view, I would center the analysis on {signal}. The current focus clip is {focus_title}, and there are {filtered_count} clips still in scope.\n\n"
        f"If the goal is to reach a quick takeaway, I would start with {top_titles}, then fold in the current comparison summary: {comparison_text or 'there is not enough matched comparison evidence yet.'}"
    )


def generate_assistant_reply(payload: dict[str, Any]) -> dict[str, str]:
    if DEFAULT_BACKEND == "ollama":
        ollama_reply = _call_ollama(payload)
        if ollama_reply:
            return ollama_reply
    elif DEFAULT_BACKEND == "openai":
        openai_reply = _call_openai(payload)
        if openai_reply:
            return openai_reply
    else:
        openai_reply = _call_openai(payload)
        if openai_reply:
            return openai_reply
        ollama_reply = _call_ollama(payload)
        if ollama_reply:
            return ollama_reply

    return {
        "answer": _build_local_reply(payload),
        "mode": "local",
        "model": "PitchLens local assistant",
    }
