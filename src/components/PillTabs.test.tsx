import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";
import { PillTabs } from "./PillTabs";

const TABS = [
  { key: "companies", label: "Companies" },
  { key: "contacts", label: "People" },
];

describe("PillTabs", () => {
  test("exposes a tablist of tabs with the active one selected", () => {
    render(<PillTabs tabs={TABS} active="companies" onSelect={() => {}} idPrefix="network" aria-label="Network" />);
    expect(screen.getByRole("tablist", { name: "Network" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Companies" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tab", { name: "People" })).toHaveAttribute("aria-selected", "false");
  });

  // Every tab keeps its own id, because the panel labels itself with the
  // active one. Only the active tab points back at a panel: the caller
  // renders that one and no other (#517).
  test("wires the active tab to its panel, and gives every tab an id", () => {
    render(<PillTabs tabs={TABS} active="companies" onSelect={() => {}} idPrefix="network" aria-label="Network" />);
    const inactive = screen.getByRole("tab", { name: "People" });
    expect(inactive).toHaveAttribute("id", "network-tab-contacts");
    expect(
      inactive,
      "an inactive tab points at a panel the caller does not render",
    ).not.toHaveAttribute("aria-controls");
    expect(screen.getByRole("tab", { name: "Companies" })).toHaveAttribute(
      "aria-controls",
      "network-panel-companies",
    );
  });

  // A caller that renders no tabpanel passes no idPrefix, and the component
  // emits no aria-controls at all — pointing at an id that does not exist is
  // a worse defect than the missing association. (The network view does
  // render one now, but the option stays for callers that do not.)
  test("omits aria-controls when no idPrefix is given", () => {
    render(<PillTabs tabs={TABS} active="companies" onSelect={() => {}} aria-label="Network" />);
    const tab = screen.getByRole("tab", { name: "People" });
    expect(tab).not.toHaveAttribute("aria-controls");
    expect(tab).not.toHaveAttribute("id");
  });

  test("reports the selected key", () => {
    const onSelect = vi.fn();
    render(<PillTabs tabs={TABS} active="companies" onSelect={onSelect} aria-label="Network" />);
    fireEvent.click(screen.getByRole("tab", { name: "People" }));
    expect(onSelect).toHaveBeenCalledWith("contacts");
  });

  test("emits zui- classes only", () => {
    const { container } = render(<PillTabs tabs={TABS} active="companies" onSelect={() => {}} aria-label="Network" />);
    expect(container.innerHTML).not.toMatch(/class="[^"]*\bsubnav/);
  });
});
