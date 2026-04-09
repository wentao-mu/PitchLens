import type { AssistantMessage } from "../types";
import { UI_TEXT, type Language } from "../lib/i18n";

type AssistantPanelProps = {
  messages: AssistantMessage[];
  draft: string;
  onDraftChange: (value: string) => void;
  onSend: () => void;
  onReset: () => void;
  onUsePrompt: (prompt: string) => void;
  quickPrompts: string[];
  isLoading: boolean;
  statusLabel: string;
  language: Language;
};

export function AssistantPanel({
  messages,
  draft,
  onDraftChange,
  onSend,
  onReset,
  onUsePrompt,
  quickPrompts,
  isLoading,
  statusLabel,
  language,
}: AssistantPanelProps) {
  const ui = UI_TEXT[language];

  return (
    <section className="panel assistant-panel">
      <div className="panel-heading assistant-panel__head">
        <div>
          <p className="eyebrow">{language === "zh" ? "助手" : "Assistant"}</p>
          <h2>
            {language === "zh"
              ? "上下文感知助手"
              : "Context-aware assistant"}
          </h2>
        </div>
        <div className="assistant-panel__actions">
          <span className="assistant-status-chip">{statusLabel}</span>
          <button type="button" className="ghost-button" onClick={onReset}>
            {language === "zh" ? "重置对话" : "Reset thread"}
          </button>
        </div>
      </div>

      <p className="panel-copy assistant-panel__copy">
        {language === "zh"
          ? "你可以问当前聚焦片段、当前对比结果，或者当前锁定条件能支持什么结论。助手会基于当前分析页面作答。"
          : "Ask about the focused clip, the current comparison, or what the active lock actually supports. The assistant answers from the live analysis context."}
      </p>

      <div className="assistant-prompts">
        {quickPrompts.map((prompt) => (
          <button
            key={prompt}
            type="button"
            className="assistant-prompt-chip"
            onClick={() => onUsePrompt(prompt)}
          >
            {prompt}
          </button>
        ))}
      </div>

      <div className="assistant-thread" aria-live="polite">
        {messages.map((message) => (
          <article
            key={message.id}
            className={
              message.role === "assistant"
                ? "assistant-message assistant-message--assistant"
                : "assistant-message assistant-message--user"
            }
          >
            <div className="assistant-message__meta">
              <strong>
                {message.role === "assistant"
                  ? "PitchLens"
                  : language === "zh"
                    ? "你"
                    : "You"}
              </strong>
              {message.meta ? <span>{message.meta}</span> : null}
            </div>
            <p>{message.content}</p>
          </article>
        ))}
        {isLoading ? (
          <div className="assistant-loading">
            {language === "zh"
              ? "正在生成战术回复..."
              : "Generating tactical response..."}
          </div>
        ) : null}
      </div>

      <form
        className="assistant-composer"
        onSubmit={(event) => {
          event.preventDefault();
          onSend();
        }}
      >
        <textarea
          value={draft}
          onChange={(event) => onDraftChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
              event.preventDefault();
              onSend();
            }
          }}
          placeholder={
            language === "zh"
              ? "可以问当前片段的重点、不同对手之间的差异，或者下一步该如何给出战术建议。"
              : "Ask about the key idea in this clip, the difference between opponents, or what to coach next."
          }
          rows={4}
        />
        <div className="assistant-composer__actions">
          <span>
            {language === "zh" ? "Cmd/Ctrl + Enter 发送" : "Cmd/Ctrl + Enter to send"}
          </span>
          <button type="submit" disabled={isLoading || !draft.trim()}>
            {isLoading
              ? language === "zh"
                ? "思考中..."
                : "Thinking..."
              : language === "zh"
                ? "询问助手"
                : "Ask assistant"}
          </button>
        </div>
      </form>
    </section>
  );
}
