import { render, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";
import { Button } from "./Button";

describe("Button", () => {
  test("renders its children", () => {
    render(<Button>Save</Button>);
    expect(screen.getByRole("button", { name: "Save" })).toBeInTheDocument();
  });

  test("defaults to type=button so it never submits a form by accident", () => {
    render(<Button>Save</Button>);
    expect(screen.getByRole("button")).toHaveAttribute("type", "button");
  });

  // The component must be self-contained: no App.css class names, because
  // Storybook never loads App.css and the catalog must match production.
  test("emits only zui- classes, never legacy App.css class names", () => {
    render(<Button variant="primary">Save</Button>);
    const cls = screen.getByRole("button").className.split(/\s+/);
    expect(cls).not.toContain("primary");
    expect(cls).not.toContain("danger");
    expect(cls).toContain("zui-btn--primary");
  });

  // Recipe B (App.css:4649, the "control normalization layer"). Distinct
  // from "danger", which composes the same recipe plus a colour override.
  test("secondary variant emits its class", () => {
    render(<Button variant="secondary">Cancel</Button>);
    expect(screen.getByRole("button")).toHaveClass("zui-btn--secondary");
  });

  // Danger composes Recipe B (App.css:4693) — it must not also carry the
  // secondary class, since variant is a single exclusive class, not a
  // combination of two.
  test("danger composes its own complete recipe, not the secondary class", () => {
    render(<Button variant="danger">Delete</Button>);
    const cls = screen.getByRole("button").className.split(/\s+/);
    expect(cls).toContain("zui-btn--danger");
    expect(cls).not.toContain("zui-btn--secondary");
  });

  test.each([
    ["default", "zui-btn--default"],
    ["primary", "zui-btn--primary"],
    ["secondary", "zui-btn--secondary"],
    ["ghost", "zui-btn--ghost"],
    ["dark", "zui-btn--dark"],
    ["danger", "zui-btn--danger"],
    ["link", "zui-btn--link"],
    ["close", "zui-btn--close"],
  ] as const)("variant=%s emits %s", (variant, expectedClass) => {
    render(<Button variant={variant}>Save</Button>);
    expect(screen.getByRole("button")).toHaveClass(expectedClass);
  });

  test("applies the zui size class", () => {
    render(<Button size="sm">Save</Button>);
    expect(screen.getByRole("button")).toHaveClass("zui-btn--sm");
  });

  test("renders a leading icon before the label", () => {
    render(<Button icon={<svg data-testid="icon" />}>Save</Button>);
    const button = screen.getByRole("button");
    expect(button.firstElementChild).toHaveAttribute("data-testid", "icon");
  });

  test("forwards arbitrary button attributes", () => {
    render(<Button aria-label="Close dialog" disabled />);
    const button = screen.getByRole("button", { name: "Close dialog" });
    expect(button).toBeDisabled();
  });
});
