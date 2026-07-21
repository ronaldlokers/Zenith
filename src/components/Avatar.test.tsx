import { render, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";
import { Avatar } from "./Avatar";

describe("Avatar", () => {
  test("renders the initials", () => {
    render(<Avatar initials="RL" />);
    expect(screen.getByText("RL")).toBeInTheDocument();
  });

  test("renders an inline <span>, not an interactive element", () => {
    const { container } = render(<Avatar initials="RL" />);
    expect(container.firstElementChild?.tagName).toBe("SPAN");
  });

  test("emits the zui-avatar class", () => {
    const { container } = render(<Avatar initials="RL" />);
    expect(container.firstElementChild).toHaveClass("zui-avatar");
  });

  // Self-contained: only zui- classes, so the catalog matches production
  // without App.css (which Storybook never loads).
  test("emits only zui- classes, never the legacy avatar name", () => {
    const { container } = render(<Avatar initials="RL" />);
    const cls = (container.firstElementChild?.className ?? "").split(/\s+/);
    expect(cls).toContain("zui-avatar");
    expect(cls).not.toContain("avatar");
  });

  test("forwards className and arbitrary attributes", () => {
    render(
      <Avatar initials="RL" className="extra" data-testid="a" aria-hidden="true" />,
    );
    const el = screen.getByTestId("a");
    expect(el).toHaveClass("zui-avatar", "extra");
    expect(el).toHaveAttribute("aria-hidden", "true");
  });
});
