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

describe("SegmentedControl.Item", () => {
  // The whole reason the item exists: aria-pressed was set at three of the
  // five call sites and forgotten at the fourth.
  test("marks the active item with aria-pressed", () => {
    render(
      <SegmentedControl>
        <SegmentedControl.Item active>List</SegmentedControl.Item>
        <SegmentedControl.Item active={false}>Grid</SegmentedControl.Item>
      </SegmentedControl>,
    );
    expect(screen.getByRole("button", { name: "List" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Grid" })).toHaveAttribute("aria-pressed", "false");
  });

  test("carries the active class the container styles", () => {
    render(
      <SegmentedControl>
        <SegmentedControl.Item active>List</SegmentedControl.Item>
      </SegmentedControl>,
    );
    expect(screen.getByRole("button", { name: "List" })).toHaveClass("active");
  });

  // Inside a <form> a bare <button> is an implicit submit; a view toggle
  // never is.
  test("is type=button", () => {
    render(
      <SegmentedControl>
        <SegmentedControl.Item active={false}>Grid</SegmentedControl.Item>
      </SegmentedControl>,
    );
    expect(screen.getByRole("button")).toHaveAttribute("type", "button");
  });
});
