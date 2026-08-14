import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";
import { TabBar } from "./TabBar";

const TABS = [
  { key: "track", label: "Track" },
  { key: "prep", label: "Prep" },
];

describe("TabBar", () => {
  test("exposes a tablist of tabs with the active one selected", () => {
    render(<TabBar tabs={TABS} active="prep" onSelect={() => {}} idPrefix="detail" aria-label="Sections" />);
    expect(screen.getByRole("tablist", { name: "Sections" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Prep" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tab", { name: "Track" })).toHaveAttribute("aria-selected", "false");
  });

  // The panel lives with the caller, so the wiring between tab and panel is
  // the component's contract — a wrong id silently unlabels the panel.
  //
  // Every tab keeps its own id, because the panel labels itself with the
  // active one. Only the active tab points back at a panel: the caller
  // renders that one and no other, so this used to leave every inactive tab
  // referring to an id that exists on no render (#517).
  test("wires the active tab to its panel, and gives every tab an id", () => {
    render(<TabBar tabs={TABS} active="prep" onSelect={() => {}} idPrefix="detail" aria-label="Sections" />);
    const inactive = screen.getByRole("tab", { name: "Track" });
    expect(inactive).toHaveAttribute("id", "detail-tab-track");
    expect(
      inactive,
      "an inactive tab points at a panel the caller does not render",
    ).not.toHaveAttribute("aria-controls");
    expect(screen.getByRole("tab", { name: "Prep" })).toHaveAttribute(
      "aria-controls",
      "detail-panel-prep",
    );
  });

  test("reports the selected key", () => {
    const onSelect = vi.fn();
    render(<TabBar tabs={TABS} active="prep" onSelect={onSelect} idPrefix="detail" aria-label="Sections" />);
    fireEvent.click(screen.getByRole("tab", { name: "Track" }));
    expect(onSelect).toHaveBeenCalledWith("track");
  });

  test("emits zui- classes only", () => {
    const { container } = render(<TabBar tabs={TABS} active="prep" onSelect={() => {}} idPrefix="detail" aria-label="Sections" />);
    expect(container.innerHTML).not.toMatch(/class="[^"]*\bdetail-tabs/);
  });
});
