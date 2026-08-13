import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
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
  // Pinning is orthogonal to the pipeline (#535 shell): the card keeps its
  // stage and its column, and the bottom bar's first slot filters the board
  // down to the pinned set. One entry that flips, like restore/archive below.
  onTogglePin: () => void;
  // The board carries an archive rail rather than an archive screen (#535),
  // so a card that is already archived offers the way back instead.
  onUnarchive?: () => void;
}

// Where the popover sits, in viewport coordinates. It is rendered into
// document.body rather than beside its trigger because both of its ancestors
// clip: .bcard is overflow: hidden (it rounds the card's colour strip) and
// .bcol-cards is overflow-y: auto above 900px. Clipped content is not
// hit-tested, so the bottom of this menu was *announced and unclickable* —
// on a phone that meant Pin, Open, Archive and every stage past Screening
// could not be reached at all, and drag is deliberately off on coarse
// pointers, so the board had no way to move an application on the device the
// product treats as first-class. Proven by toggling the property: flipping
// .bcard to overflow: visible made all five items hit-test again with no
// other change.
function popoverPosition(trigger: DOMRect, pop: DOMRect) {
  const M = 8;
  // Right-aligned to the trigger, as `right: 0` did in the old absolute
  // layout, then pulled back inside the viewport on either edge.
  let left = trigger.right - pop.width;
  left = Math.min(Math.max(M, left), window.innerWidth - pop.width - M);
  // Below by default, flipped above when it would not fit — a card near the
  // foot of a column is the common case, not the edge case.
  const below = trigger.bottom + 4;
  const top =
    below + pop.height > window.innerHeight - M
      ? Math.max(M, trigger.top - pop.height - 4)
      : below;
  return { top, left };
}

export function CardMenu({
  a,
  onMove,
  onSetFollowUp,
  onOpenDetail,
  onArchive,
  onUnarchive,
  onTogglePin,
}: CardMenuProps) {
  const { t } = useTranslation();
  const [mode, setMode] = useState<null | "root" | "move" | "followup">(null);
  const [fuDate, setFuDate] = useState(a.next_action_at?.slice(0, 10) ?? "");
  const [fuText, setFuText] = useState(a.next_action ?? "");
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  const close = useCallback(() => {
    setMode(null);
    setPos(null);
  }, []);

  // Measured after paint, and again whenever anything moves under it: the
  // popover is position: fixed, so a scrolling column would otherwise leave
  // it behind. Capture phase, because the scroller is an ancestor.
  useLayoutEffect(() => {
    if (!mode) return;
    const place = () => {
      const trigger = triggerRef.current?.getBoundingClientRect();
      const pop = popRef.current?.getBoundingClientRect();
      if (trigger && pop) setPos(popoverPosition(trigger, pop));
    };
    place();
    window.addEventListener("scroll", place, true);
    window.addEventListener("resize", place);
    return () => {
      window.removeEventListener("scroll", place, true);
      window.removeEventListener("resize", place);
    };
    // Re-measured on every mode change: the submenu and the follow-up form
    // are taller than the root, which changes whether it has to flip.
  }, [mode]);

  // The element declares role="menu", which is a contract: focus moves in on
  // open, arrows move between items, Escape closes and hands focus back. None
  // of it was implemented — and the Escape handler that existed sat on the
  // popup, which never held focus, so the one key that works everywhere did
  // nothing.
  //
  // Waits for `pos`, and that is not incidental: focus() on an element with
  // visibility: hidden silently does nothing, and the popover is hidden
  // until it has been measured. Focusing on [mode] alone therefore failed
  // every time — measured, not reasoned about: activeElement stayed on the
  // trigger and Escape stayed dead, because the keydown handler lives on the
  // popup and the popup never held focus.
  //
  // Once per open, so repositioning on scroll does not drag focus back to
  // the first item while someone is arrowing through.
  const focused = useRef(false);
  useEffect(() => {
    if (!mode || !pos) {
      if (!mode) focused.current = false;
      return;
    }
    if (focused.current) return;
    focused.current = true;
    popRef.current
      ?.querySelector<HTMLElement>('[role="menuitem"], input')
      ?.focus();
  }, [mode, pos]);

  useEffect(() => {
    focused.current = false;
  }, [mode]);

  const onMenuKey = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      e.stopPropagation();
      close();
      triggerRef.current?.focus();
      return;
    }
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp" && e.key !== "Home" && e.key !== "End")
      return;
    const items = Array.from(
      popRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [],
    );
    if (!items.length) return;
    e.preventDefault();
    const at = items.indexOf(document.activeElement as HTMLElement);
    const next =
      e.key === "Home"
        ? 0
        : e.key === "End"
          ? items.length - 1
          : e.key === "ArrowDown"
            ? (at + 1) % items.length
            : (at - 1 + items.length) % items.length;
    items[next]?.focus();
  };

  return (
    <div
      className="zui-cardmenu"
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        if (mode && e.key === "Escape") {
          e.stopPropagation();
          close();
          triggerRef.current?.focus();
        }
      }}
    >
      <button
        ref={triggerRef}
        type="button"
        className="zui-cardmenu-btn"
        aria-label={t("board.cardMenu", { title: a.title })}
        aria-haspopup="menu"
        aria-expanded={!!mode}
        onClick={() => setMode((m) => (m ? null : "root"))}
      >
        ⋯
      </button>
      {mode &&
        createPortal(
          <div onClick={(e) => e.stopPropagation()}>
            <div className="zui-cardmenu-backdrop" onClick={close} />
            <div
              ref={popRef}
              className="zui-cardmenu-pop"
              role="menu"
              // Hidden until measured, so it never paints at the wrong place
              // first. visibility, not display: it has to be laid out to be
              // measurable.
              style={{
                top: pos?.top ?? 0,
                left: pos?.left ?? 0,
                visibility: pos ? "visible" : "hidden",
              }}
              onKeyDown={onMenuKey}
            >
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
                    onTogglePin();
                  }}
                >
                  {a.pinned_at ? t("board.unpin") : t("board.pin")}
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
                {a.archived_at && onUnarchive ? (
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      close();
                      onUnarchive();
                    }}
                  >
                    {t("board.restore")}
                  </button>
                ) : (
                  <Button
                    role="menuitem"
                    variant="danger"
                    onClick={() => {
                      close();
                      onArchive();
                    }}
                  >
                    {t("detail.archive")}
                  </Button>
                )}
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
          </div>,
          document.body,
        )}
    </div>
  );
}
