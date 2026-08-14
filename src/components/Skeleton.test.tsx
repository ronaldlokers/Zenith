import { render, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";
import { Skeleton } from "./Skeleton";
// Side-effect: initializes i18next so `t()` renders real copy instead of keys.
import "../i18n";

/** The boxes, which are no longer the first child — the status line is. */
const boxes = (container: HTMLElement) =>
  container.querySelector(".zui-skeleton");

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
    expect(boxes(container)).toHaveAttribute("aria-hidden", "true");
  });

  // The other half of the same decision. Hiding the boxes is right — reading
  // three empty cards aloud is worse than silence — but silence was all there
  // was, on every page load and every lazily-loaded tab: an empty page with
  // nothing to say content was coming, and then content arriving unannounced.
  test("says that something is loading, since the boxes cannot", () => {
    render(<Skeleton />);
    const status = screen.getByRole("status");
    expect(status).toHaveTextContent(/loading/i);
    // sr-only, not hidden: it has to reach the accessibility tree, and it must
    // not put a second "Loading…" on a screen that already shows the boxes.
    expect(status).toHaveClass("sr-only");
  });

  // Self-contained: only zui- classes, so the catalog matches production
  // without App.css (which Storybook never loads).
  test("emits zui-skeleton, never the legacy skeleton-list name", () => {
    const { container } = render(<Skeleton />);
    const cls = (boxes(container)?.className ?? "").split(/\s+/);
    expect(cls).toContain("zui-skeleton");
    expect(cls).not.toContain("skeleton-list");
  });

  test("forwards className and arbitrary attributes", () => {
    const { container } = render(<Skeleton className="extra" title="tip" />);
    const el = boxes(container);
    expect(el).toHaveClass("zui-skeleton", "extra");
    expect(el).toHaveAttribute("title", "tip");
  });
});
