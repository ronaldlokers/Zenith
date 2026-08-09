import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";
import { OutcomeDialog } from "./OutcomeDialog";
// Side-effect: initializes i18next so `t()` renders real copy instead of
// raw keys.
import "../i18n";

const noop = () => {};

describe("OutcomeDialog", () => {
  test("offers only the reasons that belong to the status", () => {
    render(
      <OutcomeDialog status="ghosted" onSave={noop} onClose={noop} />,
    );
    expect(
      screen.getByRole("radio", { name: "No reply after applying" }),
    ).toBeInTheDocument();
    // A withdrawal reason on a ghosted application would be nonsense, and
    // the server rejects it — so it must not be offered here either.
    expect(
      screen.queryByRole("radio", { name: "Took another offer" }),
    ).not.toBeInTheDocument();
  });

  test("save stays disabled until a reason is picked", () => {
    render(<OutcomeDialog status="rejected" onSave={noop} onClose={noop} />);
    const save = screen.getByRole("button", { name: "Save" });
    expect(save).toBeDisabled();
    fireEvent.click(screen.getByRole("radio", { name: "No response" }));
    expect(save).toBeEnabled();
  });

  test("saves the reason with the trimmed note", () => {
    const onSave = vi.fn();
    render(<OutcomeDialog status="rejected" onSave={onSave} onClose={noop} />);
    fireEvent.click(screen.getByRole("radio", { name: "After a screening call" }));
    fireEvent.change(screen.getByRole("textbox"), {
      target: { value: "  no JD match  " },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(onSave).toHaveBeenCalledWith("after_screening", "no JD match");
  });

  test("skip closes without saving — the status move is already committed", () => {
    const onSave = vi.fn();
    const onClose = vi.fn();
    render(<OutcomeDialog status="rejected" onSave={onSave} onClose={onClose} />);
    fireEvent.click(screen.getByRole("button", { name: "Skip" }));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onSave).not.toHaveBeenCalled();
  });

  test("prefills an already-recorded outcome for editing", () => {
    render(
      <OutcomeDialog
        status="rejected"
        initialReason="after_interview"
        initialNote="Internal candidate."
        onSave={noop}
        onClose={noop}
      />,
    );
    expect(
      screen.getByRole("radio", { name: "After an interview" }),
    ).toBeChecked();
    expect(screen.getByRole("textbox")).toHaveValue("Internal candidate.");
  });
});
