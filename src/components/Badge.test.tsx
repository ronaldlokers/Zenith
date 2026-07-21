import { render, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";
import { Badge } from "./Badge";

describe("Badge", () => {
  test("renders its children", () => {
    render(<Badge>Agency</Badge>);
    expect(screen.getByText("Agency")).toBeInTheDocument();
  });

  test("renders an inline <span>, not an interactive element", () => {
    const { container } = render(<Badge>x</Badge>);
    expect(container.firstElementChild?.tagName).toBe("SPAN");
  });

  test("defaults to the default variant", () => {
    const { container } = render(<Badge>x</Badge>);
    expect(container.firstElementChild).toHaveClass("zui-badge", "zui-badge--default");
  });

  test.each([
    ["default", "zui-badge--default"],
    ["warn", "zui-badge--warn"],
    ["stage", "zui-badge--stage"],
  ] as const)("variant=%s emits %s", (variant, expectedClass) => {
    const { container } = render(<Badge variant={variant}>x</Badge>);
    expect(container.firstElementChild).toHaveClass(expectedClass);
  });

  // Self-contained: only zui- classes, so the catalog matches production
  // without App.css (which Storybook never loads).
  test("emits only zui- classes, never the legacy badge name", () => {
    const { container } = render(<Badge>x</Badge>);
    const cls = (container.firstElementChild?.className ?? "").split(/\s+/);
    expect(cls).toContain("zui-badge");
    expect(cls).not.toContain("badge");
  });

  test("forwards className and arbitrary attributes", () => {
    render(
      <Badge className="extra" data-testid="b" title="tip">
        x
      </Badge>,
    );
    const el = screen.getByTestId("b");
    expect(el).toHaveClass("zui-badge", "extra");
    expect(el).toHaveAttribute("title", "tip");
  });
});
