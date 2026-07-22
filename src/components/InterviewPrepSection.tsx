import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../api";
import type { PrepItem } from "../types";
import { RemoveIcon } from "../icons";
import "./InterviewPrepSection.css";

// Extracted verbatim from detail.tsx (the application detail's interview
// prep checklist: starter checklist + add/toggle/reorder/remove items) as
// part of the #285 App.tsx/detail.tsx split — self-contained.
// InterviewPrepSection.css reproduces the App.css .prep-checklist*/.prep-add
// recipe under the .zui-prep-checklist*/.zui-prep-add names this component
// emits.
const PREP_STARTER_ITEMS = [
  "prep.starterResearch",
  "prep.starterQuestions",
  "prep.starterJd",
  "prep.starterStories",
] as const;

export interface InterviewPrepSectionProps {
  applicationId: number;
  onError: (message: string | null) => void;
}

export function InterviewPrepSection({
  applicationId,
  onError,
}: InterviewPrepSectionProps) {
  const { t } = useTranslation();
  const [items, setItems] = useState<PrepItem[] | null>(null);
  const [newText, setNewText] = useState("");

  const load = useCallback(
    () =>
      api
        .list<PrepItem>(`applications/${applicationId}/prep-items`)
        .then(setItems)
        .catch((e) => onError((e as Error).message)),
    [applicationId, onError],
  );

  useEffect(() => {
    load();
  }, [load]);

  const [adding, setAdding] = useState(false);
  const addItem = (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || adding) return;
    setAdding(true);
    api
      .create(`applications/${applicationId}/prep-items`, { text: trimmed })
      .then(() => {
        setNewText("");
        return load();
      })
      .catch((e) => onError((e as Error).message))
      .finally(() => setAdding(false));
  };

  const toggleDone = (item: PrepItem) =>
    api
      .update("prep-items", item.id, { done: !item.done })
      .then(load)
      .catch((e) => onError((e as Error).message));

  const removeItem = (id: number) =>
    api
      .remove("prep-items", id)
      .then(load)
      .catch((e) => onError((e as Error).message));

  // Reorder via sort_order swap (#207) — same pattern as the CV
  // sections (#94) rather than native drag, which is deliberately
  // gated off on touch input elsewhere in this app (see Board, #54).
  const moveItem = (index: number, dir: -1 | 1) => {
    if (!items) return;
    const other = items[index + dir];
    const item = items[index];
    if (!other) return;
    Promise.all([
      api.update("prep-items", item.id, { sort_order: other.sort_order }),
      api.update("prep-items", other.id, { sort_order: item.sort_order }),
    ])
      .then(load)
      .catch((e) => onError((e as Error).message));
  };

  const addStarterChecklist = () => {
    Promise.all(
      PREP_STARTER_ITEMS.map((key) =>
        api.create(`applications/${applicationId}/prep-items`, {
          text: t(key),
        }),
      ),
    )
      .then(load)
      .catch((e) => onError((e as Error).message));
  };

  if (!items) return null;

  return (
    <div className="zui-prep-checklist">
      {items.length === 0 && (
        <button onClick={addStarterChecklist}>
          {t("prep.addStarterChecklist")}
        </button>
      )}
      <ul>
        {items.map((item, i) => (
          <li key={item.id} className={item.done ? "done" : ""}>
            <label>
              <input
                type="checkbox"
                checked={!!item.done}
                onChange={() => toggleDone(item)}
              />
              {item.text}
            </label>
            <span className="zui-prep-item-actions">
              <button
                aria-label={t("cv.moveUp")}
                disabled={i === 0}
                onClick={() => moveItem(i, -1)}
              >
                ↑
              </button>
              <button
                aria-label={t("cv.moveDown")}
                disabled={i === items.length - 1}
                onClick={() => moveItem(i, 1)}
              >
                ↓
              </button>
              <button
                className="danger"
                onClick={() => removeItem(item.id)}
                aria-label={t("common.delete")}
              >
                <RemoveIcon />
              </button>
            </span>
          </li>
        ))}
      </ul>
      <div className="zui-prep-add">
        <input
          placeholder={t("prep.addItemPlaceholder")}
          value={newText}
          onChange={(e) => setNewText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              addItem(newText);
            }
          }}
        />
        <button disabled={adding} onClick={() => addItem(newText)}>
          {t("common.add")}
        </button>
      </div>
    </div>
  );
}
