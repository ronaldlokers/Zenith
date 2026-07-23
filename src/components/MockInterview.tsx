import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../api";

// AI mock interview (BYO Claude key): a stateless multi-turn practice loop. The
// component holds the transcript and sends it back each turn via
// /api/ai/mock-interview; the worker calls Claude under the user's own key.
type ChatMsg = { role: "user" | "assistant"; content: string };

// Hidden opening turn that primes the model to ask the first question.
const KICKOFF = "Please begin the interview with your first question.";

export interface MockInterviewProps {
  title: string;
  company: string | null;
  jobDescription: string | null;
  onError: (message: string | null) => void;
}

export function MockInterview({
  title,
  company,
  jobDescription,
  onError,
}: MockInterviewProps) {
  const { t } = useTranslation();
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const transcriptRef = useRef<HTMLDivElement>(null);

  const ctx = {
    title,
    company: company ?? undefined,
    jobDescription: jobDescription ?? undefined,
  };

  const turn = async (history: ChatMsg[]) => {
    setBusy(true);
    onError(null);
    try {
      const { reply } = await api.mockInterview(ctx, history);
      setMessages([...history, { role: "assistant", content: reply }]);
      requestAnimationFrame(() => {
        const el = transcriptRef.current;
        if (el) el.scrollTop = el.scrollHeight;
      });
    } catch (e) {
      onError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const start = () => void turn([{ role: "user", content: KICKOFF }]);

  const answer = () => {
    if (!input.trim() || busy) return;
    const history: ChatMsg[] = [
      ...messages,
      { role: "user", content: input.trim() },
    ];
    setMessages(history);
    setInput("");
    void turn(history);
  };

  const reset = () => {
    setMessages([]);
    setInput("");
    onError(null);
  };

  // The KICKOFF turn is internal; render everything after it.
  const visible = messages.slice(1);

  if (messages.length === 0) {
    return (
      <div className="mock-interview">
        <p className="muted small">{t("mockInterview.hint")}</p>
        <button
          type="button"
          className="mock-start"
          disabled={busy}
          onClick={start}
        >
          {busy ? t("mockInterview.thinking") : t("mockInterview.start")}
        </button>
      </div>
    );
  }

  return (
    <div className="mock-interview">
      <div
        className="mock-transcript"
        ref={transcriptRef}
        aria-live="polite"
        aria-busy={busy}
      >
        {visible.map((m, i) => (
          <div key={i} className={`mock-msg mock-${m.role}`}>
            {m.content}
          </div>
        ))}
        {busy && (
          <div className="mock-msg mock-assistant muted">
            {t("mockInterview.thinking")}
          </div>
        )}
      </div>
      <form
        className="mock-answer"
        onSubmit={(e) => {
          e.preventDefault();
          answer();
        }}
      >
        <textarea
          rows={2}
          placeholder={t("mockInterview.answerPlaceholder")}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          disabled={busy}
        />
        <div className="mock-answer-actions">
          <button type="submit" disabled={busy || !input.trim()}>
            {t("mockInterview.send")}
          </button>
          <button
            type="button"
            className="btn-secondary"
            disabled={busy}
            onClick={reset}
          >
            {t("mockInterview.restart")}
          </button>
        </div>
      </form>
    </div>
  );
}
