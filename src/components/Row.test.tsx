import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";
import { Row } from "./Row";

describe("Row", () => {
  test("renders its children", () => {
    render(
      <ul>
        <Row>
          <div className="l1">
            <strong>Acme Corp</strong>
          </div>
        </Row>
      </ul>,
    );
    expect(screen.getByText("Acme Corp")).toBeInTheDocument();
  });

  test("renders an <li>", () => {
    const { container } = render(
      <ul>
        <Row>content</Row>
      </ul>,
    );
    expect(container.querySelector("li")?.tagName).toBe("LI");
  });

  // Self-contained: only zui- classes, so the catalog matches production
  // without App.css (which Storybook never loads).
  test("emits zui-row, never the legacy card/row2 names", () => {
    const { container } = render(
      <ul>
        <Row>content</Row>
      </ul>,
    );
    const cls = (container.querySelector("li")?.className ?? "").split(/\s+/);
    expect(cls).toContain("zui-row");
    expect(cls).not.toContain("card");
    expect(cls).not.toContain("row2");
  });

  test("forwards the rowActivate spread: onClick, role, tabIndex", () => {
    const onClick = vi.fn();
    render(
      <ul>
        <Row onClick={onClick} role="button" tabIndex={0}>
          content
        </Row>
      </ul>,
    );
    const el = screen.getByRole("button");
    expect(el).toHaveAttribute("tabindex", "0");
    el.click();
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  test("forwards onKeyDown", () => {
    const onKeyDown = vi.fn();
    render(
      <ul>
        <Row onKeyDown={onKeyDown} role="button" tabIndex={0}>
          content
        </Row>
      </ul>,
    );
    fireEvent.keyDown(screen.getByRole("button"), { key: "Enter" });
    expect(onKeyDown).toHaveBeenCalledTimes(1);
  });

  test("forwards className and arbitrary attributes", () => {
    render(
      <ul>
        <Row className="extra" data-testid="r" title="tip">
          content
        </Row>
      </ul>,
    );
    const el = screen.getByTestId("r");
    expect(el).toHaveClass("zui-row", "extra");
    expect(el).toHaveAttribute("title", "tip");
  });
});
