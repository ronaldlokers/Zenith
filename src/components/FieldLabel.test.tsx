import { render, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";
import { FieldLabel } from "./FieldLabel";

describe("FieldLabel", () => {
  test("renders its children", () => {
    render(<FieldLabel>Status</FieldLabel>);
    expect(screen.getByText("Status")).toBeInTheDocument();
  });

  test("renders a <span>", () => {
    const { container } = render(<FieldLabel>x</FieldLabel>);
    expect(container.firstElementChild?.tagName).toBe("SPAN");
  });

  // Self-contained: only zui- classes, so the catalog matches production
  // without App.css (which Storybook never loads).
  test("emits only zui- classes, never the legacy field-label name", () => {
    const { container } = render(<FieldLabel>x</FieldLabel>);
    const cls = (container.firstElementChild?.className ?? "").split(/\s+/);
    expect(cls).toContain("zui-fieldlabel");
    expect(cls).not.toContain("field-label");
  });

  test("forwards className and id", () => {
    render(
      <FieldLabel className="extra" id="fit-label-1">
        x
      </FieldLabel>,
    );
    const el = screen.getByText("x");
    expect(el).toHaveClass("zui-fieldlabel", "extra");
    expect(el).toHaveAttribute("id", "fit-label-1");
  });

  test("forwards arbitrary attributes", () => {
    render(
      <FieldLabel data-testid="fl" title="tip">
        x
      </FieldLabel>,
    );
    const el = screen.getByTestId("fl");
    expect(el).toHaveAttribute("title", "tip");
  });
});
