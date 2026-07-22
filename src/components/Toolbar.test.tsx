import { render, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";
import { Toolbar } from "./Toolbar";

describe("Toolbar", () => {
  test("renders its children", () => {
    render(
      <Toolbar>
        <button>Add</button>
      </Toolbar>,
    );
    expect(screen.getByRole("button", { name: "Add" })).toBeInTheDocument();
  });

  test("is a <div>", () => {
    const { container } = render(<Toolbar>x</Toolbar>);
    expect(container.firstElementChild?.tagName).toBe("DIV");
  });

  test("emits zui-toolbar, never the legacy toolbar name", () => {
    const { container } = render(<Toolbar>x</Toolbar>);
    const cls = (container.firstElementChild?.className ?? "").split(/\s+/);
    expect(cls).toContain("zui-toolbar");
    expect(cls).not.toContain("toolbar");
  });

  test("forwards className and arbitrary attributes", () => {
    render(
      <Toolbar className="extra" data-testid="tb">
        x
      </Toolbar>,
    );
    expect(screen.getByTestId("tb")).toHaveClass("zui-toolbar", "extra");
  });
});
