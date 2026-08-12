// Closing a dialog has to put the keyboard user back where they were. The
// trap has done that since #346, but only for dialogs whose first field does
// not claim focus itself — and the quick-add dialog's does, with autoFocus.
//
// React applies autoFocus during commit, before any effect runs. The trap
// read document.activeElement in its effect, so by then it was looking at the
// dialog's own url field, recorded that as the opener, and on close found it
// detached and restored nothing. Focus fell to <body>: the top of the page,
// with every control between there and the button they pressed to tab back
// through. Nothing failed, nothing logged, and a screenshot shows a correctly
// closed dialog.
//
// The second case here is the one that broke the first attempt at the fix.
// A dialog whose trap is toggled (useFocusTrap(open) — the notification
// panel) renders with active=false *before* the effect cleanup that restores
// focus runs, so clearing the remembered opener on that render left nothing
// to restore.
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useFocusTrap } from "./hooks";

describe("dialog focus", () => {
  it("returns focus to the control that opened it", () => {
    const { rerender } = render(<Shell open={false} />);
    const opener = screen.getByRole("button", { name: "open" });
    opener.focus();
    expect(document.activeElement).toBe(opener);

    rerender(<Shell open={true} />);
    // The dialog's own field has taken focus — this is the state that used to
    // make the trap record the wrong opener.
    expect(document.activeElement).toBe(screen.getByLabelText("field"));

    rerender(<Shell open={false} />);
    expect(
      document.activeElement,
      "focus fell to <body> instead of returning to the opener",
    ).toBe(opener);
  });

  it("returns focus when the trap is toggled rather than unmounted", () => {
    const { rerender } = render(<Toggled open={false} />);
    const opener = screen.getByRole("button", { name: "open" });
    opener.focus();

    rerender(<Toggled open={true} />);
    expect(document.activeElement).toBe(screen.getByLabelText("field"));

    rerender(<Toggled open={false} />);
    expect(
      document.activeElement,
      "the render that closes it must not wipe the remembered opener",
    ).toBe(opener);
  });

  it("remembers the opener it was actually opened from, twice running", () => {
    // A stale opener is the other way this goes wrong: the panel goes back to
    // whatever opened it the first time, wherever the user actually was.
    const { rerender } = render(<Toggled open={false} />);
    const first = screen.getByRole("button", { name: "open" });
    const second = screen.getByRole("button", { name: "decoy" });

    first.focus();
    rerender(<Toggled open={true} />);
    rerender(<Toggled open={false} />);
    expect(document.activeElement).toBe(first);

    second.focus();
    rerender(<Toggled open={true} />);
    rerender(<Toggled open={false} />);
    expect(document.activeElement, "went back to the first opener").toBe(
      second,
    );
  });
});

// The trap lives in the component that mounts with the dialog, which is how
// ui.tsx's Dialog is built — the hook's effect cleanup is what restores
// focus, so the component holding it has to unmount when the dialog closes.
// Driven by a prop rather than internal state so a test can step the open and
// closed renders itself.
function TrapDialog() {
  const ref = useFocusTrap<HTMLDivElement>();
  return (
    <div ref={ref} role="dialog">
      {/* autoFocus is the whole point: it takes focus at commit, before the
          trap's effect could look at where focus came from. */}
      <input autoFocus aria-label="field" />
    </div>
  );
}

function Shell({ open }: { open: boolean }) {
  return (
    <div>
      <button type="button">open</button>
      <button type="button">decoy</button>
      {open && <TrapDialog />}
    </div>
  );
}

function Toggled({ open }: { open: boolean }) {
  const ref = useFocusTrap<HTMLDivElement>(open);
  return (
    <div>
      <button type="button">open</button>
      <button type="button">decoy</button>
      <div ref={ref} role="dialog" hidden={!open}>
        {open && <input autoFocus aria-label="field" />}
      </div>
    </div>
  );
}
