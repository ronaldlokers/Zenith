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

  test("wires each tab to its panel when panel ids exist", () => {
    render(<PillTabs tabs={TABS} active="companies" onSelect={() => {}} idPrefix="network" aria-label="Network" />);
    const tab = screen.getByRole("tab", { name: "People" });
    expect(tab).toHaveAttribute("id", "network-tab-contacts");
    expect(tab).toHaveAttribute("aria-controls", "network-panel-contacts");
  });

  // The network view renders no tabpanel, so without idPrefix the component
  // must emit no aria-controls at all — an aria-controls pointing at an id
  // that does not exist is a worse defect than the missing association.
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
