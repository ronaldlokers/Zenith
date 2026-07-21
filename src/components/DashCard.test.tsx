import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";
import { DashCard } from "./DashCard";

describe("DashCard", () => {
  test("renders heading, win pill, and children", () => {
    render(
      <DashCard heading="Funnel" win="live">
        <p>body</p>
      </DashCard>,
    );
    expect(screen.getByText("Funnel")).toBeInTheDocument();
    expect(screen.getByText("live")).toBeInTheDocument();
    expect(screen.getByText("body")).toBeInTheDocument();
  });

  test("omits the heading block when no heading is given (the lead card)", () => {
    const { container } = render(
      <DashCard lead>
        <p>panel</p>
      </DashCard>,
    );
    expect(container.querySelector(".zui-dashcard-head")).toBeNull();
    expect(container.firstElementChild).toHaveClass("zui-dashcard--lead");
  });

  test("renders a win pill only when win is set", () => {
    const { container } = render(<DashCard heading="Recent">x</DashCard>);
    expect(container.querySelector(".zui-dashcard-win")).toBeNull();
  });

  // Static vs interactive: only the click card is a focusable button.
  test("renders a static <div> when no onClick", () => {
    const { container } = render(<DashCard heading="x">y</DashCard>);
    expect(screen.queryByRole("button")).toBeNull();
    expect(container.firstElementChild?.tagName).toBe("DIV");
  });

  test("renders an interactive <button> when onClick is given", () => {
    render(
      <DashCard heading="x" onClick={() => {}}>
        y
      </DashCard>,
    );
    const el = screen.getByRole("button");
    expect(el).toHaveAttribute("type", "button");
    expect(el).toHaveClass("zui-dashcard--click");
  });

  test("fires onClick", () => {
    const onClick = vi.fn();
    render(
      <DashCard heading="x" onClick={onClick}>
        y
      </DashCard>,
    );
    fireEvent.click(screen.getByRole("button"));
    expect(onClick).toHaveBeenCalledOnce();
  });

  // Self-contained: only zui- classes, so the catalog matches production.
  test("emits only zui- classes, never the legacy dash-card names", () => {
    const { container } = render(<DashCard heading="x">y</DashCard>);
    const cls = (container.firstElementChild?.className ?? "").split(/\s+/);
    expect(cls).toContain("zui-dashcard");
    expect(cls).not.toContain("dash-card");
  });
});
