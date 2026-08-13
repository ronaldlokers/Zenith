import { useEffect, useRef, useState } from "react";
import { Button } from "./Button";
import "./RowMenu.css";

// Generic "⋯" row overflow menu (#489) — the same affordance the board card
// carries (CardMenu), but content-agnostic: a caller hands it a list of
// actions. Built for list rows whose per-item controls (reorder, edit,
// delete) crowd the row on a phone; the trigger is one 32px target and the
// actions move into the popup.
// RowMenu.css fully describes the look — it never leans on App.css, so the
// component renders identically in Storybook.
export interface RowMenuItem {
  label: string;
  onSelect: () => void;
  disabled?: boolean;
  danger?: boolean;
}

export interface RowMenuProps {
  /** Accessible name for the trigger, e.g. "Actions for Acme Corp". */
  label: string;
  items: RowMenuItem[];
}

export function RowMenu({ label, items }: RowMenuProps) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popRef = useRef<HTMLDivElement>(null);

  const close = () => setOpen(false);
  const closeAndReturn = () => {
    setOpen(false);
    triggerRef.current?.focus();
  };

  // The element declares role="menu", which is a contract: focus moves into
  // the menu on open, arrows move between items, Home/End jump, and Escape
  // closes and hands focus back. None of it was implemented — the popup had
  // an Escape handler but the popup never held focus, so the one key that
  // works everywhere did nothing, and a user who tabbed in and escaped was
  // dropped at the document root rather than back on the row they were on.
  useEffect(() => {
    if (!open) return;
    popRef.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
  }, [open]);

  const onMenuKey = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      e.stopPropagation();
      closeAndReturn();
      return;
    }
    if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(e.key)) return;
    const els = Array.from(
      popRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [],
    ).filter((el) => !el.hasAttribute("disabled"));
    if (!els.length) return;
    e.preventDefault();
    const at = els.indexOf(document.activeElement as HTMLElement);
    const next =
      e.key === "Home"
        ? 0
        : e.key === "End"
          ? els.length - 1
          : e.key === "ArrowDown"
            ? (at + 1) % els.length
            : (at - 1 + els.length) % els.length;
    els[next]?.focus();
  };

  return (
    <div
      className="zui-rowmenu"
      onKeyDown={(e) => {
        // Also on the wrapper: the trigger keeps focus until the effect
        // above moves it, and a user can shift-tab back onto it while the
        // menu is open. Escape has to work from there too.
        if (open && e.key === "Escape") {
          e.stopPropagation();
          closeAndReturn();
        }
      }}
    >
      <button
        ref={triggerRef}
        type="button"
        className="zui-rowmenu-btn"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        onKeyDown={(e) => {
          // The APG opening keys. Enter and Space already activate a button.
          if (!open && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
            e.preventDefault();
            setOpen(true);
          }
        }}
        onClick={() => setOpen((v) => !v)}
      >
        ⋯
      </button>
      {open && (
        <>
          <div className="zui-rowmenu-backdrop" onClick={close} />
          <div ref={popRef} className="zui-rowmenu-pop" role="menu" onKeyDown={onMenuKey}>
            {items.map((item) => (
              <Button
                key={item.label}
                role="menuitem"
                // Roving tabindex: items are reached by arrow keys, not Tab,
                // which is what the menu role tells a screen reader to
                // expect. The trigger stays the single tab stop.
                tabIndex={-1}
                variant={item.danger ? "danger" : "default"}
                disabled={item.disabled}
                onClick={() => {
                  close();
                  item.onSelect();
                }}
              >
                {item.label}
              </Button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
