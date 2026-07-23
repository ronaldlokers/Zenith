import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../api";

// Salary-negotiation roleplay (BYO Claude key): a stateless multi-turn practice
// loop. The component holds the transcript and sends it back each turn via
// /api/ai/negotiation; the worker plays the hiring manager under the user's key.
// Reuses the .mock-* styles (same chat shape as the mock interview).
type ChatMsg = { role: "user" | "assistant"; content: string };

// Hidden opening turn that primes the hiring manager to make the first offer.
const KICKOFF = "Let's start. Make me your opening offer.";

export interface NegotiationRoleplayProps {
  title: string;
  company: string | null;
  salaryExpectation: string | null;
  jobDescription: string | null;
  onError: (message: string | null) => void;
}

export function NegotiationRoleplay({
  title,
  company,
  salaryExpectation,
  jobDescription,
  onError,
}: NegotiationRoleplayProps) {
  const { t } = useTranslation();
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const transcriptRef = useRef<HTMLDivElement>(null);

  const ctx = {
    title,
    company: company ?? undefined,
    salaryExpectation: salaryExpectation ?? undefined,
    jobDescription: jobDescription ?? undefined,
  };

  const turn = async (history: ChatMsg[]) => {
    setBusy(true);
    onError(null);
    try {
      const { reply } = await api.negotiation(ctx, history);
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
        <p className="muted small">{t("negotiation.hint")}</p>
        <button
          type="button"
          className="mock-start"
          disabled={busy}
          onClick={start}
        >
          {busy ? t("negotiation.thinking") : t("negotiation.start")}
        </button>
      </div>
    );
  }

  return (
    <div className="mock-interview">
      <div className="mock-transcript" ref={transcriptRef}>
        {visible.map((m, i) => (
          <div key={i} className={`mock-msg mock-${m.role}`}>
            {m.content}
          </div>
        ))}
        {busy && (
          <div className="mock-msg mock-assistant muted">
            {t("negotiation.thinking")}
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
          placeholder={t("negotiation.answerPlaceholder")}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          disabled={busy}
        />
        <div className="mock-answer-actions">
          <button type="submit" disabled={busy || !input.trim()}>
            {t("negotiation.send")}
          </button>
          <button
            type="button"
            className="btn-secondary"
            disabled={busy}
            onClick={reset}
          >
            {t("negotiation.restart")}
          </button>
        </div>
      </form>
    </div>
  );
}
