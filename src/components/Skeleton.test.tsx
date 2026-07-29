import { render } from "@testing-library/react";
import { describe, expect, test } from "vitest";
import { Skeleton } from "./Skeleton";

describe("Skeleton", () => {
  test("renders three placeholder cards by default", () => {
    const { container } = render(<Skeleton />);
    expect(container.querySelectorAll(".zui-skeleton-card")).toHaveLength(3);
  });

  test("count sets how many cards are stacked", () => {
    const { container } = render(<Skeleton count={6} />);
    expect(container.querySelectorAll(".zui-skeleton-card")).toHaveLength(6);
  });

  // Decorative: it stands in for content that has not arrived, so it must not
  // reach the accessibility tree.
  test("is hidden from assistive technology", () => {
    const { container } = render(<Skeleton />);
    expect(container.firstElementChild).toHaveAttribute("aria-hidden", "true");
  });

  // Self-contained: only zui- classes, so the catalog matches production
  // without App.css (which Storybook never loads).
  test("emits zui-skeleton, never the legacy skeleton-list name", () => {
    const { container } = render(<Skeleton />);
    const cls = (container.firstElementChild?.className ?? "").split(/\s+/);
    expect(cls).toContain("zui-skeleton");
    expect(cls).not.toContain("skeleton-list");
  });

  test("forwards className and arbitrary attributes", () => {
    const { container } = render(<Skeleton className="extra" title="tip" />);
    const el = container.firstElementChild;
    expect(el).toHaveClass("zui-skeleton", "extra");
    expect(el).toHaveAttribute("title", "tip");
  });
});
