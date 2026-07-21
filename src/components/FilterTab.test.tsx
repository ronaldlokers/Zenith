import { render, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";
import { FilterTab } from "./FilterTab";

describe("FilterTab", () => {
  test("renders its label", () => {
    render(<FilterTab>All</FilterTab>);
    expect(screen.getByText("All")).toBeInTheDocument();
  });

  test("renders a <button type=button>", () => {
    render(<FilterTab>All</FilterTab>);
    const el = screen.getByRole("button");
    expect(el.tagName).toBe("BUTTON");
    expect(el).toHaveAttribute("type", "button");
  });

  test("renders the count in zui-filtertab-n when given", () => {
    render(<FilterTab count={7}>Rejected</FilterTab>);
    const n = screen.getByText("7");
    expect(n).toHaveClass("zui-filtertab-n");
  });

  test("omits the count span when count is not given", () => {
    const { container } = render(<FilterTab>All</FilterTab>);
    expect(container.querySelector(".zui-filtertab-n")).toBeNull();
  });

  test("active emits zui-filtertab--active", () => {
    const { container } = render(<FilterTab active>All</FilterTab>);
    expect(container.firstElementChild).toHaveClass(
      "zui-filtertab",
      "zui-filtertab--active",
    );
  });

  // Self-contained: only zui- classes, so the catalog matches production
  // without App.css (which Storybook never loads).
  test("emits only zui- classes, never the legacy chip name", () => {
    const { container } = render(<FilterTab>All</FilterTab>);
    const cls = (container.firstElementChild?.className ?? "").split(/\s+/);
    expect(cls).toContain("zui-filtertab");
    expect(cls).not.toContain("chip");
  });

  test("forwards className and arbitrary attributes", () => {
    render(
      <FilterTab className="extra" data-testid="f" title="tip">
        All
      </FilterTab>,
    );
    const el = screen.getByTestId("f");
    expect(el).toHaveClass("zui-filtertab", "extra");
    expect(el).toHaveAttribute("title", "tip");
  });
});
