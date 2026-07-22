import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { Application } from "../types";
import { STATUSES } from "../types";
import { Button } from "./Button";
import "./CardMenu.css";

// Extracted verbatim from board.tsx (the board card's ⋯ dropdown) as part of
// the #285 App.tsx/board.tsx split — self-contained: trigger button +
// backdrop + popup with move-stage / follow-up / open / archive actions and
// an inline follow-up form. CardMenu.css reproduces the App.css .card-menu*
// recipe under the .zui-cardmenu* names this component emits.
export interface CardMenuProps {
  a: Application;
  onMove: (status: string) => void;
  onSetFollowUp: (date: string | null, text: string | null) => void;
  onOpenDetail: () => void;
  onArchive: () => void;
}

export function CardMenu({
  a,
  onMove,
  onSetFollowUp,
  onOpenDetail,
  onArchive,
}: CardMenuProps) {
  const { t } = useTranslation();
  const [mode, setMode] = useState<null | "root" | "move" | "followup">(null);
  const [fuDate, setFuDate] = useState(a.next_action_at?.slice(0, 10) ?? "");
  const [fuText, setFuText] = useState(a.next_action ?? "");
  const close = () => setMode(null);
  return (
    <div className="zui-cardmenu" onClick={(e) => e.stopPropagation()}>
      <button
        type="button"
        className="zui-cardmenu-btn"
        aria-label={t("board.cardMenu", { title: a.title })}
        aria-haspopup="menu"
        onClick={() => setMode((m) => (m ? null : "root"))}
      >
        ⋯
      </button>
      {mode && (
        <>
          <div className="zui-cardmenu-backdrop" onClick={close} />
          <div className="zui-cardmenu-pop" role="menu">
            {mode === "root" && (
              <>
                <button type="button" role="menuitem" onClick={() => setMode("move")}>
                  {t("board.moveToStage")} ▸
                </button>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => setMode("followup")}
                >
                  {t("detail.setFollowUp")}
                </button>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    close();
                    onOpenDetail();
                  }}
                >
                  {t("common.open")}
                </button>
                <button
                  type="button"
                  role="menuitem"
                  className="danger"
                  onClick={() => {
                    close();
                    onArchive();
                  }}
                >
                  {t("detail.archive")}
                </button>
              </>
            )}
            {mode === "move" && (
              <>
                {STATUSES.filter((sName) => sName !== a.status).map((sName) => (
                  <button
                    key={sName}
                    type="button"
                    role="menuitem"
                    className={`stage-${sName}`}
                    onClick={() => {
                      close();
                      onMove(sName);
                    }}
                  >
                    <span className="zui-cardmenu-dot" /> {t(`stages.${sName}`)}
                  </button>
                ))}
              </>
            )}
            {mode === "followup" && (
              <form
                className="zui-cardmenu-fu"
                onSubmit={(e) => {
                  e.preventDefault();
                  close();
                  onSetFollowUp(fuDate || null, fuText.trim() || null);
                }}
              >
                <input
                  value={fuText}
                  onChange={(e) => setFuText(e.target.value)}
                  placeholder={t("detail.followUpFallback")}
                  autoFocus
                />
                <input
                  type="date"
                  value={fuDate}
                  onChange={(e) => setFuDate(e.target.value)}
                />
                <div className="zui-cardmenu-fu-actions">
                  <Button type="submit" variant="primary">
                    {t("common.save")}
                  </Button>
                  {a.next_action_at && (
                    <button
                      type="button"
                      onClick={() => {
                        close();
                        onSetFollowUp(null, null);
                      }}
                    >
                      {t("nextUp.done")}
                    </button>
                  )}
                </div>
              </form>
            )}
          </div>
        </>
      )}
    </div>
  );
}
