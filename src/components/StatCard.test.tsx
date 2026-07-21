import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";
import { StatCard } from "./StatCard";

describe("StatCard", () => {
  test("renders the value and label", () => {
    render(<StatCard value="12" label="Open applications" />);
    expect(screen.getByText("12")).toBeInTheDocument();
    expect(screen.getByText("Open applications")).toBeInTheDocument();
  });

  // The dashboard has three clickable KPIs and one read-only tile; the element
  // must switch accordingly so a static tile isn't a focusable button.
  test("renders a static <div> when no onClick is given", () => {
    const { container } = render(<StatCard value="~34d" label="Time to offer" />);
    expect(screen.queryByRole("button")).toBeNull();
    expect(container.firstElementChild?.tagName).toBe("DIV");
  });

  test("renders an interactive <button> when onClick is given", () => {
    render(<StatCard value="12" label="Open" onClick={() => {}} />);
    const el = screen.getByRole("button");
    expect(el).toHaveAttribute("type", "button");
    expect(el).toHaveClass("zui-statcard--click");
  });

  test("the static tile has no click-affordance class", () => {
    const { container } = render(<StatCard value="1" label="x" />);
    expect(container.firstElementChild).not.toHaveClass("zui-statcard--click");
  });

  test("fires onClick", () => {
    const onClick = vi.fn();
    render(<StatCard value="12" label="Open" onClick={onClick} />);
    fireEvent.click(screen.getByRole("button"));
    expect(onClick).toHaveBeenCalledOnce();
  });

  // Self-contained: only zui- classes, so the catalog matches production
  // without App.css (which Storybook never loads).
  test("emits only zui- classes, never the legacy dash-kpi names", () => {
    const { container } = render(<StatCard value="1" label="x" onClick={() => {}} />);
    const cls = (container.firstElementChild?.className ?? "").split(/\s+/);
    expect(cls).toContain("zui-statcard");
    expect(cls).not.toContain("dash-kpi");
  });

  test("forwards className and arbitrary attributes", () => {
    render(<StatCard value="1" label="x" className="extra" data-testid="tile" />);
    const el = screen.getByTestId("tile");
    expect(el).toHaveClass("zui-statcard", "extra");
  });
});
