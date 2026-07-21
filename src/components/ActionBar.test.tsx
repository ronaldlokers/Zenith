import { render, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";
import { ActionBar } from "./ActionBar";

describe("ActionBar", () => {
  test("renders its children", () => {
    render(
      <ActionBar>
        <button>Save</button>
      </ActionBar>,
    );
    expect(screen.getByRole("button", { name: "Save" })).toBeInTheDocument();
  });

  test("is a <div>", () => {
    const { container } = render(<ActionBar>x</ActionBar>);
    expect(container.firstElementChild?.tagName).toBe("DIV");
  });

  test("defaults to the form variant", () => {
    const { container } = render(<ActionBar>x</ActionBar>);
    expect(container.firstElementChild).toHaveClass(
      "zui-actionbar",
      "zui-actionbar--form",
    );
  });

  test.each([
    ["form", "zui-actionbar--form"],
    ["detail", "zui-actionbar--detail"],
    ["share", "zui-actionbar--share"],
  ] as const)("variant=%s emits %s", (variant, expectedClass) => {
    const { container } = render(<ActionBar variant={variant}>x</ActionBar>);
    expect(container.firstElementChild).toHaveClass(expectedClass);
  });

  // Self-contained: only zui- classes, so the catalog matches production.
  test("emits only zui- classes, never the legacy container names", () => {
    const { container } = render(<ActionBar>x</ActionBar>);
    const cls = (container.firstElementChild?.className ?? "").split(/\s+/);
    expect(cls).toContain("zui-actionbar");
    expect(cls).not.toContain("form-actions");
  });

  test("forwards className and arbitrary attributes", () => {
    render(
      <ActionBar className="extra" data-testid="bar">
        x
      </ActionBar>,
    );
    expect(screen.getByTestId("bar")).toHaveClass("zui-actionbar", "extra");
  });
});
