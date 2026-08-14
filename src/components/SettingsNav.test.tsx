import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";
import { SettingsNav } from "./SettingsNav";

const SECTIONS = [
  { key: "account", label: "Account" },
  { key: "data", label: "Data" },
];

describe("SettingsNav", () => {
  // aria-current, not aria-selected: this is a nav, not a tablist. The token
  // is "page" because each section has its own URL (#517) — the replaced
  // markup said "true", which is valid but says less.
  test("marks the active section with aria-current", () => {
    render(<SettingsNav sections={SECTIONS} active="data" onSelect={() => {}} aria-label="Settings" />);
    expect(screen.getByRole("button", { name: "Data" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("button", { name: "Account" })).not.toHaveAttribute("aria-current");
  });

  test("names the nav for assistive tech", () => {
    render(<SettingsNav sections={SECTIONS} active="data" onSelect={() => {}} aria-label="Settings" />);
    expect(screen.getByRole("navigation", { name: "Settings" })).toBeInTheDocument();
  });

  test("reports the selected key", () => {
    const onSelect = vi.fn();
    render(<SettingsNav sections={SECTIONS} active="data" onSelect={onSelect} aria-label="Settings" />);
    fireEvent.click(screen.getByRole("button", { name: "Account" }));
    expect(onSelect).toHaveBeenCalledWith("account");
  });
});
