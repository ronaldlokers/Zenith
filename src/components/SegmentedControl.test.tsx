import { render, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";
import { SegmentedControl } from "./SegmentedControl";

describe("SegmentedControl", () => {
  test("renders its children", () => {
    render(
      <SegmentedControl>
        <button>List</button>
        <button>Grid</button>
      </SegmentedControl>,
    );
    expect(screen.getByText("List")).toBeInTheDocument();
    expect(screen.getByText("Grid")).toBeInTheDocument();
  });

  test("renders a <div>", () => {
    const { container } = render(
      <SegmentedControl>
        <button>List</button>
      </SegmentedControl>,
    );
    expect(container.firstElementChild?.tagName).toBe("DIV");
  });

  // Self-contained: only zui- classes, so the catalog matches production
  // without App.css (which Storybook never loads).
  test("emits zui-segmented, never the legacy board-group-toggle name", () => {
    const { container } = render(
      <SegmentedControl>
        <button>List</button>
      </SegmentedControl>,
    );
    const cls = (container.firstElementChild?.className ?? "").split(/\s+/);
    expect(cls).toContain("zui-segmented");
    expect(cls).not.toContain("board-group-toggle");
  });

  test("forwards role and aria-label", () => {
    render(
      <SegmentedControl role="group" aria-label="View">
        <button>List</button>
      </SegmentedControl>,
    );
    const el = screen.getByRole("group", { name: "View" });
    expect(el).toHaveClass("zui-segmented");
  });

  test("forwards className and arbitrary attributes", () => {
    render(
      <SegmentedControl className="extra" data-testid="sc" title="tip">
        <button>List</button>
      </SegmentedControl>,
    );
    const el = screen.getByTestId("sc");
    expect(el).toHaveClass("zui-segmented", "extra");
    expect(el).toHaveAttribute("title", "tip");
  });
});
