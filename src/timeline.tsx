// Interaction timeline extracted from App.tsx (#285 split) — the per-record
// touchpoint log + logger, shared by the application detail (App) and the
// company/contact detail modals (network.tsx).
import { useCallback, useEffect, useState } from "react";
import type { FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { api } from "./api";
import { formatDate, today } from "./format";
import { RemoveIcon } from "./icons";
import { INTERACTION_TYPES } from "./types";
import type { Interaction } from "./types";

export function Timeline({
  resource,
  targetId,
  onError,
  onLogged,
}: {
  resource: "applications" | "contacts";
  targetId: number;
  onError: (message: string | null) => void;
  onLogged?: () => void;
}) {
  const { t } = useTranslation();
  const [items, setItems] = useState<Interaction[] | null>(null);
  const [form, setForm] = useState({ type: "email", happened_at: today(), notes: "" });
  // Retrospective prompt (#221) — only surfaces for the "interview" type,
  // since that's the interaction worth reflecting on right after it
  // happens. Answers fold into the same interaction's notes rather than
  // a separate record, so the timeline stays a single source of truth.
  const [wentWell, setWentWell] = useState("");
  const [toImprove, setToImprove] = useState("");
  // Multiple interviewers per round (#220) — free-text names/roles,
  // same lightweight pattern as tags rather than linking Contact
  // records, since panel interviewers often never become a tracked
  // contact.
  const [interviewers, setInterviewers] = useState("");

  const load = useCallback(
    () =>
      api
        .interactions(resource, targetId)
        .then(setItems)
        .catch((e) => onError((e as Error).message)),
    [resource, targetId, onError],
  );

  useEffect(() => {
    load();
  }, [load]);

  const [logging, setLogging] = useState(false);
  const logInteraction = (e: FormEvent) => {
    e.preventDefault();
    if (logging) return;
    const retro = [
      wentWell.trim() && `${t("interactionTypes.retroWentWell")}: ${wentWell.trim()}`,
      toImprove.trim() && `${t("interactionTypes.retroToImprove")}: ${toImprove.trim()}`,
    ]
      .filter(Boolean)
      .join("\n");
    const notes = [form.notes.trim(), retro].filter(Boolean).join("\n\n");
    setLogging(true);
    api
      .addInteraction(resource, targetId, {
        type: form.type,
        happened_at: form.happened_at,
        notes: notes || null,
        interviewers: form.type === "interview" ? interviewers.trim() || null : null,
      })
      .then(() => {
        setForm({ type: "email", happened_at: today(), notes: "" });
        setWentWell("");
        setToImprove("");
        setInterviewers("");
        onLogged?.();
        return load();
      })
      .catch((err) => onError((err as Error).message))
      .finally(() => setLogging(false));
  };

  return (
    <div className="timeline">
      <form className="tl-add" onSubmit={logInteraction}>
        <select
          value={form.type}
          onChange={(e) => setForm({ ...form, type: e.target.value })}
          aria-label={t("aria.interactionType")}
        >
          {INTERACTION_TYPES.map((it) => (
            <option key={it} value={it}>
              {t(`interactionTypes.${it}`)}
            </option>
          ))}
        </select>
        <input
          type="date"
          value={form.happened_at}
          onChange={(e) => setForm({ ...form, happened_at: e.target.value })}
          aria-label={t("aria.interactionDate")}
        />
        <input
          placeholder={t("timeline.whatHappenedPlaceholder")}
          value={form.notes}
          onChange={(e) => setForm({ ...form, notes: e.target.value })}
        />
        {form.type === "interview" && (
          <div className="tl-retro">
            <input
              placeholder={t("interactionTypes.interviewersPlaceholder")}
              value={interviewers}
              onChange={(e) => setInterviewers(e.target.value)}
            />
            <input
              placeholder={t("interactionTypes.retroWentWellPlaceholder")}
              value={wentWell}
              onChange={(e) => setWentWell(e.target.value)}
            />
            <input
              placeholder={t("interactionTypes.retroToImprovePlaceholder")}
              value={toImprove}
              onChange={(e) => setToImprove(e.target.value)}
            />
          </div>
        )}
        <button type="submit" className="primary" disabled={logging}>
          {t("common.log")}
        </button>
      </form>
      <ul className="tl-items">
        {(items ?? []).map((it) => (
          <li key={it.id}>
            <span className="tl-type">{t(`interactionTypes.${it.type}`)}</span>
            <span className="tl-date">{formatDate(it.happened_at)}</span>
            <span className="tl-notes">
              {it.interviewers && (
                <span className="tl-interviewers">
                  {t("interactionTypes.interviewersLabel")}: {it.interviewers}
                </span>
              )}
              {it.notes ?? ""}
              {it.via_contact ? <span className="badge">{t("timeline.viaContact")}</span> : null}
            </span>
            <button
              className="tl-del danger"
              aria-label={t("common.delete")}
              onClick={() =>
                api
                  .remove("interactions", it.id)
                  .then(load)
                  .catch((e) => onError((e as Error).message))
              }
            >
              <RemoveIcon />
            </button>
          </li>
        ))}
        {items?.length === 0 && (
          <li className="tl-empty">{t("detail.noTouchpoints")}</li>
        )}
      </ul>
    </div>
  );
}
