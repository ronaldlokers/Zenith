import { render, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";
import { StatLine } from "./StatLine";

describe("StatLine", () => {
  test("renders the label and value", () => {
    render(<StatLine label="Applications sent" value="12" />);
    expect(screen.getByText("Applications sent")).toBeInTheDocument();
    expect(screen.getByText("12")).toBeInTheDocument();
  });

  test("the value span carries the value class", () => {
    render(<StatLine label="Responses" value="6" />);
    expect(screen.getByText("6")).toHaveClass("zui-statline-value");
  });

  // Self-contained: only zui- classes, so the catalog matches production
  // without App.css (which Storybook never loads).
  test("emits zui-statline, never the legacy dash-stat name", () => {
    const { container } = render(<StatLine label="x" value="y" />);
    const cls = (container.firstElementChild?.className ?? "").split(/\s+/);
    expect(cls).toContain("zui-statline");
    expect(cls).not.toContain("dash-stat");
  });

  test("forwards className and arbitrary attributes", () => {
    render(
      <StatLine
        label="x"
        value="y"
        className="extra"
        data-testid="line"
        title="tip"
      />,
    );
    const el = screen.getByTestId("line");
    expect(el).toHaveClass("zui-statline", "extra");
    expect(el).toHaveAttribute("title", "tip");
  });

  test("renders a <div>, not an interactive element", () => {
    const { container } = render(<StatLine label="x" value="y" />);
    expect(container.firstElementChild?.tagName).toBe("DIV");
  });
});
