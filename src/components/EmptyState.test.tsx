import { render, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";
import { EmptyState } from "./EmptyState";

describe("EmptyState", () => {
  test("renders its children", () => {
    render(<EmptyState>No applications yet.</EmptyState>);
    expect(screen.getByText("No applications yet.")).toBeInTheDocument();
  });

  // Standalone views use a <p>; it must not need an `as` prop for the common
  // case.
  test("defaults to a <p> element", () => {
    const { container } = render(<EmptyState>x</EmptyState>);
    expect(container.firstElementChild?.tagName).toBe("P");
  });

  // A results <ul> renders its placeholder as a <li> — a <p> can't legally
  // live inside a <ul>.
  test('as="li" renders a <li> element', () => {
    const { container } = render(<EmptyState as="li">x</EmptyState>);
    expect(container.firstElementChild?.tagName).toBe("LI");
  });

  // Self-contained: only zui- classes, so the catalog matches production
  // without App.css (which Storybook never loads).
  test("emits only zui- classes, never the legacy empty class", () => {
    const { container } = render(<EmptyState>x</EmptyState>);
    const cls = (container.firstElementChild?.className ?? "").split(/\s+/);
    expect(cls).toContain("zui-emptystate");
    expect(cls).not.toContain("empty");
  });

  test("forwards className and arbitrary attributes", () => {
    render(
      <EmptyState className="extra" data-testid="empty" title="tip">
        x
      </EmptyState>,
    );
    const el = screen.getByTestId("empty");
    expect(el).toHaveClass("zui-emptystate", "extra");
    expect(el).toHaveAttribute("title", "tip");
  });

  test("renders an svg child when provided", () => {
    render(
      <EmptyState>
        <svg data-testid="icon" />
        No results.
      </EmptyState>,
    );
    expect(screen.getByTestId("icon")).toBeInTheDocument();
  });
});
