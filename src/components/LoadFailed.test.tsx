import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";
import { LoadFailed } from "./LoadFailed";
// Side-effect: initializes i18next so `t()` renders real copy instead of
// raw keys.
import "../i18n";

describe("LoadFailed", () => {
  // role="alert" is the point of the component: the failure has to reach a
  // screen reader without the user going looking for it.
  test("announces itself as an alert", () => {
    render(<LoadFailed />);
    expect(screen.getByRole("alert")).toBeInTheDocument();
  });

  test("renders the retry control and calls back when it is pressed", () => {
    const onRetry = vi.fn();
    render(<LoadFailed onRetry={onRetry} />);
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  test("omits the retry control when no handler is given", () => {
    render(<LoadFailed />);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  // Inside a <form> a bare <button> is an implicit submit; this one never is.
  test("the retry control is type=button", () => {
    render(<LoadFailed onRetry={() => {}} />);
    expect(screen.getByRole("button")).toHaveAttribute("type", "button");
  });

  // Self-contained: only zui- classes, so the catalog matches production
  // without App.css (which Storybook never loads).
  test("emits zui-loadfailed, never the legacy load-error name", () => {
    const { container } = render(<LoadFailed />);
    const cls = (container.firstElementChild?.className ?? "").split(/\s+/);
    expect(cls).toContain("zui-loadfailed");
    expect(cls).not.toContain("load-error");
  });

  test("forwards className and arbitrary attributes", () => {
    render(<LoadFailed className="extra" data-testid="lf" />);
    const el = screen.getByTestId("lf");
    expect(el).toHaveClass("zui-loadfailed", "extra");
  });
});
