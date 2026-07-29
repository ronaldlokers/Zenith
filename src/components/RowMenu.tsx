import { useState } from "react";
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
  const close = () => setOpen(false);
  return (
    <div className="zui-rowmenu">
      <button
        type="button"
        className="zui-rowmenu-btn"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        ⋯
      </button>
      {open && (
        <>
          <div className="zui-rowmenu-backdrop" onClick={close} />
          <div
            className="zui-rowmenu-pop"
            role="menu"
            onKeyDown={(e) => {
              // Escape closes, matching the app-wide Dialog convention (#447).
              if (e.key === "Escape") {
                e.stopPropagation();
                close();
              }
            }}
          >
            {items.map((item) => (
              <Button
                key={item.label}
                role="menuitem"
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
