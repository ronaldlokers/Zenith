// Why an application ended (#381). Opens straight after a move to a terminal
// stage — the status is already saved by then, so Skip and any failure here
// are both harmless: nothing can lose the move.
//
// The reason list is scoped to the status that was just set, so every option
// makes sense for the move that was actually made. Also used from the detail
// page to fill in a reason that was skipped, which is what keeps Skip from
// being a dead end.
import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { TerminalStatus } from "../types";
import { OUTCOME_REASONS } from "../types";
import { Dialog } from "../ui";
import { ActionBar } from "./ActionBar";
import { Button } from "./Button";
import "./OutcomeDialog.css";

export interface OutcomeDialogProps {
  status: TerminalStatus;
  initialReason?: string | null;
  initialNote?: string | null;
  onSave: (reason: string | null, note: string | null) => void;
  onClose: () => void;
}

export function OutcomeDialog({
  status,
  initialReason = null,
  initialNote = null,
  onSave,
  onClose,
}: OutcomeDialogProps) {
  const { t } = useTranslation();
  const [reason, setReason] = useState<string | null>(initialReason);
  const [note, setNote] = useState(initialNote ?? "");

  return (
    <Dialog label={t("outcome.title")} onClose={onClose}>
      <h2>{t("outcome.title")}</h2>
      <p className="muted small zui-outcome-lead">
        {t("outcome.lead", { stage: t(`stages.${status}`) })}
      </p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onSave(reason, note.trim() || null);
        }}
      >
        <fieldset className="zui-outcome-reasons">
          <legend className="sr-only">{t("outcome.title")}</legend>
          {OUTCOME_REASONS[status].map((r) => (
            <label key={r} className="zui-outcome-reason">
              <input
                type="radio"
                name="outcome-reason"
                value={r}
                checked={reason === r}
                onChange={() => setReason(r)}
              />
              <span>{t(`outcome.reason.${r}`)}</span>
            </label>
          ))}
        </fieldset>
        <label className="zui-outcome-note">
          <span className="muted small">{t("outcome.note")}</span>
          <textarea
            rows={2}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={t("outcome.notePlaceholder")}
          />
        </label>
        <ActionBar variant="form">
          <Button type="submit" variant="primary" disabled={!reason}>
            {t("common.save")}
          </Button>
          <Button type="button" variant="secondary" onClick={onClose}>
            {t("outcome.skip")}
          </Button>
        </ActionBar>
      </form>
    </Dialog>
  );
}
