import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";
import type { Company } from "../types";
import { QuickAddDialog } from "./QuickAddDialog";
// Side-effect: initializes i18next so `t()` renders real copy instead of
// raw keys.
import "../i18n";

const mockCompanies: Company[] = [];

const noop = () => {};

function renderDialog(overrides: Partial<Parameters<typeof QuickAddDialog>[0]> = {}) {
  return render(
    <QuickAddDialog
      companies={mockCompanies}
      onClose={noop}
      onCreated={noop}
      onError={noop}
      {...overrides}
    />,
  );
}

describe("QuickAddDialog", () => {
  test("renders the dialog title and the title field", () => {
    renderDialog();
    expect(screen.getByRole("heading", { name: "Add a job" })).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Title" })).toBeInTheDocument();
  });

  test("submit buttons stay disabled until a title is entered", () => {
    renderDialog();
    const addOpen = screen.getByRole("button", { name: "Add & open" });
    expect(addOpen).toBeDisabled();
    fireEvent.change(screen.getByRole("textbox", { name: "Title" }), {
      target: { value: "Staff Engineer" },
    });
    expect(addOpen).toBeEnabled();
  });

  test("cancel invokes the onClose handler", () => {
    const onClose = vi.fn();
    renderDialog({ onClose });
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
