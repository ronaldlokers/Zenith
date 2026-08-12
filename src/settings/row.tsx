import { useId, useRef, useState } from "react";
import type { ReactNode } from "react";
import "./settings.css";

// A settings row as the shell's mockup draws it (#535): the label on the
// left, its current value on the right, and a dotted leader carrying the eye
// across. The control itself is behind the row rather than always on show.
//
// The point is not decoration. A page of controls answers "what can I
// change?"; a page of stated values answers "what is this set to?", which is
// the question someone actually opens settings with. The control appears when
// they want the first question instead.
export function SettingsRow({
  label,
  value,
  children,
}: {
  label: ReactNode;
  /** What it is set to right now, in the row's own voice. */
  value: ReactNode;
  /** The existing control, revealed when the row is opened. */
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const panelRef = useRef<HTMLDivElement>(null);

  return (
    <div className={`set-row${open ? " open" : ""}`}>
      <button
        type="button"
        className="set-row-line"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => {
          const next = !open;
          setOpen(next);
          // Focus the control itself on open: the row is a way in, not a
          // destination, and leaving focus on it means a keyboard user has to
          // tab forwards to reach what they just asked for.
          if (next) {
            requestAnimationFrame(() =>
              panelRef.current
                ?.querySelector<HTMLElement>("input, select, textarea, button")
                ?.focus(),
            );
          }
        }}
      >
        <span className="set-row-label">{label}</span>
        <span className="set-row-leader" aria-hidden="true" />
        <span className="set-row-value">{value}</span>
      </button>
      <div className="set-row-panel" id={panelId} ref={panelRef} hidden={!open}>
        {children}
      </div>
    </div>
  );
}
