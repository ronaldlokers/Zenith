import { render, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";
import { SideList } from "./SideList";

describe("SideList", () => {
  test("renders its children", () => {
    render(
      <SideList>
        <li>Acme Corp</li>
      </SideList>,
    );
    expect(screen.getByText("Acme Corp")).toBeInTheDocument();
  });

  test("renders a <ul>", () => {
    const { container } = render(
      <SideList>
        <li>content</li>
      </SideList>,
    );
    expect(container.firstElementChild?.tagName).toBe("UL");
  });

  test("renders the <li> rows verbatim, without adding wrapper elements", () => {
    const { container } = render(
      <SideList>
        <li className="stage-interview">content</li>
      </SideList>,
    );
    const li = container.querySelector("li");
    expect(li).toHaveClass("stage-interview");
    expect(li?.parentElement).toBe(container.firstElementChild);
  });

  // Self-contained: only zui- classes, so the catalog matches production
  // without App.css (which Storybook never loads).
  test("emits zui-sidelist, never the legacy side-list name", () => {
    const { container } = render(
      <SideList>
        <li>content</li>
      </SideList>,
    );
    const cls = (container.firstElementChild?.className ?? "").split(/\s+/);
    expect(cls).toContain("zui-sidelist");
    expect(cls).not.toContain("side-list");
  });

  test("forwards className and arbitrary attributes", () => {
    render(
      <SideList className="dash-recent" data-testid="l" title="tip">
        <li>content</li>
      </SideList>,
    );
    const el = screen.getByTestId("l");
    expect(el).toHaveClass("zui-sidelist", "dash-recent");
    expect(el).toHaveAttribute("title", "tip");
  });
});
