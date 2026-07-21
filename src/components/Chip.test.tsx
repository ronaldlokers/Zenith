import { render, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";
import { Chip } from "./Chip";

describe("Chip", () => {
  test("renders its children", () => {
    render(<Chip>React</Chip>);
    expect(screen.getByText("React")).toBeInTheDocument();
  });

  test("renders an inline <span>", () => {
    const { container } = render(<Chip>x</Chip>);
    expect(container.firstElementChild?.tagName).toBe("SPAN");
  });

  test("defaults to not matched", () => {
    const { container } = render(<Chip>x</Chip>);
    expect(container.firstElementChild).toHaveClass("zui-chip");
    expect(container.firstElementChild).not.toHaveClass("zui-chip--matched");
  });

  test("matched=true emits zui-chip--matched", () => {
    const { container } = render(<Chip matched>x</Chip>);
    expect(container.firstElementChild).toHaveClass(
      "zui-chip",
      "zui-chip--matched",
    );
  });

  // Self-contained: only zui- classes, so the catalog matches production
  // without App.css (which Storybook never loads).
  test("emits only zui- classes, never the legacy chip name", () => {
    const { container } = render(<Chip>x</Chip>);
    const cls = (container.firstElementChild?.className ?? "").split(/\s+/);
    expect(cls).toContain("zui-chip");
    expect(cls).not.toContain("chip");
  });

  test("forwards className and arbitrary attributes", () => {
    render(
      <Chip className="extra" data-testid="c" title="tip">
        x
      </Chip>,
    );
    const el = screen.getByTestId("c");
    expect(el).toHaveClass("zui-chip", "extra");
    expect(el).toHaveAttribute("title", "tip");
  });

  test("renders remove/move button children verbatim", () => {
    render(
      <Chip>
        React
        <button aria-label="Remove">×</button>
      </Chip>,
    );
    expect(screen.getByRole("button", { name: "Remove" })).toBeInTheDocument();
  });
});
