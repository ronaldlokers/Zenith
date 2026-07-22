import { render, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";
import { CvItem } from "./CvItem";

describe("CvItem", () => {
  test("renders its children", () => {
    render(<CvItem>Senior Engineer</CvItem>);
    expect(screen.getByText("Senior Engineer")).toBeInTheDocument();
  });

  test("renders an <li>", () => {
    const { container } = render(<CvItem>x</CvItem>);
    expect(container.firstElementChild?.tagName).toBe("LI");
  });

  // Self-contained: only zui- classes, so the catalog matches production
  // without App.css (which Storybook never loads).
  test("emits zui-cvitem, never the legacy cv-item name", () => {
    const { container } = render(<CvItem>x</CvItem>);
    const cls = (container.firstElementChild?.className ?? "").split(/\s+/);
    expect(cls).toContain("zui-cvitem");
    expect(cls).not.toContain("cv-item");
  });

  test("forwards className and arbitrary attributes", () => {
    render(
      <CvItem className="extra" data-testid="item" title="tip">
        x
      </CvItem>,
    );
    const el = screen.getByTestId("item");
    expect(el).toHaveClass("zui-cvitem", "extra");
    expect(el).toHaveAttribute("title", "tip");
  });

  test("renders arbitrary children structure verbatim", () => {
    render(
      <CvItem>
        <div className="cv-item-head">
          <strong>Title</strong>
          <div className="cv-item-actions">
            <button type="button">Edit</button>
          </div>
        </div>
      </CvItem>,
    );
    expect(screen.getByText("Title")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Edit" })).toBeInTheDocument();
  });
});
